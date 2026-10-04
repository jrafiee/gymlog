/* =====================================================
   Gym Progress Tracker — Desktop Dashboard Controller
   Calculates real KPIs, renders responsive SVG charts,
   cycle progress tracker, calendar identical to Today's Workout,
   complete history (including Week 1 Session 1),
   dedicated program upload box in programs view,
   and embedded muscle reports based on training program progress.
===================================================== */

let currentDesktopView = "dashboard";

/* =====================================================
   Navigation Controller
   (Reports page is fully embedded inside Dashboard)
===================================================== */

const VIEW_TITLES = {
    dashboard: "داشبورد مدیریت و تحلیل تمرین",
    workout: "ثبت جلسه تمرینی",
    programs: "برنامه‌های تمرینی",
    history: "تاریخچه کامل تمرینات",
    bank: "بانک جامع حرکات ورزشی",
    calendar: "تقویم تمرینات",
    backup: "پشتیبان‌گیری و بازیابی داده‌ها",
    settings: "تنظیمات برنامه"
};

function switchView(viewName) {
    // If reports was called, redirect seamlessly to dashboard and scroll to report section
    if (viewName === "reports") {
        viewName = "dashboard";
        setTimeout(() => {
            const rSec = document.getElementById("dashReportSection");
            if (rSec) rSec.scrollIntoView({ behavior: "smooth" });
        }, 150);
    }

    if (!VIEW_TITLES[viewName]) return;
    currentDesktopView = viewName;

    // 1. Update views visibility
    document.querySelectorAll(".app-view").forEach(view => {
        view.classList.remove("active");
    });
    const targetView = document.getElementById("view" + capitalize(viewName));
    if (targetView) {
        targetView.classList.add("active");
    }

    // 2. Update desktop sidebar active item
    document.querySelectorAll(".sidebar-nav-item").forEach(item => {
        item.classList.toggle("active", item.dataset.nav === viewName);
    });

    // 3. Update mobile tab switcher
    document.querySelectorAll(".mobile-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.nav === viewName);
    });

    // 4. Update topbar title
    const topbarTitle = document.getElementById("desktopTopbarTitle");
    if (topbarTitle) {
        topbarTitle.textContent = VIEW_TITLES[viewName];
    }

    // 5. Trigger view-specific renderers
    if (viewName === "dashboard") {
        renderDesktopDashboard();
    } else if (viewName === "programs") {
        renderProgramsView();
    } else if (viewName === "history") {
        renderFullHistoryView();
    } else if (viewName === "bank") {
        renderBankView();
    } else if (viewName === "calendar") {
        renderCalendarView();
    } else if (viewName === "backup") {
        renderBackupView();
    } else if (viewName === "settings") {
        renderSettingsView();
    } else if (viewName === "workout") {
        if (typeof renderAll === "function") renderAll();
    }
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/* =====================================================
   Program Upload Handler (In dedicated Programs View box)
===================================================== */

function handleProgramUploadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        let data;
        try {
            data = JSON.parse(reader.result);
        } catch {
            alert("فایل معتبر نیست (فرمت JSON قابل خواندن نیست).");
            return;
        }

        const isProgram = data && (data.programsRaw || data.catalogAdditions || data.programs || data.sessions);
        const isWorkoutBackup = data && Array.isArray(data.workouts);

        if (isProgram || isWorkoutBackup) {
            try {
                if (typeof restoreBackup === "function") {
                    await restoreBackup(data);
                } else if (typeof importProgramPackage === "function") {
                    await importProgramPackage(data);
                }
                if (typeof showToast === "function") {
                    showToast("برنامه تمرینی با موفقیت بارگذاری و در پایگاه‌داده ذخیره شد.");
                } else {
                    alert("برنامه تمرینی با موفقیت بارگذاری شد.");
                }
                location.reload();
            } catch (err) {
                alert("خطا در بارگذاری برنامه: " + (err.message || "فایل نامعتبر است."));
            }
        } else {
            alert("این فایل، یک فایل برنامه تمرینی یا پشتیبان معتبر نیست.");
        }
    };
    reader.readAsText(file);
}

/* =====================================================
   KPI & Dashboard Data Calculations (Pure real data)
===================================================== */

function getDashboardAnalytics() {
    const allWorkouts = typeof getWorkouts === "function" ? getWorkouts() : [];
    const activeMonth = currentMonth || (typeof getLatestMonthKey === "function" ? getLatestMonthKey() : null);
    const programData = activeMonth && typeof workoutPrograms !== "undefined" ? workoutPrograms[activeMonth] : null;

    const sessionsInProgram = programData && programData.sessions ? Object.keys(programData.sessions).length : 3;
    const totalCycleSessions = sessionsInProgram * 4; // 4 training weeks

    // Filter workouts for active cycle
    const cycleWorkouts = activeMonth
        ? allWorkouts.filter(w => w.month === activeMonth)
        : allWorkouts;

    const detected = typeof detectNextWeekAndSession === "function"
        ? detectNextWeekAndSession(activeMonth)
        : { week: 1, session: 1 };

    const nextSessionInfo = programData && programData.sessions ? programData.sessions[detected.session] : null;

    // Volume & Sets
    let totalCycleVolume = 0;
    let totalCycleSets = 0;
    cycleWorkouts.forEach(w => {
        (w.exercises || []).forEach(ex => {
            (ex.sets || []).forEach(s => {
                const weight = parseFloat(s.weight);
                const reps = parseFloat(s.reps);
                if (!isNaN(weight) && !isNaN(reps)) {
                    totalCycleVolume += weight * reps;
                }
                if ((s.weight !== "" && s.weight !== undefined) || (s.reps !== "" && s.reps !== undefined)) {
                    totalCycleSets++;
                }
            });
        });
    });

    const currentWeekNum = detected.week;
    const workoutsThisWeek = cycleWorkouts.filter(w => Number(w.week) === currentWeekNum);

    const completedCycleSessions = cycleWorkouts.length;
    const progressPercent = Math.min(100, Math.round((completedCycleSessions / (totalCycleSessions || 1)) * 100));
    const avgVolumePerSession = completedCycleSessions > 0 ? Math.round(totalCycleVolume / completedCycleSessions) : 0;

    // Personal bests (PRs)
    const exerciseBests = {};
    allWorkouts.forEach(w => {
        (w.exercises || []).forEach(ex => {
            (ex.sets || []).forEach(s => {
                const wt = parseFloat(s.weight);
                if (!isNaN(wt) && wt > 0) {
                    if (!exerciseBests[ex.id] || wt > exerciseBests[ex.id].weight) {
                        exerciseBests[ex.id] = { weight: wt, reps: s.reps, date: w.date };
                    }
                }
            });
        });
    });

    const catalog = typeof getEffectiveCatalog === "function" ? getEffectiveCatalog() : {};
    const topPRs = Object.keys(exerciseBests).map(id => ({
        id,
        name: catalog[id] ? catalog[id].name : id,
        weight: exerciseBests[id].weight,
        reps: exerciseBests[id].reps
    })).sort((a, b) => b.weight - a.weight).slice(0, 4);

    return {
        allWorkouts,
        cycleWorkouts,
        activeMonth,
        programData,
        sessionsInProgram,
        totalCycleSessions,
        completedCycleSessions,
        progressPercent,
        detected,
        nextSessionInfo,
        totalCycleVolume,
        totalCycleSets,
        workoutsThisWeekCount: workoutsThisWeek.length,
        avgVolumePerSession,
        topPRs
    };
}

/* =====================================================
   Muscle Group Analysis based on Program Progress
===================================================== */

const REPORT_CATEGORY_MAP = {
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

const REPORT_CATEGORY_ORDER = ["سینه", "پشت", "سرشانه", "جلو بازو", "پشت بازو", "پا", "شکم"];

const REPORT_CATEGORY_COLORS = {
    "سینه": "#f97316",
    "پشت": "#0ea5e9",
    "سرشانه": "#8b5cf6",
    "جلو بازو": "#22c55e",
    "پشت بازو": "#eab308",
    "پا": "#ec4899",
    "شکم": "#14b8a6",
    "سایر": "#9ca3af"
};

// Default report range based on training cycle
let dashReportRangeKey = "active_cycle";

function getProgramProgressWorkouts(rangeKey, allWorkouts, activeMonth, detectedWeek) {
    const cycleWorkouts = activeMonth ? allWorkouts.filter(w => w.month === activeMonth) : allWorkouts;

    let currentWorkouts = [];
    let prevWorkouts = null;
    let weeksFactor = 1;
    let periodTitle = "";

    if (rangeKey === "active_cycle") {
        currentWorkouts = cycleWorkouts;
        const distinctWeeks = new Set(cycleWorkouts.map(w => Number(w.week) || 1));
        weeksFactor = Math.max(1, distinctWeeks.size);
        periodTitle = "کل برنامه جاری";

        // Previous cycle if exists
        const allMonths = Array.from(new Set(allWorkouts.map(w => w.month)));
        const prevMonth = allMonths.find(m => m !== activeMonth);
        if (prevMonth) {
            prevWorkouts = allWorkouts.filter(w => w.month === prevMonth);
        }
    } else if (rangeKey === "up_to_current") {
        const curWk = Math.max(1, Number(detectedWeek) || 1);
        currentWorkouts = cycleWorkouts.filter(w => Number(w.week) <= curWk);
        weeksFactor = curWk;
        periodTitle = `تا هفته جاری (هفته ${curWk})`;

        if (curWk > 1) {
            prevWorkouts = cycleWorkouts.filter(w => Number(w.week) < curWk);
        }
    } else if (rangeKey === "w1") {
        currentWorkouts = cycleWorkouts.filter(w => Number(w.week) === 1);
        weeksFactor = 1;
        periodTitle = "هفته ۱ دوره";
        prevWorkouts = null;
    } else if (rangeKey === "w2") {
        currentWorkouts = cycleWorkouts.filter(w => Number(w.week) === 2);
        weeksFactor = 1;
        periodTitle = "هفته ۲ دوره";
        prevWorkouts = cycleWorkouts.filter(w => Number(w.week) === 1);
    } else if (rangeKey === "w3") {
        currentWorkouts = cycleWorkouts.filter(w => Number(w.week) === 3);
        weeksFactor = 1;
        periodTitle = "هفته ۳ دوره";
        prevWorkouts = cycleWorkouts.filter(w => Number(w.week) === 2);
    } else if (rangeKey === "w4") {
        currentWorkouts = cycleWorkouts.filter(w => Number(w.week) === 4);
        weeksFactor = 1;
        periodTitle = "هفته ۴ دوره";
        prevWorkouts = cycleWorkouts.filter(w => Number(w.week) === 3);
    } else if (rangeKey === "all_history") {
        currentWorkouts = allWorkouts;
        const distinctBlocks = new Set(allWorkouts.map(w => `${w.month || 'm'}_${w.week || 1}`));
        weeksFactor = Math.max(1, distinctBlocks.size);
        periodTitle = "کل تاریخچه تمرینات";
        prevWorkouts = null;
    }

    return {
        currentWorkouts,
        prevWorkouts,
        weeksFactor,
        periodTitle
    };
}

function computeReportCategoryStats(workoutsList, catalog) {
    const stats = {};
    REPORT_CATEGORY_ORDER.forEach(cat => {
        stats[cat] = { category: cat, sets: 0, volume: 0, exercises: {} };
    });

    (workoutsList || []).forEach(workout => {
        (workout.exercises || []).forEach(exercise => {
            const category = REPORT_CATEGORY_MAP[exercise.id] || (catalog[exercise.id] && catalog[exercise.id].category) || "سایر";
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
            });
        });
    });

    return stats;
}

function statusForReportRate(rate) {
    if (rate <= 0) return { key: "none", label: "بدون تمرین" };
    if (rate < 6) return { key: "low", label: "نیاز به تمرین بیشتر" };
    if (rate < 10) return { key: "borderline", label: "نزدیک به کافی" };
    if (rate <= 20) return { key: "ok", label: "حجم مناسب" };
    return { key: "high", label: "حجم بالا" };
}

function renderEmbeddedReportHtml(allWorkouts, catalog, activeMonth, detectedWeek) {
    const hasAnyData = allWorkouts.some(w =>
        (w.exercises || []).some(ex =>
            (ex.sets || []).some(s => s.weight !== "" || s.reps !== "")
        )
    );

    if (!hasAnyData) {
        return `
            <div style="padding:24px; text-align:center; color:#6b7280; font-size:13px;">
                <p style="margin:0 0 10px;">هنوز داده‌ای برای تحلیل عضلانی ثبت نشده است. با ثبت اولین جلسه یا بارگذاری فایل برنامه، نمودار تعادل عضلات فعال می‌شود.</p>
                <button type="button" class="primary-btn" onclick="switchView('workout')" style="display:inline-block; font-size:12px; padding:6px 14px;">
                    🏋️‍♂️ ثبت اولین جلسه تمرین
                </button>
            </div>
        `;
    }

    const { currentWorkouts, prevWorkouts, weeksFactor, periodTitle } = getProgramProgressWorkouts(dashReportRangeKey, allWorkouts, activeMonth, detectedWeek);
    const currentStats = computeReportCategoryStats(currentWorkouts, catalog);

    let prevStats = null;
    if (prevWorkouts && prevWorkouts.length > 0) {
        prevStats = computeReportCategoryStats(prevWorkouts, catalog);
    }

    const rows = Object.keys(currentStats).map(cat => {
        const s = currentStats[cat];
        // Weekly rate based on training progression weeks
        const rate = s.sets / (weeksFactor || 1);
        const status = statusForReportRate(rate);

        let trendPercent = null;
        if (prevStats && prevStats[cat]) {
            const prevVolume = prevStats[cat].volume;
            if (prevVolume > 0) {
                trendPercent = ((s.volume - prevVolume) / prevVolume) * 100;
            }
        }

        return {
            category: cat,
            sets: s.sets,
            volume: s.volume,
            rate,
            status,
            trendPercent,
            isNew: prevStats && (!prevStats[cat] || prevStats[cat].volume === 0) && s.volume > 0
        };
    });

    const totalPeriodVolume = rows.reduce((acc, r) => acc + r.volume, 0);
    const totalPeriodSets = rows.reduce((acc, r) => acc + r.sets, 0);

    // Build SVG Radar Chart
    const size = 320;
    const center = size / 2;
    const maxRadius = center - 46;
    const n = REPORT_CATEGORY_ORDER.length;
    const rates = REPORT_CATEGORY_ORDER.map(cat => {
        const r = rows.find(item => item.category === cat);
        return r ? r.rate : 0;
    });
    const scaleMax = Math.max(20 * 1.1, ...rates.map(r => r * 1.15), 1);

    function pointFor(index, valueFraction) {
        const angle = (Math.PI * 2 * index / n) - Math.PI / 2;
        const r = maxRadius * Math.min(1, valueFraction);
        return {
            x: center + r * Math.cos(angle),
            y: center + r * Math.sin(angle)
        };
    }

    function ringPath(fraction) {
        const pts = REPORT_CATEGORY_ORDER.map((_, i) => pointFor(i, fraction));
        return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    }

    const gridRings = [0.25, 0.5, 0.75, 1].map(f =>
        `<polygon points="${ringPath(f)}" fill="none" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>`
    ).join("");

    const thresholdRing = `<polygon points="${ringPath(10 / scaleMax)}" fill="none" stroke="#2563eb" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="4 4"/>`;

    const axisLines = REPORT_CATEGORY_ORDER.map((_, i) => {
        const p = pointFor(i, 1);
        return `<line x1="${center}" y1="${center}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>`;
    }).join("");

    const dataPoints = REPORT_CATEGORY_ORDER.map((cat, i) => pointFor(i, rates[i] / scaleMax));
    const dataPolygon = `<polygon points="${dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="#2563eb" fill-opacity="0.22" stroke="#2563eb" stroke-width="2"/>`;

    const dataDots = dataPoints.map((p, i) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${REPORT_CATEGORY_COLORS[REPORT_CATEGORY_ORDER[i]] || '#2563eb'}"/>`
    ).join("");

    const labels = REPORT_CATEGORY_ORDER.map((cat, i) => {
        const p = pointFor(i, 1.18);
        return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11.5" font-weight="700" fill="currentColor">${cat}</text>`;
    }).join("");

    const radarSvg = `
        <svg viewBox="0 0 ${size} ${size}" style="max-width:320px; width:100%; height:auto;">
            ${gridRings}
            ${axisLines}
            ${thresholdRing}
            ${dataPolygon}
            ${dataDots}
            ${labels}
        </svg>
    `;

    // Sort category rows by sets descending
    rows.sort((a, b) => b.sets - a.sets);

    const tableRows = rows.map(r => {
        let trendHtml = "—";
        if (r.isNew) trendHtml = `<span style="color:#16a34a; font-weight:bold;">جدید</span>`;
        else if (r.trendPercent !== null) {
            const rounded = Math.round(r.trendPercent * 10) / 10;
            const sign = rounded > 0 ? "+" : "";
            const cls = rounded > 0 ? "trend-up" : rounded < 0 ? "trend-down" : "trend-flat";
            trendHtml = `<span class="${cls}" style="direction:ltr; display:inline-block;">${sign}${rounded.toLocaleString("fa-IR")}٪</span>`;
        }

        return `
            <tr>
                <td style="text-align:right;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="width:10px; height:10px; border-radius:50%; background:${REPORT_CATEGORY_COLORS[r.category] || '#9ca3af'};"></span>
                        <strong>${r.category}</strong>
                    </div>
                </td>
                <td>${r.sets.toLocaleString("fa-IR")}</td>
                <td>${Math.round(r.volume).toLocaleString("fa-IR")}</td>
                <td>${trendHtml}</td>
                <td><span class="status-badge ${r.status.key}">${r.status.label}</span></td>
            </tr>
        `;
    }).join("");

    return `
        <!-- Selected Period Summary Cards -->
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:16px;">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; text-align:center;">
                <span style="font-size:11px; color:#64748b; display:block;">حجم کل (${periodTitle})</span>
                <strong style="font-size:19px; font-weight:800; color:#0f172a;">${Math.round(totalPeriodVolume).toLocaleString("fa-IR")}</strong>
                <small style="display:block; font-size:9.5px; color:#94a3b8;">kg × reps</small>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; text-align:center;">
                <span style="font-size:11px; color:#64748b; display:block;">جلسات انجام‌شده</span>
                <strong style="font-size:19px; font-weight:800; color:#0f172a;">${currentWorkouts.length.toLocaleString("fa-IR")}</strong>
                <small style="display:block; font-size:9.5px; color:#94a3b8;">جلسه در این بخش برنامه</small>
            </div>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; text-align:center;">
                <span style="font-size:11px; color:#64748b; display:block;">مجموع ست‌های مؤثر</span>
                <strong style="font-size:19px; font-weight:800; color:#0f172a;">${totalPeriodSets.toLocaleString("fa-IR")}</strong>
                <small style="display:block; font-size:9.5px; color:#94a3b8;">ست با وزنه/تکرار</small>
            </div>
        </div>

        <!-- Two Column Visual: Radar Chart + Detailed Breakdown Table -->
        <div style="display:grid; grid-template-columns: minmax(280px, 340px) 1fr; gap:16px; align-items:start;">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; text-align:center;">
                <h4 style="margin:0 0 8px; font-size:14px; font-weight:700;">تعادل عضلانی (نمودار عنکبوتی)</h4>
                <div>${radarSvg}</div>
                <p style="margin:8px 0 0; font-size:11px; color:#64748b; line-height:1.5;">
                    حلقه نقطه‌چین آبی: استاندارد مرجع ۱۰ ست مؤثر هفتگی برای هر گروه عضلانی در پیشرفت برنامه.
                </p>
            </div>

            <div style="overflow-x:auto;">
                <table class="category-table" style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th>گروه عضلانی</th>
                            <th>ست مؤثر</th>
                            <th>حجم (kg×تکرار)</th>
                            <th>روند تغییر</th>
                            <th>وضعیت</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/* =====================================================
   Render Dashboard Main Page
===================================================== */

let dashHistoryWeekFilter = "all";
let dashHistorySearch = "";

function renderDesktopDashboard() {
    const container = document.getElementById("dashboardOverviewContainer");
    if (!container) return;

    const data = getDashboardAnalytics();
    const catalog = typeof getEffectiveCatalog === "function" ? getEffectiveCatalog() : {};

    if (!data.programData && data.allWorkouts.length === 0) {
        container.innerHTML = `
            <div class="dash-overview-card">
                <div class="dash-overview-left">
                    <span class="dash-program-kicker">خوش آمدید</span>
                    <h2 class="dash-overview-title">هیچ برنامه تمرینی فعالی وجود ندارد</h2>
                    <p style="margin:4px 0 0; color:#6b7280; font-size:13px;">برای شروع، برنامه‌ی پیشنهادی را بارگذاری کن یا برنامه تمرینی خودت را وارد نما.</p>
                </div>
                <div class="dash-overview-actions" style="display:flex; gap:10px;">
                    <button type="button" class="dash-start-workout-btn" id="dashLoadDefaultBtn">
                        شروع با برنامه‌ی پیش‌فرض
                    </button>
                    <button type="button" class="secondary-btn" onclick="switchView('programs')">
                        رفتن به برنامه‌های تمرینی
                    </button>
                </div>
            </div>
        `;
        const loadBtn = document.getElementById("dashLoadDefaultBtn");
        if (loadBtn) {
            loadBtn.addEventListener("click", async () => {
                if (typeof importProgramPackage === "function" && typeof defaultProgramPackage !== "undefined") {
                    await importProgramPackage(defaultProgramPackage);
                    location.reload();
                }
            });
        }
        return;
    }

    const programTitle = data.programData ? data.programData.title : "برنامه تمرینی";
    const nextSessionTitle = data.nextSessionInfo ? data.nextSessionInfo.title : `جلسه ${data.detected.session}`;

    // On mobile (< 1024px), completely omit the "شروع جلسه بعدی" button (Requirement 1)
    const isMobileScreen = typeof window !== "undefined" && window.innerWidth < 1024;
    const overviewActionsHtml = !isMobileScreen ? `
        <div class="dash-overview-actions">
            <button type="button" class="dash-start-workout-btn" id="dashStartNextBtn">
                🏋️‍♂️ شروع جلسه تمرین بعدی
            </button>
        </div>
    ` : "";

    // Filter workouts for the dashboard list (NO truncation! Week 1 Session 1 will always be visible)
    let dashWorkouts = data.allWorkouts.filter(w => {
        if (dashHistoryWeekFilter !== "all" && Number(w.week) !== Number(dashHistoryWeekFilter)) {
            return false;
        }
        if (dashHistorySearch.trim()) {
            const q = dashHistorySearch.trim().toLowerCase();
            const dateStr = (w.date || "").toLowerCase();
            const pDateStr = (typeof formatPersianDate === "function" ? formatPersianDate(w.date, true) : "").toLowerCase();
            const weekStr = `هفته ${w.week}`;
            const sessStr = `جلسه ${w.session}`;
            const hasEx = (w.exercises || []).some(ex => {
                const exName = catalog[ex.id] ? catalog[ex.id].name.toLowerCase() : "";
                return ex.id.toLowerCase().includes(q) || exName.includes(q);
            });
            if (!dateStr.includes(q) && !pDateStr.includes(q) && !weekStr.includes(q) && !sessStr.includes(q) && !hasEx) {
                return false;
            }
        }
        return true;
    });

    container.innerHTML = `
        <!-- Top Overview Banner (Clean & uncluttered) -->
        <section class="dash-overview-card">
            <div class="dash-overview-left">
                <span class="dash-program-kicker">برنامه فعال</span>
                <h2 class="dash-overview-title">${programTitle}</h2>
                <div class="dash-overview-meta">
                    <span>هفته <strong>${data.detected.week}</strong> از ۴</span>
                    <span class="sep">·</span>
                    <span>جلسه بعد: <strong>جلسه ${data.detected.session} (${nextSessionTitle})</strong></span>
                    <span class="sep">·</span>
                    <span>${data.completedCycleSessions} از ${data.totalCycleSessions} جلسه انجام‌شده</span>
                </div>
                <div class="dash-progress-track">
                    <div class="dash-progress-labels">
                        <span>پیشرفت این دوره تمرینی</span>
                        <span>${data.progressPercent}٪</span>
                    </div>
                    <div class="dash-progress-bar-bg">
                        <div class="dash-progress-bar-fill" style="width: ${data.progressPercent}%"></div>
                    </div>
                </div>
            </div>
            ${overviewActionsHtml}
        </section>

        <!-- KPI Metric Cards -->
        <section class="dash-metrics-grid">
            <div class="dash-metric-card">
                <span class="dash-metric-label">جلسات این هفته</span>
                <strong class="dash-metric-val">${data.workoutsThisWeekCount.toLocaleString("fa-IR")}</strong>
                <span class="dash-metric-sub">از مجموع ${data.sessionsInProgram} جلسه هفته</span>
            </div>
            <div class="dash-metric-card">
                <span class="dash-metric-label">کل جلسات دوره</span>
                <strong class="dash-metric-val">${data.completedCycleSessions.toLocaleString("fa-IR")}</strong>
                <span class="dash-metric-sub">جلسه ثبت‌شده در این برنامه</span>
            </div>
            <div class="dash-metric-card">
                <span class="dash-metric-label">مجموع ست‌های دوره</span>
                <strong class="dash-metric-val">${data.totalCycleSets.toLocaleString("fa-IR")}</strong>
                <span class="dash-metric-sub">ست مؤثر تمرینی</span>
            </div>
            <div class="dash-metric-card">
                <span class="dash-metric-label">حجم کل دوره</span>
                <strong class="dash-metric-val">${Math.round(data.totalCycleVolume).toLocaleString("fa-IR")}</strong>
                <span class="dash-metric-sub">kg × reps</span>
            </div>
            <div class="dash-metric-card">
                <span class="dash-metric-label">میانگین حجم هر جلسه</span>
                <strong class="dash-metric-val">${Math.round(data.avgVolumePerSession).toLocaleString("fa-IR")}</strong>
                <span class="dash-metric-sub">kg در هر نوبت تمرین</span>
            </div>
            <div class="dash-metric-card">
                <span class="dash-metric-label">برترین رکورد وزنه</span>
                <strong class="dash-metric-val">${data.topPRs.length > 0 ? data.topPRs[0].weight.toLocaleString("fa-IR") + " kg" : "—"}</strong>
                <span class="dash-metric-sub">${data.topPRs.length > 0 ? data.topPRs[0].name : "بدون رکورد"}</span>
            </div>
        </section>

        <!-- ==============================================
             EMBEDDED MUSCLE BALANCE & WORKLOAD REPORT
             Driven strictly by Program Progress (Training Weeks/Cycle)
        ============================================== -->
        <section class="dash-report-card" id="dashReportSection">
            <div class="dash-report-header">
                <div class="dash-report-titles">
                    <h3>گزارش و تحلیل گروه‌های عضلانی</h3>
                    <span>تحلیل حجم تمرین، ست‌های مؤثر و تعادل عضلات بر اساس پیشرفت برنامه تمرینی</span>
                </div>
                <div class="range-pills" id="dashEmbeddedReportPills" style="margin:0;">
                    <button type="button" class="range-pill ${dashReportRangeKey === 'active_cycle' ? 'active' : ''}" data-range="active_cycle">کل برنامه جاری</button>
                    <button type="button" class="range-pill ${dashReportRangeKey === 'up_to_current' ? 'active' : ''}" data-range="up_to_current">تا هفته جاری (هفته ${data.detected.week})</button>
                    <button type="button" class="range-pill ${dashReportRangeKey === 'w1' ? 'active' : ''}" data-range="w1">هفته ۱</button>
                    <button type="button" class="range-pill ${dashReportRangeKey === 'w2' ? 'active' : ''}" data-range="w2">هفته ۲</button>
                    <button type="button" class="range-pill ${dashReportRangeKey === 'w3' ? 'active' : ''}" data-range="w3">هفته ۳</button>
                    <button type="button" class="range-pill ${dashReportRangeKey === 'w4' ? 'active' : ''}" data-range="w4">هفته ۴</button>
                    <button type="button" class="range-pill ${dashReportRangeKey === 'all_history' ? 'active' : ''}" data-range="all_history">کل تاریخچه</button>
                </div>
            </div>

            <div id="dashEmbeddedReportContent">
                ${renderEmbeddedReportHtml(data.allWorkouts, catalog, data.activeMonth, data.detected.week)}
            </div>
        </section>

        <!-- Practical Responsive Charts -->
        <section class="dash-charts-grid">
            <div class="dash-chart-card">
                <div class="dash-chart-header">
                    <h3>روند حجم تمرین در جلسات اخیر</h3>
                    <span>کیلوگرم در هر جلسه</span>
                </div>
                <div class="dash-chart-body" id="dashVolumeChartWrap">
                    ${renderVolumeProgressionChart(data.allWorkouts)}
                </div>
            </div>

            <div class="dash-chart-card">
                <div class="dash-chart-header">
                    <h3>توزیع هفتگی بار تمرین</h3>
                    <span>ست‌ها در هر هفته دوره</span>
                </div>
                <div class="dash-chart-body" id="dashWeeklyWorkloadWrap">
                    ${renderWeeklyWorkloadChart(data.cycleWorkouts)}
                </div>
            </div>
        </section>

        <!-- Training Cycle Tracker (Week 1..4) -->
        <section class="dash-cycle-card">
            <div class="dash-cycle-header">
                <h3>وضعیت جلسات دوره تمرینی</h3>
                <p>پیشرفت جلسات هفته‌های ۱ تا ۴ دوره جاری بر اساس سوابق ثبت‌شده در پایگاه‌داده</p>
            </div>
            <div class="dash-cycle-weeks">
                ${renderCycleGrid(data)}
            </div>
        </section>

        <!-- Complete Workouts Table (Never cut off Week 1 Session 1) -->
        <section class="dash-table-card" id="dashHistoryCard">
            <div class="dash-table-header" style="flex-wrap:wrap; gap:12px;">
                <div>
                    <h3 style="margin:0 0 4px;">سوابق تمام جلسات تمرینی</h3>
                    <span style="font-size:12px; color:#6b7280;">
                        نمایش تمام تمرینات ثبت‌شده از هفته ۱ جلسه ۱ به بعد (${data.allWorkouts.length} تمرین در پایگاه‌داده)
                    </span>
                </div>
                <button type="button" class="dash-table-action-btn" id="dashViewAllHistoryBtn">
                    مشاهده در صفحه اختصاصی تاریخچه ←
                </button>
            </div>

            <!-- Dashboard History Filter Toolbar -->
            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:14px;">
                <div style="display:flex; gap:6px;">
                    <button type="button" class="range-pill ${dashHistoryWeekFilter === 'all' ? 'active' : ''} dash-week-pill" data-week="all">همه جلسات</button>
                    <button type="button" class="range-pill ${dashHistoryWeekFilter === '1' ? 'active' : ''} dash-week-pill" data-week="1">هفته ۱</button>
                    <button type="button" class="range-pill ${dashHistoryWeekFilter === '2' ? 'active' : ''} dash-week-pill" data-week="2">هفته ۲</button>
                    <button type="button" class="range-pill ${dashHistoryWeekFilter === '3' ? 'active' : ''} dash-week-pill" data-week="3">هفته ۳</button>
                    <button type="button" class="range-pill ${dashHistoryWeekFilter === '4' ? 'active' : ''} dash-week-pill" data-week="4">هفته ۴</button>
                </div>
                <input type="text" id="dashHistorySearchInput" class="history-search-input" style="flex:1; min-width:200px; min-height:36px;" placeholder="جستجو بر اساس حرکت یا تاریخ..." value="${dashHistorySearch}">
            </div>

            <div class="dash-table-wrap">
                ${renderWorkoutsTableSnippet(dashWorkouts)}
            </div>
        </section>
    `;

    // Hook listeners
    const startBtn = document.getElementById("dashStartNextBtn");
    if (startBtn) {
        startBtn.addEventListener("click", () => {
            currentSession = data.detected.session;
            if (weekNumber) weekNumber.value = data.detected.week;
            switchView("workout");
        });
    }

    const viewHistoryBtn = document.getElementById("dashViewAllHistoryBtn");
    if (viewHistoryBtn) {
        viewHistoryBtn.addEventListener("click", () => {
            switchView("history");
        });
    }

    // Hook Embedded Report Range Pills
    container.querySelectorAll("#dashEmbeddedReportPills .range-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            dashReportRangeKey = pill.dataset.range;
            container.querySelectorAll("#dashEmbeddedReportPills .range-pill").forEach(p => {
                p.classList.toggle("active", p === pill);
            });
            const contentBox = document.getElementById("dashEmbeddedReportContent");
            if (contentBox) {
                contentBox.innerHTML = renderEmbeddedReportHtml(data.allWorkouts, catalog, data.activeMonth, data.detected.week);
            }
        });
    });

    // Hook Dashboard History Week Filter Pills
    container.querySelectorAll(".dash-week-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            dashHistoryWeekFilter = pill.dataset.week;
            renderDesktopDashboard();
            const hCard = document.getElementById("dashHistoryCard");
            if (hCard) hCard.scrollIntoView({ behavior: "smooth" });
        });
    });

    // Hook Dashboard History Search Input
    const dashSearchInput = container.querySelector("#dashHistorySearchInput");
    if (dashSearchInput) {
        dashSearchInput.addEventListener("input", e => {
            dashHistorySearch = e.target.value;
            renderDesktopDashboard();
            const inp = document.getElementById("dashHistorySearchInput");
            if (inp) {
                inp.focus();
                inp.setSelectionRange(inp.value.length, inp.value.length);
            }
        });
    }

    // Attach click listeners to session boxes in cycle grid
    container.querySelectorAll(".dash-cycle-session-item").forEach(item => {
        item.addEventListener("click", () => {
            const sess = Number(item.dataset.session);
            const wk = Number(item.dataset.week);
            if (sess) currentSession = sess;
            if (wk && weekNumber) weekNumber.value = wk;
            switchView("workout");
        });
    });

    // Attach click listeners to workout details buttons
    container.querySelectorAll(".view-workout-detail-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const wid = Number(btn.dataset.id);
            const targetWorkout = data.allWorkouts.find(w => w.id === wid);
            if (targetWorkout) {
                showWorkoutDetailModal(targetWorkout);
            }
        });
    });
}

/* =====================================================
   Chart 1: SVG Volume Progression Chart
===================================================== */
function renderVolumeProgressionChart(allWorkouts) {
    if (!allWorkouts || allWorkouts.length < 2) {
        return `<div class="dash-empty-notice">برای رسم نمودار روند حجم، حداقل ۲ جلسه تمرین باید ثبت شده باشد.</div>`;
    }

    const recent = allWorkouts.slice(-12);
    const volumes = recent.map(w => typeof calculateVolume === "function" ? calculateVolume(w) : 0);
    const maxVol = Math.max(...volumes, 100);

    const width = 460;
    const height = 220;
    const padX = 40;
    const padY = 30;
    const chartW = width - padX * 2;
    const chartH = height - padY * 2;

    const points = recent.map((w, idx) => {
        const x = padX + (idx / (recent.length - 1)) * chartW;
        const vol = volumes[idx];
        const y = height - padY - (vol / maxVol) * chartH;
        return { x, y, volume: vol, date: w.date };
    });

    const pathData = points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, "");
    const areaData = `${pathData} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`;

    const dots = points.map(p => `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>
        <text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" font-size="10" font-weight="bold" fill="currentColor" text-anchor="middle">
            ${Math.round(p.volume).toLocaleString("fa-IR")}
        </text>
    `).join("");

    const xLabels = points.map((p) => {
        const dStr = typeof formatPersianDate === "function" ? formatPersianDate(p.date) : p.date;
        return `
            <text x="${p.x.toFixed(1)}" y="${height - 8}" font-size="9.5" fill="#9ca3af" text-anchor="middle">
                ${dStr}
            </text>
        `;
    }).join("");

    const gridY = [0, 0.5, 1].map(f => {
        const y = height - padY - f * chartH;
        const val = Math.round(f * maxVol);
        return `
            <line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="currentColor" stroke-opacity="0.08" stroke-dasharray="3 3"/>
            <text x="${padX - 8}" y="${y + 3}" font-size="9" fill="#9ca3af" text-anchor="end">${val.toLocaleString("fa-IR")}</text>
        `;
    }).join("");

    return `
        <svg class="dash-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            ${gridY}
            <path d="${areaData}" fill="#2563eb" fill-opacity="0.12" />
            <path d="${pathData}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            ${dots}
            ${xLabels}
        </svg>
    `;
}

/* =====================================================
   Chart 2: SVG Weekly Workload Distribution
===================================================== */
function renderWeeklyWorkloadChart(cycleWorkouts) {
    const weeklyData = [1, 2, 3, 4].map(wk => {
        const inWk = (cycleWorkouts || []).filter(w => Number(w.week) === wk);
        let sets = 0;
        inWk.forEach(w => {
            (w.exercises || []).forEach(ex => {
                sets += (ex.sets || []).filter(s => (s.weight !== "" && s.weight !== undefined) || (s.reps !== "" && s.reps !== undefined)).length;
            });
        });
        return { week: wk, workouts: inWk.length, sets };
    });

    const maxSets = Math.max(...weeklyData.map(d => d.sets), 10);
    const width = 320;
    const height = 220;
    const barW = 34;

    const bars = weeklyData.map((d, i) => {
        const x = 36 + i * 72;
        const barH = (d.sets / maxSets) * 130;
        const y = height - 42 - barH;
        return `
            <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="6" fill="#3b82f6" fill-opacity="0.85"/>
            <text x="${x + barW / 2}" y="${y - 8}" font-size="11" font-weight="bold" fill="currentColor" text-anchor="middle">
                ${d.sets.toLocaleString("fa-IR")}
            </text>
            <text x="${x + barW / 2}" y="${height - 22}" font-size="11" font-weight="600" fill="currentColor" text-anchor="middle">
                هفته ${d.week}
            </text>
            <text x="${x + barW / 2}" y="${height - 8}" font-size="9" fill="#9ca3af" text-anchor="middle">
                ${d.workouts} جلسه
            </text>
        `;
    }).join("");

    return `
        <svg class="dash-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <line x1="20" y1="${height - 38}" x2="${width - 20}" y2="${height - 38}" stroke="currentColor" stroke-opacity="0.12"/>
            ${bars}
        </svg>
    `;
}

/* =====================================================
   Render Cycle Progress Grid (Week 1..4 Tracker)
===================================================== */
function renderCycleGrid(data) {
    if (!data.programData || !data.programData.sessions) {
        return `<p style="padding:16px; color:#9ca3af;">برنامه فعالی بارگذاری نشده است.</p>`;
    }

    const sessionKeys = Object.keys(data.programData.sessions).sort((a, b) => Number(a) - Number(b));
    let html = "";

    for (let wk = 1; wk <= 4; wk++) {
        let sessionItems = "";

        sessionKeys.forEach(sKey => {
            const sNum = Number(sKey);
            const sessInfo = data.programData.sessions[sKey];

            // Find if this session was done in this week
            const doneWorkout = (data.cycleWorkouts || []).find(w => Number(w.week) === wk && Number(w.session) === sNum);
            const isNext = (data.detected.week === wk && data.detected.session === sNum && !doneWorkout);

            let itemClass = "dash-cycle-session-item";
            let statusIcon = "○";
            let subText = "انجام‌نشده";

            if (doneWorkout) {
                itemClass += " done";
                statusIcon = "✓";
                subText = typeof formatPersianDate === "function" ? formatPersianDate(doneWorkout.date) : doneWorkout.date;
            } else if (isNext) {
                itemClass += " active-next";
                statusIcon = "▶";
                subText = "جلسه بعدی";
            }

            sessionItems += `
                <div class="${itemClass}" data-week="${wk}" data-session="${sNum}" title="کلیک برای باز کردن جلسه">
                    <div class="dash-cycle-session-info">
                        <strong>جلسه ${sNum}: ${sessInfo.title}</strong>
                        <span>${subText}</span>
                    </div>
                    <span class="dash-cycle-status-icon">${statusIcon}</span>
                </div>
            `;
        });

        html += `
            <div class="dash-cycle-week-col">
                <div class="dash-cycle-week-title">
                    <span>هفته ${wk}</span>
                    <span class="dash-cycle-week-badge">${wk === data.detected.week ? "هفته جاری" : ""}</span>
                </div>
                ${sessionItems}
            </div>
        `;
    }

    return html;
}

/* =====================================================
   Workouts Table Snippet (Point 3: Comprehensive display)
===================================================== */
function renderWorkoutsTableSnippet(workoutsList) {
    if (!workoutsList || workoutsList.length === 0) {
        return `<div class="dash-empty-notice">هیچ جلسه تمرینی در این بخش پیدا نشد.</div>`;
    }

    const rows = workoutsList.map(w => {
        const dStr = typeof formatPersianDate === "function" ? formatPersianDate(w.date, true) : w.date;
        const vol = typeof calculateVolume === "function" ? calculateVolume(w) : 0;
        const totalSets = (w.exercises || []).reduce((acc, ex) => acc + (ex.sets || []).length, 0);

        // Highlight Week 1 Session 1
        const isW1S1 = Number(w.week) === 1 && Number(w.session) === 1;
        const badgeHtml = isW1S1 ? `<span style="font-size:10px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:2px 6px; border-radius:4px; font-weight:700;">آغاز دوره</span>` : "";

        return `
            <tr class="${isW1S1 ? 'w1s1-row' : ''}">
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span>${dStr}</span>
                        ${badgeHtml}
                    </div>
                </td>
                <td><strong>هفته ${w.week || 1}</strong></td>
                <td>جلسه ${w.session || 1}</td>
                <td>${(w.exercises || []).length} حرکت</td>
                <td>${totalSets} ست</td>
                <td><strong>${Math.round(vol).toLocaleString("fa-IR")}</strong> <small style="color:#9ca3af;">kg×reps</small></td>
                <td>
                    <button type="button" class="dash-table-action-btn view-workout-detail-btn" data-id="${w.id}">
                        مشاهده جزئیات
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    return `
        <table class="dash-table">
            <thead>
                <tr>
                    <th>تاریخ جلسه</th>
                    <th>هفته</th>
                    <th>جلسه</th>
                    <th>حرکات</th>
                    <th>مجموع ست‌ها</th>
                    <th>حجم کل</th>
                    <th>عملیات</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

/* =====================================================
   Workout Detail Modal
===================================================== */
function showWorkoutDetailModal(workout) {
    const old = document.querySelector(".dash-detail-modal-overlay");
    if (old) old.remove();

    const dStr = typeof formatPersianDate === "function" ? formatPersianDate(workout.date, true) : workout.date;
    const vol = typeof calculateVolume === "function" ? calculateVolume(workout) : 0;
    const catalog = typeof getEffectiveCatalog === "function" ? getEffectiveCatalog() : {};

    const exercisesHtml = (workout.exercises || []).map((ex, idx) => {
        const exName = catalog[ex.id] ? catalog[ex.id].name : ex.id;
        const setsHtml = (ex.sets || []).map((s, sIdx) => `
            <div style="background:#f3f4f6; padding:6px 10px; border-radius:6px; font-size:12px; display:flex; justify-content:space-between;">
                <span>ست ${sIdx + 1}</span>
                <strong style="direction:ltr;">${s.weight || "—"} kg × ${s.reps || "—"}</strong>
            </div>
        `).join("");

        return `
            <div style="border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin-bottom:10px;">
                <h4 style="margin:0 0 8px; font-size:14px; font-weight:700;">${idx + 1}. ${exName}</h4>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:6px;">
                    ${setsHtml}
                </div>
            </div>
        `;
    }).join("");

    const overlay = document.createElement("div");
    overlay.className = "dash-detail-modal-overlay";
    overlay.innerHTML = `
        <div class="dash-detail-modal">
            <div class="dash-detail-modal-header">
                <h3>جزئیات تمرین — ${dStr}</h3>
                <button type="button" class="exercise-guide-close" id="closeDetailModalBtn">×</button>
            </div>
            <div style="font-size:13px; color:#4b5563; display:flex; gap:16px;">
                <span>هفته: <strong>${workout.week}</strong></span>
                <span>جلسه: <strong>${workout.session}</strong></span>
                <span>حجم کل: <strong>${Math.round(vol).toLocaleString("fa-IR")} kg×reps</strong></span>
            </div>
            <div style="flex:1; overflow-y:auto; margin-top:8px;">
                ${exercisesHtml}
            </div>
            <button type="button" class="secondary-btn" style="width:100%;" id="doneDetailModalBtn">بستن</button>
        </div>
    `;

    function close() { overlay.remove(); }
    overlay.querySelector("#closeDetailModalBtn").addEventListener("click", close);
    overlay.querySelector("#doneDetailModalBtn").addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

    document.body.appendChild(overlay);
}

/* =====================================================
   Comprehensive Workout History View
===================================================== */

let historySortOrder = "asc"; // Default "asc" so Week 1 Session 1 is right at top
let historyFilterWeek = "all";
let historySearchQuery = "";

function renderFullHistoryView() {
    const container = document.getElementById("viewHistoryContainer");
    if (!container) return;

    const rawWorkouts = typeof getWorkouts === "function" ? getWorkouts() : [];
    const catalog = typeof getEffectiveCatalog === "function" ? getEffectiveCatalog() : {};

    // Filter by week & search query
    let filtered = rawWorkouts.filter(w => {
        if (historyFilterWeek !== "all" && Number(w.week) !== Number(historyFilterWeek)) {
            return false;
        }
        if (historySearchQuery.trim()) {
            const q = historySearchQuery.trim().toLowerCase();
            const dateStr = (w.date || "").toLowerCase();
            const pDateStr = (typeof formatPersianDate === "function" ? formatPersianDate(w.date, true) : "").toLowerCase();
            const weekStr = `هفته ${w.week}`;
            const sessStr = `جلسه ${w.session}`;
            const hasEx = (w.exercises || []).some(ex => {
                const exName = catalog[ex.id] ? catalog[ex.id].name.toLowerCase() : "";
                return ex.id.toLowerCase().includes(q) || exName.includes(q);
            });
            if (!dateStr.includes(q) && !pDateStr.includes(q) && !weekStr.includes(q) && !sessStr.includes(q) && !hasEx) {
                return false;
            }
        }
        return true;
    });

    // Sort order (handles Week 1 Session 1 cleanly)
    filtered.sort((a, b) => {
        const dComp = (a.date || "").localeCompare(b.date || "");
        if (dComp !== 0) {
            return historySortOrder === "asc" ? dComp : -dComp;
        }
        return historySortOrder === "asc" ? (a.id || 0) - (b.id || 0) : (b.id || 0) - (a.id || 0);
    });

    container.innerHTML = `
        <div class="dash-table-card">
            <div class="dash-table-header" style="flex-wrap:wrap; gap:12px;">
                <div>
                    <h3 style="margin:0 0 4px;">تاریخچه کامل تمرینات (شامل تمام هفته‌ها و جلسات)</h3>
                    <span style="font-size:12px; color:#6b7280;">
                        نمایش ${filtered.length.toLocaleString("fa-IR")} جلسه از مجموع ${rawWorkouts.length.toLocaleString("fa-IR")} تمرین ثبت‌شده (بدون حذف هیچ جلسه‌ای از هفته ۱ جلسه ۱ به بعد)
                    </span>
                </div>
            </div>

            <!-- Filters Bar -->
            <div class="history-filters-bar">
                <select id="historySortSelect" class="history-filter-select">
                    <option value="asc" ${historySortOrder === "asc" ? "selected" : ""}>ترتیب: از شروع دوره (هفته ۱ جلسه ۱)</option>
                    <option value="desc" ${historySortOrder === "desc" ? "selected" : ""}>ترتیب: جدیدترین جلسه ابتدا</option>
                </select>

                <select id="historyWeekSelect" class="history-filter-select">
                    <option value="all" ${historyFilterWeek === "all" ? "selected" : ""}>همه هفته‌ها</option>
                    <option value="1" ${historyFilterWeek === "1" ? "selected" : ""}>هفته ۱ (جلسه ۱، ۲، ۳)</option>
                    <option value="2" ${historyFilterWeek === "2" ? "selected" : ""}>هفته ۲</option>
                    <option value="3" ${historyFilterWeek === "3" ? "selected" : ""}>هفته ۳</option>
                    <option value="4" ${historyFilterWeek === "4" ? "selected" : ""}>هفته ۴</option>
                </select>

                <input type="text" id="historySearchInput" class="history-search-input" placeholder="جستجو بر اساس نام حرکت (فارسی/انگلیسی) یا تاریخ..." value="${historySearchQuery}">
            </div>

            <div class="dash-table-wrap">
                ${renderWorkoutsTableSnippet(filtered)}
            </div>
        </div>
    `;

    // Hook filter events
    const sortSelect = container.querySelector("#historySortSelect");
    if (sortSelect) {
        sortSelect.addEventListener("change", e => {
            historySortOrder = e.target.value;
            renderFullHistoryView();
        });
    }

    const weekSelect = container.querySelector("#historyWeekSelect");
    if (weekSelect) {
        weekSelect.addEventListener("change", e => {
            historyFilterWeek = e.target.value;
            renderFullHistoryView();
        });
    }

    const searchInput = container.querySelector("#historySearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", e => {
            historySearchQuery = e.target.value;
            renderFullHistoryView();
            const reInp = document.getElementById("historySearchInput");
            if (reInp) {
                reInp.focus();
                reInp.setSelectionRange(reInp.value.length, reInp.value.length);
            }
        });
    }

    // Attach click listeners to workout details buttons
    container.querySelectorAll(".view-workout-detail-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const wid = Number(btn.dataset.id);
            const target = rawWorkouts.find(w => w.id === wid);
            if (target) showWorkoutDetailModal(target);
        });
    });
}

/* =====================================================
   Point 4: Workout Calendar (Identical to "Today's Workout" Calendar)
   Designed exactly like the datepicker modal in Today's Workout:
   clean, compact, centered card, circular day highlights,
   month navigation, and selected day workout inspection.
===================================================== */

let calendarState = null; // { jy, jm }
let calendarSelectedDate = null;

function renderCalendarView() {
    const container = document.getElementById("viewCalendarContainer");
    if (!container) return;

    const allWorkouts = typeof getWorkouts === "function" ? getWorkouts() : [];
    const datesSet = new Set(allWorkouts.map(w => w.date));
    const todayIso = typeof getToday === "function" ? getToday() : "2026-10-04";

    if (!calendarState) {
        calendarState = typeof isoToJalali === "function" ? isoToJalali(todayIso) : { jy: 1405, jm: 7 };
    }
    if (!calendarSelectedDate) {
        calendarSelectedDate = todayIso;
    }

    const monthName = (typeof PERSIAN_MONTH_NAMES !== "undefined" && PERSIAN_MONTH_NAMES[calendarState.jm - 1]) || `ماه ${calendarState.jm}`;

    // Selected single day workouts
    const selectedDateWorkouts = allWorkouts.filter(w => w.date === calendarSelectedDate);

    let selectedDayHtml = "";
    if (selectedDateWorkouts.length > 0) {
        selectedDayHtml = `
            <div class="calendar-day-details-card" style="margin-top: 16px; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #f3f4f6;">
                    <strong style="font-size:14px; color:#111827;">تمرین‌های ثبت‌شده در ${typeof formatPersianDate === "function" ? formatPersianDate(calendarSelectedDate, true) : calendarSelectedDate}</strong>
                    <span style="font-size:12px; color:#16a34a; font-weight:bold;">${selectedDateWorkouts.length} جلسه</span>
                </div>
                ${selectedDateWorkouts.map(w => `
                    <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>هفته ${w.week} · جلسه ${w.session}</strong>
                            <span style="display:block; font-size:11.5px; color:#6b7280; margin-top:2px;">
                                ${(w.exercises || []).length} حرکت · حجم: ${Math.round(typeof calculateVolume === "function" ? calculateVolume(w) : 0).toLocaleString("fa-IR")} kg×reps
                            </span>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="dash-table-action-btn cal-view-detail-btn" data-id="${w.id}">
                                مشاهده جزئیات
                            </button>
                            <button type="button" class="dash-table-action-btn cal-open-workout-btn" data-session="${w.session}" data-week="${w.week}" data-date="${w.date}" style="color:#2563eb;">
                                رفتن به جلسه
                            </button>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    } else {
        selectedDayHtml = `
            <div class="calendar-day-details-card" style="margin-top: 16px; background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:16px; text-align:center; color:#6b7280;">
                <p style="margin:0 0 10px; font-size:13px;">در تاریخ ${typeof formatPersianDate === "function" ? formatPersianDate(calendarSelectedDate, true) : calendarSelectedDate} هیچ تمرینی ثبت نشده است.</p>
                <button type="button" class="secondary-btn" id="calRecordNewDateBtn" style="font-size:12px; min-height:36px; padding:6px 14px;">
                    ✍️ ثبت تمرین برای این روز
                </button>
            </div>
        `;
    }

    // Identical layout & styling to the DatePicker Modal in "Today's Workout"
    container.innerHTML = `
        <div style="max-width: 400px; margin: 0 auto;">
            <!-- Exact Calendar Box like Today's Workout -->
            <div class="date-picker-modal" style="width:100%; max-width:100%; border:1px solid #e5e7eb; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div class="date-picker-header">
                    <button type="button" class="date-picker-nav" id="calPrevMonthBtn" aria-label="ماه قبل">‹</button>
                    <h3 style="margin:0; font-size:15px; font-weight:700;">${monthName} ${calendarState.jy}</h3>
                    <button type="button" class="date-picker-nav" id="calNextMonthBtn" aria-label="ماه بعد">›</button>
                </div>
                <div class="date-picker-weekdays">
                    ${(typeof PERSIAN_WEEKDAY_LABELS !== "undefined" ? PERSIAN_WEEKDAY_LABELS : []).slice().reverse().map(l => `<span>${l}</span>`).join("")}
                </div>
                <div class="date-picker-grid">
                    ${typeof buildDatePickerGrid === "function" ? buildDatePickerGrid(calendarState.jy, calendarState.jm, calendarSelectedDate, todayIso, datesSet) : ""}
                </div>
                <div class="date-picker-legend">
                    <span class="date-picker-legend-circle"></span> روزهایی که تمرین ثبت شده
                </div>
            </div>

            <!-- Details for Selected Day -->
            ${selectedDayHtml}
        </div>
    `;

    // Month Navigation Listeners (‹ ماه قبل)
    container.querySelector("#calPrevMonthBtn").addEventListener("click", () => {
        calendarState.jm -= 1;
        if (calendarState.jm < 1) {
            calendarState.jm = 12;
            calendarState.jy -= 1;
        }
        renderCalendarView();
    });

    // Month Navigation Listeners (› ماه بعد)
    container.querySelector("#calNextMonthBtn").addEventListener("click", () => {
        calendarState.jm += 1;
        if (calendarState.jm > 12) {
            calendarState.jm = 1;
            calendarState.jy += 1;
        }
        renderCalendarView();
    });

    // Day Selection Listeners
    container.querySelectorAll(".date-picker-day:not(.empty)").forEach(cell => {
        cell.addEventListener("click", () => {
            calendarSelectedDate = cell.dataset.iso;
            renderCalendarView();
        });
    });

    // Detail Modal Button in calendar
    container.querySelectorAll(".cal-view-detail-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const wid = Number(btn.dataset.id);
            const target = allWorkouts.find(w => w.id === wid);
            if (target) showWorkoutDetailModal(target);
        });
    });

    // Go to workout button
    container.querySelectorAll(".cal-open-workout-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const sNum = Number(btn.dataset.session);
            const wNum = Number(btn.dataset.week);
            const dVal = btn.dataset.date;
            if (sNum) currentSession = sNum;
            if (wNum && weekNumber) weekNumber.value = wNum;
            if (dVal && workoutDate) {
                workoutDate.value = dVal;
                if (typeof updatePersianWorkoutDate === "function") updatePersianWorkoutDate();
            }
            switchView("workout");
        });
    });

    const newDateBtn = container.querySelector("#calRecordNewDateBtn");
    if (newDateBtn) {
        newDateBtn.addEventListener("click", () => {
            if (workoutDate) {
                workoutDate.value = calendarSelectedDate;
                if (typeof updatePersianWorkoutDate === "function") updatePersianWorkoutDate();
            }
            switchView("workout");
        });
    }
}

/* =====================================================
   Programs View with Dedicated Clear Box (Requirement 3)
===================================================== */
function renderProgramsView() {
    const container = document.getElementById("viewProgramsContainer");
    if (!container) return;

    const monthKeys = Object.keys(workoutPrograms || {});

    let programsCardsHtml = "";
    if (monthKeys.length === 0) {
        programsCardsHtml = `<div class="dash-empty-notice">هنوز هیچ برنامه تمرینی در پایگاه‌داده وجود ندارد. از کادر بالا برای بارگذاری فایل برنامه استفاده کنید.</div>`;
    } else {
        programsCardsHtml = monthKeys.map(mKey => {
            const month = workoutPrograms[mKey];
            const isCur = mKey === currentMonth;
            const sessionsHtml = Object.values(month.sessions || {}).map(sess => `
                <div class="my-program-session" style="margin-bottom:12px; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; padding:12px;">
                    <h4 style="margin:0 0 6px; font-size:13px; color:#1f2937;">${sess.title}</h4>
                    <ul style="margin:0; padding-right:18px; font-size:12px; color:#4b5563; line-height:1.8;">
                        ${sess.exercises.map(e => `<li><strong>${e.name}</strong> — ${e.sets} ست × ${e.target} (استراحت ${e.rest})</li>`).join("")}
                    </ul>
                </div>
            `).join("");

            return `
                <div class="card" style="margin-bottom:16px; padding:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                        <div>
                            <h3 style="margin:0; font-size:18px; font-weight:800;">
                                ${month.title} ${isCur ? '<span class="my-program-current-badge">برنامه جاری</span>' : ""}
                            </h3>
                            <span style="font-size:12px; color:#6b7280;">${typeof getMonthDateRangeText === "function" ? getMonthDateRangeText(mKey) : ""}</span>
                        </div>
                    </div>
                    <div>${sessionsHtml}</div>
                </div>
            `;
        }).join("");
    }

    container.innerHTML = `
        <!-- Dedicated Program Upload Box with Clear Button & Guide (Requirement 3) -->
        <div class="program-upload-box" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:24px; margin-bottom:24px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <div class="program-upload-box-inner" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:20px;">
                <div class="program-upload-box-content" style="display:flex; align-items:flex-start; gap:16px; max-width:640px;">
                    <div class="program-upload-box-icon" style="width:48px; height:48px; border-radius:12px; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">
                        📥
                    </div>
                    <div class="program-upload-box-text">
                        <h3 style="margin:0 0 6px; font-size:16px; font-weight:800; color:#0f172a;">بارگذاری برنامه تمرینی جدید</h3>
                        <p style="margin:0 0 10px; font-size:13px; color:#64748b; line-height:1.6;">
                            فایل برنامه تمرینی مربی یا باشگاه خود را از طریق دکمه زیر بارگذاری کنید. این برنامه به عنوان یک دوره ماهانه به فهرست برنامه‌ها اضافه شده و تمامی سوابق، رکوردهای وزنه و برنامه‌های قبلی شما در پایگاه‌داده محفوظ خواهند ماند.
                        </p>
                        <div class="program-upload-box-badges" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span class="program-upload-badge" style="padding:4px 8px; border-radius:6px; background:#f1f5f9; color:#475569; font-size:11px; font-weight:600;">📄 فایل با فرمت استاندارد JSON (.json)</span>
                            <span class="program-upload-badge" style="padding:4px 8px; border-radius:6px; background:#f1f5f9; color:#475569; font-size:11px; font-weight:600;">🔒 ذخیره‌سازی محلی و امن در IndexedDB</span>
                            <span class="program-upload-badge" style="padding:4px 8px; border-radius:6px; background:#f1f5f9; color:#475569; font-size:11px; font-weight:600;">✨ حفظ کامل دوره‌ها و تاریخچه قبلی</span>
                        </div>
                    </div>
                </div>
                <div>
                    <label class="primary-btn file-btn" style="cursor:pointer; padding:12px 24px; font-size:14px; font-weight:700; border-radius:10px; display:inline-flex; align-items:center; gap:8px; box-shadow:0 2px 4px rgba(37,99,235,0.2);">
                        📥 بارگذاری فایل برنامه جدید
                        <input type="file" id="programsTabUploadInput" accept=".json" hidden>
                    </label>
                </div>
            </div>
        </div>

        <div style="margin-bottom:16px;">
            <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">فهرست برنامه‌های تمرینی شما</h3>
        </div>

        ${programsCardsHtml}
    `;

    const uploadInput = container.querySelector("#programsTabUploadInput");
    if (uploadInput) {
        uploadInput.addEventListener("change", e => handleProgramUploadFile(e.target.files[0]));
    }
}

/* =====================================================
   Bank View
===================================================== */
function renderBankView() {
    const container = document.getElementById("viewBankContainer");
    if (!container) return;

    const catalog = typeof getEffectiveCatalog === "function" ? getEffectiveCatalog() : {};
    const keys = Object.keys(catalog);

    const groups = {};
    keys.forEach(k => {
        const item = catalog[k];
        const cat = (typeof EXERCISE_CATEGORIES_MAP !== "undefined" && EXERCISE_CATEGORIES_MAP[k]) || item.category || "سایر";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push({ key: k, ...item });
    });

    const categories = Object.keys(groups);
    let html = `
        <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:18px; font-weight:700;">کاتالوگ حرکات بدنسازی (${keys.length} حرکت)</h3>
            </div>
    `;

    categories.forEach(cat => {
        const exList = groups[cat].map(ex => `
            <div class="exercise-bank-item" data-id="${ex.key}" style="background:#ffffff; border:1px solid #e5e7eb; border-radius:10px; padding:12px; cursor:pointer;">
                <div class="exercise-bank-info">
                    <strong style="display:block; font-size:14px; margin-bottom:4px;">${ex.name}</strong>
                    <span style="font-size:11px; color:#6b7280; direction:ltr; display:inline-block;">${ex.key}</span>
                </div>
            </div>
        `).join("");

        html += `
            <div class="card" style="padding:16px;">
                <h4 style="margin:0 0 12px; font-size:15px; font-weight:700; color:#2563eb;">${cat} (${groups[cat].length} حرکت)</h4>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px;">
                    ${exList}
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;

    container.querySelectorAll(".exercise-bank-item").forEach(item => {
        item.addEventListener("click", () => {
            const exId = item.dataset.id;
            if (typeof showExerciseGuide === "function") showExerciseGuide(exId);
        });
    });
}

/* =====================================================
   Backup View
===================================================== */
function renderBackupView() {
    const container = document.getElementById("viewBackupContainer");
    if (!container) return;

    const lastBackup = typeof getLastBackupAt === "function" ? getLastBackupAt() : null;
    const lastBackupStr = lastBackup && typeof formatPersianDate === "function" ? formatPersianDate(lastBackup.split("T")[0], true) : "هنوز پشتیبانی گرفته نشده است.";

    container.innerHTML = `
        <div class="card" style="padding:24px; max-width:640px; margin:0 auto;">
            <h3 style="margin:0 0 6px; font-size:18px; font-weight:700;">پشتیبان‌گیری و بازیابی پایگاه‌داده</h3>
            <p style="margin:0 0 20px; font-size:13px; color:#6b7280;">اطلاعات شما در مخزن محلی IndexedDB ذخیره می‌شود. برای انتقال یا حفظ امنیت، یک نسخه پشتیبان JSON دانلود کنید.</p>
            
            <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin-bottom:20px;">
                <strong style="display:block; font-size:13px; margin-bottom:4px;">آخرین پشتیبان موفق:</strong>
                <span style="font-size:12px; color:#4b5563;">${lastBackupStr}</span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <button type="button" class="primary-btn" id="dashExportBtn">
                    📥 دریافت فایل پشتیبان (Export)
                </button>
                <label class="secondary-btn file-btn" style="cursor:pointer; text-align:center;">
                    📤 بازیابی پشتیبان (Import)
                    <input type="file" id="dashImportFile" accept=".json" hidden>
                </label>
            </div>
        </div>
    `;

    container.querySelector("#dashExportBtn").addEventListener("click", () => {
        if (typeof exportData === "function") exportData();
        renderBackupView();
    });

    const fileInput = container.querySelector("#dashImportFile");
    if (fileInput) {
        fileInput.addEventListener("change", e => {
            const file = e.target.files[0];
            if (file && typeof handleBackupFileSelected === "function") {
                handleBackupFileSelected(file);
            }
        });
    }
}

/* =====================================================
   Settings View
===================================================== */
function renderSettingsView() {
    const container = document.getElementById("viewSettingsContainer");
    if (!container) return;

    const isDark = document.body.classList.contains("dark-mode");

    container.innerHTML = `
        <div class="card" style="padding:24px; max-width:640px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">
            <h3 style="margin:0; font-size:18px; font-weight:700;">تنظیمات و نگهداری برنامه</h3>
            
            <div class="setting-row" style="border-bottom:1px solid #f3f4f6; padding-bottom:16px;">
                <div class="setting-info">
                    <strong>ظاهر برنامه</strong>
                    <span>تغییر بین حالت روشن و تاریک</span>
                </div>
                <button type="button" class="secondary-btn" id="dashToggleThemeBtn">
                    ${isDark ? "☀️ حالت روشن" : "🌙 حالت تاریک"}
                </button>
            </div>

            <div class="setting-row" style="border-bottom:1px solid #f3f4f6; padding-bottom:16px;">
                <div class="setting-info">
                    <strong>برنامه‌های تمرینی</strong>
                    <span>مشاهده و بارگذاری برنامه‌ها در بخش برنامه‌های تمرینی</span>
                </div>
                <button type="button" class="secondary-btn" onclick="switchView('programs')">
                    مشاهده برنامه‌ها
                </button>
            </div>

            <div class="setting-row" style="border-bottom:1px solid #f3f4f6; padding-bottom:16px;">
                <div class="setting-info">
                    <strong>پاک‌سازی تاریخچه تمرینات</strong>
                    <span>فقط سوابق وزنه‌ها و تکرارها پاک می‌شود و برنامه تمرینی دست‌نخورده می‌ماند.</span>
                </div>
                <button type="button" class="danger-btn" id="dashClearHistoryBtn">
                    حذف تاریخچه
                </button>
            </div>

            <div class="setting-row">
                <div class="setting-info">
                    <strong style="color:#dc2626;">بازنشانی کامل (Reset All)</strong>
                    <span>تمام اطلاعات از IndexedDB و حافظه دستگاه به طور کامل حذف می‌شود.</span>
                </div>
                <button type="button" class="danger-btn" id="dashFullResetBtn">
                    حذف همه‌چیز
                </button>
            </div>
        </div>
    `;

    container.querySelector("#dashToggleThemeBtn").addEventListener("click", () => {
        if (themeToggleBtn) themeToggleBtn.click();
        renderSettingsView();
    });

    container.querySelector("#dashClearHistoryBtn").addEventListener("click", async () => {
        if (confirm("تاریخچه‌ی تمرین‌ها حذف شود؟ برنامه‌ی تمرینی دست‌نخورده می‌ماند.")) {
            if (typeof deleteAllData === "function") await deleteAllData();
            if (typeof renderAll === "function") renderAll();
            switchView("dashboard");
        }
    });

    container.querySelector("#dashFullResetBtn").addEventListener("click", async () => {
        if (confirm("همه‌چیز حذف شود؟ تمام برنامه‌ها و سوابق از پایگاه داده پاک می‌شوند.")) {
            if (typeof fullResetStorage === "function") await fullResetStorage();
            location.reload();
        }
    });
}

/* =====================================================
   Init Dashboard & Desktop Shell
===================================================== */
function initDashboardShell() {
    // 1. Sidebar Nav Click Handlers
    document.querySelectorAll(".sidebar-nav-item").forEach(item => {
        item.addEventListener("click", () => {
            const nav = item.dataset.nav;
            if (nav) switchView(nav);
        });
    });

    // 2. Mobile Tab Switcher Click Handlers
    document.querySelectorAll(".mobile-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const nav = btn.dataset.nav;
            if (nav) switchView(nav);
        });
    });

    // 3. Desktop Theme Icon Button (top-left)
    const desktopThemeIconBtn = document.getElementById("desktopThemeIconBtn");
    function syncDesktopThemeIcon() {
        const isDark = document.body.classList.contains("dark-mode");
        if (desktopThemeIconBtn) {
            desktopThemeIconBtn.textContent = isDark ? "☀️" : "🌙";
            desktopThemeIconBtn.title = isDark ? "تغییر ظاهر برنامه به حالت روشن" : "تغییر ظاهر برنامه به حالت تیره";
        }
    }

    if (desktopThemeIconBtn) {
        desktopThemeIconBtn.addEventListener("click", () => {
            if (typeof themeToggleBtn !== "undefined" && themeToggleBtn) {
                themeToggleBtn.click();
            } else {
                document.body.classList.toggle("dark-mode");
            }
            syncDesktopThemeIcon();
        });
        syncDesktopThemeIcon();

        // Observe dark-mode class changes on body
        const themeObserver = new MutationObserver(() => syncDesktopThemeIcon());
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    // 4. Default View: Dashboard on desktop, Workout recorder on mobile
    const isDesktop = window.innerWidth >= 1024;
    switchView(isDesktop ? "dashboard" : "workout");
}

// Start dashboard once DOM is ready
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDashboardShell);
    } else {
        initDashboardShell();
    }
}
