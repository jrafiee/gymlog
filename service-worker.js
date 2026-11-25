/*
   نکته‌ی نگه‌داری:
   • برای هر نسخه‌ی جدید برنامه (JS / CSS / HTML) فقط عدد CACHE_NAME را بالا ببر.
   • فایل‌های آموزشی (assets/exercises) نیازی به بالا بردن نسخه ندارند:
     با هر بار باز شدن برنامه (و هر ۱۰ دقیقه که برنامه دوباره دیده شود)، فایل‌هایی که روی سرور
     با همان نام عوض شده‌اند خودکار جایگزین می‌شوند. منطق آن در js/app.js است (syncAllMedia).
   • MEDIA_CACHE را فقط وقتی بالا ببر که بخواهی همه‌ی فایل‌های آموزشی از اول دانلود شوند.
*/
const CACHE_NAME = "gym-tracker-v55";

// کش فایل‌های آموزشی (تصویر/ویدیو). با تغییر CACHE_NAME پاک نمی‌شود.
// ⚠ باید با MEDIA_CACHE_NAME در js/app.js یکی باشد.
const MEDIA_CACHE = "gym-media-v2";

// فونت‌ها (Vazirmatn از Google Fonts) برای استفاده‌ی آفلاین
const FONT_CACHE = "gym-fonts-v1";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// درخواست‌هایی که خود برنامه برای بررسی تغییر فایل‌ها می‌فرستد؛ باید مستقیم به شبکه بروند
// (وگرنه service worker همان نسخه‌ی قدیمی کش را جواب می‌دهد). ⚠ با MEDIA_SYNC_HEADER در app.js یکی باشد.
const SYNC_HEADER = "x-gymlog-sync";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./manifest.json",
    "./css/app.css",

    "./js/utils.js",
    "./js/exercise-catalog.js",
    "./js/default-program.js",
    "./js/storage.js",
    "./js/app.js",
    "./js/dashboard.js",
    "./js/dashboard-overview.js",
    "./js/program-builder.js",
    "./js/exercise-editor.js",
    "./js/gl-ui.js",

    // App icons
    // (فایل‌های assets/exercises عمداً اینجا نیستند؛ در MEDIA_CACHE نگه‌داری و به‌روز می‌شوند)
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png"
];


/* نصب: نسخه‌ی جدید دانلود شده و بلافاصله فعال می‌شود */
self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.all(
                FILES_TO_CACHE.map(file =>
                    cache.add(file).catch(err =>
                        console.warn("Cache failed for", file, err)
                    )
                )
            )
        )
    );
});


self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});


self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(names =>
                Promise.all(
                    names
                        .filter(name => name !== CACHE_NAME && name !== MEDIA_CACHE && name !== FONT_CACHE)
                        .map(name => caches.delete(name))
                )
            )
            .then(() => self.clients.claim())
    );
});


/* =====================================================
   پاسخ Range از کش
   (پخش ویدیو بدون آن کار نمی‌کند، مخصوصاً در iOS/Safari)
   از blob.slice استفاده می‌شود تا کل فایل دوباره در حافظه کپی نشود.
===================================================== */
async function rangeResponse(response, request) {
    const blob = await response.blob();
    const total = blob.size;
    const match = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") || "");
    let start = 0;
    let end = total - 1;

    if (match) {
        if (match[1] !== "") {
            start = parseInt(match[1], 10);
            if (match[2] !== "") end = parseInt(match[2], 10);
        } else if (match[2] !== "") {
            start = Math.max(0, total - parseInt(match[2], 10));
        }
    }
    end = Math.min(end, total - 1);

    if (total === 0 || start > end) {
        return new Response(null, {
            status: 416,
            statusText: "Range Not Satisfiable",
            headers: { "Content-Range": `bytes */${total}` }
        });
    }

    return new Response(blob.slice(start, end + 1), {
        status: 206,
        statusText: "Partial Content",
        headers: {
            "Content-Type": response.headers.get("Content-Type") || blob.type || "video/mp4",
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(end - start + 1),
            "Accept-Ranges": "bytes"
        }
    });
}


/* =====================================================
   فایل‌های برنامه (JS / HTML / CSS / JSON): اول شبکه، با تایم‌اوت
   اگر کش داریم و شبکه دیر جواب داد (مثلاً فیلتر بودن کلادفلر)، همان کش را بده
===================================================== */
const NETWORK_TIMEOUT_MS = 3000;

async function networkFirstWithTimeout(event) {
    const request = event.request;
    const appCache = await caches.open(CACHE_NAME);
    const cached = await appCache.match(request, { ignoreSearch: true, ignoreVary: true });

    const netPromise = fetch(request).then(res => {
        if (res && res.status === 200) {
            const copy = res.clone();              // قبل از هر await
            appCache.put(request, copy).catch(() => {});
        }
        return res;
    });

    if (!cached) return netPromise;                // اولین بار: چاره‌ای جز صبر نیست

    event.waitUntil(netPromise.catch(() => {}));   // دانلود در پس‌زمینه تمام شود

    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS); });
    const res = await Promise.race([netPromise.catch(() => null), timeout]);
    clearTimeout(timer);
    return res || cached;
}


/* =====================================================
   فایل‌های آموزشی (assets/exercises): اول کش (برای سرعت و آفلاین)

   - از MEDIA_CACHE با «فقط آدرس» پیدا می‌شود (ignoreVary)؛ هدرهای درخواست
     ویدیو/تصویر با هدرهای دانلود اولیه فرق دارند و بدون ignoreVary گاهی پیدا نمی‌شد.
   - ویدیوها همیشه با Range درخواست می‌شوند. اگر فایل هنوز در کش نبود، همان لحظه پاسخ
     شبکه داده می‌شود و کل فایل جداگانه در پس‌زمینه دانلود و ذخیره می‌شود؛
     پس هر ویدیویی که یک بار دیده شود، آفلاین هم کار می‌کند.
   - به‌روزرسانی فایل‌هایی که با همان نام عوض شده‌اند در js/app.js (syncAllMedia) انجام می‌شود.
===================================================== */
const MEDIA_PATH_RE = /\/assets\/(?!icons\/)/;

function isMediaPath(url) {
    return MEDIA_PATH_RE.test(url.pathname);
}

function isHtmlResponse(res) {
    return /text\/html/i.test(res.headers.get("content-type") || "");
}

const inflightMedia = new Map();

function storeFullMedia(key) {
    if (inflightMedia.has(key)) return inflightMedia.get(key);
    const job = (async () => {
        try {
            const res = await fetch(key, { cache: "no-cache" });
            if (res.status === 200 && !isHtmlResponse(res)) {
                const cache = await caches.open(MEDIA_CACHE);
                await cache.put(key, res);
            }
        } catch (e) { /* آفلاین یا خطای شبکه: دفعه‌ی بعد دوباره تلاش می‌شود */ }
        finally { inflightMedia.delete(key); }
    })();
    inflightMedia.set(key, job);
    return job;
}

async function mediaCacheFirst(event) {
    const request = event.request;
    const key = new URL(request.url).href;
    const ranged = request.headers.has("range");

    try {
        const cache = await caches.open(MEDIA_CACHE);
        let cached = await cache.match(key, { ignoreVary: true });

        // ورودی خراب (مثلاً پاسخ ناقص): حذف و مثل «نبودن» رفتار می‌شود
        if (cached && cached.status !== 200) {
            await cache.delete(key);
            cached = null;
        }

        if (cached) return ranged ? rangeResponse(cached, request) : cached;

        if (ranged) {
            event.waitUntil(storeFullMedia(key));
            return await fetch(request);
        }

        const res = await fetch(request);
        if (res.status === 200 && !isHtmlResponse(res)) {
            event.waitUntil(cache.put(key, res.clone()).catch(() => {}));
        }
        return res;
    } catch (e) {
        // آفلاین و فایل در کش نیست
        return new Response("", { status: 504, statusText: "Offline" });
    }
}


const APP_SHELL_RE = /\.(js|html|css|json)$/i;

function isAppShell(url) {
    return url.pathname.endsWith("/") || APP_SHELL_RE.test(url.pathname);
}


async function handleFetch(event) {
    const request = event.request;
    const url = new URL(request.url);

    // بررسی تغییر فایل‌ها از طرف خود برنامه: مستقیم از شبکه
    if (request.headers.has(SYNC_HEADER)) return fetch(request);

    if (FONT_HOSTS.includes(url.hostname)) return fontCacheFirst(request);

    if (url.origin === self.location.origin) {
        if (isMediaPath(url)) return mediaCacheFirst(event);
        if (isAppShell(url)) return networkFirstWithTimeout(event);
    }

    // سایر فایل‌ها (آیکون‌ها و ...): اول کش
    const cached = await caches.match(request, { ignoreVary: true });
    return cached || fetch(request);
}


self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;
    event.respondWith(handleFetch(event));
});


async function fontCacheFirst(request) {
    const cache = await caches.open(FONT_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const res = await fetch(request);
    if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
    return res;
}
