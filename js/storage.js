/* =====================================================
   Gym Progress Tracker — Storage Architecture (IndexedDB)

   Database Name: GymProgressTrackerDB
   Database Version: 1
   Schema Version: 1

   Object Stores:
     - workouts: KeyPath 'id', indexes on date, month, [month, session], [month, session, date]
     - programs: KeyPath 'id' (e.g. 'month1')
     - exercises: KeyPath 'id' (e.g. 'machine_chest_press')
     - settings: KeyPath 'key' (schemaVersion, theme, lastBackupAt, firstUseAt, migrationStatus)
     - backups: KeyPath 'id' (autoIncrement: true)

   Multi-user (schema of records, DB version unchanged):
     - settings: key "users" (array of {id, name, profile, createdAt}) and "activeUserId"
     - workouts: each record has userId
     - programs: record id = "<userId>::<monthKey>", fields userId + monthKey
     - exercises (catalog overrides) are shared between all users
     - Backup files contain ALL users; a single user's data can be merged into
       another user via mergeBackupIntoUser().

   Dual-layer architecture:
     - IndexedDB is the primary, robust source of truth.
     - An in-memory reactive cache provides instant synchronous read access for UI rendering.
     - localStorage is preserved as a migration fallback and emergency safety net.
===================================================== */

const DB_NAME = "GymProgressTrackerDB";
const DB_VERSION = 1;
const SCHEMA_VERSION = 1;
const BACKUP_SCHEMA_VERSION = 2;

// Legacy localStorage keys (kept for migration detection and emergency fallback)
const LEGACY_STORAGE_KEY = "gymProgressTracker_v2";
const LEGACY_CATALOG_KEY = "gymProgressTracker_catalogOverrides";
const LEGACY_PROGRAM_KEY = "gymProgressTracker_programOverrides";
const LEGACY_LAST_BACKUP_KEY = "gymProgressTracker_lastBackupAt";
const LEGACY_FIRST_USE_KEY = "gymProgressTracker_firstUseAt";
const LEGACY_THEME_KEY = "gymTrackerTheme";
const LEGACY_PROFILE_KEY = "gymProgressTracker_userProfile";
const LEGACY_USERS_KEY = "gymProgressTracker_users";
const LEGACY_PROGRAMS_BY_USER_KEY = "gymProgressTracker_programsByUser";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/* =====================================================
   In-Memory Storage Cache
===================================================== */
const _storeCache = {
    isReady: false,
    readyPromise: null,
    db: null,
    schemaVersion: SCHEMA_VERSION,
    workouts: [],            // workouts of ALL users (each has userId)
    programsByUser: {},      // { userId: { monthKey: program } }
    catalogOverrides: {},
    settings: {},
    users: [],
    activeUserId: null,
    migrationResult: null,
    lastError: null
};

if (typeof window !== "undefined") {
    window.GymLogStoreCache = _storeCache;
}

/* =====================================================
   IndexedDB Connection & Upgrade Pipeline
===================================================== */

/**
 * Opens or upgrades the IndexedDB database.
 * Supports future schema version migrations (v1 -> v2, v2 -> v3).
 */
function openDatabase() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            const err = new Error("مرورگر شما از IndexedDB پشتیبانی نمی‌کند.");
            _storeCache.lastError = err;
            reject(err);
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = request.result;
            const oldVersion = event.oldVersion;
            const newVersion = event.newVersion;
            console.info(`[GymLog DB] ارتقای ساختار پایگاه داده از نسخه ${oldVersion} به ${newVersion}`);

            // Version 1: Initial schema
            if (oldVersion < 1) {
                // 1. workouts store
                if (!db.objectStoreNames.contains("workouts")) {
                    const workoutStore = db.createObjectStore("workouts", { keyPath: "id" });
                    workoutStore.createIndex("by_date", "date", { unique: false });
                    workoutStore.createIndex("by_month", "month", { unique: false });
                    workoutStore.createIndex("by_month_session", ["month", "session"], { unique: false });
                    workoutStore.createIndex("by_month_session_date", ["month", "session", "date"], { unique: false });
                }

                // 2. programs store
                if (!db.objectStoreNames.contains("programs")) {
                    db.createObjectStore("programs", { keyPath: "id" });
                }

                // 3. exercises store
                if (!db.objectStoreNames.contains("exercises")) {
                    db.createObjectStore("exercises", { keyPath: "id" });
                }

                // 4. settings store
                if (!db.objectStoreNames.contains("settings")) {
                    db.createObjectStore("settings", { keyPath: "key" });
                }

                // 5. backups store
                if (!db.objectStoreNames.contains("backups")) {
                    db.createObjectStore("backups", { keyPath: "id", autoIncrement: true });
                }
            }

            // Future versions (e.g. if (oldVersion < 2) { ... }) can be added cleanly here
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            console.error("[GymLog DB] خطا در باز کردن IndexedDB:", request.error);
            _storeCache.lastError = request.error;
            reject(request.error);
        };

        request.onblocked = () => {
            console.warn("[GymLog DB] پایگاه‌داده مسدود شد؛ لطفاً سایر زبانه‌های باز برنامه را ببندید.");
        };
    });
}

/* =====================================================
   Transactional Helpers
===================================================== */

/* منتظر ماندن برای پایان قطعی یک تراکنش */
function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
    });
}

function getAllFromStore(db, storeName) {
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        } catch (err) {
            reject(err);
        }
    });
}

function getRecordByKey(db, storeName, key) {
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        } catch (err) {
            reject(err);
        }
    });
}

function putRecord(db, storeName, record) {
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const req = store.put(record);
            tx.oncomplete = () => resolve(req.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
        } catch (err) {
            reject(err);
        }
    });
}

function deleteRecordByKey(db, storeName, key) {
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            store.delete(key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        } catch (err) {
            reject(err);
        }
    });
}

function clearStore(db, storeName) {
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            store.clear();
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        } catch (err) {
            reject(err);
        }
    });
}

/* =====================================================
   Safe Data Validation & Sanitization
===================================================== */

function sanitizeWorkout(rawWorkout) {
    if (!rawWorkout || typeof rawWorkout !== "object") return null;

    const date = typeof rawWorkout.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawWorkout.date)
        ? rawWorkout.date
        : null;

    if (!date) return null;

    const id = typeof rawWorkout.id === "number" && !isNaN(rawWorkout.id)
        ? rawWorkout.id
        : Date.now() + Math.floor(Math.random() * 1000);

    const week = Number(rawWorkout.week) || 1;
    const session = Number(rawWorkout.session) || 1;
    const month = typeof rawWorkout.month === "string" && rawWorkout.month.trim()
        ? rawWorkout.month.trim()
        : "month1";

    const cleanNote = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

    const exercises = Array.isArray(rawWorkout.exercises)
        ? rawWorkout.exercises.map(ex => {
            const out = {
                id: String(ex.id || ""),
                sets: Array.isArray(ex.sets)
                    ? ex.sets.map(s => ({
                        weight: s && s.weight !== undefined && s.weight !== null ? String(s.weight) : "",
                        reps: s && s.reps !== undefined && s.reps !== null ? String(s.reps) : ""
                    }))
                    : []
            };
            const exNote = cleanNote(ex.note, 1000);
            if (exNote) out.note = exNote;
            return out;
        }).filter(ex => ex.id !== "")
        : [];

    const note = cleanNote(rawWorkout.note, 2000);

    const userId = typeof rawWorkout.userId === "string" && rawWorkout.userId
        ? rawWorkout.userId
        : (_storeCache.activeUserId || null);

    return {
        id,
        date,
        week,
        month,
        session,
        exercises,
        ...(userId ? { userId } : {}),
        ...(note ? { note } : {}),
        updatedAt: rawWorkout.updatedAt || new Date().toISOString()
    };
}

/* =====================================================
   Migration: localStorage -> IndexedDB
   Safe, transactional, and idempotent
===================================================== */

async function checkAndRunMigration(db) {
    try {
        const migrationSetting = await getRecordByKey(db, "settings", "migrationStatus");
        const existingWorkouts = await getAllFromStore(db, "workouts");

        // Idempotency: If already migrated or IndexedDB already has records, skip migration
        if (migrationSetting && migrationSetting.value && migrationSetting.value.completed) {
            _storeCache.migrationResult = migrationSetting.value;
            return;
        }

        if (existingWorkouts.length > 0) {
            // Already has data in DB, record status and exit
            const status = {
                completed: true,
                timestamp: new Date().toISOString(),
                from: "existing_db",
                counts: { workouts: existingWorkouts.length }
            };
            await putRecord(db, "settings", { key: "migrationStatus", value: status });
            _storeCache.migrationResult = status;
            return;
        }

        // Check if there is data in localStorage to migrate
        let rawWorkouts = [];
        const rawStorage = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (rawStorage) {
            try {
                const parsed = JSON.parse(rawStorage);
                if (parsed && Array.isArray(parsed.workouts)) {
                    rawWorkouts = parsed.workouts;
                }
            } catch (err) {
                console.warn("[GymLog Migration] خطا در خواندن داده‌های تمرین قدیمی از localStorage:", err);
            }
        }

        let rawPrograms = {};
        const rawProgramStorage = localStorage.getItem(LEGACY_PROGRAM_KEY);
        if (rawProgramStorage) {
            try {
                const parsed = JSON.parse(rawProgramStorage);
                if (parsed && typeof parsed === "object") rawPrograms = parsed;
            } catch (err) {
                console.warn("[GymLog Migration] خطا در خواندن برنامه‌های قدیمی از localStorage:", err);
            }
        }

        let rawCatalog = {};
        const rawCatalogStorage = localStorage.getItem(LEGACY_CATALOG_KEY);
        if (rawCatalogStorage) {
            try {
                const parsed = JSON.parse(rawCatalogStorage);
                if (parsed && typeof parsed === "object") rawCatalog = parsed;
            } catch (err) {
                console.warn("[GymLog Migration] خطا در خواندن کاتالوگ قدیمی از localStorage:", err);
            }
        }

        const legacyLastBackup = localStorage.getItem(LEGACY_LAST_BACKUP_KEY);
        const legacyFirstUse = localStorage.getItem(LEGACY_FIRST_USE_KEY);
        const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);

        const hasLegacyData = rawWorkouts.length > 0 ||
            Object.keys(rawPrograms).length > 0 ||
            Object.keys(rawCatalog).length > 0;

        if (!hasLegacyData) {
            // Fresh installation
            const status = {
                completed: true,
                timestamp: new Date().toISOString(),
                from: "fresh_install",
                counts: { workouts: 0, programs: 0, exercises: 0 }
            };
            await putRecord(db, "settings", { key: "migrationStatus", value: status });
            await putRecord(db, "settings", { key: "schemaVersion", value: SCHEMA_VERSION });
            if (legacyFirstUse) await putRecord(db, "settings", { key: "firstUseAt", value: legacyFirstUse });
            if (legacyTheme) await putRecord(db, "settings", { key: "theme", value: legacyTheme });
            _storeCache.migrationResult = status;
            return;
        }

        console.info(`[GymLog Migration] آغاز مهاجرت امن: ${rawWorkouts.length} تمرین از localStorage به IndexedDB منتقل می‌شود...`);

        // Transactional migration across object stores
        const tx = db.transaction(["workouts", "programs", "exercises", "settings"], "readwrite");
        const workoutStore = tx.objectStore("workouts");
        const programStore = tx.objectStore("programs");
        const exerciseStore = tx.objectStore("exercises");
        const settingsStore = tx.objectStore("settings");

        let migratedWorkoutsCount = 0;
        const validWorkouts = [];

        rawWorkouts.forEach(item => {
            const clean = sanitizeWorkout(item);
            if (clean) {
                workoutStore.put(clean);
                validWorkouts.push(clean);
                migratedWorkoutsCount++;
            }
        });

        let migratedProgramsCount = 0;
        Object.keys(rawPrograms).forEach(monthKey => {
            const programItem = rawPrograms[monthKey];
            if (programItem && typeof programItem === "object") {
                programStore.put({
                    id: monthKey,
                    ...programItem,
                    updatedAt: new Date().toISOString()
                });
                migratedProgramsCount++;
            }
        });

        let migratedExercisesCount = 0;
        Object.keys(rawCatalog).forEach(exId => {
            const exItem = rawCatalog[exId];
            if (exItem && typeof exItem === "object") {
                exerciseStore.put({
                    id: exId,
                    ...exItem,
                    isCustom: true,
                    updatedAt: new Date().toISOString()
                });
                migratedExercisesCount++;
            }
        });

        if (legacyLastBackup) {
            settingsStore.put({ key: "lastBackupAt", value: legacyLastBackup, updatedAt: new Date().toISOString() });
        }
        if (legacyFirstUse) {
            settingsStore.put({ key: "firstUseAt", value: legacyFirstUse, updatedAt: new Date().toISOString() });
        }
        if (legacyTheme) {
            settingsStore.put({ key: "theme", value: legacyTheme, updatedAt: new Date().toISOString() });
        }

        settingsStore.put({ key: "schemaVersion", value: SCHEMA_VERSION, updatedAt: new Date().toISOString() });

        const migrationReport = {
            completed: true,
            timestamp: new Date().toISOString(),
            from: "localStorage_v2",
            counts: {
                workouts: migratedWorkoutsCount,
                programs: migratedProgramsCount,
                exercises: migratedExercisesCount
            }
        };

        settingsStore.put({ key: "migrationStatus", value: migrationReport, updatedAt: new Date().toISOString() });

        await txDone(tx);

        _storeCache.migrationResult = migrationReport;

        console.info(
            `%c[GymLog Migration] ✅ مهاجرت اطلاعات به IndexedDB با موفقیت انجام شد:\n` +
            `• تمرینات: ${migratedWorkoutsCount}\n` +
            `• برنامه‌ها: ${migratedProgramsCount}\n` +
            `• حرکات کاتالوگ: ${migratedExercisesCount}\n` +
            `توجه: داده‌های localStorage به‌عنوان نسخه پشتیبان احتیاطی دست‌نخورده باقی ماندند.`,
            "color: #16a34a; font-weight: bold; font-size: 12px;"
        );

        // Show a brief UI toast notification if possible
        if (typeof showToast === "function") {
            try {
                showToast("اطلاعات شما با موفقیت به پایگاه‌داده پیشرفته (IndexedDB) منتقل شد.");
            } catch (e) { /* ignore */ }
        }

    } catch (error) {
        console.error("[GymLog Migration] خطا در فرآیند مهاجرت اطلاعات:", error);
        _storeCache.lastError = error;
    }
}

/* =====================================================
   Storage Initialization & In-Memory Cache Hydration
===================================================== */

/* ---------- ابزارهای کاربران و آینه‌ی localStorage ---------- */

function readJsonLS(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

function newUserId() {
    return "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function makeUser(name, profile) {
    return {
        id: newUserId(),
        name: name || "کاربر ۱",
        profile: profile && typeof profile === "object" ? profile : null,
        createdAt: new Date().toISOString()
    };
}

function programRecordId(userId, monthKey) {
    return userId + "::" + monthKey;
}

function nextFreeWorkoutId(used) {
    let id = Date.now();
    while (used.has(id)) id += 1;
    used.add(id);
    return id;
}

function groupProgramRecords(records) {
    const map = {};
    records.forEach(p => {
        if (!p || !p.userId) return;
        const { id, userId, monthKey, updatedAt, ...rest } = p;
        if (!map[userId]) map[userId] = {};
        map[userId][monthKey || id] = rest;
    });
    return map;
}

function mirrorWorkoutsToLocalStorage() {
    saveDataToKey(LEGACY_STORAGE_KEY, { workouts: _storeCache.workouts });
}

function mirrorProgramsToLocalStorage() {
    saveDataToKey(LEGACY_PROGRAMS_BY_USER_KEY, _storeCache.programsByUser);
}

function mirrorUsersToLocalStorage() {
    saveDataToKey(LEGACY_USERS_KEY, { users: _storeCache.users, activeUserId: _storeCache.activeUserId });
}

/**
 * خواندن همه‌ی مخزن‌ها، ساخت کاربر پیش‌فرض (در اولین اجرا) و
 * اختصاص داده‌های قدیمیِ بدون userId به کاربر فعال.
 */
async function hydrateFromDb(db) {
    const allWorkouts = await getAllFromStore(db, "workouts");
    const allPrograms = await getAllFromStore(db, "programs");
    const allExercises = await getAllFromStore(db, "exercises");
    const allSettings = await getAllFromStore(db, "settings");

    const settingsMap = {};
    allSettings.forEach(item => {
        if (item && item.key) settingsMap[item.key] = item.value;
    });

    let users = Array.isArray(settingsMap.users) ? settingsMap.users.filter(u => u && u.id) : [];
    let activeUserId = settingsMap.activeUserId;
    let dirty = false;

    if (!users.length) {
        const legacy = settingsMap.userProfile || readJsonLS(LEGACY_PROFILE_KEY, null);
        users = [makeUser(legacy && legacy.fullName ? legacy.fullName : "کاربر ۱", legacy)];
        dirty = true;
    }
    if (!users.some(u => u.id === activeUserId)) {
        activeUserId = users[0].id;
        dirty = true;
    }

    const orphanWorkouts = allWorkouts.filter(w => !w.userId);
    const orphanPrograms = allPrograms.filter(p => !p.userId);

    if (dirty || orphanWorkouts.length || orphanPrograms.length) {
        const tx = db.transaction(["workouts", "programs", "settings"], "readwrite");
        const wStore = tx.objectStore("workouts");
        const pStore = tx.objectStore("programs");
        const sStore = tx.objectStore("settings");

        orphanWorkouts.forEach(w => {
            w.userId = activeUserId;
            wStore.put(w);
        });
        orphanPrograms.forEach(p => {
            pStore.delete(p.id);
            p.monthKey = p.id;
            p.id = programRecordId(activeUserId, p.monthKey);
            p.userId = activeUserId;
            pStore.put(p);
        });

        const now = new Date().toISOString();
        sStore.put({ key: "users", value: users, updatedAt: now });
        sStore.put({ key: "activeUserId", value: activeUserId, updatedAt: now });
        await txDone(tx);

        if (orphanWorkouts.length || orphanPrograms.length) {
            console.info(`[GymLog Users] ${orphanWorkouts.length} تمرین و ${orphanPrograms.length} برنامه‌ی قدیمی به کاربر «${users.find(u => u.id === activeUserId).name}» اختصاص داده شد.`);
        }
    }

    allWorkouts.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.id || 0) - (b.id || 0));
    _storeCache.workouts = allWorkouts;
    _storeCache.programsByUser = groupProgramRecords(allPrograms);

    const exercisesMap = {};
    allExercises.forEach(e => {
        if (e && e.id) {
            const { id, isCustom, updatedAt, ...rest } = e;
            exercisesMap[id] = rest;
        }
    });
    _storeCache.catalogOverrides = exercisesMap;

    settingsMap.users = users;
    settingsMap.activeUserId = activeUserId;
    _storeCache.settings = settingsMap;
    _storeCache.users = users;
    _storeCache.activeUserId = activeUserId;

    mirrorUsersToLocalStorage();
    mirrorWorkoutsToLocalStorage();
    mirrorProgramsToLocalStorage();
}

async function initStorage() {
    if (_storeCache.readyPromise) {
        return _storeCache.readyPromise;
    }

    _storeCache.readyPromise = (async () => {
        try {
            const db = await openDatabase();
            _storeCache.db = db;

            // Safe migration check (localStorage -> IndexedDB)
            await checkAndRunMigration(db);

            // Hydrate in-memory cache + multi-user setup
            await hydrateFromDb(db);

            _storeCache.isReady = true;
            return _storeCache;

        } catch (error) {
            console.error("[GymLog Storage] خطا در راه‌اندازی IndexedDB، استفاده از حافظه محلی به عنوان fallback:", error);
            _storeCache.lastError = error;

            // Graceful fallback to localStorage
            fallbackHydrateFromLocalStorage();
            _storeCache.isReady = true;
            return _storeCache;
        }
    })();

    return _storeCache.readyPromise;
}

function fallbackHydrateFromLocalStorage() {
    const saved = readJsonLS(LEGACY_USERS_KEY, null);
    let users = saved && Array.isArray(saved.users) ? saved.users.filter(u => u && u.id) : [];
    if (!users.length) {
        const legacy = readJsonLS(LEGACY_PROFILE_KEY, null);
        users = [makeUser(legacy && legacy.fullName ? legacy.fullName : "کاربر ۱", legacy)];
    }
    const activeUserId = saved && users.some(u => u.id === saved.activeUserId) ? saved.activeUserId : users[0].id;

    const raw = readJsonLS(LEGACY_STORAGE_KEY, null);
    const list = raw && Array.isArray(raw.workouts) ? raw.workouts : [];
    list.forEach(w => { if (w && !w.userId) w.userId = activeUserId; });

    const byUser = readJsonLS(LEGACY_PROGRAMS_BY_USER_KEY, null);
    if (byUser && typeof byUser === "object") {
        _storeCache.programsByUser = byUser;
    } else {
        _storeCache.programsByUser = { [activeUserId]: readJsonLS(LEGACY_PROGRAM_KEY, {}) };
    }

    _storeCache.workouts = list;
    _storeCache.catalogOverrides = readJsonLS(LEGACY_CATALOG_KEY, {});
    _storeCache.users = users;
    _storeCache.activeUserId = activeUserId;
    mirrorUsersToLocalStorage();
}

// Start storage initialization immediately in background
if (typeof window !== "undefined") {
    initStorage().catch(err => console.warn("[GymLog Storage] Early init note:", err));
}

/* =====================================================
   Public Storage APIs (Compatible with existing codebase)
===================================================== */

/**
 * Workouts of ALL users (used for backups and counters).
 */
function getAllWorkouts() {
    if (_storeCache.isReady) return _storeCache.workouts;
    const raw = readJsonLS(LEGACY_STORAGE_KEY, null);
    if (raw && Array.isArray(raw.workouts)) return raw.workouts;
    return _storeCache.workouts || [];
}

function fallbackActiveUserId() {
    const saved = readJsonLS(LEGACY_USERS_KEY, null);
    return saved && saved.activeUserId ? saved.activeUserId : null;
}

/**
 * Workouts of the ACTIVE user.
 * Synchronously reads from memory cache, with fallback to localStorage if DB is initializing.
 */
function getWorkouts() {
    const all = getAllWorkouts();
    const uid = _storeCache.isReady ? _storeCache.activeUserId : fallbackActiveUserId();
    if (!uid) return all;
    return all.filter(w => !w.userId || w.userId === uid);
}

/**
 * Saves or updates a workout session (for its user; default: active user).
 * Guarantees transactional persistence in IndexedDB, then updates memory cache and fallback.
 */
async function addWorkout(workout) {
    const clean = sanitizeWorkout(workout);
    if (!clean) {
        console.error("[GymLog DB] اطلاعات جلسه تمرینی نامعتبر است و ذخیره نشد:", workout);
        return false;
    }
    if (!clean.userId) clean.userId = _storeCache.activeUserId;

    const all = _storeCache.workouts;
    const sameIdx = all.findIndex(item =>
        item.userId === clean.userId &&
        (item.id === clean.id ||
            (item.date === clean.date && item.month === clean.month && Number(item.session) === Number(clean.session)))
    );
    if (sameIdx >= 0) {
        clean.id = all[sameIdx].id;
    } else if (all.some(item => item.id === clean.id)) {
        // شناسه‌ی تمرین کاربر دیگری است؛ شناسه‌ی تازه می‌گیرد
        clean.id = nextFreeWorkoutId(new Set(all.map(item => item.id)));
    }

    // 1. Transactional write to IndexedDB
    if (_storeCache.db) {
        try {
            await putRecord(_storeCache.db, "workouts", clean);
        } catch (dbError) {
            console.error("[GymLog DB] خطا در ذخیره‌سازی جلسه در IndexedDB:", dbError);
        }
    }

    // 2. Update memory cache
    if (sameIdx >= 0) {
        all[sameIdx] = clean;
    } else {
        all.push(clean);
    }
    all.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.id || 0) - (b.id || 0));

    // 3. Keep fallback in localStorage updated
    mirrorWorkoutsToLocalStorage();
    return true;
}

/**
 * Returns workouts for a specific month and session.
 */
function getSessionWorkouts(month, session) {
    const sessionNum = Number(session);
    return getWorkouts().filter(
        workout =>
            workout.month === month &&
            Number(workout.session) === sessionNum
    );
}

/**
 * Returns the most recent workout before the given date for a specific month & session.
 */
function getPreviousWorkout(currentDate, month, session) {
    const workouts = getSessionWorkouts(month, session)
        .filter(workout => workout.date < currentDate);

    if (workouts.length === 0) return null;
    return workouts[workouts.length - 1];
}

/**
 * Deletes the workout history of the ACTIVE user only
 * (programs, settings and other users stay intact).
 */
async function deleteAllData() {
    const uid = _storeCache.activeUserId;
    const removed = _storeCache.workouts.filter(w => w.userId === uid);
    _storeCache.workouts = _storeCache.workouts.filter(w => w.userId !== uid);

    let db = _storeCache.db;
    if (!db) {
        try {
            await initStorage();
            db = _storeCache.db;
        } catch (e) { /* ignore */ }
    }

    if (db && removed.length) {
        try {
            const tx = db.transaction("workouts", "readwrite");
            const store = tx.objectStore("workouts");
            removed.forEach(w => store.delete(w.id));
            await txDone(tx);
        } catch (err) {
            console.error("[GymLog DB] خطا در پاک‌سازی تمرینات:", err);
        }
    }

    mirrorWorkoutsToLocalStorage();
    return true;
}

/**
 * Completely resets all data: workouts, programs, custom exercises, settings, and backups.
 * Closes the connection and completely deletes the IndexedDB database and local storage.
 */
async function fullResetStorage() {
    // 1. Ensure DB connection is active
    let db = _storeCache.db;
    if (!db) {
        try {
            await initStorage();
            db = _storeCache.db;
        } catch (e) { /* ignore */ }
    }

    // 2. Clear every single store in IndexedDB
    if (db) {
        try {
            const allStoreNames = ["workouts", "programs", "exercises", "settings", "backups"].filter(name =>
                db.objectStoreNames.contains(name)
            );
            if (allStoreNames.length > 0) {
                const tx = db.transaction(allStoreNames, "readwrite");
                allStoreNames.forEach(name => tx.objectStore(name).clear());
                await new Promise(resolve => {
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                    tx.onabort = resolve;
                });
            }
        } catch (err) {
            console.error("[GymLog DB] خطا در پاک‌سازی مخازن پایگاه‌داده:", err);
        }

        // Close connection so database can be deleted without blocking
        try {
            db.close();
        } catch (e) { /* ignore */ }
        _storeCache.db = null;
    }

    // 3. Delete the entire IndexedDB database file
    try {
        if ("indexedDB" in window) {
            await new Promise(resolve => {
                const req = window.indexedDB.deleteDatabase(DB_NAME);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
                req.onblocked = () => resolve(false);
                setTimeout(() => resolve(false), 500);
            });
        }
    } catch (err) {
        console.warn("[GymLog DB] خطا در حذف فیزیکی دیتابیس:", err);
    }

    // 4. Reset in-memory cache
    _storeCache.workouts = [];
    _storeCache.programsByUser = {};
    _storeCache.catalogOverrides = {};
    _storeCache.settings = {};
    _storeCache.users = [];
    _storeCache.activeUserId = null;
    _storeCache.isReady = false;
    _storeCache.readyPromise = null;

    // 5. Clear all related localStorage items
    try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(LEGACY_CATALOG_KEY);
        localStorage.removeItem(LEGACY_PROGRAM_KEY);
        localStorage.removeItem(LEGACY_LAST_BACKUP_KEY);
        localStorage.removeItem(LEGACY_FIRST_USE_KEY);
        localStorage.removeItem(LEGACY_THEME_KEY);
        localStorage.removeItem(LEGACY_PROFILE_KEY);
        localStorage.removeItem(LEGACY_USERS_KEY);
        localStorage.removeItem(LEGACY_PROGRAMS_BY_USER_KEY);
    } catch (e) { /* ignore */ }

    return true;
}

/* =====================================================
   Catalog & Program Overrides
===================================================== */

function loadCatalogOverrides() {
    if (_storeCache.isReady) {
        return _storeCache.catalogOverrides;
    }
    try {
        const raw = localStorage.getItem(LEGACY_CATALOG_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

/* برنامه‌های یک کاربر (پیش‌فرض: کاربر فعال) */
function loadProgramOverrides(userId) {
    if (_storeCache.isReady) {
        const uid = userId || _storeCache.activeUserId;
        return _storeCache.programsByUser[uid] || {};
    }
    const byUser = readJsonLS(LEGACY_PROGRAMS_BY_USER_KEY, null);
    const uid = userId || fallbackActiveUserId();
    if (byUser && uid) return byUser[uid] || {};
    return readJsonLS(LEGACY_PROGRAM_KEY, {});
}

function getEffectiveCatalog() {
    const baseCatalog = typeof exerciseCatalog !== "undefined" ? exerciseCatalog : {};
    return {
        ...baseCatalog,
        ...loadCatalogOverrides()
    };
}

function getEffectiveProgramsRaw(userId) {
    const basePrograms = typeof workoutProgramsRaw !== "undefined" ? workoutProgramsRaw : {};
    return {
        ...basePrograms,
        ...loadProgramOverrides(userId)
    };
}

function saveDataToKey(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn(`[GymLog Storage] خطا در نوشتن کلید ${key}:`, e);
    }
}

/**
 * Imports a program package (catalog additions + monthly workout programs).
 * Stores records into IndexedDB and keeps cache and fallback synchronized.
 */
/**
 * فرمت‌های ورودی را یکسان می‌کند:
 *  - { programsRaw: {month1: {...}}, catalogAdditions: {id: {...}} }   (قدیمی / فایل برنامه)
 *  - { programs: [{id, ...}], exercises: [{id, ...}] }                 (پشتیبان نسخه‌دار)
 * اگر هر دو باشند، شکل شیء (programsRaw / catalogAdditions) اولویت دارد.
 */
function normalizeProgramPackage(pkg) {
    const out = { ...pkg };

    if (!out.programsRaw && Array.isArray(pkg.programs)) {
        out.programsRaw = {};
        pkg.programs.forEach(p => {
            if (p && p.id) {
                const { id, updatedAt, ...rest } = p;
                out.programsRaw[id] = rest;
            }
        });
    }

    if (!out.catalogAdditions && Array.isArray(pkg.exercises)) {
        out.catalogAdditions = {};
        pkg.exercises.forEach(e => {
            if (e && e.id) {
                const { id, isCustom, updatedAt, ...rest } = e;
                out.catalogAdditions[id] = rest;
            }
        });
    }

    return out;
}

async function importProgramPackage(rawPkg, userId) {
    if (!rawPkg || typeof rawPkg !== "object") return false;
    const pkg = normalizeProgramPackage(rawPkg);

    const hasCatalog = pkg.catalogAdditions && Object.keys(pkg.catalogAdditions).length > 0;
    const hasPrograms = pkg.programsRaw && Object.keys(pkg.programsRaw).length > 0;
    if (!hasCatalog && !hasPrograms) return false;

    // 1. Catalog additions
    if (pkg.catalogAdditions && typeof pkg.catalogAdditions === "object") {
        _storeCache.catalogOverrides = {
            ..._storeCache.catalogOverrides,
            ...pkg.catalogAdditions
        };

        if (_storeCache.db) {
            try {
                const tx = _storeCache.db.transaction("exercises", "readwrite");
                const store = tx.objectStore("exercises");
                Object.keys(pkg.catalogAdditions).forEach(id => {
                    store.put({
                        id,
                        ...pkg.catalogAdditions[id],
                        isCustom: true,
                        updatedAt: new Date().toISOString()
                    });
                });
                await txDone(tx);
            } catch (err) {
                console.error("[GymLog DB] خطا در ذخیره حرکات برنامه جدید:", err);
            }
        }

        saveDataToKey(LEGACY_CATALOG_KEY, _storeCache.catalogOverrides);
    }

    // 2. Programs raw (برای کاربر مقصد؛ پیش‌فرض: کاربر فعال)
    if (pkg.programsRaw && typeof pkg.programsRaw === "object") {
        const uid = userId || _storeCache.activeUserId;
        _storeCache.programsByUser = {
            ..._storeCache.programsByUser,
            [uid]: {
                ...(_storeCache.programsByUser[uid] || {}),
                ...pkg.programsRaw
            }
        };

        if (_storeCache.db) {
            try {
                const tx = _storeCache.db.transaction("programs", "readwrite");
                const store = tx.objectStore("programs");
                Object.keys(pkg.programsRaw).forEach(key => {
                    store.put({
                        id: programRecordId(uid, key),
                        userId: uid,
                        monthKey: key,
                        ...pkg.programsRaw[key],
                        updatedAt: new Date().toISOString()
                    });
                });
                await txDone(tx);
            } catch (err) {
                console.error("[GymLog DB] خطا در ذخیره جلسات برنامه جدید:", err);
            }
        }

        mirrorProgramsToLocalStorage();
    }

    return true;
}

function validateProgramPackage(pkg) {
    if (!pkg || typeof pkg !== "object") {
        return "فایل معتبر نیست.";
    }

    const hasCatalog = pkg.catalogAdditions && typeof pkg.catalogAdditions === "object";
    const hasPrograms = pkg.programsRaw && typeof pkg.programsRaw === "object";

    if (!hasCatalog && !hasPrograms) {
        return "فایل هیچ برنامه یا حرکت جدیدی ندارد.";
    }

    if (hasPrograms) {
        const effectiveCatalog = getEffectiveCatalog();
        const catalogAdditions = hasCatalog ? pkg.catalogAdditions : {};

        for (const monthKey in pkg.programsRaw) {
            const month = pkg.programsRaw[monthKey];
            if (!month || !month.sessions) {
                return `ماه "${monthKey}" ساختار درستی ندارد.`;
            }

            for (const sessionKey in month.sessions) {
                const exercises = month.sessions[sessionKey].exercises || [];
                for (const exercise of exercises) {
                    const existsInCatalog = effectiveCatalog[exercise.id] || catalogAdditions[exercise.id];
                    if (!existsInCatalog) {
                        return `حرکتی با id "${exercise.id}" نه در کاتالوگ فعلی و نه در فایل آپلودی وجود ندارد.`;
                    }
                }
            }
        }
    }

    return null;
}

/* =====================================================
   Backup System (Versioned, Comprehensive & Compatible)
===================================================== */

function buildBackupFileName() {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");

    return (
        "gymlog-backup-" +
        now.getFullYear() + "-" +
        pad(now.getMonth() + 1) + "-" +
        pad(now.getDate()) + "-" +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        ".json"
    );
}

/**
 * Exports a versioned JSON backup.
 *  - بدون options.userId: پشتیبان کامل از همه‌ی کاربران
 *  - با options.userId: فقط اطلاعات همان کاربر (برای «به‌روزرسانی اطلاعات تمرین» در کاربر دیگر)
 *
 * ساختار فایل (schemaVersion 2):
 * { app, schemaVersion, backupType, exportedAt, activeUserId,
 *   users: [{id, name, profile, createdAt}],
 *   workouts: [{..., userId}],
 *   programs: [{id: monthKey, userId, title, sessions}],
 *   exercises: [...], settings: [...], catalogAdditions: {...} }
 */
function exportData(options) {
    try {
        const opts = options || {};
        const onlyUser = opts.userId || null;

        const users = (_storeCache.users || []).filter(u => !onlyUser || u.id === onlyUser);
        if (!users.length) return false;
        const ids = new Set(users.map(u => u.id));

        const workoutsList = getAllWorkouts().filter(w => ids.has(w.userId));

        const programsArray = [];
        users.forEach(u => {
            const progs = _storeCache.programsByUser[u.id] || {};
            Object.keys(progs).forEach(key => {
                programsArray.push({ id: key, userId: u.id, ...progs[key] });
            });
        });

        const catalogOverrides = loadCatalogOverrides();
        const exercisesArray = Object.keys(catalogOverrides).map(id => ({
            id,
            ...catalogOverrides[id]
        }));

        const settingsArray = [
            { key: "schemaVersion", value: SCHEMA_VERSION },
            { key: "lastBackupAt", value: new Date().toISOString() },
            { key: "firstUseAt", value: getFirstUseAt() },
            { key: "theme", value: localStorage.getItem(LEGACY_THEME_KEY) || "light" }
        ];

        const backupData = {
            app: "Gym Progress Tracker",
            schemaVersion: BACKUP_SCHEMA_VERSION,
            backupType: onlyUser ? "user" : "all",
            exportedAt: new Date().toISOString(),
            activeUserId: _storeCache.activeUserId,
            users: users.map(u => ({ id: u.id, name: u.name, profile: u.profile || null, createdAt: u.createdAt })),
            workouts: workoutsList,
            programs: programsArray,
            exercises: exercisesArray,
            settings: settingsArray,
            catalogAdditions: catalogOverrides
        };

        // Save export snapshot in backups store in IndexedDB
        if (_storeCache.db) {
            putRecord(_storeCache.db, "backups", {
                exportedAt: backupData.exportedAt,
                type: onlyUser ? "export-user" : "export",
                summary: {
                    usersCount: users.length,
                    workoutsCount: workoutsList.length,
                    programsCount: programsArray.length,
                    exercisesCount: exercisesArray.length
                }
            }).catch(e => console.warn("[GymLog DB] ذخیره سابقه پشتیبان با خطا مواجه شد:", e));
        }

        downloadBlob(
            new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" }),
            opts.fileName || buildBackupFileName()
        );

        // فقط پشتیبان کامل، هشدار «زمان پشتیبان‌گیری» را برمی‌دارد
        if (!onlyUser) setLastBackupAt(new Date().toISOString());
        return true;

    } catch (error) {
        console.error("[GymLog Storage] خطا در تهیه‌ی نسخه پشتیبان:", error);
        return false;
    }
}

/**
 * Restores a backup (REPLACES all current data) from a parsed JSON object.
 * Handles:
 *  1. New multi-user format: { users, workouts(userId), programs(userId), ... }
 *  2. Older single-user backups (all data goes to one new user)
 *  3. Program package: { catalogAdditions, programsRaw } → added to the active user
 */
async function restoreBackup(data) {
    if (!data || typeof data !== "object") {
        throw new Error("داده‌های پشتیبان نامعتبر هستند.");
    }

    const isFullBackup = Array.isArray(data.workouts);
    const isProgramOnly = !data.workouts && (data.catalogAdditions || data.programsRaw || data.programs || data.exercises);

    if (isProgramOnly) {
        const imported = await importProgramPackage(data);
        if (!imported) throw new Error("فایل هیچ برنامه یا حرکت قابل‌استفاده‌ای ندارد.");
        return { type: "program", count: 1 };
    }

    if (!isFullBackup) {
        throw new Error("فرمت فایل پشتیبان شناسایی نشد.");
    }

    const nowIso = new Date().toISOString();
    const normalized = normalizeProgramPackage(data);
    const exercisesObj = normalized.catalogAdditions || {};

    let users = Array.isArray(data.users)
        ? data.users.filter(u => u && u.id).map(u => ({
            id: String(u.id),
            name: String(u.name || (u.profile && u.profile.fullName) || "کاربر"),
            profile: u.profile && typeof u.profile === "object" ? u.profile : null,
            createdAt: u.createdAt || nowIso
        }))
        : [];
    const fileHasUsers = users.length > 0;

    if (!fileHasUsers) {
        // پشتیبان قدیمی (تک‌کاربره): همه‌چیز برای یک کاربر
        const prof = Array.isArray(data.settings)
            ? ((data.settings.find(s => s && s.key === "userProfile") || {}).value || null)
            : null;
        users = [makeUser(prof && prof.fullName ? prof.fullName : "کاربر ۱", prof)];
    }

    const known = new Set(users.map(u => u.id));
    const firstId = users[0].id;
    const ownerOf = x => (x && known.has(x.userId) ? x.userId : firstId);

    // تمرین‌ها
    const used = new Set();
    const cleanWorkouts = [];
    (data.workouts || []).forEach(item => {
        const w = sanitizeWorkout({ ...item, userId: ownerOf(item) });
        if (!w) return;
        if (used.has(w.id)) w.id = nextFreeWorkoutId(used);
        else used.add(w.id);
        cleanWorkouts.push(w);
    });

    // برنامه‌ها
    const programsByUser = {};
    if (fileHasUsers) {
        (data.programs || []).forEach(p => {
            if (!p || !p.id) return;
            const { id, userId, updatedAt, ...rest } = p;
            const uid = ownerOf({ userId });
            if (!programsByUser[uid]) programsByUser[uid] = {};
            programsByUser[uid][id] = rest;
        });
    } else {
        programsByUser[firstId] = normalized.programsRaw || {};
    }

    const activeUserId = known.has(data.activeUserId) ? data.activeUserId : firstId;
    const skipSettings = new Set(["users", "activeUserId", "userProfile"]);

    // Write transactionally to IndexedDB
    if (_storeCache.db) {
        const tx = _storeCache.db.transaction(["workouts", "programs", "exercises", "settings"], "readwrite");
        const wStore = tx.objectStore("workouts");
        const pStore = tx.objectStore("programs");
        const eStore = tx.objectStore("exercises");
        const sStore = tx.objectStore("settings");

        wStore.clear();
        cleanWorkouts.forEach(w => wStore.put(w));

        pStore.clear();
        Object.keys(programsByUser).forEach(uid => {
            Object.keys(programsByUser[uid]).forEach(key => {
                pStore.put({
                    id: programRecordId(uid, key),
                    userId: uid,
                    monthKey: key,
                    ...programsByUser[uid][key],
                    updatedAt: nowIso
                });
            });
        });

        eStore.clear();
        Object.keys(exercisesObj).forEach(id => {
            eStore.put({ id, ...exercisesObj[id], isCustom: true, updatedAt: nowIso });
        });

        sStore.put({ key: "schemaVersion", value: SCHEMA_VERSION });
        sStore.put({ key: "lastBackupAt", value: nowIso });
        sStore.put({ key: "users", value: users, updatedAt: nowIso });
        sStore.put({ key: "activeUserId", value: activeUserId, updatedAt: nowIso });

        if (Array.isArray(data.settings)) {
            data.settings.forEach(s => {
                if (s && s.key && !skipSettings.has(s.key)) sStore.put({ key: s.key, value: s.value });
            });
        }

        await txDone(tx);
    }

    // Update in-memory cache
    _storeCache.workouts = cleanWorkouts.sort(
        (a, b) => (a.date || "").localeCompare(b.date || "") || (a.id || 0) - (b.id || 0)
    );
    _storeCache.programsByUser = programsByUser;
    _storeCache.catalogOverrides = exercisesObj;
    _storeCache.users = users;
    _storeCache.activeUserId = activeUserId;
    _storeCache.settings.users = users;
    _storeCache.settings.activeUserId = activeUserId;
    if (Array.isArray(data.settings)) {
        data.settings.forEach(item => {
            if (item && item.key && !skipSettings.has(item.key)) _storeCache.settings[item.key] = item.value;
        });
    }

    // Keep localStorage fallback updated
    mirrorWorkoutsToLocalStorage();
    mirrorProgramsToLocalStorage();
    mirrorUsersToLocalStorage();
    mirrorCatalogToLocalStorage();
    setLastBackupAt(nowIso);

    return {
        type: "full",
        usersCount: users.length,
        workoutsCount: cleanWorkouts.length,
        programsCount: Object.keys(programsByUser).reduce((n, uid) => n + Object.keys(programsByUser[uid]).length, 0),
        exercisesCount: Object.keys(exercisesObj).length
    };
}

/**
 * فهرست «منبع»های داخل یک فایل پشتیبان که می‌شود از آن‌ها اطلاعات برداشت.
 * فایل چندکاربره → هر کاربر یک منبع؛ فایل قدیمی/برنامه → یک منبع بی‌نام (id = null)
 */
function getBackupSources(data) {
    const users = data && Array.isArray(data.users) ? data.users.filter(u => u && u.id) : [];
    if (users.length) {
        const firstId = String(users[0].id);
        return users.map(u => {
            const id = String(u.id);
            return {
                id,
                name: (u.profile && u.profile.fullName) || u.name || "کاربر",
                workouts: (data.workouts || []).filter(w => w && (w.userId ? String(w.userId) : firstId) === id).length
            };
        });
    }
    return [{
        id: null,
        name: "اطلاعات داخل فایل",
        workouts: data && Array.isArray(data.workouts) ? data.workouts.length : 0
    }];
}

/**
 * «به‌روزرسانی اطلاعات تمرین»: اطلاعات یک کاربرِ فایل پشتیبان را به اطلاعات کاربر مقصد اضافه می‌کند.
 *  - تمرین جدید → اضافه می‌شود
 *  - تمرین تکراری (همان شناسه یا همان تاریخ/برنامه/جلسه) → فقط اگر نسخه‌ی فایل جدیدتر باشد به‌روز می‌شود
 *  - برنامه‌ها و حرکات کاتالوگی که وجود ندارند اضافه می‌شوند؛ چیزی حذف یا بازنویسی کورکورانه نمی‌شود
 */
async function mergeBackupIntoUser(data, targetUserId, sourceUserId) {
    const target = (_storeCache.users || []).find(u => u.id === targetUserId);
    if (!target) throw new Error("کاربر مقصد پیدا نشد.");
    if (!data || typeof data !== "object") throw new Error("فایل پشتیبان نامعتبر است.");

    const normalized = normalizeProgramPackage(data);
    const srcUsers = Array.isArray(data.users) ? data.users.filter(u => u && u.id) : [];

    let srcWorkouts;
    let srcPrograms;
    if (srcUsers.length) {
        const firstId = String(srcUsers[0].id);
        const ownerOf = x => (x && x.userId ? String(x.userId) : firstId);
        srcWorkouts = (data.workouts || []).filter(w => ownerOf(w) === sourceUserId);
        srcPrograms = {};
        (data.programs || []).forEach(p => {
            if (!p || !p.id || ownerOf(p) !== sourceUserId) return;
            const { id, userId, updatedAt, ...rest } = p;
            srcPrograms[id] = rest;
        });
    } else {
        srcWorkouts = Array.isArray(data.workouts) ? data.workouts : [];
        srcPrograms = normalized.programsRaw || {};
    }
    const catalogAdd = normalized.catalogAdditions || {};

    if (!srcWorkouts.length && !Object.keys(srcPrograms).length) {
        throw new Error("این فایل اطلاعات تمرین یا برنامه‌ای برای این کاربر ندارد.");
    }

    // ---- تمرین‌ها
    const usedIds = new Set(_storeCache.workouts.map(w => w.id));
    const mine = _storeCache.workouts.filter(w => w.userId === targetUserId);
    const replaceMap = new Map();
    const added = [];
    let skipped = 0;

    srcWorkouts.forEach(item => {
        const clean = sanitizeWorkout({ ...item, userId: targetUserId });
        if (!clean) return;
        const incomingStamp = item && item.updatedAt ? String(item.updatedAt) : null;

        const existing = mine.find(w =>
            w.id === clean.id ||
            (w.date === clean.date && w.month === clean.month && Number(w.session) === Number(clean.session))
        );

        if (existing) {
            const newer = incomingStamp && (!existing.updatedAt || incomingStamp > existing.updatedAt);
            if (!newer) { skipped += 1; return; }
            clean.id = existing.id;
            clean.updatedAt = incomingStamp;
            replaceMap.set(existing.id, clean);
            mine[mine.indexOf(existing)] = clean;
            return;
        }

        if (usedIds.has(clean.id)) clean.id = nextFreeWorkoutId(usedIds);
        else usedIds.add(clean.id);
        added.push(clean);
        mine.push(clean);
    });

    // ---- برنامه‌ها (فقط موارد جدید)
    const myPrograms = { ...(_storeCache.programsByUser[targetUserId] || {}) };
    const newProgramKeys = [];
    Object.keys(srcPrograms).forEach(key => {
        if (!myPrograms[key] && srcPrograms[key] && srcPrograms[key].sessions) {
            myPrograms[key] = srcPrograms[key];
            newProgramKeys.push(key);
        }
    });

    // ---- حرکات کاتالوگ (مشترک بین کاربران؛ فقط موارد جدید)
    const newCatalog = {};
    Object.keys(catalogAdd).forEach(id => {
        if (!_storeCache.catalogOverrides[id] && catalogAdd[id] && typeof catalogAdd[id] === "object") {
            newCatalog[id] = catalogAdd[id];
        }
    });

    const nowIso = new Date().toISOString();

    if (_storeCache.db) {
        const tx = _storeCache.db.transaction(["workouts", "programs", "exercises"], "readwrite");
        const wStore = tx.objectStore("workouts");
        const pStore = tx.objectStore("programs");
        const eStore = tx.objectStore("exercises");
        replaceMap.forEach(w => wStore.put(w));
        added.forEach(w => wStore.put(w));
        newProgramKeys.forEach(key => {
            pStore.put({
                id: programRecordId(targetUserId, key),
                userId: targetUserId,
                monthKey: key,
                ...myPrograms[key],
                updatedAt: nowIso
            });
        });
        Object.keys(newCatalog).forEach(id => {
            eStore.put({ id, ...newCatalog[id], isCustom: true, updatedAt: nowIso });
        });
        await txDone(tx);
    }

    _storeCache.workouts = _storeCache.workouts
        .map(w => (replaceMap.has(w.id) ? replaceMap.get(w.id) : w))
        .concat(added)
        .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.id || 0) - (b.id || 0));
    _storeCache.programsByUser = { ..._storeCache.programsByUser, [targetUserId]: myPrograms };
    _storeCache.catalogOverrides = { ..._storeCache.catalogOverrides, ...newCatalog };

    mirrorWorkoutsToLocalStorage();
    mirrorProgramsToLocalStorage();
    mirrorCatalogToLocalStorage();

    return {
        added: added.length,
        updated: replaceMap.size,
        skipped,
        programsAdded: newProgramKeys.length,
        exercisesAdded: Object.keys(newCatalog).length
    };
}

/* =====================================================
   Backup Reminders & Dates
===================================================== */

function getLastBackupAt() {
    if (_storeCache.settings && _storeCache.settings.lastBackupAt) {
        return _storeCache.settings.lastBackupAt;
    }
    return localStorage.getItem(LEGACY_LAST_BACKUP_KEY);
}

function setLastBackupAt(iso) {
    if (_storeCache.settings) {
        _storeCache.settings.lastBackupAt = iso;
    }
    if (_storeCache.db) {
        putRecord(_storeCache.db, "settings", {
            key: "lastBackupAt",
            value: iso,
            updatedAt: new Date().toISOString()
        }).catch(() => {});
    }
    localStorage.setItem(LEGACY_LAST_BACKUP_KEY, iso);
}

function getFirstUseAt() {
    if (_storeCache.settings && _storeCache.settings.firstUseAt) {
        return _storeCache.settings.firstUseAt;
    }
    let firstUse = localStorage.getItem(LEGACY_FIRST_USE_KEY);
    if (!firstUse) {
        firstUse = new Date().toISOString();
        localStorage.setItem(LEGACY_FIRST_USE_KEY, firstUse);
        if (_storeCache.db) {
            putRecord(_storeCache.db, "settings", {
                key: "firstUseAt",
                value: firstUse,
                updatedAt: new Date().toISOString()
            }).catch(() => {});
        }
    }
    return firstUse;
}

function hasBackableData() {
    const progs = _storeCache.programsByUser || {};
    return (
        getAllWorkouts().length > 0 ||
        Object.keys(progs).some(uid => Object.keys(progs[uid] || {}).length > 0) ||
        Object.keys(loadCatalogOverrides()).length > 0 ||
        (_storeCache.users || []).some(u => u.profile)
    );
}

function getBackupWarningInfo() {
    if (!hasBackableData()) {
        return {
            shouldWarn: false,
            daysSince: 0
        };
    }

    const reference = getLastBackupAt() || getFirstUseAt();
    const diffMs = Date.now() - new Date(reference).getTime();
    const daysSince = Math.max(0, Math.floor(diffMs / MS_PER_DAY));

    return {
        shouldWarn: daysSince >= 7,
        daysSince
    };
}


/* =====================================================
   Users (multi-user)
   - users + activeUserId در store «settings» نگه‌داری می‌شوند
   - پروفایل (نام، سال تولد، قد، کمر، وزن) داخل رکورد هر کاربر است
   - تغییر کاربر فعال: setActiveUser(id) و سپس بارگذاری دوباره‌ی صفحه
===================================================== */

function getUsers() {
    return (_storeCache.users || []).slice();
}

function getActiveUserId() {
    return _storeCache.activeUserId || fallbackActiveUserId();
}

function getUserById(id) {
    return (_storeCache.users || []).find(u => u.id === id) || null;
}

function getUserDisplayName(user) {
    return (user && ((user.profile && user.profile.fullName) || user.name)) || "کاربر";
}

function getUserWorkoutCount(id) {
    return getAllWorkouts().filter(w => w.userId === id).length;
}

function getUserProgramCount(id) {
    return Object.keys((_storeCache.programsByUser || {})[id] || {}).length;
}

async function persistUsers() {
    const now = new Date().toISOString();
    if (!_storeCache.settings) _storeCache.settings = {};
    _storeCache.settings.users = _storeCache.users;
    _storeCache.settings.activeUserId = _storeCache.activeUserId;

    if (_storeCache.db) {
        try {
            const tx = _storeCache.db.transaction("settings", "readwrite");
            const store = tx.objectStore("settings");
            store.put({ key: "users", value: _storeCache.users, updatedAt: now });
            store.put({ key: "activeUserId", value: _storeCache.activeUserId, updatedAt: now });
            await txDone(tx);
        } catch (err) {
            console.error("[GymLog DB] خطا در ذخیره‌ی فهرست کاربران:", err);
        }
    }
    mirrorUsersToLocalStorage();
}

async function setActiveUser(id) {
    if (!getUserById(id)) return false;
    _storeCache.activeUserId = id;
    await persistUsers();
    return true;
}

async function createUser(profile) {
    const clean = profile && typeof profile === "object"
        ? { ...profile, updatedAt: new Date().toISOString() }
        : null;
    const name = clean && clean.fullName ? clean.fullName : "کاربر " + (_storeCache.users.length + 1);
    const user = makeUser(name, clean);
    _storeCache.users = [..._storeCache.users, user];
    await persistUsers();
    return user;
}

/**
 * حذف کاربر همراه با همه‌ی تمرین‌ها و برنامه‌هایش.
 * اگر آخرین کاربر حذف شود، یک کاربر خالی تازه ساخته می‌شود تا برنامه همیشه یک کاربر داشته باشد.
 */
async function deleteUser(id) {
    if (!getUserById(id)) return false;

    const removedWorkouts = _storeCache.workouts.filter(w => w.userId === id);
    const removedProgramKeys = Object.keys(_storeCache.programsByUser[id] || {});

    if (_storeCache.db) {
        try {
            const tx = _storeCache.db.transaction(["workouts", "programs"], "readwrite");
            const wStore = tx.objectStore("workouts");
            const pStore = tx.objectStore("programs");
            removedWorkouts.forEach(w => wStore.delete(w.id));
            removedProgramKeys.forEach(key => pStore.delete(programRecordId(id, key)));
            await txDone(tx);
        } catch (err) {
            console.error("[GymLog DB] خطا در حذف اطلاعات کاربر:", err);
        }
    }

    _storeCache.workouts = _storeCache.workouts.filter(w => w.userId !== id);
    const nextPrograms = { ..._storeCache.programsByUser };
    delete nextPrograms[id];
    _storeCache.programsByUser = nextPrograms;

    let users = _storeCache.users.filter(u => u.id !== id);
    if (!users.length) users = [makeUser("کاربر ۱", null)];
    _storeCache.users = users;
    if (_storeCache.activeUserId === id || !users.some(u => u.id === _storeCache.activeUserId)) {
        _storeCache.activeUserId = users[0].id;
    }

    await persistUsers();
    mirrorWorkoutsToLocalStorage();
    mirrorProgramsToLocalStorage();
    return true;
}

function getUserProfile(userId) {
    const id = userId || _storeCache.activeUserId || fallbackActiveUserId();
    const user = getUserById(id);
    if (user) return user.profile || null;

    // پیش از آماده شدن حافظه
    const saved = readJsonLS(LEGACY_USERS_KEY, null);
    const fromLs = saved && Array.isArray(saved.users) ? saved.users.find(u => u && u.id === id) : null;
    if (fromLs) return fromLs.profile || null;
    return readJsonLS(LEGACY_PROFILE_KEY, null);
}

async function saveUserProfile(profile, userId) {
    if (!profile || typeof profile !== "object") return false;
    const user = getUserById(userId || _storeCache.activeUserId);
    if (!user) return false;

    const clean = { ...profile, updatedAt: new Date().toISOString() };
    user.profile = clean;
    if (clean.fullName) user.name = clean.fullName;
    _storeCache.users = _storeCache.users.slice();
    await persistUsers();
    return true;
}


/* =====================================================
   Catalog Exercise Editing (add / edit / reset)
   - حرکت جدید یا ویرایش‌شده در store «exercises» ذخیره می‌شود و روی
     کاتالوگ پیش‌فرض (exercise-catalog.js) override می‌شود.
   - فایل‌های بارگذاری‌شده به‌صورت data URL داخل IndexedDB نگه‌داری
     می‌شوند؛ نسخه‌ی احتیاطی localStorage بدون آن‌ها نوشته می‌شود
     (حجم localStorage محدود است).
===================================================== */

function mirrorCatalogToLocalStorage() {
    const light = {};
    Object.keys(_storeCache.catalogOverrides).forEach(id => {
        const e = _storeCache.catalogOverrides[id];
        light[id] = e && Array.isArray(e.images)
            ? { ...e, images: e.images.filter(p => typeof p !== "string" || !p.startsWith("data:")) }
            : e;
    });
    saveDataToKey(LEGACY_CATALOG_KEY, light);
}

async function saveCatalogExercise(id, entry) {
    if (!id || !entry || typeof entry !== "object") throw new Error("اطلاعات حرکت نامعتبر است.");

    if (_storeCache.db) {
        await putRecord(_storeCache.db, "exercises", {
            id,
            ...entry,
            isCustom: true,
            updatedAt: new Date().toISOString()
        });
    }

    _storeCache.catalogOverrides = { ..._storeCache.catalogOverrides, [id]: entry };
    mirrorCatalogToLocalStorage();
    return true;
}

async function resetCatalogExercise(id) {
    if (_storeCache.db) {
        try { await deleteRecordByKey(_storeCache.db, "exercises", id); }
        catch (e) { console.error("[GymLog DB] خطا در بازگردانی حرکت:", e); }
    }
    const next = { ..._storeCache.catalogOverrides };
    delete next[id];
    _storeCache.catalogOverrides = next;
    mirrorCatalogToLocalStorage();
    return true;
}
