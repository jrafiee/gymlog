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
const openExerciseBankBtn = document.getElementById("openExerciseBankBtn");
const backupWarningBanner = document.getElementById("backupWarningBanner");
const backupWarningDetail = document.getElementById("backupWarningDetail");
const backupWarningBtn = document.getElementById("backupWarningBtn");

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

/* =========================================================
   مدیریت دکمه Back و بازگشت لایه‌ای مودال‌ها
========================================================= */

function openSettingsPage() {
    if (!settingsPage) return;
    settingsPage.style.display = "";
    history.pushState({ modal: "settings" }, "");
    document.addEventListener("keydown", closeSettingsWithEscape);
}

function closeSettingsPage(fromPopstate = false) {
    if (!settingsPage || settingsPage.style.display === "none") return;
    settingsPage.style.display = "none";
    document.removeEventListener("keydown", closeSettingsWithEscape);

    if (!fromPopstate && history.state && history.state.modal === "settings") {
        history.back();
    }
}

function closeSettingsWithEscape(event) {
    if (event.key === "Escape") {
        closeSettingsPage();
    }
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

    // ۳. صفحه بانک حرکات
    const bankOverlay = document.querySelector(".exercise-bank-overlay");
    if (bankOverlay) {
        bankOverlay.remove();
        return;
    }

    // ۴. صفحه برنامه‌های من
    const myProgramsOverlay = document.querySelector(".my-programs-overlay");
    if (myProgramsOverlay) {
        myProgramsOverlay.remove();
        return;
    }

    // ۵. منوی تنظیمات
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

/* جدول ساختاریافته‌ی یک جلسه از برنامه (هم در صفحه‌ی برنامه‌ها و هم در «برنامه‌های من») */
function buildProgramSessionTableHtml(session, key) {
    const exercises = session.exercises || [];
    const rows = exercises.map((e, i) => {
        const reps = String(e.target || "").replace(/^\s*[\d۰-۹]+\s*[×xX*]\s*/, "");
        return `
            <tr>
                <td class="dv-prog-idx">${(i + 1).toLocaleString("fa-IR")}</td>
                <td class="dv-prog-name">${e.name}</td>
                <td>${Number(e.sets).toLocaleString("fa-IR")}</td>
                <td class="dv-prog-reps">${reps}</td>
                <td>${e.rest || "—"}</td>
            </tr>`;
    }).join("");

    return `
        <div class="dv-prog-session">
            <div class="dv-prog-session-head">
                <span class="dv-prog-session-num">جلسه ${Number(key).toLocaleString("fa-IR")}</span>
                <h4>${session.title}</h4>
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
                        ${month.title}
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
                <h2>برنامه‌های من</h2>
                <button type="button" class="exercise-guide-close my-programs-close" aria-label="بستن">×</button>
            </div>
            <div class="my-programs-list">${listHtml}</div>
        </div>
    `;

    function closeOverlay() {
        if (history.state && history.state.modal === "myPrograms") {
            history.back();
        } else {
            overlay.remove();
        }
    }

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
}

if (openMyProgramsBtn) {
    openMyProgramsBtn.addEventListener("click", showMyProgramsPage);
}

/* =========================================================
   بانک حرکات به صورت دسته‌بندی‌شده
========================================================= */

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

function showExerciseBankPage() {
    const catalog = getEffectiveCatalog();
    const exerciseKeys = Object.keys(catalog);

    if (exerciseKeys.length === 0) {
        alert("هیچ حرکتی در کاتالوگ یافت نشد.");
        return;
    }

    history.pushState({ modal: "exerciseBank" }, "");

    const groups = {};
    exerciseKeys.forEach(key => {
        const item = catalog[key];
        const category = EXERCISE_CATEGORIES_MAP[key] || item.category || "سایر حرکات";
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category].push({ key, ...item });
    });

    const categoryOrder = ["سینه", "پشت", "سرشانه", "جلو بازو", "پشت بازو", "پا", "شکم"];
    const sortedCategories = Object.keys(groups).sort((a, b) => {
        const idxA = categoryOrder.indexOf(a);
        const idxB = categoryOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b, "fa");
    });

    let groupsHtml = "";
    sortedCategories.forEach(catName => {
        const exercises = groups[catName];
        const itemsHtml = exercises.map(item => {
            const hasImg = item.images && item.images.length > 0 && !item.images[0].endsWith(".mp4");
            const thumbHtml = hasImg
                ? `<img src="${item.images[0]}" alt="${item.name}" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'exercise-bank-thumb-placeholder\\'>🏋️</span>'">`
                : `<span class="exercise-bank-thumb-placeholder">🏋️</span>`;

            return `
                <div class="exercise-bank-item" data-exercise-id="${item.key}">
                    <div class="exercise-bank-thumb">
                        ${thumbHtml}
                    </div>
                    <div class="exercise-bank-info">
                        <h3 class="exercise-bank-name">${item.name}</h3>
                        <p class="exercise-bank-id">${item.key}</p>
                    </div>
                </div>
            `;
        }).join("");

        groupsHtml += `
            <div class="exercise-bank-category-group collapsed">
                <button type="button" class="exercise-bank-category-header" aria-expanded="false">
                    <div class="exercise-bank-category-title">
                        <span class="exercise-bank-category-badge">${catName}</span>
                        <span class="exercise-bank-category-count">${exercises.length} حرکت</span>
                    </div>
                    <span class="exercise-bank-category-arrow">▾</span>
                </button>
                <div class="exercise-bank-category-items">
                    ${itemsHtml}
                </div>
            </div>
        `;
    });

    const overlay = document.createElement("div");
    overlay.className = "exercise-bank-overlay";
    overlay.innerHTML = `
        <div class="exercise-bank-page">
            <div class="exercise-bank-header">
                <h2>بانک حرکات</h2>
                <button type="button" class="exercise-guide-close exercise-bank-close" aria-label="بستن">×</button>
            </div>
            <div class="exercise-bank-list">
                ${groupsHtml}
            </div>
        </div>
    `;

    function closeBank() {
        if (history.state && history.state.modal === "exerciseBank") {
            history.back();
        } else {
            overlay.remove();
        }
    }

    overlay.querySelector(".exercise-bank-close").addEventListener("click", closeBank);

    overlay.querySelectorAll(".exercise-bank-category-header").forEach(header => {
        header.addEventListener("click", () => {
            const group = header.closest(".exercise-bank-category-group");
            const isCollapsed = group.classList.contains("collapsed");
            group.classList.toggle("collapsed");
            header.setAttribute("aria-expanded", isCollapsed ? "true" : "false");
        });
    });

    overlay.querySelectorAll(".exercise-bank-item").forEach(card => {
        card.addEventListener("click", () => {
            const exId = card.dataset.exerciseId;
            showExerciseGuide(exId);
        });
    });

    document.body.appendChild(overlay);
}

if (openExerciseBankBtn) {
    openExerciseBankBtn.addEventListener("click", showExerciseBankPage);
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
            <strong>جلسه ${session}</strong>
            <span>${sessions[session].title}</span>
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

    program.exercises.forEach((exercise, index) => {
        const previousExercise = previous?.exercises?.find(item => item.id === exercise.id);
        const currentExercise = currentWorkout?.exercises?.find(item => item.id === exercise.id);

        const card = document.createElement("section");
        card.className = "exercise-card";
        card.innerHTML = `
            <div class="exercise-header">
                <div class="exercise-title">
                    <div class="exercise-number">${index + 1}</div>
                    <div>
                        <h2>${exercise.name}</h2>
                        <div class="exercise-meta">
                            هدف: ${exercise.target} &nbsp; | &nbsp; استراحت: ${exercise.rest}
                        </div>
                    </div>
                </div>
                <button type="button" class="exercise-help-btn" data-exercise-id="${exercise.id}">
                    🖼 نحوه اجرا
                </button>
                <button type="button" class="exercise-history-btn" data-exercise-id="${exercise.id}">
                    📈 سابقه حرکت
                </button>
            </div>
            <div class="sets-container" data-exercise="${exercise.id}">
                ${createSetRows(exercise, previousExercise, currentExercise)}
            </div>
        `;
        exerciseList.appendChild(card);
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
        const hasData = exercise.sets?.some(set => set.weight !== "" || set.reps !== "");
        if (!hasData) return;

        history.push({
            date: workout.date,
            week: workout.week,
            month: workout.month,
            session: workout.session,
            sets: exercise.sets
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
                            <span>هفته ${record.week} | جلسه ${record.session}</span>
                        </div>
                        <div class="exercise-history-sets">
                            ${formatHistorySets(record.sets)}
                        </div>
                    </div>
                `).join("")}
            </div>
        `;

    overlay.innerHTML = `
        <div class="exercise-guide-modal">
            <div class="exercise-guide-header">
                <h2>سابقه — ${exercise.name}</h2>
                <button type="button" class="exercise-guide-close" aria-label="بستن">×</button>
            </div>
            ${historyHtml}
            <button type="button" class="primary-btn exercise-guide-done">بستن</button>
        </div>
    `;

    function closeOverlay() {
        if (history.state && history.state.modal === "exerciseHistory") {
            history.back();
        } else {
            overlay.remove();
        }
    }

    overlay.querySelector(".exercise-guide-close").addEventListener("click", closeOverlay);
    overlay.querySelector(".exercise-guide-done").addEventListener("click", closeOverlay);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeOverlay(); });

    document.body.appendChild(overlay);
}

function formatHistorySets(sets) {
    if (!sets || sets.length === 0) return "—";
    return sets.map(set => {
        if (set.weight === "" && set.reps === "") return "—";
        return `<span class="history-set">${set.weight || "—"}kg × ${set.reps || "—"}</span>`;
    }).join("");
}

/* =========================
رسانه و راهنمای حرکت
========================= */
function createExerciseMedia(mediaPath, exerciseName) {
    const extension = mediaPath.split("?")[0].split(".").pop().toLowerCase();
    if (extension === "mp4") {
        return `
            <video class="exercise-guide-video" controls playsinline muted loop preload="metadata" onerror="handleExerciseMediaError(this)">
                <source src="${mediaPath}" type="video/mp4">
                مرورگر شما از پخش ویدئو پشتیبانی نمی‌کند.
            </video>
        `;
    }
    return `
        <img class="exercise-guide-image" src="${mediaPath}" alt="${exerciseName}" loading="lazy" onerror="handleExerciseMediaError(this)">
    `;
}

function handleExerciseMediaError(element) {
    const fallback = document.createElement("div");
    fallback.className = "exercise-guide-no-image";
    fallback.textContent = "فایل تصویر/ویدیوی این حرکت پیدا نشد.";
    element.replaceWith(fallback);
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
        ? `<ul class="exercise-guide-instructions">${instructions.map(inst => `<li>${inst}</li>`).join("")}</ul>`
        : "";

    const overlay = document.createElement("div");
    overlay.className = "exercise-guide-overlay";
    overlay.innerHTML = `
        <div class="exercise-guide-modal">
            <div class="exercise-guide-header">
                <h2>${exercise.name}</h2>
                <button type="button" class="exercise-guide-close" aria-label="بستن">×</button>
            </div>
            ${imagesHtml}
            ${instructionsHtml}
            <button type="button" class="primary-btn exercise-guide-done">بستن</button>
        </div>
    `;

    function closeOverlay() {
        if (history.state && history.state.modal === "exerciseGuide") {
            history.back();
        } else {
            overlay.remove();
        }
    }

    overlay.querySelector(".exercise-guide-close").addEventListener("click", closeOverlay);
    overlay.querySelector(".exercise-guide-done").addEventListener("click", closeOverlay);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeOverlay(); });

    document.body.appendChild(overlay);
}

/* =========================
ساخت ست‌ها
========================= */
function createSetRows(exercise, previousExercise, currentExercise) {
    let html = "";
    for (let i = 0; i < exercise.sets; i++) {
        const previousSet = previousExercise?.sets?.[i];
        const currentSet = currentExercise?.sets?.[i];
        const currentWeight = currentSet?.weight || "";
        const currentReps = currentSet?.reps || "";

        html += `
            <div class="set-row" data-set="${i}">
                <div class="set-label">ست ${i + 1}</div>
                <div>
                    <input type="number" class="weight-input" placeholder="وزنه (kg)" min="0" step="0.5" inputmode="decimal" value="${currentWeight}">
                </div>
                <div>
                    <input type="number" class="reps-input" placeholder="تکرار" min="0" step="1" inputmode="numeric" value="${currentReps}">
                </div>
                <div class="set-difference">
                    ${previousSet && (previousSet.weight || previousSet.reps)
                        ? `جلسه قبل: ${previousSet.weight || "—"}kg × ${previousSet.reps || "—"}`
                        : ""}
                </div>
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

    document.querySelectorAll(".sets-container").forEach(container => {
        const exerciseId = container.dataset.exercise;
        const sets = [];
        container.querySelectorAll(".set-row").forEach(row => {
            const weight = row.querySelector(".weight-input").value;
            const reps = row.querySelector(".reps-input").value;
            sets.push({ weight, reps });
        });
        result.exercises.push({ id: exerciseId, sets });
    });

    return result;
}

function workoutHasData(workout) {
    return workout.exercises.some(exercise =>
        exercise.sets.some(set => set.weight !== "" || set.reps !== "")
    );
}

async function autoSaveWorkout() {
    if (!workoutDate.value || viewingMonth !== currentMonth) return false;
    const workout = collectWorkout();
    if (!workoutHasData(workout)) return false;

    // Preserves existing ID if record exists
    const existing = getCurrentSavedWorkout();
    if (existing && existing.id) {
        workout.id = existing.id;
    }

    await addWorkout(workout);
    return true;
}

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
        alert("تبریک! هفته چهارم و پایان این دوره تمرینی را با موفقیت تمام کردید.");
        return;
    }

    keepSelectedWeek = true;
    renderAll();
    keepSelectedWeek = false;
}

if (finishWorkoutBtn) {
    finishWorkoutBtn.addEventListener("click", async () => {
        if (viewingMonth !== currentMonth) {
            alert("برنامه‌های قبلی فقط برای مشاهده هستند.");
            return;
        }
        const workout = collectWorkout();
        if (!workoutHasData(workout)) {
            alert("هنوز اطلاعاتی برای این جلسه ثبت نشده است.");
            return;
        }

        // ۱) عملیات اصلی: ذخیره قطعی در پایگاه‌داده IndexedDB
        let saved = false;
        try {
            saved = await autoSaveWorkout();
        } catch (error) {
            console.error("خطا در ذخیره‌ی جلسه:", error);
        }

        if (!saved) {
            alert("ذخیره‌ی جلسه در پایگاه داده انجام نشد. دوباره تلاش کن.");
            return;
        }

        // ۲) عملیات ثانویه: پشتیبان خودکار
        let backupOk = false;
        try {
            backupOk = exportData({ fileName: buildBackupFileName() }) === true;
        } catch (error) {
            console.error("خطا در پشتیبان خودکار:", error);
        }

        // ۳) پیام نتیجه و رفتن به جلسه‌ی بعد
        if (backupOk) {
            showToast("جلسه با موفقیت در IndexedDB ذخیره شد و نسخه پشتیبان تهیه گردید.");
            renderBackupWarning();
        } else {
            showToast("جلسه در IndexedDB ذخیره شد، اما تهیه خودکار فایل پشتیبان انجام نشد.", "warning");
        }

        goToNextWorkout();
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
    volumeChange.textContent = `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/* =========================
تقویم انتخاب تاریخ
========================= */
const PERSIAN_WEEKDAY_LABELS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const PERSIAN_MONTH_NAMES = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
];

function getWorkoutDatesSet() {
    return new Set(getWorkouts().map(workout => workout.date));
}

function buildDatePickerGrid(jy, jm, selectedIso, todayIso, workoutDatesSet) {
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

        cellsHtml += `
            <button type="button" class="${classes.join(" ")}" data-iso="${iso}">
                <span class="date-picker-day-circle">${day}</span>
            </button>
        `;
    });
    return cellsHtml;
}

function showDatePickerCalendar() {
    const todayIso = getToday();
    const selectedIso = workoutDate.value || todayIso;
    const workoutDatesSet = getWorkoutDatesSet();
    const view = isoToJalali(selectedIso);

    history.pushState({ modal: "datePicker" }, "");

    const overlay = document.createElement("div");
    overlay.className = "date-picker-overlay";

    function closeOverlay() {
        if (history.state && history.state.modal === "datePicker") {
            history.back();
        } else {
            overlay.remove();
        }
    }

    function render() {
        overlay.innerHTML = `
            <div class="date-picker-modal">
                <div class="date-picker-header">
                    <button type="button" class="date-picker-nav" data-dir="prev" aria-label="ماه قبل">‹</button>
                    <h3>${PERSIAN_MONTH_NAMES[view.jm - 1]} ${view.jy}</h3>
                    <button type="button" class="date-picker-nav" data-dir="next" aria-label="ماه بعد">›</button>
                </div>
                <div class="date-picker-weekdays">
                    ${PERSIAN_WEEKDAY_LABELS.slice().reverse().map(label => `<span>${label}</span>`).join("")}
                </div>
                <div class="date-picker-grid">
                    ${buildDatePickerGrid(view.jy, view.jm, selectedIso, todayIso, workoutDatesSet)}
                </div>
                <div class="date-picker-legend">
                    <span class="date-picker-legend-circle"></span> روزهایی که تمرین ثبت شده
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

function attachInputEvents() {
    document.querySelectorAll(".weight-input, .reps-input").forEach(input => {
        input.addEventListener("input", () => {
            updateSummary();
            autoSaveWorkout();
        });
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
                change = `${percent > 0 ? "+" : ""}${Math.round(percent * 10) / 10}%`;
            }
        }

        html += `
            <tr>
                <td>${formatPersianDate(workout.date)}</td>
                <td>هفته ${workout.week}</td>
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

const MEDIA_CACHE_NAME = "gym-media-v1";

function collectProgramAssetUrls(programsRaw, catalog) {
    const urls = new Set();
    Object.values(programsRaw || {}).forEach(month => {
        Object.values(month.sessions || {}).forEach(session => {
            (session.exercises || []).forEach(exercise => {
                const entry = catalog[exercise.id];
                ((entry && entry.images) || []).forEach(path => {
                    try {
                        urls.add(new URL(path, location.href).href);
                    } catch (e) { /* مسیر نامعتبر */ }
                });
            });
        });
    });
    return Array.from(urls);
}

async function cacheProgramAssets(programsRaw, catalog) {
    if (!("caches" in window)) return { ok: 0, fail: 0 };
    const urls = collectProgramAssetUrls(programsRaw, catalog);
    const cache = await caches.open(MEDIA_CACHE_NAME);
    let ok = 0;
    let fail = 0;

    await Promise.all(urls.map(async url => {
        try {
            if (await cache.match(url)) { ok += 1; return; }
            const response = await fetch(url, { cache: "reload" });
            if (response.ok && response.status === 200) {
                await cache.put(url, response);
                ok += 1;
            } else {
                fail += 1;
            }
        } catch (e) {
            fail += 1;
        }
    }));

    return { ok, fail };
}

async function cacheAndReport(message) {
    let note = "";
    try {
        const result = await cacheProgramAssets(getEffectiveProgramsRaw(), getEffectiveCatalog());
        if (result.fail > 0) {
            note = "\n\nبعضی فایل‌های آموزشی ذخیره نشد. یک بار با اینترنت برنامه را باز کن تا تکمیل شود.";
        } else if (result.ok > 0) {
            note = "\n\nفایل‌های آموزشی برای استفاده‌ی آفلاین ذخیره شد.";
        }
    } catch (e) {
        console.error(e);
    }
    alert(message + note);
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
            alert("فایل معتبر نیست (JSON قابل خواندن نیست).");
            return;
        }

        try {
            // restoreBackup supports both new versioned schema and legacy format
            const res = await restoreBackup(data);
            if (res.type === "program") {
                await cacheAndReport("برنامه با موفقیت اضافه شد.");
            } else {
                await cacheAndReport("پشتیبان با موفقیت در IndexedDB بازیابی شد.");
            }
            location.reload();
        } catch (err) {
            console.error("خطا در بازیابی فایل:", err);
            alert("خطا در بازیابی فایل: " + (err.message || "فایل نامعتبر است."));
        }
    };
    reader.readAsText(file);
}

const clearBtn = document.getElementById("clearBtn");
if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
        if (confirm("تاریخچه‌ی تمرین‌ها حذف شود؟ برنامه‌ی تمرینی دست‌نخورده می‌ماند.")) {
            await deleteAllData();
            renderAll();
            showToast("تاریخچه تمرینات پاک شد.");
        }
    });
}

const fullResetBtn = document.getElementById("fullResetBtn");
if (fullResetBtn) {
    fullResetBtn.addEventListener("click", async () => {
        if (confirm("همه‌چیز حذف شود؟ برنامه به حالت اولیه بازمی‌گردد.")) {
            await fullResetStorage();
            location.reload();
        }
    });
}

/* =========================
Dark Mode
========================= */
function applyTheme(theme) {
    if (!themeToggleBtn) return;
    if (theme === "dark") {
        document.body.classList.add("dark-mode");
        themeToggleBtn.textContent = "☀️ حالت روشن";
    } else {
        document.body.classList.remove("dark-mode");
        themeToggleBtn.textContent = "🌙 حالت تاریک";
    }
}

const savedTheme = localStorage.getItem("gymTrackerTheme");
applyTheme(savedTheme === "dark" ? "dark" : "light");

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark-mode");
        const newTheme = isDark ? "light" : "dark";
        localStorage.setItem("gymTrackerTheme", newTheme);
        applyTheme(newTheme);
    });
}

/* =========================================================
   پیشنهاد برنامه‌ی پیش‌فرض هنگام اولین اجرا
========================================================= */

function hasDefaultProgramPackage() {
    return (
        typeof defaultProgramPackage !== "undefined" &&
        defaultProgramPackage &&
        (defaultProgramPackage.programsRaw || defaultProgramPackage.catalogAdditions)
    );
}

function maybeShowDefaultProgramSuggestion() {
    const suggestion = document.getElementById("defaultProgramSuggestion");
    if (!suggestion) return;
    suggestion.style.display = hasDefaultProgramPackage() ? "" : "none";
}

const onboardingUploadBtn = document.getElementById("onboardingUploadBtn");
if (onboardingUploadBtn) {
    onboardingUploadBtn.addEventListener("click", () => {
        const input = document.getElementById("programImportInput");
        if (input) input.click();
    });
}

const loadDefaultProgramBtn = document.getElementById("loadDefaultProgramBtn");
if (loadDefaultProgramBtn) {
    loadDefaultProgramBtn.addEventListener("click", async () => {
        await importProgramPackage(defaultProgramPackage);
        await cacheAndReport("برنامه‌ی پیش‌فرض با موفقیت بارگذاری شد.");
        location.reload();
    });
}

/* =========================
رندر کلی رابط کاربری
========================= */
function renderAll() {
    const hasAnyProgram = Object.keys(workoutPrograms).length > 0;
    if (emptyProgramState) emptyProgramState.style.display = hasAnyProgram ? "none" : "";
    if (programContent) programContent.style.display = hasAnyProgram ? "" : "none";
    if (!hasAnyProgram) {
        maybeShowDefaultProgramSuggestion();
        return;
    }

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
        const detected = detectNextWeekAndSession(activeMonthForInit);
        currentSession = detected.session;
        if (weekNumber) {
            weekNumber.value = detected.week;
        }
    }

    getFirstUseAt();
    renderAll();

    // 4. Background asset caching for offline usage
    if (navigator.onLine) {
        cacheProgramAssets(getEffectiveProgramsRaw(), getEffectiveCatalog()).catch(() => {});
    }
}

bootApp().catch(err => {
    console.error("[GymLog Boot] خطا در اجرای اولیه برنامه:", err);
    renderAll();
});
