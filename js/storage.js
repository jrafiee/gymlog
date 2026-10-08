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

   Dual-layer architecture:
     - IndexedDB is the primary, robust source of truth.
     - An in-memory reactive cache provides instant synchronous read access for UI rendering.
     - localStorage is preserved as a migration fallback and emergency safety net.
===================================================== */

const DB_NAME = "GymProgressTrackerDB";
const DB_VERSION = 1;
const SCHEMA_VERSION = 1;

// Legacy localStorage keys (kept for migration detection and emergency fallback)
const LEGACY_STORAGE_KEY = "gymProgressTracker_v2";
const LEGACY_CATALOG_KEY = "gymProgressTracker_catalogOverrides";
const LEGACY_PROGRAM_KEY = "gymProgressTracker_programOverrides";
const LEGACY_LAST_BACKUP_KEY = "gymProgressTracker_lastBackupAt";
const LEGACY_FIRST_USE_KEY = "gymProgressTracker_firstUseAt";
const LEGACY_THEME_KEY = "gymTrackerTheme";
const LEGACY_PROFILE_KEY = "gymProgressTracker_userProfile";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/* =====================================================
   In-Memory Storage Cache
===================================================== */
const _storeCache = {
    isReady: false,
    readyPromise: null,
    db: null,
    schemaVersion: SCHEMA_VERSION,
    workouts: [],
    programsRaw: {},
    catalogOverrides: {},
    settings: {},
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

    const exercises = Array.isArray(rawWorkout.exercises)
        ? rawWorkout.exercises.map(ex => ({
            id: String(ex.id || ""),
            sets: Array.isArray(ex.sets)
                ? ex.sets.map(s => ({
                    weight: s && s.weight !== undefined && s.weight !== null ? String(s.weight) : "",
                    reps: s && s.reps !== undefined && s.reps !== null ? String(s.reps) : ""
                }))
                : []
        })).filter(ex => ex.id !== "")
        : [];

    return {
        id,
        date,
        week,
        month,
        session,
        exercises,
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

async function initStorage() {
    if (_storeCache.readyPromise) {
        return _storeCache.readyPromise;
    }

    _storeCache.readyPromise = (async () => {
        try {
            const db = await openDatabase();
            _storeCache.db = db;

            // Safe migration check
            await checkAndRunMigration(db);

            // Hydrate in-memory cache from IndexedDB
            const allWorkouts = await getAllFromStore(db, "workouts");
            allWorkouts.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.id || 0) - (b.id || 0));
            _storeCache.workouts = allWorkouts;

            const allPrograms = await getAllFromStore(db, "programs");
            const programsMap = {};
            allPrograms.forEach(p => {
                if (p && p.id) {
                    const { id, updatedAt, ...rest } = p;
                    programsMap[id] = rest;
                }
            });
            _storeCache.programsRaw = programsMap;

            const allExercises = await getAllFromStore(db, "exercises");
            const exercisesMap = {};
            allExercises.forEach(e => {
                if (e && e.id) {
                    const { id, isCustom, updatedAt, ...rest } = e;
                    exercisesMap[id] = rest;
                }
            });
            _storeCache.catalogOverrides = exercisesMap;

            const allSettings = await getAllFromStore(db, "settings");
            const settingsMap = {};
            allSettings.forEach(s => {
                if (s && s.key) {
                    settingsMap[s.key] = s.value;
                }
            });
            _storeCache.settings = settingsMap;

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
    try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.workouts)) {
                _storeCache.workouts = parsed.workouts;
            }
        }
    } catch (e) {
        _storeCache.workouts = [];
    }

    try {
        const raw = localStorage.getItem(LEGACY_PROGRAM_KEY);
        _storeCache.programsRaw = raw ? JSON.parse(raw) : {};
    } catch (e) {
        _storeCache.programsRaw = {};
    }

    try {
        const raw = localStorage.getItem(LEGACY_CATALOG_KEY);
        _storeCache.catalogOverrides = raw ? JSON.parse(raw) : {};
    } catch (e) {
        _storeCache.catalogOverrides = {};
    }
}

// Start storage initialization immediately in background
if (typeof window !== "undefined") {
    initStorage().catch(err => console.warn("[GymLog Storage] Early init note:", err));
}

/* =====================================================
   Public Storage APIs (Compatible with existing codebase)
===================================================== */

/**
 * Returns all recorded workouts.
 * Synchronously reads from memory cache, with fallback to localStorage if DB is initializing.
 */
function getWorkouts() {
    if (_storeCache.isReady) {
        return _storeCache.workouts;
    }

    // If cache not yet populated, read from localStorage fallback as emergency
    try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (data && Array.isArray(data.workouts)) return data.workouts;
        }
    } catch (e) { /* ignore */ }

    return _storeCache.workouts || [];
}

/**
 * Saves or updates a workout session.
 * Guarantees transactional persistence in IndexedDB, then updates memory cache and fallback.
 */
async function addWorkout(workout) {
    const clean = sanitizeWorkout(workout);
    if (!clean) {
        console.error("[GymLog DB] اطلاعات جلسه تمرینی نامعتبر است و ذخیره نشد:", workout);
        return false;
    }

    // 1. Transactional write to IndexedDB
    let dbSuccess = false;
    if (_storeCache.db) {
        try {
            await putRecord(_storeCache.db, "workouts", clean);
            dbSuccess = true;
        } catch (dbError) {
            console.error("[GymLog DB] خطا در ذخیره‌سازی جلسه در IndexedDB:", dbError);
        }
    }

    // 2. Update memory cache
    const existingIndex = _storeCache.workouts.findIndex(
        item =>
            (item.id === clean.id) ||
            (item.date === clean.date && item.month === clean.month && Number(item.session) === Number(clean.session))
    );

    if (existingIndex >= 0) {
        _storeCache.workouts[existingIndex] = clean;
    } else {
        _storeCache.workouts.push(clean);
    }

    _storeCache.workouts.sort(
        (a, b) =>
            (a.date || "").localeCompare(b.date || "") ||
            (a.id || 0) - (b.id || 0)
    );

    // 3. Keep fallback in localStorage updated to prevent data loss in all scenarios
    try {
        localStorage.setItem(
            LEGACY_STORAGE_KEY,
            JSON.stringify({ workouts: _storeCache.workouts })
        );
    } catch (lsErr) {
        console.warn("[GymLog DB] اخطار در به‌روزرسانی حافظه رزرو:", lsErr);
    }

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
 * Deletes all workout history while keeping programs and settings intact.
 */
async function deleteAllData() {
    _storeCache.workouts = [];

    let db = _storeCache.db;
    if (!db) {
        try {
            await initStorage();
            db = _storeCache.db;
        } catch (e) { /* ignore */ }
    }

    if (db && db.objectStoreNames.contains("workouts")) {
        try {
            const tx = db.transaction("workouts", "readwrite");
            tx.objectStore("workouts").clear();
            await new Promise(resolve => {
                tx.oncomplete = resolve;
                tx.onerror = resolve;
                tx.onabort = resolve;
            });
        } catch (err) {
            console.error("[GymLog DB] خطا در پاک‌سازی store تمرینات:", err);
        }
    }

    try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (e) { /* ignore */ }

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
    _storeCache.programsRaw = {};
    _storeCache.catalogOverrides = {};
    _storeCache.settings = {};
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

function loadProgramOverrides() {
    if (_storeCache.isReady) {
        return _storeCache.programsRaw;
    }
    try {
        const raw = localStorage.getItem(LEGACY_PROGRAM_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        return {};
    }
}

function getEffectiveCatalog() {
    const baseCatalog = typeof exerciseCatalog !== "undefined" ? exerciseCatalog : {};
    return {
        ...baseCatalog,
        ...loadCatalogOverrides()
    };
}

function getEffectiveProgramsRaw() {
    const basePrograms = typeof workoutProgramsRaw !== "undefined" ? workoutProgramsRaw : {};
    return {
        ...basePrograms,
        ...loadProgramOverrides()
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
async function importProgramPackage(pkg) {
    if (!pkg || typeof pkg !== "object") return false;

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

    // 2. Programs raw
    if (pkg.programsRaw && typeof pkg.programsRaw === "object") {
        _storeCache.programsRaw = {
            ..._storeCache.programsRaw,
            ...pkg.programsRaw
        };

        if (_storeCache.db) {
            try {
                const tx = _storeCache.db.transaction("programs", "readwrite");
                const store = tx.objectStore("programs");
                Object.keys(pkg.programsRaw).forEach(id => {
                    store.put({
                        id,
                        ...pkg.programsRaw[id],
                        updatedAt: new Date().toISOString()
                    });
                });
                await txDone(tx);
            } catch (err) {
                console.error("[GymLog DB] خطا در ذخیره جلسات برنامه جدید:", err);
            }
        }

        saveDataToKey(LEGACY_PROGRAM_KEY, _storeCache.programsRaw);
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
 * Exports all data from IndexedDB into a versioned JSON backup.
 * Structure matches user specification:
 * {
 *   app: "Gym Progress Tracker",
 *   schemaVersion: 1,
 *   exportedAt: "...",
 *   exercises: [ ... ],
 *   programs: [ ... ],
 *   workouts: [ ... ],
 *   settings: [ ... ]
 * }
 * Also retains backward-compatible legacy properties (catalogAdditions, programsRaw)
 * so older app versions can still import this file.
 */
function exportData(options) {
    try {
        const workoutsList = getWorkouts();
        const programsRaw = loadProgramOverrides();
        const catalogOverrides = loadCatalogOverrides();

        // Convert programs to array structure for versioned schema
        const programsArray = Object.keys(programsRaw).map(id => ({
            id,
            ...programsRaw[id]
        }));

        // Convert catalog to array structure for versioned schema
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
        const profileForBackup = getUserProfile();
        if (profileForBackup) settingsArray.push({ key: "userProfile", value: profileForBackup });

        const backupData = {
            app: "Gym Progress Tracker",
            schemaVersion: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            workouts: workoutsList,
            programs: programsArray,
            exercises: exercisesArray,
            settings: settingsArray,

            // Backward compatibility fields for legacy imports
            catalogAdditions: catalogOverrides,
            programsRaw: programsRaw
        };

        // Save export snapshot in backups store in IndexedDB
        if (_storeCache.db) {
            putRecord(_storeCache.db, "backups", {
                exportedAt: backupData.exportedAt,
                type: "export",
                summary: {
                    workoutsCount: workoutsList.length,
                    programsCount: programsArray.length,
                    exercisesCount: exercisesArray.length
                }
            }).catch(e => console.warn("[GymLog DB] ذخیره سابقه پشتیبان با خطا مواجه شد:", e));
        }

        downloadBlob(
            new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" }),
            (options && options.fileName) || buildBackupFileName()
        );

        setLastBackupAt(new Date().toISOString());
        return true;

    } catch (error) {
        console.error("[GymLog Storage] خطا در تهیه‌ی نسخه پشتیبان:", error);
        return false;
    }
}

/**
 * Restores a backup from a parsed JSON object.
 * Seamlessly handles:
 *  1. New versioned format: { app, schemaVersion, workouts, programs, exercises, settings }
 *  2. Legacy workout format: { workouts: [], catalogAdditions: {}, programsRaw: {} }
 *  3. Program package format: { catalogAdditions: {}, programsRaw: {} }
 */
async function restoreBackup(data) {
    if (!data || typeof data !== "object") {
        throw new Error("داده‌های پشتیبان نامعتبر هستند.");
    }

    // Detect format
    const isNewVersioned = (data.app === "Gym Progress Tracker" || data.schemaVersion) && Array.isArray(data.workouts);
    const isLegacyWorkoutBackup = Array.isArray(data.workouts);
    const isProgramOnly = !data.workouts && (data.catalogAdditions || data.programsRaw || data.programs);

    if (isProgramOnly) {
        await importProgramPackage(data);
        return { type: "program", count: 1 };
    }

    if (isNewVersioned || isLegacyWorkoutBackup) {
        const rawWorkouts = data.workouts || [];
        const cleanWorkouts = [];

        rawWorkouts.forEach(item => {
            const w = sanitizeWorkout(item);
            if (w) cleanWorkouts.push(w);
        });

        // Extract programs
        let programsObj = {};
        if (data.programsRaw && typeof data.programsRaw === "object") {
            programsObj = data.programsRaw;
        } else if (Array.isArray(data.programs)) {
            data.programs.forEach(p => {
                if (p && p.id) {
                    const { id, ...rest } = p;
                    programsObj[id] = rest;
                }
            });
        }

        // Extract exercises
        let exercisesObj = {};
        if (data.catalogAdditions && typeof data.catalogAdditions === "object") {
            exercisesObj = data.catalogAdditions;
        } else if (Array.isArray(data.exercises)) {
            data.exercises.forEach(e => {
                if (e && e.id) {
                    const { id, ...rest } = e;
                    exercisesObj[id] = rest;
                }
            });
        }

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
            Object.keys(programsObj).forEach(id => {
                pStore.put({ id, ...programsObj[id], updatedAt: new Date().toISOString() });
            });

            eStore.clear();
            Object.keys(exercisesObj).forEach(id => {
                eStore.put({ id, ...exercisesObj[id], isCustom: true, updatedAt: new Date().toISOString() });
            });

            sStore.put({ key: "schemaVersion", value: SCHEMA_VERSION });
            sStore.put({ key: "lastBackupAt", value: new Date().toISOString() });

            // Restore settings if present
            if (Array.isArray(data.settings)) {
                data.settings.forEach(s => {
                    if (s && s.key) sStore.put({ key: s.key, value: s.value });
                });
            }

            await txDone(tx);
        }

        // Update in-memory cache
        _storeCache.workouts = cleanWorkouts;
        _storeCache.programsRaw = programsObj;
        _storeCache.catalogOverrides = exercisesObj;
        if (Array.isArray(data.settings)) {
            data.settings.forEach(item => {
                if (item && item.key) _storeCache.settings[item.key] = item.value;
            });
        }

        // Keep localStorage fallback updated
        saveDataToKey(LEGACY_STORAGE_KEY, { workouts: cleanWorkouts });
        saveDataToKey(LEGACY_PROGRAM_KEY, programsObj);
        saveDataToKey(LEGACY_CATALOG_KEY, exercisesObj);
        setLastBackupAt(new Date().toISOString());

        return {
            type: "full",
            workoutsCount: cleanWorkouts.length,
            programsCount: Object.keys(programsObj).length,
            exercisesCount: Object.keys(exercisesObj).length
        };
    }

    throw new Error("فرمت فایل پشتیبان شناسایی نشد.");
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
    const workouts = getWorkouts();
    const programOverrides = loadProgramOverrides();
    const catalogOverrides = loadCatalogOverrides();

    return (
        workouts.length > 0 ||
        Object.keys(programOverrides).length > 0 ||
        Object.keys(catalogOverrides).length > 0
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
   User Profile (name, age, height, waist, weight)
   Stored in the "settings" store under key "userProfile",
   mirrored to localStorage as an emergency fallback.
===================================================== */

function getUserProfile() {
    if (_storeCache.settings && _storeCache.settings.userProfile) {
        return _storeCache.settings.userProfile;
    }
    try {
        const raw = localStorage.getItem(LEGACY_PROFILE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

async function saveUserProfile(profile) {
    if (!profile || typeof profile !== "object") return false;
    const clean = { ...profile, updatedAt: new Date().toISOString() };

    if (!_storeCache.settings) _storeCache.settings = {};
    _storeCache.settings.userProfile = clean;

    try {
        localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(clean));
    } catch (e) { /* ignore */ }

    if (_storeCache.db) {
        try {
            await putRecord(_storeCache.db, "settings", {
                key: "userProfile",
                value: clean,
                updatedAt: clean.updatedAt
            });
        } catch (err) {
            console.error("[GymLog DB] خطا در ذخیره‌ی مشخصات کاربر:", err);
        }
    }
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
