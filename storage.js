/* v10: one authoritative revision; atomic multi-store writes; legacy data retained. */
(() => {
'use strict';
const TABLES = ['profile','exercises','logs','sessions'];
const SNAPSHOT = 'gym_snapshot_v10';
const clone = x => JSON.parse(JSON.stringify(x));
let db = null, revision = 0, committed = null, baseline = {}, fallback = false;
const request = req => new Promise((resolve,reject) => {req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const complete = tx => new Promise((resolve,reject) => {tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error || Error('Transaction aborted'));tx.onerror=()=>{};});
const readLS = key => {try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
const rows = (s,key) => key==='profile' ? [s.profile] : s[key];
function index(s) {return Object.fromEntries(TABLES.map(k=>[k,new Map(rows(s,k).map(x=>[x.id,JSON.stringify(x)]))]));}
async function open() {
 if(!('indexedDB' in window)) return;
 db = await new Promise((resolve,reject)=>{
  const req=indexedDB.open('GymTrackerDB',3);
  req.onupgradeneeded=()=>{for(const k of [...TABLES,'backups','meta'])if(!req.result.objectStoreNames.contains(k))req.result.createObjectStore(k,{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  req.onblocked=()=>{document.getElementById('db-status-badge').textContent='أغلق النسخة القديمة المفتوحة ليكتمل تحديث التخزين';};
 });
 db.onversionchange=()=>{db.close();db=null;};
}
async function readDB() {
 const tx=db.transaction([...TABLES,'meta'],'readonly');
 const values=await Promise.all([...TABLES.map(k=>request(tx.objectStore(k).getAll())),request(tx.objectStore('meta').get('revision'))]);
 return {tables:values.slice(0,4),revision:values[4]?.value||0};
}
function mergeLegacy(primary,secondary) {
 const map=new Map((primary||[]).map(x=>[x.id,x]));
 for(const x of secondary||[]) {
  if(!x || !x.id)continue;
  const old=map.get(x.id);
  if(!old || (Number(x.editedAt)||0)>(Number(old.editedAt)||0))map.set(x.id,x);
 }
 return [...map.values()];
}
async function load(defaultState) {
 try{await open();}catch{db=null;}
 let raw=null;
 if(db) {try{raw=await readDB();}catch{db.close();db=null;}}
 const local=readLS(SNAPSHOT);
 let next;
 if(local?.schemaVersion===10 && local.revision>(raw?.revision||0)) {
  next=local.data;revision=local.revision;fallback=true;
 } else if(raw?.revision) {
  next=Object.fromEntries(TABLES.map((k,i)=>[k,k==='profile'?raw.tables[i][0]:raw.tables[i]]));revision=raw.revision;
 } else {
  next=clone(defaultState);
  for(let i=0;i<TABLES.length;i++) {
   const k=TABLES[i], ls=readLS('gym_'+k), old=raw?.tables[i]||[];
   if(k==='profile') next.profile={...next.profile,...(old[0]||ls?.[0]||{})};
   else next[k]=mergeLegacy(old,Array.isArray(ls)?ls:[]);
  }
  // Keep a complete pre-upgrade recovery snapshot before changing any records.
  const backup={id:'pre_v10',createdAt:new Date().toISOString(),data:clone(next),rawIndexedDBTables:raw?.tables||null,rawLocalTables:Object.fromEntries(TABLES.map(k=>[k,readLS('gym_'+k)]))};
  let backed=false;
  if(db)try{const tx=db.transaction('backups','readwrite');const done=complete(tx);const store=tx.objectStore('backups');const get=store.get('pre_v10');get.onsuccess=()=>{if(!get.result)store.put(backup);};await done;backed=true;}catch{}
  if(!backed) {try{if(!localStorage.getItem('gym_safe_backup_before_v10'))localStorage.setItem('gym_safe_backup_before_v10',JSON.stringify(backup));}catch{throw Error('تعذر إنشاء نسخة أمان قبل التحديث. صدّر بياناتك من النسخة السابقة أولًا.');}}
 }
 next.profile={...defaultState.profile,...next.profile,id:'user_profile'};
 for(const k of ['logs','sessions','exercises'])next[k]=next[k]||[];
 committed=clone(next);baseline=Object.fromEntries(TABLES.map((k,i)=>[k,new Map((raw?.tables[i]||[]).map(x=>[x.id,JSON.stringify(x)]))]));
 if(!revision || fallback)await save(next);
 updateBadge();return clone(committed);
}
function updateBadge() {
 const el=document.getElementById('db-status-badge');
 if(el)el.textContent=db&&!fallback?'محفوظ على هذا الجهاز ✓':'محفوظ محليًا — التخزين البديل ✓';
}
async function save(next,options={}) {
 const payload=clone(next);
 const work=async()=>{
  const local=readLS(SNAPSHOT);
  if((local?.revision||0)>revision)throw Error('تغيرت البيانات في نافذة أخرى. أعد تحميل الصفحة قبل الحفظ.');
  const newRevision=Math.max(Date.now(),revision+1);
  if(db) {
   let conflict=false;
   try {
    const tx=db.transaction([...TABLES,'meta',...(options.wipe?['backups']:[])],'readwrite');const done=complete(tx);
    const check=tx.objectStore('meta').get('revision');
    check.onsuccess=()=>{
     if((check.result?.value||0)>revision){conflict=true;tx.abort();return;}
     const nextIndex=index(payload);
     for(const k of TABLES) {
      const store=tx.objectStore(k);
      for(const id of baseline[k]?.keys()||[])if(!nextIndex[k].has(id))store.delete(id);
      for(const item of rows(payload,k))if(baseline[k]?.get(item.id)!==JSON.stringify(item))store.put(item);
     }
     if(options.wipe)tx.objectStore('backups').clear();
     tx.objectStore('meta').put({id:'revision',value:newRevision});
    };
    await done;
    fallback=false;
   } catch(error) {
    if(conflict)throw Error('تغيرت البيانات في نافذة أخرى. أعد تحميل الصفحة قبل الحفظ.');
    if(options.wipe)throw Error('تعذر إتمام المسح الشامل. لم يُعتمد المسح.');
    try{localStorage.setItem(SNAPSHOT,JSON.stringify({schemaVersion:10,revision:newRevision,data:payload}));fallback=true;}
    catch{throw Error('لم يتم الحفظ: تعذر التخزين على الجهاز. احتفظ بالصفحة مفتوحة وصدّر نسخة من بياناتك.');}
   }
  } else {
   try{localStorage.setItem(SNAPSHOT,JSON.stringify({schemaVersion:10,revision:newRevision,data:payload}));fallback=true;}
   catch{throw Error('لم يتم الحفظ: التخزين المحلي غير متاح أو ممتلئ.');}
  }
  revision=newRevision;committed=clone(payload);
  // Keep the database baseline unchanged after a fallback write so recovery writes all pending changes.
  if(!fallback)baseline=index(payload);
  if(options.wipe) {
   for(const key of ['gym_profile','gym_exercises','gym_logs','gym_sessions','gym_safe_backup_before_v9','gym_safe_backup_before_v10','gym_active_session_id','gym_rest_deadline']) {
    try{localStorage.removeItem(key);}catch{throw Error('حُذفت البيانات الرئيسية، لكن تعذر حذف إحدى النسخ المحلية. امسح بيانات الموقع لإكمال الحذف.');}
   }
  }
  if(!fallback)try{localStorage.removeItem(SNAPSHOT);}catch{}
  updateBadge();return clone(committed);
 };
 return navigator.locks?.request ? navigator.locks.request('gym-tracker-write',work) : work();
}
async function backup() {
 if(db)for(const id of ['pre_v10','pre_v9']) {try{const value=await request(db.transaction('backups').objectStore('backups').get(id));if(value)return value;}catch{}}
 return readLS('gym_safe_backup_before_v10')||readLS('gym_safe_backup_before_v9');
}
window.GymStorage={load,save,backup,rollback:()=>clone(committed),get revision(){return revision;}};
})();
