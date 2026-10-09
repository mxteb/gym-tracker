/* Validation is performed on a detached copy before any live state is changed. */
(() => {
'use strict';
const fail = label => {throw Error('ملف غير صالح: '+label);};
const modes=['external','per_hand','bodyweight','added','assisted','timed'];
const types=['weights','treadmill','bike_elliptical'];
const categories=['push','pull','legs','abs','cardio'];
const equipment=['barbell','dumbbell','machine','cable_body','cardio'];
const machines=['bike','treadmill','elliptical','stairs','rowing','airbike'];
const setTypes=['normal','warmup','drop','failure','dropset','superset'];
const object = (x,label) => {if(!x||typeof x!=='object'||Array.isArray(x))fail(label);return x;};
const str=(x,label,max=300)=>{if(typeof x!=='string'||!x.length||x.length>max)fail(label);return x;};
const id=(x)=>{str(x,'معرف السجل',150);if(!/^[\w-]+$/.test(x))fail('معرف السجل');return x;};
const num=(x,label,min=0,max=1e15)=>{if(!['string','number'].includes(typeof x)||(typeof x==='string'&&!x.trim())||!Number.isFinite(Number(x))||Number(x)<min||Number(x)>max)fail(label);return Number(x);};
function inputNumber(value,label,min,max,{optional=false,integer=false,legacyValue}={}) {
 if(value==null||String(value).trim()==='') {
  if(optional)return null;
  throw Error('أدخل '+label);
 }
 const n=Number(value);
 if(!['string','number'].includes(typeof value)||!Number.isFinite(n)||n<min||n>max)throw Error(label+' يجب أن يكون بين '+min+' و'+max);
 if(integer&&!Number.isInteger(n)&&n!==legacyValue)throw Error(label+' يجب أن يكون عددًا صحيحًا');
 return n;
}
function oneRepMax(weight,reps) {
 const w=Number(weight),r=Number(reps);
 return !Number.isFinite(w)||w<=0||!Number.isInteger(r)||r<1||r>15?null:r===1?w:Math.round(w*(1+r/30)*10)/10;
}
function filterExercises(exercises,{presetIds=null,category='all',equipment:tool='all',search=''}={}) {
 const query=search.trim().toLowerCase();
 return exercises.filter(e=>!e.archived&&(!presetIds||presetIds.includes(e.id))&&
  (category==='all'||(category==='upper'?['push','pull'].includes(e.category):category==='lower'?['legs','abs'].includes(e.category):e.category===category))&&
  (tool==='all'||e.equip===tool)&&(!query||e.name.toLowerCase().includes(query)))
  .sort((a,b)=>presetIds?presetIds.indexOf(a.id)-presetIds.indexOf(b.id):a.id.localeCompare(b.id,'en',{numeric:true}));
}
const date=x=>{str(x,'التاريخ',10);if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x+'T00:00:00Z').toISOString().slice(0,10)!==x)fail('التاريخ');return x;};
const choice=(x,allowed,label)=>{if(!allowed.includes(x))fail(label);return x;};
const optionalNumber=(x,key,min,max)=>x[key]==null?{}:{[key]:num(x[key],key,min,max)};
function profile(x) {
 object(x,'البروفايل');const out={id:'user_profile'};
 if(x.name!==undefined){if(typeof x.name!=='string'||x.name.length>200)fail('الاسم');out.name=x.name;}
 for(const [key,min,max] of [['weight',20,350],['height',50,250],['waist',30,250],['age',5,120],['fat',1,70],['muscle',1,80],['water',1,90],['activityFactor',1,3]]) {
  if(x[key]!==undefined)out[key]=x[key]===''?'':num(x[key],key,min,max);
 }
 if(x.isMan!==undefined){if(typeof x.isMan!=='boolean')fail('الجنس');out.isMan=x.isMan;}
 if(x.theme!==undefined)out.theme=choice(x.theme,['plates','logbook','clock','auto'],'الثيم');
 if(x.lang!==undefined)out.lang=choice(x.lang,['ar','en'],'اللغة');
 for(const key of ['keepAwake','haptics'])if(x[key]!==undefined){if(typeof x[key]!=='boolean')fail('الإعدادات');out[key]=x[key];}
 if(x.updatedAt!==undefined)out.updatedAt=num(x.updatedAt,'وقت البروفايل');
 out.history=array(x.history||[],10000,'القياسات').map(h=>{object(h,'قياس');return {date:date(h.date),weight:num(h.weight,'الوزن',20,350),waist:h.waist?num(h.waist,'الخصر',30,250):''};});
 return out;
}
function array(x,max,label){if(!Array.isArray(x)||x.length>max)fail(label);return x;}
function exercise(x){object(x,'تمرين');return {id:id(x.id),name:str(x.name,'اسم التمرين'),category:choice(x.category,categories,'الفئة'),type:choice(x.type,types,'نوع التمرين'),equip:choice(x.equip||'machine',equipment,'الأداة'),...(x.machine?{machine:choice(x.machine,machines,'الجهاز')}:{}),...optionalNumber(x,'machineKg',0,500),...(x.rig?{rig:choice(x.rig,['pin','plates'],'نوع الجهاز')}:{}),...optionalNumber(x,'barKg',0,50),isCustom:!!x.isCustom,archived:!!x.archived,...optionalNumber(x,'editedAt',0,1e15)};}
function log(x, allowLegacyFractions=false){
 object(x,'جولة');const out={id:id(x.id),date:date(x.date),exerciseId:id(x.exerciseId),exerciseName:str(x.exerciseName,'اسم التمرين'),type:choice(x.type,types,'نوع الجولة'),category:choice(x.category,categories,'الفئة')};
 for(const key of ['timestamp','editedAt'])Object.assign(out,optionalNumber(x,key,0,1e15));
 if(x.sessionId)out.sessionId=id(x.sessionId);
 if(x.bodyWeightKgAtLog!=null)out.bodyWeightKgAtLog=num(x.bodyWeightKgAtLog,'وزن الجسم',20,350);
 if(out.type==='weights') {
  out.unit=choice(x.unit||'kg',['kg','lbs'],'الوحدة');out.loadMode=choice(x.loadMode||'external',modes,'طريقة الحمل');
  out.weight=x.weight!=null?num(x.weight,'الوزن',0,10000):num(x.displayWeight||0,'الوزن',0,10000)/(out.unit==='lbs'?2.20462:1);
  out.displayWeight=x.displayWeight!=null?num(x.displayWeight,'الوزن المعروض',0,10000):out.weight*(out.unit==='lbs'?2.20462:1);
  out.reps=num(x.reps||1,'العدات',1,150);if(!Number.isInteger(out.reps)){if(!allowLegacyFractions && x.legacyFractionalReps!==true)fail('العدات يجب أن تكون عددًا صحيحًا');out.legacyFractionalReps=true;}
  out.setType=choice(x.setType||'normal',setTypes,'نوع الجولة');out.rir=x.rir==null||x.rir===''?null:num(x.rir,'RIR',0,4);
  if(out.rir!==null&&!Number.isInteger(out.rir)){if(x.legacyFractionalRir!==true)fail('RIR');out.legacyFractionalRir=true;}
  if(out.loadMode==='timed'){out.durationSeconds=num(x.durationSeconds,'الثواني',1,3600);out.weight=0;out.displayWeight=0;out.reps=1;}
  if(x.machineKg!=null&&Number(x.machineKg)>0&&out.loadMode==='external')out.machineKg=num(x.machineKg,'وزن الجهاز',0,500);
  for(const key of ['effectiveLoadKg','volumeLoadKg','oneRepMax'])Object.assign(out,optionalNumber(x,key,0,100000));
  out.calories=num(x.calories||0,'السعرات',0,100000);
  if(x.calculationVersion==='v9-session'||x.calculationVersion==='v10-session')out.calculationVersion=x.calculationVersion;
 } else {
  out.duration=num(x.duration,'مدة الكارديو',1,300);out.calories=num(x.calories||0,'السعرات',0,100000);
  if(out.type==='treadmill'){out.speed=num(x.speed,'السرعة',1,25);out.incline=num(x.incline??1,'الميل',0,25);out.movement=choice(x.movement||'walking',['walking','running'],'نوع الحركة');}
  else {out.machine=choice(x.machine||'bike',machines,'الجهاز');out.intensity=choice(x.intensity||'moderate',['light','moderate','vigorous'],'الشدة');if(x.watts!=null)out.watts=num(x.watts,'الواط',0,2000);}
 }
 return out;
}
function session(x){
 object(x,'جلسة');const out={id:id(x.id),name:str(x.name,'اسم الجلسة'),routine:str(x.routine||'free','الروتين',100),date:date(x.date),startedAt:num(x.startedAt,'بداية الجلسة',1,1e15),status:choice(x.status,['active','completed'],'حالة الجلسة'),endedAt:x.endedAt==null?null:num(x.endedAt,'نهاية الجلسة',1,1e15)};
 if(out.status==='completed'&&(!out.endedAt||out.endedAt<out.startedAt))fail('مدة الجلسة');
 for(const key of ['estimatedCalories','cardioCalories','totalEstimatedCalories','totalVolumeKg','workingSets','editedAt'])Object.assign(out,optionalNumber(x,key,0,1e15));
 if(x.bodyWeightKgAtStart!=null)out.bodyWeightKgAtStart=num(x.bodyWeightKgAtStart,'وزن الجلسة',20,350);
 if(x.exerciseIds)out.exerciseIds=array(x.exerciseIds,10000,'تمارين الجلسة').map(id);
 if(x.planIds)out.planIds=array(x.planIds,500,'خطة الجلسة').map(id);
 if(x.copiedFromSessionId)out.copiedFromSessionId=id(x.copiedFromSessionId);
 return out;
}
function recalculateWeightLog(x) {
 if(x.type!=='weights')return x;
 const mode=x.loadMode||'external';
 const weight=Number(x.weight)||0;
 if(mode==='timed'){Object.assign(x,{weight:0,displayWeight:0,reps:1,effectiveLoadKg:0,volumeLoadKg:0,oneRepMax:null});return x;}
 let body=Number(x.bodyWeightKgAtLog)||0;
 if(!body&&['bodyweight','added','assisted'].includes(mode)) {
  const effective=Number(x.effectiveLoadKg);
  if(!Number.isFinite(effective))fail('وزن الجسم عند تسجيل الجولة مفقود');
  body=mode==='bodyweight'?effective:mode==='added'?effective-weight:effective+weight;
  if(body<=0)fail('وزن الجسم عند تسجيل الجولة غير صالح');
  x.bodyWeightKgAtLog=body;
 }
 // وزن الجهاز (اختياري) ينضاف فقط للوزن الخارجي؛ الجولات اللي ما فيها machineKg تبقى بنفس حسابها القديم.
 const machine=mode==='external'?Number(x.machineKg)||0:0;
 if(mode!=='external')delete x.machineKg;
 const effective=mode==='bodyweight'?body:mode==='added'?body+weight:mode==='assisted'?Math.max(0,body-weight):weight+machine;
 const reps=Number(x.reps);
 Object.assign(x,{effectiveLoadKg:effective,volumeLoadKg:mode==='per_hand'?weight*2:effective,oneRepMax:oneRepMax(effective,reps)});
 return x;
}
function validate(raw){
 object(raw,'الملف');if(raw.schemaVersion!==undefined)num(raw.schemaVersion,'إصدار أحدث غير مدعوم',1,10);
 if(!raw.profile&&!raw.logs&&!raw.exercises&&!raw.sessions)fail('لا توجد بيانات تطبيق');
 const out={};if(raw.profile)out.profile=profile(raw.profile);
 for(const [key,fn,max] of [['logs',log,200000],['exercises',exercise,10000],['sessions',session,100000]]) {
  if(raw[key]!==undefined){out[key]=array(raw[key],max,key).map((item,i)=>{try{return key==='logs'?log(item,Number(raw.schemaVersion||9)<=9):fn(item);}catch(error){throw Error(error.message+' ('+key+'، السجل '+(i+1)+')');}});if(key==='logs')out[key].forEach(recalculateWeightLog);const ids=new Set(out[key].map(x=>x.id));if(ids.size!==out[key].length)fail('معرفات مكررة في '+key);}
 }
 return out;
}
function merge(current,incoming) {
 const next=JSON.parse(JSON.stringify(current));
 const combine=(a,b)=>{const map=new Map(a.map(x=>[x.id,x]));for(const item of b||[]){const old=map.get(item.id);if(!old||(item.editedAt||0)>(old.editedAt||0))map.set(item.id,item);}return [...map.values()];};
 for(const key of ['logs','sessions','exercises'])next[key]=combine(next[key],incoming[key]);
 if(incoming.profile){const p=incoming.profile;const hasData=!!(next.profile.name||next.profile.weight||next.profile.height);const history=new Map((p.history||[]).map(x=>[x.date,x]));for(const h of next.profile.history||[])history.set(h.date,h);next.profile=hasData&&(next.profile.updatedAt||0)>=(p.updatedAt||0)?{...p,...next.profile}:{...next.profile,...p};next.profile.history=[...history.values()].sort((a,b)=>a.date.localeCompare(b.date));}
 const exIds=new Set(next.exercises.map(x=>x.id));
 for(const l of next.logs)if(!exIds.has(l.exerciseId)){next.exercises.push({id:l.exerciseId,name:l.exerciseName,category:l.category,type:l.type,equip:l.type==='weights'?'machine':'cardio',archived:true,isCustom:true});exIds.add(l.exerciseId);}
 const sessions=new Set(next.sessions.map(x=>x.id));for(const l of next.logs)if(l.sessionId&&!sessions.has(l.sessionId))fail('جولة مرتبطة بجلسة مفقودة');
 const active=next.sessions.filter(x=>x.status==='active');if(active.length>1)fail('توجد جلستان نشطتان؛ أنهِ الجلسة الحالية أو استورد نسخة بجلسات مكتملة');
 return next;
}
function validateLog(value) {return recalculateWeightLog(log(value));}
window.GymData={validate,merge,recalculateWeightLog,validateLog,inputNumber,oneRepMax,filterExercises};
})();
