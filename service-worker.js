/*
   نکته: برای هر نسخه‌ی جدید، فقط عدد CACHE_NAME را بالا ببر
   (مثلاً v17). تغییر همین فایل باعث می‌شود مرورگر نسخه‌ی جدید را
   پیدا کند و دکمه‌ی «به‌روزرسانی» در تنظیمات فعال شود.
*/
const CACHE_NAME = "gym-tracker-v23";

// کش فایل‌های آموزشی برنامه‌ها (تصویر/ویدیو). این کش با تغییر نسخه پاک نمی‌شود.
const MEDIA_CACHE = "gym-media-v1";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./report.html",
    "./manifest.json",

    "./css/style.css",
    "./css/report.css",
    "./css/dashboard.css",
    "./css/dashboard-overview.css",
    "./css/program-builder.css",
    "./css/exercise-editor.css",

    "./js/app.js",
    "./js/dashboard.js",
    "./js/dashboard-analytics.js",
    "./js/dashboard-overview.js",
    "./js/program-builder.js",
    "./js/exercise-editor.js",
    "./js/report.js",
    "./js/storage.js",
    "./js/exercise-catalog.js",
    "./js/workout-programs.js",
    "./js/default-program.js",
    "./js/workout-data.js",

    // Exercise media
    "./assets/exercises/machine-chest-press.svg",
    "./assets/exercises/incline-dumbbell-press.svg",
    "./assets/exercises/dead-bug.jpg",

    // App icons
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
                        .filter(name => name !== CACHE_NAME && name !== MEDIA_CACHE)
                        .map(name => caches.delete(name))
                )
            )
            .then(() => self.clients.claim())
    );
});


/* پخش ویدیو از کش نیاز به پاسخ Range دارد (مخصوصاً در iOS/Safari) */
async function rangeResponse(response, request) {
    const buffer = await response.arrayBuffer();
    const match = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") || "");
    const total = buffer.byteLength;
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

    return new Response(buffer.slice(start, end + 1), {
        status: 206,
        statusText: "Partial Content",
        headers: {
            "Content-Type": response.headers.get("Content-Type") || "video/mp4",
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(end - start + 1)
        }
    });
}


async function handleFetch(request) {
    const url = new URL(request.url);

    // برای فایل‌های جاوااسکریپت و صفحات، ابتدا از شبکه می‌خواند تا تغییرات کدهای ذخیره‌سازی فوراً اعمال شوند
    if (url.origin === self.location.origin && (url.pathname.endsWith(".js") || url.pathname.endsWith(".html") || url.pathname === "/")) {
        try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        } catch (networkError) {
            const cached = await caches.match(request);
            if (cached) return cached;
            throw networkError;
        }
    }

    const cached = await caches.match(request);

    if (cached) {
        if (request.headers.has("range")) {
            return rangeResponse(cached, request);
        }
        return cached;
    }

    const response = await fetch(request);

    // هر فایل آموزشی که یک بار با اینترنت بارگیری شد، آفلاین هم در دسترس می‌ماند
    try {
        if (
            response.status === 200 &&
            url.origin === self.location.origin &&
            url.pathname.includes("/assets/") &&
            !request.headers.has("range")
        ) {
            const cache = await caches.open(MEDIA_CACHE);
            cache.put(request, response.clone());
        }
    } catch (e) { /* نادیده گرفتن */ }

    return response;
}


self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;
    event.respondWith(handleFetch(event.request));
});
