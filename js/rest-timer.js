/* =====================================================
   GymLog — تایمر استراحت بین ست‌ها

   با دکمه‌ی «⏱ استراحت» روی کارت هر حرکت شروع می‌شود و
   مقدار rest همان حرکت در برنامه را می‌خواند
   (برای بازه مثل «2–3 دقیقه» کران پایین؛ با +۱۵ ثانیه تنظیم می‌شود).
   زمان بر اساس ساعت سیستم حساب می‌شود، پس با قفل‌شدن صفحه یا
   کندشدن تب هم دقیق می‌ماند. در پایان: لرزش + دو بوق کوتاه.
===================================================== */
(function () {
    "use strict";

    let el = null, timeEl = null, labelEl = null, barEl = null;
    let endAt = 0, total = 0, tick = null, hideTimer = null, audioCtx = null, name = "";

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

    function unlockAudio() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            audioCtx = audioCtx || new AC();
            if (audioCtx.state === "suspended") audioCtx.resume();
        } catch (e) { /* ignore */ }
    }

    function beep() {
        try {
            if (!audioCtx) return;
            [0, 0.28].forEach(t => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                const at = audioCtx.currentTime + t;
                o.frequency.value = 880;
                o.connect(g); g.connect(audioCtx.destination);
                g.gain.setValueAtTime(0.0001, at);
                g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
                o.start(at); o.stop(at + 0.22);
            });
        } catch (e) { /* ignore */ }
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
        labelEl.textContent = "استراحت تمام شد — ست بعدی";
        try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch (e) { /* ignore */ }
        beep();
        clearTimeout(hideTimer);
        hideTimer = setTimeout(stop, 8000);
    }

    function start(seconds, exerciseName) {
        build();
        unlockAudio();
        clearInterval(tick); clearTimeout(hideTimer);
        name = exerciseName || "";
        total = seconds;
        endAt = Date.now() + seconds * 1000;
        el.classList.remove("done");
        labelEl.textContent = "استراحت" + (name ? " · " + name : "");
        el.hidden = false;
        update();
        tick = setInterval(update, 250);
    }

    function adjust(delta) {
        if (!el || el.hidden) return;
        if (el.classList.contains("done")) {
            if (delta > 0) start(delta, name);
            return;
        }
        endAt += delta * 1000;
        total = Math.max(1, total + delta);
        update();
    }

    function stop() {
        clearInterval(tick); tick = null;
        clearTimeout(hideTimer);
        if (el) { el.hidden = true; el.classList.remove("done"); }
    }

    document.addEventListener("click", e => {
        const btn = e.target.closest(".exercise-rest-btn");
        if (!btn) return;
        const sec = Number(btn.dataset.seconds);
        if (sec > 0) start(sec, btn.dataset.exerciseName);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && tick) update();
    });

    window.GymLogRestTimer = { start, stop };
})();
