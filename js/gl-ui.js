/* =====================================================
   GymLog — لایه‌ی رابط کاربری (فقط نمایش)

   ۱) آیکون‌های SVG یکدست به‌جای ایموجی (نوار موبایل، همبرگر)
   ۲) صفحه‌ی خانه (هیرو) به‌صورت view جداگانه؛ در دسکتاپ فقط منوی افقی کوچک دارد
   ۳) منوی همبرگری موبایل: همه‌ی صفحات برنامه
   ۴) ثبت سریع‌تر ست: Enter برای رفتن به فیلد بعد، انتخاب خودکار مقدار، دکمه‌ی «مثل قبل»

   باید آخرین اسکریپت در index.html باشد. به storage/app دست نمی‌زند.
===================================================== */
(function () {
    "use strict";

    /* ---------- آیکون‌ها (خطی، ۲۴×۲۴) ---------- */
    const P = {
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
        arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
    };
    const ic = (name, size) =>
        `<svg class="gl-ic" width="${size || 20}" height="${size || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;

    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const go = v => { if (typeof switchView === "function") switchView(v); };

    /* ---------- ۱) آیکون‌ها در نوار موبایل ---------- */
    function applyIcons() {
        $$(".mobile-tab-btn[data-nav]").forEach(btn => {
            if ($(".gl-ic", btn)) return;
            btn.insertAdjacentHTML("afterbegin", ic(btn.dataset.nav === "workout" ? "workout" : "dashboard", 18));
        });

        const burger = $("#openSettingsBtn");
        if (burger) {
            burger.innerHTML = ic("menu", 22);
            burger.setAttribute("aria-label", "منو");
        }

        /* نام برنامه = بازگشت به خانه */
        [".mobile-nav-brand"].forEach(sel => {
            const el = $(sel);
            if (!el || el.dataset.glHome) return;
            el.dataset.glHome = "1";
            el.classList.add("gl-brand-link");
            el.setAttribute("role", "link");
            el.setAttribute("tabindex", "0");
            el.setAttribute("aria-label", "رفتن به خانه");
            el.addEventListener("click", () => go("home"));
            el.addEventListener("keydown", e => { if (e.key === "Enter") go("home"); });
        });
    }

    /* ---------- ۲) هیرو ---------- */
    const ART = `
        <svg viewBox="0 0 320 220" role="img" aria-label="تصویر هالتر">
            <circle cx="160" cy="110" r="96" fill="var(--rd-soft)"/>
            <circle cx="160" cy="110" r="68" fill="none" stroke="var(--rd-line)" stroke-width="2" stroke-dasharray="3 9" stroke-linecap="round"/>
            <rect x="28" y="104" width="264" height="12" rx="6" fill="var(--rd-text)" opacity=".88"/>
            <rect x="50" y="88" width="14" height="44" rx="5" fill="var(--rd-text)"/>
            <rect x="256" y="88" width="14" height="44" rx="5" fill="var(--rd-text)"/>
            <rect x="72" y="58" width="24" height="104" rx="9" fill="var(--rd-accent)"/>
            <rect x="98" y="72" width="16" height="76" rx="6" fill="var(--rd-accent)" opacity=".55"/>
            <rect x="224" y="58" width="24" height="104" rx="9" fill="var(--rd-accent)"/>
            <rect x="206" y="72" width="16" height="76" rx="6" fill="var(--rd-accent)" opacity=".55"/>
            <path d="M120 186h24l8-16 12 30 10-22 8 8h18" fill="none" stroke="var(--rd-accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

    function heroHtml() {
        const feats = [
            ["ثبت سریع ست", "با دکمه‌ی «مثل قبل»"],
            ["تایمر استراحت", "با بوق و لرزش"],
            ["داشبورد تحلیلی", "نمودار و رکوردها"],
            ["سوپرست و یادداشت", "برای هر جلسه و حرکت"],
            ["بدون اینترنت", "اطلاعات روی دستگاه تو"]
        ];
        return `
        <section class="gl-hero" id="glHero" aria-label="خانه">
            <div class="gl-hero-bg" aria-hidden="true">
                <span class="gl-hero-grid"></span><span class="gl-hero-glow"></span>
                <div class="gl-hero-art">${ART}</div>
            </div>
            <div class="gl-hero-body">
                <div class="gl-hero-brandrow"><span class="gl-hero-mark" aria-hidden="true">GL</span><span class="gl-hero-brandword">GymLog</span></div>
                <h2>ثبت تمرینات بدنسازی</h2>
                <p class="gl-hero-sub">تمرین‌ها را ثبت کن، پیشرفتت را ببین و همه‌چیز را پیش خودت نگه دار؛ بدون حساب کاربری و بدون سرور.</p>
                <ul class="gl-hero-feats">
                    ${feats.map(([t, d], i) => `<li><span class="gl-feat-ico" aria-hidden="true">${ic(["workout", "timer", "chart", "note", "offline"][i], 22)}</span><b>${t}</b><span>${d}</span></li>`).join("")}
                </ul>
                <div class="gl-hero-cta">
                    <button type="button" class="primary-btn gl-cta" data-hero="start">شروع تمرین ${ic("arrow", 20).replace('class="gl-ic"', 'class="gl-ic gl-arrow"')}</button>
                    <button type="button" class="secondary-btn gl-cta-2" data-hero="help">${ic("bank", 18)} راهنمای استفاده</button>
                </div>
            </div>
            <button type="button" class="gl-hero-scroll" data-hero="scroll" aria-label="ادامه‌ی صفحه">${ic("chart", 20)}</button>
        </section>`;
    }

    function quickHtml() {
        return `
        <section class="gl-sec" aria-labelledby="glQuick">
            <h3 id="glQuick">دسترسی سریع</h3>
            <nav class="gl-quick" aria-label="دسترسی سریع">
                <button type="button" data-hero="programs">${ic("programs", 18)} برنامه‌ها</button>
                <button type="button" data-hero="analysis">${ic("chart", 18)} تحلیل پیشرفت</button>
                <button type="button" data-hero="history">${ic("history", 18)} تاریخچه</button>
                <button type="button" data-hero="calendar">${ic("calendar", 18)} تقویم</button>
            </nav>
        </section>`;
    }

    /* ---------- صفحه‌ی خانه ---------- */
    const NAV_MAIN = [["home", "خانه"], ["dashboard", "داشبورد"], ["workout", "تمرین امروز"],
        ["calendar", "تقویم تمرین"], ["backup", "پشتیبان‌گیری"], ["help", "راهنما"]];
    const NAV_MORE = [["programs", "برنامه‌های تمرینی"], ["history", "تاریخچه تمرینات"], ["bank", "بانک حرکات"],
        ["user", "کاربران"], ["settings", "تنظیمات"]];

    /* منوی افقی سراسری دسکتاپ: تنها منوی دسکتاپ است */
    function buildTopNav() {
        const host = $(".app-body");
        if (!host || $("#glTopnav")) return;
        const nav = document.createElement("nav");
        nav.id = "glTopnav";
        nav.className = "gl-topnav";
        nav.setAttribute("aria-label", "منوی اصلی");
        nav.innerHTML = `
            <a class="gl-topnav-brand" href="#" data-go="home"><span class="gl-hero-mark">GL</span> GymLog</a>
            <div class="gl-topnav-links">
                ${NAV_MAIN.map(([v, l]) => `<button type="button" data-go="${v}">${l}</button>`).join("")}
                <details class="gl-more">
                    <summary>بیشتر</summary>
                    <div class="gl-more-panel">
                        ${NAV_MORE.map(([v, l]) => `<button type="button" data-go="${v}">${l}</button>`).join("")}
                    </div>
                </details>
            </div>
            <div class="gl-topnav-tools"></div>`;
        host.insertBefore(nav, host.firstChild);

        /* انتخاب کاربر و دکمه‌ی تم از نوار قدیمی به اینجا منتقل می‌شوند (شناسه‌ها و رویدادها حفظ می‌شود) */
        const tools = $(".gl-topnav-tools", nav);
        ["desktopUserChip", "desktopUserSelect", "desktopThemeIconBtn"].forEach(id => {
            const el = document.getElementById(id);
            if (el) tools.appendChild(el);
        });

        nav.addEventListener("click", e => {
            const g = e.target.closest("[data-go]");
            if (!g) return;
            e.preventDefault();
            const more = $(".gl-more", nav);
            if (more) more.open = false;
            go(g.dataset.go);
        });
        document.addEventListener("click", e => {
            const more = $(".gl-more", nav);
            if (more && more.open && !more.contains(e.target)) more.open = false;
        });
    }

    function markNav() {
        const cur = typeof currentDesktopView !== "undefined" ? currentDesktopView : "";
        $$("#glTopnav [data-go]").forEach(b => b.classList.toggle("is-active", b.dataset.go === cur));
        const more = $("#glTopnav .gl-more > summary");
        if (more) more.classList.toggle("is-active", NAV_MORE.some(([v]) => v === cur));
    }

    function sectionsHtml() {
        const why = [
            ["shield", "همه‌چیز پیش خودت", "حساب کاربری و سرور ندارد. تمرین‌ها فقط روی دستگاه خودت می‌مانند؛ فقط اگر همگام‌سازی با بله را روشن کنی، پشتیبان به چت خودت می‌رود."],
            ["bolt", "ساخته‌شده برای باشگاه", "دکمه‌های درشت، ثبت ست با چند لمس، تایمر استراحت و کار بدون اینترنت؛ وقتی دست‌هایت خسته است هم راحت کار می‌کند."],
            ["chart", "فقط ثبت نیست، تحلیل است", "نمودار روند هر حرکت، رکوردها و حرکات آماده‌ی افزایش وزنه، فقط از روی اعدادی که خودت ثبت کرده‌ای؛ بدون امتیاز ساختگی."],
            ["users", "برای ورزشکار و مربی", "برنامه‌ی مربی را بارگذاری کن یا برای شاگردانت کاربر جدا بساز و برنامه‌ی جدید تحویل بده."]
        ];
        const feats = [
            ["workout", "ثبت سریع ست", "وزنه و تکرار، دکمه‌ی «مثل قبل» و هشدار اعداد مشکوک"],
            ["timer", "تایمر استراحت", "بر اساس برنامه، با بوق و لرزش در پایان"],
            ["note", "سوپرست و یادداشت", "حرکات پشت‌سرهم و یادداشت برای جلسه و هر حرکت"],
            ["chart", "داشبورد تحلیلی", "نمودار هر حرکت، گروه‌های عضلانی و رکوردها"],
            ["programs", "ساخت برنامه", "انتخاب حرکت، ست و تکرار؛ ثبت مستقیم یا فایل JSON"],
            ["users", "چندکاربره", "پروفایل، روند وزن و دور کمر و یادداشت برای هر نفر"],
            ["sync", "پشتیبان و همگام‌سازی", "فایل پشتیبان و همگام‌سازی با بله با یک دکمه"],
            ["offline", "بدون اینترنت", "بعد از اولین بازکردن، آفلاین هم کار می‌کند"]
        ];
        const steps = [
            ["برنامه را آماده کن", "فایل برنامه‌ی مربی را بارگذاری کن یا خودت از «برنامه‌های تمرینی» یک برنامه بساز."],
            ["هر ست را ثبت کن", "در «تمرین امروز» وزنه و تکرار را بنویس. اطلاعات خودکار ذخیره می‌شود و تایمر استراحت کنارت است."],
            ["پیشرفتت را ببین", "در داشبورد روند و رکوردها را ببین و گاهی پشتیبان بگیر تا اطلاعاتت گم نشود."]
        ];
        return `
        <section class="gl-sec" aria-labelledby="glWhy">
            <h3 id="glWhy">چرا GymLog؟</h3>
            <div class="gl-why">
                ${why.map(([i, t, d]) => `<article class="gl-why-item"><span class="gl-ico-box">${ic(i, 22)}</span><div><h4>${t}</h4><p>${d}</p></div></article>`).join("")}
            </div>
        </section>
        <section class="gl-sec" aria-labelledby="glHow">
            <h3 id="glHow">چطور کار می‌کند؟</h3>
            <ol class="gl-steps">
                ${steps.map(([t, d], i) => `<li><span class="gl-step-n">${toFa(i + 1)}</span><div><h4>${t}</h4><p>${d}</p></div></li>`).join("")}
            </ol>
        </section>
        <section class="gl-sec" aria-labelledby="glFeat">
            <h3 id="glFeat">امکانات مهم</h3>
            <div class="gl-feat-grid">
                ${feats.map(([i, t, d]) => `<article class="gl-feat"><span class="gl-ico-box">${ic(i, 22)}</span><h4>${t}</h4><p>${d}</p></article>`).join("")}
            </div>
        </section>
        <section class="gl-sec gl-privacy" aria-label="حریم خصوصی">
            <span class="gl-ico-box">${ic("shield", 22)}</span>
            <div><h4>همه‌چیز پیش خودت می‌ماند</h4><p>تمرین‌ها فقط در مرورگر همین دستگاه ذخیره می‌شوند و به هیچ سروری ارسال نمی‌شوند؛ مگر خودت همگام‌سازی با بله را روشن کنی.</p></div>
        </section>`;
    }

    function footerHtml() {
        const c = typeof HELP_CONTACT !== "undefined" ? HELP_CONTACT
            : { email: "j_rafiee@yahoo.com", telegramId: "@javadrafie", telegramUrl: "https://t.me/javadrafie" };
        return `
        <footer class="gl-footer">
            <div class="gl-footer-text"><b>GymLog</b><span>دفترچه‌ی تمرین فارسی؛ اطلاعات فقط روی دستگاه خودت می‌ماند.</span></div>
            <div class="gl-footer-links" aria-label="راه‌های ارتباط با ما">
                <span>ارتباط با ما:</span>
                <a href="mailto:${esc(c.email)}">${ic("mail", 18)}<bdi dir="ltr">${esc(c.email)}</bdi></a>
                <a href="${esc(c.telegramUrl)}" target="_blank" rel="noopener noreferrer">${ic("send", 18)}<bdi dir="ltr">${esc(c.telegramId)}</bdi></a>
            </div>
        </footer>`;
    }

    function ensureHomeView() {
        if (typeof VIEW_TITLES !== "undefined") VIEW_TITLES.home = "خانه";
        if (document.getElementById("viewHome")) return;
        const d = document.createElement("div");
        d.id = "viewHome";
        d.className = "app-view";
        const host = $(".app-body");
        if (host) host.appendChild(d);
    }

    function renderHome() {
        const view = document.getElementById("viewHome");
        if (!view || !window.DashAnalytics) return;
        try {
            view.innerHTML = `${heroHtml()}<div class="gl-home-wrap" id="glHomeWrap">${quickHtml()}${sectionsHtml()}</div>${footerHtml()}`;
        } catch (err) {
            console.error("[GymLog UI] ساخت صفحه‌ی خانه ناموفق بود:", err);
            return;
        }
        view.onclick = e => {
            const g = e.target.closest("[data-go]");
            if (g) { go(g.dataset.go); return; }
            const b = e.target.closest("[data-hero]");
            if (!b) return;
            const act = b.dataset.hero;
            const hasProg = typeof workoutPrograms !== "undefined" && Object.keys(workoutPrograms).length > 0;
            if (act === "start") {
                if (!hasProg) { go("dashboard"); return; }
                const d = detectNextWeekAndSession(currentMonth);
                currentSession = d.session;
                if (typeof weekNumber !== "undefined" && weekNumber) weekNumber.value = d.week;
                go("workout");
            } else if (act === "help") {
                go("help");
            } else if (act === "scroll") {
                const w = document.getElementById("glHomeWrap");
                if (w) w.scrollIntoView({ behavior: "smooth", block: "start" });
            } else if (act === "analysis") {
                go("dashboard");
                setTimeout(() => {
                    const el = document.querySelector('.dv-slot[data-dv="progression"]');
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 60);
            } else {
                go(act);
            }
        };
    }

    function wrapSwitchView() {
        const orig = window.switchView;
        if (typeof orig !== "function" || orig.__glWrapped) return;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            const home = typeof currentDesktopView !== "undefined" && currentDesktopView === "home";
            document.body.classList.toggle("gl-home", home);
            if (home) renderHome();
            markNav();
            return r;
        };
        wrapped.__glWrapped = true;
        window.switchView = wrapped;
    }

    /* ---------- ۳) منوی همبرگری موبایل ---------- */
    const MENU = [
        ["home", "خانه", "home"], ["dashboard", "داشبورد", "dashboard"], ["workout", "ثبت تمرین", "workout"],
        ["programs", "برنامه‌های تمرینی", "programs"], ["history", "تاریخچه", "history"],
        ["calendar", "تقویم تمرین", "calendar"], ["bank", "بانک حرکات", "bank"],
        ["user", "کاربران", "user"], ["help", "راهنما", "help"],
        ["backup", "پشتیبان‌گیری", "backup"]
    ];

    function buildMenu() {
        const content = $(".settings-content");
        if (!content || $(".gl-menu-group", content)) return;

        const sec = document.createElement("section");
        sec.className = "settings-group gl-menu-group";
        sec.innerHTML = `
            <h3 class="settings-group-title">صفحات</h3>
            <div class="gl-menu-grid">
                ${MENU.map(([v, label, icon]) => `<button type="button" data-menu="${v}">${ic(icon, 22)}<span>${label}</span></button>`).join("")}
            </div>`;
        content.insertBefore(sec, content.firstChild);

        sec.addEventListener("click", e => {
            const b = e.target.closest("[data-menu]");
            if (!b) return;
            const v = b.dataset.menu;
            if (v === "home" || v === "dashboard" || v === "workout") {
                if (typeof closeSettingsPage === "function") closeSettingsPage();
                go(v);
            } else if (typeof openFromSettings === "function") {
                openFromSettings(v);
            } else {
                go(v);
            }
        });
    }

    function markCurrentMenu() {
        const cur = typeof currentDesktopView !== "undefined" ? currentDesktopView : "";
        $$(".gl-menu-grid button").forEach(b => b.classList.toggle("is-current", b.dataset.menu === cur));
    }

    /* ---------- ۴) ثبت سریع ست ---------- */
    function enhanceSets(root) {
        $$(".set-row:not([data-gl])", root).forEach(row => {
            row.dataset.gl = "1";
            const w = $(".weight-input", row), r = $(".reps-input", row);
            if (w) w.setAttribute("enterkeyhint", "next");
            if (r) r.setAttribute("enterkeyhint", "next");

            const rw = row.dataset.refW, rr = row.dataset.refR;
            const slot = $(".set-difference", row);
            if ((rw || rr) && slot && w && r) {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "gl-copy-prev";
                b.textContent = "مثل قبل";
                b.setAttribute("aria-label", "پر کردن این ست با مقدار جلسه‌ی قبل");
                b.addEventListener("click", () => {
                    if (rw) w.value = rw;
                    if (rr) r.value = rr;
                    [w, r].forEach(el => el.dispatchEvent(new Event("input", { bubbles: true })));
                    r.focus();
                });
                slot.appendChild(b);
            }
        });
    }

    function initSetEntry() {
        const list = document.getElementById("exerciseList");
        if (!list) return;
        enhanceSets(list);
        new MutationObserver(() => enhanceSets(list)).observe(list, { childList: true, subtree: true });

        list.addEventListener("focusin", e => {
            const t = e.target;
            if (t.matches && t.matches(".weight-input, .reps-input")) {
                setTimeout(() => { try { t.select(); } catch (err) { /* ignore */ } }, 0);
            }
        });

        list.addEventListener("keydown", e => {
            if (e.key !== "Enter") return;
            const t = e.target;
            if (!t.matches || !t.matches(".weight-input, .reps-input")) return;
            e.preventDefault();
            const inputs = $$(".weight-input, .reps-input", list);
            const next = inputs[inputs.indexOf(t) + 1];
            if (next) next.focus(); else t.blur();
        });
    }

    /* ---------- راه‌اندازی ---------- */
    function init() {
        ensureHomeView();
        buildTopNav();
        applyIcons();
        wrapSwitchView();
        buildMenu();
        initSetEntry();

        /* دسکتاپ: صفحه‌ی اول همان خانه است */
        const wide = window.matchMedia && window.matchMedia("(min-width: 1024px)").matches;
        markNav();
        if (wide && typeof currentDesktopView !== "undefined" && currentDesktopView === "dashboard") go("home");

        const cache = window.GymLogStoreCache;
        if (cache && cache.readyPromise) {
            cache.readyPromise.then(() => setTimeout(() => {
                if (typeof currentDesktopView !== "undefined" && currentDesktopView === "home") renderHome();
            }, 120)).catch(() => {});
        }

        const burger = $("#openSettingsBtn");
        if (burger) burger.addEventListener("click", () => { buildMenu(); markCurrentMenu(); });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
