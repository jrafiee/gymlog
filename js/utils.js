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
    return String(v == null ? "" : v).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

/* ---------- آیکون‌های SVG خطی (۲۴×۲۴) ----------
   glIcon(name, size)  → آیکون بلوکی (برای دکمه‌های flex و منوها)
   ico(name, size)     → آیکون هم‌خط با متن (کنار برچسب دکمه‌ها)
   همه aria-hidden هستند، چون فقط تزئینی‌اند. */
const GL_ICON_PATHS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    workout: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    programs: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>',
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bank: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
    backup: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M21 20H3"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    offline: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
    note: '<path d="M5 4h14v16H5zM9 9h6M9 13h6"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/>',
    send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M4 20h16"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    grip: '<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    half: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    play: '<path d="M8 5l11 7-11 7z"/>'
};

function glIcon(name, size, cls) {
    return `<svg class="gl-ic${cls ? " " + cls : ""}" width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GL_ICON_PATHS[name] || ""}</svg>`;
}

function ico(name, size) {
    return glIcon(name, size || 18, "gl-in");
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
    machine_shoulder_press: "سرشانه",

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
	dumbbell_romanian_deadlift: "پا",

    dead_bug: "شکم",
    crunch: "شکم",
    cable_crunch: "شکم",
    side_plank: "شکم",
    plank: "شکم",
    pallof_press: "شکم"
};


/* ---------- مودال‌ها و دکمه‌ی Back ----------
   openModalHistory(key, cleanup) یک state در history می‌گذارد و تابع close() برمی‌گرداند.
   - Back (گوشی/مرورگر) مودال بالایی را می‌بندد: cleanup اجرا می‌شود.
   - close() (دکمه‌ی ×، Escape، کلیک روی پس‌زمینه) اگر state همین مودال بالای history باشد
     history.back() می‌زند، وگرنه مستقیم cleanup را اجرا می‌کند.
   - اگر مودالی با همان key از قبل باز باشد، بدون push دوباره جایگزین می‌شود. */
const _modalStack = [];

function openModalHistory(key, cleanup) {
    const idx = _modalStack.findIndex(m => m.key === key);
    const reuse = idx !== -1;
    if (reuse) _modalStack[idx].run();
    else history.pushState({ modal: key }, "");

    const entry = {
        key,
        done: false,
        run() {
            if (entry.done) return;
            entry.done = true;
            const i = _modalStack.indexOf(entry);
            if (i !== -1) _modalStack.splice(i, 1);
            cleanup();
        }
    };
    _modalStack.push(entry);

    return function close() {
        if (entry.done) return;
        if (history.state && history.state.modal === key) history.back();
        else entry.run();
    };
}

window.addEventListener("popstate", () => {
    const top = _modalStack[_modalStack.length - 1];
    if (top && (!history.state || history.state.modal !== top.key)) top.run();
});

/* ---------- زمان استراحت ----------
   "90 ثانیه" → 90 ، "2–3 دقیقه" → 120 (کران پایین بازه) ، نامشخص → null */
function parseRestSeconds(str) {
    const t = toLatinDigits(str).replace(/[–—]/g, "-");
    const m = t.match(/(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?)?\s*(دقیقه|ثانیه|min|sec)/i);
    if (!m) return null;
    const mult = /دقیقه|min/i.test(m[2]) ? 60 : 1;
    const sec = Math.round(parseFloat(m[1]) * mult);
    return sec > 0 ? sec : null;
}


/* ---------- روشن ماندن صفحه (Screen Wake Lock) ----------
   GymLogWakeLock.request(reason) / release(reason)
   تا وقتی حداقل یک «دلیل» فعال باشد صفحه قفل نمی‌شود.
   - "workout": خودکار، وقتی صفحه‌ی «ثبت تمرین» در موبایل باز است
   - "timer"  : وقتی تایمر استراحت در حال اجراست (تایمر داخل app.js)
   اگر مرورگر پشتیبانی نکند (مثلاً iOS قدیمی‌تر از ۱۶.۴) بی‌صدا نادیده گرفته می‌شود. */
const GymLogWakeLock = (function () {
    const reasons = new Set();
    const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
    let sentinel = null;
    let pending = false;

    async function sync() {
        if (!supported) return;

        if (reasons.size === 0) {
            if (sentinel) {
                const s = sentinel;
                sentinel = null;
                try { await s.release(); } catch (e) { /* ignore */ }
            }
            return;
        }

        if (sentinel || pending || document.visibilityState !== "visible") return;

        pending = true;
        try {
            const s = await navigator.wakeLock.request("screen");
            sentinel = s;
            s.addEventListener("release", () => { if (sentinel === s) sentinel = null; });
        } catch (e) { /* مثلاً حالت کم‌باتری یا نبودن اجازه */ }
        pending = false;

        if (reasons.size === 0 && sentinel) sync();
    }

    /* با برگشتن به برنامه (بعد از قفل یا رفتن به برنامه‌ی دیگر) دوباره فعال می‌شود */
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") sync();
    });

    return {
        supported,
        request(reason) { reasons.add(reason || "default"); sync(); },
        release(reason) { reasons.delete(reason || "default"); sync(); }
    };
})();

/* در موبایل، تا وقتی صفحه‌ی «ثبت تمرین» باز است صفحه روشن بماند */
(function () {
    const mq = window.matchMedia ? window.matchMedia("(max-width: 1023px)") : null;

    function update() {
        const view = document.getElementById("viewWorkout");
        const on = !!(view && view.classList.contains("active") && mq && mq.matches);
        if (on) GymLogWakeLock.request("workout");
        else GymLogWakeLock.release("workout");
    }

    function init() {
        const view = document.getElementById("viewWorkout");
        if (view) new MutationObserver(update).observe(view, { attributes: true, attributeFilter: ["class"] });
        if (mq) {
            if (mq.addEventListener) mq.addEventListener("change", update);
            else if (mq.addListener) mq.addListener(update);
        }
        update();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();


/* =====================================================
   ست‌ها: شمارش، وضعیت جلسه و اعتبارسنجی ورودی
   (منبع واحد برای تاریخچه، داشبورد، تقویم و فرم ثبت)
===================================================== */

/* حدود ورودی و آستانه‌ی «عدد مشکوک» (قابل‌تنظیم) */
const SET_INPUT_LIMITS = {
    weightMax: 1000,               // kg؛ بیشتر از این پذیرفته نمی‌شود
    repsMax: 999,                  // تکرار (یا ثانیه)؛ عدد صحیح
    suspiciousWeight: 500,         // kg؛ از این به بعد هشدار «مطمئنی؟»
    suspiciousReps: 100,           // تکرار در حرکات وزنه‌دار
    suspiciousRepsBodyweight: 600  // تکرار/ثانیه در حرکات وزن‌بدنی و زمانی
};

/* ست «پر» = وزنه یا تکرار نوشته شده باشد (فضای خالی حساب نمی‌شود) */
function isSetFilled(s) {
    if (!s) return false;
    const has = v => v !== undefined && v !== null && String(v).trim() !== "";
    return has(s.weight) || has(s.reps);
}
function getFilledSets(ex) {
    return ((ex && ex.sets) || []).filter(isSetFilled);
}
function countFilledSets(ex) {
    return getFilledSets(ex).length;
}
function countWorkoutSets(w) {
    return ((w && w.exercises) || []).reduce((n, ex) => n + countFilledSets(ex), 0);
}
function countWorkoutExercises(w) {
    return ((w && w.exercises) || []).filter(ex => countFilledSets(ex) > 0).length;
}

/* وضعیت جلسه: "in_progress" | "done". رکوردهای قدیمی بدون فیلد status «انجام‌شده» تفسیر می‌شوند. */
function getWorkoutStatus(w) {
    return w && w.status === "in_progress" ? "in_progress" : "done";
}
function isWorkoutDone(w) {
    return getWorkoutStatus(w) === "done";
}

/* kind: "weight" | "reps". خروجی: {ok, value (عدد یا null برای خالی), error} */
function validateSetNumber(kind, raw, badInput) {
    const L = SET_INPUT_LIMITS;
    const t = toLatinDigits(raw).replace(/[٫,]/g, ".").trim();
    const generic = "عدد معتبر وارد کن.";
    if (t === "") return badInput ? { ok: false, value: null, error: generic } : { ok: true, value: null };

    const n = Number(t);
    if (!isFinite(n)) return { ok: false, value: null, error: generic };

    if (kind === "weight") {
        if (n < 0) return { ok: false, value: null, error: "وزنه نمی‌تواند منفی باشد." };
        if (n > L.weightMax) return { ok: false, value: null, error: `وزنه باید بین ۰ تا ${toFa(L.weightMax)} کیلوگرم باشد.` };
    } else {
        if (n < 0 || n > L.repsMax || !Number.isInteger(n)) {
            return { ok: false, value: null, error: `تکرار باید عدد صحیح بین ۰ تا ${toFa(L.repsMax)} باشد.` };
        }
    }
    return { ok: true, value: n };
}


/* =====================================================
   مودال مشترک (دسترس‌پذیری)
   glDialogAttach(overlay, opts): پنجره‌ی موجود را دیالوگ می‌کند (role، aria-modal، برچسب،
     Escape، به‌دام‌انداختن فوکوس، inert کردن پس‌زمینه، بازگرداندن فوکوس) و تابع release برمی‌گرداند.
     با حذف overlay از DOM، release خودکار اجرا می‌شود.
     opts: dialog, label | labelledby, describedby, onClose, initialFocus, modal(=true), alert, opener
   glDialog / glAlert / glConfirm: جایگزین Promise-محور alert و confirm
===================================================== */
let _glDlgN = 0;
const _glDlgStack = [];
const GL_FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

function glDialogAttach(overlay, opts) {
    opts = opts || {};
    const dlg = opts.dialog || overlay.firstElementChild || overlay;
    const opener = opts.opener || document.activeElement;
    const modal = opts.modal !== false;

    dlg.setAttribute("role", opts.alert ? "alertdialog" : "dialog");
    if (modal) dlg.setAttribute("aria-modal", "true"); else dlg.removeAttribute("aria-modal");
    if (opts.labelledby) {
        dlg.setAttribute("aria-labelledby", opts.labelledby);
        dlg.removeAttribute("aria-label");
    } else if (opts.label) {
        dlg.setAttribute("aria-label", opts.label);
    }
    if (opts.describedby) dlg.setAttribute("aria-describedby", opts.describedby);
    if (!dlg.hasAttribute("tabindex")) dlg.setAttribute("tabindex", "-1");

    const entry = {};
    const inerted = [];
    let released = false;

    const focusables = () => Array.from(dlg.querySelectorAll(GL_FOCUSABLE))
        .filter(el => !el.closest("[inert]") && !el.closest("[hidden]") && el.getClientRects().length > 0);

    function onKey(e) {
        if (_glDlgStack[_glDlgStack.length - 1] !== entry) return;
        if (e.key === "Escape") {
            if (opts.onClose) {
                e.preventDefault();
                e.stopPropagation();
                opts.onClose();
            }
            return;
        }
        if (e.key !== "Tab" || !modal) return;
        const f = focusables();
        if (!f.length) { e.preventDefault(); dlg.focus(); return; }
        const first = f[0], last = f[f.length - 1], cur = document.activeElement;
        if (!dlg.contains(cur)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && (cur === first || cur === dlg)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
    }

    function release() {
        if (released) return;
        released = true;
        document.removeEventListener("keydown", onKey, true);
        mo.disconnect();
        const i = _glDlgStack.indexOf(entry);
        if (i !== -1) _glDlgStack.splice(i, 1);
        inerted.forEach(el => el.removeAttribute("inert"));
        if (opener && opener !== document.body && opener.isConnected && typeof opener.focus === "function") {
            try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }
    }

    const mo = new MutationObserver(() => { if (!overlay.isConnected) release(); });
    mo.observe(document.body, { childList: true });

    if (modal) {
        Array.from(document.body.children).forEach(el => {
            if (el === overlay || el.tagName === "SCRIPT" || el.hasAttribute("inert")) return;
            if (el.classList.contains("app-toast") || el.classList.contains("rest-timer")) return;
            el.setAttribute("inert", "");
            inerted.push(el);
        });
    }

    entry.overlay = overlay;
    _glDlgStack.push(entry);
    document.addEventListener("keydown", onKey, true);

    let target = opts.initialFocus;
    if (typeof target === "string") target = dlg.querySelector(target);
    if (!target) target = focusables()[0] || dlg;
    try { target.focus(); } catch (e) { /* ignore */ }

    return release;
}

/* buttons: [{label, value, primary, danger}] ؛ خروجی Promise با value دکمه‌ی انتخاب‌شده (یا dismissValue با Escape/کلیک بیرون) */
function glDialog(o) {
    o = o || {};
    return new Promise(resolve => {
        const id = "glDlg" + (++_glDlgN);
        const btns = o.buttons || [{ label: "باشه", value: true, primary: true }];
        const ov = document.createElement("div");
        ov.className = "dv-modal-overlay gl-dlg-overlay";
        ov.innerHTML = `
        <div class="dv-modal gl-dlg">
            ${o.title ? `<div class="dv-modal-head"><h3 id="${id}t">${esc(o.title)}</h3></div>` : ""}
            <p class="gl-dlg-msg" id="${id}m">${esc(o.message || "")}</p>
            <div class="pb-actions">
                ${btns.map((b, i) => `<button type="button" class="${b.danger ? "danger-btn" : b.primary ? "primary-btn" : "secondary-btn"}" data-i="${i}">${esc(b.label)}</button>`).join("")}
            </div>
        </div>`;
        let done = false;
        const finish = v => { if (done) return; done = true; ov.remove(); resolve(v); };
        ov.addEventListener("click", e => {
            const b = e.target.closest("[data-i]");
            if (b) finish(btns[Number(b.dataset.i)].value);
            else if (e.target === ov) finish(o.dismissValue);
        });
        document.body.appendChild(ov);
        glDialogAttach(ov, {
            alert: true,
            labelledby: o.title ? id + "t" : id + "m",
            describedby: o.title ? id + "m" : "",
            initialFocus: ov.querySelectorAll("[data-i]")[o.focusIndex || 0],
            onClose: () => finish(o.dismissValue)
        });
    });
}

function glAlert(message, title) {
    return glDialog({ title: title || "", message });
}

function glConfirm(message, o) {
    o = o || {};
    return glDialog({
        title: o.title || "",
        message,
        dismissValue: false,
        focusIndex: o.danger ? 1 : 0,
        buttons: [
            { label: o.ok || "تأیید", value: true, primary: !o.danger, danger: !!o.danger },
            { label: o.cancel || "انصراف", value: false }
        ]
    });
}
