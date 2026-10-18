/* =====================================================
   GymLog — تایمر استراحت بین ست‌ها

   با دکمه‌ی «⏱ استراحت» روی کارت هر حرکت شروع می‌شود و
   مقدار rest همان حرکت در برنامه را می‌خواند
   (برای بازه مثل «2–3 دقیقه» کران پایین؛ با ±۱۵ ثانیه تنظیم می‌شود).
   زمان بر اساس ساعت سیستم حساب می‌شود، پس با کندشدن تب هم دقیق می‌ماند.

   - تا وقتی تایمر در حال اجراست صفحه قفل نمی‌شود (Wake Lock).
   - در پایان: آلارم بلند و تکرارشونده + لرزش + چشمک‌زدن کادر تایمر
     تا کاربر «بستن» را بزند (حداکثر ۳۰ ثانیه).
===================================================== */
(function () {
    "use strict";

    const ALARM_MAX_BURSTS = 3;      // آلارم بعد از این تعداد هشدار خودبه‌خود قطع می‌شود
    const BURST_EVERY_MS = 2200;     // هر چند میلی‌ثانیه یک دسته بوق تکرار شود
    const BEEPS_PER_BURST = 4;

    let el = null, timeEl = null, labelEl = null, barEl = null;
    let endAt = 0, total = 0, tick = null, hideTimer = null, audioCtx = null, name = "";
    let alarmTimer = null, flashTimer = null;

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

    function keepAwake(on) {
        if (typeof GymLogWakeLock === "undefined") return;
        if (on) GymLogWakeLock.request("timer");
        else GymLogWakeLock.release("timer");
    }

    function unlockAudio() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            audioCtx = audioCtx || new AC();
            if (audioCtx.state === "suspended") audioCtx.resume();
        } catch (e) { /* ignore */ }
    }

    /* یک دسته بوق بلند: موج مربعی (واضح‌تر از سینوسی) با دو فرکانس متناوب */
    function beepBurst() {
        try {
            unlockAudio();
            if (!audioCtx) return;

            const master = audioCtx.createGain();
            master.gain.value = 1;
            let out = master;
            if (audioCtx.createDynamicsCompressor) {
                const comp = audioCtx.createDynamicsCompressor();
                master.connect(comp);
                comp.connect(audioCtx.destination);
            } else {
                master.connect(audioCtx.destination);
            }

            const t0 = audioCtx.currentTime + 0.02;
            for (let i = 0; i < BEEPS_PER_BURST; i++) {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                const at = t0 + i * 0.28;
                o.type = "square";
                o.frequency.value = i % 2 === 0 ? 988 : 1319;
                o.connect(g);
                g.connect(out);
                g.gain.setValueAtTime(0.0001, at);
                g.gain.exponentialRampToValueAtTime(0.9, at + 0.015);
                g.gain.setValueAtTime(0.9, at + 0.17);
                g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
                o.start(at);
                o.stop(at + 0.24);
            }
        } catch (e) { /* ignore */ }
    }

    function vibrate() {
        try {
            if (navigator.vibrate) navigator.vibrate([500, 150, 500, 150, 500, 150, 500]);
        } catch (e) { /* ignore */ }
    }

    function startAlarm() {
        stopAlarm();
        let bursts = 0;
        const fire = () => {
            bursts += 1;
            beepBurst();
            vibrate();
        };
        fire();
        alarmTimer = setInterval(() => {
            /* بعد از آخرین هشدار (و تمام‌شدن صدای آن) آلارم و تایمر بسته می‌شوند */
            if (bursts >= ALARM_MAX_BURSTS) { stop(); return; }
            fire();
        }, BURST_EVERY_MS);

        /* چشمک‌زدن کادر تایمر تا حتی بدون صدا هم دیده شود */
        let on = false;
        flashTimer = setInterval(() => {
            on = !on;
            if (!el) return;
            el.style.background = on ? "#16a34a" : "";
            el.style.color = on ? "#ffffff" : "";
            if (timeEl) timeEl.style.color = on ? "#ffffff" : "";
            if (labelEl) labelEl.style.color = on ? "#ffffff" : "";
        }, 450);
    }

    function stopAlarm() {
        clearInterval(alarmTimer); alarmTimer = null;
        clearInterval(flashTimer); flashTimer = null;
        try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) { /* ignore */ }
        if (el) {
            el.style.background = "";
            el.style.color = "";
        }
        if (timeEl) timeEl.style.color = "";
        if (labelEl) labelEl.style.color = "";
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
        labelEl.textContent = "استراحت تمام شد — ست بعدی!";
        clearTimeout(hideTimer);
        startAlarm();
        /* صفحه تا وقتی کاربر آلارم را ببیند روشن می‌ماند؛ با stop() آزاد می‌شود */
    }

    function start(seconds, exerciseName) {
        build();
        unlockAudio();           // باید داخل کلیک کاربر اجرا شود تا مرورگر صدا را مجاز کند
        stopAlarm();
        clearInterval(tick); clearTimeout(hideTimer);
        name = exerciseName || "";
        total = seconds;
        endAt = Date.now() + seconds * 1000;
        el.classList.remove("done");
        labelEl.textContent = "استراحت" + (name ? " · " + name : "");
        el.hidden = false;
        keepAwake(true);
        update();
        tick = setInterval(update, 250);
    }

    function adjust(delta) {
        if (!el || el.hidden) return;
        if (el.classList.contains("done")) {
            if (delta > 0) start(delta, name);
            else stop();
            return;
        }
        endAt += delta * 1000;
        total = Math.max(1, total + delta);
        update();
    }

    function stop() {
        clearInterval(tick); tick = null;
        clearTimeout(hideTimer);
        stopAlarm();
        keepAwake(false);
        if (el) { el.hidden = true; el.classList.remove("done"); }
    }

    document.addEventListener("click", e => {
        const btn = e.target.closest(".exercise-rest-btn");
        if (!btn) return;
        const sec = Number(btn.dataset.seconds);
        if (sec > 0) start(sec, btn.dataset.exerciseName);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            if (tick) update();
            unlockAudio();
        }
    });

    window.GymLogRestTimer = { start, stop };
})();
