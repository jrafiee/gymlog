/* =====================================================
   GymLog — ابزارهای مشترک

   این فایل باید اولین اسکریپت بارگذاری‌شده باشد.
   توابع و ثابت‌هایی که قبلاً در چند فایل تکرار شده بودند
   (escape کردن HTML، تبدیل ارقام، دانلود فایل، دسته‌بندی
   عضلات، تشخیص ویدیو) فقط همین‌جا تعریف می‌شوند.

   نکته: ثابت‌های دسته‌بندی عمداً داخل exercise-catalog.js نیستند،
   چون آن فایل از «بانک حرکات» به‌صورت خودکار دوباره ساخته می‌شود.
===================================================== */

/* ---------- HTML ---------- */
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

/* ---------- ارقام ---------- */

/* ارقام فارسی و عربی → لاتین (برای خواندن ورودی کاربر) */
function toLatinDigits(v) {
    return String(v == null ? "" : v)
        .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
        .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
}

/* ارقام لاتین → فارسی (برای نمایش) */
function toFa(v) {
    return String(v).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

/* ---------- پیام کوتاه (showToast در app.js تعریف شده است) ---------- */
function toast(msg, type) {
    if (typeof showToast === "function") showToast(msg, type || "success");
    else alert(msg);
}

/* ---------- دانلود فایل ---------- */
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ---------- رسانه ---------- */
function isVideoSrc(path) {
    const p = String(path || "");
    if (p.startsWith("data:")) return p.startsWith("data:video");
    return /\.(mp4|webm|mov)$/i.test(p.split("?")[0]);
}

function videoMime(path) {
    const m = /\.(webm|mov)$/i.exec(String(path || "").split("?")[0]);
    if (!m) return "video/mp4";
    return m[1].toLowerCase() === "webm" ? "video/webm" : "video/quicktime";
}

/* ---------- دسته‌بندی گروه‌های عضلانی (منبع واحد) ---------- */
const MUSCLE_GROUP_ORDER = ["سینه", "پشت", "سرشانه", "جلو بازو", "پشت بازو", "پا", "شکم"];

const EXERCISE_CATEGORIES_MAP = {
    machine_chest_press: "سینه",
    incline_dumbbell_press: "سینه",
    dumbbell_fly: "سینه",
    elevated_pushup: "سینه",
    incline_pushup: "سینه",
    cable_crossover: "سینه",
    close_grip_dumbbell_press: "سینه",

    wide_lat_pulldown: "پشت",
    medium_grip_lat_pulldown: "پشت",
    seated_cable_row: "پشت",
    chest_supported_row: "پشت",
    t_bar_row: "پشت",
    straight_arm_pullover: "پشت",

    dumbbell_shoulder_press: "سرشانه",
    dumbbell_lateral_raise: "سرشانه",
    rear_delt_fly: "سرشانه",
    face_pull: "سرشانه",

    hammer_curl: "جلو بازو",
    cable_curl: "جلو بازو",

    rope_triceps_pushdown: "پشت بازو",
    overhead_cable_triceps: "پشت بازو",
    lying_dumbbell_triceps_extension: "پشت بازو",

    leg_press: "پا",
    smith_squat: "پا",
    lying_leg_curl: "پا",
    leg_extension: "پا",
    bulgarian_split_squat: "پا",
    smith_calf_raise: "پا",

    dead_bug: "شکم",
    crunch: "شکم",
    cable_crunch: "شکم",
    side_plank: "شکم",
    plank: "شکم",
    pallof_press: "شکم"
};
