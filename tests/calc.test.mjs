// تشغيل: node --test tests/
// 1) يقارن كل دالة في calc.js مع نسختها الأصلية (v10.3) على آلاف المدخلات العشوائية: لازم تطلع نفس النتيجة بالضبط.
// 2) يتأكد من أرقام محسوبة يدوياً (1RM، السعرات، الحجم، BMR/TDEE/BMI/WHtR/FFMI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);

function loadSite() {
  const ctx = { console, Date, Math, JSON, Number, String, Object, Array, Map, Set, Error, parseFloat, parseInt, isFinite };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['data.js', 'catalog.js', 'calc.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const site = loadSite();
const { GymCalc, GymData, GymCatalog } = site;

// deterministic random numbers so a failure can be reproduced
let seed = 20261006;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = a => a[Math.floor(rnd() * a.length)];
const maybe = (v, p = 0.5) => (rnd() < p ? v : undefined);
const num = (lo, hi, step = 0.5) => Math.round((lo + rnd() * (hi - lo)) / step) * step;
const MODES = ['external', 'per_hand', 'bodyweight', 'added', 'assisted', 'timed', undefined];
const SET_TYPES = ['normal', 'warmup', 'dropset', 'superset', 'failure', 'drop', undefined];
const plain = x => JSON.parse(JSON.stringify(x));

function randomLog(i, exIds, sessionIds) {
  const type = pick(['weights', 'weights', 'weights', 'treadmill', 'bike_elliptical']);
  const l = { id: 'log_' + i, type, exerciseId: pick(exIds), date: pick(['2026-09-01', '2026-09-08', '2026-10-01', '2026-10-06']),
    timestamp: maybe(1790000000000 + Math.floor(rnd() * 1e9), 0.85), sessionId: maybe(pick(sessionIds), 0.8) };
  if (type === 'weights') Object.assign(l, {
    loadMode: pick(MODES), setType: pick(SET_TYPES), unit: pick(['kg', 'lbs', undefined]),
    weight: maybe(num(0, 200), 0.8), displayWeight: maybe(num(0, 400), 0.7), reps: pick([1, 3, 5, 8, 10, 12, 15, 20, '8', undefined]),
    rir: pick([null, undefined, '', 0, 1, 2, 3, 4, 1.5]), effectiveLoadKg: maybe(num(0, 250), 0.6), volumeLoadKg: maybe(num(0, 300), 0.5),
    durationSeconds: maybe(num(10, 300, 5), 0.3), bodyWeightKgAtLog: maybe(num(50, 120), 0.5) });
  else Object.assign(l, { duration: pick([5, 15, 20, 30, 45, 60, undefined]), calories: maybe(num(0, 600, 0.1), 0.9),
    speed: maybe(num(1, 20, 0.1)), incline: pick([0, 1, 5.5, 12, undefined]), movement: pick(['walking', 'running', undefined]),
    machine: pick(['bike', 'elliptical', 'stairs', 'rowing', 'airbike', 'nonsense', undefined]), intensity: pick(['light', 'moderate', 'vigorous', 'x', undefined]),
    watts: pick([undefined, null, 0, 140, 250]), bodyWeightKgAtLog: maybe(num(50, 120), 0.6) });
  return l;
}
function randomProfile() {
  return { weight: pick(['', 0, num(40, 150, 0.1), '82.5']), height: pick(['', num(140, 210, 1), '178']), waist: pick(['', num(60, 130)]),
    age: pick(['', num(15, 70, 1)]), fat: pick(['', num(5, 40, 0.1)]), muscle: pick(['', num(25, 50, 0.1)]), water: pick(['', num(45, 65, 0.1)]),
    isMan: pick([true, false, undefined]), activityFactor: pick([1.2, 1.375, 1.55, 1.725, 1.9, '', undefined]) };
}

test('calc.js gives exactly the same results as v10.3 on 3000 random cases', () => {
  const exIds = ['ex_1', 'ex_3', 'ex_19', 'ex_22', 'ex_31', 'ex_32', 'ex_48', 'ex_62', 'ex_64', 'ex_65', 'ex_custom'];
  const sessionIds = ['s1', 's2', 's3'];
  for (let round = 0; round < 3000; round++) {
    const profile = randomProfile();
    const state = { profile, logs: [] };
    const ref = require('./reference-v10.3.cjs')(state, GymData);
    const logs = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) => randomLog(round * 100 + i, exIds, sessionIds));
    state.logs = logs;
    for (const l of logs) {
      assert.deepEqual(GymCalc.canonicalWeightKg(l), ref.getCanonicalWeightKg(l), 'canonicalWeightKg ' + JSON.stringify(l));
      assert.deepEqual(GymCalc.volumeLoadKg(l), ref.getVolumeLoadKg(l), 'volumeLoadKg ' + JSON.stringify(l));
      assert.deepEqual(GymCalc.progressWeightKg(l), ref.getProgressWeightKg(l), 'progressWeightKg ' + JSON.stringify(l));
      for (const t of ['weights', 'treadmill', 'bike_elliptical'])
        assert.deepEqual(GymCalc.calories(t, l, profile.weight), ref.calculateCalories(t, l), 'calories ' + t + ' ' + JSON.stringify(l));
    }
    const session = { startedAt: 1790000000000, endedAt: pick([null, 1790000000000 + Math.floor(rnd() * 7.2e6)]), bodyWeightKgAtStart: pick([undefined, 0, num(50, 120)]) };
    const now = 1790000000000 + 3.6e6;
    const realNow = Date.now; Date.now = () => now;
    try {
      assert.deepEqual(GymCalc.weightSessionCalories(session, logs, now), ref.estimateWeightSessionCalories(session, logs), 'session calories');
    } finally { Date.now = realNow; }
    for (const ex of exIds) for (const mode of ['external', 'per_hand', 'bodyweight', 'added', 'assisted', 'timed'])
      assert.deepEqual(plain(GymCalc.progressionGroups(logs, ex, mode)), plain(ref.progressionGroups(ex, mode).groups), 'progression ' + ex + ' ' + mode);
    assert.deepEqual(plain(GymCalc.bodyMetrics(profile)), plain(ref.bodyMetrics()), 'bodyMetrics ' + JSON.stringify(profile));
  }
});

test('session summary equals the fields v10.3 wrote on a finished session', () => {
  for (let round = 0; round < 500; round++) {
    const logs = Array.from({ length: 1 + Math.floor(rnd() * 15) }, (_, i) => randomLog(i, ['ex_1', 'ex_3', 'ex_64'], ['s1']));
    const session = { startedAt: 1790000000000, endedAt: 1790000000000 + Math.floor(rnd() * 7.2e6), bodyWeightKgAtStart: pick([undefined, 80]) };
    const ref = require('./reference-v10.3.cjs')({ profile: {}, logs }, GymData);
    const working = logs.filter(l => l.type === 'weights' && l.setType !== 'warmup');
    const est = ref.estimateWeightSessionCalories(session, logs);
    const cardio = logs.filter(l => l.type !== 'weights').reduce((n, l) => n + (Number(l.calories) || 0), 0);
    const expected = { estimatedCalories: est, cardioCalories: cardio, totalEstimatedCalories: Math.round((est + cardio) * 10) / 10,
      totalVolumeKg: working.reduce((s, l) => s + ref.getVolumeLoadKg(l) * (Number(l.reps) || 1), 0), workingSets: working.length,
      exerciseIds: [...new Set(logs.map(l => l.exerciseId))] };
    assert.deepEqual(plain(GymCalc.sessionSummary(session, logs)), plain(expected));
  }
});

test('exercise classification and default load mode match v10.3 for every name and exercise', () => {
  const ref = require('./reference-v10.3.cjs')({ profile: {}, logs: [] }, GymData);
  const names = [...GymCatalog.DEFAULT_EXERCISES.map(e => e.name.toLowerCase()), ...Object.keys(GymCatalog.EXERCISE_DICTIONARY),
    'hip thrust barbell', 'ضغط ارجل', 'رفرفة خلفي', 'تجديف', 'cable fly', 'شي غريب', 'leg curl machine', 'ez bar curl', 'plank'];
  for (const n of names) assert.deepEqual(plain(GymCalc.classifyExercise(n)), plain(ref.runLocalClassification(n)), n);
  for (const ex of [...GymCatalog.DEFAULT_EXERCISES, null, { id: 'x', equip: 'dumbbell' }]) assert.equal(GymCalc.defaultLoadMode(ex), ref.getDefaultLoadMode(ex));
});

test('catalog: 69 exercises, unique ids, presets point to real exercises', () => {
  const ex = GymCatalog.DEFAULT_EXERCISES;
  assert.equal(ex.length, 69);
  assert.equal(new Set(ex.map(e => e.id)).size, 69);
  for (const ids of Object.values(GymCatalog.ROUTINE_PRESETS)) for (const id of ids) assert.ok(ex.some(e => e.id === id), id);
});

test('hand-calculated values', () => {
  assert.equal(GymData.oneRepMax(60, 11), 82);
  assert.equal(GymData.oneRepMax(60, 12), 84);
  assert.equal(GymData.oneRepMax(80, 8), 101.3);
  assert.equal(GymData.oneRepMax(100, 1), 100);
  assert.equal(GymData.oneRepMax(100, 16), null);
  // treadmill 5.5 km/h, 1% incline, 20 min, 80 kg (walking ACSM)
  assert.equal(GymCalc.calories('treadmill', { speed: 5.5, incline: 1, duration: 20, movement: 'walking' }, 80), 86.5);
  // stationary bike, moderate (6.8 MET), 15 min, 80 kg
  assert.equal(GymCalc.calories('bike_elliptical', { machine: 'bike', intensity: 'moderate', duration: 15 }, 80), 116);
  assert.equal(GymCalc.calories('weights', { weight: 100, reps: 10 }, 80), 0);
  // per-hand dumbbells count both hands in volume; lbs stored as kg
  assert.equal(GymCalc.volumeLoadKg({ loadMode: 'per_hand', weight: 20 }), 40);
  assert.equal(GymCalc.canonicalWeightKg({ unit: 'lbs', displayWeight: 135 }), 135 / 2.20462);
  const m = GymCalc.bodyMetrics({ weight: 80, height: 178, waist: 85, age: 30, fat: 18, activityFactor: 1.55, isMan: true });
  assert.equal(m.tdee, Math.round((800 + 1112.5 - 150 + 5) * 1.55));
  assert.equal(m.bmi, '25.2');
  assert.equal(m.whtr, '0.48');
  assert.equal(m.ffmi, '20.8');
  assert.equal(GymCalc.bodyMetrics({ weight: 80 }), null);
});

test('machine weight (v10.6): optional, external only, old logs unchanged', () => {
  const base = { id: 'l1', date: '2026-10-06', exerciseId: 'ex_1', exerciseName: 'ليق برس', type: 'weights', category: 'legs', unit: 'kg', reps: 10, loadMode: 'external' };
  // without machineKg: exactly as before
  const old = GymData.validateLog({ ...base, weight: 100 });
  assert.equal(old.effectiveLoadKg, 100); assert.equal(old.volumeLoadKg, 100); assert.equal(old.machineKg, undefined);
  // with machineKg 40: load counts 140 for volume, progress and 1RM; the typed plates stay 100
  const m = GymData.validateLog({ ...base, weight: 100, machineKg: 40 });
  assert.equal(m.displayWeight, 100); assert.equal(m.machineKg, 40);
  assert.equal(m.effectiveLoadKg, 140); assert.equal(m.volumeLoadKg, 140);
  assert.equal(m.oneRepMax, GymData.oneRepMax(140, 10));
  assert.equal(GymCalc.progressWeightKg(m), 140);
  assert.equal(GymCalc.volumeLoadKg({ loadMode: 'external', weight: 100, machineKg: 40 }), 140);
  // other modes ignore it
  const d = GymData.validateLog({ ...base, loadMode: 'per_hand', weight: 20, machineKg: 40 });
  assert.equal(d.machineKg, undefined); assert.equal(d.volumeLoadKg, 40);
  // zero means nothing stored
  assert.equal(GymData.validateLog({ ...base, weight: 100, machineKg: 0 }).machineKg, undefined);
  // exercise settings survive import validation
  const v = GymData.validate({ exercises: [{ id: 'ex_1', name: 'ليق برس', category: 'legs', type: 'weights', equip: 'machine', machineKg: 40, rig: 'plates' }, { id: 'ex_2', name: 'بنش', category: 'push', type: 'weights', equip: 'barbell', barKg: 15 }] });
  assert.equal(v.exercises[0].machineKg, 40); assert.equal(v.exercises[0].rig, 'plates'); assert.equal(v.exercises[1].barKg, 15);
  assert.throws(() => GymData.validate({ exercises: [{ id: 'ex_1', name: 'x', category: 'legs', type: 'weights', rig: 'rocket' }] }));
});
