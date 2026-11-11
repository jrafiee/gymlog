/* =====================================================
   GymLog — Dashboard Analytics (pure logic, no DOM)

   هر تابع این فایل یک «سؤال واقعی» را جواب می‌دهد:

   computeStatus      → این هفته چقدر تمرین کرده‌ام؟ چقدر به برنامه پایبند بوده‌ام؟
   computeSessionCharts → عملکرد هر حرکتِ یک جلسه‌ی برنامه در طول جلسات (و برنامه‌ها) چه شکلی بوده؟
   computeMuscleSets    → برای هر گروه عضلانی چند ست ثبت کرده‌ام؟
   computeReadiness   → کدام حرکت طبق target برنامه آماده‌ی افزایش وزنه است؟
   computeRecords     → آخرین رکوردهای معنادار من چه بوده‌اند؟

   قواعد ثابت:
   - هیچ جمعی بین حرکات مختلف (وزن×تکرار کل، حجم کل بدن، امتیاز ساختگی) وجود ندارد.
   - حرکات وزن‌بدنی و زمانی (پلانک، شنا، ...) در محاسبات بار لحاظ نمی‌شوند.
   - داده «نوع ست» (گرم‌کردن/کاری) ثبت نمی‌شود، پس هیچ فرضی درباره‌اش نداریم.
   - با داده ناقص یا کم، نتیجه‌گیری نمی‌کنیم و پیام صریح برمی‌گردانیم.

   برای افزودن شاخص جدید: یک تابع compute* اینجا بنویس، یک section در
   dashboard-overview.js ثبت کن. به بقیه‌ی کدها دست نمی‌زنی.
===================================================== */

(function (global) {
    "use strict";

    /* حرکاتی که «وزن» ثبت‌شده‌شان وزن خارجی قابل‌مقایسه نیست */
    const BODYWEIGHT_IDS = new Set([
        "elevated_pushup", "incline_pushup", "dead_bug",
        "plank", "side_plank", "crunch"
    ]);

    const MS_DAY = 86400000;
    const LRI = "\u2066";
    const PDI = "\u2069";

    /* =========================
       ابزارهای عمومی
    ========================= */
    const normDigits = toLatinDigits;

    function num(v) {
        if (v === "" || v === null || v === undefined) return null;
        const n = parseFloat(normDigits(v));
        return isFinite(n) ? n : null;
    }

    function fa(n, digits) {
        return Number(n).toLocaleString("fa-IR", { maximumFractionDigits: digits === undefined ? 1 : digits });
    }

    /* رشته‌ی ست با جهت LTR ایزوله، تا داخل متن فارسی بهم نریزد */
    function fmtSet(s) {
        return LRI + fa(s.weight) + "×" + fa(s.reps, 0) + PDI;
    }

    function parseIso(iso) {
        const [y, m, d] = iso.split("-").map(Number);
        return new Date(y, m - 1, d);
    }

    function toIso(d) {
        const p = n => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    function addDays(iso, n) {
        const d = parseIso(iso);
        d.setDate(d.getDate() + n);
        return toIso(d);
    }

    function diffDays(fromIso, toIsoStr) {
        return Math.round((parseIso(toIsoStr) - parseIso(fromIso)) / MS_DAY);
    }

    function sortWorkouts(list) {
        return (list || []).slice().sort((a, b) =>
            (a.date || "").localeCompare(b.date || "") || (a.id || 0) - (b.id || 0)
        );
    }

    /* =========================
       target برنامه  ←  "4 × 6–10"
    ========================= */
    function parseTarget(str) {
        const t = normDigits(str || "");
        const m = t.match(/(\d+)\s*[×xX*]\s*(\d+)(?:\s*[–—-]\s*(\d+))?/);
        if (!m) return null;
        const a = Number(m[2]);
        const b = m[3] ? Number(m[3]) : a;
        return {
            sets: Number(m[1]),
            min: Math.min(a, b),
            max: Math.max(a, b),
            timed: /ثانیه|دقیقه|sec|min/i.test(t),
            raw: str
        };
    }

    function getTarget(programs, month, exerciseId) {
        const m = programs && programs[month];
        if (!m || !m.sessions) return null;
        for (const key of Object.keys(m.sessions)) {
            const ex = (m.sessions[key].exercises || []).find(e => e.id === exerciseId);
            if (ex) {
                const t = parseTarget(ex.target);
                if (!t) return null;
                if (ex.sets) t.sets = Number(ex.sets);
                return t;
            }
        }
        return null;
    }

    function isTrackable(exerciseId, target, catalog) {
        if (BODYWEIGHT_IDS.has(exerciseId)) return false;
        if (catalog && catalog[exerciseId] && catalog[exerciseId].bodyweight) return false;
        if (target && target.timed) return false;
        return true;
    }

    /* =========================
       خواندن ست‌های یک حرکت
       ست معتبر = وزن و تکرار هر دو عدد مثبت.
       ست ناقص = فقط یکی پر شده یا نامعتبر است (حذف نمی‌شود، فقط شمرده می‌شود).
    ========================= */
    /* bodyMode=false: حرکات وزنه‌دار — ست معتبر = وزن و تکرار هر دو مثبت، بهترین ست = بیشترین وزن
       bodyMode=true : حرکات وزن‌بدنی/زمانی — ست معتبر = تکرار (یا ثانیه) مثبت، بهترین ست = بیشترین تکرار */
    function buildEntry(workout, ex, bodyMode) {
        const valid = [];
        let logged = 0;

        (ex.sets || []).forEach(s => {
            const hasW = s.weight !== "" && s.weight != null;
            const hasR = s.reps !== "" && s.reps != null;
            if (!hasW && !hasR) return;
            logged += 1;
            const w = num(s.weight);
            const r = num(s.reps);
            if (bodyMode) {
                if (r !== null && r > 0) valid.push({ weight: w !== null && w > 0 ? w : 0, reps: r });
            } else if (w !== null && r !== null && w > 0 && r > 0) {
                valid.push({ weight: w, reps: r });
            }
        });

        const better = bodyMode
            ? (s, b) => s.reps > b.reps || (s.reps === b.reps && s.weight > b.weight)
            : (s, b) => s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps);
        let best = null;
        valid.forEach(s => { if (!best || better(s, best)) best = s; });

        return {
            workoutId: workout.id,
            date: workout.date,
            week: workout.week,
            session: workout.session,
            month: workout.month,
            sets: valid,
            logged,
            incomplete: logged - valid.length,
            best,
            topSets: best ? valid.filter(s => (bodyMode ? s.reps === best.reps : s.weight === best.weight)) : []
        };
    }

    function exerciseSessions(workouts, exerciseId, bodyMode) {
        const out = [];
        sortWorkouts(workouts).forEach(w => {
            const ex = (w.exercises || []).find(e => e.id === exerciseId);
            if (!ex) return;
            const entry = buildEntry(w, ex, bodyMode);
            if (entry.sets.length > 0) out.push(entry);
        });
        return out;
    }

    const bodySessions = (workouts, exerciseId) => exerciseSessions(workouts, exerciseId, true);

    /* همه‌ی ست‌های هدف در یک وزن (بالاترین وزن جلسه) به سقف محدوده رسیده‌اند؟ */
    function isCeilingReached(entry, target) {
        if (!entry || !target || !entry.best) return false;
        if (entry.incomplete > 0) return false;
        return entry.topSets.length >= target.sets && entry.topSets.every(s => s.reps >= target.max);
    }

    function repStatus(reps, target) {
        if (!target) return "none";
        if (reps >= target.max) return "ceiling";
        if (reps >= target.min) return "in";
        return "below";
    }

    /* =========================
       ۱) وضعیت تمرین
    ========================= */
    function computeStatus(ctx) {
        const { workouts, activeMonth, program, today, detected } = ctx;
        const cycle = workouts.filter(w => w.month === activeMonth);
        const perWeek = program && program.sessions ? Object.keys(program.sessions).length : null;

        const from = addDays(today, -6);
        const last7 = workouts.filter(w => w.date >= from && w.date <= today).length;

        const lastWorkout = workouts.length ? workouts[workouts.length - 1] : null;
        let last = null;
        if (lastWorkout) {
            const sess = program && program.sessions ? program.sessions[lastWorkout.session] : null;
            last = {
                date: lastWorkout.date,
                daysAgo: Math.max(0, diffDays(lastWorkout.date, today)),
                title: sess && lastWorkout.month === activeMonth ? sess.title : null
            };
        }

        const weeksLogged = new Set(cycle.map(w => Number(w.week) || 1)).size;

        /* پایبندی فقط برای هفته‌های کامل‌شده و فقط وقتی برنامه تعداد جلسات مشخص دارد */
        let adherence = null;
        if (perWeek && detected.week > 1) {
            const done = new Set();
            cycle.forEach(w => {
                if (Number(w.week) < detected.week) done.add(`${w.week}_${w.session}`);
            });
            const planned = perWeek * (detected.week - 1);
            adherence = {
                done: Math.min(done.size, planned),
                planned,
                percent: Math.min(100, Math.round((done.size / planned) * 100))
            };
        }

        return { perWeek, last7, last, weeksLogged, adherence, cycleCount: cycle.length };
    }

    /* =========================
       ۲) روند عملکرد یک حرکت
       معیار: بهترین ست هر جلسه (بیشترین وزن، و در تساوی بیشترین تکرار)
    ========================= */
    function interpretProgression(sessions, target) {
        const n = sessions.length;
        if (n === 0) return { level: "none", text: "برای این حرکت در بازه‌ی انتخاب‌شده ثبتی وجود ندارد." };
        if (n === 1) return { level: "none", text: "فقط یک جلسه ثبت شده؛ داده کافی برای ارزیابی روند وجود ندارد." };

        const f = sessions[0].best;
        const l = sessions[n - 1].best;

        let change;
        if (l.weight > f.weight) {
            change = l.reps < f.reps ? "وزنه بیشتر شده و تکرارها کمتر"
                : l.reps === f.reps ? "وزنه بیشتر شده و تکرارها ثابت مانده"
                : "هم وزنه و هم تکرار بیشتر شده";
        } else if (l.weight === f.weight) {
            change = l.reps > f.reps ? "در همان وزن، تکرار بیشتر شده"
                : l.reps < f.reps ? "در همان وزن، تکرار کمتر شده"
                : "بدون تغییر";
        } else {
            change = "وزنه نسبت به ابتدای بازه کمتر است";
        }

        if (n === 2) {
            return {
                level: "limited",
                text: `بهترین ست از ${fmtSet(f)} به ${fmtSet(l)} رسیده (${change}). با دو جلسه، داده کافی برای ارزیابی روند وجود ندارد.`
            };
        }

        let text = `در ${fa(n, 0)} جلسه‌ی ثبت‌شده، بهترین ست از ${fmtSet(f)} به ${fmtSet(l)} رسیده است؛ ${change}.`;
        if (target) {
            const st = repStatus(l.reps, target);
            if (st === "ceiling") text += ` در جلسه‌ی آخر تکرار به سقف محدوده‌ی هدف (${fa(target.max, 0)}) رسیده است.`;
            else if (st === "in") text += ` تکرارهای جلسه‌ی آخر داخل محدوده‌ی هدف، ولی پایین‌تر از سقف (${fa(target.max, 0)}) است.`;
            else text += ` تکرار جلسه‌ی آخر پایین‌تر از حداقل محدوده‌ی هدف (${fa(target.min, 0)}) است.`;
        }
        return { level: "ok", text };
    }

    /* =========================
       ۴) آماده‌ی افزایش وزنه
       شرط: در آخرین ثبت همان حرکت، همه‌ی ست‌های هدف در یک وزن
       به سقف محدوده‌ی تکرارِ target برنامه رسیده باشند.
    ========================= */
    function computeReadiness(ctx) {
        const { workouts, activeMonth, program, programs, catalog } = ctx;
        if (!program || !program.sessions) return { state: "no-program" };

        const cycle = workouts.filter(w => w.month === activeMonth);
        if (!cycle.length) return { state: "empty" };

        const items = [];
        const seen = new Set();
        let evaluated = 0;

        Object.keys(program.sessions).sort((a, b) => Number(a) - Number(b)).forEach(k => {
            (program.sessions[k].exercises || []).forEach(ex => {
                if (seen.has(ex.id)) return;
                seen.add(ex.id);
                const target = getTarget(programs, activeMonth, ex.id);
                if (!target || !isTrackable(ex.id, target, catalog)) return;
                const hist = exerciseSessions(cycle, ex.id);
                if (!hist.length) return;
                evaluated += 1;
                const last = hist[hist.length - 1];
                if (isCeilingReached(last, target)) {
                    items.push({
                        id: ex.id,
                        name: catalog[ex.id] ? catalog[ex.id].name : ex.id,
                        weight: last.best.weight,
                        reps: last.topSets.map(s => s.reps),
                        target,
                        date: last.date
                    });
                }
            });
        });

        return { state: "ok", items, evaluated };
    }

    /* =========================
       ۵) رکوردهای اخیر
       Load PR  : بالاتر از هر وزنِ ثبت‌شده‌ی قبلی همان حرکت
       Rep PR   : تکرار بیشتر در وزنی که قبلاً هم ثبت شده
       Ceiling  : اولین بار رسیدن همه‌ی ست‌ها به سقف target در یک وزن
       (جلسه‌ی اول هر حرکت فقط مبنای مقایسه است، رکورد حساب نمی‌شود)
    ========================= */
    function computeRecords(ctx, limit) {
        const { workouts, programs, catalog, activeMonth } = ctx;
        const max = limit || 5;
        const events = [];

        const ids = new Set();
        workouts.forEach(w => (w.exercises || []).forEach(e => ids.add(e.id)));

        ids.forEach(id => {
            const sess = exerciseSessions(workouts, id);
            if (sess.length < 2) return;

            const anyTarget = getTarget(programs, activeMonth, id) || getTarget(programs, sess[sess.length - 1].month, id);
            if (!isTrackable(id, anyTarget, catalog)) return;

            const name = catalog[id] ? catalog[id].name : id;
            let maxW = -Infinity;
            const repsAt = new Map();
            const ceilingAt = new Set();

            sess.forEach((s, i) => {
                const top = s.best.weight;
                const t = getTarget(programs, s.month, id);
                const reached = isCeilingReached(s, t);
                let ev = null;

                if (i > 0) {
                    if (top > maxW) {
                        ev = { type: "load", detail: `${fa(top)} kg (قبلاً ${fa(maxW)} kg)` };
                    } else if (reached && !ceilingAt.has(top)) {
                        ev = { type: "ceiling", detail: `${fa(top)} kg — ${s.topSets.map(x => fa(x.reps, 0)).join(" / ")} (هدف ${t.raw})` };
                    } else {
                        let pr = null;
                        s.sets.forEach(x => {
                            if (repsAt.has(x.weight) && x.reps > repsAt.get(x.weight)) {
                                if (!pr || x.weight > pr.weight) pr = { weight: x.weight, reps: x.reps, prev: repsAt.get(x.weight) };
                            }
                        });
                        if (pr) ev = { type: "rep", detail: `${fa(pr.weight)} kg: ${fa(pr.reps, 0)} تکرار (قبلاً ${fa(pr.prev, 0)})` };
                    }
                }

                if (ev) events.push(Object.assign({ id, name, date: s.date }, ev));

                maxW = Math.max(maxW, top);
                s.sets.forEach(x => {
                    if (!repsAt.has(x.weight) || x.reps > repsAt.get(x.weight)) repsAt.set(x.weight, x.reps);
                });
                if (reached) ceilingAt.add(top);
            });
        });

        events.sort((a, b) => b.date.localeCompare(a.date));
        return { events: events.slice(0, max), total: events.length };
    }

    /* =========================
       ۶) نمودار همه‌ی حرکات یک جلسه‌ی برنامه
       حرکات با وزنه: بهترین ست (بیشترین وزن، در تساوی بیشترین تکرار)
       حرکات وزن‌بدنی/زمانی (شنا، پلانک، ...): بیشترین عدد ثبت‌شده در فیلد «تکرار» هر جلسه
       (برای پلانک همان مقدار ثانیه‌ای است که کاربر در فیلد تکرار می‌نویسد)
    ========================= */
    const TIMED_IDS = new Set(["plank", "side_plank"]);

    function unitFor(id, target) {
        if (target && target.timed) return /دقیقه|min/i.test(target.raw || "") ? "دقیقه" : "ثانیه";
        if (TIMED_IDS.has(id)) return "ثانیه";
        return "تکرار";
    }

    function interpretBody(sessions, target, unit) {
        const n = sessions.length;
        if (n === 0) return { level: "none", text: "برای این حرکت در بازه‌ی انتخاب‌شده ثبتی وجود ندارد." };
        if (n === 1) return { level: "none", text: "فقط یک جلسه ثبت شده؛ داده کافی برای ارزیابی روند وجود ندارد." };

        const f = sessions[0].best.reps;
        const l = sessions[n - 1].best.reps;
        const label = unit === "تکرار" ? "تکرار" : "مدت";
        const change = l > f ? `${label} بیشتر شده (+${fa(l - f, 0)})`
            : l < f ? `${label} کمتر شده (−${fa(f - l, 0)})`
            : "بدون تغییر";
        const u = unit === "تکرار" ? "" : " " + unit;

        if (n === 2) {
            return {
                level: "limited",
                text: `بهترین ثبت از ${fa(f, 0)}${u} به ${fa(l, 0)}${u} رسیده (${change}). با دو جلسه، داده کافی برای ارزیابی روند وجود ندارد.`
            };
        }

        let text = `در ${fa(n, 0)} جلسه‌ی ثبت‌شده، بهترین ثبت از ${fa(f, 0)}${u} به ${fa(l, 0)}${u} رسیده است؛ ${change}.`;
        if (target) {
            const st = repStatus(l, target);
            if (st === "ceiling") text += ` در جلسه‌ی آخر به سقف محدوده‌ی هدف (${fa(target.max, 0)}) رسیده است.`;
            else if (st === "in") text += ` جلسه‌ی آخر داخل محدوده‌ی هدف، ولی پایین‌تر از سقف (${fa(target.max, 0)}) است.`;
            else text += ` جلسه‌ی آخر پایین‌تر از حداقل محدوده‌ی هدف (${fa(target.min, 0)}) است.`;
        }
        return { level: "ok", text };
    }

    /* چارت همه‌ی حرکات یک جلسه‌ی برنامه
       - فهرست حرکات از «جلسه‌ی انتخاب‌شده در برنامه‌ی انتخاب‌شده» می‌آید
       - سابقه‌ی هر حرکت از همه‌ی برنامه‌های قبلی (بر اساس id حرکت) جمع می‌شود
       - هر ثبت برچسب inCycle دارد: آیا مربوط به دوره‌ی انتخاب‌شده (پیش‌فرض: آخرین) است؟ */
    function computeSessionCharts(ctx, f) {
        const { programs, catalog, today, activeMonth } = ctx;
        const isAll = f.month === "all";
        const month = isAll ? null : (f.month && programs[f.month] ? f.month : activeMonth);

        let ws = ctx.workouts;
        if (f.range && f.range !== "all") ws = ws.filter(w => w.date >= addDays(today, -7 * Number(f.range) + 1));

        const prog = month && programs[month] ? programs[month] : null;
        const sess = prog && prog.sessions ? prog.sessions[f.session] : null;

        /* ترتیب حرکات: در حالت «کل سابقه» اجتماع حرکات همه‌ی برنامه‌ها (به‌ترتیب گروه عضلانی)،
           در غیر این صورت حرکات جلسه‌ی انتخاب‌شده */
        let order = sess ? sess.exercises.map(e => e.id) : [];
        if (isAll) {
            const seen = [];
            const monthKeys = Object.keys(programs).sort((a, b) => parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10));
            monthKeys.forEach(mk => Object.keys(programs[mk].sessions || {}).forEach(k =>
                (programs[mk].sessions[k].exercises || []).forEach(e => { if (!seen.includes(e.id)) seen.push(e.id); })));
            ws.forEach(w => (w.exercises || []).forEach(e => { if (!seen.includes(e.id)) seen.push(e.id); }));
            const rank = id => {
                const cat = (catalog[id] && catalog[id].category) || MUSCLE_MAP[id];
                const i = MUSCLE_ORDER.indexOf(cat);
                return i === -1 ? 99 : i;
            };
            order = seen.map((id, i) => ({ id, i })).sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i).map(x => x.id);
        }

        /* target حرکت: از برنامه‌ی انتخاب‌شده، وگرنه از جدیدترین برنامه‌ای که حرکت در آن هست */
        const targetFor = id => {
            let t = getTarget(programs, month || activeMonth, id);
            if (t) return t;
            const keys = Object.keys(programs).sort((a, b) => parseInt(b.replace(/\D/g, ""), 10) - parseInt(a.replace(/\D/g, ""), 10));
            for (const k of keys) { t = getTarget(programs, k, id); if (t) return t; }
            return null;
        };

        const makeStats = (sessions, isLoad) => {
            if (!sessions.length) return null;
            const val = s => (isLoad ? s.best.weight : s.best.reps);
            const top = sessions.reduce((m, s) => (val(s) > val(m) ? s : m), sessions[0]);
            return {
                count: sessions.length,
                maxBest: top.best,
                last: sessions[sessions.length - 1].best,
                incompleteSessions: sessions.filter(s => s.incomplete > 0).length
            };
        };

        const items = order.map(id => {
            const target = targetFor(id);
            const kind = isTrackable(id, target, catalog) ? "load" : "reps";
            const unit = kind === "load" ? "kg" : unitFor(id, target);

            const hist = kind === "load" ? exerciseSessions(ws, id) : bodySessions(ws, id);
            const sessions = hist.map(s => {
                const t = getTarget(programs, s.month, id);
                return Object.assign({}, s, {
                    target: t,
                    status: repStatus(s.best.reps, t),
                    programTitle: programs[s.month] ? programs[s.month].title : "",
                    inCycle: isAll ? true : s.month === month
                });
            });
            const cycleSessions = sessions.filter(s => s.inCycle);

            const lastTarget = (cycleSessions.length ? cycleSessions : sessions).length
                ? (cycleSessions.length ? cycleSessions : sessions).slice(-1)[0].target
                : target;
            const interp = list => (kind === "load"
                ? interpretProgression(list, lastTarget)
                : interpretBody(list, lastTarget, unit));

            return {
                id,
                name: catalog[id] ? catalog[id].name : id,
                kind,
                unit,
                sessionTitle: sess ? sess.title : "",
                sessions,
                programCount: new Set(sessions.map(s => s.month)).size,
                target: lastTarget,
                stats: makeStats(sessions, kind === "load"),
                interpretation: interp(sessions),
                cycle: {
                    sessions: cycleSessions,
                    stats: makeStats(cycleSessions, kind === "load"),
                    interpretation: interp(cycleSessions)
                }
            };
        });

        return {
            isAll,
            workoutCount: ws.length,
            items: isAll ? items.filter(it => it.sessions.length > 0) : items,
            sessionTitle: isAll ? "همه‌ی حرکات در تمام برنامه‌ها" : (sess ? sess.title : ""),
            cycleMonth: month,
            cycleTitle: isAll ? "" : (prog ? prog.title : "")
        };
    }

    /* =========================
       ۷) تعداد ست هر گروه عضلانی (برای نمودار عنکبوتی)
       هر ستی که وزنه یا تکرارش ثبت شده یک ست حساب می‌شود.
    ========================= */
    const MUSCLE_ORDER = MUSCLE_GROUP_ORDER;
    const MUSCLE_MAP = EXERCISE_CATEGORIES_MAP;

    function computeMuscleSets(ctx, range) {
        const { workouts, catalog, today } = ctx;
        let ws = workouts;
        if (range && range !== "all") ws = ws.filter(w => w.date >= addDays(today, -Number(range) + 1));

        const counts = {};
        MUSCLE_ORDER.forEach(c => { counts[c] = 0; });
        let other = 0;

        ws.forEach(w => (w.exercises || []).forEach(ex => {
            const cat = (catalog[ex.id] && catalog[ex.id].category) || MUSCLE_MAP[ex.id] || null;
            (ex.sets || []).forEach(s => {
                const hasW = s.weight !== "" && s.weight != null;
                const hasR = s.reps !== "" && s.reps != null;
                if (!hasW && !hasR) return;
                if (cat && counts[cat] !== undefined) counts[cat] += 1;
                else other += 1;
            });
        }));

        const groups = MUSCLE_ORDER.map(name => ({ name, sets: counts[name] }));
        return {
            groups,
            total: groups.reduce((a, g) => a + g.sets, 0),
            other,
            workoutCount: ws.length
        };
    }

    global.DashAnalytics = {
        BODYWEIGHT_IDS, fa, sortWorkouts,
        computeStatus, computeReadiness, computeRecords,
        computeSessionCharts, computeMuscleSets
    };
})(window);


/* =====================================================
   GymLog — Dashboard Overview (rendering)

   ساختار ماژولار: هر بخش یک آبجکت در SECTIONS است
       { render(ctx) → html,  mount(slot, ctx) → اتصال رویدادها }
   برای افزودن/حذف یک بخش:
     ۱) آن را در SECTIONS ثبت/حذف کن
     ۲) در LAYOUT (پایین فایل) جایش را مشخص کن
   محاسبات (بخش اول همین فایل، DashAnalytics) از نمایش جدا نگه داشته شده‌اند.

   این فایل باید بعد از dashboard.js لود شود.
===================================================== */

(function () {
    "use strict";

    const A = window.DashAnalytics;

    /* =========================
       ابزارهای نمایش
    ========================= */
    const fa = A.fa;
    const setHtml = s => `<bdi class="dv-num">${fa(s.weight)}×${fa(s.reps, 0)}</bdi>`;
    const pDate = (iso, long) => (typeof formatPersianDate === "function" ? formatPersianDate(iso, !!long) : iso);
    const shortDate = iso => {
        const p = pDate(iso).split("/");
        return p.length === 3 ? p.slice(1).join("/") : pDate(iso);
    };
    const daysAgoText = n => (n === 0 ? "امروز" : n === 1 ? "دیروز" : `${fa(n, 0)} روز پیش`);

    /* وضعیت فیلترهای بخش «روند عملکرد» */
    const state = { range: "all", month: "all", session: null, muscleRange: "all" };
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
       بخش ۳: روند عملکرد حرکات
       جلسه‌ها به‌صورت باکس انتخاب می‌شوند؛ زیر آن نمودار تک‌تک حرکات همان جلسه
       در باکس‌های جدا نمایش داده می‌شود و با کلیک، در مودال بزرگ باز می‌شود.
       حرکات با وزنه: بهترین ست هر جلسه — حرکات وزن‌بدنی/زمانی: بیشترین تکرار (یا ثانیه)
    ========================= */
    const STATUS_COLORS = { ceiling: "#16a34a", in: "#2563eb", below: "#d97706", none: "#9ca3af" };
    const STATUS_LABELS = {
        ceiling: "به سقف محدوده‌ی هدف رسیده",
        in: "داخل محدوده‌ی هدف",
        below: "پایین‌تر از حداقل محدوده‌ی هدف",
        none: "بدون target مشخص"
    };

    let progItems = [];
    let progCycleTitle = "";
    let closeModalFn = null;

    function progressionFilters(ctx) {
        const monthKeys = Object.keys(ctx.programs);
        const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(label)}</option>`;
        const range = ["4", "8", "all"].map(v => opt(v, v === "all" ? "کل سابقه" : `${fa(v, 0)} هفته اخیر`, state.range)).join("");
        const months = opt("all", "کل سابقه", state.month) + monthKeys.map(k => opt(k, ctx.programs[k].title, state.month)).join("");
        return { range, months };
    }

    /* نمودار خطی: compact = کارت کوچک، غیر compact = نسخه‌ی مودال با tooltip
       list = فهرست ثبت‌ها (پیش‌فرض: کل سابقه).
       وقتی چند برنامه در نمودار هست: ثبت‌های دوره‌ی انتخاب‌شده پررنگ، برنامه‌های قبلی کم‌رنگ،
       و مرز بین برنامه‌ها با خط‌چین مشخص می‌شود. */
    function chartSvg(item, compact, list) {
        const sessions = list || item.sessions;
        const isLoad = item.kind === "load";
        const W = compact ? 300 : 560, H = compact ? 150 : 270;
        const pl = compact ? 30 : 46, pr = compact ? 16 : 22, pt = compact ? 26 : 36, pb = compact ? 28 : 46;
        const n = sessions.length;
        const val = s => (isLoad ? s.best.weight : s.best.reps);
        const ws = sessions.map(val);
        let lo = Math.min(...ws), hi = Math.max(...ws);
        if (lo === hi) {
            const d = isLoad ? 2.5 : Math.max(1, Math.round(hi * 0.15));
            lo -= d; hi += d;
        } else {
            const pad = (hi - lo) * 0.25; lo -= pad; hi += pad;
        }
        lo = Math.max(0, lo);

        const x = i => (n === 1 ? (pl + (W - pl - pr) / 2) : pl + (i * (W - pl - pr)) / (n - 1));
        const y = v => H - pb - ((v - lo) / (hi - lo)) * (H - pt - pb);
        const fs = compact ? 9 : 10;
        const mixed = new Set(sessions.map(s => s.month)).size > 1;
        const dim = s => mixed && !s.inCycle;

        const grid = [0, 0.5, 1].map(f => {
            const v = lo + f * (hi - lo);
            const yy = y(v);
            return `<line x1="${pl}" y1="${yy.toFixed(1)}" x2="${W - pr}" y2="${yy.toFixed(1)}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3 3"/>
                    <text x="${pl - 6}" y="${(yy + 3).toFixed(1)}" font-size="${fs}" fill="#9ca3af" text-anchor="end">${fa(v, isLoad ? 1 : 0)}</text>`;
        }).join("");

        /* خط روند: هر پاره‌خط جداگانه، تا بخش دوره‌ی انتخاب‌شده پررنگ‌تر دیده شود */
        let line = "";
        for (let i = 1; i < n; i++) {
            const strong = !dim(sessions[i]) && !dim(sessions[i - 1]);
            line += `<line x1="${x(i - 1).toFixed(1)}" y1="${y(val(sessions[i - 1])).toFixed(1)}" x2="${x(i).toFixed(1)}" y2="${y(val(sessions[i])).toFixed(1)}"
                stroke="#2563eb" stroke-opacity="${strong ? 0.75 : 0.28}" stroke-width="${strong ? 2.2 : 1.6}" stroke-linecap="round"/>`;
        }

        /* مرز بین برنامه‌ها */
        let seps = "";
        for (let i = 1; i < n; i++) {
            if (sessions[i].month === sessions[i - 1].month) continue;
            const sx = ((x(i - 1) + x(i)) / 2).toFixed(1);
            seps += `<line x1="${sx}" y1="${pt - 12}" x2="${sx}" y2="${H - pb}" stroke="#9ca3af" stroke-opacity="0.55" stroke-dasharray="4 3"/>`;
            if (!compact) {
                seps += `<text x="${(Number(sx) + 4).toFixed(1)}" y="${pt - 14}" font-size="9.5" fill="#9ca3af">${esc(sessions[i].programTitle)}</text>`;
            }
        }
        if (!compact && mixed) {
            seps += `<text x="${pl + 2}" y="${pt - 14}" font-size="9.5" fill="#9ca3af">${esc(sessions[0].programTitle)}</text>`;
        }

        const step = compact ? 1 : (n > 10 ? Math.ceil(n / 8) : 1);
        const showVal = i => (compact ? (n <= 4 || i === n - 1) : (i % step === 0 || i === n - 1));
        const showDate = i => (compact ? (i === 0 || i === n - 1) : (i % step === 0 || i === n - 1));
        const text = s => (isLoad ? `${fa(s.best.weight)}×${fa(s.best.reps, 0)}` : fa(s.best.reps, 0));

        const dots = sessions.map((s, i) => {
            const cx = x(i).toFixed(1), cy = y(val(s)).toFixed(1);
            const op = dim(s) ? 0.5 : 1;
            const label = showVal(i)
                ? `<text x="${cx}" y="${(y(val(s)) - 9).toFixed(1)}" font-size="${compact ? 9.5 : 10.5}" font-weight="700" fill="currentColor" fill-opacity="${dim(s) ? 0.6 : 1}" text-anchor="middle">${text(s)}</text>`
                : "";
            const xl = showDate(i)
                ? `<text x="${cx}" y="${H - (compact ? 8 : 18)}" font-size="${compact ? 9 : 9.5}" fill="#9ca3af" text-anchor="middle">${shortDate(s.date)}</text>`
                : "";

            if (compact) {
                return `${label}${xl}<circle cx="${cx}" cy="${cy}" r="${dim(s) ? 3.5 : 4.5}" fill="${STATUS_COLORS[s.status]}" fill-opacity="${op}" stroke="#fff" stroke-width="1.5"/>`;
            }

            const best = isLoad
                ? `بهترین ست: ${fa(s.best.weight)} kg × ${fa(s.best.reps, 0)}`
                : `بهترین ثبت: ${fa(s.best.reps, 0)} ${item.unit}${s.best.weight > 0 ? ` (با ${fa(s.best.weight)} kg)` : ""}`;
            const all = isLoad
                ? s.sets.map(t => `${fa(t.weight)}×${fa(t.reps, 0)}`).join("  ·  ")
                : s.sets.map(t => fa(t.reps, 0)).join("  ·  ");
            const tip = [
                pDate(s.date, true),
                `${s.programTitle || ""} · هفته ${fa(s.week, 0)} · جلسه ${fa(s.session, 0)}`,
                best,
                `همه‌ی ست‌ها: ${all}`,
                s.target ? `هدف ${s.target.raw}: ${STATUS_LABELS[s.status]}` : STATUS_LABELS.none,
                s.incomplete > 0 ? `⚠ ${fa(s.incomplete, 0)} ست ناقص ثبت شده` : ""
            ].filter(Boolean).join("\n");

            return `${label}${xl}
                <circle class="dv-dot" cx="${cx}" cy="${cy}" r="${dim(s) ? 5 : 6.5}" fill="${STATUS_COLORS[s.status]}" fill-opacity="${op}" stroke="#fff" stroke-width="2"
                        tabindex="0" data-tip="${esc(tip).replace(/\n/g, "&#10;")}"/>`;
        }).join("");

        return `<svg viewBox="0 0 ${W} ${H}" class="dv-svg" role="img" aria-label="روند ${esc(item.name)}">${grid}${seps}${line}${dots}</svg>`;
    }

    function itemTag(item) {
        if (item.kind === "load") return "";
        return item.unit === "تکرار" ? "وزن‌بدنی · تکرار" : `زمانی · ${item.unit}`;
    }

    function bestText(item, b) {
        return item.kind === "load"
            ? setHtml(b)
            : `<bdi class="dv-num">${fa(b.reps, 0)}${item.unit === "تکرار" ? "" : " " + item.unit}</bdi>`;
    }

    function itemCardHtml(item, idx) {
        const list = item.sessions;
        const has = list.length > 0;
        const tag = itemTag(item);
        const st = item.stats;
        let foot;
        if (!has) {
            foot = `<span>—</span>`;
        } else {
            const inCycle = state.month !== "all" ? item.cycle.sessions.length : 0;
            foot = `<span>${fa(st.count, 0)} جلسه · ${fa(item.programCount, 0)} برنامه${inCycle ? ` · این دوره: ${fa(inCycle, 0)}` : ""}</span><span>آخرین: ${bestText(item, st.last)}</span>`;
        }
        return `
        <button type="button" class="dv-ex-card" data-idx="${idx}" aria-label="باز کردن نمودار ${esc(item.name)}">
            <div class="dv-ex-head">
                <strong>${esc(item.name)}</strong>
                ${tag ? `<span class="dv-ex-tag">${esc(tag)}</span>` : ""}
            </div>
            ${has ? chartSvg(item, true, list) : `<div class="dv-ex-empty">ثبتی در این بازه وجود ندارد</div>`}
            <div class="dv-ex-foot">${foot}</div>
        </button>`;
    }

    function mountTips(root) {
        root.querySelectorAll(".dv-chart").forEach(wrap => {
            const tip = wrap.querySelector(".dv-tip");
            if (!tip) return;

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

            wrap.querySelectorAll(".dv-dot").forEach(dot => {
                dot.addEventListener("pointerenter", () => show(dot));
                dot.addEventListener("pointerleave", hide);
                dot.addEventListener("focus", () => show(dot));
                dot.addEventListener("blur", hide);
                dot.addEventListener("click", e => { e.stopPropagation(); show(dot); });
            });
            wrap.addEventListener("click", hide);
        });
    }

    /* یک بخش مودال: نمودار + داده‌ی ثبت‌شده + تفسیر */
    function modalBlock(item, title, list, stats, interp) {
        if (!list.length) {
            return `<section class="dv-mblock"><h4 class="dv-mblock-title">${esc(title)}</h4>
                <div class="dv-empty">برای این بخش ثبتی وجود ندارد.</div></section>`;
        }
        const isLoad = item.kind === "load";
        return `
        <section class="dv-mblock">
            <h4 class="dv-mblock-title">${esc(title)}</h4>
            <div class="dv-chart">
                ${chartSvg(item, false, list)}
                <div class="dv-tip" hidden></div>
            </div>
            <dl class="dv-observed">
                <div><dt>جلسات</dt><dd>${fa(stats.count, 0)}</dd></div>
                <div><dt>${isLoad ? "بیشترین وزنه" : "بیشترین مقدار"}</dt><dd>${bestText(item, stats.maxBest)}</dd></div>
                <div><dt>آخرین بهترین ثبت</dt><dd>${bestText(item, stats.last)}</dd></div>
                ${item.target ? `<div><dt>هدف برنامه</dt><dd>${esc(item.target.raw)}</dd></div>` : ""}
            </dl>
            <p class="dv-interp dv-interp-${interp.level}"><b>تفسیر</b>${esc(interp.text)}</p>
            ${stats.incompleteSessions ? `<p class="dv-note">در ${fa(stats.incompleteSessions, 0)} جلسه، بعضی ست‌ها ناقص ثبت شده‌اند (فقط وزن یا فقط تکرار) و در نمودار لحاظ نشده‌اند.</p>` : ""}
        </section>`;
    }

    function openExerciseModal(item, cycleTitle) {

        let body;
        if (!item.sessions.length) {
            body = `<div class="dv-empty">برای این حرکت در بازه‌ی انتخاب‌شده ثبتی وجود ندارد. بازه را روی «کل سابقه» بگذار.</div>`;
        } else {
            const isLoad = item.kind === "load";
            const legend = Object.keys(STATUS_COLORS).filter(k => k !== "none" || !item.target).map(k =>
                `<span><i style="background:${STATUS_COLORS[k]}"></i>${STATUS_LABELS[k]}</span>`).join("");
            const multi = item.programCount > 1;
            const hasCycle = multi && !!cycleTitle;
            const cTitle = cycleTitle;

            body = `
                ${modalBlock(item,
                    multi ? `کل روند در ${fa(item.programCount, 0)} برنامه` : "کل روند",
                    item.sessions, item.stats, item.interpretation)}
                ${hasCycle ? `<p class="dv-note dv-mlegend-note">نقطه‌های پررنگ مربوط به «${esc(cTitle)}» و نقطه‌های کم‌رنگ مربوط به برنامه‌های قبلی‌اند؛ خط‌چین مرز دو برنامه را نشان می‌دهد.</p>` : ""}
                ${hasCycle ? modalBlock(item, `عملکرد ${cTitle}`, item.cycle.sessions, item.cycle.stats, item.cycle.interpretation) : ""}
                <div class="dv-legend">${legend}</div>
                <p class="dv-note">${isLoad
                    ? "نوع ست (گرم‌کردن یا کاری) در داده ثبت نمی‌شود؛ پس همه‌ی ست‌های ثبت‌شده بررسی شده‌اند و بهترین ست، ست با بیشترین وزنه است. سابقه‌ی حرکت بر اساس شناسه‌ی حرکت از همه‌ی برنامه‌ها جمع می‌شود، حتی اگر شماره‌ی جلسه‌اش فرق کرده باشد."
                    : `برای این حرکت، بیشترین عدد ثبت‌شده در فیلد «تکرار» هر جلسه رسم می‌شود${item.unit === "تکرار" ? "" : ` (واحد: ${item.unit})`}.`}</p>`;
        }

        const overlay = document.createElement("div");
        overlay.className = "dv-modal-overlay";
        overlay.innerHTML = `
            <div class="dv-modal" role="dialog" aria-modal="true" aria-label="${esc(item.name)}">
                <div class="dv-modal-head">
                    <div>
                        <h3>${esc(item.name)}</h3>
                        <p>${esc(item.sessionTitle)}${itemTag(item) ? " · " + esc(itemTag(item)) : ""}</p>
                    </div>
                    <button type="button" class="exercise-guide-close dv-modal-close" aria-label="بستن">×</button>
                </div>
                ${body}
            </div>`;

        let prevOverflow = "";
        const onKey = e => { if (e.key === "Escape") close(); };
        /* اگر مودال قبلی هنوز باز باشد، openModalHistory آن را جایگزین می‌کند (cleanup قبلی اول اجرا می‌شود) */
        const close = openModalHistory("exerciseChart", () => {
            overlay.remove();
            document.body.style.overflow = prevOverflow;
            document.removeEventListener("keydown", onKey);
            closeModalFn = null;
        });
        prevOverflow = document.body.style.overflow;
        closeModalFn = close;

        overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
        overlay.querySelector(".dv-modal-close").addEventListener("click", close);
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        document.body.appendChild(overlay);
        mountTips(overlay);
    }

    const sectionProgression = {
        render(ctx) {
            const monthKeys = Object.keys(ctx.programs);
            if (state.month !== "all" && !ctx.programs[state.month]) state.month = "all";
            const isAll = state.month === "all";

            const sessMap = (!isAll && ctx.programs[state.month] && ctx.programs[state.month].sessions) || {};
            const keys = Object.keys(sessMap).sort((a, b) => Number(a) - Number(b));
            if (!isAll && (!state.session || !sessMap[state.session])) state.session = keys[0] || null;

            const f = progressionFilters(ctx);
            const filters = `
                <div class="dv-filters dv-filters-inline">
                    <label>بازه <select data-f="range">${f.range}</select></label>
                    <label>دوره مقایسه <select data-f="month">${f.months}</select></label>
                </div>`;

            /* با «کل سابقه» دکمه‌های جلسه پنهان‌اند: یک حرکت ممکن است در برنامه‌های مختلف در جلسه‌های متفاوتی باشد */
            const sessionBoxes = !isAll && keys.length
                ? `<div class="dv-sessions" role="tablist" aria-label="انتخاب جلسه">
                    ${keys.map(k => `
                        <button type="button" role="tab" aria-selected="${k === state.session}" class="dv-sess-btn ${k === state.session ? "active" : ""}" data-sess="${esc(k)}">
                            <b>جلسه ${fa(k, 0)}</b>
                            <span>${esc(sessMap[k].title)}</span>
                        </button>`).join("")}
                   </div>`
                : "";

            let body;
            if (!isAll && !state.session) {
                progItems = [];
                body = `<div class="dv-empty">برای نمایش نمودار، ابتدا یک برنامه‌ی تمرینی بارگذاری کن.</div>`;
            } else {
                const data = A.computeSessionCharts(ctx, state);
                progItems = data.items;
                progCycleTitle = data.cycleTitle;
                const logged = progItems.some(it => it.sessions.length);
                const hint = logged ? "" : `<p class="dv-note">برای این انتخاب در بازه‌ی فعلی چیزی ثبت نشده. بازه را روی «کل سابقه» بگذار یا یک جلسه ثبت کن.</p>`;
                const scopeNote = isAll
                    ? "روند هر حرکت در تمام برنامه‌ها نمایش داده می‌شود؛ خط‌چین مرز دو برنامه است. برای دیدن جلسه‌های یک برنامه، آن را از «دوره مقایسه» انتخاب کن."
                    : (monthKeys.length > 1
                        ? `روند هر حرکت در همه‌ی برنامه‌ها نمایش داده می‌شود؛ ثبت‌های «${esc(data.cycleTitle)}» پررنگ و برنامه‌های قبلی کم‌رنگ‌اند. با کلیک روی هر نمودار، نمودار جداگانه‌ی همان دوره هم کنارش باز می‌شود.`
                        : "");
                body = `
                    <div class="dv-ex-grid">${progItems.map(itemCardHtml).join("")}</div>
                    ${hint}
                    ${scopeNote ? `<p class="dv-note">${scopeNote}</p>` : ""}
                    <p class="dv-note">روی هر نمودار کلیک کن تا بزرگ شود. حرکات با وزنه: بهترین ست هر جلسه — حرکات وزن‌بدنی و زمانی (شنا، پلانک و …): بیشترین تکرار یا ثانیه‌ی ثبت‌شده.</p>`;
            }

            return `
            <section class="dv-card">
                <header class="dv-card-head">
                    <h3>روند عملکرد حرکات</h3>
                    <p>${isAll ? "روند همه‌ی حرکات در تمام برنامه‌ها" : "یک جلسه را انتخاب کن تا نمودار همه‌ی حرکات آن را در تمام برنامه‌ها ببینی"}</p>
                </header>
                ${filters}
                ${sessionBoxes}
                ${body}
            </section>`;
        },
        mount(slot, ctx) {
            slot.querySelectorAll("select[data-f]").forEach(sel => {
                sel.addEventListener("change", () => {
                    const k = sel.dataset.f;
                    state[k] = sel.value;
                    if (k === "month") state.session = null;
                    refresh("progression");
                });
            });

            slot.querySelectorAll(".dv-sess-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    state.session = btn.dataset.sess;
                    refresh("progression");
                });
            });

            slot.querySelectorAll(".dv-ex-card").forEach(card => {
                card.addEventListener("click", () => {
                    const item = progItems[Number(card.dataset.idx)];
                    if (item) openExerciseModal(item, progCycleTitle);
                });
            });
        }
    };

    /* =========================
       بخش ۴: نمودار عنکبوتی گروه‌های عضلانی
       سؤال: در بازه‌ی انتخاب‌شده برای هر گروه عضلانی چند ست ثبت کرده‌ام؟
    ========================= */
    const MUSCLE_RANGES = [["7", "۷ روز اخیر"], ["30", "۳۰ روز اخیر"], ["90", "۹۰ روز اخیر"], ["all", "کل دوره‌ها"]];

    function radarSvg(groups) {
        const size = 380, c = size / 2, R = 120, n = groups.length;
        const maxV = Math.max(...groups.map(g => g.sets), 1);
        const top = Math.max(4, Math.ceil(maxV / 4) * 4);
        const pt = (i, f) => {
            const a = (Math.PI * 2 * i) / n - Math.PI / 2;
            return { x: c + R * f * Math.cos(a), y: c + R * f * Math.sin(a) };
        };
        const poly = f => groups.map((_, i) => { const p = pt(i, f); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");

        const rings = [0.25, 0.5, 0.75, 1].map(f =>
            `<polygon points="${poly(f)}" fill="none" stroke="currentColor" stroke-opacity="0.14"/>`).join("");
        const ringLabels = [0.25, 0.5, 0.75, 1].map(f =>
            `<text x="${c + 4}" y="${(c - R * f - 2).toFixed(1)}" font-size="9" fill="#9ca3af">${fa(top * f, 0)}</text>`).join("");
        const axes = groups.map((_, i) => {
            const p = pt(i, 1);
            return `<line x1="${c}" y1="${c}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="currentColor" stroke-opacity="0.12"/>`;
        }).join("");

        const pts = groups.map((g, i) => pt(i, g.sets / top));
        const area = `<polygon points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="#2563eb" fill-opacity="0.2" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>`;
        const dots = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#2563eb" stroke="#fff" stroke-width="1.5"/>`).join("");

        const labels = groups.map((g, i) => {
            const a = (Math.PI * 2 * i) / n - Math.PI / 2;
            const lx = c + (R + 30) * Math.cos(a), ly = c + (R + 30) * Math.sin(a);
            return `<text x="${lx.toFixed(1)}" y="${(ly - 3).toFixed(1)}" text-anchor="middle" font-size="12.5" fill="currentColor">${esc(g.name)}</text>
                    <text x="${lx.toFixed(1)}" y="${(ly + 12).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#2563eb">${fa(g.sets, 0)} ست</text>`;
        }).join("");

        return `<svg viewBox="0 0 ${size} ${size}" class="dv-radar-svg" role="img" aria-label="تعداد ست هر گروه عضلانی">${rings}${axes}${ringLabels}${area}${dots}${labels}</svg>`;
    }

    const sectionMuscle = {
        render(ctx) {
            const d = A.computeMuscleSets(ctx, state.muscleRange);
            const pills = MUSCLE_RANGES.map(([v, l]) =>
                `<button type="button" class="dv-pill ${state.muscleRange === v ? "active" : ""}" data-mr="${v}">${l}</button>`).join("");

            let body;
            if (!d.total) {
                body = `<div class="dv-empty">در این بازه ستی ثبت نشده. بازه را روی «کل دوره‌ها» بگذار یا یک جلسه ثبت کن.</div>`;
            } else {
                const max = Math.max(...d.groups.map(g => g.sets), 1);
                const rows = d.groups.slice().sort((a, b) => b.sets - a.sets).map(g => `
                    <li class="dv-mus-row">
                        <span class="dv-mus-name">${esc(g.name)}</span>
                        <span class="dv-mus-bar"><i style="width:${Math.round((g.sets / max) * 100)}%"></i></span>
                        <b>${fa(g.sets, 0)}</b>
                    </li>`).join("");
                body = `
                    <div class="dv-radar">
                        <div class="dv-radar-chart">${radarSvg(d.groups)}</div>
                        <div class="dv-radar-side">
                            <p class="dv-radar-total">مجموع <b>${fa(d.total, 0)}</b> ست در <b>${fa(d.workoutCount, 0)}</b> جلسه</p>
                            <ul class="dv-mus-list">${rows}</ul>
                        </div>
                    </div>
                    <p class="dv-note">هر ستی که وزنه یا تکرارش ثبت شده یک ست حساب می‌شود؛ نوع ست (گرم‌کردن یا کاری) در داده ثبت نمی‌شود.${d.other ? ` ${fa(d.other, 0)} ست مربوط به حرکاتی که گروه عضلانی مشخصی ندارند در نمودار نیامده است.` : ""}</p>`;
            }

            return `
            <section class="dv-card">
                <header class="dv-card-head">
                    <h3>تعداد ست هر گروه عضلانی</h3>
                    <p>مقایسه‌ی تعداد ست‌های ثبت‌شده برای سینه، پشت، سرشانه، بازو، پا و شکم</p>
                </header>
                <div class="dv-pills">${pills}</div>
                ${body}
            </section>`;
        },
        mount(slot) {
            slot.querySelectorAll(".dv-pill").forEach(btn => {
                btn.addEventListener("click", () => {
                    state.muscleRange = btn.dataset.mr;
                    refresh("muscle");
                });
            });
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
        muscle: sectionMuscle,
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
            slot("muscle"),
            `<div class="dv-split">
                ${slot("ready")}
                ${slot("records")}
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

    /* توضیح ساده درباره‌ی محل ذخیره‌ی اطلاعات، پشتیبان‌گیری و پاک شدن داده‌های مرورگر */
    function dataNoteHtml() {
        return `
        <section class="dv-data-note" aria-labelledby="dvDataNoteTitle">
            <h3 id="dvDataNoteTitle">🔒 اطلاعات تمرین‌هایت کجا ذخیره می‌شود؟</h3>
            <p class="dv-data-note-lead">GymLog سرور ندارد. هر چه ثبت می‌کنی فقط داخل مرورگرِ همین دستگاه ذخیره می‌شود و به جای دیگری فرستاده نمی‌شود، مگر اینکه خودت «همگام‌سازی با بله» را فعال کنی و دکمه‌ی سینک را بزنی؛ پس نگه‌داری اطلاعات با خودِ توست.</p>
            <div class="dv-data-note-grid">
                <div class="dv-data-note-item">
                    <strong>💾 پشتیبان‌گیری چطور است؟</strong>
                    <p>بعد از «پایان جلسه»، برنامه خودش یک فایل پشتیبان دانلود می‌کند. هر وقت خواستی هم از منو، بخش «پشتیبان‌گیری»، فایل بگیر. این فایل همه‌ی کاربران، تمرین‌ها و برنامه‌ها را دارد. آن را جای امن نگه دار (فضای ابری، ایمیل یا پیام‌رسان).</p>
                </div>
                <div class="dv-data-note-item">
                    <strong>⚠️ اگر اطلاعات مرورگر پاک شود؟</strong>
                    <p>با پاک‌کردن اطلاعات سایت یا مرورگر، حذف برنامه، عوض‌کردن گوشی/مرورگر یا استفاده از حالت ناشناس، همه‌ی تمرین‌ها از بین می‌رود و راهی برای برگرداندنش نیست؛ مگر اینکه فایل پشتیبان داشته باشی.</p>
                </div>
                <div class="dv-data-note-item">
                    <strong>♻️ بازیابی چطور است؟</strong>
                    <p>فایل پشتیبانت را از بخش «پشتیبان‌گیری ← بازیابی پشتیبان» انتخاب کن تا همه‌چیز برگردد. پس اگر تمرین‌هایت برایت مهم است، فایل پشتیبان را همیشه داشته باش.</p>
                </div>
            </div>
        </section>`;
    }

    function welcomeHtml() {
        return `
        <section class="dv-welcome">
            <div class="dv-welcome-hero">
                <h2>به GymLog خوش آمدید</h2>
                <p>تمرین‌هایت را ثبت کن، پیشرفتت را دنبال کن و روند تمرینت را از دست نده. برای شروع یکی از سه روش زیر را انتخاب کن.</p>
                <div class="dv-welcome-actions">
                    <button type="button" class="primary-btn" id="dvWelcomeUpload">بارگذاری برنامه تمرینی</button>
                    <button type="button" class="secondary-btn" id="dvWelcomeBuilder">ساخت برنامه تمرینی</button>
                    ${hasDefaultProgramPackage() ? `
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
        </section>
        ${dataNoteHtml()}`;
    }

    function mountWelcome(root) {
        const up = root.querySelector("#dvWelcomeUpload");
        if (up) up.addEventListener("click", () => {
            const input = document.getElementById("programImportInput");
            if (input) input.click();
        });
        const builder = root.querySelector("#dvWelcomeBuilder");
        if (builder) builder.addEventListener("click", () => {
            if (typeof openProgramBuilder === "function") openProgramBuilder();
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
