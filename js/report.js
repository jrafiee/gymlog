/* =====================================================
   گزارش گروه‌های عضلانی

   این فایل به exerciseCatalog (از exercise-catalog.js)
   و به توابع storage.js (getWorkouts, getEffectiveCatalog)
   نیاز دارد.
===================================================== */

const CATEGORY_MAP = {
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

const CATEGORY_ORDER = ["سینه", "پشت", "سرشانه", "جلو بازو", "پشت بازو", "پا", "شکم"];

const CATEGORY_COLORS = {
    "سینه": "#f97316",
    "پشت": "#0ea5e9",
    "سرشانه": "#8b5cf6",
    "جلو بازو": "#22c55e",
    "پشت بازو": "#eab308",
    "پا": "#ec4899",
    "شکم": "#14b8a6",
    "سایر": "#9ca3af"
};

const WEEKLY_LOW_THRESHOLD = 6;
const WEEKLY_OK_THRESHOLD = 10;
const WEEKLY_HIGH_THRESHOLD = 20;

/* =========================
   منبع داده: دستگاه یا فایل آپلودی
========================= */
let usingUploadedBackup = false;
let uploadedWorkouts = [];
let uploadedCatalogOverrides = {};

function getReportWorkouts() {
    return usingUploadedBackup ? uploadedWorkouts : getWorkouts();
}

function getReportCatalog() {
    if (usingUploadedBackup) {
        return { ...exerciseCatalog, ...uploadedCatalogOverrides };
    }
    return getEffectiveCatalog();
}

function resolveCategory(exerciseId, catalog) {
    const entry = catalog[exerciseId];
    if (entry && entry.category && CATEGORY_COLORS[entry.category]) return entry.category;
    if (CATEGORY_MAP[exerciseId]) return CATEGORY_MAP[exerciseId];
    return "سایر";
}

function resolveExerciseName(exerciseId, catalog) {
    const entry = catalog[exerciseId];
    return entry ? entry.name : exerciseId;
}

/* =========================
   عناصر صفحه
========================= */
const dataSourceLabel = document.getElementById("dataSourceLabel");
const dataSourceDetail = document.getElementById("dataSourceDetail");
const reportBackupInput = document.getElementById("reportBackupInput");
const useDeviceDataBtn = document.getElementById("useDeviceDataBtn");
const reportEmptyState = document.getElementById("reportEmptyState");
const reportContent = document.getElementById("reportContent");
const rangePills = document.getElementById("rangePills");
const heroTotalVolume = document.getElementById("heroTotalVolume");
const heroSessionCount = document.getElementById("heroSessionCount");
const heroSetCount = document.getElementById("heroSetCount");
const radarChartWrap = document.getElementById("radarChartWrap");
const radarLegend = document.getElementById("radarLegend");
const thresholdLabel = document.getElementById("thresholdLabel");
const categoryTableBody = document.getElementById("categoryTableBody");
const categoryCards = document.getElementById("categoryCards");
const backToAppBtn = document.getElementById("backToAppBtn");
const reportThemeToggleBtn = document.getElementById("reportThemeToggleBtn");

let currentRange = "7";
let sortState = { key: "sets", dir: "desc" };

/* =========================
   تاریخ
========================= */
function getTodayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function addDaysIso(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + days);
    const yy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
}

function daysBetweenIso(startIso, endIso) {
    const [y1, m1, d1] = startIso.split("-").map(Number);
    const [y2, m2, d2] = endIso.split("-").map(Number);
    const t1 = new Date(y1, m1 - 1, d1).getTime();
    const t2 = new Date(y2, m2 - 1, d2).getTime();
    return Math.round((t2 - t1) / 86400000);
}

function faNum(n) {
    return Math.round(n).toLocaleString("fa-IR");
}

/* =========================
   محاسبه‌ی بازه
========================= */
function getPeriodRange(rangeKey, workouts) {
    const today = getTodayIso();

    if (rangeKey === "all") {
        if (workouts.length === 0) return { startIso: today, endIso: today, prevStartIso: null, prevEndIso: null };
        const dates = workouts.map(w => w.date).sort();
        const startIso = dates[0];
        return { startIso, endIso: today, prevStartIso: null, prevEndIso: null };
    }

    const days = Number(rangeKey);
    const startIso = addDaysIso(today, -(days - 1));
    const prevEndIso = addDaysIso(startIso, -1);
    const prevStartIso = addDaysIso(prevEndIso, -(days - 1));

    return { startIso, endIso: today, prevStartIso, prevEndIso };
}

function filterWorkoutsByRange(workouts, startIso, endIso) {
    return workouts.filter(w => w.date >= startIso && w.date <= endIso);
}

/* =========================
   محاسبه‌ی آمار هر گروه عضلانی
========================= */
function computeCategoryStats(workoutsInRange, catalog) {
    const stats = {};
    CATEGORY_ORDER.forEach(cat => {
        stats[cat] = { category: cat, sets: 0, volume: 0, exercises: {} };
    });

    workoutsInRange.forEach(workout => {
        (workout.exercises || []).forEach(exercise => {
            const category = resolveCategory(exercise.id, catalog);
            if (!stats[category]) {
                stats[category] = { category, sets: 0, volume: 0, exercises: {} };
            }
            (exercise.sets || []).forEach(set => {
                const hasWeight = set.weight !== "" && set.weight !== undefined && set.weight !== null;
                const hasReps = set.reps !== "" && set.reps !== undefined && set.reps !== null;
                if (!hasWeight && !hasReps) return;

                stats[category].sets += 1;

                const w = parseFloat(set.weight);
                const r = parseFloat(set.reps);
                if (!isNaN(w) && !isNaN(r)) {
                    stats[category].volume += w * r;
                }

                if (!stats[category].exercises[exercise.id]) {
                    stats[category].exercises[exercise.id] = 0;
                }
                stats[category].exercises[exercise.id] += 1;
            });
        });
    });

    return stats;
}

function computeWeeklyRate(sets, startIso, endIso) {
    const spanDays = Math.max(1, daysBetweenIso(startIso, endIso) + 1);
    const weeks = spanDays / 7;
    return sets / weeks;
}

function statusForRate(rate) {
    if (rate <= 0) return { key: "none", label: "بدون تمرین" };
    if (rate < WEEKLY_LOW_THRESHOLD) return { key: "low", label: "نیاز به تمرین بیشتر" };
    if (rate < WEEKLY_OK_THRESHOLD) return { key: "borderline", label: "نزدیک به کافی" };
    if (rate <= WEEKLY_HIGH_THRESHOLD) return { key: "ok", label: "حجم مناسب" };
    return { key: "high", label: "حجم بالا" };
}

/* =========================
   ساخت داده‌ی نهایی گزارش
========================= */
function buildReport() {
    const workouts = getReportWorkouts();
    const catalog = getReportCatalog();

    const hasAnyData = workouts.some(w =>
        (w.exercises || []).some(ex =>
            (ex.sets || []).some(s => s.weight !== "" || s.reps !== "")
        )
    );

    if (!hasAnyData) {
        reportEmptyState.style.display = "";
        reportContent.style.display = "none";
        return;
    }

    reportEmptyState.style.display = "none";
    reportContent.style.display = "";

    const { startIso, endIso, prevStartIso, prevEndIso } = getPeriodRange(currentRange, workouts);

    const currentWorkouts = filterWorkoutsByRange(workouts, startIso, endIso);
    const currentStats = computeCategoryStats(currentWorkouts, catalog);

    let prevStats = null;
    if (prevStartIso) {
        const prevWorkouts = filterWorkoutsByRange(workouts, prevStartIso, prevEndIso);
        prevStats = computeCategoryStats(prevWorkouts, catalog);
    }

    const rows = Object.keys(currentStats).map(cat => {
        const s = currentStats[cat];
        const rate = computeWeeklyRate(s.sets, startIso, endIso);
        const status = statusForRate(rate);

        let trendPercent = null;
        if (prevStats && prevStats[cat]) {
            const prevVolume = prevStats[cat].volume;
            if (prevVolume > 0) {
                trendPercent = ((s.volume - prevVolume) / prevVolume) * 100;
            } else if (s.volume > 0) {
                trendPercent = null;
            }
        }

        const topExercises = Object.keys(s.exercises)
            .map(id => ({ id, name: resolveExerciseName(id, catalog), sets: s.exercises[id] }))
            .sort((a, b) => b.sets - a.sets)
            .slice(0, 3);

        return {
            category: cat,
            sets: s.sets,
            volume: s.volume,
            rate,
            status,
            trendPercent,
            isNew: prevStats && (!prevStats[cat] || prevStats[cat].volume === 0) && s.volume > 0,
            topExercises
        };
    });

    rows.sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a.category);
        const ib = CATEGORY_ORDER.indexOf(b.category);
        if (ia === -1 && ib === -1) return a.category.localeCompare(b.category, "fa");
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    renderHero(currentWorkouts, rows);
    renderRadar(rows, startIso, endIso);
    renderTable(rows);
    renderCards(rows);
}

/* =========================
   بخش خلاصه (Hero)
========================= */
function renderHero(currentWorkouts, rows) {
    const totalVolume = rows.reduce((sum, r) => sum + r.volume, 0);
    const totalSets = rows.reduce((sum, r) => sum + r.sets, 0);

    heroTotalVolume.textContent = faNum(totalVolume);
    heroSessionCount.textContent = faNum(currentWorkouts.length);
    heroSetCount.textContent = faNum(totalSets);
}

/* =========================
   نمودار عنکبوتی (SVG)
========================= */
function renderRadar(rows, startIso, endIso) {
    const size = 320;
    const center = size / 2;
    const maxRadius = center - 46;
    const n = CATEGORY_ORDER.length;

    const rates = CATEGORY_ORDER.map(cat => {
        const row = rows.find(r => r.category === cat);
        return row ? row.rate : 0;
    });

    const scaleMax = Math.max(WEEKLY_HIGH_THRESHOLD * 1.1, ...rates.map(r => r * 1.15), 1);
    thresholdLabel.textContent = WEEKLY_OK_THRESHOLD.toLocaleString("fa-IR");

    function pointFor(index, valueFraction) {
        const angle = (Math.PI * 2 * index / n) - Math.PI / 2;
        const r = maxRadius * Math.min(1, valueFraction);
        return {
            x: center + r * Math.cos(angle),
            y: center + r * Math.sin(angle)
        };
    }

    function ringPath(fraction) {
        const pts = CATEGORY_ORDER.map((_, i) => pointFor(i, fraction));
        return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    }

    const gridRings = [0.25, 0.5, 0.75, 1].map(f =>
        `<polygon points="${ringPath(f)}" class="radar-grid-ring" fill="none" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>`
    ).join("");

    const thresholdFraction = WEEKLY_OK_THRESHOLD / scaleMax;
    const thresholdRing = `<polygon points="${ringPath(thresholdFraction)}" fill="none" stroke="#2563eb" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="4 4"/>`;

    const axisLines = CATEGORY_ORDER.map((_, i) => {
        const p = pointFor(i, 1);
        return `<line x1="${center}" y1="${center}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>`;
    }).join("");

    const dataPoints = CATEGORY_ORDER.map((cat, i) => pointFor(i, rates[i] / scaleMax));
    const dataPolygon = `<polygon points="${dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="#2563eb" fill-opacity="0.22" stroke="#2563eb" stroke-width="2"/>`;

    const dataDots = dataPoints.map((p, i) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${CATEGORY_COLORS[CATEGORY_ORDER[i]]}"/>`
    ).join("");

    const labels = CATEGORY_ORDER.map((cat, i) => {
        const p = pointFor(i, 1.18);
        return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="currentColor">${cat}</text>`;
    }).join("");

    const svg = `
        <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
            ${gridRings}
            ${axisLines}
            ${thresholdRing}
            ${dataPolygon}
            ${dataDots}
            ${labels}
        </svg>
    `;

    radarChartWrap.innerHTML = svg;

    radarLegend.innerHTML = CATEGORY_ORDER.map((cat, i) => {
        const rate = rates[i];
        return `
            <span class="radar-legend-item">
                <span class="radar-legend-dot" style="background:${CATEGORY_COLORS[cat]}"></span>
                ${cat} — ${(Math.round(rate * 10) / 10).toLocaleString("fa-IR")} ست/هفته
            </span>
        `;
    }).join("");
}

/* =========================
   جدول دسکتاپ
========================= */
function formatTrendCell(row) {
    if (row.isNew) return `<span class="trend-up">جدید</span>`;
    if (row.trendPercent === null) return `<span class="trend-flat">—</span>`;
    const rounded = Math.round(row.trendPercent * 10) / 10;
    const cls = rounded > 0 ? "trend-up" : rounded < 0 ? "trend-down" : "trend-flat";
    const sign = rounded > 0 ? "+" : "";
    return `<span class="${cls}">${sign}${rounded.toLocaleString("fa-IR")}٪</span>`;
}

function renderTable(rows) {
    let sorted = [...rows];
    const { key, dir } = sortState;

    sorted.sort((a, b) => {
        let av, bv;
        if (key === "name") { av = a.category; bv = b.category; return dir === "asc" ? av.localeCompare(bv, "fa") : bv.localeCompare(av, "fa"); }
        if (key === "sets") { av = a.sets; bv = b.sets; }
        else if (key === "volume") { av = a.volume; bv = b.volume; }
        else if (key === "trend") { av = a.trendPercent || 0; bv = b.trendPercent || 0; }
        else if (key === "status") { av = a.rate; bv = b.rate; }
        return dir === "asc" ? av - bv : bv - av;
    });

    categoryTableBody.innerHTML = sorted.map(row => `
        <tr>
            <td>
                <div class="category-name-cell">
                    <span class="category-dot" style="background:${CATEGORY_COLORS[row.category] || CATEGORY_COLORS["سایر"]}"></span>
                    ${row.category}
                </div>
            </td>
            <td>${faNum(row.sets)}</td>
            <td>${faNum(row.volume)}</td>
            <td>${formatTrendCell(row)}</td>
            <td><span class="status-badge ${row.status.key}">${row.status.label}</span></td>
        </tr>
    `).join("");
}

document.querySelectorAll(".category-table th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (sortState.key === key) {
            sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
            sortState = { key, dir: "desc" };
        }
        buildReport();
    });
});

/* =========================
   کارت‌های موبایل
========================= */
function renderCards(rows) {
    categoryCards.innerHTML = rows.map(row => {
        const detailsHtml = row.topExercises.length > 0
            ? row.topExercises.map(ex => `${ex.name} — ${faNum(ex.sets)} ست`).join("<br>")
            : "حرکتی در این بازه ثبت نشده.";

        return `
            <div class="cat-card" data-category="${row.category}">
                <div class="cat-card-top">
                    <span class="cat-card-name">
                        <span class="category-dot" style="background:${CATEGORY_COLORS[row.category] || CATEGORY_COLORS["سایر"]}"></span>
                        ${row.category}
                    </span>
                    <span class="status-badge ${row.status.key}">${row.status.label}</span>
                    <span class="cat-card-arrow">▾</span>
                </div>
                <div class="cat-card-metrics">
                    <div><strong>${faNum(row.sets)}</strong>ست مؤثر</div>
                    <div><strong>${faNum(row.volume)}</strong>حجم کل</div>
                    <div><strong>${formatTrendCell(row)}</strong>نسبت به قبل</div>
                </div>
                <div class="cat-card-details">${detailsHtml}</div>
            </div>
        `;
    }).join("");

    categoryCards.querySelectorAll(".cat-card").forEach(card => {
        card.addEventListener("click", () => card.classList.toggle("expanded"));
    });
}

/* =========================
   انتخاب بازه‌ی زمانی
========================= */
rangePills.querySelectorAll(".range-pill").forEach(btn => {
    btn.addEventListener("click", () => {
        rangePills.querySelectorAll(".range-pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentRange = btn.dataset.range;
        buildReport();
    });
});

/* =========================
   بارگذاری فایل بک‌آپ (پشتیبانی از هر دو فرمت Versionدار جدید و Legacy)
========================= */
function setDataSourceLabel() {
    if (usingUploadedBackup) {
        dataSourceLabel.textContent = "در حال نمایش گزارش از فایل آپلودی";
        dataSourceDetail.textContent = "این فایل فقط برای همین گزارش استفاده می‌شود؛ اطلاعات ذخیره‌شده روی پایگاه‌داده تغییری نمی‌کند.";
        useDeviceDataBtn.style.display = "";
    } else {
        const workouts = getWorkouts();
        dataSourceLabel.textContent = workouts.length > 0
            ? "داده‌ها به‌صورت خودکار از پایگاه‌داده (IndexedDB) بارگذاری شد"
            : "هنوز تمرینی ثبت نشده است";
        dataSourceDetail.textContent = "برای دیدن گزارش داده‌های دستگاه دیگر، فایل پشتیبان آن را بارگذاری کن.";
        useDeviceDataBtn.style.display = "none";
    }
}

if (reportBackupInput) {
    reportBackupInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            let data;
            try {
                data = JSON.parse(reader.result);
            } catch {
                alert("فایل معتبر نیست (JSON قابل خواندن نیست).");
                e.target.value = "";
                return;
            }

            if (!data || !Array.isArray(data.workouts)) {
                alert("این فایل یک فایل پشتیبان تاریخچه‌ی تمرین نیست.");
                e.target.value = "";
                return;
            }

            uploadedWorkouts = data.workouts;

            // Extract catalog overrides from both versioned array schema and legacy object schema
            uploadedCatalogOverrides = {};
            if (data.catalogAdditions && typeof data.catalogAdditions === "object") {
                uploadedCatalogOverrides = data.catalogAdditions;
            } else if (Array.isArray(data.exercises)) {
                data.exercises.forEach(ex => {
                    if (ex && ex.id) uploadedCatalogOverrides[ex.id] = ex;
                });
            }

            usingUploadedBackup = true;

            setDataSourceLabel();
            buildReport();
            e.target.value = "";
        };
        reader.readAsText(file);
    });
}

if (useDeviceDataBtn) {
    useDeviceDataBtn.addEventListener("click", () => {
        usingUploadedBackup = false;
        uploadedWorkouts = [];
        uploadedCatalogOverrides = {};
        setDataSourceLabel();
        buildReport();
    });
}

/* =========================
   بازگشت و تم
========================= */
if (backToAppBtn) {
    backToAppBtn.addEventListener("click", () => {
        window.location.href = "./index.html";
    });
}

function applyReportTheme(theme) {
    if (theme === "dark") {
        document.body.classList.add("dark-mode");
        if (reportThemeToggleBtn) reportThemeToggleBtn.textContent = "☀️";
    } else {
        document.body.classList.remove("dark-mode");
        if (reportThemeToggleBtn) reportThemeToggleBtn.textContent = "🌙";
    }
}

applyReportTheme(localStorage.getItem("gymTrackerTheme") === "dark" ? "dark" : "light");

if (reportThemeToggleBtn) {
    reportThemeToggleBtn.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark-mode");
        const newTheme = isDark ? "light" : "dark";
        localStorage.setItem("gymTrackerTheme", newTheme);
        applyReportTheme(newTheme);
    });
}

/* =========================
   شروع هماهنگ با IndexedDB
========================= */
async function bootReport() {
    await initStorage();
    setDataSourceLabel();
    buildReport();
}

bootReport().catch(err => {
    console.error("[GymLog Report] خطا در بارگذاری اولیه گزارش:", err);
    setDataSourceLabel();
    buildReport();
});
