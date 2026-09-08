    (function () {
        'use strict';

        const DATA_SCHEMA_VERSION = 10;
        let saving = false;
        async function dbSaveAll() { await GymStorage.save(state); }
        function uniqueId(prefix) { return prefix + '_' + (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)), x=>x.toString(16)).join('-')); }
        function restoreActiveSession() {
            activeSessionId = state.sessions.find(s => s.status === 'active')?.id || null;
        }
        async function runMutation(action) {
            if (saving) return;
            saving = true;
            const controls = [...document.querySelectorAll('button,input,select')];
            const disabled = controls.map(el => el.disabled);
            controls.forEach(el => el.disabled = true);
            try { await action(); }
            catch (error) {
                state = GymStorage.rollback() || state;
                restoreActiveSession();
                updateGenderUI();
                showToast(error.message || 'تعذر إتمام العملية');
            } finally {
                controls.forEach((el,i) => el.disabled = disabled[i]);
                saving = false;
                document.getElementById('input-weight').disabled=activeLoadMode==='bodyweight'||activeLoadMode==='timed';
                renderTodayLogs(); updateTopHeaderStats(); updateSessionUI();
            }
        }
        function escapeHTML(str) {
            if (typeof str !== 'string') return '';
            return str.replace(/[&<>"']/g, function(m) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
            });
        }

        function getLocalDateString(date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function getCanonicalWeightKg(log) {
            const stored = parseFloat(log && log.weight);
            if (Number.isFinite(stored)) return stored;
            const displayed = parseFloat(log && log.displayWeight) || 0;
            return log && log.unit === 'lbs' ? displayed / 2.20462 : displayed;
        }

        function getVolumeLoadKg(log) {
            if (log.loadMode === 'timed') return 0;
            if (Number.isFinite(parseFloat(log.volumeLoadKg))) return parseFloat(log.volumeLoadKg);
            const base = getCanonicalWeightKg(log);
            const multiplier = log.loadMode === 'per_hand' ? 2 : 1;
            return base * multiplier;
        }

        function getProgressWeightKg(log) {
            if (log.loadMode === 'timed') return null;
            if (log.loadMode === 'assisted' && Number.isFinite(parseFloat(log.effectiveLoadKg))) return parseFloat(log.effectiveLoadKg);
            if ((log.loadMode === 'bodyweight' || log.loadMode === 'added') && Number.isFinite(parseFloat(log.effectiveLoadKg))) return parseFloat(log.effectiveLoadKg);
            return getCanonicalWeightKg(log);
        }

        const ROUTINE_PRESETS = {
            ppl_push: ['ex_1', 'ex_2', 'ex_4', 'ex_12', 'ex_15', 'ex_20'],
            ppl_pull: ['ex_24', 'ex_26', 'ex_27', 'ex_38', 'ex_40'],
            ppl_legs: ['ex_44', 'ex_47', 'ex_49', 'ex_50', 'ex_58'],
            ul_upper: ['ex_1', 'ex_24', 'ex_12', 'ex_26', 'ex_15', 'ex_38'],
            ul_lower: ['ex_44', 'ex_52', 'ex_47', 'ex_49', 'ex_50', 'ex_58']
        };

        const EXERCISE_DICTIONARY = {
            'hip adduction': { cat: 'legs', equip: 'machine' },
            'hip abduction': { cat: 'legs', equip: 'machine' },
            'adduction': { cat: 'legs', equip: 'machine' },
            'abduction': { cat: 'legs', equip: 'machine' },
            'hip thrust': { cat: 'legs', equip: 'machine' },
            'leg press': { cat: 'legs', equip: 'machine' },
            'leg extension': { cat: 'legs', equip: 'machine' },
            'leg curl': { cat: 'legs', equip: 'machine' },
            'squat': { cat: 'legs', equip: 'barbell' },
            'hack squat': { cat: 'legs', equip: 'machine' },
            'goblet squat': { cat: 'legs', equip: 'dumbbell' },
            'bulgarian split squat': { cat: 'legs', equip: 'dumbbell' },
            'rdl': { cat: 'legs', equip: 'barbell' },
            'romanian deadlift': { cat: 'legs', equip: 'barbell' },
            'deadlift': { cat: 'legs', equip: 'barbell' },
            'calf raise': { cat: 'legs', equip: 'machine' },
            'lunge': { cat: 'legs', equip: 'dumbbell' },
            'bench press': { cat: 'push', equip: 'barbell' },
            'incline bench press': { cat: 'push', equip: 'barbell' },
            'incline dumbbell press': { cat: 'push', equip: 'dumbbell' },
            'dumbbell press': { cat: 'push', equip: 'dumbbell' },
            'chest press': { cat: 'push', equip: 'machine' },
            'shoulder press': { cat: 'push', equip: 'dumbbell' },
            'overhead press': { cat: 'push', equip: 'barbell' },
            'lateral raise': { cat: 'push', equip: 'dumbbell' },
            'tricep pushdown': { cat: 'push', equip: 'cable_body' },
            'dips': { cat: 'push', equip: 'cable_body' },
            'pec deck': { cat: 'push', equip: 'machine' },
            'lat pulldown': { cat: 'pull', equip: 'machine' },
            'seated cable row': { cat: 'pull', equip: 'cable_body' },
            'bent over row': { cat: 'pull', equip: 'barbell' },
            'dumbbell row': { cat: 'pull', equip: 'dumbbell' },
            'pull up': { cat: 'pull', equip: 'cable_body' },
            'bicep curl': { cat: 'pull', equip: 'dumbbell' },
            'hammer curl': { cat: 'pull', equip: 'dumbbell' },
            'face pull': { cat: 'pull', equip: 'cable_body' },
            'shrugs': { cat: 'pull', equip: 'dumbbell' }
        };

        const DEFAULT_EXERCISES = [
            { id: 'ex_1', name: 'بنش بريس مستوي بالبار (Barbell Bench Press)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_2', name: 'بنش بريس مائل بالبار (Incline Barbell Bench Press)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_3', name: 'ضغط صدر بالدمبل مستوي (Flat Dumbbell Bench Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_4', name: 'ضغط صدر بالدمبل مائل (Incline Dumbbell Bench Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_5', name: 'ضغط صدر بالدمبل سفلي (Decline Dumbbell Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_6', name: 'تفتيح صدر بالدمبل (Dumbbell Flyes)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_7', name: 'ضغط صدر بالماكينة (Chest Press Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_8', name: 'ضغط صدر مائل بالماكينة (Incline Chest Press Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_9', name: 'تفتيح صدر جهاز الفراشة (Pec Deck / Fly Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_10', name: 'سحب كيبل متقاطع للصدر (Cable Crossover)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_11', name: 'ضغط أكتاف بالبار واقف (Overhead Barbell Press)', category: 'push', type: 'weights', equip: 'barbell' },
            { id: 'ex_12', name: 'ضغط أكتاف بالدمبل جالس (Seated Dumbbell Shoulder Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_13', name: 'ضغط أكتاف أرنولد (Arnold Press)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_14', name: 'ضغط أكتاف ماكينة (Shoulder Press Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_15', name: 'رفرفة أكتاف جانبي بالدمبل (Dumbbell Lateral Raise)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_16', name: 'رفرفة أكتاف جانبي كيبل (Cable Lateral Raise)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_17', name: 'رفرفة أكتاف جانبي جهاز (Lateral Raise Machine)', category: 'push', type: 'weights', equip: 'machine' },
            { id: 'ex_18', name: 'رفرفة أمامي بالدمبل (Dumbbell Front Raise)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_19', name: 'متوازي (Dips)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_20', name: 'تمديد ترايسيبس بالكيبل (Cable Triceps Pushdown)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_21', name: 'ترايسيبس كيبل بالحبل (Rope Triceps Pushdown)', category: 'push', type: 'weights', equip: 'cable_body' },
            { id: 'ex_22', name: 'ترايسيبس بالدمبل خلف الرأس (Dumbbell Overhead Extension)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_23', name: 'ترايسيبس كيك باك بالدمبل (Dumbbell Kickbacks)', category: 'push', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_24', name: 'سحب ظهر عريض عالي (Lat Pulldown Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_25', name: 'سحب ظهر قبضة ضيقة (Close-Grip Lat Pulldown)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_26', name: 'سحب ظهر أرضي كيبل (Seated Cable Row)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_27', name: 'سحب ظهر فردي بالدمبل (Single-Arm Dumbbell Row)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_28', name: 'سحب ظهر بالبار (Barbell Bent-Over Row)', category: 'pull', type: 'weights', equip: 'barbell' },
            { id: 'ex_29', name: 'جهاز T-Bar Row', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_30', name: 'جهاز سحب ظهر علوي (High Row Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_31', name: 'عقلة (Pull-ups / Chin-ups)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_32', name: 'جهاز العقلة المساعد (Assisted Pull-Up Machine)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_33', name: 'بلوفر بالدمبل (Dumbbell Pullover)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_34', name: 'رفرفة أكتاف خلفي جهاز (Reverse Pec Deck)', category: 'pull', type: 'weights', equip: 'machine' },
            { id: 'ex_35', name: 'رفرفة خلفي بالدمبل (Rear Delt Dumbbell Fly)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_36', name: 'سحب كيبل للوجه - أكتاف خلفية (Cable Face Pull)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_37', name: 'هز أكتاف / ترابيس بالدمبل (Dumbbell Shrugs)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_38', name: 'مرجحة بايسبس بالبار (Barbell Biceps Curl)', category: 'pull', type: 'weights', equip: 'barbell' },
            { id: 'ex_39', name: 'مرجحة بايسبس بالدمبل (Dumbbell Biceps Curl)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_40', name: 'مرجحة بايسبس هامر / مطرقة (Dumbbell Hammer Curl)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_41', name: 'مرجحة بايسبس على بنش مائل (Incline Dumbbell Curl)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_42', name: 'مرجحة بايسبس بالكيبل (Cable Biceps Curl)', category: 'pull', type: 'weights', equip: 'cable_body' },
            { id: 'ex_43', name: 'مرجحة بايسبس تركيز (Concentration Curl)', category: 'pull', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_44', name: 'سكوات بالبار (Barbell Squat)', category: 'legs', type: 'weights', equip: 'barbell' },
            { id: 'ex_45', name: 'سكوات على جهاز السميث (Smith Machine Squat)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_46', name: 'هاك سكوات ماكينة (Hack Squat Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_47', name: 'مكبس أرجل (Leg Press Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_48', name: 'سكوات كوب بالدمبل (Dumbbell Goblet Squat)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_49', name: 'جهاز تمديد الأرجل أمامي (Leg Extension Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_50', name: 'جهاز ثني الأرجل خلفي جالس (Seated Leg Curl)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_51', name: 'جهاز ثني الأرجل خلفي مستلقي (Lying Leg Curl)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_52', name: 'ديدليفت روماني بالبار (Barbell RDL)', category: 'legs', type: 'weights', equip: 'barbell' },
            { id: 'ex_53', name: 'ديدليفت روماني بالدمبل (Dumbbell RDL)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_54', name: 'طعن / لانجز بالدمبل (Dumbbell Lunges)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_55', name: 'سكوات بلغاري بالدمبل (Bulgarian Split Squat)', category: 'legs', type: 'weights', equip: 'dumbbell' },
            { id: 'ex_56', name: 'جهاز ضم وإبعاد الفخذ (Abductor / Adductor Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_57', name: 'جهاز هيب ثرست للمقعدة (Hip Thrust Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_58', name: 'جهاز سمانة واقف (Standing Calf Raise Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_59', name: 'جهاز سمانة جالس (Seated Calf Raise Machine)', category: 'legs', type: 'weights', equip: 'machine' },
            { id: 'ex_60', name: 'طحن معدة (Crunches)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_61', name: 'رفع الأرجل معلق (Hanging Leg Raise)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_62', name: 'تمرين البلانك (Plank)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_63', name: 'طحن معدة بالكيبل (Cable Crunch)', category: 'abs', type: 'weights', equip: 'cable_body' },
            { id: 'ex_64', name: 'جهاز المشي (Treadmill)', category: 'cardio', type: 'treadmill', equip: 'cardio' },
            { id: 'ex_65', name: 'دراجة تمارين ثابتة (Stationary Bike)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' },
            { id: 'ex_66', name: 'جهاز الغزالة / أوبتكال (Elliptical Trainer)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' },
            { id: 'ex_67', name: 'جهاز سلالم الدرج (Stair Master)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' },
            { id: 'ex_68', name: 'جهاز التجديف (Rowing Machine)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' },
            { id: 'ex_69', name: 'دراجة هوائية (Air Bike)', category: 'cardio', type: 'bike_elliptical', equip: 'cardio' }
        ];

        const CATEGORY_NAMES = { push: 'دفع 🏋️', pull: 'سحب 🧗', legs: 'أرجل 🦵', abs: 'بطن 🧱', cardio: 'كارديو 🏃' };
        const EQUIP_NAMES = { barbell: 'بار 🏋️‍♂️', dumbbell: 'دمبل 🏋️‍♀️', machine: 'أجهزة 🤖', cable_body: 'كابل/وزن جسم 🦾', cardio: 'كارديو 🏃‍♂️' };

        let state = {
            profile: { id: 'user_profile', name: '', weight: '', height: '', waist: '', age: '', fat: '', muscle: '', water: '', isMan: true, activityFactor: 1.375, history: [] },
            exercises: [],
            logs: [],
            sessions: []
        };

        let restTimerInterval = null;
        let chartInstance = null;
        let currentSplit = 'ppl';
        let currentFilterCat = 'all';
        let currentFilterEquip = 'all';
        let activeWeightUnit = 'kg';
        let activeSetType = 'normal';
        let activeRIR = null;
        let activeLoadMode = 'external';
        let lastPerfData = [];
        let logsRenderLimit = 15;
        let activePresetFilterIds = null;
        let chartMetricMode = 'actual'; // 'actual' = actual weight lifted, '1rm' = theoretical 1RM
        let activeSessionId = null;
        let sessionTimerInterval = null;

        function calculate1RM(weight, reps) {
            const w = parseFloat(weight) || 0;
            const r = Number(reps) || 1;
            if (!w || !Number.isInteger(r) || r < 1 || r > 15) return null;
            if (r === 1) return w;
            return Math.round(w * (1 + (r / 30)) * 10) / 10;
        }

        function get1RMLabel(weight, reps) {
            const value = calculate1RM(weight, reps);
            if (value === null) return 'غير مناسب لهذا النطاق';
            return `${value} كجم${parseInt(reps) > 10 ? ' (دقة منخفضة)' : ''}`;
        }

        function validateAndClamp(rawVal, min, max, defaultVal) {
            let num = parseFloat(rawVal);
            if (!Number.isFinite(num)) return defaultVal;
            if (num < min) return min;
            if (num > max) return max;
            return Math.round(num * 1000) / 1000;
        }

        async function loadStateFromDB() {
            state = await GymStorage.load(state);
            const ids = new Set(state.exercises.map(ex => ex.id));
            const missing = DEFAULT_EXERCISES.filter(ex => !ids.has(ex.id));
            if (missing.length) { state.exercises.push(...missing); await GymStorage.save(state); }
            restoreActiveSession();
        }

        function calculateCalories(type, data) {
            const userWeight = parseFloat(data.bodyWeightKgAtLog) || parseFloat(state.profile.weight) || 75;
            let netCalories = 0;

            if (type === 'weights') {
                // Calories for resistance training are estimated once per completed
                // session from duration and overall effort, never from kilograms lifted.
                return 0;

            } else if (type === 'treadmill') {
                const speedKmH = parseFloat(data.speed) || 6.0;
                const inclineLevel = Number.isFinite(Number(data.incline)) ? Number(data.incline) : 1.0;
                const durationMins = parseFloat(data.duration) || 15;
                const speedMMin = speedKmH * (1000 / 60);
                const inclineFrac = inclineLevel / 100;

                const movement = data.movement === 'running' ? 'running' : 'walking';
                let vo2 = movement === 'walking'
                    ? 3.5 + (0.1 * speedMMin) + (1.8 * speedMMin * inclineFrac)
                    : 3.5 + (0.2 * speedMMin) + (0.9 * speedMMin * inclineFrac);

                const netVO2 = Math.max(vo2 - 3.5, 0.5);
                netCalories = ((netVO2 * userWeight) / 200) * durationMins;

            } else if (type === 'bike_elliptical') {
                const durationMins = parseFloat(data.duration) || 15;
                const intensity = ['light', 'moderate', 'vigorous'].includes(data.intensity) ? data.intensity : 'moderate';
                const machine = data.machine || 'bike';
                const metTable = {
                    bike: { light: 4.0, moderate: 6.8, vigorous: 10.0 },
                    elliptical: { light: 5.0, moderate: 7.0, vigorous: 9.0 },
                    stairs: { light: 6.0, moderate: 8.8, vigorous: 11.0 },
                    rowing: { light: 4.8, moderate: 7.0, vigorous: 12.0 },
                    airbike: { light: 6.0, moderate: 9.0, vigorous: 12.0 }
                };
                let grossMET = (metTable[machine] || metTable.bike)[intensity];
                const watts = parseFloat(data.watts);
                if (Number.isFinite(watts) && watts > 0 && machine === 'bike') {
                    const cyclingVO2 = 7 + ((1.8 * watts * 6.12) / userWeight);
                    grossMET = Math.max(3, Math.min(16, cyclingVO2 / 3.5));
                }
                const netMET = Math.max(grossMET - 1.0, 1.0);
                netCalories = netMET * userWeight * (durationMins / 60);
            }

            return Math.round(netCalories * 10) / 10;
        }

        function estimateWeightSessionCalories(session, sessionLogs) {
            const totalMinutes = Math.max(0, ((session.endedAt || Date.now()) - session.startedAt) / 60000);
            const cardioMinutes = sessionLogs.filter(l => l.type !== 'weights').reduce((n,l) => n + (Number(l.duration) || 0), 0);
            const durationMins = Math.max(0, totalMinutes - cardioMinutes);
            const working = sessionLogs.filter(l => l.type === 'weights' && l.setType !== 'warmup');
            if (!working.length) return 0;
            const rirValues = working.filter(l => l.rir !== null && l.rir !== undefined && l.rir !== '').map(l => Number(l.rir)).filter(Number.isFinite);
            const averageRir = rirValues.length ? rirValues.reduce((a, b) => a + b, 0) / rirValues.length : 2;
            const grossMET = averageRir <= 1 ? 6.0 : averageRir <= 2 ? 5.0 : 3.5;
            const netMET = Math.max(grossMET - 1, 1);
            const userWeight = parseFloat(session.bodyWeightKgAtStart) || parseFloat(sessionLogs.find(l => l.bodyWeightKgAtLog)?.bodyWeightKgAtLog) || 75;
            return Math.round(netMET * userWeight * (durationMins / 60) * 10) / 10;
        }

        async function refreshCompletedSessionSummary(sessionId) {
            const session = state.sessions.find(s => s.id === sessionId && s.status === 'completed');
            if (!session) return;
            const sessionLogs = state.logs.filter(l => l.sessionId === session.id);
            const workingLogs = sessionLogs.filter(l => l.type === 'weights' && l.setType !== 'warmup');
            session.estimatedCalories = estimateWeightSessionCalories(session, sessionLogs);
            session.cardioCalories = sessionLogs.filter(l => l.type !== 'weights').reduce((n,l) => n + (Number(l.calories) || 0), 0);
            session.totalEstimatedCalories = Math.round((session.estimatedCalories + session.cardioCalories) * 10) / 10;
            session.totalVolumeKg = workingLogs.reduce((sum, l) => sum + getVolumeLoadKg(l) * (Number(l.reps) || 1), 0);
            session.workingSets = workingLogs.length;
            session.exerciseIds = [...new Set(sessionLogs.map(l => l.exerciseId))];
            session.editedAt = Date.now();
        }

        const ROUTINE_LABELS = {
            free: 'جلسة حرة', ppl_push: 'دفع (Push)', ppl_pull: 'سحب (Pull)',
            ppl_legs: 'أرجل (Legs)', ul_upper: 'علوي (Upper)', ul_lower: 'سفلي (Lower)'
        };

        function getActiveSession() {
            return state.sessions.find(s => s.id === activeSessionId && s.status === 'active') || null;
        }

        async function startWorkoutSession(routineOverride) {
            if (getActiveSession()) {
                showToast('لديك جلسة نشطة بالفعل');
                return getActiveSession();
            }
            const routine = routineOverride || document.getElementById('session-routine-select').value || 'free';
            const session = {
                id: uniqueId('session'),
                schemaVersion: DATA_SCHEMA_VERSION,
                name: ROUTINE_LABELS[routine] || 'جلسة حرة',
                routine,
                date: getLocalDateString(),
                startedAt: Date.now(),
                endedAt: null,
                status: 'active',
                estimatedCalories: 0,
                bodyWeightKgAtStart: parseFloat(state.profile.weight) || 75
            };
            state.sessions.push(session);
            activeSessionId = session.id;

            await dbSaveAll('sessions', state.sessions);
            if (ROUTINE_PRESETS[routine]) loadPresetRoutine(routine);
            updateSessionUI();
            showToast(`بدأت ${session.name} 💪`);
            return session;
        }

        async function ensureActiveSession() {
            return getActiveSession() || startWorkoutSession('free');
        }

        async function finishWorkoutSession() {
            const session = getActiveSession();
            if (!session) return;
            const elapsed = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
            const answer = window.prompt('مدة الجلسة الفعلية بالدقائق (تشمل الراحة والكارديو):', String(elapsed));
            if (answer === null) return;
            const duration = Number(answer);
            if (!Number.isFinite(duration) || duration < 1 || duration > elapsed + 1440) throw Error('أدخل مدة صحيحة بالدقائق');
            session.endedAt = Date.now();
            session.startedAt = session.endedAt - duration * 60000;
            session.status = 'completed';
            const sessionLogs = state.logs.filter(l => l.sessionId === session.id);
            const cardioMinutes = sessionLogs.filter(l => l.type !== 'weights').reduce((n,l) => n + (Number(l.duration) || 0), 0);
            if (cardioMinutes > duration) throw Error('مدة الكارديو المسجلة أكبر من مدة الجلسة. صحح المدة أو تسجيل الكارديو.');
            const weightLogs = sessionLogs.filter(l => l.type === 'weights');
            const workingLogs = weightLogs.filter(l => l.setType !== 'warmup');
            session.estimatedCalories = estimateWeightSessionCalories(session, sessionLogs);
            session.cardioCalories = sessionLogs.filter(l => l.type !== 'weights').reduce((n,l) => n + (Number(l.calories) || 0), 0);
            session.totalEstimatedCalories = Math.round((session.estimatedCalories + session.cardioCalories) * 10) / 10;
            session.totalVolumeKg = workingLogs.reduce((sum, l) => sum + getVolumeLoadKg(l) * (Number(l.reps) || 1), 0);
            session.workingSets = workingLogs.length;
            session.exerciseIds = [...new Set(sessionLogs.map(l => l.exerciseId))];
            session.editedAt = Date.now();
            await dbSaveAll('sessions', state.sessions);
            activeSessionId = null;
            stopRestTimer();

            updateSessionUI();
            updateTopHeaderStats();
            const durationLabel = Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000));
            const rirValues = workingLogs.filter(l => l.rir !== null && l.rir !== undefined && l.rir !== '').map(l => Number(l.rir)).filter(Number.isFinite);
            const avgRir = rirValues.length ? (rirValues.reduce((a, b) => a + b, 0) / rirValues.length).toFixed(1) : 'غير محدد';
            const validOneRms = workingLogs.filter(l => l.loadMode !== 'timed').map(l => calculate1RM(getProgressWeightKg(l), l.reps)).filter(Number.isFinite);
            const bestOneRm = validOneRms.length ? Math.max(...validOneRms) + ' كجم' : 'غير متاح';
            showModal({
                title: `ملخص ${session.name} ✅`,
                message: `المدة: ${durationLabel} دقيقة | الجولات الفعلية: ${workingLogs.length} | الحجم الفعلي: ${(session.totalVolumeKg / 1000).toFixed(2)} طن | متوسط RIR: ${avgRir} | أعلى 1RM مسجل بين التمارين: ${bestOneRm} | السعرات التقديرية للحديد والكارديو: ${session.totalEstimatedCalories}`,
                confirmText: 'تم', cancelText: 'إغلاق'
            });
        }

        function getPreviousCompletedSession() {
            return state.sessions.filter(s => s.status === 'completed').sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))[0] || null;
        }

        async function copyPreviousSession() {
            const previous = getPreviousCompletedSession();
            if (!previous) {
                // Legacy data has no session IDs, so treat the last logged date as one session.
                const dates = [...new Set(state.logs.filter(l => l.type === 'weights').map(l => l.date))].sort().reverse();
                if (!dates.length) return showToast('لا توجد جلسة سابقة لنسخها');
                const legacyLogs = state.logs.filter(l => l.type === 'weights' && l.date === dates[0]);
                activePresetFilterIds = [...new Set(legacyLogs.map(l => l.exerciseId))];
                renderExerciseDropdown();
                renderCopiedSessionPlan(legacyLogs, `جلسة ${dates[0]}`);
                if (!getActiveSession()) await startWorkoutSession('free');
                return;
            }
            const previousLogs = state.logs.filter(l => l.sessionId === previous.id && l.type === 'weights');
            activePresetFilterIds = [...new Set(previousLogs.map(l => l.exerciseId))];
            renderExerciseDropdown();
            renderCopiedSessionPlan(previousLogs, previous.name);
            if (!getActiveSession()) await startWorkoutSession(previous.routine || 'free');
            activePresetFilterIds = [...new Set(previousLogs.map(l => l.exerciseId))];
            renderExerciseDropdown();
            const active = getActiveSession();
            if (active) {
                active.copiedFromSessionId = previous.id;
                await dbSaveAll('sessions', state.sessions);
            }
        }

        function renderCopiedSessionPlan(logs, title) {
            const container = document.getElementById('copied-session-plan');
            const grouped = Object.create(null);
            logs.forEach(l => {
                if (!grouped[l.exerciseName]) grouped[l.exerciseName] = [];
                const unit = l.unit === 'lbs' ? 'lb' : 'kg';
                if (l.loadMode === 'timed') { grouped[l.exerciseName].push(`${Number(l.durationSeconds)||0} ثانية`); return; }
                grouped[l.exerciseName].push(`${l.displayWeight ?? getCanonicalWeightKg(l)}${unit}×${l.reps}`);
            });
            container.innerHTML = `<strong class="text-cyan-300">${escapeHTML(title)}:</strong> ` + Object.entries(grouped).map(([name, sets]) => `${escapeHTML(name)}: ${escapeHTML(sets.join(' · '))}`).join('<br>');
            container.classList.remove('hidden');
            showToast(`تم تحميل ${Object.keys(grouped).length} تمارين من الجلسة السابقة 📋`);
        }

        function updateSessionUI() {
            const session = getActiveSession();
            const card = document.getElementById('workout-session-card');
            const title = document.getElementById('active-session-title');
            const meta = document.getElementById('active-session-meta');
            const startBtn = document.getElementById('btn-start-session');
            const finishBtn = document.getElementById('btn-finish-session');
            if (!card) return;
            if (session) {
                card.classList.add('session-active');
                title.textContent = session.name;
                meta.textContent = `بدأت ${new Date(session.startedAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`;
                startBtn.disabled = true;
                finishBtn.disabled = false;
                clearInterval(sessionTimerInterval);
                const tick = () => {
                    const seconds = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
                    document.getElementById('active-session-timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
                };
                tick();
                sessionTimerInterval = setInterval(tick, 1000);
            } else {
                card.classList.remove('session-active');
                title.textContent = 'لا توجد جلسة نشطة';
                meta.textContent = 'ابدأ جلسة ليتم حساب مدتها وملخصها بدقة';
                startBtn.disabled = false;
                finishBtn.disabled = true;
                clearInterval(sessionTimerInterval);
                document.getElementById('active-session-timer').textContent = '00:00';
            }
        }

        function setSplitSystem(split) {
            currentSplit = split;
            currentFilterCat = 'all';
            activePresetFilterIds = null;
            document.getElementById('exercise-search-input').value = '';

            const pplBtn = document.getElementById('split-btn-ppl');
            const ulBtn = document.getElementById('split-btn-ul');

            if (split === 'ppl') {
                pplBtn.className = "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md";
                ulBtn.className = "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-slate-800 text-slate-400 hover:bg-slate-700";
            } else {
                ulBtn.className = "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md";
                pplBtn.className = "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-slate-800 text-slate-400 hover:bg-slate-700";
            }

            renderCategoryTabs();
            renderExerciseDropdown();
        }

        function loadPresetRoutine(routineKey) {
            const exIds = ROUTINE_PRESETS[routineKey];
            if (!exIds) return;

            activePresetFilterIds = exIds;
            renderExerciseDropdown();
            showToast('تم تحميل الروتين الجاهز بنجاح ⚡');
        }

        function resetRoutineFilter() {
            activePresetFilterIds = null;
            renderExerciseDropdown();
            showToast('تم إظهار جميع التمارين 🎯');
        }

        function renderCategoryTabs() {
            const container = document.getElementById('category-tabs-container');
            const fragment = document.createDocumentFragment();

            const categories = currentSplit === 'ppl' ? [
                { id: 'all', label: 'الكل 🎯' },
                { id: 'push', label: 'دفع 🏋️' },
                { id: 'pull', label: 'سحب 🧗' },
                { id: 'legs', label: 'أرجل 🦵' },
                { id: 'abs', label: 'بطن 🧱' },
                { id: 'cardio', label: 'كارديو 🏃' }
            ] : [
                { id: 'all', label: 'الكل 🎯' },
                { id: 'upper', label: 'علوي (Upper 🦾)' },
                { id: 'lower', label: 'سفلي (Lower 🦵)' },
                { id: 'cardio', label: 'كارديو 🏃' }
            ];

            categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.dataset.cat = cat.id;
                btn.className = `cat-btn px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    cat.id === currentFilterCat 
                        ? 'active bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md' 
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`;
                btn.textContent = cat.label;
                fragment.appendChild(btn);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        }

        function setWorkoutCategoryFilter(cat, btnEl) {
            currentFilterCat = cat;
            activePresetFilterIds = null;
            document.getElementById('exercise-search-input').value = '';

            document.querySelectorAll('.cat-btn').forEach(btn => {
                btn.classList.remove('bg-gradient-to-r', 'from-cyan-500', 'to-blue-600', 'text-white', 'shadow-md', 'active');
                btn.classList.add('bg-slate-800/80', 'text-slate-300');
            });
            if (btnEl) {
                btnEl.classList.remove('bg-slate-800/80', 'text-slate-300');
                btnEl.classList.add('bg-gradient-to-r', 'from-cyan-500', 'to-blue-600', 'text-white', 'shadow-md', 'active');
            }

            renderExerciseDropdown();
        }

        function setEquipFilter(equip, btnEl) {
            currentFilterEquip = equip;
            activePresetFilterIds = null;
            document.getElementById('exercise-search-input').value = '';

            document.querySelectorAll('.equip-btn').forEach(btn => {
                btn.className = "equip-btn px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap bg-slate-900 text-slate-400 border border-slate-800";
            });
            if (btnEl) {
                btnEl.className = "equip-btn active px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap bg-cyan-950 text-cyan-300 border border-cyan-800";
            }
            renderExerciseDropdown();
        }

        function renderExerciseDropdown() {
            const dropdown = document.getElementById('exercise-dropdown');
            const searchVal = document.getElementById('exercise-search-input').value.trim().toLowerCase();

            let filtered = state.exercises.filter(e => !e.archived);

            if (activePresetFilterIds) {
                filtered = filtered.filter(e => activePresetFilterIds.includes(e.id));
            } else {
                if (currentFilterCat !== 'all') {
                    if (currentFilterCat === 'upper') filtered = filtered.filter(e => e.category === 'push' || e.category === 'pull');
                    else if (currentFilterCat === 'lower') filtered = filtered.filter(e => e.category === 'legs' || e.category === 'abs');
                    else filtered = filtered.filter(e => e.category === currentFilterCat);
                }
                if (currentFilterEquip !== 'all') filtered = filtered.filter(e => e.equip === currentFilterEquip);
                if (searchVal) filtered = filtered.filter(e => e.name.toLowerCase().includes(searchVal));
            }

            dropdown.innerHTML = '';
            if (filtered.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'لا توجد تمارين تطابق خيارات البحث';
                dropdown.appendChild(opt);
                onExerciseSelectChange();
                return;
            }

            const fragment = document.createDocumentFragment();
            filtered.forEach(ex => {
                const catEmoji = CATEGORY_NAMES[ex.category] || '';
                const opt = document.createElement('option');
                opt.value = ex.id;
                opt.textContent = `${ex.name} (${catEmoji})`;
                fragment.appendChild(opt);
            });

            dropdown.appendChild(fragment);
            onExerciseSelectChange();
        }

        function onExerciseSelectChange() {
            const dropdown = document.getElementById('exercise-dropdown');
            const selectedId = dropdown.value;
            const ex = state.exercises.find(e => e.id === selectedId);

            const formWeights = document.getElementById('form-weights');
            const formTm = document.getElementById('form-treadmill');
            const formBe = document.getElementById('form-bike-elliptical');
            const equipBadge = document.getElementById('selected-exercise-equip-badge');

            formWeights.classList.add('hidden');
            formTm.classList.add('hidden');
            formBe.classList.add('hidden');

            updateLastPerformanceDisplay(selectedId);
            update1RMLiveDisplay();

            if (!ex) {
                equipBadge.textContent = 'غير محدد';
                return;
            }

            equipBadge.textContent = EQUIP_NAMES[ex.equip] || 'أوزان حرة 🏋️‍♂️';

            if (ex.type === 'weights') {
                const recent = state.logs.filter(l => l.exerciseId === ex.id).sort((a,b) => (b.timestamp||0)-(a.timestamp||0))[0];
                const suggestedMode = recent?.loadMode || getDefaultLoadMode(ex);
                const modeSelect = document.getElementById('load-mode-select');
                if (modeSelect && modeSelect.dataset.exerciseId !== ex.id) {
                    modeSelect.dataset.exerciseId = ex.id;
                    modeSelect.value = suggestedMode;
                    setLoadMode(suggestedMode);
                }
            }

            if (ex.type === 'weights') formWeights.classList.remove('hidden');
            else if (ex.type === 'treadmill') formTm.classList.remove('hidden');
            else if (ex.type === 'bike_elliptical') formBe.classList.remove('hidden');
        }

        function update1RMLiveDisplay() {
            const rawWeight = parseFloat(document.getElementById('input-weight').value) || 0;
            const reps = parseInt(document.getElementById('input-reps').value) || 10;
            let weightInKg = activeWeightUnit === 'lbs' ? rawWeight / 2.20462 : rawWeight;
            const span = document.getElementById('val-1rm-live');
            if (!span) return;
            if (activeLoadMode === 'timed') span.textContent = 'غير مطبق للتمرين الزمني';
            else {
                const body = Number(state.profile.weight) || 0;
                if (activeLoadMode === 'bodyweight') weightInKg = body;
                if (activeLoadMode === 'added') weightInKg += body;
                if (activeLoadMode === 'assisted') weightInKg = Math.max(0, body - weightInKg);
                span.textContent = get1RMLabel(weightInKg, reps);
            }
        }

        function getDefaultLoadMode(exercise) {
            if (!exercise) return 'external';
            if (exercise.id === 'ex_62') return 'timed';
            if (exercise.id === 'ex_32') return 'assisted';
            if (['ex_19', 'ex_31', 'ex_60', 'ex_61'].includes(exercise.id)) return 'bodyweight';
            if (['ex_22','ex_33','ex_48'].includes(exercise.id)) return 'external';
            if (exercise.equip === 'dumbbell') return 'per_hand';
            return 'external';
        }

        function setLoadMode(mode) {
            activeLoadMode = mode || 'external';
            const select = document.getElementById('load-mode-select');
            if (select) select.value = activeLoadMode;
            const hints = {
                external: 'يسجل الوزن المدخل كما هو ويستخدمه في القوة والحجم.',
                per_hand: 'الرقم هو وزن الدمبل الواحد؛ الحجم التدريبي يحسب اليدين ×2.',
                bodyweight: 'يستخدم وزن جسمك من البروفايل. خانة الوزن يمكن تركها صفرًا.',
                added: 'أدخل الوزن الإضافي فقط؛ الحمل الفعلي = وزن الجسم + الوزن الإضافي.',
                assisted: 'أدخل مقدار المساعدة؛ التقدم يتحسن عندما تقل المساعدة.',
                timed: 'للبلانك والتمارين الزمنية؛ يسجل الثواني بدل العدات ولا يحسب 1RM.'
            };
            document.getElementById('load-mode-hint').textContent = hints[activeLoadMode] || hints.external;
            document.getElementById('timed-duration-field').classList.toggle('hidden', activeLoadMode !== 'timed');
            document.getElementById('reps-field-wrapper').classList.toggle('hidden', activeLoadMode === 'timed');
            const weightInput = document.getElementById('input-weight');
            weightInput.disabled = activeLoadMode === 'bodyweight' || activeLoadMode === 'timed';
            if (activeLoadMode === 'bodyweight' || activeLoadMode === 'timed') weightInput.value = 0;
            updateWeightConvertedDisplay();
            update1RMLiveDisplay();
        }

        function updateLastPerformanceDisplay(exerciseId) {
            const textEl = document.getElementById('last-performance-text');
            const copyBtn = document.getElementById('btn-copy-last-perf');

            if (!exerciseId) {
                textEl.textContent = 'اختر تمرين للعرض';
                copyBtn.classList.add('hidden');
                lastPerfData = [];
                return;
            }

            const exLogs = state.logs.filter(l => l.exerciseId === exerciseId && l.type === 'weights' && (!activeSessionId || l.sessionId !== activeSessionId)).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

            if (exLogs.length === 0) {
                textEl.textContent = 'لا يوجد أداء سابق مسجل لهذا التمرين';
                textEl.className = 'text-xs font-medium text-slate-400';
                copyBtn.classList.add('hidden');
                lastPerfData = [];
            } else {
                const latest = exLogs[exLogs.length - 1];
                const latestGroupKey = latest.sessionId || latest.date;
                lastPerfData = exLogs.filter(l => (l.sessionId || l.date) === latestGroupKey);
                textEl.innerHTML = lastPerfData.map(set => {
                    if (set.loadMode === 'timed') return `<span>${Number(set.durationSeconds) || 0} ثانية</span>`;
                    const unitStr = set.unit === 'lbs' ? 'lb' : 'kg';
                    const weightVal = set.displayWeight ?? getCanonicalWeightKg(set);
                    const rirText = set.rir !== undefined && set.rir !== null ? ` · RIR ${set.rir}` : '';
                    return `<span class="inline-block ml-2"><strong class="text-cyan-300">${escapeHTML(String(weightVal))}${unitStr}</strong> × ${escapeHTML(String(set.reps))}${escapeHTML(rirText)}</span>`;
                }).join('');
                textEl.className = 'text-xs font-bold text-cyan-300';
                copyBtn.classList.remove('hidden');
            }
        }

        function copyLastPerformance() {
            if (!lastPerfData.length) return;
            const firstWorkingSet = lastPerfData.find(l => l.setType !== 'warmup') || lastPerfData[0];
            if (firstWorkingSet.unit && firstWorkingSet.unit !== activeWeightUnit) {
                setWeightUnit(firstWorkingSet.unit);
            }
            const wVal = firstWorkingSet.displayWeight ?? getCanonicalWeightKg(firstWorkingSet);
            document.getElementById('input-weight').value = wVal;
            document.getElementById('input-reps').value = firstWorkingSet.reps;
            document.getElementById('val-reps-display').textContent = firstWorkingSet.reps;
            if (firstWorkingSet.loadMode) setLoadMode(firstWorkingSet.loadMode);
            if (firstWorkingSet.loadMode === 'timed') document.getElementById('input-duration-sec').value = firstWorkingSet.durationSeconds || 60;
            setSetType(firstWorkingSet.setType || 'normal', document.querySelector('[data-settype="' + (firstWorkingSet.setType || 'normal') + '"]'));
            if (firstWorkingSet.rir == null) setRIR('', document.querySelector('[data-rir=""]'));
            if (firstWorkingSet.rir !== undefined && firstWorkingSet.rir !== null) {
                const rirBtn = document.querySelector(`.rir-btn[data-rir="${firstWorkingSet.rir}"]`);
                setRIR(String(firstWorkingSet.rir), rirBtn);
            }

            updateWeightConvertedDisplay();
            update1RMLiveDisplay();
            showToast('تم نسخ أداء الجلسة السابقة 📋');
        }

        function setSetType(type, btnEl) {
            activeSetType = type;
            document.querySelectorAll('.set-type-btn').forEach(btn => {
                btn.className = "set-type-btn py-2 px-1 rounded-xl border text-center";
            });
            if (btnEl) btnEl.className = "set-type-btn active py-2 px-1 rounded-xl border text-center";
        }

        function setRIR(rirVal, btnEl) {
            activeRIR = rirVal === '' ? null : parseInt(rirVal);
            document.querySelectorAll('.rir-btn').forEach(btn => {
                btn.className = "rir-btn py-2 rounded-xl border text-center";
            });
            if (btnEl) btnEl.className = "rir-btn active py-2 rounded-xl border text-center";
        }

        function setWeightUnit(unit) {
            if (activeWeightUnit === unit) return;

            const inputWeight = document.getElementById('input-weight');
            const currentVal = parseFloat(inputWeight.value) || 0;

            activeWeightUnit = unit;
            inputWeight.max = unit === 'lbs' ? 2204.62 : 1000;
            const kgBtn = document.getElementById('unit-btn-kg');
            const lbsBtn = document.getElementById('unit-btn-lbs');

            if (unit === 'kg') {
                kgBtn.className = "px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-500 text-white transition-all";
                lbsBtn.className = "px-2 py-0.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-all";
                inputWeight.value = Math.round((currentVal / 2.20462) * 1000) / 1000;
            } else {
                lbsBtn.className = "px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-500 text-white transition-all";
                kgBtn.className = "px-2 py-0.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-all";
                inputWeight.value = Math.round(currentVal * 2.20462 * 1000) / 1000;
            }

            updateWeightConvertedDisplay();
            update1RMLiveDisplay();
        }

        function handleStepperClick(targetInputId, stepDelta) {
            const input = document.getElementById(targetInputId);
            if (!input || input.disabled) return;

            let min = parseFloat(input.min) || 0;
            let max = parseFloat(input.max) || 999;
            let current = parseFloat(input.value) || 0;
            let updated = validateAndClamp(current + stepDelta, min, max, current);

            input.value = updated;

            if (targetInputId === 'input-weight') {
                updateWeightConvertedDisplay();
                update1RMLiveDisplay();
            } else if (targetInputId === 'input-reps') {
                document.getElementById('val-reps-display').textContent = updated;
                update1RMLiveDisplay();
            }
        }

        function updateWeightConvertedDisplay() {
            const inputWeight = document.getElementById('input-weight');
            const val = validateAndClamp(inputWeight.value, 0, activeWeightUnit === 'lbs' ? 2204.62 : 1000, 0);
            inputWeight.value = val;
            
            const convertedSpan = document.getElementById('val-weight-converted');
            if (activeWeightUnit === 'kg') {
                convertedSpan.textContent = `${(val * 2.20462).toFixed(1)} باوند (lbs)`;
            } else {
                convertedSpan.textContent = `${(val / 2.20462).toFixed(1)} كجم (kg)`;
            }
        }

        async function saveSet() {
            const dropdown = document.getElementById('exercise-dropdown');
            const exId = dropdown.value;
            const ex = state.exercises.find(e => e.id === exId);
            if (!ex) return;

            const rawWeight = validateAndClamp(document.getElementById('input-weight').value, 0, activeWeightUnit === 'lbs' ? 2204.62 : 1000, 0);
            const reps = activeLoadMode === 'timed' ? 1 : Math.round(validateAndClamp(document.getElementById('input-reps').value, 1, 150, 10));
            const durationSeconds = activeLoadMode === 'timed' ? validateAndClamp(document.getElementById('input-duration-sec').value, 1, 3600, 60) : null;
            let weightInKg = activeLoadMode === 'timed' ? 0 : activeWeightUnit === 'lbs' ? rawWeight / 2.20462 : rawWeight;
            const bodyWeightKg = parseFloat(state.profile.weight) || 0;
            if (['bodyweight', 'added', 'assisted'].includes(activeLoadMode) && !bodyWeightKg) {
                showToast('أدخل وزن جسمك في البروفايل أولًا لهذا النوع من التمارين');
                return;
            }
            const session = await ensureActiveSession();
            let effectiveLoadKg = weightInKg;
            if (activeLoadMode === 'bodyweight') effectiveLoadKg = bodyWeightKg;
            else if (activeLoadMode === 'added') effectiveLoadKg = bodyWeightKg + weightInKg;
            else if (activeLoadMode === 'assisted') effectiveLoadKg = Math.max(0, bodyWeightKg - weightInKg);
            const volumeLoadKg = activeLoadMode === 'per_hand' ? weightInKg * 2 : effectiveLoadKg;
            const oneRepMax = activeLoadMode === 'timed' ? null : calculate1RM(effectiveLoadKg, reps);
            const calories = calculateCalories('weights', { weight: weightInKg, reps, setType: activeSetType });
            const today = getLocalDateString();

            const logEntry = {
                id: uniqueId('log'),
                schemaVersion: DATA_SCHEMA_VERSION,
                date: today,
                timestamp: Date.now(),
                sessionId: session ? session.id : null,
                exerciseId: ex.id,
                exerciseName: ex.name,
                category: ex.category,
                type: 'weights',
                weight: weightInKg,
                displayWeight: activeLoadMode === 'timed' ? 0 : rawWeight,
                unit: activeWeightUnit,
                reps,
                oneRepMax,
                rir: activeRIR,
                setType: activeSetType,
                loadMode: activeLoadMode,
                bodyWeightKgAtLog: bodyWeightKg || null,
                effectiveLoadKg,
                volumeLoadKg,
                durationSeconds,
                calories,
                calculationVersion: 'v10-session'
            };

            GymData.recalculateWeightLog(logEntry);
            state.logs.push(logEntry);
            await dbSaveAll('logs', state.logs);

            renderTodayLogs();
            updateTopHeaderStats();
            updateLastPerformanceDisplay(ex.id);
            showToast(activeLoadMode === 'timed' ? `تم حفظ ${durationSeconds} ثانية ✔️` : `تم حفظ الجولة (${rawWeight} ${activeWeightUnit === 'lbs' ? 'باوند' : 'كجم'}) ✔️`);

            document.getElementById('logs-date-filter').value = getLocalDateString();
            renderTodayLogs();
            const customRestSecs = parseInt(document.getElementById('rest-timer-duration').value) || 90;
            startRestTimer(customRestSecs, ex.name);
        }

        async function saveCardioSet(cardioType) {
            const dropdown = document.getElementById('exercise-dropdown');
            const exId = dropdown.value;
            const ex = state.exercises.find(e => e.id === exId);
            if (!ex) return;

            const session = await ensureActiveSession();
            const today = getLocalDateString();
            let calories = 0;
            let logData = {
                id: uniqueId('log'),
                schemaVersion: DATA_SCHEMA_VERSION,
                date: today,
                timestamp: Date.now(),
                sessionId: session ? session.id : null,
                exerciseId: ex.id,
                exerciseName: ex.name,
                category: ex.category,
                type: cardioType,
                bodyWeightKgAtLog: parseFloat(state.profile.weight) || 75
            };

            if (cardioType === 'treadmill') {
                const speed = validateAndClamp(document.getElementById('input-tm-speed').value, 1, 25, 5.5);
                const incline = validateAndClamp(document.getElementById('input-tm-incline').value, 0, 25, 1.0);
                const duration = validateAndClamp(document.getElementById('input-tm-duration').value, 1, 180, 20);
                const movement = document.getElementById('tm-movement-type').value;
                calories = calculateCalories('treadmill', { speed, incline, duration, movement, bodyWeightKgAtLog: logData.bodyWeightKgAtLog });
                logData = { ...logData, speed, incline, duration, movement, calories, caloriesEstimated: true };
            } else {
                const duration = validateAndClamp(document.getElementById('input-be-duration').value, 1, 180, 15);
                const intensity = document.getElementById('cardio-intensity-select').value;
                const wattsRaw = parseFloat(document.getElementById('input-cardio-watts').value);
                const watts = Number.isFinite(wattsRaw) ? wattsRaw : null;
                const machineMap = { ex_65: 'bike', ex_66: 'elliptical', ex_67: 'stairs', ex_68: 'rowing', ex_69: 'airbike' };
                const machine = ex.machine || machineMap[ex.id] || 'bike';
                calories = calculateCalories('bike_elliptical', { machine, intensity, watts, duration, bodyWeightKgAtLog: logData.bodyWeightKgAtLog });
                logData = { ...logData, machine, intensity, watts, duration, calories, caloriesEstimated: true };
            }

            state.logs.push(logData);
            await dbSaveAll('logs', state.logs);

            renderTodayLogs();
            updateTopHeaderStats();
            document.getElementById('logs-date-filter').value = getLocalDateString();renderTodayLogs();
            showToast('تم حفظ تمرين الكارديو 🏃');
        }

        function deleteLogItem(logId) {
            showModal({
                title: 'حذف الجولة 🗑️',
                message: 'هل أنت متاكد من حذف هذه الجولة؟',
                confirmText: 'احذف',
                cancelText: 'إلغاء',
                onConfirm: async () => {
                    const deletedLog = state.logs.find(l => l.id === logId);
                    state.logs = state.logs.filter(l => l.id !== logId);
                    if (deletedLog && deletedLog.sessionId) await refreshCompletedSessionSummary(deletedLog.sessionId);
                    await GymStorage.save(state);
                    renderTodayLogs();
                    updateTopHeaderStats();
                    showToast('تم الحذف');
                }
            });
        }

        function openEditLog(logId) {
            const log = state.logs.find(l => l.id === logId);
            if (!log) return;
            document.getElementById('edit-log-id').value = logId;
            const isWeight = log.type === 'weights';
            document.getElementById('edit-weight-fields').classList.toggle('hidden', !isWeight);
            document.getElementById('edit-cardio-fields').classList.toggle('hidden', isWeight);
            if (isWeight) {
                const isTimed = log.loadMode === 'timed';
                document.getElementById('edit-log-weight-row').classList.toggle('hidden', isTimed);
                document.getElementById('edit-log-reps-row').classList.toggle('hidden', isTimed);
                document.getElementById('edit-log-rir-row').classList.toggle('hidden', isTimed);
                document.getElementById('edit-log-seconds-row').classList.toggle('hidden', !isTimed);
                document.getElementById('edit-log-weight').max = log.unit === 'lbs' ? 2204.62 : 1000;
                document.getElementById('edit-log-weight').value = log.displayWeight ?? getCanonicalWeightKg(log);
                document.getElementById('edit-log-reps').value = log.reps || 1;
                document.getElementById('edit-log-rir').value = log.rir ?? '';
                document.getElementById('edit-log-seconds').value = log.durationSeconds || 60;
            } else {
                document.getElementById('edit-log-duration').value = log.duration || 1;
            }
            document.getElementById('edit-log-modal').classList.remove('hidden');
            document.getElementById('btn-cancel-edit-log').focus();
        }

        async function saveEditedLog() {
            const id = document.getElementById('edit-log-id').value;
            const log = state.logs.find(l => l.id === id);
            if (!log) return;
            if (log.type === 'weights') {
                if (log.loadMode === 'timed') {
                    log.durationSeconds = validateAndClamp(document.getElementById('edit-log-seconds').value, 1, 3600, log.durationSeconds || 60);
                } else {
                const displayWeight = validateAndClamp(document.getElementById('edit-log-weight').value, 0, log.unit === 'lbs' ? 2204.62 : 1000, 0);
                const reps = validateAndClamp(document.getElementById('edit-log-reps').value, 1, 150, 1);
                if (!Number.isInteger(reps) && reps !== Number(log.reps)) throw Error('أدخل عدات صحيحة؛ القيم الكسرية القديمة يمكن الاحتفاظ بها دون تغيير');
                if (!Number.isInteger(reps)) log.legacyFractionalReps = true;
                const rirRaw = document.getElementById('edit-log-rir').value;
                const weightKg = log.unit === 'lbs' ? Math.round((displayWeight / 2.20462) * 10) / 10 : displayWeight;
                const bodyWeightKg = parseFloat(log.bodyWeightKgAtLog) || (log.loadMode === 'bodyweight' ? Number(log.effectiveLoadKg) : log.loadMode === 'added' ? Number(log.effectiveLoadKg) - getCanonicalWeightKg(log) : log.loadMode === 'assisted' ? Number(log.effectiveLoadKg) + getCanonicalWeightKg(log) : 0);
                if (bodyWeightKg) log.bodyWeightKgAtLog = bodyWeightKg;
                let effectiveLoadKg = weightKg;
                if (log.loadMode === 'bodyweight') effectiveLoadKg = bodyWeightKg;
                else if (log.loadMode === 'added') effectiveLoadKg = bodyWeightKg + weightKg;
                else if (log.loadMode === 'assisted') effectiveLoadKg = Math.max(0, bodyWeightKg - weightKg);
                log.displayWeight = displayWeight;
                log.weight = weightKg;
                log.reps = reps;
                log.rir = rirRaw === '' ? null : validateAndClamp(rirRaw, 0, 4, null);
                log.effectiveLoadKg = effectiveLoadKg;
                log.volumeLoadKg = log.loadMode === 'per_hand' ? weightKg * 2 : effectiveLoadKg;
                log.oneRepMax = log.loadMode === 'timed' ? null : calculate1RM(effectiveLoadKg, reps);
                }
            } else {
                const oldDuration=log.duration;
                const oldCalories=log.calories;
                const historicalWeight=log.bodyWeightKgAtLog;
                log.duration = validateAndClamp(document.getElementById('edit-log-duration').value, 1, 300, log.duration || 1);
                if (!historicalWeight) log.calories=Math.round((oldCalories||0)*log.duration/oldDuration*10)/10;
                else if (log.type === 'treadmill') log.calories = calculateCalories('treadmill', log);
                else log.calories = calculateCalories('bike_elliptical', log);
            }
            GymData.recalculateWeightLog(log);
            log.editedAt = Date.now();
            if (log.sessionId) await refreshCompletedSessionSummary(log.sessionId);
            await GymStorage.save(state);
            document.getElementById('edit-log-modal').classList.add('hidden');
            renderTodayLogs();
            updateTopHeaderStats();
            showToast('تم تعديل التسجيل بدون إنشاء سجل مكرر');
        }

        function renderTodayLogs() {
            const container = document.getElementById('today-logs-container');
            const loadMoreWrapper = document.getElementById('lazy-logs-load-more');
            const today = getLocalDateString();
            const selectedDate = document.getElementById('logs-date-filter').value || today;
            const todayLogs = state.logs.filter(l => l.date === selectedDate).sort((a,b) => (b.timestamp||0)-(a.timestamp||0));

            document.getElementById('today-sets-count').textContent = `${todayLogs.length} جولات`;

            if (todayLogs.length === 0) {
                container.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs glass-card border border-slate-800">لا توجد جولات مسجلة في هذا التاريخ. 💪</div>`;
                loadMoreWrapper.classList.add('hidden');
                return;
            }

            const visibleLogs = todayLogs.slice(0, logsRenderLimit);
            loadMoreWrapper.classList.toggle('hidden', todayLogs.length <= logsRenderLimit);

            const fragment = document.createDocumentFragment();
            visibleLogs.forEach(log => {
                const item = document.createElement('div');
                item.className = 'glass-card p-3 flex justify-between items-center border border-slate-800 hover:border-slate-700 transition';
                
                let detailText = '';
                if (log.type === 'weights') {
                    const unitLabel = log.unit === 'lbs' ? 'باوند' : 'كجم';
                    const printWeight = log.displayWeight ?? getCanonicalWeightKg(log);
                    const loadLabel = log.loadMode === 'per_hand' ? ' لكل يد' : log.loadMode === 'assisted' ? ' مساعدة' : log.loadMode === 'added' ? ' إضافي' : '';
                    if (log.loadMode === 'timed') detailText = `<span class="font-bold text-cyan-300">${escapeHTML(String(log.durationSeconds || 0))} ثانية</span>`;
                    else detailText = `<span class="font-bold text-cyan-300">${escapeHTML(String(printWeight))} ${unitLabel}${loadLabel}</span> × <span class="font-bold text-cyan-300">${escapeHTML(String(log.reps))} عدات</span> <span class="text-[10px] text-emerald-400 font-bold">[1RM: ${escapeHTML(get1RMLabel(getProgressWeightKg(log), log.reps))}]</span>`;
                } else {
                    detailText = `<span class="text-cyan-300 font-bold">${log.duration} دقيقة</span>`;
                }

                item.innerHTML = `
                    <div class="space-y-1">
                        <div class="font-bold text-xs text-slate-200">${escapeHTML(log.exerciseName)}</div>
                        <div class="text-xs text-slate-300">${detailText}</div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <div class="text-[10px] font-black text-amber-400">${log.type === 'weights' && ['v9-session','v10-session'].includes(log.calculationVersion) ? 'سعرات ضمن الجلسة' : `${escapeHTML(String(log.calories || 0))}🔥 تقديري`}</div>
                        </div>
                        <button data-action="edit-log" data-id="${escapeHTML(log.id)}" aria-label="تعديل التسجيل" class="text-slate-500 hover:text-cyan-400 p-1.5 transition"><i class="fa-solid fa-pen text-sm"></i></button>
                        <button data-action="delete-log" data-id="${escapeHTML(log.id)}" class="text-slate-500 hover:text-red-400 p-1.5 transition">
                            <i class="fa-solid fa-trash-can text-sm"></i>
                        </button>
                    </div>
                `;
                fragment.appendChild(item);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        }

        function startRestTimer(seconds, exName = '') {
            stopRestTimer();
            restDeadline = {endsAt: Date.now() + seconds * 1000, name: exName};
            try { localStorage.setItem('gym_rest_deadline', JSON.stringify(restDeadline)); } catch { showToast('المؤقت يعمل؛ تعذر حفظه لإعادة فتح الصفحة'); }
            restoreRestTimer();
        }
        let restDeadline = null;
        function restoreRestTimer() {
            clearInterval(restTimerInterval);
            if (!restDeadline) { try { restDeadline=JSON.parse(localStorage.getItem('gym_rest_deadline') || 'null'); } catch {} }
            if (!restDeadline || !Number.isFinite(restDeadline.endsAt)) return;
            const tick = () => {
                const remaining = Math.max(0, Math.ceil((restDeadline.endsAt-Date.now())/1000));
                if (!remaining) {
                    stopRestTimer();
                    if ('vibrate' in navigator) navigator.vibrate([150,100,150]);
                    showToast('انتهى وقت الراحة! حان وقت الجولة التالية 🏋️');
                    return false;
                }
                document.getElementById('rest-timer-widget').classList.remove('hidden');
                document.getElementById('timer-display').textContent = remaining + 's';
                document.getElementById('timer-preset-desc').textContent = restDeadline.name || 'جولة تمرين';
                return true;
            };
            if (tick()) restTimerInterval=setInterval(tick,1000);
        }
        function stopRestTimer() {
            clearInterval(restTimerInterval); restDeadline=null;
            try {localStorage.removeItem('gym_rest_deadline');} catch {}
            document.getElementById('rest-timer-widget').classList.add('hidden');
        }

        function runLocalClassification(cleanName) {
            if (/(رفرفة.*خلف|rear.*delt)/i.test(cleanName)) return {cat:'pull',equip:null};
            if (/(rowing|تجديف|treadmill|مشي|دراجة|elliptical|stair)/i.test(cleanName)) return {cat:'cardio',equip:'cardio'};
            for (const [key, val] of Object.entries(EXERCISE_DICTIONARY).sort((a,b) => b[0].length-a[0].length)) {
                if (cleanName.includes(key)) {
                    return { cat: val.cat, equip: val.equip };
                }
            }

            let cat = null;
            let equip = null;

            if (/(ضغط|صدر|بنش|أكتاف|اكتاف|كتف|ترايسيبس|تراي|متوازي|رفرفة|تفتيح|press|bench|chest|shoulder|tricep|fly|dip|overhead|pec|push)/i.test(cleanName)) cat = 'push';
            else if (/(سحب|ظهر|عقلة|عقله|بايسبس|باي|ترابيس|مطرقة|هامر|رو|بلوفر|وجه|pulldown|row|pull|back|biceps|curl|shrug|chin|lat|face|rear|delt)/i.test(cleanName)) cat = 'pull';
            else if (/(سكوات|أرجل|ارجل|فخذ|سمانة|طعن|مكبس|مقعدة|مؤخرة|هيب|ضم|إبعاد|ابعاد|ضام|ادكشن|ابداكشن|squat|leg|lunge|calf|thrust|extension|curl|adduct|abduct|hip|glute|hamstring|quad|rdl|deadlift)/i.test(cleanName)) cat = 'legs';
            else if (/(بطن|معدة|معده|بلانك|طحن|crunch|plank|abs|core|situp)/i.test(cleanName)) cat = 'abs';
            else if (/(مشي|دراجة|دراجه|سير|غزالة|غزاله|كارديو|سلم|تجديف|treadmill|bike|run|elliptical|stair|rowing|cardio)/i.test(cleanName)) cat = 'cardio';

            if (/(بار|باربل|barbell|ez)/i.test(cleanName)) equip = 'barbell';
            else if (/(دمبل|دمبلز|dumbbell)/i.test(cleanName)) equip = 'dumbbell';
            else if (/(جهاز|ماكينة|ماكينه|سميث|مكبس|machine|smith|adductor|abductor|deck)/i.test(cleanName)) equip = 'machine';
            else if (/(كيبل|كابل|حبل|وزن جسم|cable|body|rope|dip|pullup)/i.test(cleanName)) equip = 'cable_body';
            else if (/(كارديو|تأهيل|cardio)/i.test(cleanName)) equip = 'cardio';

            return { cat, equip };
        }

        function onCustomExerciseInput(val) {
            const cleanName = val.trim().toLowerCase();
            const statusEl = document.getElementById('new-ex-status');
            const submitBtn = document.getElementById('add-ex-submit-btn');
            const catSelect = document.getElementById('new-ex-cat');
            const equipSelect = document.getElementById('new-ex-equip');

            if (!cleanName) {
                statusEl.classList.add('hidden');
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                return;
            }

            const isDuplicate = state.exercises.some(ex => !ex.archived && ex.name.trim().toLowerCase() === cleanName);

            if (isDuplicate) {
                statusEl.className = "text-[11px] font-bold mt-1.5 px-2 py-1 rounded-lg border bg-red-950/80 border-red-800 text-red-300 flex items-center gap-1.5";
                statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark text-red-400"></i> هذا التمرين مضاف مسبقاً في المكتبة!`;
                statusEl.classList.remove('hidden');
                
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
                return;
            } else {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }

            const result = runLocalClassification(cleanName);
            if (result.cat) catSelect.value = result.cat;
            if (result.equip) equipSelect.value = result.equip;

            if (result.cat || result.equip) {
                statusEl.className = "text-[11px] font-bold mt-1.5 px-2 py-1 rounded-lg border bg-cyan-950/80 border-cyan-800 text-cyan-300 flex items-center gap-1.5";
                statusEl.innerHTML = `<i class="fa-solid fa-bolt text-cyan-400"></i> تم تصنيف التمرين تلقائياً بنجاح ⚡`;
                statusEl.classList.remove('hidden');
            } else {
                statusEl.classList.add('hidden');
            }
        }

        async function addNewExercise() {
            const nameInput = document.getElementById('new-ex-name');
            const name = nameInput.value.trim();
            const category = document.getElementById('new-ex-cat').value;
            const equip = document.getElementById('new-ex-equip').value;
            const machine = document.getElementById('new-ex-machine').value;
            const type = (category === 'cardio' || equip === 'cardio') ? (machine === 'treadmill' ? 'treadmill' : 'bike_elliptical') : 'weights';
            if (state.exercises.some(e => !e.archived && e.name.trim().toLowerCase() === name.toLowerCase())) throw Error('التمرين موجود مسبقًا');

            if (!name) {
                showToast('يرجى إدخال اسم التمرين أولاً ⚠️');
                return;
            }

            const newEx = {
                id: uniqueId('ex'),
                name,
                category,
                type,
                equip,
                machine,
                isCustom: true
            };

            state.exercises.push(newEx);
            await dbSaveAll('exercises', state.exercises);

            nameInput.value = '';
            document.getElementById('new-ex-status').classList.add('hidden');
            renderManageExercisesList();
            renderExerciseDropdown();
            showToast('تمت إضافة التمرين المخصص بنجاح! 🎉');
        }

        function deleteExercise(exId) {
            showModal({
                title: 'حذف تمرين مخصص ⚠️',
                message: 'هل أنت متاكد من حذف هذا التمرين المخصص؟ لن يتم حذف الجولات القديمة المسجلة به.',
                confirmText: 'تأكيد الحذف',
                cancelText: 'إلغاء',
                onConfirm: async () => {
                    Object.assign(state.exercises.find(e => e.id === exId), {archived:true,editedAt:Date.now()});
                    await dbSaveAll('exercises', state.exercises);
                    renderManageExercisesList();
                    renderExerciseDropdown();
                    showToast('تم حذف التمرين المخصص');
                }
            });
        }

        function renderManageExercisesList() {
            const container = document.getElementById('manage-exercises-list');
            const countEl = document.getElementById('custom-ex-count');
            if (!container || !countEl) return;

            const customExercises = state.exercises.filter(e => e.isCustom === true && !e.archived);
            countEl.textContent = `${customExercises.length} تمارِينَ`;

            if (customExercises.length === 0) {
                container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs glass-card border border-slate-800">لم تقم بإضافة أي تمارين مخصصة بعد. قم بإضافة تمارينك الخاصة أعلاه! 💡</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            customExercises.forEach(ex => {
                const item = document.createElement('div');
                item.className = 'glass-card p-3 flex justify-between items-center border border-slate-800 hover:border-slate-700 transition';
                item.innerHTML = `
                    <div>
                        <div class="font-bold text-xs text-slate-200">${escapeHTML(ex.name)}</div>
                        <div class="text-[10px] text-slate-400 mt-0.5">الفئة: ${escapeHTML(CATEGORY_NAMES[ex.category] || '')} | الأداة: ${escapeHTML(EQUIP_NAMES[ex.equip] || 'مخصص')}</div>
                    </div>
                    <button data-action="delete-custom-ex" data-id="${escapeHTML(ex.id)}" aria-label="حذف هذا التمرين المخصص" class="text-slate-500 hover:text-red-400 p-1.5 transition">
                        <i class="fa-solid fa-trash-can text-sm"></i>
                    </button>
                `;
                fragment.appendChild(item);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        }

        function initProgressScreen() {
            const select = document.getElementById('chart-exercise-select');
            const loggedExIds = new Set(state.logs.filter(l => l.type === 'weights').map(l => l.exerciseId));
            const weightExercisesWithLogs = state.exercises.filter(e => e.type === 'weights' && loggedExIds.has(e.id));

            select.innerHTML = '';
            if (weightExercisesWithLogs.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'لا توجد تمارين بها سجلات بعد';
                select.appendChild(opt);
                renderExerciseProgressionHistory('');
            } else {
                weightExercisesWithLogs.forEach(ex => {
                    const opt = document.createElement('option');
                    opt.value = ex.id;
                    opt.textContent = ex.name;
                    select.appendChild(opt);
                });
                renderExerciseProgressionHistory(weightExercisesWithLogs[0].id);
            }

            resetProgressLoadMode();
            updateGlobalStats();
            renderExerciseVolumeBreakdown();
            updateProgressChart();
        }

        function updateGlobalStats() {
            const uniqueDates = new Set(state.logs.map(l => l.date));
            document.getElementById('stat-total-days').textContent = `${uniqueDates.size} يوم`;
            const activeWeightExCount = new Set(state.logs.filter(l => l.type === 'weights').map(l => l.exerciseId)).size;
            document.getElementById('stat-active-exercises-count').textContent = `${activeWeightExCount} تمرين`;
        }

        function renderExerciseVolumeBreakdown() {
            const container = document.getElementById('exercise-volume-breakdown-list');
            if (!container) return;
            const volumeMap = Object.create(null);

            state.logs.forEach(l => {
                if (l.type === 'weights') {
                    const exName = l.exerciseName || 'تمرين';
                    const volKg = l.loadMode === 'timed' ? 0 : getVolumeLoadKg(l) * (Number(l.reps) || 1);
                    if (!volumeMap[exName]) volumeMap[exName] = { total: 0, working: 0 };
                    volumeMap[exName].total += volKg;
                    if (l.setType !== 'warmup') volumeMap[exName].working += volKg;
                }
            });

            const sortedExercises = Object.keys(volumeMap).sort((a, b) => volumeMap[b].working - volumeMap[a].working);
            if (sortedExercises.length === 0) {
                container.innerHTML = `<div class="text-[11px] text-slate-500 py-3 text-center">لا توجد سجلات أوزان لحساب الحجم حتى الآن</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            sortedExercises.forEach(name => {
                const totalKg = volumeMap[name].total;
                const workingKg = volumeMap[name].working;
                const totalTons = (totalKg / 1000).toFixed(2);
                const workingTons = (workingKg / 1000).toFixed(2);
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center text-xs py-2 px-3 bg-slate-900/80 rounded-xl border border-slate-800';
                item.innerHTML = `
                    <span class="font-bold text-slate-200">${escapeHTML(name)}</span>
                    <span class="text-left"><strong class="block text-cyan-300">فعلي: ${escapeHTML(workingTons)} طن</strong><small class="text-slate-500">الإجمالي مع التسخين: ${escapeHTML(totalTons)} طن</small></span>
                `;
                fragment.appendChild(item);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        }

        function resetProgressLoadMode() {
            const id=document.getElementById('chart-exercise-select').value;
            const recent=state.logs.filter(l=>l.exerciseId===id).sort((a,b)=>(b.timestamp||Date.parse(b.date))-(a.timestamp||Date.parse(a.date)))[0];
            document.getElementById('progress-load-mode').value=recent?.loadMode||'external';
        }
        function progressionGroups(exerciseId) {
            const logs=state.logs.filter(l=>l.exerciseId===exerciseId && l.type==='weights' && l.setType!=='warmup');
            const newest=logs.slice().sort((a,b)=>(b.timestamp||Date.parse(b.date))-(a.timestamp||Date.parse(a.date)))[0];
            const mode=document.getElementById('progress-load-mode').value || newest?.loadMode || 'external';
            const filtered=logs.filter(l=>(l.loadMode||'external')===mode);
            const groups=new Map();
            for(const l of filtered) {
                const key=l.sessionId||l.date;
                const value=mode==='timed'?Number(l.durationSeconds)||0:getProgressWeightKg(l);
                const existing=groups.get(key);
                const rm=mode==='timed'?null:calculate1RM(value,l.reps);
                if(!existing)groups.set(key,{date:l.date,time:l.timestamp||Date.parse(l.date),weight:value,reps:l.reps,oneRm:rm,rir:l.rir});
                else {
                    existing.time=Math.min(existing.time,l.timestamp||Date.parse(l.date));
                    if(value>existing.weight||(value===existing.weight&&l.reps>existing.reps)){Object.assign(existing,{weight:value,reps:l.reps,rir:l.rir});}
                    if(Number.isFinite(rm))existing.oneRm=Math.max(existing.oneRm||0,rm);
                }
            }
            return {mode,groups:[...groups.values()].sort((a,b)=>a.time-b.time)};
        }
        function renderExerciseProgressionHistory(selectedExId) {
            const container=document.getElementById('exercise-progression-history-list');
            const badge=document.getElementById('progression-history-badge');
            if(!selectedExId){container.textContent='لا توجد جولات عمل مسجلة';return;}
            const {mode,groups}=progressionGroups(selectedExId);
            const unit=mode==='timed'?'ثانية':mode==='per_hand'?'كجم لكل يد':'كجم';
            badge.textContent=state.exercises.find(e=>e.id===selectedExId)?.name || 'تطور الأداء';
            container.innerHTML=groups.map((row,i)=>{
                const prev=groups[i-1];let delta='البداية';
                if(prev){const d=Math.round((row.weight-prev.weight)*10)/10;const r=row.reps-prev.reps;delta=`${d>0?'+':''}${d} ${unit}`+(mode==='timed'?'':` | ${r>0?'+':''}${r} عدات`);}
                return `<div class="glass-card p-3 text-xs"><div class="text-slate-400">${escapeHTML(row.date)}</div><strong>${Number(row.weight.toFixed(1))} ${unit}${mode==='timed'?'':` × ${row.reps} عدات`}</strong><div class="text-cyan-300">${escapeHTML(delta)}</div>${mode==='timed'?'':`<small>أعلى 1RM تقديري: ${row.oneRm??'غير متاح'} | RIR: ${row.rir??'غير محدد'}</small>`}</div>`;
            }).reverse().join('') || 'لا توجد جولات عمل بهذه الطريقة';
        }
        function updateProgressChart() {
            const selectedExId=document.getElementById('chart-exercise-select').value;
            renderExerciseProgressionHistory(selectedExId);
            const {mode,groups}=progressionGroups(selectedExId);
            document.getElementById('chart-mode-1rm').disabled=mode==='timed';
            const points=groups.map(g=>({label:g.date,value:mode==='timed'?g.weight:chartMetricMode==='1rm'?g.oneRm:g.weight})).filter(p=>Number.isFinite(p.value));
            const target=document.getElementById('progressChart');
            const unit=mode==='timed'?'ثانية':mode==='per_hand'?'كجم لكل يد':'كجم';
            const label=mode==='timed'?'أطول مدة':chartMetricMode==='1rm'?'أعلى 1RM تقديري':'أعلى حمل مسجل';
            if(!points.length){target.textContent='لا توجد بيانات مناسبة للرسم';return;}
            const max=Math.max(1,...points.map(p=>p.value))*1.15;
            const width=600,height=260,left=55,right=25,top=25,bottom=55;
            const x=i=>left+(width-left-right)*(points.length===1?0.5:i/(points.length-1));
            const y=v=>height-bottom-(height-top-bottom)*v/max;
            const svgNS='http://www.w3.org/2000/svg';
            const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',label+' '+unit);svg.style.width='100%';svg.style.height='100%';
            function el(name,attrs,text){const e=document.createElementNS(svgNS,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.appendChild(e);return e;}
            el('title',{},label+' ('+unit+')');
            for(let i=0;i<=4;i++){const v=max*i/4;el('line',{x1:left,x2:width-right,y1:y(v),y2:y(v),stroke:'#334155'});el('text',{x:left-8,y:y(v)+4,fill:'#94a3b8','font-size':12,'text-anchor':'end'},Math.round(v));}
            el('polyline',{points:points.map((p,i)=>`${x(i)},${y(p.value)}`).join(' '),fill:'none',stroke:'#00f2fe','stroke-width':3});
            points.forEach((p,i)=>{const dot=el('circle',{cx:x(i),cy:y(p.value),r:4,fill:'#fff'});const title=document.createElementNS(svgNS,'title');title.textContent=`${p.label}: ${p.value.toFixed(1)} ${unit}`;dot.appendChild(title);if(i===0||i===points.length-1||i%Math.ceil(points.length/4)===0)el('text',{x:x(i),y:height-25,fill:'#94a3b8','font-size':11,'text-anchor':'middle'},p.label);});
            target.replaceChildren(svg);
        }

        function setChartMetricMode(mode) {
            chartMetricMode = mode;
            const actualBtn = document.getElementById('chart-mode-actual');
            const oneRmBtn = document.getElementById('chart-mode-1rm');

            if (mode === 'actual') {
                actualBtn.className = "px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cyan-500 text-white transition-all shadow-md";
                oneRmBtn.className = "px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-all";
            } else {
                oneRmBtn.className = "px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500 text-white transition-all shadow-md";
                actualBtn.className = "px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-all";
            }

            updateProgressChart();
        }

        function createBentoCard(title, value, statusText, statusClass, valueColorClass, description) {
            return `
                <div class="glass-card p-4 space-y-2 relative overflow-hidden flex flex-col justify-between shadow-md">
                    <div>
                        <div class="text-[11px] text-slate-400 font-semibold mb-1">${escapeHTML(title)}</div>
                        <div class="text-2xl font-black ${escapeHTML(valueColorClass)}">${escapeHTML(value)}</div>
                    </div>
                    <div class="space-y-1">
                        <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${escapeHTML(statusClass)}">${escapeHTML(statusText)}</span>
                        <p class="text-[10px] text-slate-400 pt-1 border-t border-slate-800">${description}</p>
                    </div>
                </div>
            `;
        }

        function renderBentoGridAnalysis() {
            const calContainer = document.getElementById('bento-calories-container');
            const healthContainer = document.getElementById('bento-health-container');
            const compContainer = document.getElementById('bento-comp-container');

            if (!calContainer) return;
            calContainer.innerHTML = ''; healthContainer.innerHTML = ''; compContainer.innerHTML = '';

            const p = state.profile;
            const weight = parseFloat(p.weight);
            const height = parseFloat(p.height);
            const waist = parseFloat(p.waist);
            const fat = parseFloat(p.fat);
            const muscle = parseFloat(p.muscle);
            const water = parseFloat(p.water);
            const age = parseFloat(p.age) || 25;
            const isMan = p.isMan !== false;

            if (!weight || !height) {
                calContainer.innerHTML = `<div class="col-span-3 glass-card p-4 text-center text-xs text-slate-400">يرجى الانتقال لصفحة "البروفايل" وإدخال الطول والوزن لظهور التحليل الذكي 🧠</div>`;
                return;
            }

            let bmr = (10 * weight) + (6.25 * height) - (5 * age) + (isMan ? 5 : -161);
            const activityFactor = parseFloat(p.activityFactor) || 1.375;
            const tdee = Math.round(bmr * activityFactor);
            const cutLow = Math.round(tdee * 0.90);
            const cutHigh = Math.round(tdee * 0.80);
            const bulkLow = Math.round(tdee * 1.05);
            const bulkHigh = Math.round(tdee * 1.10);

            calContainer.innerHTML += createBentoCard('تثبيت الوزن (Maintenance)', tdee.toLocaleString() + '🔥', 'هدف التوازن 🎯', 'bg-cyan-950 text-cyan-300 border-cyan-800', 'text-cyan-300', 'تقدير يومي للمحافظة على الوزن، ويُراجع حسب تغير وزنك الفعلي.');
            calContainer.innerHTML += createBentoCard('نقصان الوزن (Fat Loss)', `${cutHigh.toLocaleString()}–${cutLow.toLocaleString()}🔥`, 'عجز 10–20% 📉', 'bg-emerald-950 text-emerald-300 border-emerald-800', 'text-emerald-300', 'نطاق مبدئي للتنشيف يُعدّل حسب تغير الوزن والأداء، دون ضمان تلقائي لمنع فقدان العضلات.');
            calContainer.innerHTML += createBentoCard('زيادة نظيفة (Lean Bulk)', `${bulkLow.toLocaleString()}–${bulkHigh.toLocaleString()}🔥`, 'فائض 5–10% 📈', 'bg-amber-950 text-amber-300 border-amber-800', 'text-amber-300', 'فائض محافظ كبداية، ثم يُعدّل حسب معدل زيادة الوزن.');

            const heightM = height / 100;
            const bmi = (weight / (heightM * heightM)).toFixed(1);
            let bmiStatus = bmi < 18.5 ? 'أقل من النطاق الطبيعي 🟡' : bmi <= 24.9 ? 'ضمن النطاق الطبيعي 🟢' : bmi <= 29.9 ? 'أعلى من النطاق الطبيعي 🟠' : 'مرتفع حسب BMI 🔴';
            healthContainer.innerHTML += createBentoCard('مؤشر الكتلة (BMI)', bmi, bmiStatus, 'bg-emerald-950 text-emerald-300 border-emerald-800', 'text-cyan-300', 'أداة فرز عامة لا تميز بين العضلات والدهون، وقد تضلل لدى لاعبي الحديد.');

            if (waist) {
                const whtr = (waist / height).toFixed(2);
                let whtrStatus = whtr < 0.5 ? 'أقل من 0.5 🟢' : whtr < 0.6 ? 'يستحق المتابعة 🟠' : 'مرتفع كأداة فرز 🔴';
                healthContainer.innerHTML += createBentoCard('نسبة الخصر للطول (WHtR)', whtr, whtrStatus, 'bg-blue-950 text-blue-300 border-blue-800', 'text-blue-300', 'مؤشر بسيط مرتبط بالسمنة المركزية، وليس قياسًا مباشرًا للدهون الحشوية.');
            }

            if (fat) {
                const leanMass = weight * (1 - (fat / 100));
                const ffmi = (leanMass / (heightM * heightM) + 6.3 * (1.8 - heightM)).toFixed(1);
                compContainer.innerHTML += createBentoCard('نسبة الدهون %', fat + '%', 'شحوم الجسم', 'bg-rose-950 text-rose-300 border-rose-800', 'text-rose-300', 'نسبة الدهون الكلية.');
                compContainer.innerHTML += createBentoCard('مؤشر الكتلة الخالية من الدهون (FFMI)', ffmi, 'Fat-Free Mass Index', 'bg-purple-950 text-purple-300 border-purple-800', 'text-indigo-400', 'يشمل الكتلة الخالية من الدهون كلها، وليس العضلات وحدها.');
            }

            if (muscle) {
                compContainer.innerHTML += createBentoCard('العضلات %', muscle + '%', 'أنسجة عضلية', 'bg-teal-950 text-teal-300 border-teal-800', 'text-teal-400', 'نسبة الأنسجة العضلية.');
            }
            if (water) {
                compContainer.innerHTML += createBentoCard('السوائل %', water + '%', 'ترطيب الخلايا', 'bg-sky-950 text-sky-300 border-sky-800', 'text-sky-300', 'نسبة السوائل الترطيبية.');
            }
        }

        async function toggleGender() {
            state.profile.isMan = !(state.profile.isMan !== false);
            if (!state.profile.id) state.profile.id = 'user_profile';
            await dbSaveAll('profile', [state.profile]);
            updateGenderUI();
            renderBentoGridAnalysis();
            updateTopHeaderStats();
            showToast(state.profile.isMan ? 'تم اختيار وضع الرجل 💪' : 'تم اختيار وضع الأنثى 🌸');
        }

        function updateGenderUI() {
            const btn = document.getElementById('gender-toggle-btn');
            const icon = document.getElementById('gender-icon');
            const text = document.getElementById('gender-text');
            if (!btn || !icon || !text) return;

            if (state.profile.isMan !== false) {
                btn.classList.add('neon-glow-amber', 'border-amber-500/60');
                icon.textContent = '🔥';
                text.textContent = 'مفعل: خيار الرجل 💪';
                text.className = 'font-bold text-sm text-amber-300';
            } else {
                btn.classList.remove('neon-glow-amber', 'border-amber-500/60');
                icon.textContent = '🌸';
                text.textContent = 'مفعل: خيار الأنثى 🌸';
                text.className = 'font-bold text-sm text-pink-300';
            }
        }

        async function saveProfile() {
            if (!state.profile) {
                state.profile = { id: 'user_profile', name: '', weight: '', height: '', waist: '', age: '', fat: '', muscle: '', water: '', isMan: true, activityFactor: 1.375, history: [] };
            }
            state.profile.id = 'user_profile';
            state.profile.updatedAt = Date.now();
            state.profile.name = document.getElementById('prof-name').value.trim();
            state.profile.weight = validateAndClamp(document.getElementById('prof-weight').value, 20, 350, '');
            state.profile.height = validateAndClamp(document.getElementById('prof-height').value, 50, 250, '');
            state.profile.waist = validateAndClamp(document.getElementById('prof-waist').value, 30, 250, '');
            state.profile.age = validateAndClamp(document.getElementById('prof-age').value, 5, 120, '');
            state.profile.fat = validateAndClamp(document.getElementById('prof-fat').value, 1, 70, '');
            state.profile.muscle = validateAndClamp(document.getElementById('prof-muscle').value, 1, 80, '');
            state.profile.water = validateAndClamp(document.getElementById('prof-water').value, 1, 90, '');
            state.profile.activityFactor = parseFloat(document.getElementById('prof-activity').value) || 1.375;

            const today = getLocalDateString();
            if (!state.profile.history) state.profile.history = [];

            if (state.profile.weight) {
                state.profile.history = state.profile.history.filter(h => h.date !== today);
                state.profile.history.push({ date: today, weight: parseFloat(state.profile.weight), waist: parseFloat(state.profile.waist) || '' });
            }

            await dbSaveAll('profile', [state.profile]);
            renderBentoGridAnalysis();
            renderProfileHistoryList();
            updateTopHeaderStats();
            showToast('تم حفظ القياسات والبروفايل بنجاح 🎯');
        }

        function renderProfileUI() {
            document.getElementById('prof-name').value = state.profile.name || '';
            document.getElementById('prof-weight').value = state.profile.weight || '';
            document.getElementById('prof-height').value = state.profile.height || '';
            document.getElementById('prof-waist').value = state.profile.waist || '';
            document.getElementById('prof-age').value = state.profile.age || '';
            document.getElementById('prof-fat').value = state.profile.fat || '';
            document.getElementById('prof-muscle').value = state.profile.muscle || '';
            document.getElementById('prof-water').value = state.profile.water || '';
            document.getElementById('prof-activity').value = String(state.profile.activityFactor || 1.375);

            updateGenderUI();
            renderBentoGridAnalysis();
            renderProfileHistoryList();
        }

        function renderProfileHistoryList() {
            const container = document.getElementById('profile-history-list');
            if (!container) return;
            const history = (state.profile.history || []).slice().reverse();

            if (history.length === 0) {
                container.innerHTML = `<div class="text-[11px] text-slate-500 py-2 text-center">لا توجد قياسات سابقة مسجلة</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            history.forEach(item => {
                const el = document.createElement('div');
                el.className = 'flex justify-between items-center text-xs py-1.5 px-2 bg-slate-900/60 rounded-lg border border-slate-800';
                el.innerHTML = `
                    <span class="text-slate-400 text-[10px]">${escapeHTML(item.date)}</span>
                    <div class="space-x-3 space-x-reverse font-medium">
                        <span class="text-cyan-300">${escapeHTML(String(item.weight))} كجم</span>
                        ${item.waist ? `<span class="text-blue-300">خصر: ${escapeHTML(String(item.waist))} سم</span>` : ''}
                    </div>
                `;
                fragment.appendChild(el);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        }

        async function exportDataJSON() {
            const logs=state.logs.map(l=>l.type==='weights'&&!Number.isInteger(Number(l.reps))?{...l,legacyFractionalReps:true}:l);
            downloadJSON({...state,logs,schemaVersion:DATA_SCHEMA_VERSION,exportDate:new Date().toISOString()},`gym_tracker_backup_${getLocalDateString()}.json`);
            showToast('تم تجهيز النسخة الاحتياطية للتنزيل');
        }

        async function downloadSafetyBackup() {
            const snapshot=await GymStorage.backup();
            if(!snapshot?.data)return showToast('لا توجد نسخة أمان سابقة على هذا الجهاز');
            downloadJSON(snapshot.data, 'gym_tracker_safety_'+getLocalDateString()+'.json');
        }
        function downloadJSON(data,filename) {
            const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
            const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
        }
        async function importDataJSON(event) {
            const file=event.target.files?.[0];if(!file)return;
            if(file.size>25*1024*1024){showToast('الملف كبير جدًا؛ الحد 25 ميجابايت');event.target.value='';return;}
            await runMutation(async()=>{
                const incoming=GymData.validate(JSON.parse(await file.text()));
                const candidate=GymData.merge(state,incoming);
                const oldState=state;state=candidate;
                try {
                    // Refresh only imported/changed session summaries; preserve other history.
                    const changed=new Set((incoming.logs||[]).map(l=>l.sessionId).filter(Boolean));
                    for(const session of incoming.sessions||[])changed.add(session.id);
                    for(const id of changed)await refreshCompletedSessionSummary(id);
                    await GymStorage.save(state);
                }catch(error){state=oldState;throw error;}
                restoreActiveSession();renderCategoryTabs();renderExerciseDropdown();renderProfileUI();updateSessionUI();
                showToast('تم دمج النسخة والتحقق منها وحفظها بنجاح');
            });
            event.target.value='';
        }

        function confirmClearTodayLogs() {
            showModal({
                title: 'مسح جولات اليوم 🧹',
                message: 'هل أنت متاكد من حذف جميع جولات وتسجيلات اليوم فقط؟',
                confirmText: 'مسح اليوم',
                cancelText: 'إلغاء',
                onConfirm: async () => {
                    const today = getLocalDateString();
                    const affected=new Set(state.logs.filter(l=>l.date===today).map(l=>l.sessionId));
                    state.logs = state.logs.filter(l => l.date !== today);
                    for (const session of state.sessions.filter(s => affected.has(s.id) && s.status === 'completed')) {
                        await refreshCompletedSessionSummary(session.id);
                    }
                    await GymStorage.save(state);
                    renderTodayLogs();
                    updateTopHeaderStats();
                    onExerciseSelectChange();
                    showToast('تم مسح جولات اليوم');
                }
            });
        }

        function confirmWipeAllData() {
            showModal({
                title: 'إعادة ضبط شاملة 💣',
                message: 'تحذير: سيتم حذف جميع البيانات الشخصية والسجلات والمكتبة ونسخ الأمان المحلية نهائياً وإعادة التطبيق للوضع الافتراضي.',
                confirmText: 'مسح شامل لكل شيء',
                cancelText: 'إلغاء',
                onConfirm: async () => {
                    state = {
                        profile: { id: 'user_profile', name: '', weight: '', height: '', waist: '', age: '', fat: '', muscle: '', water: '', isMan: true, activityFactor: 1.375, history: [] },
                        exercises: [...DEFAULT_EXERCISES],
                        logs: [],
                        sessions: []
                    };
                    await GymStorage.save(state, {wipe:true});
                    stopRestTimer();
                    activeSessionId = null;
        
                    updateSessionUI();

                    renderCategoryTabs();
                    renderExerciseDropdown();
                    renderTodayLogs();
                    renderProfileUI();
                    updateTopHeaderStats();
                    showToast('تمت إعادة ضبط التطبيق بالكامل');
                }
            });
        }

        function updateTopHeaderStats() {
            const today = getLocalDateString();
            const todayLogs = state.logs.filter(l => l.date === today);
            const logCalories = todayLogs.reduce((sum, l) => {
                if (l.type === 'weights' && ['v9-session','v10-session'].includes(l.calculationVersion)) return sum;
                return sum + (parseFloat(l.calories) || 0);
            }, 0);
            const sessionCalories = state.sessions.filter(s => s.date === today && s.status === 'completed').reduce((sum, s) => sum + (parseFloat(s.estimatedCalories) || 0), 0);
            const totalCals = logCalories + sessionCalories;
            document.getElementById('header-today-cals').textContent = Math.round(totalCals * 10) / 10;
        }

        function showModal({ title, message, confirmText, cancelText, onConfirm }) {
            const modal = document.getElementById('custom-modal');
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-message').textContent = message;
            
            const confirmBtn = document.getElementById('modal-confirm-btn');
            const cancelBtn = document.getElementById('modal-cancel-btn');

            confirmBtn.textContent = confirmText || 'تأكيد';
            cancelBtn.textContent = cancelText || 'إلغاء';

            const previousFocus=document.activeElement;
            const close = () => {modal.classList.add('hidden');previousFocus?.focus();};
            confirmBtn.onclick = () => { close(); if (onConfirm) runMutation(onConfirm); };
            cancelBtn.onclick = close;
            modal.classList.remove('hidden');
            cancelBtn.focus();
        }

        function showToast(msg) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'glass p-3 rounded-xl border border-cyan-500/40 text-xs font-bold text-center text-cyan-200 shadow-2xl animate-fade-in pointer-events-auto';
            toast.textContent = msg;
            container.appendChild(toast);
            setTimeout(() => { toast.remove(); }, 6500);
        }

        function switchTab(tabId) {
            document.querySelectorAll('.screen-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));

            const targetScreen = document.getElementById(`screen-${tabId}`);
            const targetNav = document.getElementById(`nav-${tabId}`);

            if (targetScreen) targetScreen.classList.remove('hidden');
            if (targetNav) targetNav.classList.add('active');

            if (tabId === 'progress') initProgressScreen();
            else if (tabId === 'exercises') renderManageExercisesList();
            else if (tabId === 'bento') renderBentoGridAnalysis();
            else if (tabId === 'profile') renderProfileUI();
        }

        function initEventListeners() {
            document.addEventListener('keydown', event => {
                const modal=document.querySelector('.modal-overlay:not(.hidden)');if(!modal)return;
                const buttons=[...modal.querySelectorAll('button,input:not([type=hidden]),select')].filter(e=>!e.disabled&&e.getClientRects().length);
                if(event.key==='Escape'){modal.classList.add('hidden');return;}
                if(event.key==='Tab'&&buttons.length){const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
            });
            document.getElementById('logs-date-filter').addEventListener('change', () => {logsRenderLimit=15;renderTodayLogs();});
            document.addEventListener('visibilitychange', () => {if (!document.hidden) {updateSessionUI();restoreRestTimer();}});
            document.body.addEventListener('click', function(e) {
                const stepperBtn = e.target.closest('[data-step-target]');
                if (stepperBtn) {
                    handleStepperClick(stepperBtn.dataset.stepTarget, parseFloat(stepperBtn.dataset.step) || 0);
                }
            });

            document.getElementById('floating-dock').addEventListener('click', function (e) {
                const btn = e.target.closest('[data-tab]');
                if (btn) switchTab(btn.dataset.tab);
            });

            document.getElementById('routine-presets-container').addEventListener('click', function(e) {
                const btn = e.target.closest('[data-routine]');
                if (btn) loadPresetRoutine(btn.dataset.routine);
            });

            document.getElementById('btn-reset-routine-filter').addEventListener('click', resetRoutineFilter);

            document.getElementById('category-tabs-container').addEventListener('click', function (e) {
                const btn = e.target.closest('.cat-btn');
                if (btn && btn.dataset.cat) setWorkoutCategoryFilter(btn.dataset.cat, btn);
            });

            document.getElementById('equip-filters-container').addEventListener('click', function (e) {
                const btn = e.target.closest('.equip-btn');
                if (btn && btn.dataset.equip) setEquipFilter(btn.dataset.equip, btn);
            });

            document.getElementById('rir-container').addEventListener('click', function (e) {
                const btn = e.target.closest('.rir-btn');
                if (btn) setRIR(btn.dataset.rir, btn);
            });

            document.getElementById('set-type-container').addEventListener('click', function (e) {
                const btn = e.target.closest('.set-type-btn');
                if (btn) setSetType(btn.dataset.settype, btn);
            });

            document.getElementById('exercise-search-input').addEventListener('input', renderExerciseDropdown);
            document.getElementById('exercise-dropdown').addEventListener('change', onExerciseSelectChange);
            document.getElementById('input-weight').addEventListener('input', () => { updateWeightConvertedDisplay(); update1RMLiveDisplay(); });
            document.getElementById('input-reps').addEventListener('input', (event) => {
                document.getElementById('val-reps-display').textContent = event.target.value || '0';
                update1RMLiveDisplay();
            });
            document.getElementById('load-mode-select').addEventListener('change', (event) => setLoadMode(event.target.value));

            document.getElementById('unit-btn-kg').addEventListener('click', () => setWeightUnit('kg'));
            document.getElementById('unit-btn-lbs').addEventListener('click', () => setWeightUnit('lbs'));

            document.getElementById('btn-save-weights').addEventListener('click', () => runMutation(saveSet));
            document.getElementById('btn-save-treadmill').addEventListener('click', () => runMutation(() => saveCardioSet('treadmill')));
            document.getElementById('btn-save-bike').addEventListener('click', () => runMutation(() => saveCardioSet('bike_elliptical')));
            document.getElementById('btn-copy-last-perf').addEventListener('click', () => runMutation(copyLastPerformance));
            document.getElementById('btn-stop-timer').addEventListener('click', stopRestTimer);
            document.getElementById('btn-start-session').addEventListener('click', () => runMutation(() => startWorkoutSession()));
            document.getElementById('btn-copy-session').addEventListener('click', () => runMutation(copyPreviousSession));
            document.getElementById('btn-finish-session').addEventListener('click', () => runMutation(finishWorkoutSession));
            document.getElementById('btn-cancel-edit-log').addEventListener('click', () => document.getElementById('edit-log-modal').classList.add('hidden'));
            document.getElementById('btn-confirm-edit-log').addEventListener('click', () => runMutation(saveEditedLog));

            document.getElementById('btn-load-more-logs').addEventListener('click', function() {
                logsRenderLimit += 15;
                renderTodayLogs();
            });

            document.getElementById('today-logs-container').addEventListener('click', function (e) {
                const deleteBtn = e.target.closest('[data-action="delete-log"]');
                if (deleteBtn && deleteBtn.dataset.id) deleteLogItem(deleteBtn.dataset.id);
                const editBtn = e.target.closest('[data-action="edit-log"]');
                if (editBtn && editBtn.dataset.id) openEditLog(editBtn.dataset.id);
            });

            document.getElementById('new-ex-name').addEventListener('input', function() { onCustomExerciseInput(this.value); });
            document.getElementById('add-ex-submit-btn').addEventListener('click', () => runMutation(addNewExercise));
            document.getElementById('manage-exercises-list').addEventListener('click', function(e) {
                const deleteBtn = e.target.closest('[data-action="delete-custom-ex"]');
                if (deleteBtn && deleteBtn.dataset.id) deleteExercise(deleteBtn.dataset.id);
            });

            document.getElementById('chart-exercise-select').addEventListener('change', () => {resetProgressLoadMode();updateProgressChart();});
            document.getElementById('progress-load-mode').addEventListener('change', updateProgressChart);
            document.getElementById('chart-mode-actual').addEventListener('click', () => setChartMetricMode('actual'));
            document.getElementById('chart-mode-1rm').addEventListener('click', () => setChartMetricMode('1rm'));

            document.getElementById('gender-toggle-btn').addEventListener('click', () => runMutation(toggleGender));
            document.getElementById('btn-save-profile').addEventListener('click', () => runMutation(saveProfile));
            document.getElementById('btn-export-json').addEventListener('click', exportDataJSON);
            document.getElementById('btn-download-safety-backup').addEventListener('click', downloadSafetyBackup);
            document.getElementById('import-file-input').addEventListener('change', importDataJSON);
            document.getElementById('btn-clear-today-logs').addEventListener('click', confirmClearTodayLogs);
            document.getElementById('btn-wipe-all-data').addEventListener('click', confirmWipeAllData);

            document.getElementById('split-btn-ppl').addEventListener('click', () => setSplitSystem('ppl'));
            document.getElementById('split-btn-ul').addEventListener('click', () => setSplitSystem('upper_lower'));
        }

        function registerServiceWorker() {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js')
                    .then((reg) => reg.update())
                    .catch((err) => console.warn('SW Failed:', err));
            }
        }

        window.addEventListener('DOMContentLoaded', async () => {
            try { await loadStateFromDB(); } catch(error) { document.getElementById('db-status-badge').textContent=error.message; return; }
            initEventListeners();
            document.getElementById('logs-date-filter').value = getLocalDateString();
            renderCategoryTabs();
            renderExerciseDropdown();
            renderTodayLogs();
            updateTopHeaderStats();
            renderProfileUI();
            updateWeightConvertedDisplay();
            update1RMLiveDisplay();
            updateSessionUI();
            restoreRestTimer();
            registerServiceWorker();
        });

    })();
