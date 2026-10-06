/* Gym Tracker — الرسمة فوق الوزن (عرض فقط).
 * ما تلمس البيانات ولا الحسابات: تاخذ وصف (نوع الأداة + الأرقام) وترسم SVG.
 * الأنواع: bar · plates (جهاز بأقراص) · pin (جهاز/كيبل بدبوس) · dumbbell · body · timed · treadmill · cardio
 */
(() => {
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const C = { red: '#C8322A', blue: '#2F5DA8', yellow: '#E3B21B', green: '#2E8B57', white: '#EDEBE6', steel: '#8C8A84', dark: '#262625', line: '#333331', ink: '#EDEBE6', mute: '#9A978F', led: '#FF3B1F' };
// أقراص الكيلو (ألوان الاتحاد الدولي) وأقراص الباوند
const KG_PLATES = [[25, C.red, 1, 15], [20, C.blue, 1, 13], [15, C.yellow, .9, 12], [10, C.green, .8, 10], [5, C.white, .62, 8], [2.5, C.red, .5, 6], [1.25, C.steel, .42, 5]];
const LB_PLATES = [[55, C.red, 1, 15], [45, C.blue, 1, 13], [35, C.yellow, .9, 12], [25, C.green, .8, 10], [10, C.white, .62, 8], [5, C.red, .5, 6], [2.5, C.steel, .42, 5]];
const fmt = n => String(Math.round(n * 100) / 100);

function el(name, attrs, parent, text) {
 const e = document.createElementNS(NS, name);
 for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
 if (text !== undefined) e.textContent = text;
 if (parent) parent.appendChild(e);
 return e;
}
function svg(w, h, label) {
 const s = el('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
 s.style.maxHeight = h + 'px';
 return s;
}

/** أقراص جهة وحدة بطريقة الجشع، مع الباقي اللي ما تقدر تركبه. */
function platesPerSide(perSide, unit) {
 const set = unit === 'lbs' ? LB_PLATES : KG_PLATES;
 const out = []; let left = Math.round(perSide * 1000) / 1000;
 for (const p of set) { while (left + 1e-6 >= p[0] && out.length < 12) { out.push(p); left = Math.round((left - p[0]) * 1000) / 1000; } }
 return { plates: out, rest: left > 0.01 ? left : 0 };
}
/** لون أكبر قرص (لشاشة التطور). */
function heaviestPlateColor(totalKg, barKg) {
 const per = (Number(totalKg) - (Number(barKg) || 0)) / 2;
 if (!(per > 0)) return null;
 const p = platesPerSide(per, 'kg').plates[0];
 return p ? { color: p[1], kg: p[0] } : null;
}

function drawPlateSide(s, plates, xStart, dir, cy, maxH) {
 let x = xStart;
 for (const [, color, hk, w] of plates) {
  const h = maxH * hk;
  el('rect', { x: dir > 0 ? x : x - w, y: cy - h / 2, width: w, height: h, rx: 2, fill: color }, s);
  x += dir * (w + 2);
 }
 return x;
}

function bar(spec) {
 const unit = spec.unit === 'lbs' ? 'lbs' : 'kg';
 const barW = Number.isFinite(spec.barKg) ? spec.barKg : (unit === 'lbs' ? 45 : 20);
 const perSide = (spec.total - barW) / 2;
 const s = svg(360, 120, 'رسمة البار');
 const cy = 60;
 el('rect', { x: 8, y: cy - 4, width: 344, height: 8, rx: 3, fill: C.steel }, s);
 el('rect', { x: 140, y: cy - 6, width: 80, height: 12, rx: 2, fill: '#6F6D68' }, s);
 for (let i = 0; i < 16; i++) el('line', { x1: 144 + i * 4.8, x2: 144 + i * 4.8, y1: cy - 6, y2: cy + 6, stroke: '#55534F', 'stroke-width': 1 }, s);
 el('rect', { x: 92, y: cy - 10, width: 8, height: 20, rx: 2, fill: '#8A8883' }, s);
 el('rect', { x: 260, y: cy - 10, width: 8, height: 20, rx: 2, fill: '#8A8883' }, s);
 let caption;
 if (perSide < 0) caption = `أقل من وزن البار (${fmt(barW)})`;
 else {
  const { plates, rest } = platesPerSide(perSide, unit);
  drawPlateSide(s, plates, 268 + 2, 1, cy, 100);
  drawPlateSide(s, plates, 92 - 2, -1, cy, 100);
  caption = perSide === 0 ? `البار فاضي (${fmt(barW)})` : `كل جهة: ${plates.map(p => fmt(p[0])).join(' + ') || '—'}${rest ? ` (+${fmt(rest)} ما له قرص)` : ''} · البار ${fmt(barW)}`;
 }
 return { node: s, caption };
}

function plates(spec) {
 const unit = spec.unit === 'lbs' ? 'lbs' : 'kg';
 const perSide = spec.total / 2;
 const s = svg(360, 120, 'رسمة جهاز بأقراص');
 const cy = 60;
 el('path', { d: 'M110 34 L262 34 L250 86 L98 86 Z', fill: '#2A2A29', stroke: C.line }, s);
 el('rect', { x: 84, y: cy - 4, width: 30, height: 8, fill: C.steel }, s);
 el('rect', { x: 246, y: cy - 4, width: 30, height: 8, fill: C.steel }, s);
 const { plates: list, rest } = platesPerSide(perSide, unit);
 drawPlateSide(s, list, 276, 1, cy, 100);
 drawPlateSide(s, list, 84, -1, cy, 100);
 const machine = spec.machineKg > 0 ? ` · + الجهاز ${fmt(spec.machineKg)}` : ' · وزن الجهاز ما انحسب';
 return { node: s, caption: `كل جهة: ${list.map(p => fmt(p[0])).join(' + ') || '—'}${rest ? ` (+${fmt(rest)})` : ''}${machine}` };
}

function pin(spec) {
 const unit = spec.unit === 'lbs' ? 'lbs' : 'kg';
 let step = unit === 'lbs' ? 10 : 5;
 if (spec.total / step > 20) step *= 2;
 const pinAt = Math.max(1, Math.round(spec.total / step));
 const count = Math.min(24, Math.max(12, pinAt + 3));
 const s = svg(360, 140, 'رسمة عمود أوزان الجهاز');
 const slabH = Math.min(9, 118 / count), x = 128, w = 104;
 el('line', { x1: x + w / 2, x2: x + w / 2, y1: 4, y2: 134, stroke: '#55534F', 'stroke-width': 3 }, s);
 for (let i = 0; i < count; i++) {
  const y = 10 + i * slabH;
  const lifted = i < pinAt;
  el('rect', { x, y, width: w, height: slabH - 2, fill: lifted ? C.white : '#3A3A38' }, s);
 }
 const py = 10 + (pinAt - 1) * slabH + (slabH - 2) / 2;
 el('rect', { x: x + w - 6, y: py - 4, width: 36, height: 8, rx: 4, fill: C.red }, s);
 const exact = Math.abs(pinAt * step - spec.total) < 0.01;
 const machine = spec.machineKg > 0 ? ` · + الجهاز ${fmt(spec.machineKg)}` : '';
 return { node: s, caption: `الدبوس على ${fmt(spec.total)}${exact ? '' : ' (الرسمة بخطوة ' + step + ')'}${machine}` };
}

function dumbbell(spec) {
 const s = svg(360, 100, 'رسمة دمبلين');
 const one = (cx) => {
  el('rect', { x: cx - 48, y: 30, width: 18, height: 40, rx: 3, fill: C.white }, s);
  el('rect', { x: cx + 30, y: 30, width: 18, height: 40, rx: 3, fill: C.white }, s);
  el('rect', { x: cx - 30, y: 46, width: 60, height: 8, fill: C.steel }, s);
 };
 one(110); one(250);
 return { node: s, caption: `${fmt(spec.total)} لكل يد · الحجم يحسب اليدين (×2)` };
}

function body(spec) {
 const s = svg(360, 110, 'رسمة وزن الجسم');
 const fx = spec.mode === 'bodyweight' ? 180 : 214;
 el('circle', { cx: fx, cy: 22, r: 10, fill: 'none', stroke: C.white, 'stroke-width': 3 }, s);
 el('path', { d: `M${fx} 32 V66 M${fx - 18} 46 H${fx + 18} M${fx} 66 L${fx - 14} 94 M${fx} 66 L${fx + 14} 94`, stroke: C.white, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, s);
 if (spec.mode !== 'bodyweight') {
  const color = spec.mode === 'assisted' ? '#3A3A38' : C.green;
  el('rect', { x: 120, y: 30, width: 40, height: 50, rx: 3, fill: color, stroke: spec.mode === 'assisted' ? C.mute : 'none', 'stroke-dasharray': spec.mode === 'assisted' ? '4 3' : '' }, s);
  el('text', { x: 140, y: 61, 'text-anchor': 'middle', fill: C.ink, 'font-size': 16, class: 'num-led' }, s, fmt(spec.extra));
  el('text', { x: 178, y: 61, 'text-anchor': 'middle', fill: C.mute, 'font-size': 22 }, s, spec.mode === 'assisted' ? '−' : '+');
 }
 const bw = fmt(spec.bodyKg || 0);
 const caption = !spec.bodyKg ? 'أدخل وزن جسمك في البروفايل'
  : spec.mode === 'bodyweight' ? `وزن جسمك ${bw}`
  : spec.mode === 'added' ? `وزنك ${bw} + ${fmt(spec.extra)} = ${fmt(spec.bodyKg + spec.extra)}`
  : `وزنك ${bw} − مساعدة ${fmt(spec.extra)} = ${fmt(Math.max(0, spec.bodyKg - spec.extra))}`;
 return { node: s, caption };
}

function led(cells, label) {
 const wrap = document.createElement('div');
 wrap.className = 'led-panel';
 wrap.setAttribute('role', 'img'); wrap.setAttribute('aria-label', label);
 for (const c of cells) {
  const cell = document.createElement('div'); cell.className = 'led-cell';
  const t = document.createElement('span'); t.className = 'led-label'; t.textContent = c.label;
  const v = document.createElement('span'); v.className = 'led-value num-led'; v.style.color = c.color || C.ink; v.textContent = c.value; if (!/^[\d:.\-—]+$/.test(String(c.value))) v.classList.add('led-text');
  cell.append(t, v); wrap.appendChild(cell);
 }
 return wrap;
}
const mmss = sec => { sec = Math.max(0, Math.round(Number(sec) || 0)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

function render(host, spec) {
 if (!host) return;
 if (!spec) { host.replaceChildren(); host.hidden = true; return; }
 let out;
 if (spec.kind === 'timed') out = { node: led([{ label: 'المدة', value: mmss(spec.seconds), color: C.led }], 'المدة'), caption: 'بدل الوزن: المدة بالثواني' };
 else if (spec.kind === 'treadmill') out = { node: led([{ label: 'السرعة كم/س', value: fmt(spec.speed), color: C.led }, { label: 'الميل %', value: Number(spec.incline || 0).toFixed(1), color: C.yellow }, { label: 'المدة', value: mmss((spec.minutes || 0) * 60) }], 'شاشة جهاز المشي'), caption: 'نفس شاشة الجهاز' };
 else if (spec.kind === 'cardio') out = { node: led([{ label: 'الشدة', value: spec.intensityLabel || '—', color: C.yellow }, { label: 'الواط', value: spec.watts ? fmt(spec.watts) : '—', color: C.led }, { label: 'المدة', value: mmss((spec.minutes || 0) * 60) }], 'شاشة جهاز الكارديو'), caption: '' };
 else {
  const fn = { bar, plates, pin, dumbbell, body }[spec.kind];
  if (!fn || !Number.isFinite(spec.total) && spec.kind !== 'body') { host.replaceChildren(); host.hidden = true; return; }
  out = fn(spec);
 }
 const cap = document.createElement('p'); cap.className = 'equip-caption'; cap.textContent = out.caption;
 host.hidden = false;
 host.dataset.kind = spec.kind;
 host.replaceChildren(out.node, cap);
}

window.GymVisual = Object.freeze({ render, platesPerSide, heaviestPlateColor, COLORS: C });
})();
