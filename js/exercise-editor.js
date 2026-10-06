/* =====================================================
   GymLog — فرم افزودن / ویرایش حرکت کاتالوگ

   openExerciseEditor(exerciseId | null, onSaved)
     - exerciseId داده شود → ویرایش حرکت موجود (شناسه ثابت می‌ماند)
     - null → افزودن حرکت جدید

   ذخیره‌سازی: saveCatalogExercise / resetCatalogExercise در storage.js
   تصویرها قبل از ذخیره کوچک و فشرده می‌شوند؛ ویدیو تا ۱۲ مگابایت.
===================================================== */
(function () {
    "use strict";

    const CATS = ["سینه", "پشت", "سرشانه", "جلو بازو", "پشت بازو", "پا", "شکم"];
    const MAX_VIDEO = 12 * 1024 * 1024;
    const MAX_RAW_IMAGE = 3 * 1024 * 1024;
    const ID_RE = /^[a-z][a-z0-9_]{2,40}$/;

    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));

    function isVideo(p) {
        p = String(p || "");
        return p.startsWith("data:") ? p.startsWith("data:video") : /\.(mp4|webm|mov)(\?|$)/i.test(p);
    }

    function slugify(s) {
        return String(s || "").toLowerCase().trim()
            .replace(/[\s-]+/g, "_")
            .replace(/[^a-z0-9_]/g, "")
            .replace(/^[0-9_]+/, "")
            .replace(/_+$/, "");
    }

    function toast(msg, type) {
        if (typeof showToast === "function") showToast(msg, type || "success");
        else alert(msg);
    }

    function readAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error("خواندن فایل ممکن نشد."));
            r.readAsDataURL(file);
        });
    }

    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("این تصویر قابل خواندن نیست."));
            img.src = url;
        });
    }

    async function processFile(file) {
        const type = file.type || "";
        if (type.startsWith("video/")) {
            if (file.size > MAX_VIDEO) throw new Error("حجم ویدیو بیشتر از ۱۲ مگابایت است: " + file.name);
            return readAsDataURL(file);
        }
        if (type.startsWith("image/")) {
            if (type === "image/gif" || type === "image/svg+xml") {
                if (file.size > MAX_RAW_IMAGE) throw new Error("حجم فایل بیشتر از ۳ مگابایت است: " + file.name);
                return readAsDataURL(file);
            }
            const img = await loadImage(await readAsDataURL(file));
            const max = 900;
            const scale = Math.min(1, max / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/jpeg", 0.82);
        }
        throw new Error("فقط تصویر یا ویدیو قابل بارگذاری است: " + file.name);
    }

    function openExerciseEditor(editId, onSaved) {
        if (document.querySelector(".ee-overlay")) return;

        const catalog = getEffectiveCatalog();
        const isEdit = !!editId && !!catalog[editId];
        const src = isEdit ? catalog[editId] : {};
        const mapCat = (typeof EXERCISE_CATEGORIES_MAP !== "undefined" && EXERCISE_CATEGORIES_MAP[editId]) || "";
        const bwSet = (window.DashAnalytics && window.DashAnalytics.BODYWEIGHT_IDS) || new Set();
        const forcedBw = isEdit && bwSet.has(editId);
        const isBuiltIn = isEdit && typeof exerciseCatalog !== "undefined" && !!exerciseCatalog[editId];
        const hasOverride = isEdit && !!loadCatalogOverrides()[editId];

        const st = {
            media: Array.isArray(src.images) ? src.images.slice() : [],
            idTouched: isEdit,
            busy: false
        };
        const category = src.category || mapCat || CATS[0];

        const overlay = document.createElement("div");
        overlay.className = "ee-overlay";
        overlay.innerHTML = `
        <div class="ee-modal" role="dialog" aria-modal="true" aria-label="${isEdit ? "ویرایش حرکت" : "حرکت جدید"}">
            <header class="ee-head">
                <div>
                    <h3>${isEdit ? "ویرایش حرکت" : "افزودن حرکت جدید"}</h3>
                    <p>${isEdit ? esc(src.name || editId) : "حرکت جدید به بانک حرکات اضافه می‌شود و در ساخت برنامه قابل انتخاب است."}</p>
                </div>
                <button type="button" class="exercise-guide-close ee-close" aria-label="بستن">×</button>
            </header>

            <div class="ee-body">
                <div class="ee-grid">
                    <label class="ee-field">
                        <span>نام فارسی <b>*</b></span>
                        <input type="text" name="nameFa" maxlength="80" value="${esc(src.name || "")}" placeholder="مثلاً پرس سینه دمبل">
                    </label>
                    <label class="ee-field">
                        <span>نام انگلیسی</span>
                        <input type="text" name="nameEn" maxlength="80" dir="ltr" value="${esc(src.nameEn || "")}" placeholder="Dumbbell Bench Press">
                    </label>
                    <label class="ee-field">
                        <span>شناسه یکتا <b>*</b></span>
                        <input type="text" name="id" maxlength="41" dir="ltr" value="${esc(editId || "")}" ${isEdit ? "readonly" : ""} placeholder="dumbbell_bench_press">
                        <small>${isEdit
                            ? "شناسه تغییر نمی‌کند، چون سابقه‌ی تمرین‌ها با همین شناسه ذخیره شده است."
                            : "فقط حروف کوچک انگلیسی، عدد و _ ؛ با حرف شروع شود. بعد از ثبت قابل تغییر نیست."}</small>
                    </label>
                    <label class="ee-field">
                        <span>گروه عضلانی <b>*</b></span>
                        <select name="category">
                            ${CATS.map(c => `<option value="${c}" ${c === category ? "selected" : ""}>${c}</option>`).join("")}
                        </select>
                    </label>
                </div>

                <label class="ee-check">
                    <input type="checkbox" name="bodyweight" ${(src.bodyweight || forcedBw) ? "checked" : ""} ${forcedBw ? "disabled" : ""}>
                    <span>
                        حرکت وزن‌بدنی یا زمانی است (مثل شنا و پلانک)
                        <small>در نمودارهای پیشرفت، به‌جای وزنه، بیشترین تکرار یا ثانیه رسم می‌شود.</small>
                    </span>
                </label>

                <label class="ee-field">
                    <span>توضیحات و نحوه‌ی اجرا</span>
                    <textarea name="instructions" rows="5" placeholder="هر خط یک مرحله؛ مثلاً:&#10;کتف‌ها را عقب و پایین نگه دار.&#10;وزنه را کنترل‌شده پایین بیاور.">${esc((src.instructions || []).join("\n"))}</textarea>
                </label>

                <div class="ee-field">
                    <span>تصویر یا ویدیو</span>
                    <div class="ee-media" id="eeMedia"></div>
                    <label class="secondary-btn file-btn ee-upload">
                        + بارگذاری تصویر / ویدیو
                        <input type="file" id="eeFile" accept="image/*,video/*" multiple hidden>
                    </label>
                    <small>تصویرها خودکار کوچک می‌شوند. حداکثر حجم ویدیو ۱۲ مگابایت است.</small>
                </div>

                <p class="ee-error" id="eeError" role="alert"></p>
            </div>

            <footer class="ee-foot">
                <button type="button" class="primary-btn" id="eeSave">${isEdit ? "ذخیره تغییرات" : "افزودن حرکت"}</button>
                <button type="button" class="secondary-btn" id="eeCancel">انصراف</button>
                ${isBuiltIn && hasOverride ? `<button type="button" class="danger-btn" id="eeReset">بازگردانی به پیش‌فرض</button>` : ""}
            </footer>
        </div>`;

        const $ = sel => overlay.querySelector(sel);
        const field = n => overlay.querySelector(`[name="${n}"]`);
        const errEl = $("#eeError");

        function renderMedia() {
            const box = $("#eeMedia");
            if (!st.media.length) {
                box.innerHTML = `<div class="ee-media-empty">هنوز فایلی اضافه نشده است.</div>`;
                return;
            }
            box.innerHTML = st.media.map((m, i) => `
                <div class="ee-media-item">
                    ${isVideo(m)
                        ? `<video src="${esc(m)}" muted playsinline preload="metadata"></video><em>ویدیو</em>`
                        : `<img src="${esc(m)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'فایل پیدا نشد'}))">`}
                    <button type="button" data-rm="${i}" aria-label="حذف فایل">×</button>
                </div>`).join("");
        }

        function close() {
            overlay.remove();
            document.body.style.overflow = prevOverflow;
            document.removeEventListener("keydown", onKey);
        }
        const prevOverflow = document.body.style.overflow;
        const onKey = e => { if (e.key === "Escape") close(); };

        $(".ee-close").addEventListener("click", close);
        $("#eeCancel").addEventListener("click", close);
        overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });

        if (!isEdit) {
            field("nameEn").addEventListener("input", e => {
                if (!st.idTouched) field("id").value = slugify(e.target.value);
            });
            field("id").addEventListener("input", () => { st.idTouched = true; });
        }

        $("#eeMedia").addEventListener("click", e => {
            const btn = e.target.closest("[data-rm]");
            if (!btn) return;
            st.media.splice(Number(btn.dataset.rm), 1);
            renderMedia();
        });

        $("#eeFile").addEventListener("change", async e => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            errEl.textContent = "";
            for (const f of files) {
                try {
                    st.media.push(await processFile(f));
                } catch (err) {
                    errEl.textContent = err.message;
                }
            }
            renderMedia();
        });

        const resetBtn = $("#eeReset");
        if (resetBtn) {
            resetBtn.addEventListener("click", async () => {
                if (!confirm("تغییرات این حرکت پاک شود و نسخه‌ی پیش‌فرض برگردد؟")) return;
                await resetCatalogExercise(editId);
                close();
                toast("حرکت به حالت پیش‌فرض برگشت.");
                if (onSaved) onSaved(editId);
            });
        }

        $("#eeSave").addEventListener("click", async () => {
            if (st.busy) return;
            const fail = (msg, name) => {
                errEl.textContent = msg;
                const el = name && field(name);
                if (el) el.focus();
            };
            errEl.textContent = "";

            const name = field("nameFa").value.trim().replace(/\s+/g, " ");
            const nameEn = field("nameEn").value.trim();
            const id = (isEdit ? editId : field("id").value.trim());
            const cat = field("category").value;

            if (!name) return fail("نام فارسی حرکت را وارد کن.", "nameFa");
            if (!isEdit) {
                if (!ID_RE.test(id)) return fail("شناسه باید با حرف کوچک انگلیسی شروع شود و فقط شامل حروف انگلیسی، عدد و _ باشد (۳ تا ۴۱ نویسه).", "id");
                if (getEffectiveCatalog()[id]) return fail("این شناسه قبلاً استفاده شده است. شناسه‌ی دیگری انتخاب کن.", "id");
            }

            const dup = Object.keys(getEffectiveCatalog()).find(k => k !== id && (getEffectiveCatalog()[k].name || "").trim() === name);
            if (dup && !confirm("حرکتی با همین نام فارسی وجود دارد. باز هم ذخیره شود؟")) return;

            const entry = Object.assign({}, isEdit ? src : {}, {
                name,
                category: cat,
                images: st.media.slice(),
                instructions: field("instructions").value.split("\n").map(s => s.trim()).filter(Boolean)
            });
            if (nameEn) entry.nameEn = nameEn; else delete entry.nameEn;
            if (field("bodyweight").checked) entry.bodyweight = true; else delete entry.bodyweight;

            st.busy = true;
            $("#eeSave").disabled = true;
            try {
                await saveCatalogExercise(id, entry);
            } catch (err) {
                console.error("[GymLog] ذخیره‌ی حرکت ناموفق بود:", err);
                st.busy = false;
                $("#eeSave").disabled = false;
                return fail("ذخیره انجام نشد. اگر فایل‌های سنگین اضافه کرده‌ای، حجم آن‌ها را کمتر کن.");
            }
            close();
            toast(isEdit ? "تغییرات حرکت ذخیره شد." : "حرکت جدید اضافه شد.");
            if (onSaved) onSaved(id);
        });

        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        document.body.appendChild(overlay);
        renderMedia();
        (isEdit ? field("nameFa") : field("nameFa")).focus();
    }

    window.openExerciseEditor = openExerciseEditor;
})();
