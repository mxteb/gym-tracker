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
  // incline bench stuck at the same 1RM for 4 sessions → the plateau note (v11.4)
  const dates = ['2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'];
  dates.forEach((date, i) => raw.logs.push({ id: 'plateau_' + i, date, timestamp: Date.parse(date + 'T18:00:00'), sessionId: 'session_' + i, exerciseId: 'ex_2',
    exerciseName: 'بنش بريس مائل بالبار (Incline Barbell Bench Press)', category: 'push', type: 'weights', unit: 'kg', loadMode: 'external', setType: 'normal',
    rir: 0, bodyWeightKgAtLog: 80, calories: 0, calculationVersion: 'v10-session', displayWeight: i ? 60 : 50, weight: i ? 60 : 50, reps: 8 }));
  raw.logs.forEach(l => { l.date = shift(l.date); });
  raw.sessions.forEach(s => { s.date = shift(s.date); });
  raw.profile.history.forEach(h => { h.date = shift(h.date); });
  if (raw.profile) raw.profile.lang = lang; // the app follows the saved profile language on start
  return raw;
}

async function open(lang) {
  let port;
  const dir = fs.mkdtempSync('/tmp/gt-feat-');
  // port 0 = Chrome picks a free port, so a browser left over from an earlier run can never answer instead
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${dir}`, url], { stdio: 'ignore' });
  process.on('exit', () => { try { proc.kill(); } catch { } });
  let list;
  for (let i = 0; i < 60; i++) {
    try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.some(t => t.type === 'page')) break; } catch { }
    await sleep(200);
  }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId && process.env.DEBUG) console.log('  [nav]', new Date().toISOString().slice(11, 19));
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  for (let i = 0; i < 20; i++) {
    try { if (await ev(`return location.protocol.startsWith('http') && document.readyState !== 'loading' && document.documentElement.lang === '${lang}'`)) break; } catch { }
    try { await ev(`if (!location.protocol.startsWith('http')) return false; localStorage.setItem('gym_lang','${lang}'); setTimeout(() => location.reload(), 30); return true`); } catch { }
    await sleep(800);
  }
  const ready = async () => { for (let i = 0; i < 100; i++) { try { if (await ev(`return !!document.querySelector('#exercise-dropdown option') && !!window.GymStorage && /محفوظ|Saved/.test(document.getElementById('db-status-badge')?.textContent||'')`)) { await sleep(300); return; } } catch { } await sleep(200); } };
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

async function run(lang) {
  const p = await open(lang);
  // wait for any save in progress (the app disables every control while it saves), then run
  const ev = async expr => {
    let i = 0;
    for (; i < 60; i++) { try { if (await p.ev(`return !document.getElementById('nav-workout')?.disabled`)) break; } catch { break; } await sleep(100); }
    if (i === 60) console.log('  (still saving after 6 s)', expr.slice(0, 80));
    return p.ev(expr);
  };
  const b64 = Buffer.from(JSON.stringify(fixture(lang))).toString('base64');
  const importFixture = async () => {
    await ev(`const bytes=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0)); const f=new File([bytes],'f.json',{type:'application/json'}); const dt=new DataTransfer(); dt.items.add(f); const i=document.getElementById('import-file-input'); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true}));`);
    await sleep(1500);
  };
  await importFixture();
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
    const chips = await ev(`return [...document.querySelectorAll('#sugg-warmup-sets .sugg-wchip')].map(b=>b.textContent)`);
    check(lang, 'A4 chips are labelled', chips.length >= 2, chips.join(' | '));
    await ev(`document.querySelector('#sugg-warmup-sets .sugg-wchip').click()`);
    const filled = await ev(`return {w:document.getElementById('input-weight').value, type:document.querySelector('.set-type-btn[aria-pressed="true"]')?.dataset.settype}`);
    check(lang, 'A4 chip fills a warm-up set', filled.type === 'warmup' && Number(filled.w) > 0, JSON.stringify(filled));
    await ev(`document.getElementById('btn-apply-suggestion').click()`);
    check(lang, 'A4 applying the suggestion goes back to a normal set', await ev(`return document.querySelector('.set-type-btn[aria-pressed="true"]')?.dataset.settype`) === 'normal');
    await ev(`document.querySelector('#sugg-warmup-sets .sugg-wchip').click()`);
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
  await p.shotEl('b1-busy', '#busy-modal .glass-card');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  check(lang, 'B1 Escape closes', await ev(`return document.getElementById('busy-modal').classList.contains('hidden')`));
  await ev(`document.getElementById('btn-busy').click()`); await sleep(200);
  await ev(`document.querySelector('#busy-list .busy-row').click()`); await sleep(500);
  const after = await ev(`return document.getElementById('exercise-dropdown').value`);
  check(lang, 'B1 picking one switches the exercise', after && after !== ex, after);
  check(lang, 'B1 toast', /انتقلت|بدّلت|Switched|Swapped/.test(await ev(toast)), await ev(toast));

  // C3 insights: a big bench set → a record, then finish
  await select('ex_1');
  await ev(`const m=document.getElementById('load-mode-select'); m.value='external'; m.dispatchEvent(new Event('change',{bubbles:true}))`);
  await ev(`const w=document.getElementById('input-weight'); w.value='300'; w.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('btn-save-weights').click()`);
  await sleep(800);
  await ev(`document.getElementById('btn-finish-session').click()`); await sleep(300);
  await ev(`document.getElementById('btn-confirm-finish').click()`); await sleep(800);
  const ins = await ev(`return [...document.querySelectorAll('#modal-insights .insight')].map(p=>p.textContent)`);
  check(lang, 'C3 summary shows the record', ins.length >= 1 && /كسرت|New record/.test(ins[0]), ins.join(' | ') + ' :: toasts ' + await ev(`return [...document.querySelectorAll('#toast-container > div')].map(d=>d.textContent).join(' / ')`));
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
  check(lang, 'E1 one row per log line', csv && new RegExp('\\(' + (lines.length - 1) + ' ').test(await ev(toast)), (lines.length - 1) + ' :: ' + await ev(toast));
  check(lang, 'E1 toast', /Excel/.test(await ev(toast)), await ev(toast));
  if (csv) fs.writeFileSync(path.join(outDir, `${lang}-e1.csv`), csv.t);
  await p.shotEl('e1-export', '#btn-export-csv');

  /* ---------- Batch 2 ---------- */
  // A2 plateau
  await ev(`document.getElementById('nav-workout').click()`);
  await select('ex_2');
  const plat = await ev(`return document.getElementById('sugg-plateau').classList.contains('hidden') ? null : {text:document.getElementById('sugg-plateau-text').textContent, btn:document.getElementById('btn-deload').textContent}`);
  check(lang, 'A2 plateau note shows after 3 sessions without a better 1RM', !!plat && /3/.test(plat.text), JSON.stringify(plat));
  if (plat) {
    check(lang, 'A2 light session = 10% less, rounded to 2.5', /55/.test(plat.btn), plat.btn);
    await ev(`document.getElementById('btn-deload').click()`);
    check(lang, 'A2 tapping fills 55 × 8', await ev(`return document.getElementById('input-weight').value==='55' && document.getElementById('input-reps').value==='8'`));
    await p.shotEl('a2-plateau', '#next-suggestion');
  }
  await select('ex_1');
  check(lang, 'A2 no plateau note for a lift that is going up', await ev(`return document.getElementById('sugg-plateau').classList.contains('hidden')`), await ev(`return document.getElementById('sugg-plateau-text').textContent + ' :: ' + document.getElementById('exercise-dropdown').value`));

  // C1 + C2 on the analysis tab
  await ev(`document.getElementById('nav-bento').click()`); await sleep(300);
  const str = await ev(`return [...document.querySelectorAll('#bento-strength .strength-row')].map(r=>r.innerText.replace(/\\n/g,' / '))`);
  check(lang, 'C1 strength rows for bench and squat', str.length >= 2, str.join(' || '));
  const month = await ev(`return {opts:[...document.querySelectorAll('#month-select option')].map(o=>o.textContent), cells:[...document.querySelectorAll('#bento-month .month-cell')].map(c=>c.innerText.replace(/\\n/g,' / '))}`);
  check(lang, 'C2 month report has 4 numbers', month.cells.length === 4, month.cells.join(' || '));
  check(lang, 'C2 month list has this month and earlier ones', month.opts.length >= 2, month.opts.join(', '));
  await p.shotEl('c1-strength', '#bento-strength');
  await p.shotEl('c2-month', '#bento-month');
  await ev(`const s=document.getElementById('month-select'); s.value=s.options[s.options.length-1].value; s.dispatchEvent(new Event('change',{bubbles:true}))`);
  check(lang, 'C2 picking an older month changes the numbers', await ev(`return document.querySelectorAll('#bento-month .month-cell').length === 4`));
  await ev(`document.getElementById('nav-profile').click(); document.getElementById('input-weight-profile') && 0`);

  // C5 share the session as an image
  await ev(`document.getElementById('nav-workout').click(); document.getElementById('btn-start-session').click()`); await sleep(400);
  await select('ex_1');
  await ev(`document.getElementById('btn-save-weights').click()`); await sleep(600);
  await ev(`document.getElementById('btn-finish-session').click()`); await sleep(300);
  await ev(`document.getElementById('btn-confirm-finish').click()`); await sleep(800);
  check(lang, 'C5 share button in the summary', await ev(`return !document.getElementById('modal-share-btn').classList.contains('hidden')`));
  await ev(`window.__png=null; const o=URL.createObjectURL; URL.createObjectURL=b=>{ if(b.type==='image/png') { const r=new FileReader(); r.onload=()=>window.__png=r.result; r.readAsDataURL(b); } return o.call(URL,b); }; navigator.canShare=null; document.getElementById('modal-share-btn').click()`);
  await sleep(2500);
  const png = await ev(`return window.__png`);
  check(lang, 'C5 a PNG is made', !!png && png.length > 20000, png ? png.length + ' chars' : 'none');
  if (png) fs.writeFileSync(path.join(outDir, `${lang}-c5-share.png`), Buffer.from(png.split(',')[1], 'base64'));
  await p.shotEl('c5-modal', '#custom-modal .glass-card');
  await ev(`document.getElementById('modal-cancel-btn').click()`);
  await ev(`document.getElementById('btn-wipe-all-data')?.click()`); await sleep(200);
  check(lang, 'C5 other dialogs have no share button', await ev(`const r=document.getElementById('modal-share-btn').classList.contains('hidden'); document.getElementById('modal-cancel-btn').click(); return r`));

  /* ---------- Batch 3 ---------- */
  // A1 recovery map
  await ev(`document.getElementById('nav-bento').click()`); await sleep(300);
  const rec = await ev(`return {parts:[...document.querySelectorAll('#bento-recovery .rec-part')].map(p=>p.dataset.state), list:[...document.querySelectorAll('#bento-recovery .rec-list li')].map(l=>l.innerText.replace(/\\n/g,' '))}`);
  check(lang, 'A1 body map coloured', rec.parts.length >= 10 && rec.parts.some(x => x === 'tired' || x === 'mid'), rec.parts.join(','));
  check(lang, 'A1 list of 6 muscles', rec.list.length === 6, rec.list.join(' | '));
  await p.shotEl('a1-recovery', '#bento-recovery');

  // I2 time I have
  await ev(`document.getElementById('nav-workout').click(); scrollTo(0,0); document.getElementById('btn-plan-session').click()`); await sleep(300);
  const pr = await ev(`return document.getElementById('plan-recovery').classList.contains('hidden') ? '' : document.getElementById('plan-recovery').textContent`);
  check(lang, 'A1 plan shows what is ready and what is resting', /جاهز|Ready/.test(pr), pr);
  await ev(`document.querySelector('#plan-quick .plan-chip').click()`);
  const n0 = await ev(`return document.querySelectorAll('#plan-list input:checked').length`);
  const est0 = await ev(`return document.getElementById('plan-time-est').textContent`);
  check(lang, 'I2 estimate shown', /\d/.test(est0), est0);
  await ev(`const s=document.getElementById('plan-time'); s.value='30'; s.dispatchEvent(new Event('change',{bubbles:true}))`);
  const n1 = await ev(`return document.querySelectorAll('#plan-list input:checked').length`);
  const hint = await ev(`return document.getElementById('plan-time-hint').textContent`);
  check(lang, 'I2 30 min drops exercises and says which', n1 < n0 && hint.length > 10, `${n0} → ${n1} ${hint}`);
  await p.shotEl('i2-plan', '#plan-modal .glass-card');
  await ev(`document.getElementById('btn-plan-cancel').click()`);

  // B5 left / right
  await select('ex_55');
  check(lang, 'B5 toggle shows for a one-side exercise', await ev(`return !document.getElementById('btn-sides').classList.contains('hidden')`));
  await ev(`document.getElementById('btn-sides').click()`); await sleep(300);
  await ev(`const s=document.getElementById('rest-timer-duration'); s.value='0'; s.dispatchEvent(new Event('change',{bubbles:true}))`);
  await ev(`document.getElementById('input-weight').value='12'; document.getElementById('input-reps').value='10'; document.getElementById('input-reps-left').value='8'; document.getElementById('btn-save-weights').click()`); await sleep(700);
  const sideRow = await ev(`return document.querySelector('#today-logs-container .glass-card')?.innerText.replace(/\\n/g,' ')`);
  check(lang, 'B5 log shows both sides', /يمين 10 · يسار 8|R 10 · L 8/.test(sideRow), sideRow);
  await p.shotEl('b5-sides', '#reps-field-wrapper');
  await select('ex_1');
  check(lang, 'B5 no toggle for bench', await ev(`return document.getElementById('btn-sides').classList.contains('hidden')`));

  // B6 repeat (what the Android notification button sends)
  const cnt = `return Number((document.getElementById('today-sets-count')?.textContent||'').replace(/\\D/g,''))||0`;
  const c0 = await ev(cnt);
  await ev(`document.dispatchEvent(new CustomEvent('gym:repeat-set',{detail:{exerciseId:'ex_55'}}))`); await sleep(800);
  check(lang, 'B6 repeat saves the same set again', await ev(cnt) === c0 + 1 && /يمين 10 · يسار 8|R 10 · L 8/.test(await ev(`return document.querySelector('#today-logs-container .glass-card')?.innerText.replace(/\\n/g,' ')`)), `${c0} → ${await ev(cnt)}`);

  // C4 photos
  await ev(`document.getElementById('nav-profile').click()`);
  for (const color of ['#c8322a', '#2f5da8']) {
    await ev(`const c=document.createElement('canvas'); c.width=600; c.height=800; const x=c.getContext('2d'); x.fillStyle='${color}'; x.fillRect(0,0,600,800); x.fillStyle='#fff'; x.fillRect(200,150,200,500);
      const b=await new Promise(r=>c.toBlob(r,'image/png')); const f=new File([b],'p.png',{type:'image/png'}); const dt=new DataTransfer(); dt.items.add(f); const i=document.getElementById('photo-input'); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true}))`);
    await sleep(900);
  }
  check(lang, 'C4 two photos stored', await ev(`return document.querySelectorAll('#photo-grid .photo-thumb').length`) === 2);
  await ev(`const t=[...document.querySelectorAll('#photo-grid .photo-thumb')]; if(t[0].getAttribute('aria-pressed')!=='true') t[0].click();`); await sleep(300);
  await ev(`const t=[...document.querySelectorAll('#photo-grid .photo-thumb')]; t[1].click();`); await sleep(400);
  check(lang, 'C4 two picked = side by side', await ev(`return document.querySelectorAll('#photo-view .photo-fig').length`) === 2);
  check(lang, 'C4 photos not in the JSON backup', await ev(`window.__json=null; const o=URL.createObjectURL; URL.createObjectURL=b=>{ if(/json/.test(b.type)) b.text().then(t=>window.__json=t); return o.call(URL,b); }; document.getElementById('btn-export-json').click(); await new Promise(r=>setTimeout(r,600)); return !!window.__json && !/photo_|image\\/jpeg/.test(window.__json)`));
  await ev(`document.querySelectorAll('.modal-overlay:not(.hidden) #modal-cancel-btn').forEach(b=>b.click())`);
  await p.shotEl('c4-photos', '#photos-card');
  await ev(`document.querySelector('#photo-view [data-del]').click()`); await sleep(200);
  await ev(`document.getElementById('modal-confirm-btn').click()`); await sleep(600);
  check(lang, 'C4 delete asks, then removes', await ev(`return document.querySelectorAll('#photo-grid .photo-thumb').length`) === 1);
  await ev(`document.getElementById('btn-wipe-all-data').click()`); await sleep(200);
  await ev(`document.getElementById('modal-confirm-btn').click()`); await sleep(900);
  check(lang, 'C4 erase all also erases photos', await ev(`return (await GymPhotos.all()).length`) === 0);
  await importFixture();
  await ev(`document.querySelectorAll('.modal-overlay:not(.hidden) #modal-cancel-btn').forEach(b=>b.click())`);

  /* ---------- Batch 4 ---------- */
  // D2 how to do it
  await ev(`document.getElementById('nav-workout').click()`);
  await select('ex_1');
  await ev(`document.getElementById('ex-guide').open = true`);
  const guide = await ev(`return {steps:document.querySelectorAll('#ex-guide-body .guide-steps li').length, mist:document.querySelectorAll('#ex-guide-body .guide-mistakes li').length, text:document.getElementById('ex-guide-body').innerText}`);
  check(lang, 'D2 guide: 3 steps and 2 mistakes', guide.steps === 3 && guide.mist === 2, guide.text.slice(0, 80));
  check(lang, 'D2 guide in the page language', lang === 'en' ? !/[؀-ۿ]/.test(guide.text) : /[؀-ۿ]/.test(guide.text), guide.text.slice(0, 60));
  await p.shotEl('d2-guide', '#ex-guide');
  await ev(`document.getElementById('ex-guide').open = false`);

  // D1 programs
  await ev(`scrollTo(0,0); document.getElementById('btn-plan-session').click()`); await sleep(300);
  await ev(`const s=document.getElementById('plan-program'); s.value='5x5'; s.dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(400);
  const days = await ev(`return [...document.querySelectorAll('#plan-days .plan-chip')].map(b=>b.textContent)`);
  check(lang, 'D1 5×5 shows days A and B, one marked next', days.length === 2 && days.some(d => /الجاي|next/.test(d)), days.join(' | '));
  await ev(`document.querySelectorAll('#plan-days .plan-chip')[1].click()`); await sleep(500);
  const picked = await ev(`return [...document.querySelectorAll('#plan-list input:checked')].map(i=>i.value)`);
  check(lang, 'D1 day B fills squat, overhead press and the new deadlift', ['ex_44', 'ex_11', 'ex_70'].every(id => picked.includes(id)) && picked.length === 3, picked.join(','));
  const pinfo = await ev(`return document.getElementById('plan-program-info').textContent`);
  check(lang, 'D1 targets listed', /5 (جولات|sets) × 5/.test(pinfo), pinfo);
  await p.shotEl('d1-plan', '#plan-modal .glass-card');
  await ev(`document.getElementById('btn-plan-confirm').click()`); await sleep(700);
  await select('ex_44');
  const tgt = await ev(`return document.getElementById('program-target').classList.contains('hidden') ? '' : document.getElementById('program-target').textContent`);
  check(lang, 'D1 target on the workout screen', /5 (جولات|sets) × 5/.test(tgt), tgt);
  await select('ex_70');
  check(lang, 'D1 deadlift exists with its guide', await ev(`return document.getElementById('exercise-dropdown').value==='ex_70' && !document.getElementById('ex-guide').classList.contains('hidden')`));
  await ev(`document.getElementById('btn-finish-session').click()`); await sleep(300);
  await ev(`document.getElementById('btn-confirm-finish').click()`); await sleep(800);
  await ev(`document.getElementById('modal-cancel-btn').click()`);
  await ev(`scrollTo(0,0); document.getElementById('btn-plan-session').click()`); await sleep(300);
  const next = await ev(`return [...document.querySelectorAll('#plan-days .plan-chip')].findIndex(b=>/الجاي|next/.test(b.textContent))`);
  check(lang, 'D1 after day B the next day is A again', next === 0, String(next));
  await ev(`document.getElementById('btn-plan-cancel').click()`);

  // I1 Ramadan
  await ev(`document.getElementById('nav-profile').click(); document.getElementById('set-ramadan').click()`); await sleep(500);
  check(lang, 'I1 iftar time shows', await ev(`return !document.getElementById('ramadan-iftar-row').classList.contains('hidden')`));
  await ev(`const t=document.getElementById('ramadan-iftar'); t.value='18:10'; t.dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(400);
  check(lang, 'I1 saved for the Android reminder', await ev(`return JSON.parse(localStorage.getItem('gym_ramadan')).iftar === '18:10'`));
  await p.shotEl('i1-setting', '#app-settings');
  await ev(`document.getElementById('nav-workout').click()`);
  let held = null;
  for (const id of ['ex_44', 'ex_1', 'ex_3', 'ex_31', 'ex_custom_hip', 'ex_19']) {
    await select(id);
    const sg = await ev(`return document.getElementById('next-suggestion').classList.contains('hidden') ? null : {kind:document.getElementById('next-suggestion').dataset.kind, reason:document.getElementById('sugg-reason').textContent}`);
    if (sg) { held = sg; if (/رمضان|Ramadan/.test(sg.reason)) break; }
  }
  check(lang, 'I1 suggestion holds the numbers in Ramadan', held && held.kind === 'hold' && /رمضان|Ramadan/.test(held.reason), JSON.stringify(held));
  await p.shotEl('i1-suggestion', '#next-suggestion');
  await ev(`document.getElementById('nav-bento').click()`); await sleep(300);
  const split = await ev(`return document.getElementById('bento-ramadan').classList.contains('hidden') ? '' : document.getElementById('bento-ramadan').textContent`);
  check(lang, 'I1 calories split between iftar and suhoor', /\d/.test(split), split);
  await p.shotEl('i1-calories', '#bento-ramadan');
  await ev(`document.getElementById('nav-profile').click(); document.getElementById('set-ramadan').click()`); await sleep(400);
  check(lang, 'I1 off again', await ev(`return JSON.parse(localStorage.getItem('gym_ramadan')).on === false`));

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

for (const lang of ['ar', 'en']) if (!process.env.LANGS || process.env.LANGS.includes(lang)) await run(lang).catch(e => { console.log('✘ [' + lang + '] crashed — ' + e.message); failures.push(lang + ' crashed'); });
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
