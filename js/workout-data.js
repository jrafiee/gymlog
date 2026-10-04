/* =====================================================
   ترکیب کاتالوگ + برنامه

   این فایل به exerciseCatalog (از exercise-catalog.js)
   و workoutProgramsRaw (از workout-programs.js) نیاز
   دارد، پس در index.html باید بعد از هر دوی آن‌ها
   لود شود.
===================================================== */

function buildWorkoutPrograms(catalog, programsRaw) {

    const result = {};

    Object.keys(programsRaw || {}).forEach(monthKey => {

        const month = programsRaw[monthKey];
        if (!month || !month.sessions) return;
        const sessions = {};

        Object.keys(month.sessions).forEach(sessionKey => {

            const session = month.sessions[sessionKey];
            if (!session) return;

            const exercises = (session.exercises || []).map(exercise => {

                const catalogEntry = catalog[exercise.id];

                if (!catalogEntry) {
                    console.warn(
                        `حرکتی با id "${exercise.id}" در کاتالوگ پیدا نشد.`
                    );
                }

                return {
                    id: exercise.id,
                    target: exercise.target,
                    rest: exercise.rest,
                    sets: exercise.sets,
                    name: catalogEntry ? catalogEntry.name : exercise.id,
                    images: catalogEntry ? catalogEntry.images : [],
                    instructions: catalogEntry ? catalogEntry.instructions : []
                };

            });

            sessions[sessionKey] = {
                title: session.title,
                exercises: exercises
            };

        });

        let programTitle = month.title;
        if (programTitle) {
            programTitle = programTitle.replace(/ماه\s*(\d+|اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم)/gi, (match, p1) => {
                return `برنامه ${p1}`;
            });
            if (programTitle.includes("ماه")) {
                programTitle = programTitle.replace(/ماه/g, "برنامه");
            }
        }

        result[monthKey] = {
            title: programTitle || month.title,
            sessions: sessions
        };

    });

    return result;

}
