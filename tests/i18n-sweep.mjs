// Opens the site in English with the test data and goes through every screen, chart, exercise, dialog and
// toast. Lists any Arabic text still on the page (it would mean a missing translation) and saves screenshots
// of every tab in every theme so the English layout can be checked by eye.
// Usage: node tests/i18n-sweep.mjs <url> [outDir] [chromePath]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [url, outDir = 'i18n-out', chrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'] = process.argv.slice(2);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });

function fixture() {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'fixture-backup.json'), 'utf8'));
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = s => (s === 'TODAY' ? today : s);
  raw.logs.forEach(l => { l.date = shift(l.date); });
  raw.sessions.forEach(s => { s.date = shift(s.date); });
  raw.profile.history.forEach(h => { h.date = shift(h.date); });
  return raw;
}

const dir = fs.mkdtempSync('/tmp/gt-i18n-');
const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--lang=en-US', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { proc.kill(); } catch { } });
for (let i = 0; i < 60 && !fs.existsSync(path.join(dir, 'DevToolsActivePort')); i++) await new Promise(r => setTimeout(r, 100));
const PORT = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0];
let list;
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (list.some(t => t.type === 'page')) break; } catch { } await sleep(200); }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
const consoleErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description + ' :: ' + expr.slice(0, 100)); return r.result.result.value; };
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url });
await sleep(1500);
await ev(`localStorage.setItem('gym_lang','en'); return true`);
await send('Page.navigate', { url });
const ready = async () => { for (let i = 0; i < 100; i++) { try { if (await ev(`return !!document.querySelector('#exercise-dropdown option') && !/جاري|Connecting/.test(document.getElementById('db-status-badge')?.textContent||'x')`)) return; } catch { } await sleep(200); } throw new Error('app not ready'); };
await ready();

// every toast and dialog text that ever appears
await ev(`window.__seen = []; new MutationObserver(rs => rs.forEach(r => r.addedNodes.forEach(n => { if (n.nodeType === 1 && (n.closest('#toast-container') || n.id === 'gt-native-dialog')) window.__seen.push(n.textContent); }))).observe(document.body, { subtree: true, childList: true }); return true`);

const found = new Map();
const SCAN = `const AR=/[\\u0600-\\u06FF]/; const out=[]; const skip=n=>{for(let e=n;e&&e.nodeType===1;e=e.parentNode){if(e.getAttribute('translate')==='no'||/^(SCRIPT|STYLE)$/.test(e.tagName))return true;}return false;};
  const tw=document.createTreeWalker(document.documentElement,5); let n; while((n=tw.nextNode())){ if(n.nodeType===3){ if(AR.test(n.nodeValue)&&!skip(n.parentNode)) out.push((n.parentNode.id?'#'+n.parentNode.id:n.parentNode.tagName.toLowerCase()+'.'+String(n.parentNode.className).split(' ')[0])+' :: '+n.nodeValue.trim()); }
    else { for (const a of ['placeholder','title','aria-label','alt','content']) { const v=n.getAttribute(a); if(v&&AR.test(v)&&!skip(n)) out.push('@'+a+' '+(n.id||n.tagName)+' :: '+v); } } }
  if (AR.test(document.title)) out.push('title :: '+document.title);
  (window.__seen||[]).forEach(t=>{ if(AR.test(t)) out.push('toast/dialog :: '+t); });
  return out;`;
async function scan(where) {
  for (const line of await ev(SCAN)) { if (!found.has(line)) found.set(line, where); }
}
async function shotFull(name) {
  await sleep(350);
  const m = await send('Page.getLayoutMetrics');
  const h = Math.min(Math.ceil(m.result.cssContentSize.height), 6000);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 393, height: h, scale: 1 } });
  fs.writeFileSync(path.join(outDir, 'shots', name + '.png'), Buffer.from(r.result.data, 'base64'));
}
const tap = sel => ev(`const e=document.querySelector(${JSON.stringify(sel)}); if(!e) throw new Error('missing ${sel}'); e.click(); return true`);

// load the test data through the app's own import
const b64 = Buffer.from(JSON.stringify(fixture())).toString('base64');
await ev(`const bytes=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0)); const f=new File([bytes],'f.json',{type:'application/json'}); const dt=new DataTransfer(); dt.items.add(f); const i=document.getElementById('import-file-input'); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true})); return true`);
await sleep(2000);
const info = await ev(`return { lang: document.documentElement.lang, dir: document.documentElement.dir, logs: GymApp.logCount ? GymApp.logCount() : null }`);
console.log('page', JSON.stringify(info));

const TABS = ['workout', 'exercises', 'progress', 'bento', 'profile'];
// screenshots of every tab in every theme
for (const theme of ['plates', 'logbook', 'clock']) {
  await ev(`document.querySelector('[data-theme-pick="${theme}"]').click(); return true`); await sleep(600);
  for (const tab of TABS) { await tap('#nav-' + tab); await ev(`window.scrollTo(0,0); return true`); await scan(`theme ${theme} ${tab}`); await shotFull(`en-${theme}-${tab}`); }
}
await ev(`document.querySelector('[data-theme-pick="plates"]').click(); return true`);

for (const tab of TABS) { await tap('#nav-' + tab); await ev(`document.querySelectorAll('#screen-${tab} details').forEach(d=>d.open=true); return true`); await sleep(300); await scan('tab ' + tab); }

// charts: every exercise (external, both metrics) + every load mode on the first exercise
await tap('#nav-progress');
const exIds = await ev(`return [...document.querySelectorAll('#chart-exercise-select option')].map(o=>o.value)`);
for (const [i, ex] of exIds.entries()) for (const mode of (i === 0 ? ['external', 'per_hand', 'bodyweight', 'added', 'assisted', 'timed'] : ['external'])) for (const metric of ['actual', '1rm']) {
  await ev(`const s=document.getElementById('chart-exercise-select'); s.value='${ex}'; s.dispatchEvent(new Event('change',{bubbles:true})); const m=document.getElementById('progress-load-mode'); m.value='${mode}'; m.dispatchEvent(new Event('change',{bubbles:true})); document.getElementById('chart-mode-${metric}').click(); return true`);
  await scan(`chart ${ex} ${mode} ${metric}`);
}
// calendar: tap the first training day, and go back a month
await ev(`document.querySelector('[data-day].on, .cal-day.on, [data-date].trained')?.click(); return true`); await sleep(300); await scan('calendar day');
await ev(`document.getElementById('cal-prev')?.click(); return true`); await sleep(200); await scan('calendar prev');
await ev(`document.getElementById('cal-next')?.click(); return true`);
// records: open each
await ev(`[...document.querySelectorAll('.record-row')].slice(0,3).forEach(b=>b.click()); return true`); await sleep(300); await scan('records');

// workout form for every exercise
await tap('#nav-workout');
const all = await ev(`return [...document.querySelectorAll('#exercise-dropdown option')].map(o=>o.value)`);
for (const ex of all) { await ev(`const d=document.getElementById('exercise-dropdown'); d.value='${ex}'; d.dispatchEvent(new Event('change',{bubbles:true})); return true`); }
await scan('form all exercises');
for (const mode of ['external', 'per_hand', 'bodyweight', 'added', 'assisted', 'timed']) {
  await ev(`const d=document.getElementById('exercise-dropdown'); d.value='ex_1'; d.dispatchEvent(new Event('change',{bubbles:true})); const m=document.getElementById('load-mode-select'); m.value='${mode}'; m.dispatchEvent(new Event('change',{bubbles:true})); return true`);
  await scan('form mode ' + mode);
}
for (const t of ['normal', 'warmup', 'drop', 'superset']) { await ev(`document.querySelector('.set-type-btn[data-settype="${t}"]')?.click(); return true`); await scan('set type ' + t); }

// edit dialog for every log
const logIds = await ev(`return [...document.querySelectorAll('[data-action="edit-log"]')].map(b=>b.dataset.id)`);
for (const lid of logIds) { await ev(`document.querySelector('[data-action="edit-log"][data-id="${lid}"]').click(); return true`); await sleep(120); await scan('edit ' + lid); await ev(`document.getElementById('btn-cancel-edit-log').click(); return true`); }

// a live session: plan, start, save sets, suggestion, rest timer, repeat, delete + undo, finish
await ev(`document.getElementById('btn-plan-session')?.click(); return true`); await sleep(400); await scan('plan dialog'); await shotFull('en-plan-dialog');
await ev(`document.getElementById('btn-plan-cancel')?.click(); return true`);
await ev(`document.getElementById('btn-start-session')?.click(); return true`); await sleep(500); await scan('session started');
await ev(`const d=document.getElementById('exercise-dropdown'); d.value='ex_1'; d.dispatchEvent(new Event('change',{bubbles:true})); const m=document.getElementById('load-mode-select'); m.value='external'; m.dispatchEvent(new Event('change',{bubbles:true})); document.getElementById('input-weight').value='60'; document.getElementById('input-reps').value='8'; ['input-weight','input-reps'].forEach(i=>document.getElementById(i).dispatchEvent(new Event('input',{bubbles:true}))); return true`);
await ev(`const r=document.getElementById('rest-timer-duration'); r.value='60'; r.dispatchEvent(new Event('change',{bubbles:true})); return true`);
await tap('#btn-save-weights'); await sleep(800); await scan('set saved + rest timer'); await shotFull('en-workout-session');
await ev(`document.querySelector('#btn-repeat-set, [data-action="repeat-set"]')?.click(); return true`); await sleep(500); await scan('repeat');
await ev(`document.getElementById('btn-apply-suggestion')?.click(); return true`); await sleep(300); await scan('suggestion');
await ev(`document.querySelector('[data-action="delete-log"]')?.click(); return true`); await sleep(400); await scan('delete confirm'); await shotFull('en-delete-confirm');
await ev(`document.getElementById('modal-confirm-btn')?.click(); return true`); await sleep(500); await scan('deleted');
await ev(`document.getElementById('btn-finish-session')?.click(); return true`); await sleep(600); await scan('finish dialog'); await shotFull('en-finish-dialog');
await ev(`document.querySelector('#finish-session-modal button[type=submit], #btn-confirm-finish, #modal-confirm-btn')?.click(); return true`); await sleep(800); await scan('finished');
await shotFull('en-summary');
await ev(`document.getElementById('modal-confirm-btn')?.click(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return true`);
// cardio
await ev(`const d=document.getElementById('exercise-dropdown'); const o=[...d.options].find(o=>/treadmill|cardio|مشي|Treadmill/i.test(o.textContent)); if(o){d.value=o.value; d.dispatchEvent(new Event('change',{bubbles:true}));} return true`); await sleep(300); await scan('cardio form');
// add-exercise screen: type a name so it classifies
await tap('#nav-exercises'); await ev(`const i=document.querySelector('#screen-exercises input[type=text]'); if(i){i.value='hip thrust'; i.dispatchEvent(new Event('input',{bubbles:true}));} return true`); await sleep(400); await scan('add exercise typed');
// profile: wipe confirm (cancel)
await tap('#nav-profile'); await ev(`document.getElementById('btn-wipe-all-data')?.click(); return true`); await sleep(300); await scan('wipe confirm'); await shotFull('en-wipe-confirm');
await ev(`document.getElementById('modal-cancel-btn')?.click(); return true`);

const misses = await ev(`return GymI18n.misses`);
const overflow = await ev(`return document.documentElement.scrollWidth - innerWidth`);
const report = { info, overflow, consoleErrors, leftovers: [...found].map(([k, v]) => `${v} | ${k}`), misses };
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
console.log(`leftover Arabic: ${found.size}, engine misses: ${Object.keys(misses).length}, JS errors: ${consoleErrors.length}`);
ws.close(); proc.kill();
