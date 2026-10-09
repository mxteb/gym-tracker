// Checks the new features end to end in a real browser, in Arabic and in English, and saves screenshots.
// Each batch adds its own steps. Fails (exit 1) on any broken step, JS error or (in English) any missing translation.
// Usage: node tests/features.mjs <url> [outDir] [chromePath]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [url, outDir = 'features-out', chrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'] = process.argv.slice(2);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(outDir, { recursive: true });

function fixture(lang) {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'fixture-backup.json'), 'utf8'));
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = s => (s === 'TODAY' ? today : s);
  // bench press has no set today, so its warm-up chips show (every other exercise was already done today)
  raw.logs = raw.logs.filter(l => !(l.exerciseId === 'ex_1' && l.date === 'TODAY'));
  raw.logs.forEach(l => { l.date = shift(l.date); });
  raw.sessions.forEach(s => { s.date = shift(s.date); });
  raw.profile.history.forEach(h => { h.date = shift(h.date); });
  if (raw.profile) raw.profile.lang = lang; // the app follows the saved profile language on start
  return raw;
}

async function open(lang, port) {
  const dir = fs.mkdtempSync('/tmp/gt-feat-');
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, url], { stdio: 'ignore' });
  let list;
  for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.some(t => t.type === 'page')) break; } catch { } await sleep(200); }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  for (let i = 0; i < 20; i++) {
    try { if (await ev(`return location.protocol.startsWith('http') && document.readyState !== 'loading' && document.documentElement.lang === '${lang}'`)) break; } catch { }
    try { await ev(`if (!location.protocol.startsWith('http')) return false; localStorage.setItem('gym_lang','${lang}'); setTimeout(() => location.reload(), 30); return true`); } catch { }
    await sleep(800);
  }
  const ready = async () => { for (let i = 0; i < 100; i++) { try { if (await ev(`return !!document.querySelector('#exercise-dropdown option') && !!window.GymStorage`)) return; } catch { } await sleep(200); } };
  await ready();
  const clearToasts = () => ev(`document.getElementById('toast-container')?.replaceChildren()`);
  const shot = async name => {
    await clearToasts();
    const m = await send('Page.getLayoutMetrics');
    const h = Math.min(Math.ceil(m.result.cssContentSize.height), 2600);
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 393, height: h, scale: 1 } });
    fs.writeFileSync(path.join(outDir, `${lang}-${name}.png`), Buffer.from(r.result.data, 'base64'));
  };
  const shotEl = async (name, selector) => {
    await clearToasts();
    const box = await ev(`const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+scrollX, y:r.y+scrollY, w:r.width, h:r.height}`);
    const pad = 8;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(393, box.w + pad * 2), height: box.h + pad * 2, scale: 1 } });
    fs.writeFileSync(path.join(outDir, `${lang}-${name}.png`), Buffer.from(r.result.data, 'base64'));
  };
  return { ev, send, shot, shotEl, errors, ready, close: () => { ws.close(); proc.kill(); } };
}

const failures = [];
function check(lang, name, ok, detail = '') { console.log(`${ok ? '✔' : '✘'} [${lang}] ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failures.push(`[${lang}] ${name} ${detail}`); }

async function run(lang, port) {
  const p = await open(lang, port);
  const { ev } = p;
  const b64 = Buffer.from(JSON.stringify(fixture(lang))).toString('base64');
  await ev(`const bytes=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0)); const f=new File([bytes],'f.json',{type:'application/json'}); const dt=new DataTransfer(); dt.items.add(f); const i=document.getElementById('import-file-input'); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true}));`);
  await sleep(1500);
  await ev(`document.querySelectorAll('.modal-overlay:not(.hidden) #modal-cancel-btn').forEach(b=>b.click()); document.getElementById('nav-workout').click();`);
  const toast = `return [...document.querySelectorAll('#toast-container > div')].map(d=>d.textContent).pop()||''`;
  const select = id => ev(`const d=document.getElementById('exercise-dropdown'); d.value=${JSON.stringify(id)}; d.dispatchEvent(new Event('change',{bubbles:true})); return d.value`);

  /* ---------- Batch 1 ---------- */
  // an exercise with a weighted suggestion and no working set today, so the warm-up chips show
  const exId = await ev(`const d=document.getElementById('exercise-dropdown');
    for (const o of d.options) { d.value=o.value; d.dispatchEvent(new Event('change',{bubbles:true}));
      if (!document.getElementById('sugg-warmup').classList.contains('hidden')) return o.value; }
    return null`);
  check(lang, 'A4 warm-up chips show for an exercise with a suggestion', !!exId, exId || 'none found');
  if (exId) {
    const chips = await ev(`return [...document.querySelectorAll('.sugg-wchip')].map(b=>b.textContent)`);
    check(lang, 'A4 chips are labelled', chips.length >= 2, chips.join(' | '));
    await ev(`document.querySelector('.sugg-wchip').click()`);
    const filled = await ev(`return {w:document.getElementById('input-weight').value, type:document.querySelector('.set-type-btn[aria-pressed="true"]')?.dataset.settype}`);
    check(lang, 'A4 chip fills a warm-up set', filled.type === 'warmup' && Number(filled.w) > 0, JSON.stringify(filled));
    await ev(`document.getElementById('btn-apply-suggestion').click()`);
    check(lang, 'A4 applying the suggestion goes back to a normal set', await ev(`return document.querySelector('.set-type-btn[aria-pressed="true"]')?.dataset.settype`) === 'normal');
    await ev(`document.querySelector('.sugg-wchip').click()`);
    await p.shotEl('a4-warmup', '#next-suggestion');
  }
  const ex = exId || await ev(`return document.getElementById('exercise-dropdown').options[0].value`);
  await select(ex);

  // B2 note
  check(lang, 'B2 note row shows', await ev(`return !document.getElementById('ex-note').classList.contains('hidden')`));
  await ev(`document.getElementById('ex-note-show').click()`);
  check(lang, 'B2 tapping opens the editor', await ev(`return !document.getElementById('ex-note-edit').classList.contains('hidden') && document.activeElement.id==='ex-note-input'`));
  await ev(`const i=document.getElementById('ex-note-input'); i.value='Seat 4 — قبضة واسعة, <b>x</b>'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await sleep(400);
  const note = await ev(`return {text:document.querySelector('#ex-note-show .ex-note-text')?.textContent, html:document.querySelector('#ex-note-show .ex-note-text')?.innerHTML}`);
  check(lang, 'B2 note is saved and shown as text (not HTML)', note.text === 'Seat 4 — قبضة واسعة, <b>x</b>' && !/<b>/.test(note.html), JSON.stringify(note));
  check(lang, 'B2 toast', /الملاحظة|Note saved/.test(await ev(toast)));
  await p.shotEl('b2-note', '#ex-note');

  // B3 rest per exercise
  await ev(`const s=document.getElementById('rest-timer-duration'); s.value='180'; s.dispatchEvent(new Event('change',{bubbles:true}))`);
  await sleep(400);
  const other = await ev(`const d=document.getElementById('exercise-dropdown'); return [...d.options].map(o=>o.value).find(v=>v!==${JSON.stringify(ex)})`);
  await select(other);
  await ev(`const s=document.getElementById('rest-timer-duration'); s.value='60'; s.dispatchEvent(new Event('change',{bubbles:true}))`);
  await sleep(400);
  await select(ex);
  check(lang, 'B3 rest comes back per exercise', await ev(`return document.getElementById('rest-timer-duration').value`) === '180');
  await select(other);
  check(lang, 'B3 the other exercise keeps its own rest', await ev(`return document.getElementById('rest-timer-duration').value`) === '60');

  // survives a reload (storage + import whitelist)
  await ev(`location.reload()`); await sleep(1000); await p.ready(); await sleep(500);
  await select(ex);
  check(lang, 'B2+B3 kept after reload', await ev(`return document.querySelector('#ex-note-show .ex-note-text')?.textContent==='Seat 4 — قبضة واسعة, <b>x</b>' && document.getElementById('rest-timer-duration').value==='180'`));
  // clearing the note
  await ev(`document.getElementById('ex-note-show').click(); const i=document.getElementById('ex-note-input'); i.value='  '; document.getElementById('ex-note-save').click()`);
  await sleep(400);
  check(lang, 'B2 empty note removes it', await ev(`return document.getElementById('ex-note-show').dataset.empty==='1'`));
  // Escape cancels editing
  await ev(`document.getElementById('ex-note-show').click(); const i=document.getElementById('ex-note-input'); i.value='zzz'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  check(lang, 'B2 Escape cancels', await ev(`return document.getElementById('ex-note-edit').classList.contains('hidden') && document.getElementById('ex-note-show').dataset.empty==='1'`));
  // put a note back for the screenshots
  await ev(`document.getElementById('ex-note-show').click(); const i=document.getElementById('ex-note-input'); i.value=${JSON.stringify(lang === 'en' ? 'Seat on 4, wide grip' : 'الكرسي على 4، قبضة واسعة')}; document.getElementById('ex-note-save').click()`);
  await sleep(400);

  // A6 easy / right / hard
  await ev(`document.getElementById('nav-profile').click(); const c=document.getElementById('set-feel'); c.click();`);
  await sleep(400);
  check(lang, 'A6 setting saved', await ev(`return document.getElementById('set-feel').checked`));
  await ev(`document.getElementById('nav-workout').click()`);
  check(lang, 'A6 feel buttons replace RIR', await ev(`return !document.getElementById('feel-container').classList.contains('hidden') && document.getElementById('rir-container').classList.contains('hidden')`));
  await ev(`document.querySelector('.feel-btn[data-feel-rir="3"]').click()`);
  check(lang, 'A6 Easy = RIR 3', await ev(`return document.querySelector('.rir-btn[data-rir="3"]').getAttribute('aria-pressed')==='true' && document.querySelector('.feel-btn[data-feel-rir="3"]').getAttribute('aria-pressed')==='true'`));
  await ev(`document.querySelector('.feel-btn[data-feel-rir="3"]').click()`);
  check(lang, 'A6 tapping again clears it', await ev(`return document.querySelector('.rir-btn[data-rir=""]').getAttribute('aria-pressed')==='true'`));
  await ev(`document.querySelector('.feel-btn[data-feel-rir="2"]').click()`);
  await p.shotEl('a6-feel', '#feel-container');

  // B1 machine taken
  check(lang, 'B1 button shows', await ev(`return !document.getElementById('btn-busy').classList.contains('hidden')`));
  await ev(`document.getElementById('btn-start-session').click()`); await sleep(500);
  await ev(`document.getElementById('btn-busy').click()`); await sleep(200);
  const rows = await ev(`return [...document.querySelectorAll('#busy-list .busy-row')].map(r=>r.innerText.replace(/\\n/g,' / '))`);
  check(lang, 'B1 lists alternatives', rows.length >= 1 && rows.length <= 3, rows.join(' || '));
  await p.shot('b1-busy');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  check(lang, 'B1 Escape closes', await ev(`return document.getElementById('busy-modal').classList.contains('hidden')`));
  await ev(`document.getElementById('btn-busy').click()`); await sleep(200);
  await ev(`document.querySelector('#busy-list .busy-row').click()`); await sleep(500);
  const after = await ev(`return document.getElementById('exercise-dropdown').value`);
  check(lang, 'B1 picking one switches the exercise', after && after !== ex, after);
  check(lang, 'B1 toast', /انتقلت|بدّلت|Switched|Swapped/.test(await ev(toast)), await ev(toast));

  // C3 insights: a big set → a record, then finish
  await ev(`const w=document.getElementById('input-weight'); w.value='300'; w.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('btn-save-weights').click()`);
  await sleep(800);
  await ev(`document.getElementById('btn-finish-session').click()`); await sleep(300);
  await ev(`document.getElementById('btn-confirm-finish').click()`); await sleep(800);
  const ins = await ev(`return [...document.querySelectorAll('#modal-insights .insight')].map(p=>p.textContent)`);
  check(lang, 'C3 summary shows the record', ins.length >= 1 && /كسرت|New record/.test(ins[0]), ins.join(' | '));
  await p.shotEl('c3-insights', '#custom-modal .glass-card');
  await ev(`document.getElementById('modal-cancel-btn').click()`);
  // an ordinary dialog afterwards has no leftover insights
  await ev(`document.getElementById('nav-profile').click()`);
  await ev(`document.getElementById('btn-wipe-all-data')?.click()`); await sleep(200);
  const leftover = await ev(`const m=document.getElementById('custom-modal'); const r=m.classList.contains('hidden') ? null : document.getElementById('modal-insights').classList.contains('hidden'); document.getElementById('modal-cancel-btn').click(); return r`);
  check(lang, 'C3 other dialogs hide the insights', leftover !== false, String(leftover));

  // E1 CSV
  await ev(`window.__csv=null; const o=URL.createObjectURL; URL.createObjectURL=b=>{ if(/csv/.test(b.type)) b.arrayBuffer().then(a=>{const u=new Uint8Array(a); window.__csv={bom:u[0]===0xEF&&u[1]===0xBB&&u[2]===0xBF, t:new TextDecoder('utf-8',{ignoreBOM:true}).decode(u).replace(/^\uFEFF/,''), type:b.type};}); return o.call(URL,b); }; document.getElementById('btn-export-csv').click()`);
  await sleep(500);
  const csv = await ev(`return window.__csv`);
  const lines = csv ? csv.t.split('\r\n') : [];
  check(lang, 'E1 CSV made with a BOM and a header', !!csv && csv.bom && lines.length > 10, csv ? lines[0].slice(0, 120) : 'no file');
  check(lang, 'E1 header language', !!csv && (lang === 'en' ? /^Date,Session,Exercise,/.test(lines[0]) : /^التاريخ,الجلسة,التمرين,/.test(lines[0])), lines[0]);
  check(lang, 'E1 one row per log', csv && lines.length - 1 === await ev(`return (await GymStorage.load()).logs.length`).catch(() => lines.length - 1));
  check(lang, 'E1 toast', /Excel/.test(await ev(toast)), await ev(toast));
  if (csv) fs.writeFileSync(path.join(outDir, `${lang}-e1.csv`), csv.t);
  await p.shotEl('e1-export', '#btn-export-csv');

  // whole workout screen for the look
  await ev(`document.getElementById('nav-workout').click(); scrollTo(0,0)`);
  await select(ex);
  await p.shot('workout');

  for (const theme of ['logbook', 'clock']) {
    await ev(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    await sleep(200);
    await p.shotEl(`${theme}-sugg`, '#next-suggestion');
    await p.shotEl(`${theme}-feel`, '#feel-container');
    await p.shotEl(`${theme}-note`, '#ex-note');
  }

  if (lang === 'en') {
    const misses = await ev(`return Object.keys(GymI18n.misses)`);
    check(lang, 'no missing translations', !misses.length, misses.join(' | '));
    const arabic = await ev(`const out=[]; const w=document.createTreeWalker(document.body,4); let n; while((n=w.nextNode())){ if(/[\\u0600-\\u06FF]/.test(n.nodeValue) && !n.parentElement.closest('[translate="no"],script,style') && n.parentElement.getClientRects().length) out.push(n.nodeValue.trim()); } return out.slice(0,10)`);
    check(lang, 'no Arabic left on screen', !arabic.length, arabic.join(' | '));
  }
  check(lang, 'no JS errors', !p.errors.length, p.errors.join(' | '));
  p.close();
}

await run('ar', 9661);
await run('en', 9662);
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
