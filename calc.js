/* Gym Tracker — الحسابات (بدون واجهة).
 * كل دالة هنا نقية: تاخذ أرقام وترجع أرقام، ما تلمس الصفحة ولا التخزين.
 * منسوخة حرفياً من app.js القديم، ومختبرة في tests/ بالمقارنة مع الكود الأصلي.
 */
(() => {
'use strict';

const LBS_PER_KG = 2.20462;

function canonicalWeightKg(log) {
 const stored = parseFloat(log && log.weight);
 if (Number.isFinite(stored)) return stored;
 const displayed = parseFloat(log && log.displayWeight) || 0;
 return log && log.unit === 'lbs' ? displayed / LBS_PER_KG : displayed;
}

function volumeLoadKg(log) {
 if (log.loadMode === 'timed') return 0;
 if (Number.isFinite(parseFloat(log.volumeLoadKg))) return parseFloat(log.volumeLoadKg);
 const base = canonicalWeightKg(log) + (log.loadMode === 'external' || !log.loadMode ? Number(log.machineKg) || 0 : 0);
 const multiplier = log.loadMode === 'per_hand' ? 2 : 1;
 return base * multiplier;
}

function progressWeightKg(log) {
 if (log.loadMode === 'timed') return null;
 if (log.loadMode === 'assisted' && Number.isFinite(parseFloat(log.effectiveLoadKg))) return parseFloat(log.effectiveLoadKg);
 if ((log.loadMode === 'bodyweight' || log.loadMode === 'added') && Number.isFinite(parseFloat(log.effectiveLoadKg))) return parseFloat(log.effectiveLoadKg);
 const machine = (log.loadMode === 'external' || !log.loadMode) ? Number(log.machineKg) || 0 : 0;
 return canonicalWeightKg(log) + machine;
}

/** Net calories of one log. profileWeightKg is the current profile weight (fallback when the log has none). */
function calories(type, data, profileWeightKg) {
 const userWeight = parseFloat(data.bodyWeightKgAtLog) || parseFloat(profileWeightKg) || 75;
 let netCalories = 0;
 if (type === 'weights') {
  // Resistance training calories are estimated per completed session, never from kilograms lifted.
  return 0;
 } else if (type === 'treadmill') {
  const speedKmH = parseFloat(data.speed) || 6.0;
  const inclineLevel = Number.isFinite(Number(data.incline)) ? Number(data.incline) : 1.0;
  const durationMins = parseFloat(data.duration) || 15;
  const speedMMin = speedKmH * (1000 / 60);
  const inclineFrac = inclineLevel / 100;
  const movement = data.movement === 'running' ? 'running' : 'walking';
  const vo2 = movement === 'walking'
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

function weightSessionCalories(session, sessionLogs, now = Date.now()) {
 const totalMinutes = Math.max(0, ((session.endedAt || now) - session.startedAt) / 60000);
 const cardioMinutes = sessionLogs.filter(l => l.type !== 'weights').reduce((n, l) => n + (Number(l.duration) || 0), 0);
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

/** The stored summary of a completed session (the fields app.js writes onto the session). */
function sessionSummary(session, sessionLogs, now = Date.now()) {
 const workingLogs = sessionLogs.filter(l => l.type === 'weights' && l.setType !== 'warmup');
 const estimatedCalories = weightSessionCalories(session, sessionLogs, now);
 const cardioCalories = sessionLogs.filter(l => l.type !== 'weights').reduce((n, l) => n + (Number(l.calories) || 0), 0);
 return {
  estimatedCalories,
  cardioCalories,
  totalEstimatedCalories: Math.round((estimatedCalories + cardioCalories) * 10) / 10,
  totalVolumeKg: workingLogs.reduce((sum, l) => sum + volumeLoadKg(l) * (Number(l.reps) || 1), 0),
  workingSets: workingLogs.length,
  exerciseIds: [...new Set(sessionLogs.map(l => l.exerciseId))]
 };
}

/** Body metrics shown on the analysis screen. Returns null when weight or height is missing. */
function bodyMetrics(p) {
 const weight = parseFloat(p.weight), height = parseFloat(p.height), waist = parseFloat(p.waist);
 const fat = parseFloat(p.fat), muscle = parseFloat(p.muscle), water = parseFloat(p.water);
 const age = parseFloat(p.age) || 25;
 const isMan = p.isMan !== false;
 if (!weight || !height) return null;
 const bmr = (10 * weight) + (6.25 * height) - (5 * age) + (isMan ? 5 : -161);
 const activityFactor = parseFloat(p.activityFactor) || 1.375;
 const tdee = Math.round(bmr * activityFactor);
 const heightM = height / 100;
 const bmi = (weight / (heightM * heightM)).toFixed(1);
 const out = {
  bmr, tdee,
  cutLow: Math.round(tdee * 0.90), cutHigh: Math.round(tdee * 0.80),
  bulkLow: Math.round(tdee * 1.05), bulkHigh: Math.round(tdee * 1.10),
  bmi, bmiBand: bmi < 18.5 ? 'under' : bmi <= 24.9 ? 'normal' : bmi <= 29.9 ? 'over' : 'high',
  whtr: null, whtrBand: null, fat: fat || null, ffmi: null, muscle: muscle || null, water: water || null
 };
 if (waist) { out.whtr = (waist / height).toFixed(2); out.whtrBand = out.whtr < 0.5 ? 'low' : out.whtr < 0.6 ? 'watch' : 'high'; }
 if (fat) { const leanMass = weight * (1 - (fat / 100)); out.ffmi = (leanMass / (heightM * heightM) + 6.3 * (1.8 - heightM)).toFixed(1); }
 return out;
}

/** Best set per session for one exercise and load mode, oldest first (the progress chart and history). */
function progressionGroups(logs, exerciseId, mode) {
 const filtered = logs.filter(l => l.exerciseId === exerciseId && l.type === 'weights' && l.setType !== 'warmup' && (l.loadMode || 'external') === mode);
 const groups = new Map();
 for (const l of filtered) {
  const key = l.sessionId || l.date;
  const value = mode === 'timed' ? Number(l.durationSeconds) || 0 : progressWeightKg(l);
  const existing = groups.get(key);
  const rm = mode === 'timed' ? null : GymData.oneRepMax(value, l.reps);
  if (!existing) groups.set(key, { date: l.date, time: l.timestamp || Date.parse(l.date), weight: value, reps: l.reps, oneRm: rm, rir: l.rir });
  else {
   existing.time = Math.min(existing.time, l.timestamp || Date.parse(l.date));
   if (value > existing.weight || (value === existing.weight && l.reps > existing.reps)) Object.assign(existing, { weight: value, reps: l.reps, rir: l.rir });
   if (Number.isFinite(rm)) existing.oneRm = Math.max(existing.oneRm || 0, rm);
  }
 }
 return [...groups.values()].sort((a, b) => a.time - b.time);
}

function defaultLoadMode(exercise) {
 if (!exercise) return 'external';
 if (exercise.id === 'ex_62') return 'timed';
 if (exercise.id === 'ex_32') return 'assisted';
 if (['ex_19', 'ex_31', 'ex_60', 'ex_61'].includes(exercise.id)) return 'bodyweight';
 if (['ex_22', 'ex_33', 'ex_48'].includes(exercise.id)) return 'external';
 if (exercise.equip === 'dumbbell') return 'per_hand';
 return 'external';
}

function classifyExercise(cleanName) {
 if (/(ضغط.*(أرجل|ارجل)|مكبس.*(أرجل|ارجل))/i.test(cleanName)) return { cat: 'legs', equip: 'machine' };
 if (/(رفرفة.*خلف|rear.*delt)/i.test(cleanName)) return { cat: 'pull', equip: null };
 if (/(rowing|تجديف|treadmill|مشي|دراجة|elliptical|stair)/i.test(cleanName)) return { cat: 'cardio', equip: 'cardio' };
 for (const [key, val] of Object.entries(GymCatalog.EXERCISE_DICTIONARY).sort((a, b) => b[0].length - a[0].length)) {
  if (cleanName.includes(key)) return { cat: val.cat, equip: val.equip };
 }
 let cat = null, equip = null;
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

/** v10.7 — اقتراح الجولة الجاية من آخر جلسة لنفس التمرين وبنفس طريقة الحمل، مع السبب.
 * القاعدة: تقدّم مزدوج (عدات ثم وزن) ويحكمه RIR:
 *  RIR 3+  → الوزن خفيف: زد الوزن خطوة وخلّ العدات.
 *  RIR 1–2 → زد عدة، ولو وصلت 12 عدة زد الوزن وارجع 8.
 *  RIR 0   → وصلت للفشل: ثبّت نفس الوزن والعدات.
 *  بدون RIR → على العدات بس: زد عدة، ولو وصلت 12 زد الوزن وارجع 8.
 * المساعدة (assisted): التقدم = مساعدة أقل. التمرين الزمني: ثواني أكثر. وزن الجسم فقط: عدات أكثر.
 * ما يرجع شي إذا ما فيه جلسة سابقة. excludeSessionId = الجلسة الحالية (ما نقترح من جولاتها).
 */
const REP_TOP = 12, REP_RESET = 8;
function suggestNext(logs, exerciseId, opts = {}) {
 const pool = logs.filter(l => l.exerciseId === exerciseId && l.type === 'weights' && l.setType !== 'warmup' && (!opts.excludeSessionId || l.sessionId !== opts.excludeSessionId));
 if (!pool.length) return null;
 const time = l => Number.isFinite(l.timestamp) ? l.timestamp : (Date.parse(l.date) || 0);
 const mode = opts.mode || (pool.slice().sort((a, b) => time(b) - time(a))[0].loadMode || 'external');
 const same = pool.filter(l => (l.loadMode || 'external') === mode);
 if (!same.length) return null;
 const latest = same.reduce((a, b) => time(b) > time(a) ? b : a);
 const key = latest.sessionId || latest.date;
 const group = same.filter(l => (l.sessionId || l.date) === key);
 const rirOf = l => (l.rir === null || l.rir === undefined || l.rir === '' || !Number.isFinite(Number(l.rir))) ? null : Number(l.rir);
 if (mode === 'timed') {
  const top = group.reduce((a, b) => (Number(b.durationSeconds) || 0) > (Number(a.durationSeconds) || 0) ? b : a);
  const sec = Number(top.durationSeconds) || 0, rir = rirOf(top);
  const add = rir !== null && rir >= 3 ? 10 : 5;
  return { mode, kind: 'add-time', seconds: sec + add, date: top.date, basedOn: { seconds: sec, rir },
   reason: `آخر مرة ${sec} ثانية${rir === null ? '' : ' وRIR ' + (rir === 4 ? '4+' : rir)}. ${add === 10 ? 'كان باقي فيك كثير، زد 10 ثواني.' : 'زد 5 ثواني.'}` };
 }
 const unit = latest.unit === 'lbs' ? 'lbs' : 'kg';
 const shown = l => (l.unit === unit ? Number(l.displayWeight ?? canonicalWeightKg(l)) : (unit === 'lbs' ? canonicalWeightKg(l) * LBS_PER_KG : canonicalWeightKg(l)));
 const better = mode === 'assisted'
  ? (a, b) => (shown(b) < shown(a) || (shown(b) === shown(a) && Number(b.reps) > Number(a.reps))) ? b : a
  : (a, b) => (shown(b) > shown(a) || (shown(b) === shown(a) && Number(b.reps) > Number(a.reps))) ? b : a;
 const top = group.reduce(better);
 const w = Math.round(shown(top) * 10) / 10, reps = Number(top.reps) || 1, rir = rirOf(top);
 const step = unit === 'lbs' ? 5 : 2.5;
 const u = unit === 'lbs' ? 'باوند' : 'كجم';
 const was = `آخر جلسة (${top.date}): ${mode === 'bodyweight' ? 'وزن الجسم' : w + ' ' + u} × ${reps}${rir === null ? ' بدون RIR' : ' وRIR ' + (rir === 4 ? '4+' : rir)}.`;
 const out = (kind, weight, r, why) => ({ mode, unit, kind, weight, reps: r, date: top.date, basedOn: { weight: w, reps, rir }, reason: was + ' ' + why });
 if (mode === 'bodyweight') {
  if (rir === 0) return out('hold', 0, reps, 'وصلت للفشل، ثبّت نفس العدات لين تسويها وفيك عدة باقية.');
  return out('add-rep', 0, reps + 1, rir === null ? 'زد عدة وحدة.' : 'كان فيك عدات باقية، زد عدة.');
 }
 if (mode === 'assisted') {
  const less = Math.max(0, Math.round((w - step) * 100) / 100);
  if (rir === 0) return out('hold', w, reps, 'وصلت للفشل، ثبّت نفس المساعدة والعدات.');
  if ((rir !== null && rir >= 2) || reps >= REP_TOP) return out('less-assist', less, rir !== null && rir >= 2 && reps < REP_TOP ? reps : Math.min(reps, REP_RESET), `خفف المساعدة ${step} ${u} — المساعدة الأقل يعني حمل أكبر عليك.`);
  return out('add-rep', w, reps + 1, 'ثبّت المساعدة وزد عدة.');
 }
 const up = Math.round((w + step) * 100) / 100;
 const unitStep = `${step} ${u}${mode === 'per_hand' ? ' لكل يد' : ''}`;
 if (rir === 0) return out('hold', w, reps, 'وصلت للفشل، فثبّت نفس الوزن والعدات لين تسويها وفيك عدة باقية.');
 if (rir !== null && rir >= 3) return out('add-weight', up, reps, `كان باقي فيك 3 عدات أو أكثر، يعني الوزن صار خفيف عليك. زد ${unitStep} وخلك على ${reps} عدات.`);
 if (reps >= REP_TOP) return out('add-weight', up, REP_RESET, `وصلت ${reps} عدة${rir === null ? '' : ' وفيك عدات باقية'}. زد ${unitStep} وارجع ${REP_RESET} عدات وابنِ عليها.`);
 return out('add-rep', w, reps + 1, rir === null ? 'ما سجلت RIR، فالاقتراح على العدات: ثبّت الوزن وزد عدة.' : `باقي فيك ${rir === 1 ? 'عدة' : 'عدتين'}: ثبّت الوزن وزد عدة.`);
}

/* ---------- v10.8: التطور والتحليل ---------- */
/** العضلة الأساسية: من الجدول للتمارين الجاهزة، ومن الاسم للمخصصة، وإلا من الفئة. null للكارديو. */
function muscleOf(ex) {
 if (!ex || ex.type !== 'weights' || ex.category === 'cardio') return null;
 const known = GymCatalog.MUSCLE_BY_ID[ex.id];
 if (known && !ex.isCustom) return known;
 if (ex.category === 'legs') return 'legs';
 if (ex.category === 'abs') return 'abs';
 const n = String(ex.name || '').toLowerCase();
 if (/(ترايسيبس|تراي|بايسبس|بايسيبس|باي |مرجحة|هامر|مطرقة|tricep|bicep|curl|pushdown|kickback|skull)/i.test(n)) return 'arms';
 if (/(أكتاف|اكتاف|كتف|رفرفة|shoulder|lateral|delt|overhead|arnold|face ?pull|military)/i.test(n)) return 'shoulders';
 if (/(صدر|بنش|متوازي|bench|chest|fly|flye|pec|dip|crossover)/i.test(n)) return 'chest';
 if (/(ظهر|سحب|عقلة|عقله|ترابيس|row|pull|lat|shrug|deadlift)/i.test(n)) return 'back';
 return ex.category === 'push' ? 'chest' : ex.category === 'pull' ? 'back' : null;
}

const recordKey = l => l.exerciseId + '|' + (l.loadMode || 'external');
/** أعلى حمل وأعلى 1RM لكل تمرين وطريقة حمل (بدون التسخين). للتمارين الزمنية: أطول مدة. */
function personalRecords(logs) {
 const out = new Map();
 const sorted = logs.filter(l => l.type === 'weights' && l.setType !== 'warmup').slice().sort((a, b) => (a.timestamp || Date.parse(a.date) || 0) - (b.timestamp || Date.parse(b.date) || 0));
 for (const l of sorted) {
  const k = recordKey(l), mode = l.loadMode || 'external';
  let r = out.get(k);
  if (!r) { r = { exerciseId: l.exerciseId, exerciseName: l.exerciseName, mode, top: null, best1rm: null, count: 0 }; out.set(k, r); }
  r.count++;
  r.exerciseName = l.exerciseName || r.exerciseName;
  if (mode === 'timed') {
   const sec = Number(l.durationSeconds) || 0;
   if (!r.top || sec > r.top.value) r.top = { value: sec, reps: 1, date: l.date, logId: l.id };
   continue;
  }
  const w = progressWeightKg(l), reps = Number(l.reps) || 1;
  if (!Number.isFinite(w)) continue;
  if (!r.top || w > r.top.value + 1e-9 || (Math.abs(w - r.top.value) < 1e-9 && reps > r.top.reps)) r.top = { value: w, reps, date: l.date, logId: l.id };
  const rm = GymData.oneRepMax(w, reps);
  if (Number.isFinite(rm) && (!r.best1rm || rm > r.best1rm.value + 1e-9)) r.best1rm = { value: rm, date: l.date, logId: l.id };
 }
 return out;
}
/** هل الجولة الجديدة كسرت رقم قياسي؟ يقارن بالسجل قبلها فقط. أول جولة للتمرين ما تنحسب رقم قياسي. */
function newRecord(logsBefore, log) {
 if (!log || log.type !== 'weights' || log.setType === 'warmup') return null;
 const prev = personalRecords(logsBefore.filter(l => recordKey(l) === recordKey(log))).get(recordKey(log));
 if (!prev || !prev.top) return null;
 const mode = log.loadMode || 'external';
 if (mode === 'timed') { const sec = Number(log.durationSeconds) || 0; return sec > prev.top.value ? { kind: 'time', value: sec, previous: prev.top.value } : null; }
 const w = progressWeightKg(log), reps = Number(log.reps) || 1, rm = GymData.oneRepMax(w, reps);
 const load = w > prev.top.value + 1e-9;
 const strength = Number.isFinite(rm) && prev.best1rm && rm > prev.best1rm.value + 1e-9;
 if (!load && !strength) return null;
 return { kind: load && strength ? 'both' : load ? 'load' : '1rm', value: load ? w : rm, previous: load ? prev.top.value : prev.best1rm.value, oneRm: rm, previous1rm: prev.best1rm ? prev.best1rm.value : null };
}

const isoDate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
/** بداية الأسبوع (الأحد) لتاريخ YYYY-MM-DD. */
function weekStart(dateStr) { const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() - d.getDay()); return isoDate(d); }
/** أيام التمرين والأسابيع المتتالية. الأسبوع الحالي ما يكسر السلسلة لو ما تمرنت فيه لسه. */
function consistency(logs, today) {
 const days = new Set(logs.map(l => l.date).filter(Boolean));
 const weeks = new Set([...days].map(weekStart));
 let streak = 0;
 const cur = new Date(weekStart(today) + 'T12:00:00');
 if (!weeks.has(isoDate(cur))) cur.setDate(cur.getDate() - 7);
 while (weeks.has(isoDate(cur))) { streak++; cur.setDate(cur.getDate() - 7); }
 return { days, streak, thisWeekDays: [...days].filter(d => weekStart(d) === weekStart(today)).length };
}
/** جولات العمل لكل عضلة في أسبوع يبدأ من startDate (الأحد). */
function weeklyMuscleSets(logs, exercises, startDate) {
 const end = new Date(startDate + 'T12:00:00'); end.setDate(end.getDate() + 7);
 const endStr = isoDate(end);
 const byId = new Map(exercises.map(e => [e.id, e]));
 const out = { chest: 0, back: 0, shoulders: 0, arms: 0, legs: 0, abs: 0 };
 for (const l of logs) {
  if (l.type !== 'weights' || l.setType === 'warmup' || !l.date || l.date < startDate || l.date >= endStr) continue;
  const m = muscleOf(byId.get(l.exerciseId) || { id: l.exerciseId, name: l.exerciseName, category: l.category, type: 'weights' });
  if (m) out[m]++;
 }
 return out;
}

/* ---------- v11.3 (الدفعة 1) ---------- */
/** A4: جولات تسخين قبل وزن العمل. تتقرّب لأوزان تقدر تركّبها، وما تطلع إلا إذا الوزن يستاهل تسخين. */
function warmupSets(target, opts = {}) {
 const unit = opts.unit === 'lbs' ? 'lbs' : 'kg', mode = opts.mode || 'external';
 if (!(target > 0) || !['external', 'per_hand'].includes(mode)) return [];
 const step = mode === 'per_hand' ? (unit === 'lbs' ? 5 : 2) : (unit === 'lbs' ? 5 : 2.5);
 const bar = mode === 'external' && opts.barbell ? (Number(opts.barKg) > 0 ? Number(opts.barKg) : (unit === 'lbs' ? 45 : 20)) : 0;
 if (bar ? target < bar * 1.5 : target < step * 4) return [];
 const plan = bar ? [[0, 10], [0.5, 5], [0.7, 3], [0.85, 2]] : [[0.5, 8], [0.75, 4]];
 const out = [];
 for (const [f, reps] of plan) {
  let w = f === 0 ? bar : Math.round(target * f / step) * step;
  if (bar) w = Math.max(bar, w);
  w = Number(w.toFixed(2));
  if (w <= 0 || w >= target || (out.length && w <= out[out.length - 1].weight)) continue;
  out.push({ weight: w, reps });
 }
 return out;
}
/** B1: بدائل لنفس العضلة الأساسية. اللي سويتها قبل أول، وبعدها اللي أداتها مختلفة (الجهاز مشغول = جرب دمبل). */
function alternatives(exercises, logs, exId, limit = 3) {
 const ex = exercises.find(e => e.id === exId), m = muscleOf(ex);
 if (!m) return [];
 const used = new Map();
 for (const l of logs) if (l.type === 'weights') used.set(l.exerciseId, (used.get(l.exerciseId) || 0) + 1);
 return exercises.filter(e => e.id !== exId && !e.archived && e.type === 'weights' && muscleOf(e) === m)
  .map(e => ({ e, score: Math.min(used.get(e.id) || 0, 20) * 10 + (e.equip !== ex.equip ? 3 : 0) + (e.category === ex.category ? 1 : 0) }))
  .sort((a, b) => b.score - a.score || String(a.e.id).localeCompare(String(b.e.id))).slice(0, limit).map(x => x.e);
}
/** C3: خلاصة الجلسة: الأرقام اللي انكسرت، وأكثر عضلة متأخرة عن الأسبوع الماضي (من الأربعاء وطالع، عشان بداية الأسبوع ما تبين كل شي متأخر). */
function sessionInsights(logs, exercises, sessionId, today) {
 const mine = logs.filter(l => l.sessionId === sessionId && l.type === 'weights').sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
 const acc = logs.filter(l => l.sessionId !== sessionId);
 const records = [];
 for (const l of mine) { if (newRecord(acc, l) && !records.includes(l.exerciseName)) records.push(l.exerciseName); acc.push(l); }
 let behind = null;
 const day = new Date(today + 'T12:00:00').getDay();
 if (day >= 3) {
  const ws = weekStart(today), prevStart = new Date(ws + 'T12:00:00'); prevStart.setDate(prevStart.getDate() - 7);
  const now = weeklyMuscleSets(logs, exercises, ws), prev = weeklyMuscleSets(logs, exercises, isoDate(prevStart));
  for (const k of Object.keys(now)) { const d = prev[k] - now[k]; if (d >= 3 && (!behind || d > behind.diff)) behind = { muscle: k, now: now[k], last: prev[k], diff: d }; }
 }
 return { records, behind };
}
/** E1: صفوف CSV (Excel يفتحها). القيم اللي فيها فاصلة أو علامة تنصيص تنحط بين علامتين. */
function toCSV(rows) {
 const cell = v => {
  const s = v == null ? '' : String(v);
  // a cell starting with = + - @ can run as a formula in Excel; plain numbers like -2.5 stay numbers
  const risky = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);
  return risky || /[",\n\r]/.test(s) ? '"' + (risky ? "'" : '') + s.replace(/"/g, '""') + '"' : s;
 };
 return rows.map(r => r.map(cell).join(',')).join('\r\n');
}

window.GymCalc = { LBS_PER_KG, warmupSets, alternatives, sessionInsights, toCSV, muscleOf, personalRecords, newRecord, weekStart, consistency, weeklyMuscleSets, canonicalWeightKg, volumeLoadKg, progressWeightKg, calories, weightSessionCalories, sessionSummary, bodyMetrics, progressionGroups, defaultLoadMode, classifyExercise, suggestNext };
})();
