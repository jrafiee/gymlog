/* =====================================================
   GymLog — Dashboard Overview (rendering)

   ساختار ماژولار: هر بخش یک آبجکت در SECTIONS است
       { render(ctx) → html,  mount(slot, ctx) → اتصال رویدادها }
   برای افزودن/حذف یک بخش:
     ۱) آن را در SECTIONS ثبت/حذف کن
     ۲) در LAYOUT (پایین فایل) جایش را مشخص کن
   محاسبات در dashboard-analytics.js هستند، اینجا فقط نمایش است.

   این فایل باید بعد از dashboard.js و dashboard-analytics.js لود شود
   و renderDesktopDashboard را جایگزین نسخه‌ی قبلی می‌کند.
===================================================== */

(function () {
    "use strict";

    const A = window.DashAnalytics;

    /* =========================
       ابزارهای نمایش
    ========================= */
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
    const fa = A.fa;
    const setHtml = s => `<bdi class="dv-num">${fa(s.weight)}×${fa(s.reps, 0)}</bdi>`;
    const pDate = (iso, long) => (typeof formatPersianDate === "function" ? formatPersianDate(iso, !!long) : iso);
    const shortDate = iso => {
        const p = pDate(iso).split("/");
        return p.length === 3 ? p.slice(1).join("/") : pDate(iso);
    };
    const daysAgoText = n => (n === 0 ? "امروز" : n === 1 ? "دیروز" : `${fa(n, 0)} روز پیش`);

    /* وضعیت فیلترهای بخش «روند عملکرد» */
    const state = { range: "8", month: null, session: "all", exercise: null };
    let ctxCache = null;

    /* =========================
       ساخت context از داده‌های برنامه
    ========================= */
    function buildContext() {
        const programs = typeof workoutPrograms !== "undefined" ? workoutPrograms : {};
        const activeMonth =
            (typeof currentMonth !== "undefined" && currentMonth) ||
            (typeof getLatestMonthKey === "function" ? getLatestMonthKey() : null);
        const workouts = A.sortWorkouts(typeof getWorkouts === "function" ? getWorkouts() : []);
        const detected = typeof detectNextWeekAndSession === "function"
            ? detectNextWeekAndSession(activeMonth)
            : { week: 1, session: 1 };
        const program = activeMonth ? programs[activeMonth] || null : null;
        const today = typeof getToday === "function" ? getToday() : new Date().toISOString().slice(0, 10);

        return {
            programs,
            activeMonth,
            program,
            workouts,
            cycle: workouts.filter(w => w.month === activeMonth),
            detected,
            today,
            catalog: typeof getEffectiveCatalog === "function" ? getEffectiveCatalog() : {}
        };
    }

    /* =========================
       بخش ۱: برنامه فعال (حفظ‌شده)
    ========================= */
    const sectionProgram = {
        render(ctx) {
            const prog = ctx.program;
            const title = prog ? prog.title : "برنامه تمرینی";
            const sessionsCount = prog && prog.sessions ? Object.keys(prog.sessions).length : 3;
            const total = sessionsCount * 4;
            const done = ctx.cycle.length;
            const pct = Math.min(100, Math.round((done / (total || 1)) * 100));
            const next = prog && prog.sessions ? prog.sessions[ctx.detected.session] : null;
            const nextTitle = next ? next.title : `جلسه ${ctx.detected.session}`;

            return `
            <section class="dash-overview-card">
                <div class="dash-overview-left">
                    <span class="dash-program-kicker">برنامه فعال</span>
                    <h2 class="dash-overview-title">${esc(title)}</h2>
                    <div class="dash-overview-meta">
                        <span>هفته <strong>${fa(ctx.detected.week, 0)}</strong> از ۴</span>
                        <span class="sep">·</span>
                        <span>جلسه بعد: <strong>جلسه ${fa(ctx.detected.session, 0)} (${esc(nextTitle)})</strong></span>
                        <span class="sep">·</span>
                        <span>${fa(done, 0)} از ${fa(total, 0)} جلسه انجام‌شده</span>
                    </div>
                    <div class="dash-progress-track">
                        <div class="dash-progress-labels">
                            <span>پیشرفت این دوره تمرینی</span>
                            <span>${fa(pct, 0)}٪</span>
                        </div>
                        <div class="dash-progress-bar-bg">
                            <div class="dash-progress-bar-fill" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </div>
                <div class="dash-overview-actions">
                    <button type="button" class="dash-start-workout-btn" id="dashStartNextBtn">
                        🏋️‍♂️ شروع جلسه تمرین بعدی
                    </button>
                </div>
            </section>`;
        },
        mount(slot, ctx) {
            const btn = slot.querySelector("#dashStartNextBtn");
            if (!btn) return;
            btn.addEventListener("click", () => {
                currentSession = ctx.detected.session;
                if (typeof weekNumber !== "undefined" && weekNumber) weekNumber.value = ctx.detected.week;
                switchView("workout");
            });
        }
    };

    /* =========================
       بخش ۲: وضعیت تمرین
       سؤال: این هفته چقدر تمرین کرده‌ام؟ طبق برنامه پیش رفته‌ام؟
    ========================= */
    const sectionStatus = {
        render(ctx) {
            const s = A.computeStatus(ctx);

            const last7Sub = s.perWeek ? `از ${fa(s.perWeek, 0)} جلسه‌ی برنامه در هفته` : "جلسه ثبت‌شده";
            const lastVal = s.last ? daysAgoText(s.last.daysAgo) : "—";
            const lastSub = s.last ? [s.last.title, pDate(s.last.date)].filter(Boolean).map(esc).join(" · ") : "هنوز جلسه‌ای ثبت نشده";

            let adh;
            if (s.adherence) {
                adh = `<div class="dv-kpi-val">${fa(s.adherence.percent, 0)}٪</div>
                       <div class="dv-kpi-sub">${fa(s.adherence.done, 0)} از ${fa(s.adherence.planned, 0)} جلسه در هفته‌های کامل‌شده</div>`;
            } else {
                adh = `<div class="dv-kpi-val dv-muted">—</div>
                       <div class="dv-kpi-sub">${s.perWeek ? "بعد از پایان هفته‌ی اول محاسبه می‌شود" : "برنامه‌ی هدف مشخصی ندارد"}</div>`;
            }

            return `
            <section class="dv-kpis" aria-label="وضعیت تمرین">
                <div class="dv-kpi">
                    <div class="dv-kpi-label">۷ روز اخیر</div>
                    <div class="dv-kpi-val">${fa(s.last7, 0)}</div>
                    <div class="dv-kpi-sub">${last7Sub}</div>
                </div>
                <div class="dv-kpi">
                    <div class="dv-kpi-label">آخرین جلسه</div>
                    <div class="dv-kpi-val dv-kpi-val-sm">${lastVal}</div>
                    <div class="dv-kpi-sub">${lastSub}</div>
                </div>
                <div class="dv-kpi">
                    <div class="dv-kpi-label">هفته‌های ثبت‌شده</div>
                    <div class="dv-kpi-val">${fa(s.weeksLogged, 0)}</div>
                    <div class="dv-kpi-sub">از ۴ هفته‌ی این دوره</div>
                </div>
                <div class="dv-kpi">
                    <div class="dv-kpi-label">پایبندی به برنامه</div>
                    ${adh}
                </div>
            </section>`;
        }
    };

    /* =========================
       بخش ۳: روند عملکرد حرکت
       سؤال: در این حرکت، از جلسه‌ای به جلسه‌ی دیگر چه تغییری کرده‌ام؟
       داده : بهترین ست هر جلسه (بیشترین وزن؛ در تساوی، بیشترین تکرار)
    ========================= */
    const STATUS_COLORS = { ceiling: "#16a34a", in: "#2563eb", below: "#d97706", none: "#9ca3af" };
    const STATUS_LABELS = {
        ceiling: "به سقف محدوده‌ی هدف رسیده",
        in: "داخل محدوده‌ی هدف",
        below: "پایین‌تر از حداقل محدوده‌ی هدف",
        none: "بدون target مشخص"
    };

    function progressionFilters(ctx) {
        const monthKeys = Object.keys(ctx.programs);
        const monthForSessions = state.month && state.month !== "all" ? state.month : ctx.activeMonth;
        const sess = ctx.programs[monthForSessions] && ctx.programs[monthForSessions].sessions || {};

        const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(label)}</option>`;

        const range = ["4", "8", "all"].map(v => opt(v, v === "all" ? "کل دوره" : `${fa(v, 0)} هفته اخیر`, state.range)).join("");
        const sessions = opt("all", "همه جلسات", state.session) +
            Object.keys(sess).map(k => opt(k, `جلسه ${fa(k, 0)} — ${sess[k].title}`, state.session)).join("");
        const months = opt("all", "همه برنامه‌ها", state.month) +
            monthKeys.map(k => opt(k, ctx.programs[k].title, state.month)).join("");

        return { range, sessions, months, multiMonth: monthKeys.length > 1 };
    }

    function chartSvg(sessions) {
        const W = 560, H = 270, pl = 46, pr = 22, pt = 36, pb = 46;
        const n = sessions.length;
        const ws = sessions.map(s => s.best.weight);
        let lo = Math.min(...ws), hi = Math.max(...ws);
        if (lo === hi) { lo -= 2.5; hi += 2.5; }
        else { const pad = (hi - lo) * 0.25; lo -= pad; hi += pad; }
        lo = Math.max(0, lo);

        const x = i => (n === 1 ? (pl + (W - pl - pr) / 2) : pl + (i * (W - pl - pr)) / (n - 1));
        const y = w => H - pb - ((w - lo) / (hi - lo)) * (H - pt - pb);

        const grid = [0, 0.5, 1].map(f => {
            const v = lo + f * (hi - lo);
            const yy = y(v);
            return `<line x1="${pl}" y1="${yy.toFixed(1)}" x2="${W - pr}" y2="${yy.toFixed(1)}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3 3"/>
                    <text x="${pl - 8}" y="${(yy + 3).toFixed(1)}" font-size="10" fill="#9ca3af" text-anchor="end">${fa(v, 1)}</text>`;
        }).join("");

        const path = sessions.map((s, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(s.best.weight).toFixed(1)}`).join(" ");
        const line = n > 1 ? `<path d="${path}" fill="none" stroke="#2563eb" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : "";

        const step = n > 10 ? 2 : 1;
        const dots = sessions.map((s, i) => {
            const cx = x(i).toFixed(1), cy = y(s.best.weight).toFixed(1);
            const tip = [
                pDate(s.date, true),
                `هفته ${fa(s.week, 0)} · جلسه ${fa(s.session, 0)}`,
                `بهترین ست: ${fa(s.best.weight)} kg × ${fa(s.best.reps, 0)}`,
                `همه‌ی ست‌ها: ${s.sets.map(t => `${fa(t.weight)}×${fa(t.reps, 0)}`).join("  ·  ")}`,
                s.target ? `هدف ${s.target.raw}: ${STATUS_LABELS[s.status]}` : STATUS_LABELS.none,
                s.incomplete > 0 ? `⚠ ${fa(s.incomplete, 0)} ست ناقص ثبت شده` : ""
            ].filter(Boolean).join("\n");

            const label = i % step === 0
                ? `<text x="${cx}" y="${(y(s.best.weight) - 11).toFixed(1)}" font-size="10.5" font-weight="700" fill="currentColor" text-anchor="middle">${fa(s.best.weight)}×${fa(s.best.reps, 0)}</text>`
                : "";
            const xl = i % step === 0
                ? `<text x="${cx}" y="${H - 18}" font-size="9.5" fill="#9ca3af" text-anchor="middle">${shortDate(s.date)}</text>`
                : "";

            return `${label}${xl}
                <circle class="dv-dot" cx="${cx}" cy="${cy}" r="6" fill="${STATUS_COLORS[s.status]}" stroke="#fff" stroke-width="2"
                        tabindex="0" data-tip="${esc(tip).replace(/\n/g, "&#10;")}"/>`;
        }).join("");

        return `<svg viewBox="0 0 ${W} ${H}" class="dv-svg" role="img" aria-label="روند بهترین ست هر جلسه">${grid}${line}${dots}</svg>`;
    }

    const sectionProgression = {
        render(ctx) {
            if (!state.month) state.month = ctx.activeMonth || "all";
            const f = progressionFilters(ctx);
            const data = A.computeProgression(ctx, state);
            if (data.selected) state.exercise = data.selected.id;

            const filters = `
                <div class="dv-filters">
                    <label>بازه <select data-f="range">${f.range}</select></label>
                    ${f.multiMonth ? `<label>برنامه <select data-f="month">${f.months}</select></label>` : ""}
                    <label>جلسه <select data-f="session">${f.sessions}</select></label>
                    <label class="dv-filter-grow">حرکت
                        <select data-f="exercise">
                            ${data.list.length
                                ? data.list.map(e => `<option value="${esc(e.id)}" ${data.selected && e.id === data.selected.id ? "selected" : ""}>${esc(e.name)} (${fa(e.count, 0)} جلسه)</option>`).join("")
                                : `<option>—</option>`}
                        </select>
                    </label>
                </div>`;

            let body;
            if (!data.selected) {
                const hint = ctx.workouts.length && state.range !== "all"
                    ? "در این بازه جلسه‌ای با وزنه و تکرار کامل ثبت نشده. بازه را روی «کل دوره» بگذار."
                    : "هنوز جلسه‌ای با وزنه و تکرار کامل ثبت نشده است.";
                body = `<div class="dv-empty">${hint}</div>`;
            } else {
                const st = data.stats;
                const legend = Object.keys(STATUS_COLORS).filter(k => k !== "none" || !data.target).map(k =>
                    `<span><i style="background:${STATUS_COLORS[k]}"></i>${STATUS_LABELS[k]}</span>`).join("");

                body = `
                    <div class="dv-chart">
                        ${chartSvg(data.sessions)}
                        <div class="dv-tip" hidden></div>
                    </div>
                    <div class="dv-legend">${legend}</div>
                    <div class="dv-observed-title">داده ثبت‌شده</div>
                    <dl class="dv-observed">
                        <div><dt>جلسات</dt><dd>${fa(st.count, 0)}</dd></div>
                        <div><dt>بیشترین وزنه</dt><dd>${setHtml(st.maxWeight)}</dd></div>
                        <div><dt>آخرین بهترین ست</dt><dd>${setHtml(st.last)}</dd></div>
                        ${data.target ? `<div><dt>هدف برنامه</dt><dd>${esc(data.target.raw)}</dd></div>` : ""}
                    </dl>
                    <p class="dv-interp dv-interp-${data.interpretation.level}"><b>تفسیر</b>${esc(data.interpretation.text)}</p>
                    ${st.incompleteSessions ? `<p class="dv-note">در ${fa(st.incompleteSessions, 0)} جلسه، بعضی ست‌ها ناقص ثبت شده‌اند (فقط وزن یا فقط تکرار). این ست‌ها در نمودار لحاظ نشده‌اند.</p>` : ""}
                    <p class="dv-note">نوع ست (گرم‌کردن یا کاری) در داده ثبت نمی‌شود؛ پس همه‌ی ست‌های ثبت‌شده بررسی شده‌اند و بهترین ست، ست با بیشترین وزنه است. حرکات وزن‌بدنی و زمانی (مثل پلانک و شنا) در این نمودار نیستند.</p>`;
            }

            return `
            <section class="dv-card">
                <header class="dv-card-head">
                    <h3>روند عملکرد حرکت</h3>
                    <p>بهترین ست هر جلسه برای حرکت انتخاب‌شده</p>
                </header>
                ${filters}
                ${body}
            </section>`;
        },
        mount(slot, ctx) {
            slot.querySelectorAll("select[data-f]").forEach(sel => {
                sel.addEventListener("change", () => {
                    const k = sel.dataset.f;
                    state[k] = sel.value;
                    if (k === "month") state.session = "all";
                    if (k === "month" || k === "session" || k === "range") state.exercise = null;
                    refresh("progression");
                });
            });

            const wrap = slot.querySelector(".dv-chart");
            const tip = slot.querySelector(".dv-tip");
            if (!wrap || !tip) return;

            const show = el => {
                tip.textContent = el.getAttribute("data-tip");
                tip.hidden = false;
                const wr = wrap.getBoundingClientRect();
                const r = el.getBoundingClientRect();
                const left = Math.min(Math.max(r.left - wr.left + r.width / 2, 100), wr.width - 100);
                tip.style.left = left + "px";
                tip.style.top = (r.top - wr.top) + "px";
            };
            const hide = () => { tip.hidden = true; };

            slot.querySelectorAll(".dv-dot").forEach(dot => {
                dot.addEventListener("pointerenter", () => show(dot));
                dot.addEventListener("pointerleave", hide);
                dot.addEventListener("focus", () => show(dot));
                dot.addEventListener("blur", hide);
                dot.addEventListener("click", e => { e.stopPropagation(); show(dot); });
            });
            wrap.addEventListener("click", hide);
        }
    };

    /* =========================
       بخش ۴: مقایسه با جلسه قبل
       سؤال: در جلسه‌ی آخر نسبت به دفعه‌ی قبلِ همین جلسه‌ی برنامه چه تغییری کرده‌ام؟
    ========================= */
    const sectionCompare = {
        render(ctx) {
            const c = A.computeComparison(ctx);
            const head = (sub) => `<header class="dv-card-head"><h3>تغییر نسبت به جلسه‌ی قبل</h3>${sub ? `<p>${sub}</p>` : ""}</header>`;

            if (c.state === "empty") {
                return `<section class="dv-card">${head("")}<div class="dv-empty">بعد از ثبت اولین جلسه، مقایسه اینجا نمایش داده می‌شود.</div></section>`;
            }

            const sub = `${esc(c.sessionTitle)} · ${pDate(c.current.date)}` +
                (c.prevWorkout ? ` · جلسه‌ی قبل: ${pDate(c.prevWorkout.date)}` : "");

            if (c.state === "no-previous") {
                return `<section class="dv-card">${head(sub)}<div class="dv-empty">این اولین ثبت از این جلسه‌ی برنامه است؛ جلسه‌ی قبلی برای مقایسه وجود ندارد.</div></section>`;
            }

            const sm = c.summary;
            const summary = c.rows.some(r => r.change)
                ? `<p class="dv-summary">${fa(sm.up, 0)} حرکت بهتر · ${fa(sm.same, 0)} بدون تغییر · ${fa(sm.lower, 0)} حرکت با وزنه یا تکرار کمتر</p>`
                : "";

            const rows = c.rows.map(r => `
                <li class="dv-cmp-row">
                    <div class="dv-cmp-top">
                        <strong>${esc(r.name)}</strong>
                        ${r.change ? `<span class="dv-chip dv-chip-${r.change.tone}">${esc(r.change.text)}</span>` : `<span class="dv-chip dv-chip-same">مقایسه‌ای ندارد</span>`}
                    </div>
                    <div class="dv-cmp-vals">
                        ${r.prev ? `<span class="dv-cmp-prev">${setHtml(r.prev.best)}</span><span class="dv-arrow">←</span>` : ""}
                        <span class="dv-cmp-cur">${setHtml(r.cur.best)}</span>
                        <span class="dv-cmp-meta">${fa(r.cur.logged, 0)} ست${r.setCountChanged ? ` (قبلاً ${fa(r.prev.logged, 0)})` : ""}${r.target ? ` · هدف ${esc(r.target.raw)}` : ""}${r.ceiling ? " · به سقف رسید" : ""}</span>
                    </div>
                    ${r.caveat ? `<p class="dv-caveat">${esc(r.caveat)}</p>` : ""}
                </li>`).join("");

            return `
            <section class="dv-card">
                ${head(sub)}
                ${summary}
                <ul class="dv-cmp-list">${rows}</ul>
                ${c.skipped ? `<p class="dv-note">${fa(c.skipped, 0)} حرکت وزن‌بدنی یا زمانی در مقایسه‌ی بار لحاظ نشد.</p>` : ""}
            </section>`;
        }
    };

    /* =========================
       بخش ۵: آماده‌ی افزایش وزنه
    ========================= */
    const sectionReady = {
        render(ctx) {
            const r = A.computeReadiness(ctx);
            let body;
            if (r.state === "no-program") body = `<div class="dv-empty">برای این بخش برنامه‌ی فعال لازم است.</div>`;
            else if (r.state === "empty") body = `<div class="dv-empty">بعد از ثبت جلسات، حرکات آماده‌ی افزایش وزنه اینجا نمایش داده می‌شوند.</div>`;
            else if (!r.items.length) {
                body = `<div class="dv-empty">${r.evaluated
                    ? "فعلاً حرکتی همه‌ی شرط‌ها را ندارد."
                    : "حرکتی با ثبت کامل وزنه و تکرار برای بررسی وجود ندارد."}</div>`;
            } else {
                body = `<ul class="dv-list">${r.items.map(it => `
                    <li>
                        <div class="dv-list-main">
                            <strong>${esc(it.name)}</strong>
                            <span class="dv-badge dv-badge-ok">کاندید افزایش وزنه</span>
                        </div>
                        <div class="dv-list-sub">
                            <bdi class="dv-num">${fa(it.weight)} kg — ${it.reps.map(x => fa(x, 0)).join(" / ")}</bdi>
                            · هدف ${esc(it.target.raw)} · ${pDate(it.date)}
                        </div>
                    </li>`).join("")}</ul>`;
            }

            return `
            <section class="dv-card">
                <header class="dv-card-head">
                    <h3>آماده‌ی افزایش وزنه</h3>
                    <p>همه‌ی ست‌های هدف در یک وزن به سقف محدوده‌ی تکرار رسیده باشند</p>
                </header>
                ${body}
            </section>`;
        }
    };

    /* =========================
       بخش ۶: رکوردهای اخیر
    ========================= */
    const RECORD_LABELS = { load: "رکورد وزنه", rep: "رکورد تکرار", ceiling: "رسیدن به سقف هدف" };

    const sectionRecords = {
        render(ctx) {
            const r = A.computeRecords(ctx, 5);
            const body = r.events.length
                ? `<ul class="dv-list">${r.events.map(e => `
                    <li>
                        <div class="dv-list-main">
                            <strong>${esc(e.name)}</strong>
                            <span class="dv-badge dv-badge-${e.type}">${RECORD_LABELS[e.type]}</span>
                        </div>
                        <div class="dv-list-sub"><bdi class="dv-num">${esc(e.detail)}</bdi> · ${pDate(e.date)}</div>
                    </li>`).join("")}</ul>`
                : `<div class="dv-empty">رکوردی ثبت نشده. هر حرکت دست‌کم به دو جلسه‌ی کامل نیاز دارد تا با قبلش مقایسه شود.</div>`;

            return `
            <section class="dv-card">
                <header class="dv-card-head">
                    <h3>رکوردهای اخیر</h3>
                    <p>رکورد وزنه، رکورد تکرار و رسیدن به سقف هدف</p>
                </header>
                ${body}
            </section>`;
        }
    };

    /* =========================
       بخش ۷: وضعیت جلسات دوره تمرینی (حفظ‌شده)
       از renderCycleGrid در dashboard.js استفاده می‌کند.
    ========================= */
    const sectionCycle = {
        render(ctx) {
            const data = { programData: ctx.program, cycleWorkouts: ctx.cycle, detected: ctx.detected };
            return `
            <section class="dash-cycle-card">
                <div class="dash-cycle-header">
                    <h3>وضعیت جلسات دوره تمرینی</h3>
                    <p>پیشرفت جلسات هفته‌های ۱ تا ۴ دوره جاری بر اساس سوابق ثبت‌شده در پایگاه‌داده</p>
                </div>
                <div class="dash-cycle-weeks">${renderCycleGrid(data)}</div>
            </section>`;
        },
        mount(slot) {
            slot.querySelectorAll(".dash-cycle-session-item").forEach(item => {
                item.addEventListener("click", () => {
                    const sess = Number(item.dataset.session);
                    const wk = Number(item.dataset.week);
                    if (sess) currentSession = sess;
                    if (wk && typeof weekNumber !== "undefined" && weekNumber) weekNumber.value = wk;
                    switchView("workout");
                });
            });
        }
    };

    /* =========================
       ثبت بخش‌ها و چیدمان
    ========================= */
    const SECTIONS = {
        program: sectionProgram,
        status: sectionStatus,
        progression: sectionProgression,
        compare: sectionCompare,
        ready: sectionReady,
        records: sectionRecords,
        cycle: sectionCycle
    };

    const slot = id => `<div class="dv-slot" data-dv="${id}">${SECTIONS[id].render(ctxCache)}</div>`;

    function layoutHtml() {
        return [
            slot("program"),
            slot("status"),
            slot("progression"),
            `<div class="dv-split">
                ${slot("compare")}
                <div class="dv-stack">${slot("ready")}${slot("records")}</div>
            </div>`,
            slot("cycle")
        ].join("");
    }

    function mountAll(root) {
        Object.keys(SECTIONS).forEach(id => {
            const el = root.querySelector(`[data-dv="${id}"]`);
            if (el && SECTIONS[id].mount) SECTIONS[id].mount(el, ctxCache);
        });
    }

    function refresh(id) {
        const root = document.querySelector(`[data-dv="${id}"]`);
        if (!root || !SECTIONS[id]) return;
        root.innerHTML = SECTIONS[id].render(ctxCache);
        if (SECTIONS[id].mount) SECTIONS[id].mount(root, ctxCache);
    }

    /* =========================
       صفحه‌ی خوش‌آمدگویی (وقتی هیچ برنامه‌ای بارگذاری نشده)
       موبایل: کارت تک‌ستونه مثل قبل / دسکتاپ: طرح دو ستونه
    ========================= */
    const WELCOME_STEPS = [
        { icon: "📋", label: "۱ · برنامه تمرینی", title: "برنامه تمرینی خودت را وارد کن", desc: "برنامه‌ای که شامل جلسات و حرکات تمرینی است را در GymLog بارگذاری کن." },
        { icon: "✍️", label: "۲ · ثبت تمرین", title: "هر ست را ثبت کن", desc: "وزنه، تعداد تکرار و عملکردت را بعد از هر ست ثبت کن." },
        { icon: "📈", label: "۳ · مشاهده پیشرفت", title: "پیشرفتت را دنبال کن", desc: "عملکرد جلسات قبلی را ببین و تغییرات تمرینی خودت را دنبال کن." }
    ];

    function hasDefaultProgram() {
        return typeof defaultProgramPackage !== "undefined" && defaultProgramPackage &&
            (defaultProgramPackage.programsRaw || defaultProgramPackage.catalogAdditions);
    }

    function welcomeHtml() {
        return `
        <section class="dv-welcome">
            <div class="dv-welcome-hero">
                <h2>به GymLog خوش آمدید</h2>
                <p>تمرین‌هایت را ثبت کن، پیشرفتت را دنبال کن و روند تمرینت را از دست نده.</p>
                <div class="dv-welcome-actions">
                    <button type="button" class="primary-btn" id="dvWelcomeUpload">بارگذاری برنامه تمرینی</button>
                    ${hasDefaultProgram() ? `
                    <div class="dv-welcome-default">
                        <button type="button" class="secondary-btn" id="dvWelcomeDefault">شروع با برنامه‌ی پیش‌فرض</button>
                        <small>برای آشنایی سریع با محیط برنامه؛ بعداً می‌توانی برنامه‌ی خودت را اضافه کنی.</small>
                    </div>` : ""}
                </div>
            </div>
            <ol class="dv-welcome-steps">
                ${WELCOME_STEPS.map(s => `
                <li class="dv-welcome-step">
                    <span class="dv-welcome-icon" aria-hidden="true">${s.icon}</span>
                    <div>
                        <span class="dv-welcome-label">${s.label}</span>
                        <strong>${s.title}</strong>
                        <span class="dv-welcome-desc">${s.desc}</span>
                    </div>
                </li>`).join("")}
            </ol>
        </section>`;
    }

    function mountWelcome(root) {
        const up = root.querySelector("#dvWelcomeUpload");
        if (up) up.addEventListener("click", () => {
            const input = document.getElementById("programImportInput");
            if (input) input.click();
        });
        const def = root.querySelector("#dvWelcomeDefault");
        if (def) def.addEventListener("click", async () => {
            await importProgramPackage(defaultProgramPackage);
            if (typeof cacheAndReport === "function") await cacheAndReport("برنامه‌ی پیش‌فرض با موفقیت بارگذاری شد.");
            location.reload();
        });
    }

    /* =========================
       نقطه‌ی ورود (جایگزین renderDesktopDashboard قدیمی)
    ========================= */
    window.renderDesktopDashboard = function renderDesktopDashboard() {
        const container = document.getElementById("dashboardOverviewContainer");
        if (!container) return;

        ctxCache = buildContext();

        if (Object.keys(ctxCache.programs).length === 0) {
            container.innerHTML = welcomeHtml();
            mountWelcome(container);
            return;
        }

        container.innerHTML = `<div class="dv-root">${layoutHtml()}</div>`;
        mountAll(container);
    };

    /* بعد از آماده شدن IndexedDB دوباره رندر کن، چون رندر اولیه ممکن است قبل از آن اجرا شده باشد */
    if (window.GymLogStoreCache && window.GymLogStoreCache.readyPromise) {
        window.GymLogStoreCache.readyPromise.then(() => {
            setTimeout(() => {
                const noProgram = typeof workoutPrograms === "undefined" || Object.keys(workoutPrograms).length === 0;
                if (noProgram && typeof currentDesktopView !== "undefined" && currentDesktopView === "workout") {
                    switchView("dashboard");
                } else if (typeof currentDesktopView !== "undefined" && currentDesktopView === "dashboard") {
                    window.renderDesktopDashboard();
                }
            }, 0);
        }).catch(() => {});
    }
})();
