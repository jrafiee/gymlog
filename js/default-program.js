/* =====================================================
   برنامه‌ی پیش‌فرض تمرینی

   وقتی کاربر برای اولین‌بار برنامه را باز می‌کند و
   هنوز هیچ برنامه‌ای بارگذاری نکرده، اگر این فایل
   شامل داده باشد، اپ به‌جای فقط راهنمایی به تنظیمات
   مستقیم پیشنهاد می‌دهد که همین برنامه‌ی پیش‌فرض
   بارگذاری شود (کاربر می‌تواند بپذیرد یا رد کند).
===================================================== */

const defaultProgramPackage = {

    programsRaw: {

        month1: {

            title: "ماه اول",

            sessions: {

                "1": {
                    title: "سینه + پشت بازو + شکم",
                    exercises: [
                        { id: "machine_chest_press", target: "4 × 6–10", rest: "2–3 دقیقه", sets: 4 },
                        { id: "incline_dumbbell_press", target: "3 × 8–12", rest: "2 دقیقه", sets: 3 },
                        { id: "cable_crossover", target: "3 × 10–15", rest: "90 ثانیه", sets: 3 },
                        { id: "close_grip_dumbbell_press", target: "2 × 8–12", rest: "90 ثانیه", sets: 2 },
                        { id: "rope_triceps_pushdown", target: "3 × 8–12", rest: "90 ثانیه", sets: 3 },
                        { id: "lying_dumbbell_triceps_extension", target: "2 × 10–15", rest: "90 ثانیه", sets: 2 },
                        { id: "side_plank", target: "3 × 30–45 ثانیه هر طرف", rest: "60 ثانیه", sets: 3 },
                        { id: "dead_bug", target: "3 × 10 هر طرف", rest: "45–60 ثانیه", sets: 3 }
                    ]
                },

                "2": {
                    title: "پشت + سرشانه + شکم",
                    exercises: [
                        { id: "medium_grip_lat_pulldown", target: "4 × 6–10", rest: "2–3 دقیقه", sets: 4 },
                        { id: "seated_cable_row", target: "3 × 8–12", rest: "2 دقیقه", sets: 3 },
                        { id: "t_bar_row", target: "3 × 8–12", rest: "2 دقیقه", sets: 3 },
                        { id: "straight_arm_pullover", target: "2 × 12–15", rest: "90 ثانیه", sets: 2 },
                        { id: "dumbbell_shoulder_press", target: "3 × 8–12", rest: "2 دقیقه", sets: 3 },
                        { id: "dumbbell_lateral_raise", target: "4 × 10–15", rest: "60–90 ثانیه", sets: 4 },
                        { id: "face_pull", target: "3 × 12–15", rest: "60 ثانیه", sets: 3 },
                        { id: "pallof_press", target: "3 × 10–12 هر طرف", rest: "45–60 ثانیه", sets: 3 }
                    ]
                },

                "3": {
                    title: "پا + جلو بازو + شکم",
                    exercises: [
                        { id: "smith_squat", target: "4 × 6–10", rest: "2–3 دقیقه", sets: 4 },
                        { id: "leg_press", target: "3 × 10–12", rest: "2 دقیقه", sets: 3 },
                        { id: "lying_leg_curl", target: "3 × 8–12", rest: "90 ثانیه", sets: 3 },
                        { id: "bulgarian_split_squat", target: "2 × 10–12 هر پا", rest: "90 ثانیه", sets: 2 },
                        { id: "smith_calf_raise", target: "4 × 10–15", rest: "60–90 ثانیه", sets: 4 },
                        { id: "hammer_curl", target: "3 × 8–12", rest: "90 ثانیه", sets: 3 },
                        { id: "cable_curl", target: "3 × 10–15", rest: "60–90 ثانیه", sets: 3 },
                        { id: "cable_crunch", target: "3 × 10–15", rest: "60 ثانیه", sets: 3 }
                    ]
                }

            }

        }

    }

};
