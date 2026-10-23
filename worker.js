/* =====================================================
   GymLog — واسط همگام‌سازی با بله (Cloudflare Worker)

   فقط مسیر POST /api/bale به این کد می‌رسد (run_worker_first در wrangler.jsonc).
   بقیه‌ی مسیرها مستقیم از فایل‌های استاتیک سرو می‌شوند.

   ورودی (multipart/form-data) — فیلد op مشخص می‌کند چه کاری انجام شود:

   op=upload (پیش‌فرض)
     token, chat_id
     file     (اختیاری) فایل پشتیبان → sendDocument و سپس سنجاق‌کردن پیام
     caption  (اختیاری) توضیح فایل؛ شامل خط  #stamp:<زمان آخرین تغییر اطلاعات>
     text     (وقتی file نیست) متن پیام → sendMessage

   op=latest
     token, chat_id
     مشخصات آخرین پشتیبان ارسال‌شده را برمی‌گرداند:
     {ok, remote: {fileId, fileName, size, messageId, stamp} | null, debug}
     ربات بله نمی‌تواند تاریخچه‌ی چت را بخواند؛ پس هر بار که فایلی ارسال می‌شود،
     file_id و stamp آن در KV (باینگ SYNC_KV) نگه‌داری می‌شود. اگر KV نبود،
     پیام سنجاق‌شده با getChat امتحان می‌شود.

   op=download
     token, chat_id, file_id
     فایل را با getFile از بله می‌گیرد و همان JSON پشتیبان را برمی‌گرداند.

   توکن فقط از همین درخواست عبور می‌کند؛ ذخیره یا لاگ نمی‌شود.
===================================================== */

const BALE_API = "https://tapi.bale.ai";
const MAX_BYTES = 20 * 1024 * 1024;
const TOKEN_RE = /^\d{3,}:[A-Za-z0-9_-]{10,}$/;
const STAMP_RE = /#stamp:(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/;

const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
};

/* کلید KV: هش SHA-256 از توکن و chat_id؛ خودِ توکن هیچ‌جا ذخیره نمی‌شود */
async function kvKey(token, chatId) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token + ":" + chatId));
    return "latest:" + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status) {
    return new Response(JSON.stringify(obj), { status: status || 200, headers: JSON_HEADERS });
}

/* فراخوانی متد JSON بله؛ خروجی: {res, data} یا null وقتی بله در دسترس نیست */
async function baleJson(token, method, payload) {
    try {
        const res = await fetch(`${BALE_API}/bot${token}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        let data = null;
        try { data = await res.json(); } catch (e) { /* ignore */ }
        return { res, data };
    } catch (e) {
        return null;
    }
}

function baleFail(r) {
    if (!r) return json({ ok: false, error: "upstream_unreachable" }, 502);
    const status = r.res.status >= 400 ? r.res.status : 400;
    return json({ ok: false, error: "bale_error", description: (r.data && r.data.description) || ("HTTP " + r.res.status) }, status);
}

async function opUpload(form, token, chatId, env) {
    const file = form.get("file");
    let method;
    let init;

    if (file && typeof file === "object" && "size" in file) {
        if (file.size > MAX_BYTES) {
            return json({ ok: false, error: "file_too_large" }, 413);
        }
        const out = new FormData();
        out.set("chat_id", chatId);
        out.set("document", file, file.name || "gymlog-backup.json");
        const caption = String(form.get("caption") || "").slice(0, 1000);
        if (caption) out.set("caption", caption);
        method = "sendDocument";
        init = { method: "POST", body: out };
    } else {
        const text = String(form.get("text") || "").slice(0, 1000) || "GymLog";
        method = "sendMessage";
        init = {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text })
        };
    }

    let res;
    let body;
    try {
        res = await fetch(`${BALE_API}/bot${token}/${method}`, init);
        body = await res.text();
    } catch (e) {
        return json({ ok: false, error: "upstream_unreachable" }, 502);
    }

    /* پشتیبان ارسال‌شده سنجاق می‌شود تا همگام‌سازی بعدی بتواند «آخرین فایل» را پیدا کند
       (ربات نمی‌تواند تاریخچه‌ی چت را بخواند، ولی پیام سنجاق‌شده را با getChat می‌بیند) */
    if (method === "sendDocument" && res.ok) {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { /* ignore */ }
        const result = parsed && parsed.ok && parsed.result;
        const messageId = result && result.message_id;
        if (messageId) {
            /* ۱) ثبت مشخصات فایل در KV (روش اصلی) */
            const stampM = STAMP_RE.exec(String(form.get("caption") || ""));
            parsed.kv = false;
            if (env.SYNC_KV && result.document && result.document.file_id && stampM) {
                try {
                    await env.SYNC_KV.put(await kvKey(token, chatId), JSON.stringify({
                        messageId,
                        fileId: result.document.file_id,
                        fileName: result.document.file_name || "",
                        size: result.document.file_size || 0,
                        stamp: stampM[1],
                        uploadedAt: new Date().toISOString()
                    }));
                    parsed.kv = true;
                } catch (e) { /* ignore */ }
            }
            /* ۲) سنجاق‌کردن پیام (روش کمکی؛ ممکن است بله در چت خصوصی پشتیبانی نکند) */
            const pin = await baleJson(token, "pinChatMessage", { chat_id: chatId, message_id: messageId });
            parsed.pinned = !!(pin && pin.res.ok && pin.data && pin.data.ok);
            return json(parsed, 200);
        }
    }
    return new Response(body, { status: res.status, headers: JSON_HEADERS });
}

async function opLatest(token, chatId, env) {
    const debug = { kv: !!env.SYNC_KV, kvHit: false, chatKeys: [], pinned: false, pinnedDocument: false, pinnedStamp: false };

    /* ۱) KV */
    if (env.SYNC_KV) {
        try {
            const rec = await env.SYNC_KV.get(await kvKey(token, chatId), "json");
            if (rec && rec.fileId && rec.stamp) {
                debug.kvHit = true;
                return json({ ok: true, remote: rec, debug });
            }
        } catch (e) { /* ignore */ }
    }

    /* ۲) پیام سنجاق‌شده */
    const r = await baleJson(token, "getChat", { chat_id: chatId });
    if (!r || !r.res.ok || !r.data || !r.data.ok) return baleFail(r);

    const chat = r.data.result || {};
    debug.chatKeys = Object.keys(chat);
    const pin = chat.pinned_message;
    debug.pinned = !!pin;
    const doc = pin && pin.document;
    debug.pinnedDocument = !!(doc && doc.file_id);
    if (!doc || !doc.file_id) return json({ ok: true, remote: null, debug });

    const m = STAMP_RE.exec(String(pin.caption || ""));
    debug.pinnedStamp = !!m;
    if (!m) return json({ ok: true, remote: null, debug });
    return json({
        ok: true,
        remote: {
            messageId: pin.message_id,
            fileId: doc.file_id,
            fileName: doc.file_name || "",
            size: doc.file_size || 0,
            date: pin.date || 0,
            stamp: m[1]
        },
        debug
    });
}

async function opDownload(form, token) {
    const fileId = String(form.get("file_id") || "").trim();
    if (!fileId) return json({ ok: false, error: "bad_request" }, 400);

    const info = await baleJson(token, "getFile", { file_id: fileId });
    if (!info || !info.res.ok || !info.data || !info.data.ok) return baleFail(info);

    const path = info.data.result && info.data.result.file_path;
    if (!path) return json({ ok: false, error: "bale_error", description: "file_path missing" }, 502);

    let res;
    try {
        res = await fetch(`${BALE_API}/file/bot${token}/${path}`);
    } catch (e) {
        return json({ ok: false, error: "upstream_unreachable" }, 502);
    }
    if (!res.ok) return json({ ok: false, error: "bale_error", description: "download HTTP " + res.status }, 502);

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return json({ ok: false, error: "file_too_large" }, 413);
    return new Response(buf, { status: 200, headers: JSON_HEADERS });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname !== "/api/bale") {
            return env.ASSETS.fetch(request);
        }

        if (request.method !== "POST") {
            return json({ ok: false, error: "method_not_allowed" }, 405);
        }

        /* فقط از خود برنامه؛ تا کس دیگری از این Worker به‌عنوان پروکسی استفاده نکند */
        if (request.headers.get("Origin") !== url.origin) {
            return json({ ok: false, error: "forbidden_origin" }, 403);
        }

        const declared = Number(request.headers.get("Content-Length") || 0);
        if (declared > MAX_BYTES + 64 * 1024) {
            return json({ ok: false, error: "file_too_large" }, 413);
        }

        let form;
        try {
            form = await request.formData();
        } catch (e) {
            return json({ ok: false, error: "bad_request" }, 400);
        }

        const token = String(form.get("token") || "").trim();
        const chatId = String(form.get("chat_id") || "").trim();
        if (!TOKEN_RE.test(token) || !chatId) {
            return json({ ok: false, error: "bad_credentials" }, 400);
        }

        const op = String(form.get("op") || "upload");
        if (op === "latest") return opLatest(token, chatId, env);
        if (op === "download") return opDownload(form, token);
        if (op === "upload") return opUpload(form, token, chatId, env);
        return json({ ok: false, error: "bad_request" }, 400);
    }
};
