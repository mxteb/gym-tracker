// Verbatim copies of the v10.3 functions (app.js before the split). Do not edit: tests compare the new code to these.
module.exports = function (state, GymData) {
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
function calculate1RM(weight, reps) {return GymData.oneRepMax(weight,reps);}

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

        function getDefaultLoadMode(exercise) {
            if (!exercise) return 'external';
            if (exercise.id === 'ex_62') return 'timed';
            if (exercise.id === 'ex_32') return 'assisted';
            if (['ex_19', 'ex_31', 'ex_60', 'ex_61'].includes(exercise.id)) return 'bodyweight';
            if (['ex_22','ex_33','ex_48'].includes(exercise.id)) return 'external';
            if (exercise.equip === 'dumbbell') return 'per_hand';
            return 'external';
        }

        function runLocalClassification(cleanName) {
            if (/(ضغط.*(أرجل|ارجل)|مكبس.*(أرجل|ارجل))/i.test(cleanName)) return {cat:'legs',equip:'machine'};
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
        function progressionGroups(exerciseId, modeOverride) {
            const logs=state.logs.filter(l=>l.exerciseId===exerciseId && l.type==='weights' && l.setType!=='warmup');
            const newest=logs.slice().sort((a,b)=>(b.timestamp||Date.parse(b.date))-(a.timestamp||Date.parse(a.date)))[0];
            const mode=modeOverride || newest?.loadMode || 'external';
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
function bodyMetrics() {
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
                return null; `<div class="col-span-3 glass-card p-4 text-center text-xs text-slate-400">يرجى الانتقال لصفحة "البروفايل" وإدخال الطول والوزن لظهور التحليل الذكي 🧠</div>`;
            }

            let bmr = (10 * weight) + (6.25 * height) - (5 * age) + (isMan ? 5 : -161);
            const activityFactor = parseFloat(p.activityFactor) || 1.375;
            const tdee = Math.round(bmr * activityFactor);
            const cutLow = Math.round(tdee * 0.90);
            const cutHigh = Math.round(tdee * 0.80);
            const bulkLow = Math.round(tdee * 1.05);
            const bulkHigh = Math.round(tdee * 1.10);

            const heightM = height / 100;
            const bmi = (weight / (heightM * heightM)).toFixed(1);
            let bmiStatus = bmi < 18.5 ? 'أقل من النطاق الطبيعي 🟡' : bmi <= 24.9 ? 'ضمن النطاق الطبيعي 🟢' : bmi <= 29.9 ? 'أعلى من النطاق الطبيعي 🟠' : 'مرتفع حسب BMI 🔴';
            
 let whtr=null, whtrStatus=null, ffmi=null;
 if (waist) { whtr = (waist / height).toFixed(2); whtrStatus = whtr < 0.5 ? 'low' : whtr < 0.6 ? 'watch' : 'high'; }
 if (fat) { const leanMass = weight * (1 - (fat / 100)); ffmi = (leanMass / (heightM * heightM) + 6.3 * (1.8 - heightM)).toFixed(1); }
 const band = bmiStatus.includes('أقل') ? 'under' : bmiStatus.includes('ضمن') ? 'normal' : bmiStatus.includes('أعلى') ? 'over' : 'high';
 return {bmr, tdee, cutLow, cutHigh, bulkLow, bulkHigh, bmi, bmiBand: band, whtr, whtrBand: whtrStatus, fat: fat || null, ffmi, muscle: muscle || null, water: water || null};
}
return {getCanonicalWeightKg, getVolumeLoadKg, getProgressWeightKg, calculateCalories, estimateWeightSessionCalories, getDefaultLoadMode, runLocalClassification, progressionGroups, bodyMetrics};
};
