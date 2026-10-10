/* =====================================================
   GymLog — ساخت برنامه تمرینی + صفحه‌ی کاربر

   ۱) openProgramBuilder()  فرم چندمرحله‌ای ساخت برنامه
        مرحله ۱: تعداد روزهای تمرین در هفته
        مرحله ۲: انتخاب حرکات هر روز (دسکتاپ: درگ و دراپ، موبایل: انتخاب از پنجره‌ی پایین)
        مرحله ۳: مشخصات کاربر (نام، سن، قد، دور کمر، وزن)
        مرحله ۴: خروجی (ثبت مستقیم در برنامه یا دانلود فایل JSON)
   ۲) renderUserView()      صفحه‌ی «کاربران»: فهرست کاربران، افزودن/حذف، ویرایش مشخصات،
                            ساخت برنامه و «به‌روزرسانی اطلاعات تمرین» برای هر کاربر
   ۳) renderUserChip()      انتخاب کاربر فعال در نوار بالا (با یک کاربر: فقط نام)

   نیازمند: storage.js (getUserProfile, saveUserProfile, importProgramPackage,
   getEffectiveCatalog, getEffectiveProgramsRaw) و app.js / dashboard.js
===================================================== */

(function () {
    "use strict";

    /* =========================
       ثابت‌ها
    ========================= */
    const CAT_ORDER = MUSCLE_GROUP_ORDER;

    const UNIT_OPTS = [
        ["reps", "تکرار"],
        ["sec", "ثانیه"],
        ["reps_side", "تکرار هر طرف"],
        ["sec_side", "ثانیه هر طرف"]
    ];
    const UNIT_SUFFIX = { reps: "", sec: " ثانیه", reps_side: " هر طرف", sec_side: " ثانیه هر طرف" };
    const DEFAULT_UNIT = {
        plank: "sec",
        side_plank: "sec_side",
        dead_bug: "reps_side",
        pallof_press: "reps_side",
        bulgarian_split_squat: "reps_side"
    };

    const REST_OPTS = ["30 ثانیه", "45 ثانیه", "60 ثانیه", "90 ثانیه", "2 دقیقه", "3 دقیقه", "4 دقیقه"];

    const STEP_LABELS = { days: "روزها", exercises: "حرکات", profile: "مشخصات", output: "خروجی" };

    const RANGES = {
        height: [100, 250, "قد"],
        waist: [30, 250, "دور کمر"],
        weight: [20, 400, "وزن"]
    };

    /* =========================
       ابزارها
    ========================= */

    /* ورودی فارسی/عربی/انگلیسی → عدد */
    function normNum(v) {
        const t = toLatinDigits(v).replace(/[٫,]/g, ".").trim();
        if (t === "") return NaN;
        const n = Number(t);
        return isFinite(n) ? n : NaN;
    }

    function catOf(id, item) {
        return (item && item.category) || EXERCISE_CATEGORIES_MAP[id] || "سایر";
    }

    function isDesktopLayout() {
        return window.matchMedia && window.matchMedia("(min-width: 900px)").matches;
    }

    function nextMonthKey(userId) {
        const keys = Object.keys(getEffectiveProgramsRaw(userId) || {});
        let max = 0;
        keys.forEach(k => {
            const n = parseInt(String(k).replace(/\D/g, ""), 10);
            if (!isNaN(n) && n > max) max = n;
        });
        return { key: "month" + (max + 1), n: max + 1 };
    }

    /* =====================================================
       مشخصات کاربر: فرم، اعتبارسنجی، چیپ بالای صفحه
    ===================================================== */
    function currentJalaliYear() {
        try { return isoToJalali(getToday()).jy; } catch (e) { return new Date().getFullYear() - 621; }
    }

    function fieldHtml(name, label, unit, value, opts) {
        opts = opts || {};
        return `
            <label class="pb-field ${opts.wide ? "pb-field-wide" : ""}">
                <span class="pb-label">${label}</span>
                <span class="pb-input">
                    <input type="text" name="${name}" ${opts.mode ? `inputmode="${opts.mode}"` : ""} ${opts.max ? `maxlength="${opts.max}"` : ""} ${opts.auto ? `autocomplete="${opts.auto}"` : ""} placeholder="${esc(opts.ph || "")}" value="${esc(value)}">
                    ${unit ? `<em>${unit}</em>` : ""}
                </span>
            </label>`;
    }

    function profileFieldsHtml(p) {
        p = p || {};
        const val = v => (v === undefined || v === null ? "" : toFa(v));
        return `
        <div class="pb-form-grid">
            ${fieldHtml("fullName", "نام و نام خانوادگی", "", p.fullName || "", { wide: true, max: 60, auto: "name", ph: "مثلاً علی رضایی" })}
            ${fieldHtml("birthYear", "سال تولد (شمسی)", "", val(p.birthYear), { mode: "numeric", max: 4, ph: toFa(currentJalaliYear() - 28) })}
            ${fieldHtml("height", "قد", "cm", val(p.height), { mode: "decimal" })}
            ${fieldHtml("waist", "دور کمر", "cm", val(p.waist), { mode: "decimal" })}
            ${fieldHtml("weight", "وزن", "kg", val(p.weight), { mode: "decimal" })}
        </div>`;
    }

    function readProfileFields(root) {
        const get = n => root.querySelector(`[name="${n}"]`).value;
        const fullName = get("fullName").trim().replace(/\s+/g, " ");
        if (!fullName) return { error: "نام و نام خانوادگی را وارد کن.", field: "fullName" };

        const out = { fullName };

        const cy = currentJalaliYear();
        const by = normNum(get("birthYear"));
        if (isNaN(by)) return { error: "سال تولد را وارد کن.", field: "birthYear" };
        if (by < 1300 || by > cy - 5 || Math.round(by) !== by) {
            return { error: `سال تولد باید یک سال شمسی بین ${toFa(1300)} تا ${toFa(cy - 5)} باشد.`, field: "birthYear" };
        }
        out.birthYear = by;

        for (const key of Object.keys(RANGES)) {
            const [min, max, label] = RANGES[key];
            const n = normNum(get(key));
            if (isNaN(n)) return { error: `${label} را وارد کن.`, field: key };
            if (n < min || n > max) return { error: `${label} باید بین ${toFa(min)} تا ${toFa(max)} باشد.`, field: key };
            out[key] = Math.round(n * 10) / 10;
        }
        return { profile: out };
    }

    /* =====================================================
       کاربر فعال در نوار بالا
    ===================================================== */
    function reloadAfterUserChange() {
        try {
            if (typeof currentDesktopView !== "undefined") sessionStorage.setItem("gymReturnView", currentDesktopView);
        } catch (e) { /* ignore */ }
        location.reload();
    }

    function renderUserChip() {
        const users = typeof getUsers === "function" ? getUsers() : [];
        const activeId = typeof getActiveUserId === "function" ? getActiveUserId() : null;

        ["desktop", "mobile"].forEach(prefix => {
            const chip = document.getElementById(prefix + "UserChip");
            const sel = document.getElementById(prefix + "UserSelect");
            if (!chip) return;

            if (!users.length) {
                chip.hidden = true;
                if (sel) sel.hidden = true;
                return;
            }

            if (users.length === 1 || !sel) {
                chip.textContent = getUserDisplayName(users[0]);
                chip.title = "مدیریت کاربران";
                chip.hidden = false;
                if (sel) sel.hidden = true;
                return;
            }

            chip.hidden = true;
            sel.innerHTML = users.map(u =>
                `<option value="${esc(u.id)}" ${u.id === activeId ? "selected" : ""}>${esc(getUserDisplayName(u))}</option>`
            ).join("") + `<option value="__manage">⚙ مدیریت کاربران…</option>`;
            sel.value = activeId;
            sel.hidden = false;
        });
    }

    function initUserChip() {
        ["desktop", "mobile"].forEach(prefix => {
            const chip = document.getElementById(prefix + "UserChip");
            if (chip) chip.addEventListener("click", () => switchView("user"));

            const sel = document.getElementById(prefix + "UserSelect");
            if (sel) {
                sel.addEventListener("change", async () => {
                    const activeId = getActiveUserId();
                    if (sel.value === "__manage") {
                        sel.value = activeId;
                        switchView("user");
                        return;
                    }
                    if (sel.value === activeId) return;
                    if (await setActiveUser(sel.value)) reloadAfterUserChange();
                });
            }
        });
        renderUserChip();
        const cache = window.GymLogStoreCache;
        if (cache && cache.readyPromise) cache.readyPromise.then(renderUserChip).catch(() => {});
    }

    /* =====================================================
       صفحه‌ی «کاربران»
    ===================================================== */
    let editingUserId = null;   // null = فهرست، "new" = کاربر جدید، یا شناسه‌ی کاربرِ در حال ویرایش
    let mergeTargetId = null;

    function tile(label, value, unit) {
        return `
        <div class="pb-tile">
            <span>${esc(label)}</span>
            <strong>${value}${unit ? ` <small>${esc(unit)}</small>` : ""}</strong>
        </div>`;
    }

    function userCardHtml(u, activeId) {
        const p = u.profile;
        const isActive = u.id === activeId;
        const name = getUserDisplayName(u);
        const cy = currentJalaliYear();
        const meta = p && p.birthYear
            ? `متولد ${toFa(p.birthYear)} · ${toFa(cy - p.birthYear)} ساله`
            : "مشخصات ثبت نشده است";

        let tiles = "";
        if (p && p.height && p.weight && p.waist) {
            const h = p.height / 100;
            const bmi = Math.round((p.weight / (h * h)) * 10) / 10;
            const whtr = Math.round((p.waist / p.height) * 100) / 100;
            tiles += tile("قد", toFa(p.height), "cm") +
                tile("وزن", toFa(p.weight), "kg") +
                tile("دور کمر", toFa(p.waist), "cm") +
                tile("شاخص توده‌ی بدنی", toFa(bmi), "") +
                tile("نسبت دور کمر به قد", toFa(whtr), "");
        }
        tiles += tile("جلسات ثبت‌شده", toFa(getUserWorkoutCount(u.id)), "") +
            tile("برنامه‌ها", toFa(getUserProgramCount(u.id)), "");

        return `
        <section class="card pb-user-card pb-user-item ${isActive ? "active" : ""}" data-uid="${esc(u.id)}">
            <div class="pb-user-head">
                <span class="pb-avatar" aria-hidden="true">${esc((name.trim().charAt(0)) || "؟")}</span>
                <div>
                    <h3 class="pb-user-title">${esc(name)}${isActive ? ' <span class="pb-badge-active">کاربر فعال</span>' : ""}</h3>
                    <span class="pb-muted">${meta}</span>
                </div>
            </div>
            <div class="pb-tiles">${tiles}</div>
            <div class="pb-user-btns">
                ${isActive ? "" : `<button type="button" class="primary-btn" data-act="select">انتخاب این کاربر</button>`}
                <button type="button" class="secondary-btn" data-act="edit">ویرایش مشخصات</button>
                <button type="button" class="secondary-btn" data-act="build">ساخت برنامه تمرینی</button>
                <button type="button" class="secondary-btn" data-act="merge">به‌روزرسانی اطلاعات تمرین</button>
                <button type="button" class="secondary-btn" data-act="export">پشتیبان این کاربر</button>
                <button type="button" class="danger-btn" data-act="delete">حذف کاربر</button>
            </div>
        </section>`;
    }

    function renderUserForm(container, users) {
        const isNew = editingUserId === "new";
        const u = isNew ? null : users.find(x => x.id === editingUserId);
        if (!isNew && !u) { editingUserId = null; renderUserView(); return; }
        const p = u ? u.profile : null;

        container.innerHTML = `
        <div class="pb-user-wrap">
            <section class="card pb-user-card">
                <div class="pb-form-head">
                    <span class="pb-form-icon" aria-hidden="true">👤</span>
                    <div>
                        <h3 class="pb-user-title">${isNew ? "افزودن کاربر جدید" : (p ? "ویرایش مشخصات" : "مشخصات کاربر")}</h3>
                        <p class="pb-muted">${isNew
                            ? "نام و اندازه‌های بدنی کاربر جدید را وارد کن. تمرین‌ها و برنامه‌ی هر کاربر جدا نگه‌داری می‌شود."
                            : (p ? "اطلاعات را به‌روز کن." : "هنوز مشخصاتی ثبت نشده. نام، سال تولد و اندازه‌های بدنی را وارد کن.")}</p>
                    </div>
                </div>
                <div id="pbUserForm">${profileFieldsHtml(p)}</div>
                <p class="pb-error" id="pbUserError" role="alert"></p>
                <div class="pb-actions">
                    <button type="button" class="primary-btn" id="pbUserSave">${isNew ? "افزودن کاربر" : "ذخیره مشخصات"}</button>
                    <button type="button" class="secondary-btn" id="pbUserCancel">انصراف</button>
                </div>
            </section>
        </div>`;

        container.querySelector("#pbUserSave").addEventListener("click", async () => {
            const r = readProfileFields(container.querySelector("#pbUserForm"));
            const errEl = container.querySelector("#pbUserError");
            if (r.error) {
                errEl.textContent = r.error;
                const f = container.querySelector(`[name="${r.field}"]`);
                if (f) f.focus();
                return;
            }
            if (isNew) {
                const nu = await createUser(r.profile);
                toast(`کاربر «${getUserDisplayName(nu)}» اضافه شد.`);
            } else {
                await saveUserProfile(r.profile, editingUserId);
                toast("مشخصات کاربر ذخیره شد.");
            }
            editingUserId = null;
            renderUserChip();
            renderUserView();
        });
        container.querySelector("#pbUserCancel").addEventListener("click", () => {
            editingUserId = null;
            renderUserView();
        });
    }

    function renderUserView() {
        const container = document.getElementById("viewUserContainer");
        if (!container) return;

        const users = getUsers();
        const activeId = getActiveUserId();

        if (!users.length) {
            container.innerHTML = `<div class="pb-user-wrap"><p class="pb-muted">در حال بارگذاری اطلاعات…</p></div>`;
            return;
        }
        if (editingUserId) { renderUserForm(container, users); return; }

        container.innerHTML = `
        <div class="pb-user-wrap">
            <div class="pb-users-head">
                <div>
                    <h3 class="pb-user-title">کاربران (${toFa(users.length)})</h3>
                    <p class="pb-muted">تمرین‌ها و برنامه‌ی هر کاربر جدا ذخیره می‌شود. کاربر فعال را از نوار بالا یا همین‌جا عوض کن.</p>
                </div>
                <button type="button" class="primary-btn" id="pbUserAdd">+ افزودن کاربر جدید</button>
            </div>
            <div class="pb-user-list">${users.map(u => userCardHtml(u, activeId)).join("")}</div>
            <p class="pb-note">«به‌روزرسانی اطلاعات تمرین»: فایل پشتیبان یک کاربر را انتخاب می‌کنی و تمرین‌ها و برنامه‌های آن به اطلاعات همین کاربر اضافه می‌شود؛ موارد تکراری دوباره ثبت نمی‌شوند و چیزی حذف نمی‌شود. «پشتیبان این کاربر» فقط اطلاعات همان کاربر را می‌دهد؛ پشتیبان همه‌ی کاربران از بخش «پشتیبان‌گیری» گرفته می‌شود. شاخص توده‌ی بدنی و نسبت دور کمر به قد فقط مرجع تقریبی‌اند.</p>
            <input type="file" id="pbMergeFile" accept=".json" hidden>
        </div>`;

        container.querySelector("#pbUserAdd").addEventListener("click", () => {
            editingUserId = "new";
            renderUserView();
        });

        const fileInput = container.querySelector("#pbMergeFile");
        fileInput.addEventListener("change", async e => {
            const file = e.target.files[0];
            e.target.value = "";
            if (file && mergeTargetId) await mergeFromFile(file, mergeTargetId);
        });

        container.querySelector(".pb-user-list").addEventListener("click", async e => {
            const btn = e.target.closest("[data-act]");
            if (!btn) return;
            const card = btn.closest("[data-uid]");
            const uid = card.dataset.uid;
            const act = btn.dataset.act;

            if (act === "select") {
                if (await setActiveUser(uid)) reloadAfterUserChange();
            } else if (act === "edit") {
                editingUserId = uid;
                renderUserView();
            } else if (act === "build") {
                openProgramBuilder(uid);
            } else if (act === "merge") {
                mergeTargetId = uid;
                fileInput.click();
            } else if (act === "export") {
                const ok = exportData({
                    userId: uid,
                    fileName: buildBackupFileName().replace("gymlog-backup-", "gymlog-user-backup-")
                });
                toast(ok ? "فایل پشتیبان این کاربر دانلود شد." : "تهیه‌ی پشتیبان انجام نشد.", ok ? "success" : "warning");
            } else if (act === "delete") {
                await deleteUserFlow(uid);
            }
        });
    }

    async function deleteUserFlow(uid) {
        const u = getUserById(uid);
        if (!u) return;
        const name = getUserDisplayName(u);
        const isLast = getUsers().length === 1;
        const wasActive = uid === getActiveUserId();

        let msg = `کاربر «${name}» با تمام تمرین‌ها و برنامه‌هایش حذف شود؟\nاین کار قابل بازگشت نیست؛ اگر پشتیبان نگرفته‌ای، اول «پشتیبان این کاربر» یا پشتیبان کامل را بگیر.`;
        if (isLast) msg += "\n\nاین تنها کاربر برنامه است؛ بعد از حذف، یک کاربر خالی جدید ساخته می‌شود.";
        if (!confirm(msg)) return;

        await deleteUser(uid);
        if (wasActive) {
            reloadAfterUserChange();
        } else {
            renderUserChip();
            renderUserView();
            toast(`کاربر «${name}» حذف شد.`);
        }
    }

    /* ---------- به‌روزرسانی اطلاعات تمرین از فایل پشتیبان ---------- */
    function pickBackupSource(sources) {
        return new Promise(resolve => {
            const ov = document.createElement("div");
            ov.className = "dv-modal-overlay";
            ov.innerHTML = `
            <div class="dv-modal pb-pick" role="dialog" aria-modal="true" aria-label="انتخاب کاربر فایل پشتیبان">
                <div class="dv-modal-head">
                    <div>
                        <h3>اطلاعات کدام کاربر؟</h3>
                        <p>این فایل اطلاعات چند کاربر دارد. یکی را انتخاب کن.</p>
                    </div>
                    <button type="button" class="exercise-guide-close pb-pick-x" aria-label="بستن">×</button>
                </div>
                <div class="pb-pick-list">
                    ${sources.map((src, i) => `
                    <button type="button" class="secondary-btn pb-pick-item" data-i="${i}">
                        <strong>${esc(src.name)}</strong>
                        <span>${toFa(src.workouts)} جلسه</span>
                    </button>`).join("")}
                </div>
            </div>`;
            const done = v => { ov.remove(); resolve(v); };
            ov.addEventListener("click", e => {
                if (e.target === ov || e.target.closest(".pb-pick-x")) return done(undefined);
                const b = e.target.closest(".pb-pick-item");
                if (b) done(sources[Number(b.dataset.i)].id);
            });
            document.body.appendChild(ov);
        });
    }

    async function mergeFromFile(file, uid) {
        const target = getUserById(uid);
        if (!target) return;

        let data;
        try {
            data = JSON.parse(await file.text());
        } catch (err) {
            alert("فایل معتبر نیست (JSON قابل خواندن نیست).");
            return;
        }
        if (!data || typeof data !== "object" ||
            (!Array.isArray(data.workouts) && !data.programsRaw && !Array.isArray(data.programs))) {
            alert("این فایل، پشتیبان معتبر GymLog نیست.");
            return;
        }

        const sources = getBackupSources(data);
        let sourceId = sources[0].id;
        if (sources.length > 1) {
            sourceId = await pickBackupSource(sources);
            if (sourceId === undefined) return;
        }
        const srcName = (sources.find(x => x.id === sourceId) || sources[0]).name;

        if (!confirm(
            `اطلاعات «${srcName}» از این فایل به اطلاعات «${getUserDisplayName(target)}» اضافه شود؟\n\n` +
            "تمرین‌های جدید اضافه می‌شوند و تمرین‌های تکراری فقط اگر نسخه‌ی فایل جدیدتر باشد به‌روز می‌شوند. هیچ‌چیز حذف نمی‌شود."
        )) return;

        try {
            const r = await mergeBackupIntoUser(data, uid, sourceId);
            alert(
                "به‌روزرسانی انجام شد.\n" +
                `تمرین جدید: ${toFa(r.added)}\n` +
                `تمرین به‌روزشده: ${toFa(r.updated)}\n` +
                `بدون تغییر (تکراری): ${toFa(r.skipped)}\n` +
                `برنامه‌ی جدید: ${toFa(r.programsAdded)}\n` +
                `حرکت جدید در بانک حرکات: ${toFa(r.exercisesAdded)}`
            );
            if (uid === getActiveUserId()) {
                reloadAfterUserChange();
            } else {
                renderUserChip();
                renderUserView();
            }
        } catch (err) {
            console.error("[GymLog] به‌روزرسانی اطلاعات کاربر ناموفق بود:", err);
            alert("به‌روزرسانی انجام نشد: " + (err.message || "خطای نامشخص"));
        }
    }

    /* =====================================================
       ساخت برنامه تمرینی
    ===================================================== */
    let overlay = null;
    let PB = null;
    let onKey = null;

    function freshState(userId) {
        const profile = getUserProfile(userId) || {};
        /* اگر مشخصات کاربر قبلاً ثبت شده، مرحله‌ی «مشخصات» حذف می‌شود */
        const needsProfile = !(profile && profile.fullName);
        return {
            step: 1,
            userId,
            needsProfile,
            steps: needsProfile ? ["days", "exercises", "profile", "output"] : ["days", "exercises", "output"],
            days: 3,
            day: 1,
            title: "",
            dayTitles: {},
            plan: { 1: [], 2: [], 3: [] },
            profile,
            output: "save",
            cat: "all",
            search: "",
            sheetOpen: false
        };
    }

    function isDirty() {
        return Object.keys(PB.plan).some(d => PB.plan[d].length > 0);
    }

    function defaultExercise(id) {
        const unit = DEFAULT_UNIT[id] || "reps";
        const timed = unit === "sec" || unit === "sec_side";
        return { id, sets: 3, min: timed ? 30 : 8, max: timed ? 45 : 12, unit, rest: "90 ثانیه" };
    }

    function setDays(n) {
        for (let d = 1; d <= 7; d++) {
            if (d <= n) { if (!PB.plan[d]) PB.plan[d] = []; }
            else delete PB.plan[d];
        }
        PB.days = n;
        if (PB.day > n) PB.day = n;
    }

    /* ---------- بدنه‌ی اصلی / چارچوب ---------- */
    function openProgramBuilder(userId) {
        if (overlay) return;
        const uid = typeof userId === "string" && getUserById(userId) ? userId : getActiveUserId();
        PB = freshState(uid);

        overlay = document.createElement("div");
        overlay.className = "pb-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "ساخت برنامه تمرینی");
        overlay.innerHTML = `
        <div class="pb-page">
            <header class="pb-head">
                <h2>ساخت برنامه تمرینی${getUsers().length > 1 ? " · " + esc(getUserDisplayName(getUserById(PB.userId))) : ""}</h2>
                <button type="button" class="exercise-guide-close pb-close" aria-label="بستن">×</button>
            </header>
            <ol class="pb-steps" id="pbSteps"></ol>
            <div class="pb-body" id="pbBody"></div>
            <footer class="pb-foot">
                <button type="button" class="secondary-btn pb-prev" id="pbPrev">قبلی</button>
                <button type="button" class="primary-btn pb-next" id="pbNext">بعدی</button>
            </footer>
        </div>`;

        overlay.querySelector(".pb-close").addEventListener("click", () => closeBuilder(false));
        overlay.querySelector("#pbPrev").addEventListener("click", () => goStep(PB.step - 1, true));
        overlay.querySelector("#pbNext").addEventListener("click", onNext);

        onKey = e => { if (e.key === "Escape" && !PB.sheetOpen) closeBuilder(false); };
        document.addEventListener("keydown", onKey);

        history.pushState({ modal: "programBuilder" }, "");
        document.body.style.overflow = "hidden";
        document.body.appendChild(overlay);
        const topTitle = document.getElementById("desktopTopbarTitle");
        if (topTitle) topTitle.textContent = "ساخت برنامه تمرینی";
        renderStep();
    }

    function removeOverlay() {
        if (!overlay) return;
        overlay.remove();
        overlay = null;
        document.body.style.overflow = "";
        if (onKey) document.removeEventListener("keydown", onKey);
        onKey = null;
        const topTitle = document.getElementById("desktopTopbarTitle");
        if (topTitle && typeof VIEW_TITLES !== "undefined" && typeof currentDesktopView !== "undefined") {
            topTitle.textContent = VIEW_TITLES[currentDesktopView] || topTitle.textContent;
        }
    }

    function closeBuilder(force) {
        if (!overlay) return;
        if (!force && isDirty() && !confirm("برنامه‌ی ذخیره‌نشده از بین می‌رود. بستن فرم؟")) return;
        removeOverlay();
        if (history.state && history.state.modal === "programBuilder") history.back();
    }

    window.addEventListener("popstate", () => { if (overlay) removeOverlay(); });

    function renderSteps() {
        overlay.querySelector("#pbSteps").innerHTML = PB.steps.map(k => STEP_LABELS[k]).map((label, i) => {
            const n = i + 1;
            const cls = n === PB.step ? "active" : n < PB.step ? "done" : "";
            return `<li class="${cls}"><span>${toFa(n)}</span>${label}</li>`;
        }).join("");

        overlay.querySelector("#pbPrev").style.visibility = PB.step === 1 ? "hidden" : "visible";
        const next = overlay.querySelector("#pbNext");
        next.textContent = PB.step < PB.steps.length ? "بعدی"
            : PB.output === "save" ? "ثبت در برنامه" : "دانلود فایل JSON";
    }

    function renderStep() {
        renderSteps();
        const body = overlay.querySelector("#pbBody");
        body.scrollTop = 0;
        const key = PB.steps[PB.step - 1];
        if (key === "days") renderStepDays(body);
        else if (key === "exercises") renderStepExercises(body);
        else if (key === "profile") renderStepProfile(body);
        else renderStepOutput(body);
    }

    function goStep(n, free) {
        if (n < 1 || n > PB.steps.length) return;
        if (!free && n > PB.step && !validateStep(PB.step)) return;
        PB.step = n;
        PB.sheetOpen = false;
        renderStep();
    }

    function onNext() {
        if (PB.step < PB.steps.length) goStep(PB.step + 1, false);
        else submit();
    }

    function validateStep(step) {
        const key = PB.steps[step - 1];
        if (key === "exercises") return validatePlan();
        if (key === "profile") {
            const form = overlay.querySelector("#pbProfileForm");
            const r = readProfileFields(form);
            const errEl = overlay.querySelector("#pbProfileError");
            if (r.error) {
                errEl.textContent = r.error;
                const f = form.querySelector(`[name="${r.field}"]`);
                if (f) f.focus();
                return false;
            }
            PB.profile = r.profile;
            return true;
        }
        return true;
    }

    /* ---------- مرحله ۱: تعداد روز ---------- */
    function renderStepDays(body) {
        body.innerHTML = `
        <section class="pb-section">
            <h3>برنامه چند روز در هفته است؟</h3>
            <p class="pb-muted">هر روز یک جلسه‌ی تمرینی جدا خواهد بود.</p>
            <div class="pb-chips" role="radiogroup" aria-label="تعداد روز تمرین در هفته">
                ${[1, 2, 3, 4, 5, 6, 7].map(n => `
                    <button type="button" role="radio" aria-checked="${n === PB.days}" class="pb-chip pb-day-chip ${n === PB.days ? "active" : ""}" data-days="${n}">${toFa(n)} روز</button>
                `).join("")}
            </div>
            <label class="pb-field pb-title-field">عنوان برنامه (اختیاری)
                <input type="text" id="pbTitle" maxlength="40" placeholder="مثلاً برنامه افزایش حجم" value="${esc(PB.title)}">
            </label>
        </section>`;

        body.querySelectorAll(".pb-day-chip").forEach(btn => {
            btn.addEventListener("click", () => {
                const n = Number(btn.dataset.days);
                if (n < PB.days) {
                    const losing = Object.keys(PB.plan).filter(d => Number(d) > n && PB.plan[d].length > 0);
                    if (losing.length && !confirm("حرکات روزهای حذف‌شده پاک می‌شود. ادامه می‌دهی؟")) return;
                }
                setDays(n);
                renderStepDays(body);
            });
        });
        body.querySelector("#pbTitle").addEventListener("input", e => { PB.title = e.target.value; });
    }

    /* ---------- مرحله ۲: حرکات ---------- */
    function renderStepExercises(body) {
        body.innerHTML = `
        <div class="pb-builder">
            <div class="pb-main">
                <div class="pb-daytabs" id="pbDayTabs" role="tablist"></div>
                <label class="pb-field">عنوان این روز (اختیاری)
                    <input type="text" id="pbDayTitle" maxlength="40">
                </label>
                <div class="pb-dropzone" id="pbList" aria-label="حرکات این روز"></div>
                <button type="button" class="secondary-btn pb-open-lib" id="pbOpenLib">+ افزودن حرکت</button>
            </div>
            <aside class="pb-lib" id="pbLib" aria-label="فهرست حرکات">
                <div class="pb-lib-head">
                    <strong>فهرست حرکات</strong>
                    <button type="button" class="secondary-btn pb-lib-done" id="pbLibDone">تمام</button>
                </div>
                <div class="pb-chips pb-cat-chips" id="pbCats"></div>
                <input type="search" class="pb-search" id="pbSearch" placeholder="جستجوی حرکت…" value="${esc(PB.search)}">
                <p class="pb-hint" id="pbHint"></p>
                <div class="pb-lib-list" id="pbLibList"></div>
            </aside>
            <div class="pb-sheet-backdrop" id="pbBackdrop"></div>
        </div>`;

        const dnd = isDesktopLayout();
        body.querySelector("#pbHint").textContent = dnd
            ? "حرکت را بکش و روی لیست روز رها کن، یا دکمه‌ی + را بزن."
            : "برای افزودن، روی + کنار هر حرکت بزن.";

        const dayTitle = body.querySelector("#pbDayTitle");
        dayTitle.value = PB.dayTitles[PB.day] || "";
        dayTitle.placeholder = autoTitle(PB.day);
        dayTitle.addEventListener("input", e => { PB.dayTitles[PB.day] = e.target.value; });

        body.querySelector("#pbSearch").addEventListener("input", e => { PB.search = e.target.value; renderLibList(); });
        body.querySelector("#pbOpenLib").addEventListener("click", () => toggleSheet(true));
        body.querySelector("#pbLibDone").addEventListener("click", () => toggleSheet(false));
        body.querySelector("#pbBackdrop").addEventListener("click", () => toggleSheet(false));

        wireDayTabs(body);
        wireList(body);
        wireLib(body);

        renderDayTabs();
        renderList();
        renderCats();
        renderLibList();
    }

    function toggleSheet(open) {
        PB.sheetOpen = open;
        const lib = overlay.querySelector("#pbLib");
        const bd = overlay.querySelector("#pbBackdrop");
        if (lib) lib.classList.toggle("open", open);
        if (bd) bd.classList.toggle("open", open);
    }

    function autoTitle(day) {
        const catalog = getEffectiveCatalog();
        const cats = [];
        (PB.plan[day] || []).forEach(ex => {
            const c = catOf(ex.id, catalog[ex.id]);
            if (!cats.includes(c)) cats.push(c);
        });
        return cats.length ? cats.join(" + ") : `روز ${toFa(day)}`;
    }

    function dayTitleOf(day) {
        const t = (PB.dayTitles[day] || "").trim();
        return t || autoTitle(day);
    }

    /* تب روزها */
    function renderDayTabs() {
        const el = overlay.querySelector("#pbDayTabs");
        if (!el) return;
        el.innerHTML = Array.from({ length: PB.days }, (_, i) => i + 1).map(d => `
            <button type="button" role="tab" aria-selected="${d === PB.day}" class="pb-tab ${d === PB.day ? "active" : ""}" data-day="${d}">
                روز ${toFa(d)}
                <span class="pb-count">${toFa(PB.plan[d].length)}</span>
            </button>`).join("");
    }

    function wireDayTabs(body) {
        body.querySelector("#pbDayTabs").addEventListener("click", e => {
            const btn = e.target.closest(".pb-tab");
            if (!btn) return;
            PB.day = Number(btn.dataset.day);
            const dayTitle = body.querySelector("#pbDayTitle");
            dayTitle.value = PB.dayTitles[PB.day] || "";
            dayTitle.placeholder = autoTitle(PB.day);
            renderDayTabs();
            renderList();
            renderLibList();
        });
    }

    /* لیست حرکات روز */
    function exerciseCardHtml(ex, idx, total, catalog) {
        const item = catalog[ex.id];
        const name = item ? item.name : ex.id;
        return `
        <div class="pb-ex" data-idx="${idx}">
            <div class="pb-ex-top">
                <span class="pb-ex-num">${toFa(idx + 1)}</span>
                <div class="pb-ex-name">
                    <strong>${esc(name)}</strong>
                    <span>${esc(catOf(ex.id, item))}</span>
                </div>
                <div class="pb-ex-ctl">
                    <button type="button" data-act="up" aria-label="بالا" ${idx === 0 ? "disabled" : ""}>↑</button>
                    <button type="button" data-act="down" aria-label="پایین" ${idx === total - 1 ? "disabled" : ""}>↓</button>
                    <button type="button" data-act="del" class="pb-del" aria-label="حذف حرکت">🗑</button>
                </div>
            </div>
            <div class="pb-fields">
                <label>ست
                    <input type="text" inputmode="numeric" data-f="sets" value="${esc(toFa(ex.sets))}">
                </label>
                <label>تکرار از
                    <input type="text" inputmode="numeric" data-f="min" value="${esc(toFa(ex.min))}">
                </label>
                <label>تا
                    <input type="text" inputmode="numeric" data-f="max" value="${ex.max === "" ? "" : esc(toFa(ex.max))}">
                </label>
                <label>واحد
                    <select data-f="unit">
                        ${UNIT_OPTS.map(([v, l]) => `<option value="${v}" ${v === ex.unit ? "selected" : ""}>${l}</option>`).join("")}
                    </select>
                </label>
                <label>استراحت
                    <select data-f="rest">
                        ${REST_OPTS.map(r => `<option value="${r}" ${r === ex.rest ? "selected" : ""}>${toFa(r)}</option>`).join("")}
                    </select>
                </label>
            </div>
        </div>`;
    }

    function renderList() {
        const el = overlay.querySelector("#pbList");
        if (!el) return;
        const list = PB.plan[PB.day];
        const catalog = getEffectiveCatalog();
        el.innerHTML = list.length
            ? list.map((ex, i) => exerciseCardHtml(ex, i, list.length, catalog)).join("")
            : `<div class="pb-empty">هنوز حرکتی برای روز ${toFa(PB.day)} اضافه نشده.<br>${isDesktopLayout()
                ? "حرکت را از فهرست کنار صفحه به اینجا بکش."
                : "با دکمه‌ی «افزودن حرکت» شروع کن."}</div>`;
    }

    function parseField(f, raw) {
        if (f === "max" && String(raw).trim() === "") return "";
        const n = normNum(raw);
        return isNaN(n) ? "" : Math.round(n);
    }

    function wireList(body) {
        const el = body.querySelector("#pbList");

        el.addEventListener("input", e => {
            const f = e.target.dataset.f;
            const card = e.target.closest(".pb-ex");
            if (!f || !card || f === "unit" || f === "rest") return;
            PB.plan[PB.day][Number(card.dataset.idx)][f] = parseField(f, e.target.value);
        });

        el.addEventListener("change", e => {
            const f = e.target.dataset.f;
            const card = e.target.closest(".pb-ex");
            if (!f || !card) return;
            const ex = PB.plan[PB.day][Number(card.dataset.idx)];
            if (f === "unit" || f === "rest") ex[f] = e.target.value;
        });

        el.addEventListener("click", e => {
            const btn = e.target.closest("[data-act]");
            if (!btn) return;
            const card = btn.closest(".pb-ex");
            const i = Number(card.dataset.idx);
            const list = PB.plan[PB.day];
            if (btn.dataset.act === "del") list.splice(i, 1);
            else if (btn.dataset.act === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
            else if (btn.dataset.act === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
            afterListChange();
        });

        /* درگ و دراپ (فقط دسکتاپ) */
        el.addEventListener("dragover", e => {
            if (!isDesktopLayout()) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            el.classList.add("drag-over");
        });
        el.addEventListener("dragleave", e => {
            if (!el.contains(e.relatedTarget)) el.classList.remove("drag-over");
        });
        el.addEventListener("drop", e => {
            e.preventDefault();
            el.classList.remove("drag-over");
            const id = e.dataTransfer.getData("text/plain");
            if (!id) return;
            const card = e.target.closest(".pb-ex");
            addExercise(id, card ? Number(card.dataset.idx) : undefined);
        });
    }

    function afterListChange() {
        renderList();
        renderDayTabs();
        renderLibList();
        const dayTitle = overlay.querySelector("#pbDayTitle");
        if (dayTitle) dayTitle.placeholder = autoTitle(PB.day);
    }

    function addExercise(id, at) {
        const catalog = getEffectiveCatalog();
        if (!catalog[id]) return;
        const list = PB.plan[PB.day];
        if (list.some(ex => ex.id === id)) {
            toast("این حرکت قبلاً به همین روز اضافه شده است.", "warning");
            return;
        }
        const ex = defaultExercise(id);
        if (typeof at === "number") list.splice(at, 0, ex);
        else list.push(ex);
        afterListChange();
    }

    /* کتابخانه‌ی حرکات */
    function renderCats() {
        const el = overlay.querySelector("#pbCats");
        if (!el) return;
        const catalog = getEffectiveCatalog();
        const present = new Set(Object.keys(catalog).map(id => catOf(id, catalog[id])));
        const cats = CAT_ORDER.filter(c => present.has(c));
        present.forEach(c => { if (!cats.includes(c)) cats.push(c); });
        el.innerHTML = ["all", ...cats].map(c => `
            <button type="button" class="pb-chip ${PB.cat === c ? "active" : ""}" data-cat="${esc(c)}">${c === "all" ? "همه" : esc(c)}</button>
        `).join("");
    }

    function renderLibList() {
        const el = overlay.querySelector("#pbLibList");
        if (!el) return;
        const catalog = getEffectiveCatalog();
        const q = PB.search.trim().toLowerCase();
        const inDay = new Set(PB.plan[PB.day].map(ex => ex.id));
        const dnd = isDesktopLayout();

        const items = Object.keys(catalog)
            .map(id => ({ id, name: catalog[id].name || id, cat: catOf(id, catalog[id]) }))
            .filter(it => (PB.cat === "all" || it.cat === PB.cat) &&
                (!q || it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q)))
            .sort((a, b) => {
                const ia = CAT_ORDER.indexOf(a.cat), ib = CAT_ORDER.indexOf(b.cat);
                return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.name.localeCompare(b.name, "fa");
            });

        el.innerHTML = items.length ? items.map(it => {
            const added = inDay.has(it.id);
            return `
            <div class="pb-lib-item ${added ? "added" : ""}" data-id="${esc(it.id)}" ${dnd && !added ? 'draggable="true"' : ""}>
                ${dnd ? '<span class="pb-grip" aria-hidden="true">⋮⋮</span>' : ""}
                <div class="pb-lib-name">
                    <strong>${esc(it.name)}</strong>
                    <span>${esc(it.cat)}</span>
                </div>
                <button type="button" class="pb-add" data-add="${esc(it.id)}" ${added ? "disabled" : ""} aria-label="افزودن ${esc(it.name)}">${added ? "✓" : "+"}</button>
            </div>`;
        }).join("") : `<div class="pb-empty">حرکتی پیدا نشد.</div>`;
    }

    function wireLib(body) {
        body.querySelector("#pbCats").addEventListener("click", e => {
            const btn = e.target.closest("[data-cat]");
            if (!btn) return;
            PB.cat = btn.dataset.cat;
            renderCats();
            renderLibList();
        });

        const list = body.querySelector("#pbLibList");
        list.addEventListener("click", e => {
            const btn = e.target.closest("[data-add]");
            if (btn && !btn.disabled) addExercise(btn.dataset.add);
        });
        list.addEventListener("dragstart", e => {
            const item = e.target.closest(".pb-lib-item");
            if (!item) return;
            e.dataTransfer.setData("text/plain", item.dataset.id);
            e.dataTransfer.effectAllowed = "copy";
            item.classList.add("dragging");
        });
        list.addEventListener("dragend", e => {
            const item = e.target.closest(".pb-lib-item");
            if (item) item.classList.remove("dragging");
        });
    }

    /* اعتبارسنجی برنامه */
    function validatePlan() {
        for (let d = 1; d <= PB.days; d++) {
            const list = PB.plan[d];
            const fail = msg => {
                PB.day = d;
                renderStepExercises(overlay.querySelector("#pbBody"));
                toast(msg, "warning");
                return false;
            };
            if (!list.length) return fail(`برای روز ${toFa(d)} حداقل یک حرکت اضافه کن.`);
            for (let i = 0; i < list.length; i++) {
                const ex = list[i];
                const name = (getEffectiveCatalog()[ex.id] || {}).name || ex.id;
                if (!(ex.sets >= 1 && ex.sets <= 12)) return fail(`تعداد ست «${name}» باید بین ۱ تا ۱۲ باشد.`);
                if (!(ex.min >= 1 && ex.min <= 999)) return fail(`تکرار «${name}» را وارد کن.`);
                if (ex.max !== "" && ex.max < ex.min) return fail(`در «${name}» سقف تکرار نباید کمتر از حداقل باشد.`);
            }
        }
        return true;
    }

    /* ---------- مرحله ۳: مشخصات ---------- */
    function renderStepProfile(body) {
        body.innerHTML = `
        <section class="pb-section">
            <h3>مشخصات کاربر</h3>
            <p class="pb-muted">این اطلاعات در فایل برنامه ثبت می‌شود و اگر برنامه را مستقیم ثبت کنی، در بخش «کاربر» هم نمایش داده می‌شود.</p>
            <div id="pbProfileForm">${profileFieldsHtml(PB.profile)}</div>
            <p class="pb-error" id="pbProfileError" role="alert"></p>
        </section>`;
    }

    /* ---------- مرحله ۴: خروجی ---------- */
    function renderStepOutput(body) {
        const summary = Array.from({ length: PB.days }, (_, i) => i + 1).map(d => `
            <li><b>روز ${toFa(d)}</b><span>${esc(dayTitleOf(d))}</span><em>${toFa(PB.plan[d].length)} حرکت</em></li>`).join("");

        body.innerHTML = `
        <section class="pb-section">
            <h3>خلاصه‌ی برنامه</h3>
            <p class="pb-muted">${esc(PB.profile.fullName || "")} · ${toFa(PB.days)} روز در هفته</p>
            <ul class="pb-summary">${summary}</ul>

            <h3 class="pb-out-title">خروجی را انتخاب کن</h3>
            <div class="pb-outputs" role="radiogroup">
                <label class="pb-out ${PB.output === "save" ? "active" : ""}">
                    <input type="radio" name="pbOutput" value="save" ${PB.output === "save" ? "checked" : ""}>
                    <div>
                        <strong>ثبت مستقیم در برنامه</strong>
                        <span>برنامه به فهرست برنامه‌ها اضافه و برنامه‌ی فعال می‌شود. مشخصات کاربر هم ذخیره می‌شود. سوابق قبلی حفظ می‌ماند.</span>
                    </div>
                </label>
                <label class="pb-out ${PB.output === "download" ? "active" : ""}">
                    <input type="radio" name="pbOutput" value="download" ${PB.output === "download" ? "checked" : ""}>
                    <div>
                        <strong>فقط دانلود فایل JSON</strong>
                        <span>چیزی در برنامه ثبت نمی‌شود. فایل استاندارد را بعداً از «برنامه‌های تمرینی» بارگذاری کن.</span>
                    </div>
                </label>
            </div>
        </section>`;

        body.querySelectorAll('input[name="pbOutput"]').forEach(r => {
            r.addEventListener("change", () => {
                PB.output = r.value;
                body.querySelectorAll(".pb-out").forEach(l => l.classList.toggle("active", l.querySelector("input").checked));
                renderSteps();
            });
        });
    }

    /* ---------- ساخت خروجی ---------- */
    function targetString(ex) {
        const suffix = UNIT_SUFFIX[ex.unit] || "";
        const reps = ex.max === "" || ex.max === ex.min ? `${ex.min}` : `${ex.min}–${ex.max}`;
        return `${ex.sets} × ${reps}${suffix}`;
    }

    function buildPackage() {
        const { key, n } = nextMonthKey(PB.userId);
        const sessions = {};
        for (let d = 1; d <= PB.days; d++) {
            sessions[String(d)] = {
                title: dayTitleOf(d),
                exercises: PB.plan[d].map(ex => ({
                    id: ex.id,
                    target: targetString(ex),
                    rest: ex.rest,
                    sets: ex.sets
                }))
            };
        }
        return {
            app: "GymLog Program",
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            daysPerWeek: PB.days,
            profile: { ...PB.profile },
            programsRaw: {
                [key]: {
                    title: PB.title.trim() || `برنامه ${toFa(n)}`,
                    sessions
                }
            }
        };
    }

    function downloadJson(pkg) {
        const d = new Date();
        const p = x => String(x).padStart(2, "0");
        const name = `gymlog-program-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
        downloadBlob(new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" }), name);
    }

    async function submit() {
        const nextBtn = overlay.querySelector("#pbNext");
        const pkg = buildPackage();
        const uid = PB.userId;
        const isActive = uid === getActiveUserId();
        const userName = getUserDisplayName(getUserById(uid));
        const onUserPage = () => typeof currentDesktopView !== "undefined" && currentDesktopView === "user";

        if (PB.output === "download") {
            downloadJson(pkg);
            if (PB.needsProfile) {
                try { await saveUserProfile(PB.profile, uid); renderUserChip(); } catch (e) { console.error(e); }
            }
            closeBuilder(true);
            toast("فایل برنامه دانلود شد.");
            if (onUserPage()) renderUserView();
            return;
        }

        nextBtn.disabled = true;
        try {
            await importProgramPackage({ programsRaw: pkg.programsRaw }, uid);
            if (PB.needsProfile) await saveUserProfile(PB.profile, uid);
        } catch (err) {
            console.error("[GymLog Builder] خطا در ثبت برنامه:", err);
            nextBtn.disabled = false;
            toast("ثبت برنامه انجام نشد. دوباره تلاش کن.", "warning");
            return;
        }

        closeBuilder(true);

        /* برنامه برای کاربری غیر از کاربر فعال ساخته شده: وضعیت زنده‌ی برنامه دست نمی‌خورد */
        if (!isActive) {
            renderUserChip();
            if (onUserPage()) renderUserView();
            toast(`برنامه‌ی جدید برای «${userName}» ثبت شد. برای استفاده از آن، این کاربر را انتخاب کن.`);
            return;
        }

        try {
            workoutPrograms = buildWorkoutPrograms(getEffectiveCatalog(), getEffectiveProgramsRaw());
            currentMonth = getLatestMonthKey();
            viewingMonth = currentMonth;
            const detected = detectNextWeekAndSession(currentMonth);
            currentSession = detected.session;
            if (weekNumber) weekNumber.value = detected.week;
            renderAll();
        } catch (err) {
            console.error(err);
            location.reload();
            return;
        }

        renderUserChip();
        switchView("programs");
        toast("برنامه‌ی جدید ثبت شد و برنامه‌ی فعال است.");
    }

    /* =========================
       اتصال به صفحه
    ========================= */
    /* در دسکتاپ فرم داخل چارچوب برنامه است؛ با کلیک روی منو، فرم بسته می‌شود و صفحه‌ی انتخاب‌شده باز می‌شود */
    const originalSwitchView = window.switchView;
    window.switchView = function () {
        editingUserId = null;
        if (overlay && window.matchMedia("(min-width: 1024px)").matches) {
            if (isDirty() && !confirm("برنامه‌ی ذخیره‌نشده از بین می‌رود. فرم بسته شود؟")) return;
            closeBuilder(true);
        }
        return originalSwitchView.apply(this, arguments);
    };

    window.openProgramBuilder = openProgramBuilder;
    window.renderUserView = renderUserView;
    window.renderUserChip = renderUserChip;

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUserChip);
    else initUserChip();
})();
