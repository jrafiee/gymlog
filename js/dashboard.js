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
    user: "کاربر",
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
    } else if (viewName === "user") {
        if (typeof renderUserView === "function") renderUserView();
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
   Render Cycle Progress Grid (Week 1..4 Tracker)
===================================================== */
function renderCycleGrid(data) {
    if (!data.programData || !data.programData.sessions) {
        return `<p class="gl-empty-pad">برنامه فعالی بارگذاری نشده است.</p>`;
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
                    <div class="gl-cell-flex">
                        <span>${dStr}</span>
                        ${badgeHtml}
                    </div>
                </td>
                <td><strong>هفته ${w.week || 1}</strong></td>
                <td>جلسه ${w.session || 1}</td>
                <td>${(w.exercises || []).length} حرکت</td>
                <td>${totalSets} ست</td>
                <td><strong>${Math.round(vol).toLocaleString("fa-IR")}</strong> <small class="gl-unit">kg×reps</small></td>
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
                ${ex.note ? `<p class="dv-detail-note">📝 ${esc(ex.note)}</p>` : ""}
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
            ${workout.note ? `<p class="dv-detail-note dv-detail-note-session">📝 یادداشت جلسه: ${esc(workout.note)}</p>` : ""}
            <div class="dv-detail-body">${exercisesHtml}</div>
            <button type="button" class="secondary-btn gl-btn-block" id="doneDetailModalBtn">بستن</button>
        </div>
    `;

    const close = openModalHistory("workoutDetail", () => overlay.remove());
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
            <div class="dash-table-header gl-hist-head">
                <div>
                    <h3 class="gl-hist-title">تاریخچه کامل تمرینات (شامل تمام هفته‌ها و جلسات)</h3>
                    <span class="gl-muted-sm">
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

function isWideCalendar() {
    return !!(window.matchMedia && window.matchMedia("(min-width: 1024px)").matches);
}

function renderCalendarView() {
    const container = document.getElementById("viewCalendarContainer");
    if (!container) return;

    const allWorkouts = typeof getWorkouts === "function" ? getWorkouts() : [];
    const datesSet = new Set(allWorkouts.map(w => w.date));
    const todayIso = getToday();
    const fmt = (iso, long) => (typeof formatPersianDate === "function" ? formatPersianDate(iso, long) : iso);
    const vol = w => Math.round(typeof calculateVolume === "function" ? calculateVolume(w) : 0).toLocaleString("fa-IR");

    if (!calendarState) {
        calendarState = typeof isoToJalali === "function" ? isoToJalali(todayIso) : { jy: 1405, jm: 7 };
    }
    if (!calendarSelectedDate) {
        calendarSelectedDate = todayIso;
    }

    const selectedDateWorkouts = allWorkouts.filter(w => w.date === calendarSelectedDate);

    let selectedDayHtml;
    if (selectedDateWorkouts.length > 0) {
        selectedDayHtml = `
            <div class="calendar-day-details-card">
                <div class="calendar-day-head">
                    <strong>تمرین‌های ثبت‌شده در ${fmt(calendarSelectedDate, true)}</strong>
                    <span>${selectedDateWorkouts.length.toLocaleString("fa-IR")} جلسه</span>
                </div>
                ${selectedDateWorkouts.map(w => `
                    <div class="calendar-day-item">
                        <div>
                            <strong>هفته ${w.week} · جلسه ${w.session}</strong>
                            <span class="calendar-day-sub">
                                ${(w.exercises || []).length} حرکت · حجم: ${vol(w)} kg×reps
                            </span>
                        </div>
                        <div class="calendar-day-actions">
                            <button type="button" class="dash-table-action-btn cal-view-detail-btn" data-id="${w.id}">مشاهده جزئیات</button>
                            <button type="button" class="dash-table-action-btn cal-open-workout-btn" data-session="${w.session}" data-week="${w.week}" data-date="${w.date}">رفتن به جلسه</button>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    } else {
        selectedDayHtml = `
            <div class="calendar-day-details-card calendar-day-empty">
                <p>در تاریخ ${fmt(calendarSelectedDate, true)} هیچ تمرینی ثبت نشده است.</p>
                <button type="button" class="secondary-btn" id="calRecordNewDateBtn">✍️ ثبت تمرین برای این روز</button>
            </div>
        `;
    }

    const weekdays = (typeof PERSIAN_WEEKDAY_LABELS !== "undefined" ? PERSIAN_WEEKDAY_LABELS : [])
        .slice().reverse().map(l => `<span>${l}</span>`).join("");
    const monthNames = typeof PERSIAN_MONTH_NAMES !== "undefined" ? PERSIAN_MONTH_NAMES : [];
    const wide = isWideCalendar();

        if (wide) {
        /* دسکتاپ: دو ماه قبل، ماه جاری، یک ماه بعد؛ با قبل/بعد یک ماه جابه‌جا می‌شود */
        const todayJ = typeof isoToJalali === "function" ? isoToJalali(todayIso) : { jy: 0, jm: 0 };
        const shift = off => {
            let m = calendarState.jm + off, y = calendarState.jy;
            while (m < 1) { m += 12; y -= 1; }
            while (m > 12) { m -= 12; y += 1; }
            return { jy: y, jm: m };
        };
        const months = [-2, -1, 0, 1].map(shift);
        let rangeCount = 0;

        const cards = months.map(({ jy, jm }) => {
            const len = jalaliMonthLength(jy, jm);
            const start = jalaliToIsoDate(jy, jm, 1);
            const end = jalaliToIsoDate(jy, jm, len);
            const count = allWorkouts.filter(w => w.date >= start && w.date <= end).length;
            rangeCount += count;
            const isCurrent = todayJ.jy === jy && todayJ.jm === jm;
            const yFa = jy.toLocaleString("fa-IR", { useGrouping: false });
            return `
                <section class="cal-month-card ${isCurrent ? "current" : ""}">
                    <header>
                        <h4>${monthNames[jm - 1] || jm} ${yFa}</h4>
                        <span>${count ? count.toLocaleString("fa-IR") + " جلسه" : ""}</span>
                    </header>
                    <div class="date-picker-weekdays">${weekdays}</div>
                    <div class="date-picker-grid">${buildDatePickerGrid(jy, jm, calendarSelectedDate, todayIso, datesSet)}</div>
                </section>`;
        }).join("");

        const first = months[0], last = months[3];
        const fa4 = n => n.toLocaleString("fa-IR", { useGrouping: false });
        const rangeTitle = `${monthNames[first.jm - 1]} ${fa4(first.jy)} تا ${monthNames[last.jm - 1]} ${fa4(last.jy)}`;

        container.innerHTML = `
            <div class="cal-wide">
                <div class="cal-wide-main">
                    <div class="cal-wide-bar">
                        <div class="cal-wide-nav">
                            <button type="button" class="date-picker-nav" id="calPrevBtn" aria-label="ماه قبل">‹</button>
                            <h3>${rangeTitle}</h3>
                            <button type="button" class="date-picker-nav" id="calNextBtn" aria-label="ماه بعد">›</button>
                            <button type="button" class="secondary-btn cal-today-btn" id="calTodayBtn">امروز</button>
                        </div>
                        <span class="cal-wide-count">${rangeCount.toLocaleString("fa-IR")} جلسه در این بازه</span>
                    </div>
                    <div class="cal-year-grid">${cards}</div>
                    <div class="date-picker-legend"><span class="date-picker-legend-circle"></span> روزهایی که تمرین ثبت شده</div>
                </div>
                <aside class="cal-wide-side">${selectedDayHtml}</aside>
            </div>
        `;
    
    } else {
        /* موبایل: نمای یک ماه */
        const monthName = monthNames[calendarState.jm - 1] || `ماه ${calendarState.jm}`;
        container.innerHTML = `
            <div class="gl-cal-mobile">
                <div class="date-picker-modal gl-cal-mobile-card">
                    <div class="date-picker-header">
                        <button type="button" class="date-picker-nav" id="calPrevBtn" aria-label="ماه قبل">‹</button>
                        <h3 class="gl-cal-title">${monthName} ${calendarState.jy}</h3>
                        <button type="button" class="date-picker-nav" id="calNextBtn" aria-label="ماه بعد">›</button>
                    </div>
                    <div class="date-picker-weekdays">${weekdays}</div>
                    <div class="date-picker-grid">
                        ${buildDatePickerGrid(calendarState.jy, calendarState.jm, calendarSelectedDate, todayIso, datesSet)}
                    </div>
                    <div class="date-picker-legend">
                        <span class="date-picker-legend-circle"></span> روزهایی که تمرین ثبت شده
                    </div>
                </div>
                <div class="gl-cal-day">${selectedDayHtml}</div>
            </div>
        `;
    }

    container.querySelector("#calPrevBtn").addEventListener("click", () => {
        calendarState.jm -= 1;
        if (calendarState.jm < 1) { calendarState.jm = 12; calendarState.jy -= 1; }
        renderCalendarView();
    });

    container.querySelector("#calNextBtn").addEventListener("click", () => {
        calendarState.jm += 1;
        if (calendarState.jm > 12) { calendarState.jm = 1; calendarState.jy += 1; }
        renderCalendarView();
    });

    const todayBtn = container.querySelector("#calTodayBtn");
    if (todayBtn) {
        todayBtn.addEventListener("click", () => {
            calendarState = typeof isoToJalali === "function" ? isoToJalali(todayIso) : calendarState;
            calendarSelectedDate = todayIso;
            renderCalendarView();
        });
    }

    container.querySelectorAll(".date-picker-day:not(.empty)").forEach(cell => {
        cell.addEventListener("click", () => {
            calendarSelectedDate = cell.dataset.iso;
            renderCalendarView();
        });
    });

    container.querySelectorAll(".cal-view-detail-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const target = allWorkouts.find(w => w.id === Number(btn.dataset.id));
            if (target) showWorkoutDetailModal(target);
        });
    });

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

/* با تغییر اندازه‌ی پنجره بین حالت موبایل (یک ماه) و دسکتاپ (یک سال) جابه‌جا شود */
if (window.matchMedia) {
    const calMq = window.matchMedia("(min-width: 1024px)");
    const onCalMqChange = () => { if (currentDesktopView === "calendar") renderCalendarView(); };
    if (calMq.addEventListener) calMq.addEventListener("change", onCalMqChange);
    else if (calMq.addListener) calMq.addListener(onCalMqChange);
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
            const sessionsHtml = Object.keys(month.sessions || {})
                .sort((a, b) => Number(a) - Number(b))
                .map(k => buildProgramSessionTableHtml(month.sessions[k], k))
                .join("");

            return `
                <div class="card gl-program-card">
                    <div class="gl-program-card-head">
                        <div>
                            <h3 class="gl-program-card-title">
                                ${month.title} ${isCur ? '<span class="my-program-current-badge">برنامه جاری</span>' : ""}
                            </h3>
                            <span class="gl-muted-sm">${typeof getMonthDateRangeText === "function" ? getMonthDateRangeText(mKey) : ""}</span>
                        </div>
                    </div>
                    <div class="dv-prog-sessions">${sessionsHtml}</div>
                </div>
            `;
        }).join("");
    }

    container.innerHTML = `
        <div class="gl-upload-box">
            <div class="gl-upload-inner">
                <div class="gl-upload-content">
                    <div class="gl-upload-icon">📥</div>
                    <div class="gl-upload-text">
                        <h3>بارگذاری برنامه تمرینی جدید</h3>
                        <p>
                            فایل برنامه تمرینی مربی یا باشگاه خود را از طریق دکمه زیر بارگذاری کنید. این برنامه به عنوان یک دوره ماهانه به فهرست برنامه‌ها اضافه شده و تمامی سوابق، رکوردهای وزنه و برنامه‌های قبلی شما در پایگاه‌داده محفوظ خواهند ماند.
                        </p>
                        <div class="gl-upload-badges">
                            <span class="gl-badge">📄 فایل با فرمت استاندارد JSON (.json)</span>
                            <span class="gl-badge">🔒 ذخیره‌سازی محلی و امن در IndexedDB</span>
                            <span class="gl-badge">✨ حفظ کامل دوره‌ها و تاریخچه قبلی</span>
                        </div>
                    </div>
                </div>
                <div>
                    <label class="primary-btn file-btn gl-upload-btn">
                        📥 بارگذاری فایل برنامه جدید
                        <input type="file" id="programsTabUploadInput" accept=".json" hidden>
                    </label>
                </div>
            </div>
        </div>

        <div class="gl-section-title">
            <h3>فهرست برنامه‌های تمرینی شما</h3>
        </div>

        ${programsCardsHtml}
    `;

    const uploadInput = container.querySelector("#programsTabUploadInput");
    if (uploadInput) {
        uploadInput.addEventListener("change", e => {
            const file = e.target.files[0];
            if (file) handleBackupFileSelected(file);
            e.target.value = "";
        });
    }
}

/* =====================================================
   Bank View
===================================================== */
function renderBankView() {
    const container = document.getElementById("viewBankContainer");
    if (!container) return;

    const catalog = typeof getEffectiveCatalog === "function" ? getEffectiveCatalog() : {};
    const overrides = typeof loadCatalogOverrides === "function" ? loadCatalogOverrides() : {};
    const keys = Object.keys(catalog);

    const groups = {};
    keys.forEach(k => {
        const item = catalog[k];
        const cat = item.category || EXERCISE_CATEGORIES_MAP[k] || "سایر";
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push({ key: k, ...item });
    });

    const order = MUSCLE_GROUP_ORDER;
    const categories = Object.keys(groups).sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b, "fa");
    });

    const badgeFor = k => {
        if (!overrides[k]) return "";
        const builtIn = typeof exerciseCatalog !== "undefined" && exerciseCatalog[k];
        return `<span class="dv-bank-badge">${builtIn ? "ویرایش‌شده" : "سفارشی"}</span>`;
    };

    const groupsHtml = categories.map(cat => `
        <section class="dv-bank-group">
            <h4>${cat} <span>${groups[cat].length.toLocaleString("fa-IR")} حرکت</span></h4>
            <div class="dv-bank-grid">
                ${groups[cat].map(ex => `
                    <div class="dv-bank-card" data-search="${String(ex.name + " " + (ex.nameEn || "") + " " + ex.key).toLowerCase().replace(/"/g, "")}">
                        <button type="button" class="dv-bank-item" data-id="${ex.key}">
                            <strong>${ex.name}</strong>
                            <span>${ex.key}</span>
                            ${badgeFor(ex.key)}
                        </button>
                    </div>
                `).join("")}
            </div>
        </section>
    `).join("");

    container.innerHTML = `
        <div class="dv-bank">
            <div class="dv-bank-head">
                <h3 class="dv-bank-title">کاتالوگ حرکات بدنسازی (${keys.length.toLocaleString("fa-IR")} حرکت)</h3>
                <div class="dv-bank-tools">
                    <input type="search" id="bankSearchInput" class="dv-bank-search" placeholder="جستجوی حرکت…">
                    <button type="button" class="primary-btn dv-bank-add" id="bankAddBtn">+ افزودن حرکت جدید</button>
                    <button type="button" class="secondary-btn dv-bank-export" id="bankExportBtn" title="دریافت فایل exercise-catalog.js با همه‌ی حرکت‌ها">⬇ exercise-catalog.js</button>
                    <button type="button" class="secondary-btn dv-bank-export" id="bankMediaBtn" title="دانلود تصویر/ویدیوهای بارگذاری‌شده با نام شناسه‌ی یکتا">⬇ فایل‌های رسانه</button>
                </div>
            </div>
            <p class="dv-note">برای ویرایش یک حرکت، روی آن کلیک کن و در پنجره‌ی باز‌شده «ویرایش» را بزن. تصویرها در خروجی با مسیر assets/exercises/شناسه‌ی‌یکتا.پسوند نوشته می‌شوند؛ خودِ فایل‌ها را با دکمه‌ی «فایل‌های رسانه» بگیر و در همان پوشه بگذار.</p>
            ${groupsHtml}
            <div class="dv-bank-none" id="bankNoResult">حرکتی پیدا نشد.</div>
        </div>
    `;

    container.querySelectorAll(".dv-bank-item").forEach(item => {
        item.addEventListener("click", () => {
            if (typeof showExerciseGuide === "function") showExerciseGuide(item.dataset.id);
        });
    });

    const afterChange = refreshAfterCatalogChange;

    container.querySelector("#bankAddBtn").addEventListener("click", () => {
        if (typeof openExerciseEditor === "function") openExerciseEditor(null, afterChange);
    });

    container.querySelector("#bankExportBtn").addEventListener("click", () => {
        if (typeof exportExerciseCatalogJs === "function") exportExerciseCatalogJs();
    });
    container.querySelector("#bankMediaBtn").addEventListener("click", () => {
        if (typeof downloadUploadedMedia === "function") downloadUploadedMedia();
    });

    const search = container.querySelector("#bankSearchInput");
    search.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        let total = 0;
        container.querySelectorAll(".dv-bank-group").forEach(group => {
            let visible = 0;
            group.querySelectorAll(".dv-bank-card").forEach(card => {
                const show = !q || card.dataset.search.includes(q);
                card.style.display = show ? "" : "none";
                if (show) visible += 1;
            });
            group.style.display = visible ? "" : "none";
            total += visible;
        });
        container.querySelector("#bankNoResult").style.display = total ? "none" : "block";
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
        <div class="card gl-panel">
            <h3 class="gl-panel-title">پشتیبان‌گیری و بازیابی پایگاه‌داده</h3>
            <p class="gl-panel-desc">اطلاعات شما در مخزن محلی IndexedDB ذخیره می‌شود. برای انتقال یا حفظ امنیت، یک نسخه پشتیبان JSON دانلود کنید.</p>

            <div class="gl-info-box">
                <strong>آخرین پشتیبان موفق:</strong>
                <span>${lastBackupStr}</span>
            </div>

            <div class="gl-grid-2">
                <button type="button" class="primary-btn" id="dashExportBtn">
                    📥 دریافت فایل پشتیبان (Export)
                </button>
                <label class="secondary-btn file-btn gl-file-label">
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

    container.innerHTML = `
        <div class="card gl-panel gl-panel-col">
            <h3 class="gl-panel-title">تنظیمات و نگهداری برنامه</h3>

            <div class="setting-row gl-setting-row">
                <div class="setting-info">
                    <strong>ساخت برنامه تمرینی</strong>
                    <span>طراحی برنامه‌ی جدید و ثبت مستقیم در برنامه یا دانلود به‌صورت فایل JSON</span>
                </div>
                <button type="button" class="primary-btn" id="dashOpenBuilderBtn">
                    ساخت برنامه
                </button>
            </div>

            <div class="setting-row gl-setting-row">
                <div class="setting-info">
                    <strong>برنامه‌های تمرینی</strong>
                    <span>مشاهده و بارگذاری برنامه‌ها در بخش برنامه‌های تمرینی</span>
                </div>
                <button type="button" class="secondary-btn" onclick="switchView('programs')">
                    مشاهده برنامه‌ها
                </button>
            </div>

            <div class="setting-row gl-setting-row">
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
                    <strong class="gl-danger-text">بازنشانی کامل (Reset All)</strong>
                    <span>تمام اطلاعات از IndexedDB و حافظه دستگاه به طور کامل حذف می‌شود.</span>
                </div>
                <button type="button" class="danger-btn" id="dashFullResetBtn">
                    حذف همه‌چیز
                </button>
            </div>
        </div>
    `;

    const builderBtn = container.querySelector("#dashOpenBuilderBtn");
    if (builderBtn) {
        builderBtn.addEventListener("click", () => {
            if (typeof openProgramBuilder === "function") openProgramBuilder();
        });
    }

    container.querySelector("#dashClearHistoryBtn").addEventListener("click", async () => {
        if (await confirmClearHistory()) switchView("dashboard");
    });

    container.querySelector("#dashFullResetBtn").addEventListener("click", confirmFullReset);
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
