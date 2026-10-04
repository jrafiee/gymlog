/* =====================================================
   Gym Progress Tracker — Dashboard Shell & Views

   این فایل فقط ناوبری و ویوهای جانبی را نگه می‌دارد:
   تاریخچه، تقویم، برنامه‌ها، بانک حرکات، پشتیبان و تنظیمات.

   صفحه‌ی اصلی داشبورد (renderDesktopDashboard) در
     js/dashboard-overview.js
   و محاسبات آن در
     js/dashboard-analytics.js
   قرار دارد و باید بعد از این فایل لود شود.
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
    // صفحه‌ی گزارش جداگانه حذف شده؛ به داشبورد هدایت می‌شود
    if (viewName === "reports") viewName = "dashboard";

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
        const badgeHtml = isW1S1 ? `<span class="dv-start-badge">آغاز دوره</span>` : "";

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
            <div class="dv-detail-set">
                <span>ست ${sIdx + 1}</span>
                <strong>${s.weight || "—"} kg × ${s.reps || "—"}</strong>
            </div>
        `).join("");

        return `
            <div class="dv-detail-ex">
                <h4>${idx + 1}. ${exName}</h4>
                <div class="dv-detail-sets">${setsHtml}</div>
            </div>
        `;
    }).join("");

    const overlay = document.createElement("div");
    overlay.className = "dash-detail-modal-overlay";
    overlay.innerHTML = `
        <div class="dash-detail-modal">
            <div class="dash-detail-modal-header">
                <h3>جزئیات تمرین — ${dStr}</h3>
                <button type="button" class="exercise-guide-close" id="closeDetailModalBtn" aria-label="بستن">×</button>
            </div>
            <div class="dv-detail-meta">
                <span>هفته: <strong>${workout.week}</strong></span>
                <span>جلسه: <strong>${workout.session}</strong></span>
                <span>حجم کل: <strong>${Math.round(vol).toLocaleString("fa-IR")} kg×reps</strong></span>
            </div>
            <div class="dv-detail-body">${exercisesHtml}</div>
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

    const order = ["سینه", "پشت", "سرشانه", "جلو بازو", "پشت بازو", "پا", "شکم"];
    const categories = Object.keys(groups).sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b, "fa");
    });

    const groupsHtml = categories.map(cat => `
        <section class="dv-bank-group">
            <h4>${cat} <span>${groups[cat].length.toLocaleString("fa-IR")} حرکت</span></h4>
            <div class="dv-bank-grid">
                ${groups[cat].map(ex => `
                    <button type="button" class="dv-bank-item" data-id="${ex.key}">
                        <strong>${ex.name}</strong>
                        <span>${ex.key}</span>
                    </button>
                `).join("")}
            </div>
        </section>
    `).join("");

    container.innerHTML = `
        <div class="dv-bank">
            <h3 class="dv-bank-title">کاتالوگ حرکات بدنسازی (${keys.length.toLocaleString("fa-IR")} حرکت)</h3>
            ${groupsHtml}
        </div>
    `;

    container.querySelectorAll(".dv-bank-item").forEach(item => {
        item.addEventListener("click", () => {
            if (typeof showExerciseGuide === "function") showExerciseGuide(item.dataset.id);
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
    // بدون برنامه، داشبورد (صفحه‌ی خوش‌آمدگویی) اولین صفحه است، حتی در موبایل
    const isDesktop = window.innerWidth >= 1024;
    const hasProgram = typeof getEffectiveProgramsRaw === "function" &&
        Object.keys(getEffectiveProgramsRaw() || {}).length > 0;
    switchView(isDesktop || !hasProgram ? "dashboard" : "workout");
}

// Start dashboard once DOM is ready
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDashboardShell);
    } else {
        initDashboardShell();
    }
}
