/* =====================================================
   GymLog — واسط ارسال پشتیبان به بله (Cloudflare Worker)

   فقط مسیر POST /api/bale به این کد می‌رسد (run_worker_first در wrangler.jsonc).
   بقیه‌ی مسیرها مستقیم از فایل‌های استاتیک سرو می‌شوند.

   ورودی (multipart/form-data):
     token    توکن ربات بله
     chat_id  شناسه‌ی چت مقصد
     file     (اختیاری) فایل پشتیبان  → sendDocument
     caption  (اختیاری) توضیح فایل
     text     (وقتی file نیست) متن پیام → sendMessage

   توکن فقط از همین درخواست عبور می‌کند؛ ذخیره یا لاگ نمی‌شود.
===================================================== */

const BALE_API = "https://tapi.bale.ai";
const MAX_BYTES = 20 * 1024 * 1024;
const TOKEN_RE = /^\d{3,}:[A-Za-z0-9_-]{10,}$/;

const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
};

function json(obj, status) {
    return new Response(JSON.stringify(obj), { status: status || 200, headers: JSON_HEADERS });
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

        try {
            const res = await fetch(`${BALE_API}/bot${token}/${method}`, init);
            const body = await res.text();
            return new Response(body, { status: res.status, headers: JSON_HEADERS });
        } catch (e) {
            return json({ ok: false, error: "upstream_unreachable" }, 502);
        }
    }
};
