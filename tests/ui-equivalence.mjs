// Compares what two versions of the site show, screen by screen, for the same data.
// Usage: node tests/ui-equivalence.mjs <oldUrl> <newUrl> [chromePath]
// v10.6: compares the DOM text (ignores CSS, emojis, and anything marked data-added) so a pure look change passes
// while any change to numbers, labels, or what logic shows/hides still fails.
// Loads tests/fixture-backup.json (dates shifted to today) into each version through the app's own import,
// then reads the visible text of every tab, every progress chart, and the edit dialog, and reports any difference.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [oldUrl, newUrl, chrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'] = process.argv.slice(2);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const VIS = `(root => { const c = root.cloneNode(true); c.querySelectorAll('[data-added],.hidden,[hidden],script,style,svg').forEach(e => e.remove()); c.querySelectorAll('#active-session-timer,#active-session-meta').forEach(e=>e.remove()); const parts=[]; const walk=n=>{ if(n.nodeType===3){parts.push(n.nodeValue);return;} if(n.nodeType!==1)return; const block=/^(DIV|P|SECTION|H1|H2|H3|LI|BUTTON|LABEL|OPTION|SUMMARY|STRONG|SMALL|SPAN)$/.test(n.tagName); if(n.tagName==='SELECT'){parts.push(' '+[...n.options].map(o=>o.textContent).join(' / ')+' ');return;} if(block)parts.push(' '); n.childNodes.forEach(walk); if(block)parts.push(' '); }; walk(c); return parts.join(''); })`;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2712}\u{2714}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FA}\u{FE0F}\u{200D}]/gu;
const norm = t => String(t).replace(EMOJI, '').replace(/\d\d:\d\d(:\d\d)?/g, '<time>').replace(/\s+/g, ' ').replace(/ \)/g, ')').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fixture() {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'fixture-backup.json'), 'utf8'));
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = s => (s === 'TODAY' ? today : s);
  raw.logs.forEach(l => { l.date = shift(l.date); });
  raw.sessions.forEach(s => { s.date = shift(s.date); });
  raw.profile.history.forEach(h => { h.date = shift(h.date); });
  return raw;
}

async function open(url, port) {
  const dir = fs.mkdtempSync('/tmp/gt-eq-');
  // port 0 = Chrome picks a free port, so a browser left over from an earlier run can never answer instead
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--remote-debugging-port=0', `--user-data-dir=${dir}`, url], { stdio: 'ignore' });
  process.on('exit', () => { try { proc.kill(); } catch { } });
  for (let i = 0; i < 60 && !fs.existsSync(path.join(dir, 'DevToolsActivePort')); i++) await sleep(100);
  port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  let list;
  for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.some(t => t.type === 'page')) break; } catch { } await sleep(200); }
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  // v11.1: a fresh browser with an English system opens in English; this test compares the Arabic screens
  for (let i = 0; i < 20; i++) {
    try { if (await ev(`return location.protocol.startsWith('http') && document.readyState !== 'loading' && document.documentElement.lang === 'ar'`)) break; } catch { }
    try { await ev(`if (!location.protocol.startsWith('http')) return false; localStorage.setItem('gym_lang','ar'); setTimeout(() => location.reload(), 30); return true`); } catch { }
    await sleep(800);
  }
  for (let i = 0; i < 100; i++) { try { if (await ev(`return /محفوظ/.test(document.getElementById('db-status-badge')?.textContent||'') && !!document.querySelector('#exercise-dropdown option')`)) break; } catch { } await sleep(200); }
  return { ev, close: () => { ws.close(); proc.kill(); } };
}

async function snapshot(page, data) {
  const b64 = Buffer.from(JSON.stringify(data)).toString('base64');
  await page.ev(`const bytes=Uint8Array.from(atob('${b64}'),c=>c.charCodeAt(0)); const f=new File([bytes],'f.json',{type:'application/json'}); const dt=new DataTransfer(); dt.items.add(f); const i=document.getElementById('import-file-input'); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true}));`);
  await sleep(1500);
  const out = {};
  const clean = `t => t.replace(/\\d\\d:\\d\\d(:\\d\\d)?/g,'<time>').replace(/[ \\t]+/g,' ').replace(/\\n\\s*\\n+/g,'\\n').trim()`;
  out.header = norm(await page.ev(`return ${VIS}(document.querySelector('header'))`));
  for (const tab of ['workout', 'exercises', 'progress', 'bento', 'profile']) {
    await page.ev(`document.getElementById('nav-${tab}').click(); document.querySelectorAll('#screen-${tab} details').forEach(d=>d.open=true);`);
    await sleep(300);
    // the order of the progress exercise list follows storage order (it changes after any reload), so compare it sorted
    out[tab] = norm(await page.ev(`const s=document.getElementById('screen-${tab}'); const c=s.cloneNode(true); c.classList.remove('hidden'); const sel=c.querySelector('#chart-exercise-select'); if(sel){ const o=[...sel.options].sort((a,b)=>a.textContent.localeCompare(b.textContent)); sel.replaceChildren(...o); } return ${VIS}(c)`));
  }
  // every progress chart: each exercise × each load mode × both metrics
  await page.ev(`document.getElementById('nav-progress').click();`);
  const exIds = await page.ev(`return [...document.querySelectorAll('#chart-exercise-select option')].map(o=>o.value)`);
  for (const ex of exIds) for (const mode of ['external', 'per_hand', 'bodyweight', 'added', 'assisted', 'timed']) for (const metric of ['actual', '1rm']) {
    out[`chart ${ex} ${mode} ${metric}`] = await page.ev(`const s=document.getElementById('chart-exercise-select'); s.value='${ex}'; s.dispatchEvent(new Event('change',{bubbles:true})); const m=document.getElementById('progress-load-mode'); m.value='${mode}'; m.dispatchEvent(new Event('change',{bubbles:true})); document.getElementById('chart-mode-${metric === 'actual' ? 'actual' : '1rm'}').click(); return document.getElementById('progressChart').innerHTML + '||' + ${VIS}(document.getElementById('exercise-progression-history-list'))`).then(norm);
  }
  // each exercise in the workout form: last performance, load mode, live 1RM
  await page.ev(`document.getElementById('nav-workout').click();`);
  const all = await page.ev(`return [...document.querySelectorAll('#exercise-dropdown option')].map(o=>o.value)`);
  for (const ex of all) out[`form ${ex}`] = await page.ev(`const d=document.getElementById('exercise-dropdown'); d.value='${ex}'; d.dispatchEvent(new Event('change',{bubbles:true})); return [${VIS}(document.getElementById('last-performance-text')), document.getElementById('load-mode-select').value, document.getElementById('val-1rm-live').textContent, document.getElementById('selected-exercise-equip-badge').textContent].join(' | ')`).then(norm);
  // edit dialog for every log
  const logIds = await page.ev(`return [...document.querySelectorAll('[data-action="edit-log"]')].map(b=>b.dataset.id)`);
  for (const id of logIds) out[`edit ${id}`] = await page.ev(`document.querySelector('[data-action="edit-log"][data-id="${id}"]').click(); const m=document.getElementById('edit-log-modal'); const v=[...m.querySelectorAll('input:not([type=hidden]),select')].filter(e=>!e.closest('.hidden,[data-added]')).map(e=>e.id+'='+e.value).join(' '); document.getElementById('btn-cancel-edit-log').click(); return v`);
  return out;
}

const data = fixture();
const a = await open(oldUrl, 9411), b = await open(newUrl, 9412);
const A = await snapshot(a, data), B = await snapshot(b, data);
// guard: the import must have worked, or two empty apps would look "equal"
for (const [name, snap] of [['old', A], ['new', B]]) {
  const logsShown = (snap.workout.match(/عدات|ثانية|دقيقة/g) || []).length;
  const charts = Object.keys(snap).filter(k => k.startsWith('chart ') && snap[k].includes('<polyline')).length;
  console.log(`${name}: ${logsShown} log lines today, ${charts} drawn charts, header "${snap.header.replace(/\n/g, ' ')}"`);
  if (logsShown < 10 || charts < 5) { console.log('✘ fixture did not load in ' + name); process.exit(2); }
}
a.close(); b.close();
let diffs = 0;
for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
  if (A[k] !== B[k]) {
    diffs++;
    const x = A[k] || '', y = B[k] || ''; let i = 0; while (i < x.length && x[i] === y[i]) i++;
    console.log(`✘ ${k}\n   old: …${x.slice(Math.max(0, i - 60), i + 80)}\n   new: …${y.slice(Math.max(0, i - 60), i + 80)}`);
  }
}
console.log(`${Object.keys(A).length} views compared, ${diffs} different`);
process.exit(diffs ? 1 : 0);
