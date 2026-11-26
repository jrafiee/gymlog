/* =====================================================
   Gym Progress Tracker — Application Logic
   Integrated with IndexedDB Storage Architecture
===================================================== */

let workoutPrograms = buildWorkoutPrograms(
    getEffectiveCatalog(),
    getEffectiveProgramsRaw()
);

function getLatestMonthKey() {
    const keys = Object.keys(workoutPrograms);
    if (keys.length === 0) return null;
    return keys
        .sort(
            (a, b) =>
                parseInt(a.replace(/\D/g, ""), 10) -
                parseInt(b.replace(/\D/g, ""), 10)
        )
        .pop();
}

let currentMonth = getLatestMonthKey();
let viewingMonth = currentMonth;
let currentSession = 1;
let keepSelectedWeek = false;
let settingsDlgRelease = null;
let settingsReturnView = null;   // صفحه‌ای که از داخل تنظیمات موبایل باز شده

/* -------------------------
عناصر صفحه
------------------------- */
const workoutDate = document.getElementById("workoutDate");
const persianWorkoutDate = document.getElementById("persianWorkoutDate");
const workoutDateBtn = document.getElementById("workoutDateBtn");
const weekNumber = document.getElementById("weekNumber");
const exerciseList = document.getElementById("exerciseList");
const sessionButtons = document.getElementById("sessionButtons");
const emptyProgramState = document.getElementById("emptyProgramState");
const programContent = document.getElementById("programContent");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const settingsPage = document.getElementById("settingsPage");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const totalVolume = document.getElementById("totalVolume");
const volumeChange = document.getElementById("volumeChange");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const finishWorkoutBtn = document.getElementById("finishWorkoutBtn");
const openMyProgramsBtn = document.getElementById("openMyProgramsBtn");
const backupWarningBanner = document.getElementById("backupWarningBanner");
const backupWarningDetail = document.getElementById("backupWarningDetail");
const backupWarningBtn = document.getElementById("backupWarningBtn");
const backupWarningSyncBtn = document.getElementById("backupWarningSyncBtn");
const sessionNote = document.getElementById("sessionNote");
const sessionPrevNote = document.getElementById("sessionPrevNote");

/* =========================================================
   تشخیص هوشمند هفته و جلسه بعدی بر اساس سوابق
========================================================= */

function detectNextWeekAndSession(monthKey) {
    const allWorkouts = getWorkouts() || [];
    if (allWorkouts.length === 0) return { week: 1, session: 1 };

    let workouts = monthKey ? allWorkouts.filter(w => w.month === monthKey) : allWorkouts;
    if (workouts.length === 0 && monthKey) {
        workouts = allWorkouts.filter(w => !w.month);
    }
    if (workouts.length === 0) {
        return { week: 1, session: 1 };
    }

    const sorted = workouts.slice().sort((a, b) => {
        const d = (a.date || "").localeCompare(b.date || "");
        if (d !== 0) return d;
        return (a.id || 0) - (b.id || 0);
    });

    const last = sorted[sorted.length - 1];

    /* جلسه‌ی ناتمام (هنوز «پایان جلسه» نخورده): همان جلسه باز بماند */
    if (!isWorkoutDone(last)) {
        return {
            week: Number(last.week) || 1,
            session: Number(last.session) || 1,
            inProgress: true,
            resumeDate: last.date
        };
    }

    let nextWeek = Number(last.week) || 1;
    let nextSession = Number(last.session) || 1;

    const monthData = (monthKey && workoutPrograms) ? workoutPrograms[monthKey] : null;
    const totalSessions = monthData && monthData.sessions ? Object.keys(monthData.sessions).length : 3;

    if (nextSession < totalSessions) {
        nextSession += 1;
    } else {
        nextSession = 1;
        if (nextWeek < 4) {
            nextWeek += 1;
        }
    }

    return { week: nextWeek, session: nextSession };
}

/* نتیجه‌ی detectNextWeekAndSession را روی فرم ثبت تمرین اعمال می‌کند
   (برای جلسه‌ی در حال انجام، تاریخ همان جلسه هم برمی‌گردد تا داده‌هایش بارگذاری شود) */
function applyDetectedSession(d) {
    if (!d) return;
    currentSession = d.session;
    if (weekNumber) weekNumber.value = d.week;
    if (d.resumeDate && workoutDate) {
        workoutDate.value = d.resumeDate;
        updatePersianWorkoutDate();
    }
}

/* =========================================================
   مدیریت دکمه Back و بازگشت لایه‌ای مودال‌ها
========================================================= */

/* بستن لایه‌ای مودال‌ها: اگر state مربوط به همین مودال است back می‌زند (popstate مودال را برمی‌دارد)، وگرنه مستقیم حذف می‌کند */
function makeModalCloser(overlay, modalKey) {
    return function closeOverlay() {
        if (history.state && history.state.modal === modalKey) {
            history.back();
        } else {
            overlay.remove();
        }
    };
}

function openSettingsPage() {
    if (!settingsPage) return;
    settingsPage.style.display = "";
    if (typeof renderBaleSyncPanels === "function") renderBaleSyncPanels(settingsPage);
    history.pushState({ modal: "settings" }, "");
    document.addEventListener("keydown", closeSettingsWithEscape);
    settingsDlgRelease = glDialogAttach(settingsPage, {
        dialog: settingsPage.querySelector(".settings-page"),
        labelledby: "settingsTitle",
        onClose: () => closeSettingsPage(false)
    });
}

function closeSettingsPage(fromPopstate = false) {
    if (!settingsPage || settingsPage.style.display === "none") return;
    settingsPage.style.display = "none";
    document.removeEventListener("keydown", closeSettingsWithEscape);
    if (settingsDlgRelease) { settingsDlgRelease(); settingsDlgRelease = null; }

    if (!fromPopstate && history.state && history.state.modal === "settings") {
        history.back();
    }
}

function closeSettingsWithEscape(event) {
    if (event.key === "Escape") {
        closeSettingsPage();
    }
}

/* باز کردن یک صفحه از منوی تنظیمات؛ Back به تنظیمات برمی‌گردد */
function openFromSettings(view) {
    closeSettingsPage(true);
    settingsReturnView = view;
    const st = { subview: view };
    if (history.state && history.state.modal === "settings") history.replaceState(st, "");
    else history.pushState(st, "");
    switchView(view);
}

if (openSettingsBtn) {
    openSettingsBtn.addEventListener("click", openSettingsPage);
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener("click", () => closeSettingsPage(false));
}

// دکمه بازگشت فیزیکی گوشی (Back)
window.addEventListener("popstate", () => {
    // ۱. اولویت با راهنما یا سابقه حرکت است
    const guideOverlay = document.querySelector(".exercise-guide-overlay");
    if (guideOverlay) {
        guideOverlay.remove();
        return;
    }

    // ۲. تقویم انتخاب تاریخ
    const dateOverlay = document.querySelector(".date-picker-overlay");
    if (dateOverlay) {
        dateOverlay.remove();
        return;
    }

    // ۳. صفحه برنامه‌های من
    const myProgramsOverlay = document.querySelector(".my-programs-overlay");
    if (myProgramsOverlay) {
        myProgramsOverlay.remove();
        return;
    }

    // ۳.۵ بازگشت از صفحه‌ای که از تنظیمات باز شده (راهنما / کاربران / بانک حرکات)
    if (settingsReturnView && !(history.state && history.state.subview)) {
        const v = settingsReturnView;
        settingsReturnView = null;
        if (typeof currentDesktopView !== "undefined" && currentDesktopView === v) {
            switchView("workout");
            openSettingsPage();
        }
        return;
    }

    // ۴. منوی تنظیمات
    if (settingsPage && settingsPage.style.display !== "none") {
        closeSettingsPage(true);
    }
});

/* -------------------------
تاریخ امروز
------------------------- */
function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/* -------------------------
تبدیل تاریخ میلادی ↔ شمسی (jalaali)
------------------------- */
function jalaliDiv(a, b) {
    return ~~(a / b);
}

function jalaliMod(a, b) {
    return a - ~~(a / b) * b;
}

function jalCal(jy) {
    const breaks = [
        -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
        1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178
    ];
    const bl = breaks.length;
    const gy = jy + 621;
    let leapJ = -14, jp = breaks[0], jm, jump, leap, n, i;

    if (jy < jp || jy >= breaks[bl - 1]) {
        throw new Error("Invalid Jalali year " + jy);
    }

    for (i = 1; i < bl; i += 1) {
        jm = breaks[i];
        jump = jm - jp;
        if (jy < jm) break;
        leapJ = leapJ + jalaliDiv(jump, 33) * 8 + jalaliDiv(jalaliMod(jump, 33), 4);
        jp = jm;
    }

    n = jy - jp;
    leapJ = leapJ + jalaliDiv(n, 33) * 8 + jalaliDiv(jalaliMod(n, 33) + 3, 4);

    if (jalaliMod(jump, 33) === 4 && jump - n === 4) {
        leapJ += 1;
    }

    const leapG = jalaliDiv(gy, 4) - jalaliDiv((jalaliDiv(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;

    if (jump - n < 6) {
        n = n - jump + jalaliDiv(jump, 33) * 33;
    }

    leap = jalaliMod(jalaliMod(n + 1, 33) - 1, 4);
    if (leap === -1) {
        leap = 4;
    }

    return { leap, gy, march };
}

function isLeapJalaliYear(jy) {
    return jalCal(jy).leap === 0;
}

function jalaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaliYear(jy) ? 30 : 29;
}

function g2d(gy, gm, gd) {
    let d =
        jalaliDiv((gy + jalaliDiv(gm - 8, 6) + 100100) * 1461, 4) +
        jalaliDiv(153 * jalaliMod(gm + 9, 12) + 2, 5) +
        gd - 34840408;

    d = d - jalaliDiv(jalaliDiv(gy + 100100 + jalaliDiv(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
}

function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + jalaliDiv(jalaliDiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = jalaliDiv(jalaliMod(j, 1461), 4) * 5 + 308;
    const gd = jalaliDiv(jalaliMod(i, 153), 5) + 1;
    const gm = jalaliMod(jalaliDiv(i, 153), 12) + 1;
    const gy = jalaliDiv(j, 1461) - 100100 + jalaliDiv(8 - gm, 6);

    return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return (
        g2d(r.gy, 3, r.march) +
        (jm - 1) * 31 -
        jalaliDiv(jm, 7) * (jm - 7) +
        jd - 1
    );
}

function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    let jm, jd;

    if (k >= 0) {
        if (k <= 185) {
            jm = 1 + jalaliDiv(k, 31);
            jd = jalaliMod(k, 31) + 1;
            return { jy, jm, jd };
        } else {
            k -= 186;
        }
    } else {
        jy -= 1;
        k += 179;
        if (r.leap === 1) k += 1;
    }

    jm = 7 + jalaliDiv(k, 30);
    jd = jalaliMod(k, 30) + 1;

    return { jy, jm, jd };
}

function gregorianToJalali(gy, gm, gd) {
    return d2j(g2d(gy, gm, gd));
}

function jalaliToGregorian(jy, jm, jd) {
    return d2g(j2d(jy, jm, jd));
}

function isoToJalali(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    return gregorianToJalali(y, m, d);
}

function jalaliToIsoDate(jy, jm, jd) {
    const g = jalaliToGregorian(jy, jm, jd);
    const pad = n => String(n).padStart(2, "0");
    return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

function formatPersianDate(dateString, longFormat = false) {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);

    return new Intl.DateTimeFormat(
        "fa-IR-u-ca-persian",
        longFormat
            ? { year: "numeric", month: "long", day: "numeric" }
            : { year: "numeric", month: "2-digit", day: "2-digit" }
    ).format(date);
}

function updatePersianWorkoutDate() {
    if (!persianWorkoutDate) return;
    persianWorkoutDate.textContent = formatPersianDate(workoutDate.value, true);
}

if (workoutDate) {
    workoutDate.value = getToday();
    updatePersianWorkoutDate();
}

/* =========================
برنامه
========================= */
function getViewingMonth() {
    return workoutPrograms[viewingMonth];
}

function getCurrentProgram() {
    const m = getViewingMonth();
    return m ? m.sessions[currentSession] : null;
}

function getCurrentSavedWorkout() {
    const workouts = getSessionWorkouts(viewingMonth, currentSession);
    return workouts.find(workout => workout.date === workoutDate.value) || null;
}

/* =========================
برنامه‌های من
========================= */
function getMonthDateRangeText(monthKey) {
    const month = workoutPrograms[monthKey];
    if (!month || !month.sessions) return "هنوز تمرینی ثبت نشده";
    const sessionKeys = Object.keys(month.sessions);

    const dates = sessionKeys
        .flatMap(sessionKey => getSessionWorkouts(monthKey, Number(sessionKey)))
        .map(workout => workout.date)
        .sort();

    if (dates.length === 0) return "هنوز تمرینی ثبت نشده";

    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    if (startDate === endDate) return formatPersianDate(startDate, true);
    return formatPersianDate(startDate, true) + " تا " + formatPersianDate(endDate, true);
}

/* گروه‌بندی سوپرست: حرکات پشت‌سرهم با مقدار superset یکسان یک گروه‌اند.
   خروجی: آرایه‌ی هم‌اندازه با شماره‌ی گروه (۱، ۲، …) یا 0 برای حرکت عادی */
function getSupersetMap(exercises) {
    const keys = (exercises || []).map(e => (e && e.superset ? String(e.superset) : ""));
    const out = keys.map(() => 0);
    let n = 0;
    for (let i = 0; i < keys.length; i++) {
        if (!keys[i]) continue;
        let j = i;
        while (j + 1 < keys.length && keys[j + 1] === keys[i]) j++;
        if (j > i) {
            n += 1;
            for (let k = i; k <= j; k++) out[k] = n;
        }
        i = j;
    }
    return out;
}

/* جدول ساختاریافته‌ی یک جلسه از برنامه (هم در صفحه‌ی برنامه‌ها و هم در «برنامه‌های من») */
function buildProgramSessionTableHtml(session, key) {
    const exercises = session.exercises || [];
    const ssMap = getSupersetMap(exercises);
    const ssCount = ssMap.reduce((m, g) => Math.max(m, g), 0);
    let rows = "";

    exercises.forEach((e, i) => {
        const g = ssMap[i];
        const first = g && (i === 0 || ssMap[i - 1] !== g);
        const last = g && (i === exercises.length - 1 || ssMap[i + 1] !== g);
        const reps = String(e.target || "").replace(/^\s*[\d۰-۹]+\s*[×xX*]\s*/, "");

        if (first) {
            rows += `
            <tr class="dv-ss-head"><td colspan="5">${ico("bolt", 14)}سوپرست ${g.toLocaleString("fa-IR")} <span>— این حرکات پشت‌سرهم و بدون استراحت انجام می‌شوند</span></td></tr>`;
        }
        rows += `
            <tr class="${g ? "dv-ss-row" + (last ? " dv-ss-last" : "") : ""}">
                <td class="dv-prog-idx">${(i + 1).toLocaleString("fa-IR")}</td>
                <td class="dv-prog-name">${esc(e.name)}${g ? `<span class="dv-ss-chip">سوپرست ${g.toLocaleString("fa-IR")}</span>` : ""}</td>
                <td>${Number(e.sets).toLocaleString("fa-IR")}</td>
                <td class="dv-prog-reps">${esc(toFa(reps))}</td>
                <td>${esc(toFa(e.rest || "—"))}</td>
            </tr>`;
    });

    return `
        <div class="dv-prog-session">
            <div class="dv-prog-session-head">
                <span class="dv-prog-session-num">جلسه ${Number(key).toLocaleString("fa-IR")}</span>
                <h4>${esc(session.title)}</h4>
                ${ssCount ? `<span class="dv-ss-chip dv-ss-chip-head">${ico("bolt", 13)}${ssCount.toLocaleString("fa-IR")} سوپرست</span>` : ""}
                <span class="dv-prog-session-count">${exercises.length.toLocaleString("fa-IR")} حرکت</span>
            </div>
            <div class="dv-prog-table-wrap">
                <table class="dv-prog-table">
                    <thead>
                        <tr><th>#</th><th>حرکت</th><th>ست</th><th>تکرار / زمان هدف</th><th>استراحت</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function buildMyProgramCardHtml(monthKey) {
    const month = workoutPrograms[monthKey];
    const isCurrent = monthKey === currentMonth;

    const sessionsHtml = Object.keys(month.sessions)
        .map(k => buildProgramSessionTableHtml(month.sessions[k], k))
        .join("");

    return `
        <div class="my-program-card" data-month="${monthKey}">
            <div class="my-program-summary">
                <div class="my-program-summary-info">
                    <h3>
                        ${esc(month.title)}
                        ${isCurrent ? '<span class="my-program-current-badge">برنامه جاری</span>' : ""}
                    </h3>
                    <span class="my-program-dates">${getMonthDateRangeText(monthKey)}</span>
                </div>
                <button type="button" class="secondary-btn my-program-toggle-btn">
                    مشاهده برنامه
                </button>
            </div>
            <div class="my-program-details" style="display: none;">
                ${sessionsHtml}
            </div>
        </div>
    `;
}

function showMyProgramsPage() {
    const monthKeys = Object.keys(workoutPrograms);
    const listHtml = monthKeys.length === 0
        ? `<p class="my-programs-empty">هنوز هیچ برنامه‌ای بارگذاری نشده است.</p>`
        : monthKeys.map(buildMyProgramCardHtml).join("");

    history.pushState({ modal: "myPrograms" }, "");

    const overlay = document.createElement("div");
    overlay.className = "my-programs-overlay";
    overlay.innerHTML = `
        <div class="my-programs-page">
            <div class="my-programs-header">
                <h2 id="myProgramsTitle">برنامه‌های من</h2>
                <button type="button" class="exercise-guide-close my-programs-close" aria-label="بستن">×</button>
            </div>
            <div class="my-programs-list">${listHtml}</div>
        </div>
    `;

    const closeOverlay = makeModalCloser(overlay, "myPrograms");

    overlay.querySelector(".my-programs-close").addEventListener("click", closeOverlay);

    overlay.querySelectorAll(".my-program-toggle-btn").forEach(button => {
        button.addEventListener("click", () => {
            const card = button.closest(".my-program-card");
            const details = card.querySelector(".my-program-details");
            const isHidden = details.style.display === "none";
            details.style.display = isHidden ? "" : "none";
            button.textContent = isHidden ? "بستن برنامه" : "مشاهده برنامه";
        });
    });

    document.body.appendChild(overlay);
    glDialogAttach(overlay, { dialog: overlay.querySelector(".my-programs-page"), labelledby: "myProgramsTitle", onClose: closeOverlay });
}

if (openMyProgramsBtn) {
    openMyProgramsBtn.addEventListener("click", showMyProgramsPage);
}

/* =========================
دکمه‌های جلسات
========================= */
function renderSessionButtons() {
    sessionButtons.innerHTML = "";
    const m = getViewingMonth();
    if (!m || !m.sessions) return;
    const sessions = m.sessions;

    Object.keys(sessions).forEach(session => {
        const button = document.createElement("button");
        button.className = "session-btn";
        if (Number(session) === currentSession) {
            button.classList.add("active");
        }
        button.innerHTML = `
            <strong>جلسه ${toFa(session)}</strong>
            <span>${esc(sessions[session].title)}</span>
        `;
        button.addEventListener("click", () => {
            currentSession = Number(session);
            renderAll();
        });
        sessionButtons.appendChild(button);
    });

    const activeBtn = sessionButtons.querySelector(".session-btn.active");
    if (activeBtn && activeBtn.scrollIntoView) {
        activeBtn.scrollIntoView({ block: "nearest", inline: "center" });
    }
}

/* =========================
ساخت حرکات
========================= */
function renderExercises() {
    const program = getCurrentProgram();
    exerciseList.innerHTML = "";
    if (!program) return;

    const previous = getPreviousWorkout(workoutDate.value, viewingMonth, currentSession);
    const currentWorkout = getCurrentSavedWorkout();

    if (!keepSelectedWeek && currentWorkout && currentWorkout.week) {
        weekNumber.value = currentWorkout.week;
    }

    if (sessionNote) sessionNote.value = (currentWorkout && currentWorkout.note) || "";
    if (sessionPrevNote) {
        const prevNote = previous && previous.note;
        sessionPrevNote.textContent = prevNote ? "یادداشت جلسه قبل: " + prevNote : "";
        sessionPrevNote.hidden = !prevNote;
    }

    const ssMap = getSupersetMap(program.exercises);
    let ssWrap = null;

    program.exercises.forEach((exercise, index) => {
        const previousExercise = previous?.exercises?.find(item => item.id === exercise.id);
        const currentExercise = currentWorkout?.exercises?.find(item => item.id === exercise.id);
        const refSets = getReferenceSets(exercise.id, previousExercise);
        const restSec = parseRestSeconds(exercise.rest);
        const exNote = (currentExercise && currentExercise.note) || "";
        const prevExNote = (previousExercise && previousExercise.note) || "";

        const card = document.createElement("section");
        card.className = "exercise-card";
        card.innerHTML = `
            <div class="exercise-header">
                <div class="exercise-title">
                    <div class="exercise-number">${toFa(index + 1)}</div>
                    <div>
                        <h2>${esc(exercise.name)}</h2>
                        <div class="exercise-meta">
                            هدف: ${esc(toFa(exercise.target))} &nbsp; | &nbsp; استراحت: ${esc(toFa(exercise.rest))}
                        </div>
                    </div>
                </div>
                <button type="button" class="exercise-help-btn" data-exercise-id="${esc(exercise.id)}">
                    ${ico("image")}نحوه اجرا
                </button>
                <button type="button" class="exercise-history-btn" data-exercise-id="${esc(exercise.id)}">
                    ${ico("trend")}سابقه حرکت
                </button>
                ${restSec ? `<button type="button" class="exercise-rest-btn" data-seconds="${restSec}" data-exercise-name="${esc(exercise.name)}">${ico("timer")}استراحت</button>` : ""}
            </div>
            <div class="sets-container" data-exercise="${esc(exercise.id)}">
                ${createSetRows(exercise, previousExercise, currentExercise, refSets)}
            </div>
            <details class="exercise-note" ${exNote ? "open" : ""}>
                <summary>${ico("note")}یادداشت این حرکت</summary>
                ${prevExNote ? `<div class="exercise-prev-note">جلسه قبل: ${esc(prevExNote)}</div>` : ""}
                <textarea class="exercise-note-input" aria-label="یادداشت حرکت ${esc(exercise.name)}" rows="2" maxlength="1000" placeholder="مثلاً تنظیم دستگاه، حس حرکت، دلیل کم‌شدن وزنه…">${esc(exNote)}</textarea>
            </details>
        `;

        const g = ssMap[index];
        if (g) {
            card.classList.add("in-superset");
            const meta = card.querySelector(".exercise-meta");
            if (meta) meta.insertAdjacentHTML("beforeend", `<span class="superset-tag">${ico("bolt", 13)}سوپرست ${toFa(g)}</span>`);
            if (!ssWrap || ssWrap.dataset.g !== String(g)) {
                ssWrap = document.createElement("div");
                ssWrap.className = "superset-group";
                ssWrap.dataset.g = String(g);
                ssWrap.innerHTML = `
                    <div class="superset-head">
                        <span class="superset-badge">${ico("bolt", 14)}سوپرست ${toFa(g)}</span>
                        <span class="superset-hint">یک ست از هر حرکت را پشت‌سرهم و بدون استراحت بزن، بعد استراحت کن و دور بعد را شروع کن.</span>
                    </div>`;
                exerciseList.appendChild(ssWrap);
            }
            ssWrap.appendChild(card);
        } else {
            ssWrap = null;
            exerciseList.appendChild(card);
        }
    });

    attachInputEvents();
    attachExerciseHelpEvents();
    attachExerciseHistoryEvents();
    updateSummary();
}

function attachExerciseHelpEvents() {
    document.querySelectorAll(".exercise-help-btn").forEach(button => {
        button.addEventListener("click", () => {
            showExerciseGuide(button.dataset.exerciseId);
        });
    });
}

function attachExerciseHistoryEvents() {
    document.querySelectorAll(".exercise-history-btn").forEach(button => {
        button.addEventListener("click", () => {
            showExerciseHistory(button.dataset.exerciseId);
        });
    });
}

/* =========================
سابقه حرکت (خوانش مستقیم از مخزن IndexedDB)
========================= */
function getExerciseHistory(exerciseId) {
    const workouts = getWorkouts();
    if (!workouts || !Array.isArray(workouts)) return [];

    const history = [];
    workouts.forEach(workout => {
        const exercise = workout.exercises?.find(item => item.id === exerciseId);
        if (!exercise) return;
        if (countFilledSets(exercise) === 0) return;

        history.push({
            date: workout.date,
            week: workout.week,
            month: workout.month,
            session: workout.session,
            sets: exercise.sets,
            note: exercise.note || ""
        });
    });

    history.sort((a, b) => b.date.localeCompare(a.date));
    return history;
}

function showExerciseHistory(exerciseId) {
    const catalog = getEffectiveCatalog();
    const curProg = getCurrentProgram();
    const exercise = catalog[exerciseId] || (curProg ? curProg.exercises.find(item => item.id === exerciseId) : null);
    if (!exercise) return;

    history.pushState({ modal: "exerciseHistory" }, "");

    const historyData = getExerciseHistory(exerciseId);
    const overlay = document.createElement("div");
    overlay.className = "exercise-guide-overlay";

    let historyHtml = historyData.length === 0
        ? `<div class="history-empty">هنوز سابقه‌ای برای این حرکت ثبت نشده است.</div>`
        : `
            <div class="exercise-history-list">
                ${historyData.map(record => `
                    <div class="exercise-history-item">
                        <div class="exercise-history-info">
                            <strong>${formatPersianDate(record.date, true)}</strong>
                            <span>هفته ${toFa(record.week)} | جلسه ${toFa(record.session)}</span>
                        </div>
                        <div class="exercise-history-sets">
                            ${formatHistorySets(record.sets)}
                        </div>
                        ${record.note ? `<div class="exercise-history-note">${ico("note", 14)}${esc(record.note)}</div>` : ""}
                    </div>
                `).join("")}
            </div>
        `;

    overlay.innerHTML = `
        <div class="exercise-guide-modal">
            <div class="exercise-guide-header">
                <h2 id="exHistTitle">سابقه — ${esc(exercise.name)}</h2>
                <button type="button" class="exercise-guide-close" aria-label="بستن">×</button>
            </div>
            ${historyHtml}
            <button type="button" class="primary-btn exercise-guide-done">بستن</button>
        </div>
    `;

    const closeOverlay = makeModalCloser(overlay, "exerciseHistory");

    overlay.querySelector(".exercise-guide-close").addEventListener("click", closeOverlay);
    overlay.querySelector(".exercise-guide-done").addEventListener("click", closeOverlay);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeOverlay(); });

    document.body.appendChild(overlay);
    glDialogAttach(overlay, { dialog: overlay.querySelector(".exercise-guide-modal"), labelledby: "exHistTitle", onClose: closeOverlay });
}

function formatHistorySets(sets) {
    const filled = (sets || []).filter(isSetFilled);
    if (filled.length === 0) return "—";
    return filled.map(set =>
        `<span class="history-set">${esc(toFa(set.weight || "—"))}kg × ${esc(toFa(set.reps || "—"))}</span>`
    ).join("");
}

/* =========================
رسانه و راهنمای حرکت
========================= */
function createExerciseMedia(mediaPath, exerciseName) {
    if (isVideoSrc(mediaPath) && String(mediaPath).startsWith("data:")) {
        return `
            <video class="exercise-guide-video" aria-label="ویدیوی آموزش ${esc(exerciseName)}" src="${esc(mediaPath)}" controls playsinline muted loop preload="none" onerror="handleExerciseMediaError(this)"></video>
        `;
    }
    if (isVideoSrc(mediaPath)) {
        return `
            <video class="exercise-guide-video" aria-label="ویدیوی آموزش ${esc(exerciseName)}" controls playsinline muted loop preload="none" onerror="handleExerciseMediaError(this)">
                <source src="${esc(mediaPath)}" type="${videoMime(mediaPath)}">
                مرورگر شما از پخش ویدئو پشتیبانی نمی‌کند.
            </video>
        `;
    }
    return `
        <img class="exercise-guide-image" src="${esc(mediaPath)}" alt="${esc(exerciseName)}" loading="lazy" onerror="handleExerciseMediaError(this)">
    `;
}

function handleExerciseMediaError(element) {
    const fallback = document.createElement("div");
    fallback.className = "exercise-guide-no-image";
    fallback.textContent = "فایل تصویر/ویدیوی این حرکت پیدا نشد.";
    element.replaceWith(fallback);
}

/* بعد از افزودن/ویرایش حرکت: برنامه‌ها و صفحه‌ها دوباره ساخته شوند */
function refreshAfterCatalogChange() {
    try {
        workoutPrograms = buildWorkoutPrograms(getEffectiveCatalog(), getEffectiveProgramsRaw());
    } catch (err) {
        console.error(err);
    }
    if (typeof currentDesktopView !== "undefined" && currentDesktopView === "bank" && typeof renderBankView === "function") {
        renderBankView();
    }
    renderAll();
}

function showExerciseGuide(exerciseId) {
    const catalog = getEffectiveCatalog();
    const curProg = getCurrentProgram();
    const exercise = catalog[exerciseId] || (curProg ? curProg.exercises.find(item => item.id === exerciseId) : null);
    if (!exercise) return;

    history.pushState({ modal: "exerciseGuide" }, "");

    const images = exercise.images || [];
    const instructions = exercise.instructions || [];

    let imagesHtml = images.length > 0
        ? `<div class="exercise-guide-images">${images.map(media => createExerciseMedia(media, exercise.name)).join("")}</div>`
        : `<div class="exercise-guide-no-image">تصویر این حرکت هنوز اضافه نشده است.</div>`;

    let instructionsHtml = instructions.length > 0
        ? `<ul class="exercise-guide-instructions">${instructions.map(inst => `<li>${esc(toFa(inst))}</li>`).join("")}</ul>`
        : "";

    const overlay = document.createElement("div");
    overlay.className = "exercise-guide-overlay";
    overlay.innerHTML = `
        <div class="exercise-guide-modal">
            <div class="exercise-guide-header">
                <h2 id="exGuideTitle">${esc(exercise.name)}</h2>
                <button type="button" class="exercise-guide-close" aria-label="بستن">×</button>
            </div>
            ${imagesHtml}
            ${instructionsHtml}
            <div class="exercise-guide-actions">
                ${catalog[exerciseId] ? `<button type="button" class="secondary-btn exercise-guide-edit">${ico("edit")}ویرایش</button>` : ""}
                <button type="button" class="primary-btn exercise-guide-done">بستن</button>
            </div>
        </div>
    `;

    const closeOverlay = makeModalCloser(overlay, "exerciseGuide");

    overlay.querySelector(".exercise-guide-close").addEventListener("click", closeOverlay);
    overlay.querySelector(".exercise-guide-done").addEventListener("click", closeOverlay);

    const editBtn = overlay.querySelector(".exercise-guide-edit");
    if (editBtn) {
        editBtn.addEventListener("click", () => {
            /* اگر بستن راهنما با history.back() انجام می‌شود، ویرایشگر باید بعد از popstate باز شود؛
               وگرنه back ناهمگام همان state تازه‌ی ویرایشگر را می‌بندد. */
            const closesViaHistory = !!(history.state && history.state.modal === "exerciseGuide");
            const openEditor = () => {
                if (typeof openExerciseEditor === "function") {
                    openExerciseEditor(exerciseId, refreshAfterCatalogChange);
                }
            };
            closeOverlay();
            if (closesViaHistory) window.addEventListener("popstate", openEditor, { once: true });
            else openEditor();
        });
    }
    overlay.addEventListener("click", e => { if (e.target === overlay) closeOverlay(); });

    document.body.appendChild(overlay);
    glDialogAttach(overlay, { dialog: overlay.querySelector(".exercise-guide-modal"), labelledby: "exGuideTitle", onClose: closeOverlay });
}

/* =========================
ساخت ست‌ها
========================= */
/* ست‌های مرجع برای مقایسه: جلسه‌ی قبلِ همین جلسه‌ی برنامه، وگرنه آخرین سابقه‌ی همان حرکت */
function getReferenceSets(exerciseId, previousExercise) {
    const hasData = sets => Array.isArray(sets) && sets.some(isSetFilled);
    if (previousExercise && hasData(previousExercise.sets)) return previousExercise.sets;
    const hist = getExerciseHistory(exerciseId).find(r => r.date < workoutDate.value && hasData(r.sets));
    return hist ? hist.sets : [];
}

/* آستانه‌ی هشدار: وزنه ≥ ۳۰٪ تغییر، تکرار ≥ ۵۰٪ و دست‌کم ۴ تکرار تغییر */
const WARN_WEIGHT_RATIO = 0.3;
const WARN_REPS_RATIO = 0.5;
const WARN_REPS_ABS = 4;

/* وضعیت پر بودن فیلدهای یک ست. در حرکات وزن‌بدنی/زمانی خالی بودن وزنه ایرادی ندارد. */
function getSetRowState(row) {
    const hasW = toLatinDigits(row.querySelector(".weight-input").value).trim() !== "";
    const hasR = toLatinDigits(row.querySelector(".reps-input").value).trim() !== "";
    const bw = row.dataset.bw === "1";
    return { hasW, hasR, bw, complete: hasR && (hasW || bw), partial: (hasW || hasR) && !(hasR && (hasW || bw)) };
}

/* ---------- اعتبارسنجی ورودی ست ---------- */
function validateSetInput(input) {
    if (!input) return { ok: true, value: null };
    const kind = input.classList.contains("weight-input") ? "weight" : "reps";
    return validateSetNumber(kind, input.value, !!(input.validity && input.validity.badInput));
}

function setFieldError(input, msg) {
    const holder = input.parentElement;
    const el = holder && holder.querySelector(".field-error");
    if (el) el.textContent = msg || "";
    input.classList.toggle("invalid", !!msg);
    if (msg) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
}

/* آخرین مقدار «ذخیره‌شده/معتبر» هر فیلد در data-last-valid نگه داشته می‌شود؛
   مقدار نامعتبر هرگز جمع‌آوری و ذخیره نمی‌شود (initial=true: مقدار ذخیره‌شده‌ی قبلی همان‌طور که هست مبنا می‌شود) */
function applyInputValidation(input, initial) {
    const res = validateSetInput(input);
    setFieldError(input, res.ok ? "" : res.error);
    if (res.ok || initial) input.dataset.lastValid = input.value;
    return res;
}

function readSetValue(input) {
    return validateSetInput(input).ok ? input.value : (input.dataset.lastValid || "");
}

function getInvalidSetInputs() {
    return Array.from(document.querySelectorAll(".weight-input, .reps-input")).filter(i => !validateSetInput(i).ok);
}

/* final=true: کاربر از ست خارج شده (یا بارگذاری اولیه)؛ فقط آن‌وقت خالی‌بودن فیلد هشدار می‌دهد */
function checkSetWarning(row, final) {
    if (!row) return;
    const warnEl = row.querySelector(".set-warning");
    if (!warnEl) return;

    const L = SET_INPUT_LIMITS;
    const wRes = validateSetInput(row.querySelector(".weight-input"));
    const rRes = validateSetInput(row.querySelector(".reps-input"));
    const st = getSetRowState(row);
    const w = wRes.ok && wRes.value !== null ? wRes.value : NaN;
    const r = rRes.ok && rRes.value !== null ? rRes.value : NaN;
    const msgs = [];

    /* ۱) مقدار نامعقول؛ بدون نیاز به سابقه‌ی قبلی (جلسه‌ی اول هم کار می‌کند) */
    if (isFinite(w) && w >= L.suspiciousWeight) msgs.push(`وزنه ${toFa(w)} kg خیلی زیاد است`);
    const repsLimit = st.bw ? L.suspiciousRepsBodyweight : L.suspiciousReps;
    if (isFinite(r) && r >= repsLimit) msgs.push(`تکرار ${toFa(r)} خیلی زیاد است`);
    if (isFinite(r) && r === 0 && isFinite(w) && w > 0) msgs.push("تکرار ۰ است در حالی که وزنه ثبت شده");

    /* ۲) مقایسه با سابقه، فقط وقتی اطلاعات کل ست وارد شده و معتبر است */
    if (st.complete && wRes.ok && rRes.ok) {
        const pw = parseFloat(row.dataset.refW);
        const pr = parseFloat(row.dataset.refR);

        if (isFinite(w) && w > 0 && isFinite(pw) && pw > 0) {
            const ch = (w - pw) / pw;
            if (Math.abs(ch) >= WARN_WEIGHT_RATIO) {
                msgs.push(`وزنه ${toFa(Math.round(Math.abs(ch) * 100))}٪ ${ch > 0 ? "بیشتر" : "کمتر"} از قبل است (${toFa(pw)} ← ${toFa(w)} kg)`);
            }
        }
        if (isFinite(r) && r > 0 && isFinite(pr) && pr > 0) {
            const diff = r - pr;
            if (Math.abs(diff) >= WARN_REPS_ABS && Math.abs(diff) / pr >= WARN_REPS_RATIO) {
                msgs.push(`تکرار ${diff > 0 ? "بیشتر" : "کمتر"} از قبل است (${toFa(pr)} ← ${toFa(r)})`);
            }
        }
    }
    if (msgs.length) msgs.push("مطمئنی درست وارد کرده‌ای؟");

    /* ۳) ست ناقص (فقط بعد از خروج از ست) */
    if (st.partial && final && wRes.ok && rRes.ok) {
        msgs.push(!st.hasR ? "تکرار این ست خالی مانده است." : "وزنه این ست خالی مانده است.");
    }

    warnEl.innerHTML = msgs.length ? glIcon("alert", 16, "gl-in") + esc(msgs.join(" — ")) : "";
    row.classList.toggle("has-warning", msgs.length > 0);
}

function createSetRows(exercise, previousExercise, currentExercise, refSets) {
    let html = "";
    const isBw = !!((window.DashAnalytics && window.DashAnalytics.BODYWEIGHT_IDS.has(exercise.id)) ||
        (getEffectiveCatalog()[exercise.id] && getEffectiveCatalog()[exercise.id].bodyweight));
    const refList = (refSets || []).filter(s => s && (s.weight !== "" || s.reps !== ""));
    for (let i = 0; i < exercise.sets; i++) {
        const previousSet = previousExercise?.sets?.[i];
        const refSet = (refSets && refSets[i] && (refSets[i].weight !== "" || refSets[i].reps !== ""))
            ? refSets[i]
            : (refList.length ? refList[refList.length - 1] : null);
        const currentSet = currentExercise?.sets?.[i];
        const currentWeight = currentSet?.weight || "";
        const currentReps = currentSet?.reps || "";

        html += `
            <div class="set-row" data-set="${i}" data-bw="${isBw ? 1 : 0}" data-ref-w="${refSet ? esc(refSet.weight) : ""}" data-ref-r="${refSet ? esc(refSet.reps) : ""}">
                <div class="set-label">ست ${toFa(i + 1)}</div>
                <div>
                    <input type="number" class="weight-input" aria-label="${esc(exercise.name)}، ست ${toFa(i + 1)}، وزنه (کیلوگرم)" placeholder="وزنه (kg)" min="0" max="${SET_INPUT_LIMITS.weightMax}" step="0.5" inputmode="decimal" value="${esc(currentWeight)}">
                    <small class="field-error" role="alert"></small>
                </div>
                <div>
                    <input type="number" class="reps-input" aria-label="${esc(exercise.name)}، ست ${toFa(i + 1)}، تعداد تکرار" placeholder="تکرار" min="0" max="${SET_INPUT_LIMITS.repsMax}" step="1" inputmode="numeric" value="${esc(currentReps)}">
                    <small class="field-error" role="alert"></small>
                </div>
                <div class="set-difference">
                    ${previousSet && (previousSet.weight || previousSet.reps)
                        ? `جلسه قبل: ${esc(toFa(previousSet.weight || "—"))}kg × ${esc(toFa(previousSet.reps || "—"))}`
                        : ""}
                </div>
                <div class="set-warning" role="alert"></div>
            </div>
        `;
    }
    return html;
}

function collectWorkout() {
    const result = {
        id: Date.now(),
        date: workoutDate.value,
        week: Number(weekNumber.value),
        month: viewingMonth,
        session: currentSession,
        exercises: []
    };

    /* وضعیت: جلسه‌ی قبلاً «پایان‌یافته» همان‌طور می‌ماند؛ غیر از آن تا «پایان جلسه» در حال انجام است */
    const savedNow = getCurrentSavedWorkout();
    result.status = savedNow && isWorkoutDone(savedNow) ? "done" : "in_progress";

    const sessionNoteText = sessionNote ? sessionNote.value.trim() : "";
    if (sessionNoteText) result.note = sessionNoteText;

    document.querySelectorAll(".sets-container").forEach(container => {
        const exerciseId = container.dataset.exercise;
        const sets = [];
        container.querySelectorAll(".set-row").forEach(row => {
            const weight = readSetValue(row.querySelector(".weight-input"));
            const reps = readSetValue(row.querySelector(".reps-input"));
            sets.push({ weight, reps });
        });
        const card = container.closest(".exercise-card");
        const noteEl = card ? card.querySelector(".exercise-note-input") : null;
        const exNoteText = noteEl ? noteEl.value.trim() : "";
        const entry = { id: exerciseId, sets };
        if (exNoteText) entry.note = exNoteText;
        result.exercises.push(entry);
    });

    return result;
}

function workoutHasData(workout) {
    return workout.exercises.some(exercise => countFilledSets(exercise) > 0);
}

/* ذخیره‌ی فوری (برای «پایان جلسه»). شناسه‌ی رکورد موجود را addWorkout حفظ می‌کند. */
async function autoSaveWorkout(markDone) {
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingWorkout = null;
    if (!workoutDate.value || viewingMonth !== currentMonth) return false;
    const workout = collectWorkout();
    if (!workoutHasData(workout)) return false;
    if (markDone) workout.status = "done";

    await addWorkout(workout);
    return true;
}

/* ذخیره‌ی خودکار هنگام تایپ: عکس لحظه‌ای از فرم همان لحظه گرفته می‌شود (تا با عوض شدن جلسه/تاریخ قاطی نشود)
   ولی نوشتن در IndexedDB و آینه‌ی localStorage با تأخیر کوتاه انجام می‌شود، نه با هر کلید. */
let pendingWorkout = null;
let saveTimer = null;

function queueWorkoutSave() {
    if (!workoutDate.value || viewingMonth !== currentMonth) return;
    const snap = collectWorkout();
    if (!workoutHasData(snap)) {
        clearTimeout(saveTimer);
        saveTimer = null;
        pendingWorkout = null;
        return;
    }
    pendingWorkout = snap;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushWorkoutSave, 400);
}

async function flushWorkoutSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const w = pendingWorkout;
    pendingWorkout = null;
    if (!w) return false;
    try {
        return await addWorkout(w);
    } catch (err) {
        console.error("خطا در ذخیره‌ی خودکار جلسه:", err);
        return false;
    }
}

/* هنگام رفتن به پس‌زمینه یا بستن صفحه، تغییر ذخیره‌نشده از دست نرود */
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWorkoutSave();
});
window.addEventListener("pagehide", () => { flushWorkoutSave(); });

/* پیام کوتاه و غیرمسدودکننده */
function showToast(message, type = "success") {
    const old = document.querySelector(".app-toast");
    if (old) old.remove();

    const toast = document.createElement("div");
    let cls = "app-toast";
    if (type === "warning") cls += " warning";
    if (type === "info") cls += " info";
    toast.className = cls;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, type === "warning" ? 6000 : 3500);
}

function goToNextWorkout() {
    const currentWeek = Number(weekNumber.value);
    const monthData = workoutPrograms[currentMonth];
    const totalSessions = monthData && monthData.sessions ? Object.keys(monthData.sessions).length : 3;

    if (currentSession < totalSessions) {
        currentSession += 1;
    } else if (currentWeek < 4) {
        weekNumber.value = currentWeek + 1;
        currentSession = 1;
    } else {
        showToast("تبریک! هفته چهارم و پایان این دوره تمرینی را با موفقیت تمام کردید.", "info");
        return;
    }

    keepSelectedWeek = true;
    renderAll();
    keepSelectedWeek = false;
}

if (finishWorkoutBtn) {
    finishWorkoutBtn.addEventListener("click", async () => {
        if (viewingMonth !== currentMonth) {
            showToast("برنامه‌های قبلی فقط برای مشاهده هستند.", "warning");
            return;
        }
        const invalidInputs = getInvalidSetInputs();
        if (invalidInputs.length > 0) {
            invalidInputs.forEach(i => applyInputValidation(i, false));
            showToast("اول مقدارهای نامعتبر را اصلاح کن.", "warning");
            invalidInputs[0].focus();
            if (invalidInputs[0].scrollIntoView) invalidInputs[0].scrollIntoView({ block: "center" });
            return;
        }

        const workout = collectWorkout();
        if (!workoutHasData(workout)) {
            showToast("هنوز اطلاعاتی برای این جلسه ثبت نشده است.", "warning");
            return;
        }

        // هشدار ست‌های ناقص (فقط وزنه یا فقط تکرار)
        const partialRows = Array.from(document.querySelectorAll(".set-row")).filter(r => getSetRowState(r).partial);
        if (partialRows.length > 0) {
            partialRows.forEach(r => checkSetWarning(r, true));
            if (!(await glConfirm(`${toFa(partialRows.length)} ست ناقص ثبت شده (وزنه یا تکرار خالی است). با همین حالت جلسه ذخیره شود؟`, { title: "ست ناقص", ok: "ذخیره با همین حالت", cancel: "بازگشت و اصلاح" }))) return;
        }

        // ۱) عملیات اصلی: ذخیره قطعی در پایگاه‌داده IndexedDB
        let saved = false;
        try {
            saved = await autoSaveWorkout(true);
        } catch (error) {
            console.error("خطا در ذخیره‌ی جلسه:", error);
        }

        if (!saved) {
            showToast("ذخیره‌ی جلسه انجام نشد. دوباره تلاش کن.", "warning");
            return;
        }

        // ۲) عملیات ثانویه: پشتیبان خودکار
        let backupOk = false;
        try {
            backupOk = exportData({ fileName: buildBackupFileName() }) === true;
        } catch (error) {
            console.error("خطا در پشتیبان خودکار:", error);
        }

        // ۳) ارسال خودکار به بله (اختیاری؛ در پس‌زمینه تا رفتن به جلسه‌ی بعد معطل نشود)
        let baleSyncPromise = null;
        if (typeof getBaleSettings === "function") {
            const bs = getBaleSettings();
            if (bs.autoAfterSession && bs.token && bs.chatId) {
                baleSyncPromise = syncWithBale({ auto: true });
            }
        }

        // ۴) پیام نتیجه و رفتن به جلسه‌ی بعد
        if (backupOk) {
            showToast("جلسه ذخیره شد و فایل پشتیبان هم دانلود شد.");
            renderBackupWarning();
        } else {
            showToast("جلسه ذخیره شد، اما دانلود خودکار فایل پشتیبان انجام نشد.", "warning");
        }

        goToNextWorkout();

        if (baleSyncPromise) {
            baleSyncPromise.then(r => {
                showToast(r.ok ? "پشتیبان به بله هم ارسال شد." : r.message, r.ok ? "success" : "warning");
                if (typeof refreshBaleStatus === "function") refreshBaleStatus();
                renderBackupWarning();
            }).catch(() => {});
        }
    });
}

function calculateVolume(workout) {
    if (!workout) return 0;
    let volume = 0;
    workout.exercises.forEach(exercise => {
        exercise.sets.forEach(set => {
            const weight = parseFloat(set.weight);
            const reps = parseFloat(set.reps);
            if (!isNaN(weight) && !isNaN(reps)) {
                volume += weight * reps;
            }
        });
    });
    return volume;
}

function updateSummary() {
    const workout = collectWorkout();
    const volume = calculateVolume(workout);
    totalVolume.textContent = Math.round(volume).toLocaleString("fa-IR");

    const previous = getPreviousWorkout(workout.date, viewingMonth, currentSession);
    if (!previous) {
        volumeChange.textContent = "—";
        return;
    }

    const previousVolume = calculateVolume(previous);
    if (previousVolume === 0) {
        volumeChange.textContent = "—";
        return;
    }

    const change = ((volume - previousVolume) / previousVolume) * 100;
    const rounded = Math.round(change * 10) / 10;
    volumeChange.textContent = `${rounded > 0 ? "+" : ""}${toFa(rounded)}%`;
}

/* =========================
تقویم انتخاب تاریخ
========================= */
const PERSIAN_WEEKDAY_LABELS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const PERSIAN_MONTH_NAMES = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
];

/* روزهای دارای جلسه‌ی «پایان‌یافته» */
function getWorkoutDatesSet() {
    return new Set(getWorkouts().filter(isWorkoutDone).map(workout => workout.date));
}

/* روزهایی که فقط جلسه‌ی در حال انجام دارند */
function getInProgressDatesSet() {
    const done = getWorkoutDatesSet();
    return new Set(getWorkouts().filter(w => !isWorkoutDone(w) && !done.has(w.date)).map(w => w.date));
}

function buildDatePickerGrid(jy, jm, selectedIso, todayIso, workoutDatesSet, progressDatesSet) {
    const monthLength = jalaliMonthLength(jy, jm);
    const firstGregorian = jalaliToGregorian(jy, jm, 1);
    const firstDate = new Date(firstGregorian.gy, firstGregorian.gm - 1, firstGregorian.gd);
    const startWeekday = (firstDate.getDay() + 1) % 7;

    const naturalSlots = [];
    for (let i = 0; i < startWeekday; i++) naturalSlots.push(null);
    for (let day = 1; day <= monthLength; day++) naturalSlots.push(day);
    while (naturalSlots.length % 7 !== 0) naturalSlots.push(null);

    const displaySlots = [];
    for (let i = 0; i < naturalSlots.length; i += 7) {
        displaySlots.push(...naturalSlots.slice(i, i + 7).reverse());
    }

    let cellsHtml = "";
    displaySlots.forEach(day => {
        if (day === null) {
            cellsHtml += `<div class="date-picker-day empty"></div>`;
            return;
        }

        const iso = jalaliToIsoDate(jy, jm, day);
        const classes = ["date-picker-day"];
        if (iso === todayIso) classes.push("today");
        if (iso === selectedIso) classes.push("selected");
        if (workoutDatesSet.has(iso)) classes.push("has-workout");
        else if (progressDatesSet && progressDatesSet.has(iso)) classes.push("in-progress");

        cellsHtml += `
            <button type="button" class="${classes.join(" ")}" data-iso="${iso}" aria-label="${esc(formatPersianDate(iso, true))}${workoutDatesSet.has(iso) ? "، جلسه پایان‌یافته" : ""}" aria-pressed="${iso === selectedIso}"${iso === todayIso ? ' aria-current="date"' : ""}>
                <span class="date-picker-day-circle">${toFa(day)}</span>
            </button>
        `;
    });
    return cellsHtml;
}

function showDatePickerCalendar() {
    const todayIso = getToday();
    const selectedIso = workoutDate.value || todayIso;
    const workoutDatesSet = getWorkoutDatesSet();
    const progressDatesSet = getInProgressDatesSet();
    const view = isoToJalali(selectedIso);

    history.pushState({ modal: "datePicker" }, "");

    const overlay = document.createElement("div");
    overlay.className = "date-picker-overlay";

    const closeOverlay = makeModalCloser(overlay, "datePicker");

    function render() {
        overlay.innerHTML = `
            <div class="date-picker-modal">
                <div class="date-picker-header">
                    <button type="button" class="date-picker-nav" data-dir="prev" aria-label="ماه قبل">‹</button>
                    <h3>${PERSIAN_MONTH_NAMES[view.jm - 1]} ${toFa(view.jy)}</h3>
                    <button type="button" class="date-picker-nav" data-dir="next" aria-label="ماه بعد">›</button>
                </div>
                <div class="date-picker-weekdays">
                    ${PERSIAN_WEEKDAY_LABELS.slice().reverse().map(label => `<span>${label}</span>`).join("")}
                </div>
                <div class="date-picker-grid">
                    ${buildDatePickerGrid(view.jy, view.jm, selectedIso, todayIso, workoutDatesSet, progressDatesSet)}
                </div>
                <div class="date-picker-legend">
                    <span class="date-picker-legend-circle"></span> جلسه‌ی پایان‌یافته
                    <span class="date-picker-legend-circle in-progress"></span> در حال انجام
                </div>
                <button type="button" class="secondary-btn date-picker-close">بستن</button>
            </div>
        `;

        overlay.querySelector(".date-picker-close").addEventListener("click", closeOverlay);

        overlay.querySelectorAll(".date-picker-nav").forEach(button => {
            button.addEventListener("click", () => {
                const direction = button.dataset.dir === "prev" ? -1 : 1;
                view.jm += direction;
                if (view.jm < 1) { view.jm = 12; view.jy -= 1; }
                if (view.jm > 12) { view.jm = 1; view.jy += 1; }
                render();
                const navBtn = overlay.querySelector(`.date-picker-nav[data-dir="${button.dataset.dir}"]`);
                if (navBtn) navBtn.focus();
            });
        });

        overlay.querySelectorAll(".date-picker-day:not(.empty)").forEach(cell => {
            cell.addEventListener("click", () => {
                workoutDate.value = cell.dataset.iso;
                updatePersianWorkoutDate();
                renderAll();
                closeOverlay();
            });
        });
    }

    overlay.addEventListener("click", e => { if (e.target === overlay) closeOverlay(); });
    render();
    document.body.appendChild(overlay);
    glDialogAttach(overlay, { dialog: overlay, label: "انتخاب تاریخ تمرین", onClose: closeOverlay });
}

if (workoutDateBtn) {
    workoutDateBtn.addEventListener("click", showDatePickerCalendar);
}

if (weekNumber) {
    weekNumber.addEventListener("change", () => {
        let week = Number(weekNumber.value);
        if (week < 1) week = 1;
        if (week > 4) week = 4;
        weekNumber.value = week;
        renderAll();
    });
}

/* یادداشت‌ها همراه ست‌ها ذخیره می‌شوند (جلسه‌ی بدون هیچ ستی ذخیره نمی‌شود)؛ با تأخیر کوتاه */
const scheduleNoteSave = queueWorkoutSave;

if (sessionNote) sessionNote.addEventListener("input", scheduleNoteSave);

function attachInputEvents() {
    document.querySelectorAll(".weight-input, .reps-input").forEach(input => {
        applyInputValidation(input, true);
        input.addEventListener("input", () => {
            applyInputValidation(input, false);
            checkSetWarning(input.closest(".set-row"), false);
            updateSummary();
            queueWorkoutSave();
        });
    });
    document.querySelectorAll(".set-row").forEach(row => {
        checkSetWarning(row, true);
        /* هشدار فیلد خالی فقط وقتی فوکوس کاملاً از ست خارج شد */
        row.addEventListener("focusout", e => {
            if (e.relatedTarget && row.contains(e.relatedTarget)) return;
            checkSetWarning(row, true);
        });
    });
    document.querySelectorAll(".exercise-note-input").forEach(input => {
        input.addEventListener("input", scheduleNoteSave);
    });
}

function renderHistory() {
    const container = document.getElementById("historyContainer");
    if (!container) return;

    const workouts = getSessionWorkouts(viewingMonth, currentSession);
    if (workouts.length === 0) {
        container.innerHTML = `<div class="history-empty">هنوز برای این جلسه رکوردی ثبت نشده است.</div>`;
        return;
    }

    let html = `
        <div class="history-table-wrapper">
            <table class="history-table">
                <thead>
                    <tr>
                        <th>تاریخ</th>
                        <th>هفته</th>
                        <th>حجم کل</th>
                        <th>تغییر</th>
                    </tr>
                </thead>
                <tbody>
    `;

    workouts.forEach((workout, index) => {
        const volume = calculateVolume(workout);
        let change = "—";
        if (index > 0) {
            const previous = calculateVolume(workouts[index - 1]);
            if (previous > 0) {
                const percent = ((volume - previous) / previous) * 100;
                change = `${percent > 0 ? "+" : ""}${toFa(Math.round(percent * 10) / 10)}%`;
            }
        }

        html += `
            <tr>
                <td>${formatPersianDate(workout.date)}</td>
                <td>هفته ${toFa(workout.week)}</td>
                <td>${Math.round(volume).toLocaleString("fa-IR")}</td>
                <td>${change}</td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

/* =========================
هشدار پشتیبان‌گیری
========================= */
function renderBackupWarning() {
    if (!backupWarningBanner) return;

    if (backupWarningSyncBtn) {
        backupWarningSyncBtn.hidden = !(typeof isBaleConfigured === "function" && isBaleConfigured());
    }

    const info = getBackupWarningInfo();

    if (!info.shouldWarn) {
        backupWarningBanner.style.display = "none";
        return;
    }

    if (backupWarningDetail) {
        backupWarningDetail.textContent =
            `${info.daysSince.toLocaleString("fa-IR")} روز از آخرین پشتیبان‌گیری گذشته. برای جلوگیری از گم شدن اطلاعات، یک نسخه پشتیبان بگیر.`;
    }

    backupWarningBanner.style.display = "";
}

if (backupWarningBtn) {
    backupWarningBtn.addEventListener("click", () => {
        exportData();
        renderBackupWarning();
    });
}

/* =========================================================
   ذخیره‌ی آفلاین فایل‌های آموزشی
========================================================= */

/* ---------- هماهنگ‌سازی فایل‌های آموزشی با کش آفلاین ----------
   - ⚠ MEDIA_CACHE_NAME و MEDIA_SYNC_HEADER باید با service-worker.js یکی باشند.
   - هر فایل با «اعتبارسنجی شرطی» (ETag / Last-Modified) بررسی می‌شود:
     اگر فایلی با همان نام روی سرور عوض شده باشد جایگزین می‌شود؛
     اگر تغییری نکرده باشد چیزی دانلود نمی‌شود (پاسخ ۳۰۴).
   - درخواست‌های بررسی هدر مخصوص دارند تا service worker آن‌ها را از کش پاسخ ندهد. */
const MEDIA_CACHE_NAME = "gym-media-v2";
const MEDIA_SYNC_HEADER = "X-GymLog-Sync";
const MEDIA_CHECK_KEY = "gymMediaCheckedAt";
const MEDIA_CHECK_INTERVAL = 10 * 60 * 1000;   // فاصله‌ی بررسی خودکار (هنگام برگشت به برنامه)
const MEDIA_CONCURRENCY = 3;
/* true: فایل‌های همه‌ی حرکات بانک حرکات هم برای آفلاین ذخیره شود، نه فقط حرکات برنامه */
const CACHE_ALL_CATALOG_MEDIA = true;

function collectProgramAssetUrls(programsRaw, catalog) {
    const urls = new Set();
    Object.values(programsRaw || {}).forEach(month => {
        Object.values(month.sessions || {}).forEach(session => {
            (session.exercises || []).forEach(exercise => {
                const entry = catalog[exercise.id];
                ((entry && entry.images) || []).forEach(path => {
                    if (String(path).startsWith("data:")) return;
                    try {
                        urls.add(new URL(path, location.href).href);
                    } catch (e) { /* مسیر نامعتبر */ }
                });
            });
        });
    });
    return Array.from(urls);
}

function collectCatalogAssetUrls(catalog) {
    const urls = new Set();
    Object.keys(catalog || {}).forEach(id => {
        ((catalog[id] && catalog[id].images) || []).forEach(path => {
            if (typeof path !== "string" || path.startsWith("data:")) return;
            try {
                urls.add(new URL(path, location.href).href);
            } catch (e) { /* مسیر نامعتبر */ }
        });
    });
    return Array.from(urls);
}

async function fetchWithTimeout(url, init, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);   // فقط تا رسیدن هدر؛ دانلود بدنه قطع نمی‌شود
    }
}

/* یک فایل را با کش مقایسه می‌کند. خروجی: "fresh" | "updated" | "added" | "fail" */
async function syncMediaFile(cache, url) {
    let cached = null;
    try {
        cached = await cache.match(url, { ignoreVary: true });
        if (cached && cached.status !== 200) {
            await cache.delete(url);
            cached = null;
        }

        const headers = { [MEDIA_SYNC_HEADER]: "1" };
        const init = { headers };
        if (cached) {
            const etag = cached.headers.get("etag");
            const lastMod = cached.headers.get("last-modified");
            if (etag) headers["If-None-Match"] = etag;
            else if (lastMod) headers["If-Modified-Since"] = lastMod;
            else init.cache = "no-cache";     // سرور شناسه‌ی نسخه نمی‌دهد: دوباره بگیر
        } else {
            init.cache = "no-cache";
        }

        const res = await fetchWithTimeout(url, init, 15000);

        if (res.status === 304) return "fresh";

        const type = res.headers.get("content-type") || "";
        if (res.status !== 200 || /text\/html/i.test(type)) {
            return cached ? "fresh" : "fail";   // خطای سرور: نسخه‌ی قبلی را نگه دار
        }

        await cache.put(url, res);
        return cached ? "updated" : "added";
    } catch (e) {
        return cached ? "fresh" : "fail";       // آفلاین یا قطع شدن: اگر کش داریم همان کافی است
    }
}

async function syncMediaUrls(urls) {
    const stats = { ok: 0, fail: 0, updated: 0, added: 0 };
    if (!("caches" in window) || !urls.length) return stats;

    const cache = await caches.open(MEDIA_CACHE_NAME);
    let next = 0;
    const worker = async () => {
        while (next < urls.length) {
            const url = urls[next++];
            const r = await syncMediaFile(cache, url);
            if (r === "fail") {
                stats.fail += 1;
            } else {
                stats.ok += 1;
                if (r === "updated") stats.updated += 1;
                if (r === "added") stats.added += 1;
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(MEDIA_CONCURRENCY, urls.length) }, worker));
    return stats;
}

/* فایل‌های حرکات برنامه‌ی فعال را ذخیره/به‌روز می‌کند (برای cacheAndReport) */
async function cacheProgramAssets(programsRaw, catalog) {
    return syncMediaUrls(collectProgramAssetUrls(programsRaw, catalog));
}

/* همه‌ی فایل‌های آموزشی: اول حرکات برنامه، بعد بقیه‌ی بانک حرکات.
   force=false: اگر کمتر از MEDIA_CHECK_INTERVAL از آخرین بررسی کامل گذشته باشد انجام نمی‌شود. */
let _mediaSyncPromise = null;

function syncAllMedia(force) {
    if (!("caches" in window) || !navigator.onLine) return Promise.resolve(null);
    if (!(window.GymLogStoreCache && window.GymLogStoreCache.isReady)) return Promise.resolve(null);
    if (_mediaSyncPromise) return _mediaSyncPromise;

    if (!force) {
        let last = 0;
        try { last = Number(localStorage.getItem(MEDIA_CHECK_KEY)) || 0; } catch (e) { /* ignore */ }
        if (Date.now() - last < MEDIA_CHECK_INTERVAL) return Promise.resolve(null);
    }

    const run = async () => {
        try {
            const catalog = getEffectiveCatalog();
            const first = collectProgramAssetUrls(getEffectiveProgramsRaw(), catalog);

            let rest = [];
            const saveData = navigator.connection && navigator.connection.saveData;
            if (CACHE_ALL_CATALOG_MEDIA && !saveData) {
                const inFirst = new Set(first);
                rest = collectCatalogAssetUrls(catalog).filter(u => !inFirst.has(u));
            }

            const a = await syncMediaUrls(first);
            const b = await syncMediaUrls(rest);
            const total = {
                ok: a.ok + b.ok,
                fail: a.fail + b.fail,
                updated: a.updated + b.updated,
                added: a.added + b.added
            };
            if (total.fail === 0) {
                try { localStorage.setItem(MEDIA_CHECK_KEY, String(Date.now())); } catch (e) { /* ignore */ }
            }
            return total;
        } catch (err) {
            console.warn("[GymLog Media] هماهنگ‌سازی فایل‌های آموزشی انجام نشد:", err);
            return null;
        }
    };

    _mediaSyncPromise = run().finally(() => { _mediaSyncPromise = null; });
    return _mediaSyncPromise;
}

window.syncAllMedia = syncAllMedia;

/* با وصل شدن دوباره‌ی اینترنت یا برگشتن به برنامه، تغییر فایل‌ها بررسی شود */
window.addEventListener("online", () => { syncAllMedia(true); });
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncAllMedia(false);
});

/* دانلود فایل‌های آموزشی در پس‌زمینه؛ کاربر منتظر نمی‌ماند */
function cacheAndReport(message) {
    if (message) showToast(message);
    return syncAllMedia(true).catch(() => null);
}

/* =========================
پشتیبان و بارگذاری (پشتیبانی از فرمت جدید Versionدار و فرمت قدیم)
========================= */
const exportBtn = document.getElementById("exportBtn");
if (exportBtn) {
    exportBtn.addEventListener("click", () => {
        exportData();
        renderBackupWarning();
    });
}

const importInput = document.getElementById("importInput");
if (importInput) {
    importInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (file) handleBackupFileSelected(file);
        e.target.value = "";
    });
}

const programImportInput = document.getElementById("programImportInput");
if (programImportInput) {
    programImportInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (file) handleBackupFileSelected(file);
        e.target.value = "";
    });
}

function handleBackupFileSelected(file) {
    const reader = new FileReader();
    reader.onload = async function () {
        let data;
        try {
            data = JSON.parse(reader.result);
        } catch {
            await glAlert("فایل معتبر نیست؛ محتوای آن قابل خواندن نیست.");
            return;
        }

        try {
            // پشتیبان کامل همه‌ی اطلاعات فعلی را جایگزین می‌کند؛ پس قبلش تأیید می‌گیریم
            if (Array.isArray(data.workouts) && hasBackableData() && !(await glConfirm(
                "بازیابی پشتیبان، همه‌ی اطلاعات فعلی (همه‌ی کاربران، تمرین‌ها و برنامه‌ها) را با محتوای این فایل جایگزین می‌کند. ادامه می‌دهی؟\n\n" +
                "اگر فقط می‌خواهی اطلاعات تمرین یک کاربر را به داده‌های فعلی اضافه کنی، از صفحه‌ی «کاربران» دکمه‌ی «به‌روزرسانی اطلاعات تمرین» را بزن.",
                { title: "جایگزینی اطلاعات فعلی", ok: "جایگزین کن", cancel: "انصراف", danger: true }
            ))) return;
            const res = await restoreBackup(data);
            try {
                sessionStorage.setItem("gymFlash", res.type === "program"
                    ? "برنامه با موفقیت اضافه شد."
                    : "اطلاعات با موفقیت از فایل پشتیبان بازیابی شد.");
            } catch (e) { /* ignore */ }
            location.reload();
        } catch (err) {
            console.error("خطا در بازیابی فایل:", err);
            await glAlert("خطا در بازیابی فایل: " + (err.message || "فایل نامعتبر است."));
        }
    };
    reader.readAsText(file);
}

/* این دو تابع هم در منوی تنظیمات موبایل و هم در صفحه‌ی تنظیمات دسکتاپ استفاده می‌شوند */
async function confirmClearHistory() {
    if (!(await glConfirm("تاریخچه‌ی تمرین‌های کاربر فعال حذف شود؟ برنامه‌ی تمرینی و سایر کاربران دست‌نخورده می‌مانند.",
        { title: "حذف تاریخچه", ok: "حذف تاریخچه", danger: true }))) return false;
    await deleteAllData();
    renderAll();
    showToast("تاریخچه تمرینات پاک شد.");
    return true;
}

/* تأیید حذف همه‌چیز: تایپ کلمه‌ی «حذف» + انتخاب پاک‌شدن توکن بله */
function askFullReset() {
    return new Promise(resolve => {
        const baleOn = typeof isBaleConfigured === "function" && isBaleConfigured();
        const ov = document.createElement("div");
        ov.className = "dv-modal-overlay gl-dlg-overlay";
        ov.innerHTML = `
        <div class="dv-modal gl-dlg">
            <div class="dv-modal-head"><h3 id="glResetT">حذف همه‌چیز</h3></div>
            <p class="gl-dlg-msg" id="glResetM">تمام کاربران، برنامه‌ها، سوابق تمرین و حرکات سفارشی از حافظه‌ی همین دستگاه پاک می‌شود و قابل بازگشت نیست.${baleOn ? "\n\nتوکن ربات و شناسه‌ی چت بله به‌طور پیش‌فرض روی این دستگاه می‌ماند؛ اگر می‌خواهی آن‌ها هم پاک شوند، گزینه‌ی زیر را بزن." : ""}</p>
            ${baleOn ? `<label class="gl-dlg-check"><input type="checkbox" id="glResetBale"><span>توکن ربات و شناسه‌ی چت بله هم پاک شود</span></label>` : ""}
            <label class="gl-dlg-field"><span>برای تأیید، کلمه‌ی «حذف» را بنویس</span>
                <input type="text" id="glResetInput" autocomplete="off" aria-describedby="glResetM"></label>
            <div class="pb-actions">
                <button type="button" class="danger-btn" id="glResetOk" disabled>حذف همه‌چیز</button>
                <button type="button" class="secondary-btn" id="glResetCancel">انصراف</button>
            </div>
        </div>`;
        const q = s => ov.querySelector(s);
        let done = false;
        const finish = v => { if (done) return; done = true; ov.remove(); resolve(v); };
        q("#glResetInput").addEventListener("input", e => { q("#glResetOk").disabled = e.target.value.trim() !== "حذف"; });
        q("#glResetOk").addEventListener("click", () => {
            if (q("#glResetInput").value.trim() !== "حذف") return;
            finish({ ok: true, clearBale: !!(q("#glResetBale") && q("#glResetBale").checked) });
        });
        q("#glResetCancel").addEventListener("click", () => finish({ ok: false }));
        ov.addEventListener("click", e => { if (e.target === ov) finish({ ok: false }); });
        document.body.appendChild(ov);
        glDialogAttach(ov, { alert: true, labelledby: "glResetT", describedby: "glResetM", initialFocus: q("#glResetInput"), onClose: () => finish({ ok: false }) });
    });
}

async function confirmFullReset() {
    const r = await askFullReset();
    if (!r.ok) return false;
    if (r.clearBale && typeof clearBaleSettings === "function") await clearBaleSettings();
    await fullResetStorage();
    location.reload();
    return true;
}

const clearBtn = document.getElementById("clearBtn");
if (clearBtn) clearBtn.addEventListener("click", confirmClearHistory);

const fullResetBtn = document.getElementById("fullResetBtn");
if (fullResetBtn) fullResetBtn.addEventListener("click", confirmFullReset);

/* =========================
Dark Mode
========================= */
function applyTheme(theme) {
    if (!themeToggleBtn) return;
    if (theme === "dark") {
        document.body.classList.add("dark-mode");
        themeToggleBtn.innerHTML = ico("sun") + "حالت روشن";
    } else {
        document.body.classList.remove("dark-mode");
        themeToggleBtn.innerHTML = ico("moon") + "حالت تاریک";
    }
}

/* تا وقتی کاربر دستی انتخاب نکرده، تم از prefers-color-scheme خوانده می‌شود */
const darkSchemeMq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
function getSavedTheme() {
    try {
        const t = localStorage.getItem("gymTrackerTheme");
        return t === "dark" || t === "light" ? t : null;
    } catch (e) { return null; }
}
applyTheme(getSavedTheme() || (darkSchemeMq && darkSchemeMq.matches ? "dark" : "light"));
if (darkSchemeMq) {
    const onSchemeChange = e => { if (!getSavedTheme()) applyTheme(e.matches ? "dark" : "light"); };
    if (darkSchemeMq.addEventListener) darkSchemeMq.addEventListener("change", onSchemeChange);
    else if (darkSchemeMq.addListener) darkSchemeMq.addListener(onSchemeChange);
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark-mode");
        const newTheme = isDark ? "light" : "dark";
        localStorage.setItem("gymTrackerTheme", newTheme);
        applyTheme(newTheme);
    });
}

/* =========================================================
   برنامه‌ی پیش‌فرض (استفاده در صفحه‌ی خوش‌آمدگویی داشبورد)
========================================================= */

function hasDefaultProgramPackage() {
    return (
        typeof defaultProgramPackage !== "undefined" &&
        defaultProgramPackage &&
        (defaultProgramPackage.programsRaw || defaultProgramPackage.catalogAdditions)
    );
}

/* بارگذاری برنامه‌ی پیش‌فرض: برنامه بلافاصله فعال می‌شود و رسانه در پس‌زمینه دانلود می‌شود */
let _defaultLoading = false;
async function loadDefaultProgram(btn) {
    if (_defaultLoading || !hasDefaultProgramPackage()) return;
    _defaultLoading = true;
    const label = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.textContent = "در حال بارگذاری…"; }
    try {
        const ok = await importProgramPackage(defaultProgramPackage);
        if (!ok) throw new Error("import failed");
        workoutPrograms = buildWorkoutPrograms(getEffectiveCatalog(), getEffectiveProgramsRaw());
        currentMonth = getLatestMonthKey();
        viewingMonth = currentMonth;
        applyDetectedSession(detectNextWeekAndSession(currentMonth));
        renderAll();
        showToast("برنامه‌ی پیش‌فرض آماده است. فایل‌های آموزشی در پس‌زمینه ذخیره می‌شوند.");
        switchView(typeof isWideCalendar === "function" && isWideCalendar() ? "dashboard" : "workout");
    } catch (err) {
        console.error("[GymLog] بارگذاری برنامه‌ی پیش‌فرض ناموفق بود:", err);
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
        _defaultLoading = false;
        showToast("بارگذاری برنامه انجام نشد. دوباره تلاش کن.", "warning");
        return;
    }
    _defaultLoading = false;
    syncAllMedia(true).then(t => {
        if (t && t.fail === 0 && (t.added || t.updated)) showToast("فایل‌های آموزشی برای استفاده‌ی آفلاین ذخیره شد.", "info");
        else if (t && t.fail > 0) showToast("بعضی فایل‌های آموزشی ذخیره نشد؛ بعداً با اینترنت دوباره تلاش می‌شود.", "warning");
    }).catch(() => {});
}

/* =========================
رندر کلی رابط کاربری
========================= */
function renderAll() {
    const hasAnyProgram = Object.keys(workoutPrograms).length > 0;
    if (emptyProgramState) emptyProgramState.style.display = hasAnyProgram ? "none" : "";
    if (programContent) programContent.style.display = hasAnyProgram ? "" : "none";
    if (!hasAnyProgram) return;

    renderSessionButtons();
    renderExercises();
    renderHistory();
    renderBackupWarning();
}

/* =====================================================
   راه‌اندازی هماهنگ برنامه پس از آماده‌سازی IndexedDB
===================================================== */
async function bootApp() {
    // 1. Wait for IndexedDB initialization & safe migration
    await initStorage();

    // 2. Refresh workoutPrograms from loaded stores
    workoutPrograms = buildWorkoutPrograms(
        getEffectiveCatalog(),
        getEffectiveProgramsRaw()
    );

    currentMonth = getLatestMonthKey();
    viewingMonth = currentMonth;

    // 3. Detect next session based on IndexedDB workout history
    const activeMonthForInit = currentMonth || getLatestMonthKey();
    if (activeMonthForInit) {
        applyDetectedSession(detectNextWeekAndSession(activeMonthForInit));
    }

    getFirstUseAt();
    renderAll();

    try {
        const flash = sessionStorage.getItem("gymFlash");
        if (flash) { sessionStorage.removeItem("gymFlash"); showToast(flash); }
    } catch (e) { /* ignore */ }

    // 4. ذخیره‌ی فایل‌های آموزشی برای آفلاین + جایگزینی فایل‌هایی که با همان نام عوض شده‌اند
    //    (درخواست «ذخیره‌ی پایدار» باعث می‌شود مرورگر کش را در کمبود فضا پاک نکند)
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
    }
    syncAllMedia(true).catch(() => {});

    // 5. ارسال معوق به بله (اگر دفعه‌ی قبل اینترنت نبود)
    if (typeof retryPendingBaleSync === "function") {
        retryPendingBaleSync().then(r => {
            if (r && r.ok) showToast("ارسال معوق پشتیبان به بله انجام شد.");
            if (typeof refreshBaleStatus === "function") refreshBaleStatus();
            renderBackupWarning();
        }).catch(() => {});
    }
}

bootApp().catch(err => {
    console.error("[GymLog Boot] خطا در اجرای اولیه برنامه:", err);
    renderAll();
});


/* =====================================================
   GymLog — تایمر استراحت بین ست‌ها

   با دکمه‌ی «⏱ استراحت» روی کارت هر حرکت شروع می‌شود و
   مقدار rest همان حرکت در برنامه را می‌خواند
   (برای بازه مثل «2–3 دقیقه» کران پایین؛ با ±۱۵ ثانیه تنظیم می‌شود).
   زمان بر اساس ساعت سیستم حساب می‌شود، پس با کندشدن تب هم دقیق می‌ماند.

   - تا وقتی تایمر در حال اجراست صفحه قفل نمی‌شود (Wake Lock).
   - در پایان: آلارم بلند و تکرارشونده + لرزش + چشمک‌زدن کادر تایمر
     تا کاربر «بستن» را بزند (حداکثر ۳۰ ثانیه).
===================================================== */
(function () {
    "use strict";

    const ALARM_MAX_BURSTS = 3;      // آلارم بعد از این تعداد هشدار خودبه‌خود قطع می‌شود
    const BURST_EVERY_MS = 2200;     // هر چند میلی‌ثانیه یک دسته بوق تکرار شود
    const BEEPS_PER_BURST = 4;

    let el = null, timeEl = null, labelEl = null, barEl = null;
    let endAt = 0, total = 0, tick = null, hideTimer = null, audioCtx = null, name = "";
    let alarmTimer = null, flashTimer = null;

    function build() {
        if (el) return;
        el = document.createElement("div");
        el.className = "rest-timer";
        el.hidden = true;
        el.setAttribute("role", "timer");
        el.innerHTML = `
            <div class="rest-timer-top">
                <span class="rest-timer-label"></span>
                <strong class="rest-timer-time">۰۰:۰۰</strong>
            </div>
            <div class="rest-timer-track"><i></i></div>
            <div class="rest-timer-actions">
                <button type="button" data-act="minus">−۱۵ ثانیه</button>
                <button type="button" data-act="plus">+۱۵ ثانیه</button>
                <button type="button" data-act="stop">بستن</button>
            </div>`;
        timeEl = el.querySelector(".rest-timer-time");
        labelEl = el.querySelector(".rest-timer-label");
        barEl = el.querySelector(".rest-timer-track i");
        el.addEventListener("click", e => {
            const btn = e.target.closest("[data-act]");
            if (!btn) return;
            if (btn.dataset.act === "stop") stop();
            else adjust(btn.dataset.act === "plus" ? 15 : -15);
        });
        document.body.appendChild(el);
    }

    function fmt(s) {
        const m = Math.floor(s / 60), r = s % 60;
        return toFa(String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0"));
    }

    function keepAwake(on) {
        if (typeof GymLogWakeLock === "undefined") return;
        if (on) GymLogWakeLock.request("timer");
        else GymLogWakeLock.release("timer");
    }

    function unlockAudio() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            audioCtx = audioCtx || new AC();
            if (audioCtx.state === "suspended") audioCtx.resume();
        } catch (e) { /* ignore */ }
    }

    /* یک دسته بوق بلند: موج مربعی (واضح‌تر از سینوسی) با دو فرکانس متناوب */
    function beepBurst() {
        try {
            unlockAudio();
            if (!audioCtx) return;

            const master = audioCtx.createGain();
            master.gain.value = 1;
            let out = master;
            if (audioCtx.createDynamicsCompressor) {
                const comp = audioCtx.createDynamicsCompressor();
                master.connect(comp);
                comp.connect(audioCtx.destination);
            } else {
                master.connect(audioCtx.destination);
            }

            const t0 = audioCtx.currentTime + 0.02;
            for (let i = 0; i < BEEPS_PER_BURST; i++) {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                const at = t0 + i * 0.28;
                o.type = "square";
                o.frequency.value = i % 2 === 0 ? 988 : 1319;
                o.connect(g);
                g.connect(out);
                g.gain.setValueAtTime(0.0001, at);
                g.gain.exponentialRampToValueAtTime(0.9, at + 0.015);
                g.gain.setValueAtTime(0.9, at + 0.17);
                g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
                o.start(at);
                o.stop(at + 0.24);
            }
        } catch (e) { /* ignore */ }
    }

    function vibrate() {
        try {
            if (navigator.vibrate) navigator.vibrate([500, 150, 500, 150, 500, 150, 500]);
        } catch (e) { /* ignore */ }
    }

    function startAlarm() {
        stopAlarm();
        let bursts = 0;
        const fire = () => {
            bursts += 1;
            beepBurst();
            vibrate();
        };
        fire();
        alarmTimer = setInterval(() => {
            /* بعد از آخرین هشدار (و تمام‌شدن صدای آن) آلارم و تایمر بسته می‌شوند */
            if (bursts >= ALARM_MAX_BURSTS) { stop(); return; }
            fire();
        }, BURST_EVERY_MS);

        /* چشمک‌زدن کادر تایمر تا حتی بدون صدا هم دیده شود */
        let on = false;
        flashTimer = setInterval(() => {
            on = !on;
            if (!el) return;
            el.style.background = on ? "#16a34a" : "";
            el.style.color = on ? "#ffffff" : "";
            if (timeEl) timeEl.style.color = on ? "#ffffff" : "";
            if (labelEl) labelEl.style.color = on ? "#ffffff" : "";
        }, 450);
    }

    function stopAlarm() {
        clearInterval(alarmTimer); alarmTimer = null;
        clearInterval(flashTimer); flashTimer = null;
        try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) { /* ignore */ }
        if (el) {
            el.style.background = "";
            el.style.color = "";
        }
        if (timeEl) timeEl.style.color = "";
        if (labelEl) labelEl.style.color = "";
    }

    function update() {
        const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        timeEl.textContent = fmt(left);
        barEl.style.width = (total > 0 ? Math.min(100, ((total - left) / total) * 100) : 100) + "%";
        if (left <= 0) finish();
    }

    function finish() {
        clearInterval(tick); tick = null;
        el.classList.add("done");
        labelEl.textContent = "استراحت تمام شد — ست بعدی!";
        clearTimeout(hideTimer);
        startAlarm();
        /* صفحه تا وقتی کاربر آلارم را ببیند روشن می‌ماند؛ با stop() آزاد می‌شود */
    }

    function start(seconds, exerciseName) {
        build();
        unlockAudio();           // باید داخل کلیک کاربر اجرا شود تا مرورگر صدا را مجاز کند
        stopAlarm();
        clearInterval(tick); clearTimeout(hideTimer);
        name = exerciseName || "";
        total = seconds;
        endAt = Date.now() + seconds * 1000;
        el.classList.remove("done");
        labelEl.textContent = "استراحت" + (name ? " · " + name : "");
        el.hidden = false;
        keepAwake(true);
        update();
        tick = setInterval(update, 250);
    }

    function adjust(delta) {
        if (!el || el.hidden) return;
        if (el.classList.contains("done")) {
            if (delta > 0) start(delta, name);
            else stop();
            return;
        }
        endAt += delta * 1000;
        total = Math.max(1, total + delta);
        update();
    }

    function stop() {
        clearInterval(tick); tick = null;
        clearTimeout(hideTimer);
        stopAlarm();
        keepAwake(false);
        if (el) { el.hidden = true; el.classList.remove("done"); }
    }

    document.addEventListener("click", e => {
        const btn = e.target.closest(".exercise-rest-btn");
        if (!btn) return;
        const sec = Number(btn.dataset.seconds);
        if (sec > 0) start(sec, btn.dataset.exerciseName);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            if (tick) update();
            unlockAudio();
        }
    });
})();
