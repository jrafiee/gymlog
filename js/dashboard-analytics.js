/* =====================================================
   GymLog — Dashboard Analytics (pure logic, no DOM)

   هر تابع این فایل یک «سؤال واقعی» را جواب می‌دهد:

   computeStatus      → این هفته چقدر تمرین کرده‌ام؟ چقدر به برنامه پایبند بوده‌ام؟
   computeProgression → در یک حرکت مشخص، عملکردم در طول جلسات چه شکلی بوده؟
   computeComparison  → نسبت به جلسه‌ی قبل همین جلسه‌ی برنامه چه تغییری کرده‌ام؟
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
    function normDigits(v) {
        return String(v == null ? "" : v)
            .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
            .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
    }

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
    function entryFromWorkout(workout, ex) {
        const valid = [];
        let logged = 0;
        let incomplete = 0;

        (ex.sets || []).forEach(s => {
            const hasW = s.weight !== "" && s.weight != null;
            const hasR = s.reps !== "" && s.reps != null;
            if (!hasW && !hasR) return;
            logged += 1;
            const w = num(s.weight);
            const r = num(s.reps);
            if (w !== null && r !== null && w > 0 && r > 0) valid.push({ weight: w, reps: r });
            else incomplete += 1;
        });

        let best = null;
        valid.forEach(s => {
            if (!best || s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps)) best = s;
        });

        return {
            workoutId: workout.id,
            date: workout.date,
            week: workout.week,
            session: workout.session,
            month: workout.month,
            sets: valid,
            logged,
            incomplete,
            best,
            topSets: best ? valid.filter(s => s.weight === best.weight) : []
        };
    }

    function exerciseSessions(workouts, exerciseId) {
        const out = [];
        sortWorkouts(workouts).forEach(w => {
            const ex = (w.exercises || []).find(e => e.id === exerciseId);
            if (!ex) return;
            const entry = entryFromWorkout(w, ex);
            if (entry.sets.length > 0) out.push(entry);
        });
        return out;
    }

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

    function computeProgression(ctx, f) {
        const { programs, catalog, today, activeMonth } = ctx;
        let ws = ctx.workouts;

        if (f.month && f.month !== "all") ws = ws.filter(w => w.month === f.month);
        if (f.session && f.session !== "all") ws = ws.filter(w => Number(w.session) === Number(f.session));
        if (f.range && f.range !== "all") ws = ws.filter(w => w.date >= addDays(today, -7 * Number(f.range) + 1));

        const targetMonth = f.month && f.month !== "all" ? f.month : activeMonth;

        const ids = new Set();
        ws.forEach(w => (w.exercises || []).forEach(e => ids.add(e.id)));

        const list = [];
        ids.forEach(id => {
            const t = getTarget(programs, targetMonth, id);
            if (!isTrackable(id, t, catalog)) return;
            const sess = exerciseSessions(ws, id);
            if (!sess.length) return;
            list.push({
                id,
                name: catalog[id] ? catalog[id].name : id,
                count: sess.length,
                lastDate: sess[sess.length - 1].date
            });
        });
        list.sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate));

        const selected = list.find(e => e.id === f.exercise) || list[0] || null;
        if (!selected) return { workoutCount: ws.length, list, selected: null, sessions: [], target: null, interpretation: null, stats: null };

        const sessions = exerciseSessions(ws, selected.id).map(s => {
            const t = getTarget(programs, s.month, selected.id);
            return Object.assign({}, s, { target: t, status: repStatus(s.best.reps, t) });
        });
        const target = sessions[sessions.length - 1].target;
        const bestEver = sessions.reduce((m, s) => (s.best.weight > m.weight ? s.best : m), sessions[0].best);

        return {
            workoutCount: ws.length,
            list,
            selected,
            sessions,
            target,
            interpretation: interpretProgression(sessions, target),
            stats: {
                count: sessions.length,
                maxWeight: bestEver,
                last: sessions[sessions.length - 1].best,
                incompleteSessions: sessions.filter(s => s.incomplete > 0).length
            }
        };
    }

    /* =========================
       ۳) مقایسه با جلسه قبل
    ========================= */
    function describeChange(prev, cur) {
        const dW = cur.best.weight - prev.best.weight;
        const dR = cur.best.reps - prev.best.reps;
        if (dW > 0) {
            if (dR === 0) return { tone: "up", text: `+${fa(dW)} kg در همان تعداد تکرار` };
            return { tone: "mixed", text: `+${fa(dW)} kg؛ تکرار از ${fa(prev.best.reps, 0)} به ${fa(cur.best.reps, 0)}` };
        }
        if (dW < 0) {
            return { tone: "lower", text: `−${fa(Math.abs(dW))} kg؛ تکرار از ${fa(prev.best.reps, 0)} به ${fa(cur.best.reps, 0)}` };
        }
        if (dR > 0) return { tone: "up", text: `+${fa(dR, 0)} تکرار در همان وزن` };
        if (dR < 0) return { tone: "lower", text: `${fa(Math.abs(dR), 0)} تکرار کمتر در همان وزن` };
        return { tone: "same", text: "بدون تغییر" };
    }

    function computeComparison(ctx) {
        const { workouts, activeMonth, program, programs, catalog } = ctx;
        const cycle = workouts.filter(w => w.month === activeMonth);
        const current = cycle.length ? cycle[cycle.length - 1] : null;
        if (!current) return { state: "empty" };

        const prevWorkout = cycle
            .filter(w => Number(w.session) === Number(current.session) && w.date < current.date)
            .pop() || null;

        const progSession = program && program.sessions ? program.sessions[current.session] : null;
        const order = progSession ? progSession.exercises.map(e => e.id) : (current.exercises || []).map(e => e.id);

        const rows = [];
        let skipped = 0;

        order.forEach(id => {
            const cEx = (current.exercises || []).find(e => e.id === id);
            if (!cEx) return;
            const target = getTarget(programs, activeMonth, id);
            if (!isTrackable(id, target, catalog)) { skipped += 1; return; }

            const cur = entryFromWorkout(current, cEx);
            if (!cur.sets.length) return;

            const pEx = prevWorkout ? (prevWorkout.exercises || []).find(e => e.id === id) : null;
            const prev = pEx ? entryFromWorkout(prevWorkout, pEx) : null;
            const hasPrev = prev && prev.sets.length > 0;

            let caveat = null;
            if (prevWorkout && !hasPrev) {
                caveat = "این حرکت در جلسه‌ی قبل ثبت نشده است.";
            } else if (hasPrev && (prev.incomplete > 0 || (target && prev.logged < target.sets))) {
                caveat = "برای مقایسه‌ی دقیق، ثبت کامل جلسه‌ی قبلی لازم است.";
            } else if (cur.incomplete > 0 || (target && cur.logged < target.sets)) {
                caveat = "ثبت این جلسه کامل نیست؛ مقایسه محدود است.";
            }

            rows.push({
                id,
                name: catalog[id] ? catalog[id].name : id,
                target,
                cur,
                prev: hasPrev ? prev : null,
                change: hasPrev ? describeChange(prev, cur) : null,
                setCountChanged: hasPrev && prev.logged !== cur.logged,
                ceiling: isCeilingReached(cur, target),
                caveat
            });
        });

        const summary = { up: 0, same: 0, lower: 0 };
        rows.forEach(r => {
            if (!r.change) return;
            if (r.change.tone === "up") summary.up += 1;
            else if (r.change.tone === "same") summary.same += 1;
            else summary.lower += 1;
        });

        return {
            state: prevWorkout ? "ok" : "no-previous",
            current,
            prevWorkout,
            sessionTitle: progSession ? progSession.title : `جلسه ${current.session}`,
            rows,
            skipped,
            summary
        };
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

    function bodyEntry(workout, ex) {
        const sets = [];
        let logged = 0;
        (ex.sets || []).forEach(s => {
            const hasW = s.weight !== "" && s.weight != null;
            const hasR = s.reps !== "" && s.reps != null;
            if (!hasW && !hasR) return;
            logged += 1;
            const r = num(s.reps);
            const w = num(s.weight);
            if (r !== null && r > 0) sets.push({ weight: w !== null && w > 0 ? w : 0, reps: r });
        });

        let best = null;
        sets.forEach(s => {
            if (!best || s.reps > best.reps || (s.reps === best.reps && s.weight > best.weight)) best = s;
        });

        return {
            workoutId: workout.id,
            date: workout.date,
            week: workout.week,
            session: workout.session,
            month: workout.month,
            sets,
            logged,
            incomplete: logged - sets.length,
            best,
            topSets: best ? sets.filter(s => s.reps === best.reps) : []
        };
    }

    function bodySessions(workouts, exerciseId) {
        const out = [];
        sortWorkouts(workouts).forEach(w => {
            const ex = (w.exercises || []).find(e => e.id === exerciseId);
            if (!ex) return;
            const entry = bodyEntry(w, ex);
            if (entry.sets.length > 0) out.push(entry);
        });
        return out;
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

    function computeSessionCharts(ctx, f) {
        const { programs, catalog, today, activeMonth } = ctx;
        const month = f.month && programs[f.month] ? f.month : activeMonth;

        let ws = ctx.workouts;
        if (month) ws = ws.filter(w => w.month === month);
        if (f.range && f.range !== "all") ws = ws.filter(w => w.date >= addDays(today, -7 * Number(f.range) + 1));
        ws = ws.filter(w => Number(w.session) === Number(f.session));

        const prog = month && programs[month] ? programs[month] : null;
        const sess = prog && prog.sessions ? prog.sessions[f.session] : null;

        const order = sess ? sess.exercises.map(e => e.id) : [];
        ws.forEach(w => (w.exercises || []).forEach(e => { if (!order.includes(e.id)) order.push(e.id); }));

        const items = order.map(id => {
            const target = getTarget(programs, month, id);
            const kind = isTrackable(id, target, catalog) ? "load" : "reps";
            const unit = kind === "load" ? "kg" : unitFor(id, target);
            const hist = kind === "load" ? exerciseSessions(ws, id) : bodySessions(ws, id);

            const sessions = hist.map(s => {
                const t = getTarget(programs, s.month, id);
                return Object.assign({}, s, { target: t, status: repStatus(s.best.reps, t) });
            });
            const lastTarget = sessions.length ? sessions[sessions.length - 1].target : target;

            const val = s => (kind === "load" ? s.best.weight : s.best.reps);
            let stats = null;
            if (sessions.length) {
                const top = sessions.reduce((m, s) => (val(s) > val(m) ? s : m), sessions[0]);
                stats = {
                    count: sessions.length,
                    maxBest: top.best,
                    last: sessions[sessions.length - 1].best,
                    incompleteSessions: sessions.filter(s => s.incomplete > 0).length
                };
            }

            return {
                id,
                name: catalog[id] ? catalog[id].name : id,
                kind,
                unit,
                sessionTitle: sess ? sess.title : "",
                sessions,
                target: lastTarget,
                stats,
                interpretation: kind === "load"
                    ? interpretProgression(sessions, lastTarget)
                    : interpretBody(sessions, lastTarget, unit)
            };
        });

        return { workoutCount: ws.length, items, sessionTitle: sess ? sess.title : "" };
    }

    /* =========================
       ۷) تعداد ست هر گروه عضلانی (برای نمودار عنکبوتی)
       هر ستی که وزنه یا تکرارش ثبت شده یک ست حساب می‌شود.
    ========================= */
    const MUSCLE_ORDER = ["سینه", "پشت", "سرشانه", "جلو بازو", "پشت بازو", "پا", "شکم"];
    const MUSCLE_MAP = {
        machine_chest_press: "سینه", incline_dumbbell_press: "سینه", dumbbell_fly: "سینه",
        elevated_pushup: "سینه", incline_pushup: "سینه", cable_crossover: "سینه",
        close_grip_dumbbell_press: "سینه",
        wide_lat_pulldown: "پشت", medium_grip_lat_pulldown: "پشت", seated_cable_row: "پشت",
        chest_supported_row: "پشت", t_bar_row: "پشت", straight_arm_pullover: "پشت",
        dumbbell_shoulder_press: "سرشانه", dumbbell_lateral_raise: "سرشانه",
        rear_delt_fly: "سرشانه", face_pull: "سرشانه",
        hammer_curl: "جلو بازو", cable_curl: "جلو بازو",
        rope_triceps_pushdown: "پشت بازو", overhead_cable_triceps: "پشت بازو",
        lying_dumbbell_triceps_extension: "پشت بازو",
        leg_press: "پا", smith_squat: "پا", lying_leg_curl: "پا", leg_extension: "پا",
        bulgarian_split_squat: "پا", smith_calf_raise: "پا",
        dead_bug: "شکم", crunch: "شکم", cable_crunch: "شکم", side_plank: "شکم",
        plank: "شکم", pallof_press: "شکم"
    };

    function computeMuscleSets(ctx, range) {
        const { workouts, catalog, today } = ctx;
        let ws = workouts;
        if (range && range !== "all") ws = ws.filter(w => w.date >= addDays(today, -Number(range) + 1));

        const counts = {};
        MUSCLE_ORDER.forEach(c => { counts[c] = 0; });
        let other = 0;

        ws.forEach(w => (w.exercises || []).forEach(ex => {
            const cat = MUSCLE_MAP[ex.id] || (catalog[ex.id] && catalog[ex.id].category) || null;
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
        BODYWEIGHT_IDS,
        num, fa, fmtSet, addDays, diffDays, sortWorkouts,
        parseTarget, getTarget, isTrackable, repStatus,
        entryFromWorkout, exerciseSessions, isCeilingReached,
        computeStatus, computeProgression, computeComparison,
        computeReadiness, computeRecords, interpretProgression,
        computeSessionCharts, computeMuscleSets, MUSCLE_ORDER
    };
})(window);
