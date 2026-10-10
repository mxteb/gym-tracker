    (function () {
        'use strict';

        const DATA_SCHEMA_VERSION = 10;
        const { ROUTINE_PRESETS, EXERCISE_DICTIONARY, DEFAULT_EXERCISES, CATEGORY_NAMES, EQUIP_NAMES, ROUTINE_LABELS, LOAD_HINTS, SET_LABELS, SET_HELP } = GymCatalog;
        let saving = false;
        async function dbSaveAll() { await GymStorage.save(state); }
        function uniqueId(prefix) { return prefix + '_' + (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)), x=>x.toString(16)).join('-')); }
        function restoreActiveSession() {
            activeSessionId = state.sessions.find(s => s.status === 'active')?.id || null;
        }
        async function runMutation(action) {
            if (saving) return;
            saving = true;
            const controls = [...document.querySelectorAll('button,input,select')];
            const disabled = controls.map(el => el.disabled);
            let inputError = null;
            controls.forEach(el => el.disabled = true);
            try { await action(); }
            catch (error) {
                state = GymStorage.rollback() || state;
                restoreActiveSession();
                updateGenderUI();
                inputError = error;
                showToast(error.message || 'تعذر إتمام العملية');
            } finally {
                controls.forEach((el,i) => el.disabled = disabled[i]);
                saving = false;
                document.getElementById('input-weight').disabled=activeLoadMode==='bodyweight'||activeLoadMode==='timed';
                renderTodayLogs(); updateTopHeaderStats(); updateSessionUI();
                if(inputError?.fieldId) showFieldError(inputError);
            }
        }
        function readField(id,label,min,max,options) {
            try {return GymData.inputNumber(document.getElementById(id).value,label,min,max,options);}
            catch(error){error.fieldId=id;throw error;}
        }
        function showFieldError(error) {
            const input=document.getElementById(error.fieldId);
            if(!input)return;
            // v11.8: الحقل ممكن يكون في تبويب ثاني (الوزن في «جسمك» والطول في البروفايل): نفتح تبويبه عشان يشوف الخطأ
            const scr=input.closest('.screen-content');
            if(scr&&scr.classList.contains('hidden'))switchTab(scr.id.replace('screen-',''));
            for(let parent=input.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
            input.setAttribute('aria-invalid','true');
            let hint=document.getElementById(input.id+'-error');
            if(!hint){hint=document.createElement('p');hint.id=input.id+'-error';hint.className='input-error';input.insertAdjacentElement('afterend',hint);input.parentElement.classList.add('has-input-error');}
            hint.textContent=error.message;
            const described=new Set((input.getAttribute('aria-describedby')||'').split(' ').filter(Boolean));described.add(hint.id);
            input.setAttribute('aria-describedby',[...described].join(' '));
            input.focus();
        }
        function clearFieldError(input) {
            if(!input?.id)return;
            input.removeAttribute('aria-invalid');
            document.getElementById(input.id+'-error')?.remove();input.parentElement?.classList.remove('has-input-error');
            const remaining=(input.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==input.id+'-error');
            if(remaining.length)input.setAttribute('aria-describedby',remaining.join(' '));else input.removeAttribute('aria-describedby');
        }

        function escapeHTML(str) {
            if (typeof str !== 'string') return '';
            return str.replace(/[&<>"']/g, function(m) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
            });
        }

        function getLocalDateString(date = new Date()) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function getCanonicalWeightKg(log) { return GymCalc.canonicalWeightKg(log); }

        function getVolumeLoadKg(log) { return GymCalc.volumeLoadKg(log); }

        function getProgressWeightKg(log) { return GymCalc.progressWeightKg(log); }

        // v10.6 — نوع الرسمة ووزن الجهاز. عرض وإعدادات فقط؛ الحساب في data.js/calc.js.
        const PLATE_LOADED = /(leg press|hack|smith|t-bar|مكبس|هاك|سميث|تي بار)/i;
        function currentExercise() { return state.exercises.find(e => e.id === document.getElementById('exercise-dropdown')?.value); }
        function rigFor(ex) { return ex?.rig || (PLATE_LOADED.test(ex?.name || '') ? 'plates' : 'pin'); }
        function usesMachineWeight(ex, mode) { return !!ex && ex.type === 'weights' && mode === 'external' && ['machine', 'cable_body'].includes(ex.equip); }
        function machineKgFor(ex, mode) { return usesMachineWeight(ex, mode) ? Number(ex.machineKg) || 0 : 0; }
        function visualKind(ex, mode) {
            if (!ex) return null;
            if (ex.type === 'treadmill') return 'treadmill';
            if (ex.type === 'bike_elliptical') return 'cardio';
            if (mode === 'timed') return 'timed';
            if (['bodyweight', 'added', 'assisted'].includes(mode)) return 'body';
            if (mode === 'per_hand' || ex.equip === 'dumbbell') return 'dumbbell';
            if (ex.equip === 'barbell') return 'bar';
            if (ex.equip === 'machine' || ex.equip === 'cable_body') return rigFor(ex);
            return null;
        }
        function renderEquipVisual() {
            const host = document.getElementById('equip-visual');
            if (!host || !window.GymVisual) return;
            const ex = currentExercise();
            const kind = visualKind(ex, activeLoadMode);
            if (!kind) { GymVisual.render(host, null); return; }
            const num = id => parseFloat(document.getElementById(id)?.value) || 0;
            const toUnit = kg => activeWeightUnit === 'lbs' ? Math.round(kg * 2.20462 * 10) / 10 : kg;
            const spec = { kind, unit: activeWeightUnit, mode: activeLoadMode, total: num('input-weight'), extra: num('input-weight') };
            if (kind === 'bar') spec.barKg = Number.isFinite(Number(ex.barKg)) && ex.barKg !== undefined && ex.barKg !== '' ? toUnit(Number(ex.barKg)) : undefined;
            if (kind === 'pin' || kind === 'plates') spec.machineKg = toUnit(machineKgFor(ex, activeLoadMode));
            if (kind === 'body') spec.bodyKg = toUnit(parseFloat(state.profile.weight) || 0);
            if (kind === 'timed') spec.seconds = num('input-duration-sec');
            if (kind === 'treadmill') Object.assign(spec, { speed: num('input-tm-speed'), incline: num('input-tm-incline'), minutes: num('input-tm-duration') });
            if (kind === 'cardio') {
                const sel = document.getElementById('cardio-intensity-select');
                Object.assign(spec, { minutes: num('input-be-duration'), watts: num('input-cardio-watts'), intensityLabel: sel?.selectedOptions[0]?.textContent || '' });
            }
            GymVisual.render(host, spec);
        }
        function renderEquipSettings() {
            const box = document.getElementById('equip-settings');
            if (!box) return;
            const ex = currentExercise();
            const machine = usesMachineWeight(ex, activeLoadMode);
            const barbell = !!ex && ex.type === 'weights' && ex.equip === 'barbell' && activeLoadMode === 'external';
            document.getElementById('machine-weight-row').classList.toggle('hidden', !machine);
            document.getElementById('bar-weight-row').classList.toggle('hidden', !barbell);
            box.classList.toggle('hidden', !machine && !barbell);
            if (machine) {
                const input = document.getElementById('input-machine-kg');
                if (document.activeElement !== input) input.value = Number(ex.machineKg) > 0 ? ex.machineKg : '';
                document.getElementById('rig-select').value = rigFor(ex);
                const past = state.logs.filter(l => l.exerciseId === ex.id && l.type === 'weights' && (l.loadMode || 'external') === 'external' && (Number(l.machineKg) || 0) !== (Number(ex.machineKg) || 0)).length;
                const applyBtn = document.getElementById('btn-apply-machine-past');
                applyBtn.classList.toggle('hidden', !past);
                applyBtn.textContent = `طبّق وزن الجهاز الحالي على جولاتي السابقة (${past})`;
            }
            if (barbell) {
                const input = document.getElementById('input-bar-kg');
                if (document.activeElement !== input) input.value = ex.barKg ?? '';
            }
        }
        async function saveExerciseSetting(patch) {
            const ex = currentExercise();
            if (!ex) return;
            const index = state.exercises.findIndex(e => e.id === ex.id);
            const next = { ...ex, ...patch, editedAt: Date.now() };
            for (const k of Object.keys(patch)) if (patch[k] === null || patch[k] === '') delete next[k];
            state.exercises[index] = next;
            await GymStorage.save(state);
            renderEquipSettings(); update1RMLiveDisplay();
        }
        async function saveMachineKg() {
            const raw = document.getElementById('input-machine-kg').value;
            const value = raw === '' ? 0 : readField('input-machine-kg', 'وزن الجهاز', 0, 500);
            await saveExerciseSetting({ machineKg: value > 0 ? value : null });
        }
        async function saveBarKg() {
            const raw = document.getElementById('input-bar-kg').value;
            const value = raw === '' ? null : readField('input-bar-kg', 'وزن البار', 0, 50);
            await saveExerciseSetting({ barKg: value });
        }
        function applyMachineToPast() {
            const ex = currentExercise();
            if (!ex) return;
            const kg = Number(ex.machineKg) || 0;
            const targets = state.logs.filter(l => l.exerciseId === ex.id && l.type === 'weights' && (l.loadMode || 'external') === 'external' && (Number(l.machineKg) || 0) !== kg);
            showModal({
                title: 'تطبيق وزن الجهاز على السجل',
                message: `بيتغير حساب ${targets.length} جولة سابقة لـ "${ex.name}" عشان تنحسب بوزن جهاز ${kg} كجم (الأقراص اللي سجلتها ما تتغير). تقدر ترجعها بكتابة صفر وتطبيقه مرة ثانية.`,
                confirmText: 'طبّق', cancelText: 'إلغاء',
                onConfirm: async () => {
                    const sessions = new Set();
                    state.logs = state.logs.map(l => {
                        if (!targets.includes(l)) return l;
                        const next = { ...l, editedAt: Date.now() };
                        if (kg > 0) next.machineKg = kg; else delete next.machineKg;
                        Object.assign(next, GymData.validateLog(next));
                        if (l.sessionId) sessions.add(l.sessionId);
                        return next;
                    });
                    for (const id of sessions) await refreshCompletedSessionSummary(id);
                    await GymStorage.save(state);
                    renderEquipSettings();
                    showToast(`تم تحديث ${targets.length} جولة`);
                }
            });
        }

        let state = {
            profile: { id: 'user_profile', name: '', weight: '', height: '', waist: '', age: '', fat: '', muscle: '', water: '', isMan: true, activityFactor: 1.375, history: [] },
            exercises: [],
            logs: [],
            sessions: []
        };

        let restTimerInterval = null;
        let chartInstance = null;
        let currentSplit = 'ppl';
        let currentFilterCat = 'all';
        let currentFilterEquip = 'all';
        let activeWeightUnit = 'kg';
        let activeSetType = 'normal';
        let activeRIR = null;
        let activeLoadMode = 'external';
        let lastPerfData = [];
        let logsRenderLimit = 15;
        let activePresetFilterIds = null;
        let chartMetricMode = 'actual'; // 'actual' = actual weight lifted, '1rm' = theoretical 1RM
        let activeSessionId = null;
        let sessionTimerInterval = null;

        function calculate1RM(weight, reps) {return GymData.oneRepMax(weight,reps);}

        function get1RMLabel(weight, reps) {
            const value = calculate1RM(weight, reps);
            if (value === null) return 'غير مناسب لهذا النطاق';
            return `${value} كجم${parseInt(reps) > 10 ? ' (دقة منخفضة)' : ''}`;
        }

        function validateAndClamp(rawVal, min, max, defaultVal) {
            let num = parseFloat(rawVal);
            if (!Number.isFinite(num)) return defaultVal;
            if (num < min) return min;
            if (num > max) return max;
            return Math.round(num * 1000) / 1000;
        }

        async function loadStateFromDB() {
            state = await GymStorage.load(state);
            const ids = new Set(state.exercises.map(ex => ex.id));
            const missing = DEFAULT_EXERCISES.filter(ex => !ids.has(ex.id));
            if (missing.length) { state.exercises.push(...missing); await GymStorage.save(state); }
            restoreActiveSession();
        }

        function calculateCalories(type, data) { return GymCalc.calories(type, data, state.profile.weight); }

        function estimateWeightSessionCalories(session, sessionLogs) { return GymCalc.weightSessionCalories(session, sessionLogs); }

        async function refreshCompletedSessionSummary(sessionId) {
            const session = state.sessions.find(s => s.id === sessionId && s.status === 'completed');
            if (!session) return;
            const sessionLogs = state.logs.filter(l => l.sessionId === session.id);
            Object.assign(session, GymCalc.sessionSummary(session, sessionLogs));
            session.editedAt = Date.now();
        }

        function getActiveSession() {
            return state.sessions.find(s => s.id === activeSessionId && s.status === 'active') || null;
        }

        async function startWorkoutSession(routineOverride) {
            if (getActiveSession()) {
                showToast('لديك جلسة نشطة بالفعل');
                return getActiveSession();
            }
            const routine = routineOverride || document.getElementById('session-routine-select').value || 'free';
            const session = {
                id: uniqueId('session'),
                schemaVersion: DATA_SCHEMA_VERSION,
                name: ROUTINE_LABELS[routine] || 'جلسة حرة',
                routine,
                date: getLocalDateString(),
                startedAt: Date.now(),
                endedAt: null,
                status: 'active',
                estimatedCalories: 0,
                bodyWeightKgAtStart: parseFloat(state.profile.weight) || 75
            };
            state.sessions.push(session);
            activeSessionId = session.id;

            await dbSaveAll('sessions', state.sessions);
            if (ROUTINE_PRESETS[routine]) loadPresetRoutine(routine);
            updateSessionUI();
            showToast(`بدأت ${session.name}`);
            if (state.profile.ramadan === true) setTimeout(() => showToast('رمضان: اشرب ماء بين الجولات، ولو كنت صايم خل الجلسة أقصر'), 700);
            return session;
        }

        async function ensureActiveSession() {
            return getActiveSession() || startWorkoutSession('free');
        }

        function openFinishSession() {
            if(!document.getElementById('finish-session-modal')){showToast('حدّث ملفات الموقع كاملة لفتح نافذة إنهاء الجلسة');return;}
            const session=getActiveSession();if(!session)return;
            const input=document.getElementById('finish-session-duration');clearFieldError(input);
            input.value=Math.max(1,Math.round((Date.now()-session.startedAt)/60000));
            document.getElementById('finish-session-modal').classList.remove('hidden');input.focus();
        }
        function closeFinishSession() {
            document.getElementById('finish-session-modal').classList.add('hidden');
            document.getElementById('btn-finish-session').focus();
        }
        async function finishWorkoutSession() {
            const session = getActiveSession();
            if (!session) return;
            const elapsed = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
            const duration=readField('finish-session-duration','مدة الجلسة',1,elapsed+1440);
            const sessionLogs = state.logs.filter(l => l.sessionId === session.id);
            const cardioMinutes = sessionLogs.filter(l => l.type !== 'weights').reduce((n,l) => n + (Number(l.duration) || 0), 0);
            if (cardioMinutes > duration) {const error=Error('مدة الكارديو المسجلة أكبر من مدة الجلسة. صحح المدة أو تسجيل الكارديو.');error.fieldId='finish-session-duration';throw error;}
            session.endedAt = Date.now();
            session.startedAt = session.endedAt - duration * 60000;
            session.status = 'completed';
            const weightLogs = sessionLogs.filter(l => l.type === 'weights');
            const workingLogs = weightLogs.filter(l => l.setType !== 'warmup');
            Object.assign(session, GymCalc.sessionSummary(session, sessionLogs));
            session.editedAt = Date.now();
            await dbSaveAll('sessions', state.sessions);
            activeSessionId = null;
            stopRestTimer();

            updateSessionUI();
            updateTopHeaderStats();
            const durationLabel = Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000));
            const rirValues = workingLogs.filter(l => l.rir !== null && l.rir !== undefined && l.rir !== '').map(l => Number(l.rir)).filter(Number.isFinite);
            const avgRir = rirValues.length ? (rirValues.reduce((a, b) => a + b, 0) / rirValues.length).toFixed(1) : 'غير محدد';
            const validOneRms = workingLogs.filter(l => l.loadMode !== 'timed').map(l => calculate1RM(getProgressWeightKg(l), l.reps)).filter(Number.isFinite);
            const bestLog=workingLogs.filter(l=>l.loadMode!=='timed').sort((a,b)=>(calculate1RM(getProgressWeightKg(b),b.reps)||0)-(calculate1RM(getProgressWeightKg(a),a.reps)||0))[0];
            const bestOneRm = validOneRms.length ? Math.max(...validOneRms) + ' كجم — '+bestLog.exerciseName+(bestLog.loadMode==='per_hand'?' (لكل يد)':'') : 'غير متاح';
            document.getElementById('finish-session-modal').classList.add('hidden');
            let insights = [];
            try { insights = sessionInsightLines(session.id); } catch (e) { console.warn('insights', e); }
            document.dispatchEvent(new CustomEvent('gym:session-finished', { detail: { sessionId: session.id } }));
            showModal({
                title: `ملخص ${session.name}`,
                message: `المدة: ${durationLabel} دقيقة | الجولات الفعلية: ${workingLogs.length} | الحجم الفعلي: ${(session.totalVolumeKg / 1000).toFixed(2)} طن | متوسط RIR: ${avgRir} | أعلى 1RM مسجل بين التمارين: ${bestOneRm} | السعرات التقديرية للحديد والكارديو: ${session.totalEstimatedCalories}`,
                confirmText: 'تم', cancelText: 'إغلاق', insights,
                share: () => shareSessionImage(session.id)
            });
        }

        function getPreviousCompletedSession() {
            return state.sessions.filter(s => s.status === 'completed').sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))[0] || null;
        }

        async function copyPreviousSession() {
            const previous = getPreviousCompletedSession();
            if (!previous) {
                // Legacy data has no session IDs, so treat the last logged date as one session.
                const dates = [...new Set(state.logs.filter(l => l.type === 'weights').map(l => l.date))].sort().reverse();
                if (!dates.length) return showToast('لا توجد جلسة سابقة لنسخها');
                const legacyLogs = state.logs.filter(l => l.type === 'weights' && l.date === dates[0]);
                resetRoutineFilter();
                activePresetFilterIds = [...new Set(legacyLogs.map(l => l.exerciseId))];
                renderExerciseDropdown();
                renderCopiedSessionPlan(legacyLogs, `جلسة ${dates[0]}`);
                if (!getActiveSession()) await startWorkoutSession('free');
                return;
            }
            const previousLogs = state.logs.filter(l => l.sessionId === previous.id && l.type === 'weights');
            resetRoutineFilter();
            activePresetFilterIds = [...new Set(previousLogs.map(l => l.exerciseId))];
            renderExerciseDropdown();
            renderCopiedSessionPlan(previousLogs, previous.name);
            if (!getActiveSession()) await startWorkoutSession(previous.routine || 'free');
            activePresetFilterIds = [...new Set(previousLogs.map(l => l.exerciseId))];
            renderExerciseDropdown();
            const active = getActiveSession();
            if (active) {
                active.copiedFromSessionId = previous.id;
                await dbSaveAll('sessions', state.sessions);
            }
        }

        function renderCopiedSessionPlan(logs, title) {
            const container = document.getElementById('copied-session-plan');
            const grouped = Object.create(null);
            logs.forEach(l => {
                if (!grouped[l.exerciseName]) grouped[l.exerciseName] = [];
                const unit = l.unit === 'lbs' ? 'lb' : 'kg';
                if (l.loadMode === 'timed') { grouped[l.exerciseName].push(`${Number(l.durationSeconds)||0} ثانية`); return; }
                grouped[l.exerciseName].push(`${l.displayWeight ?? getCanonicalWeightKg(l)}${unit}×${l.reps}`);
            });
            container.innerHTML = `<strong class="text-cyan-300">${escapeHTML(title)}:</strong> ` + Object.entries(grouped).map(([name, sets]) => `${escapeHTML(name)}: ${escapeHTML(sets.join(' · '))}`).join('<br>');
            container.classList.remove('hidden');
            showToast(`تم تحميل ${Object.keys(grouped).length} تمارين من الجلسة السابقة`);
        }

        function updateSessionUI() {
            const session = getActiveSession();
            const card = document.getElementById('workout-session-card');
            const title = document.getElementById('active-session-title');
            const meta = document.getElementById('active-session-meta');
            const startBtn = document.getElementById('btn-start-session');
            const finishBtn = document.getElementById('btn-finish-session');
            if (!card) return;
            if (session) {
                card.classList.add('session-active');
                title.textContent = session.name;
                meta.textContent = `بدأت ${new Date(session.startedAt).toLocaleTimeString(GymI18n.locale, { hour: '2-digit', minute: '2-digit' })}`;
                startBtn.disabled = true;
                finishBtn.disabled = false;
                clearInterval(sessionTimerInterval);
                const tick = () => {
                    const seconds = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
                    const txt = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
                    document.getElementById('active-session-timer').textContent = txt;
                    const nt = document.getElementById('nav-workout-timer');
                    if (nt) { nt.textContent = txt; nt.hidden = false; }
                };
                tick();
                sessionTimerInterval = setInterval(tick, 1000);
            } else {
                card.classList.remove('session-active');
                title.textContent = 'لا توجد جلسة نشطة';
                meta.textContent = 'ابدأ جلسة ليتم حساب مدتها وملخصها بدقة';
                startBtn.disabled = false;
                finishBtn.disabled = true;
                clearInterval(sessionTimerInterval);
                document.getElementById('active-session-timer').textContent = '00:00';
                const nt = document.getElementById('nav-workout-timer'); if (nt) nt.hidden = true;
            }
            renderSessionPlan(); renderSuggestion(); renderRepeatButton(); applyKeepAwake();
        }

        function setSplitSystem(split) {
            currentSplit = split;
            currentFilterCat = 'all';
            activePresetFilterIds = null;
            document.getElementById('exercise-search-input').value = '';

            const pplBtn = document.getElementById('split-btn-ppl');
            const ulBtn = document.getElementById('split-btn-ul');

            if (split === 'ppl') {
                pplBtn.className = "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md";
                ulBtn.className = "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-slate-800 text-slate-400 hover:bg-slate-700";
            } else {
                ulBtn.className = "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md";
                pplBtn.className = "px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-slate-800 text-slate-400 hover:bg-slate-700";
            }

            renderCategoryTabs();
            renderExerciseDropdown();
        }

        function loadPresetRoutine(routineKey) {
            const exIds = ROUTINE_PRESETS[routineKey];
            if (!exIds) return;

            currentFilterCat='all';currentFilterEquip='all';
            document.getElementById('exercise-search-input').value='';
            renderCategoryTabs();setEquipFilter('all',document.querySelector('[data-equip="all"]'));
            activePresetFilterIds = exIds;
            renderExerciseDropdown();
            showToast('تم عرض قائمة التمارين الجاهزة');
        }

        function resetRoutineFilter() {
            activePresetFilterIds = null;currentFilterCat='all';
            document.getElementById('exercise-search-input').value='';renderCategoryTabs();
            setEquipFilter('all',document.querySelector('[data-equip="all"]'));
            showToast('تم إظهار جميع التمارين');
        }

        function renderCategoryTabs() {
            const container = document.getElementById('category-tabs-container');
            const fragment = document.createDocumentFragment();

            const categories = currentSplit === 'ppl' ? [
                { id: 'all', label: 'الكل' },
                { id: 'push', label: 'دفع' },
                { id: 'pull', label: 'سحب' },
                { id: 'legs', label: 'أرجل' },
                { id: 'abs', label: 'بطن' },
                { id: 'cardio', label: 'كارديو' }
            ] : [
                { id: 'all', label: 'الكل' },
                { id: 'upper', label: 'علوي (Upper)' },
                { id: 'lower', label: 'سفلي (Lower)' },
                { id: 'cardio', label: 'كارديو' }
            ];

            categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.dataset.cat = cat.id;
                btn.className = `cat-btn px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    cat.id === currentFilterCat 
                        ? 'active bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md' 
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`;
                btn.textContent = cat.label;
                fragment.appendChild(btn);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        }

        function setWorkoutCategoryFilter(cat, btnEl) {
            currentFilterCat = cat;

            document.querySelectorAll('.cat-btn').forEach(btn => {
                btn.classList.remove('bg-gradient-to-r', 'from-cyan-500', 'to-blue-600', 'text-white', 'shadow-md', 'active');
                btn.classList.add('bg-slate-800/80', 'text-slate-300');
            });
            if (btnEl) {
                btnEl.classList.remove('bg-slate-800/80', 'text-slate-300');
                btnEl.classList.add('bg-gradient-to-r', 'from-cyan-500', 'to-blue-600', 'text-white', 'shadow-md', 'active');
            }

            renderExerciseDropdown();
        }

        function setEquipFilter(equip, btnEl) {
            currentFilterEquip = equip;

            document.querySelectorAll('.equip-btn').forEach(btn => {
                btn.className = "equip-btn px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap bg-slate-900 text-slate-400 border border-slate-800";
            });
            if (btnEl) {
                btnEl.className = "equip-btn active px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap bg-cyan-950 text-cyan-300 border border-cyan-800";
            }
            renderExerciseDropdown();
        }

        function renderExerciseDropdown() {
            const dropdown = document.getElementById('exercise-dropdown');
            const searchVal = document.getElementById('exercise-search-input').value.trim().toLowerCase();

            const previousId=dropdown.value;
            const filtered=GymData.filterExercises(state.exercises,{presetIds:activePresetFilterIds,category:currentFilterCat,equipment:currentFilterEquip,search:searchVal});
            const summary=document.getElementById('filter-summary');
            if(summary)summary.textContent=(activePresetFilterIds?'قائمة جاهزة':'كل التمارين')+' · '+filtered.length+' نتيجة';

            dropdown.innerHTML = '';
            if (filtered.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'لا توجد تمارين تطابق خيارات البحث';
                dropdown.appendChild(opt);
                onExerciseSelectChange();
                return;
            }

            const fragment = document.createDocumentFragment();
            filtered.forEach(ex => {
                const catEmoji = CATEGORY_NAMES[ex.category] || '';
                const opt = document.createElement('option');
                opt.value = ex.id;
                opt.textContent = `${ex.name} (${catEmoji})`;
                fragment.appendChild(opt);
            });

            dropdown.appendChild(fragment);
            if(filtered.some(ex=>ex.id===previousId))dropdown.value=previousId;
            onExerciseSelectChange();
        }

        function onExerciseSelectChange() {
            const dropdown = document.getElementById('exercise-dropdown');
            const selectedId = dropdown.value;
            const ex = state.exercises.find(e => e.id === selectedId);

            const formWeights = document.getElementById('form-weights');
            const formTm = document.getElementById('form-treadmill');
            const formBe = document.getElementById('form-bike-elliptical');
            const equipBadge = document.getElementById('selected-exercise-equip-badge');

            formWeights.classList.add('hidden');
            formTm.classList.add('hidden');
            formBe.classList.add('hidden');

            updateLastPerformanceDisplay(selectedId);
            update1RMLiveDisplay();

            if (!ex) {
                equipBadge.textContent = 'غير محدد';
                renderEquipSettings(); renderEquipVisual(); renderRepeatButton(); renderSuggestion(); renderExNote(); renderBusyButton(); renderSides(); renderGuide(); renderProgramTarget();
                return;
            }

            equipBadge.textContent = EQUIP_NAMES[ex.equip] || 'أوزان حرة';

            if (ex.type === 'weights') {
                const recent = state.logs.filter(l => l.exerciseId === ex.id).sort((a,b) => (b.timestamp||0)-(a.timestamp||0))[0];
                const suggestedMode = recent?.loadMode || getDefaultLoadMode(ex);
                const modeSelect = document.getElementById('load-mode-select');
                if (modeSelect && modeSelect.dataset.exerciseId !== ex.id) {
                    modeSelect.dataset.exerciseId = ex.id;
                    modeSelect.value = suggestedMode;
                    setLoadMode(suggestedMode);
                }
            }

            if (ex.type === 'weights') {
                // the unit this exercise was last logged in (a machine in lb, the bench in kg)
                const lastLog = ex.unit ? null : state.logs.filter(l => l.exerciseId === ex.id && l.type === 'weights' && l.unit).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
                const unit = ex.unit || lastLog?.unit;
                if ((unit === 'kg' || unit === 'lbs') && unit !== activeWeightUnit) setWeightUnit(unit);
            }
            if (ex.type === 'weights') formWeights.classList.remove('hidden');
            else if (ex.type === 'treadmill') formTm.classList.remove('hidden');
            else if (ex.type === 'bike_elliptical') formBe.classList.remove('hidden');
            applyExerciseRest(ex);
            renderEquipSettings(); renderEquipVisual(); renderRepeatButton(); renderSuggestion(); renderExNote(); renderBusyButton(); renderSides(); renderGuide(); renderProgramTarget();
        }

        function update1RMLiveDisplay() {
            const rawWeight = parseFloat(document.getElementById('input-weight').value) || 0;
            const reps = Number(document.getElementById('input-reps').value);
            let weightInKg = activeWeightUnit === 'lbs' ? rawWeight / 2.20462 : rawWeight;
            const span = document.getElementById('val-1rm-live');
            if (!span) return;
            if (activeLoadMode === 'timed') span.textContent = 'غير مطبق للتمرين الزمني';
            else {
                const body = Number(state.profile.weight) || 0;
                if (activeLoadMode === 'bodyweight') weightInKg = body;
                if (activeLoadMode === 'added') weightInKg += body;
                if (activeLoadMode === 'assisted') weightInKg = Math.max(0, body - weightInKg);
                weightInKg += machineKgFor(currentExercise(), activeLoadMode);
                span.textContent = get1RMLabel(weightInKg, reps);
            }
            renderEquipVisual();
        }

        function getDefaultLoadMode(exercise) { return GymCalc.defaultLoadMode(exercise); }

        function setLoadMode(mode) {
            activeLoadMode = mode || 'external';
            const select = document.getElementById('load-mode-select');
            if (select) select.value = activeLoadMode;
            document.getElementById('load-mode-hint').textContent = LOAD_HINTS[activeLoadMode] || LOAD_HINTS.external;
            document.getElementById('timed-duration-field').classList.toggle('hidden', activeLoadMode !== 'timed');
            document.getElementById('reps-field-wrapper').classList.toggle('hidden', activeLoadMode === 'timed');
            const weightInput = document.getElementById('input-weight');
            weightInput.disabled = activeLoadMode === 'bodyweight' || activeLoadMode === 'timed';
            if (activeLoadMode === 'bodyweight' || activeLoadMode === 'timed') weightInput.value = 0;
            updateWeightConvertedDisplay();
            update1RMLiveDisplay();
            renderEquipSettings();
            renderSuggestion();
            renderSides();
        }

        function updateLastPerformanceDisplay(exerciseId) {
            const textEl = document.getElementById('last-performance-text');
            const copyBtn = document.getElementById('btn-copy-last-perf');
            const picker=document.getElementById('previous-set-picker');picker?.classList.add('hidden');

            if (!exerciseId) {
                textEl.textContent = 'اختر تمرين للعرض';
                copyBtn.classList.add('hidden');
                lastPerfData = [];
                return;
            }

            const exLogs = state.logs.filter(l => l.exerciseId === exerciseId && l.type === 'weights' && (!activeSessionId || l.sessionId !== activeSessionId)).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

            if (exLogs.length === 0) {
                textEl.textContent = 'لا يوجد أداء سابق مسجل لهذا التمرين';
                textEl.className = 'text-xs font-medium text-slate-400';
                copyBtn.classList.add('hidden');
                lastPerfData = [];
            } else {
                const latest = exLogs[exLogs.length - 1];
                const latestGroupKey = latest.sessionId || latest.date;
                lastPerfData = exLogs.filter(l => (l.sessionId || l.date) === latestGroupKey);
                textEl.innerHTML = lastPerfData.map(set => {
                    if (set.loadMode === 'timed') return `<span>${Number(set.durationSeconds) || 0} ثانية</span>`;
                    const unitStr = set.unit === 'lbs' ? 'lb' : 'kg';
                    const weightVal = set.displayWeight ?? getCanonicalWeightKg(set);
                    const rirText = set.rir !== undefined && set.rir !== null ? ` · RIR ${set.rir}` : '';
                    return `<span class="inline-block ml-2"><strong class="text-cyan-300">${escapeHTML(String(weightVal))}${unitStr}</strong> × ${escapeHTML(String(set.reps))}${escapeHTML(rirText)}</span>`;
                }).join('');
                textEl.className = 'text-xs font-bold text-cyan-300';
                copyBtn.classList.remove('hidden');
                const select=document.getElementById('previous-set-select');if(select && picker){select.replaceChildren();
                lastPerfData.forEach((log,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`${index+1}. ${log.loadMode==='timed'?log.durationSeconds+' ثانية':(log.displayWeight??getCanonicalWeightKg(log))+' '+(log.unit==='lbs'?'باوند':'كجم')+' × '+log.reps} · ${logMetadata(log)}`;select.appendChild(option);});
                select.value=String(Math.max(0,lastPerfData.findIndex(log=>log.setType!=='warmup')));picker.classList.remove('hidden');}
            }
        }

        function copyLastPerformance() {
            if (!lastPerfData.length) return;
            const firstWorkingSet = lastPerfData[Number(document.getElementById('previous-set-select')?.value ?? Math.max(0,lastPerfData.findIndex(log=>log.setType!=='warmup')))] || lastPerfData[0];
            fillFromLog(firstWorkingSet);
            showToast('تمت تعبئة الجولة المختارة؛ اضغط حفظ بعد أدائها');
        }
        function updateSetHelp(){const help=document.getElementById('set-type-help');if(help)help.textContent=SET_HELP[activeSetType]||SET_HELP.normal;}
        function logMetadata(log){
            const type=SET_LABELS[log.setType]||SET_LABELS.normal;
            const rir=log.rir==null?'RIR غير محدد':log.rir===4?'RIR 4+':'RIR '+log.rir;
            return type+' · '+rir;
        }
        function setSetType(type, btnEl) {
            activeSetType = type==='drop'?'dropset':type;
            document.querySelectorAll('.set-type-btn').forEach(btn => {
                btn.className = "set-type-btn py-2 px-1 rounded-xl border text-center";
            });
            if (btnEl) btnEl.className = "set-type-btn active py-2 px-1 rounded-xl border text-center";
            document.querySelectorAll('.set-type-btn').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.settype===activeSetType)));
            updateSetHelp();
        }

        function setRIR(rirVal, btnEl) {
            activeRIR = rirVal === '' ? null : parseInt(rirVal);
            document.querySelectorAll('.rir-btn').forEach(btn => {
                btn.className = "rir-btn py-2 rounded-xl border text-center";
            });
            if (btnEl) btnEl.className = "rir-btn active py-2 rounded-xl border text-center";
            document.querySelectorAll('.rir-btn').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.rir===String(activeRIR??''))));
            renderFeel();
        }

        function setWeightUnit(unit) {
            if (activeWeightUnit === unit) return;

            const inputWeight = document.getElementById('input-weight');
            const currentVal = parseFloat(inputWeight.value) || 0;

            activeWeightUnit = unit;
            inputWeight.max = unit === 'lbs' ? 2204.62 : 1000;
            const kgBtn = document.getElementById('unit-btn-kg');
            const lbsBtn = document.getElementById('unit-btn-lbs');

            if (unit === 'kg') {
                kgBtn.className = "px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-500 text-white transition-all";
                lbsBtn.className = "px-2 py-0.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-all";
                inputWeight.value = Math.round((currentVal / 2.20462) * 1000) / 1000;
            } else {
                lbsBtn.className = "px-2 py-0.5 rounded-lg text-[10px] font-bold bg-cyan-500 text-white transition-all";
                kgBtn.className = "px-2 py-0.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-all";
                inputWeight.value = Math.round(currentVal * 2.20462 * 1000) / 1000;
            }

            updateWeightConvertedDisplay();
            update1RMLiveDisplay();
        }

        function handleStepperClick(targetInputId, stepDelta) {
            const input = document.getElementById(targetInputId);
            if (!input || input.disabled) return;

            let min = parseFloat(input.min) || 0;
            let max = parseFloat(input.max) || 999;
            let current = parseFloat(input.value) || 0;
            let updated = validateAndClamp(current + stepDelta, min, max, current);

            input.value = updated;

            if (targetInputId === 'input-weight') {
                updateWeightConvertedDisplay();
                update1RMLiveDisplay();
            } else if (targetInputId === 'input-reps') {
                document.getElementById('val-reps-display').textContent = updated;
                update1RMLiveDisplay();
            }
            renderEquipVisual();
        }

        function updateWeightConvertedDisplay() {
            const inputWeight = document.getElementById('input-weight');
            const val = validateAndClamp(inputWeight.value, 0, activeWeightUnit === 'lbs' ? 2204.62 : 1000, 0);
            inputWeight.value = val;
            
            const convertedSpan = document.getElementById('val-weight-converted');
            if (activeWeightUnit === 'kg') {
                convertedSpan.textContent = `${(val * 2.20462).toFixed(1)} باوند (lbs)`;
            } else {
                convertedSpan.textContent = `${(val / 2.20462).toFixed(1)} كجم (kg)`;
            }
            renderEquipVisual();
        }

        async function saveSet() {
            const dropdown = document.getElementById('exercise-dropdown');
            const exId = dropdown.value;
            const ex = state.exercises.find(e => e.id === exId);
            if (!ex) return;

            const rawWeight = ['bodyweight','timed'].includes(activeLoadMode)?0:readField('input-weight','الوزن',0,activeWeightUnit==='lbs'?2204.62:1000);
            const repsInput = activeLoadMode === 'timed' ? 1 : readField('input-reps','العدات',1,150,{integer:true});
            const sides = sideReps();
            if (sides && !Number.isInteger(sides.left)) { const error = Error('عدات اليسار لازم رقم صحيح'); error.fieldId = 'input-reps-left'; throw error; }
            // v11.5 B5: the weaker side counts for 1RM, records and the next suggestion
            const reps = sides ? Math.max(1, Math.min(sides.right, sides.left)) : repsInput;
            const durationSeconds = activeLoadMode === 'timed' ? readField('input-duration-sec','المدة بالثواني',1,3600) : null;
            let weightInKg = activeLoadMode === 'timed' ? 0 : activeWeightUnit === 'lbs' ? rawWeight / 2.20462 : rawWeight;
            const bodyWeightKg = parseFloat(state.profile.weight) || 0;
            if (['bodyweight', 'added', 'assisted'].includes(activeLoadMode) && !bodyWeightKg) {
                showToast('أدخل وزن جسمك في البروفايل أولًا لهذا النوع من التمارين');
                return;
            }
            const session = await ensureActiveSession();
            const machineKg = machineKgFor(ex, activeLoadMode);
            let effectiveLoadKg = weightInKg + machineKg;
            if (activeLoadMode === 'bodyweight') effectiveLoadKg = bodyWeightKg;
            else if (activeLoadMode === 'added') effectiveLoadKg = bodyWeightKg + weightInKg;
            else if (activeLoadMode === 'assisted') effectiveLoadKg = Math.max(0, bodyWeightKg - weightInKg);
            const volumeLoadKg = activeLoadMode === 'per_hand' ? weightInKg * 2 : effectiveLoadKg;
            const oneRepMax = activeLoadMode === 'timed' ? null : calculate1RM(effectiveLoadKg, reps);
            const calories = calculateCalories('weights', { weight: weightInKg, reps, setType: activeSetType });
            const today = getLocalDateString();

            const logEntry = {
                id: uniqueId('log'),
                schemaVersion: DATA_SCHEMA_VERSION,
                date: today,
                timestamp: Date.now(),
                sessionId: session ? session.id : null,
                exerciseId: ex.id,
                exerciseName: ex.name,
                category: ex.category,
                type: 'weights',
                weight: weightInKg,
                displayWeight: activeLoadMode === 'timed' ? 0 : rawWeight,
                unit: activeWeightUnit,
                reps,
                ...(sides ? { repsRight: sides.right, repsLeft: sides.left } : {}),
                oneRepMax,
                rir: activeRIR,
                setType: activeSetType,
                loadMode: activeLoadMode,
                ...(machineKg > 0 ? { machineKg } : {}),
                bodyWeightKgAtLog: bodyWeightKg || null,
                effectiveLoadKg,
                volumeLoadKg,
                durationSeconds,
                calories,
                calculationVersion: 'v10-session'
            };

            Object.assign(logEntry,GymData.validateLog(logEntry));
            const record = GymCalc.newRecord(state.logs, logEntry);
            state.logs.push(logEntry);
            // v11.7: the unit is remembered per exercise (one machine in lb, another in kg)
            if (activeLoadMode !== 'timed' && ex.unit !== activeWeightUnit) {
                const ei = state.exercises.findIndex(e => e.id === ex.id);
                if (ei >= 0) state.exercises[ei] = { ...state.exercises[ei], unit: activeWeightUnit, editedAt: Date.now() };
            }
            await dbSaveAll('logs', state.logs);

            renderTodayLogs();
            updateTopHeaderStats();
            updateLastPerformanceDisplay(ex.id);
            showToast(activeLoadMode === 'timed' ? `تم حفظ ${durationSeconds} ثانية` : `تم حفظ الجولة (${rawWeight} ${activeWeightUnit === 'lbs' ? 'باوند' : 'كجم'})`);

            document.getElementById('logs-date-filter').value = getLocalDateString();
            renderTodayLogs();
            haptic('confirm');
            if (record) {
                const u = modeUnit(logEntry.loadMode);
                const what = record.kind === 'time' ? `${record.value} ثانية (السابق ${record.previous})`
                    : record.kind === '1rm' ? `1RM ${fmt1(record.value)} ${u} (السابق ${fmt1(record.previous)})`
                    : `${fmt1(record.value)} ${u} (السابق ${fmt1(record.previous)})`;
                setTimeout(() => { showToast(`رقم قياسي جديد في ${shortName(ex.name)}: ${what}`); haptic('long'); }, 600);
            }
            const customRestSecs = Number(document.getElementById('rest-timer-duration').value);
            // v11.5 B6: the lock-screen notification can repeat this set ("كرر: 60 كجم × 8")
            if(customRestSecs>0)startRestTimer(customRestSecs, ex.name, { exerciseId: ex.id, repeat: setLabel(logEntry) });else stopRestTimer();
        }

        async function saveCardioSet(cardioType) {
            const dropdown = document.getElementById('exercise-dropdown');
            const exId = dropdown.value;
            const ex = state.exercises.find(e => e.id === exId);
            if (!ex) return;

            const today = getLocalDateString();
            let calories = 0;
            let logData = {
                id: uniqueId('log'),
                schemaVersion: DATA_SCHEMA_VERSION,
                date: today,
                timestamp: Date.now(),
                exerciseId: ex.id,
                exerciseName: ex.name,
                category: ex.category,
                type: cardioType,
                bodyWeightKgAtLog: parseFloat(state.profile.weight) || 75
            };

            if (cardioType === 'treadmill') {
                const speed = readField('input-tm-speed','السرعة',1,25);
                const incline = readField('input-tm-incline','الميل',0,25);
                const duration = readField('input-tm-duration','المدة بالدقائق',1,180);
                const movement = document.getElementById('tm-movement-type').value;
                calories = calculateCalories('treadmill', { speed, incline, duration, movement, bodyWeightKgAtLog: logData.bodyWeightKgAtLog });
                logData = { ...logData, speed, incline, duration, movement, calories, caloriesEstimated: true };
            } else {
                const duration = readField('input-be-duration','المدة بالدقائق',1,180);
                const intensity = document.getElementById('cardio-intensity-select').value;
                const watts = readField('input-cardio-watts','الواط',0,2000,{optional:true});
                const machineMap = { ex_65: 'bike', ex_66: 'elliptical', ex_67: 'stairs', ex_68: 'rowing', ex_69: 'airbike' };
                const machine = ex.machine || machineMap[ex.id] || 'bike';
                calories = calculateCalories('bike_elliptical', { machine, intensity, watts, duration, bodyWeightKgAtLog: logData.bodyWeightKgAtLog });
                logData = { ...logData, machine, intensity, watts, duration, calories, caloriesEstimated: true };
            }

            Object.assign(logData,GymData.validateLog(logData));
            const session=await ensureActiveSession();logData.sessionId=session.id;
            state.logs.push(logData);
            await dbSaveAll('logs', state.logs);

            renderTodayLogs();
            updateTopHeaderStats();
            document.getElementById('logs-date-filter').value = getLocalDateString();renderTodayLogs();
            haptic('confirm');
            showToast('تم حفظ تمرين الكارديو');
        }

        function deleteLogItem(logId) {
            showModal({
                title: 'حذف الجولة',
                message: 'هل أنت متاكد من حذف هذه الجولة؟',
                confirmText: 'احذف',
                cancelText: 'إلغاء',
                onConfirm: async () => {
                    const deletedLog = state.logs.find(l => l.id === logId);
                    state.logs = state.logs.filter(l => l.id !== logId);
                    if (deletedLog && deletedLog.sessionId) await refreshCompletedSessionSummary(deletedLog.sessionId);
                    await GymStorage.save(state);
                    renderTodayLogs();
                    updateTopHeaderStats();
                    showToast('تم الحذف');
                }
            });
        }

        let editReturnFocus = null;
        function closeEditLog() {
            document.getElementById('edit-log-modal').classList.add('hidden');
            editReturnFocus?.focus();
        }
        function updateEditModeUI() {
            const mode=document.getElementById('edit-log-load-mode').value;
            const timed=mode==='timed',body=['bodyweight','added','assisted'].includes(mode);
            document.getElementById('edit-log-weight-row').classList.toggle('hidden',timed||mode==='bodyweight');
            document.getElementById('edit-log-reps-row').classList.toggle('hidden',timed);
            document.getElementById('edit-log-seconds-row').classList.toggle('hidden',!timed);
            document.getElementById('edit-log-body-row').classList.toggle('hidden',!body);
            document.getElementById('edit-log-machinekg-row')?.classList.toggle('hidden',mode!=='external');
            document.getElementById('edit-log-load-hint').textContent=LOAD_HINTS[mode];
        }
        function openEditLog(logId) {
            if(!document.getElementById('edit-log-exercise')){showToast('حدّث ملفات الموقع كاملة لفتح محرر السجل الجديد');return;}
            const log=state.logs.find(l=>l.id===logId);if(!log)return;
            editReturnFocus=document.activeElement;
            const modal=document.getElementById('edit-log-modal');
            modal.querySelectorAll('[aria-invalid]').forEach(clearFieldError);
            document.getElementById('edit-log-id').value=logId;
            const exSelect=document.getElementById('edit-log-exercise');exSelect.replaceChildren();
            for(const ex of state.exercises.filter(e=>e.type===log.type&&(!e.archived||e.id===log.exerciseId))){
                const option=document.createElement('option');option.value=ex.id;option.textContent=ex.name;exSelect.appendChild(option);
            }
            exSelect.value=log.exerciseId;
            const isWeight=log.type==='weights';
            document.getElementById('edit-weight-fields').classList.toggle('hidden',!isWeight);
            document.getElementById('edit-cardio-fields').classList.toggle('hidden',isWeight);
            if(isWeight){
                document.getElementById('edit-log-load-mode').value=log.loadMode||'external';
                document.getElementById('edit-log-set-type').value=log.setType==='drop'?'dropset':log.setType||'normal';
                document.getElementById('edit-log-weight').max=log.unit==='lbs'?2204.62:1000;
                document.getElementById('edit-log-weight-label').textContent='الوزن المسجل ('+(log.unit==='lbs'?'باوند':'كجم')+')';
                document.getElementById('edit-log-weight').value=log.displayWeight??getCanonicalWeightKg(log);
                document.getElementById('edit-log-reps').value=log.reps;
                document.getElementById('edit-log-rir').value=log.rir??'';
                document.getElementById('edit-log-seconds').value=log.durationSeconds||60;
                const inferredBody=log.loadMode==='bodyweight'?Number(log.effectiveLoadKg):log.loadMode==='added'?Number(log.effectiveLoadKg)-getCanonicalWeightKg(log):log.loadMode==='assisted'?Number(log.effectiveLoadKg)+getCanonicalWeightKg(log):0;
                document.getElementById('edit-log-body').value=log.bodyWeightKgAtLog||inferredBody||'';
                const machineInput=document.getElementById('edit-log-machinekg');if(machineInput)machineInput.value=Number(log.machineKg)>0?log.machineKg:'';
                updateEditModeUI();
            }else{
                document.getElementById('edit-log-duration').value=log.duration;
                document.getElementById('edit-cardio-body').value=log.bodyWeightKgAtLog||'';
                const treadmill=log.type==='treadmill';
                document.getElementById('edit-treadmill-fields').classList.toggle('hidden',!treadmill);
                document.getElementById('edit-machine-fields').classList.toggle('hidden',treadmill);
                if(treadmill){
                    document.getElementById('edit-log-speed').value=log.speed;
                    document.getElementById('edit-log-incline').value=log.incline??1;
                    document.getElementById('edit-log-movement').value=log.movement||'walking';
                }else{
                    document.getElementById('edit-log-machine').value=log.machine||'bike';
                    document.getElementById('edit-log-intensity').value=log.intensity||'moderate';
                    document.getElementById('edit-log-watts').value=log.watts??'';
                }
            }
            modal.classList.remove('hidden');document.getElementById('btn-cancel-edit-log').focus();
        }
        async function saveEditedLog() {
            const id=document.getElementById('edit-log-id').value;
            const index=state.logs.findIndex(l=>l.id===id);if(index<0)return;
            const original=state.logs[index],log={...original};
            const exercise=state.exercises.find(ex=>ex.id===document.getElementById('edit-log-exercise').value&&ex.type===log.type);
            if(!exercise)throw Error('اختر تمرينًا من نفس نوع التسجيل');
            Object.assign(log,{exerciseId:exercise.id,exerciseName:exercise.name,category:exercise.category});
            if(log.type==='weights'){
                log.loadMode=document.getElementById('edit-log-load-mode').value;
                log.setType=document.getElementById('edit-log-set-type').value;
                log.rir=readField('edit-log-rir','RIR',0,4,{optional:true,integer:true,legacyValue:original.rir==null?undefined:Number(original.rir)});
                if(log.rir!=null&&!Number.isInteger(log.rir))log.legacyFractionalRir=true;else delete log.legacyFractionalRir;
                if(log.loadMode==='timed'){
                    log.durationSeconds=readField('edit-log-seconds','المدة بالثواني',1,3600);
                    log.weight=0;log.displayWeight=0;log.reps=1;
                }else{
                    log.displayWeight=log.loadMode==='bodyweight'?0:readField('edit-log-weight','الوزن',0,log.unit==='lbs'?2204.62:1000);
                    log.weight=log.unit==='lbs'?log.displayWeight/2.20462:log.displayWeight;
                    log.reps=readField('edit-log-reps','العدات',1,150,{integer:true,legacyValue:Number(original.reps)});
                    // v11.5 B5: a hand-edited rep count replaces the per-side numbers
                    if(log.reps!==Number(original.reps)){delete log.repsLeft;delete log.repsRight;}
                    if(!Number.isInteger(log.reps))log.legacyFractionalReps=true;else delete log.legacyFractionalReps;
                    if(['bodyweight','added','assisted'].includes(log.loadMode))log.bodyWeightKgAtLog=readField('edit-log-body','وزن الجسم وقت الجولة',20,350);
                    if(log.loadMode==='external'&&document.getElementById('edit-log-machinekg')){const m=readField('edit-log-machinekg','وزن الجهاز',0,500,{optional:true});if(m>0)log.machineKg=m;else delete log.machineKg;}
                    delete log.durationSeconds;
                }
            }else{
                log.duration=readField('edit-log-duration','المدة بالدقائق',1,300);
                const historicalWeight=readField('edit-cardio-body','وزن الجسم وقت التسجيل',20,350,{optional:true});
                if(log.type==='treadmill'){
                    log.speed=readField('edit-log-speed','السرعة',1,25);
                    log.incline=readField('edit-log-incline','الميل',0,25);
                    log.movement=document.getElementById('edit-log-movement').value;
                }else{
                    log.machine=document.getElementById('edit-log-machine').value;
                    log.intensity=document.getElementById('edit-log-intensity').value;
                    log.watts=readField('edit-log-watts','الواط',0,2000,{optional:true});
                }
                const parameters=log.type==='treadmill'?['speed','incline','movement']:['machine','intensity','watts'];
                const changedParameters=parameters.some(key=>(log[key]??null)!==(original[key]??null));
                if(!historicalWeight&&changedParameters){const error=Error('أدخل وزن الجسم وقت التسجيل لإعادة حساب السعرات بعد تغيير تفاصيل الكارديو');error.fieldId='edit-cardio-body';throw error;}
                if(historicalWeight){log.bodyWeightKgAtLog=historicalWeight;log.calories=calculateCalories(log.type,log);}
                else {delete log.bodyWeightKgAtLog;log.calories=Math.round((original.calories||0)*log.duration/original.duration*10)/10;}
                const session=state.sessions.find(s=>s.id===log.sessionId&&s.status==='completed');
                if(session){
                    const cardioMinutes=state.logs.filter(l=>l.sessionId===session.id&&l.type!=='weights'&&l.id!==id).reduce((total,l)=>total+Number(l.duration||0),0)+log.duration;
                    if(cardioMinutes>(session.endedAt-session.startedAt)/60000){const error=Error('مجموع مدة الكارديو أكبر من مدة الجلسة المسجلة');error.fieldId='edit-log-duration';throw error;}
                }
            }
            Object.assign(log,GymData.validateLog(log),{editedAt:Date.now()});
            state.logs[index]=log;
            if(log.sessionId)await refreshCompletedSessionSummary(log.sessionId);
            await GymStorage.save(state);
            closeEditLog();onExerciseSelectChange();
            showToast('تم تعديل التسجيل وتحديث ملخص الجلسة بدون تكرار');
        }

        function renderTodayLogs() {
            const container = document.getElementById('today-logs-container');
            const loadMoreWrapper = document.getElementById('lazy-logs-load-more');
            const today = getLocalDateString();
            const selectedDate = document.getElementById('logs-date-filter').value || today;
            const todayLogs = state.logs.filter(l => l.date === selectedDate && !pendingDeletes.has(l.id)).sort((a,b) => (b.timestamp||0)-(a.timestamp||0));

            document.getElementById('today-sets-count').textContent = todayLogs.length===1?'جولة واحدة':`${todayLogs.length} جولات`;

            if (todayLogs.length === 0) {
                container.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs glass-card border border-slate-800">لا توجد جولات مسجلة في هذا التاريخ.</div>`;
                loadMoreWrapper.classList.add('hidden');
                renderRepeatButton(); renderSessionPlan(); renderWarmup(currentExercise(), currentSuggestion); renderProgramTarget();
                return;
            }

            if (currentTheme() === 'logbook') {
                loadMoreWrapper.classList.add('hidden');
                renderLogbook(container, todayLogs);
                renderRepeatButton(); renderSessionPlan(); renderWarmup(currentExercise(), currentSuggestion); renderProgramTarget();
                return;
            }
            const visibleLogs = todayLogs.slice(0, logsRenderLimit);
            loadMoreWrapper.classList.toggle('hidden', todayLogs.length <= logsRenderLimit);

            const fragment = document.createDocumentFragment();
            visibleLogs.forEach(log => {
                const item = document.createElement('div');
                item.className = 'glass-card p-3 flex justify-between items-center border border-slate-800 hover:border-slate-700 transition log-row';
                item.dataset.logId = log.id;
                
                let detailText = '';
                if (log.type === 'weights') {
                    const unitLabel = log.unit === 'lbs' ? 'باوند' : 'كجم';
                    const printWeight = log.displayWeight ?? getCanonicalWeightKg(log);
                    const loadLabel = log.loadMode === 'per_hand' ? ' لكل يد' : log.loadMode === 'assisted' ? ' مساعدة' : log.loadMode === 'added' ? ' إضافي' : '';
                    if (log.loadMode === 'timed') detailText = `<span class="font-bold text-cyan-300">${escapeHTML(String(log.durationSeconds || 0))} ثانية</span>`;
                    else detailText = `<span class="font-bold text-cyan-300">${log.loadMode==='bodyweight'?'وزن الجسم ('+escapeHTML(String(log.bodyWeightKgAtLog??log.effectiveLoadKg??'—'))+' كجم)':escapeHTML(String(printWeight))+' '+unitLabel+loadLabel}</span> × <span class="font-bold text-cyan-300">${escapeHTML(repsText(log))}</span> <span class="text-[10px] text-emerald-400 font-bold">[1RM: ${escapeHTML(get1RMLabel(getProgressWeightKg(log), log.reps))}]</span>`;
                } else {
                    detailText = `<span class="text-cyan-300 font-bold">${log.duration} دقيقة</span>`;
                }

                item.innerHTML = `
                    <div class="space-y-1">
                        <div class="font-bold text-xs text-slate-200">${escapeHTML(log.exerciseName)}</div>
                        <div class="text-xs text-slate-300">${detailText}</div>
                        ${log.type==='weights'?`<div class="log-metadata">${escapeHTML(logMetadata(log))}</div>`:`<div class="log-metadata">${escapeHTML(log.type==='treadmill'?`${log.movement==='running'?'جري':'مشي'} · ${log.speed} كم/س · ميل ${log.incline??1}%`:({light:'شدة خفيفة',moderate:'شدة متوسطة',vigorous:'شدة عالية'}[log.intensity]||'شدة غير محددة'))}</div>`}
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="text-right">
                            <div class="text-[10px] font-black text-amber-400">${log.type === 'weights' && ['v9-session','v10-session'].includes(log.calculationVersion) ? 'سعرات ضمن الجلسة' : `${escapeHTML(String(log.calories || 0))} تقديري`}</div>
                        </div>
                        <button data-action="edit-log" data-id="${escapeHTML(log.id)}" aria-label="تعديل التسجيل" class="text-slate-500 hover:text-cyan-400 p-1.5 transition"><i class="fa-solid fa-pen text-sm"></i></button>
                        <button aria-label="حذف التسجيل" data-action="delete-log" data-id="${escapeHTML(log.id)}" class="text-slate-500 hover:text-red-400 p-1.5 transition">
                            <i class="fa-solid fa-trash-can text-sm"></i>
                        </button>
                    </div>
                `;
                fragment.appendChild(item);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
            renderRepeatButton(); renderSessionPlan(); renderWarmup(currentExercise(), currentSuggestion); renderProgramTarget();
        }

        function startRestTimer(seconds, exName = '', extra = {}) {
            stopRestTimer();
            restDeadline = {endsAt: Date.now() + seconds * 1000, name: exName, ...extra};
            try { localStorage.setItem('gym_rest_deadline', JSON.stringify(restDeadline)); } catch { showToast('المؤقت يعمل؛ تعذر حفظه لإعادة فتح الصفحة'); }
            restoreRestTimer();
            tickClockBar();
        }
        let restDeadline = null;
        function restoreRestTimer() {
            clearInterval(restTimerInterval);
            if (!restDeadline) { try { restDeadline=JSON.parse(localStorage.getItem('gym_rest_deadline') || 'null'); } catch {} }
            if (!restDeadline || !Number.isFinite(restDeadline.endsAt)) return;
            const tick = () => {
                const remaining = Math.max(0, Math.ceil((restDeadline.endsAt-Date.now())/1000));
                if (!remaining) {
                    stopRestTimer();
                    if ('vibrate' in navigator) navigator.vibrate([150,100,150]);
                    haptic('long');
                    showToast('انتهى وقت الراحة! حان وقت الجولة التالية');
                    return false;
                }
                document.getElementById('rest-timer-widget').classList.remove('hidden');
                document.getElementById('timer-display').textContent = formatRest(remaining);
                document.getElementById('timer-preset-desc').textContent = restDeadline.name || 'جولة تمرين';
                return true;
            };
            if (tick()) restTimerInterval=setInterval(tick,1000);
        }
        function stopRestTimer() {
            clearInterval(restTimerInterval); restDeadline=null;
            try {localStorage.removeItem('gym_rest_deadline');} catch {}
            document.getElementById('rest-timer-widget').classList.add('hidden');
        }

        function runLocalClassification(cleanName) { return GymCalc.classifyExercise(cleanName); }

        function onCustomExerciseInput(val) {
            const cleanName = val.trim().toLowerCase();
            const statusEl = document.getElementById('new-ex-status');
            const submitBtn = document.getElementById('add-ex-submit-btn');
            const catSelect = document.getElementById('new-ex-cat');
            const equipSelect = document.getElementById('new-ex-equip');

            if (!cleanName) {
                statusEl.classList.add('hidden');
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                return;
            }

            const isDuplicate = state.exercises.some(ex => !ex.archived && ex.name.trim().toLowerCase() === cleanName);

            if (isDuplicate) {
                statusEl.className = "text-[11px] font-bold mt-1.5 px-2 py-1 rounded-lg border bg-red-950/80 border-red-800 text-red-300 flex items-center gap-1.5";
                statusEl.innerHTML = `<i class="fa-solid fa-circle-xmark text-red-400"></i> هذا التمرين مضاف مسبقاً في المكتبة!`;
                statusEl.classList.remove('hidden');
                
                submitBtn.disabled = true;
                submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
                return;
            } else {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }

            const result = runLocalClassification(cleanName);
            if (result.cat) catSelect.value = result.cat;
            if (result.equip) equipSelect.value = result.equip;

            if (result.cat || result.equip) {
                statusEl.className = "text-[11px] font-bold mt-1.5 px-2 py-1 rounded-lg border bg-cyan-950/80 border-cyan-800 text-cyan-300 flex items-center gap-1.5";
                statusEl.innerHTML = `<i class="fa-solid fa-bolt text-cyan-400"></i> تم تصنيف التمرين تلقائياً بنجاح`;
                statusEl.classList.remove('hidden');
            } else {
                statusEl.classList.add('hidden');
            }
        }

        async function addNewExercise() {
            const nameInput = document.getElementById('new-ex-name');
            const name = nameInput.value.trim();
            const category = document.getElementById('new-ex-cat').value;
            const equip = document.getElementById('new-ex-equip').value;
            const machine = document.getElementById('new-ex-machine').value;
            const type = (category === 'cardio' || equip === 'cardio') ? (machine === 'treadmill' ? 'treadmill' : 'bike_elliptical') : 'weights';
            if (state.exercises.some(e => !e.archived && e.name.trim().toLowerCase() === name.toLowerCase())) throw Error('التمرين موجود مسبقًا');

            if (!name) {
                showToast('يرجى إدخال اسم التمرين أولاً');
                return;
            }

            const newEx = {
                id: uniqueId('ex'),
                name,
                category,
                type,
                equip,
                machine,
                isCustom: true
            };

            state.exercises.push(newEx);
            await dbSaveAll('exercises', state.exercises);

            nameInput.value = '';
            document.getElementById('new-ex-status').classList.add('hidden');
            renderManageExercisesList();
            renderExerciseDropdown();
            if (addFromWorkout) {
                // جاي من صفحة التمرين: نرجعه ونختار التمرين الجديد له على طول
                switchTab('workout');
                const dd = document.getElementById('exercise-dropdown');
                if (dd && [...dd.options].some(o => o.value === newEx.id)) { dd.value = newEx.id; onExerciseSelectChange(); }
                showToast(`انضاف «${name}» واخترناه لك`);
            } else showToast('تمت إضافة التمرين المخصص بنجاح!');
        }

        function deleteExercise(exId) {
            showModal({
                title: 'حذف تمرين مخصص',
                message: 'هل أنت متاكد من حذف هذا التمرين المخصص؟ لن يتم حذف الجولات القديمة المسجلة به.',
                confirmText: 'تأكيد الحذف',
                cancelText: 'إلغاء',
                onConfirm: async () => {
                    Object.assign(state.exercises.find(e => e.id === exId), {archived:true,editedAt:Date.now()});
                    await dbSaveAll('exercises', state.exercises);
                    renderManageExercisesList();
                    renderExerciseDropdown();
                    showToast('تم حذف التمرين المخصص');
                }
            });
        }

        function renderManageExercisesList() {
            const container = document.getElementById('manage-exercises-list');
            const countEl = document.getElementById('custom-ex-count');
            if (!container || !countEl) return;

            const customExercises = state.exercises.filter(e => e.isCustom === true && !e.archived);
            countEl.textContent = `${customExercises.length} تمارِينَ`;

            if (customExercises.length === 0) {
                container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs glass-card border border-slate-800">لم تقم بإضافة أي تمارين مخصصة بعد. قم بإضافة تمارينك الخاصة أعلاه!</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            customExercises.forEach(ex => {
                const item = document.createElement('div');
                item.className = 'glass-card p-3 flex justify-between items-center border border-slate-800 hover:border-slate-700 transition';
                item.innerHTML = `
                    <div>
                        <div class="font-bold text-xs text-slate-200">${escapeHTML(ex.name)}</div>
                        <div class="text-[10px] text-slate-400 mt-0.5">الفئة: ${escapeHTML(CATEGORY_NAMES[ex.category] || '')} | الأداة: ${escapeHTML(EQUIP_NAMES[ex.equip] || 'مخصص')}</div>
                    </div>
                    <button data-action="delete-custom-ex" data-id="${escapeHTML(ex.id)}" aria-label="حذف هذا التمرين المخصص" class="text-slate-500 hover:text-red-400 p-1.5 transition">
                        <i class="fa-solid fa-trash-can text-sm"></i>
                    </button>
                `;
                fragment.appendChild(item);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        }

        function initProgressScreen() {
            const select = document.getElementById('chart-exercise-select');
            const loggedExIds = new Set(state.logs.filter(l => l.type === 'weights').map(l => l.exerciseId));
            const weightExercisesWithLogs = state.exercises.filter(e => e.type === 'weights' && loggedExIds.has(e.id));

            select.innerHTML = '';
            if (weightExercisesWithLogs.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'لا توجد تمارين بها سجلات بعد';
                select.appendChild(opt);
                renderExerciseProgressionHistory('');
            } else {
                weightExercisesWithLogs.forEach(ex => {
                    const opt = document.createElement('option');
                    opt.value = ex.id;
                    opt.textContent = ex.name;
                    select.appendChild(opt);
                });
                renderExerciseProgressionHistory(weightExercisesWithLogs[0].id);
            }

            resetProgressLoadMode();
            updateGlobalStats();
            renderExerciseVolumeBreakdown();
            updateProgressChart();
            renderRecords(); renderCalendar(); renderMuscles(); renderSessions();
        }

        function updateGlobalStats() {
            const uniqueDates = new Set(state.logs.map(l => l.date));
            document.getElementById('stat-total-days').textContent = `${uniqueDates.size} يوم`;
            const activeWeightExCount = new Set(state.logs.filter(l => l.type === 'weights').map(l => l.exerciseId)).size;
            document.getElementById('stat-active-exercises-count').textContent = `${activeWeightExCount} تمرين`;
        }

        function renderExerciseVolumeBreakdown() {
            const container = document.getElementById('exercise-volume-breakdown-list');
            if (!container) return;
            const volumeMap = Object.create(null);

            state.logs.forEach(l => {
                if (l.type === 'weights') {
                    const exName = l.exerciseName || 'تمرين';
                    const volKg = l.loadMode === 'timed' ? 0 : getVolumeLoadKg(l) * (Number(l.reps) || 1);
                    if (!volumeMap[exName]) volumeMap[exName] = { total: 0, working: 0 };
                    volumeMap[exName].total += volKg;
                    if (l.setType !== 'warmup') volumeMap[exName].working += volKg;
                }
            });

            const sortedExercises = Object.keys(volumeMap).sort((a, b) => volumeMap[b].working - volumeMap[a].working);
            if (sortedExercises.length === 0) {
                container.innerHTML = `<div class="text-[11px] text-slate-500 py-3 text-center">لا توجد سجلات أوزان لحساب الحجم حتى الآن</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            sortedExercises.forEach(name => {
                const totalKg = volumeMap[name].total;
                const workingKg = volumeMap[name].working;
                const totalTons = (totalKg / 1000).toFixed(2);
                const workingTons = (workingKg / 1000).toFixed(2);
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center text-xs py-2 px-3 bg-slate-900/80 rounded-xl border border-slate-800';
                item.innerHTML = `
                    <span class="font-bold text-slate-200">${escapeHTML(name)}</span>
                    <span class="text-left"><strong class="block text-cyan-300">فعلي: ${escapeHTML(workingTons)} طن</strong><small class="text-slate-500">الإجمالي مع التسخين: ${escapeHTML(totalTons)} طن</small></span>
                `;
                fragment.appendChild(item);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        }

        function resetProgressLoadMode() {
            const id=document.getElementById('chart-exercise-select').value;
            const recent=state.logs.filter(l=>l.exerciseId===id).sort((a,b)=>(b.timestamp||Date.parse(b.date))-(a.timestamp||Date.parse(a.date)))[0];
            document.getElementById('progress-load-mode').value=recent?.loadMode||'external';
        }
        function progressionGroups(exerciseId) {
            const logs=state.logs.filter(l=>l.exerciseId===exerciseId && l.type==='weights' && l.setType!=='warmup');
            const newest=logs.slice().sort((a,b)=>(b.timestamp||Date.parse(b.date))-(a.timestamp||Date.parse(a.date)))[0];
            const mode=document.getElementById('progress-load-mode').value || newest?.loadMode || 'external';
            return {mode,groups:GymCalc.progressionGroups(state.logs,exerciseId,mode)};
        }
        function renderExerciseProgressionHistory(selectedExId) {
            const container=document.getElementById('exercise-progression-history-list');
            const badge=document.getElementById('progression-history-badge');
            if(!selectedExId){container.textContent='لا توجد جولات عمل مسجلة';return;}
            const {mode,groups}=progressionGroups(selectedExId);
            const unit=mode==='timed'?'ثانية':mode==='per_hand'?'كجم لكل يد':'كجم';
            badge.textContent=state.exercises.find(e=>e.id===selectedExId)?.name || 'تطور الأداء';
            const ex=state.exercises.find(e=>e.id===selectedExId);
            const maxW=Math.max(0,...groups.map(g=>g.weight));
            const barKg=ex&&ex.barKg!==undefined&&ex.barKg!==''?Number(ex.barKg):20;
            const plateColored=ex?.equip==='barbell'&&mode==='external';
            container.innerHTML=groups.map((row,i)=>{
                const prev=groups[i-1];let delta='البداية';
                if(prev){const d=Math.round((row.weight-prev.weight)*10)/10;const r=row.reps-prev.reps;delta=`${d>0?'+':''}${d} ${unit}`+(mode==='timed'?'':` | ${r>0?'+':''}${r} عدات`);}
                const plate=plateColored&&window.GymVisual?GymVisual.heaviestPlateColor(row.weight,barKg):null;
                const pct=maxW>0?Math.max(2,Math.round(row.weight/maxW*1000)/10):0;
                const record=maxW>0&&row.weight===maxW;
                return `<div class="glass-card p-3 text-xs progress-row${record?' is-record':''}"><div class="text-slate-400">${escapeHTML(friendlyDate(row.date))}</div><strong>${Number(row.weight.toFixed(1))} ${unit}${mode==='timed'?'':` × ${row.reps} عدات`}</strong><div class="pbar" data-added aria-hidden="true"><i style="width:${pct}%;--plate:${plate?plate.color:'#8C8A84'}"></i></div><div class="text-cyan-300">${escapeHTML(delta)}</div>${mode==='timed'?'':`<small>أعلى 1RM تقديري: ${row.oneRm??'غير متاح'} | RIR: ${row.rir??'غير محدد'}</small>`}</div>`;
            }).reverse().join('') || 'لا توجد جولات عمل بهذه الطريقة';
            renderProgressHero(groups,mode,unit,plateColored,barKg);
        }
        function renderProgressHero(groups,mode,unit,plateColored,barKg) {
            const set=(id,text)=>{const e=document.getElementById(id);if(e)e.textContent=text;};
            if(!groups.length){set('hero-1rm','—');set('hero-1rm-sub','');set('hero-top','—');set('hero-top-sub','');return;}
            const top=groups.reduce((a,b)=>b.weight>a.weight||(b.weight===a.weight&&b.reps>a.reps)?b:a);
            const fmt=n=>String(Math.round(n*10)/10);
            set('hero-top',fmt(top.weight));
            set('hero-top-sub',mode==='timed'?'ثانية':`${unit} × ${top.reps} · ${friendlyDate(top.date)}`);
            const sub=document.getElementById('hero-top-sub');
            const plate=plateColored&&window.GymVisual?GymVisual.heaviestPlateColor(top.weight,barKg):null;
            if(sub&&plate){const chip=document.createElement('span');chip.className='plate-chip';chip.style.background=plate.color;chip.textContent=fmt(plate.kg);chip.title='أكبر قرص';sub.prepend(chip);}
            const withRm=groups.filter(g=>Number.isFinite(g.oneRm));
            if(mode==='timed'||!withRm.length){set('hero-1rm','—');set('hero-1rm-sub',mode==='timed'?'ما ينطبق على التمرين الزمني':'يظهر حتى 15 عدة');return;}
            const best=withRm.reduce((a,b)=>b.oneRm>a.oneRm?b:a);
            set('hero-1rm',fmt(best.oneRm));set('hero-1rm-sub',`${unit} · ${friendlyDate(best.date)}`);
        }
        function updateProgressChart() {
            const selectedExId=document.getElementById('chart-exercise-select').value;
            renderExerciseProgressionHistory(selectedExId);
            const {mode,groups}=progressionGroups(selectedExId);
            document.getElementById('chart-mode-1rm').disabled=mode==='timed';
            const points=groups.map(g=>({label:g.date,value:mode==='timed'?g.weight:chartMetricMode==='1rm'?g.oneRm:g.weight})).filter(p=>Number.isFinite(p.value));
            const target=document.getElementById('progressChart');
            const unit=mode==='timed'?'ثانية':mode==='per_hand'?'كجم لكل يد':'كجم';
            const label=mode==='timed'?'أطول مدة':chartMetricMode==='1rm'?'أعلى 1RM تقديري':'أعلى حمل مسجل';
            renderLedColumns(points, unit);
            if(!points.length){target.textContent='لا توجد بيانات مناسبة للرسم';return;}
            const max=Math.max(1,...points.map(p=>p.value))*1.15;
            const width=600,height=260,left=55,right=25,top=25,bottom=55;
            const x=i=>left+(width-left-right)*(points.length===1?0.5:i/(points.length-1));
            const y=v=>height-bottom-(height-top-bottom)*v/max;
            const svgNS='http://www.w3.org/2000/svg';
            const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',label+' '+unit);svg.style.width='100%';svg.style.height='100%';
            function el(name,attrs,text){const e=document.createElementNS(svgNS,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.appendChild(e);return e;}
            el('title',{},label+' ('+unit+')');
            for(let i=0;i<=4;i++){const v=max*i/4;el('line',{x1:left,x2:width-right,y1:y(v),y2:y(v),stroke:'#334155'});el('text',{x:left-8,y:y(v)+4,fill:'#94a3b8','font-size':12,'text-anchor':'end'},Math.round(v));}
            el('polyline',{points:points.map((p,i)=>`${x(i)},${y(p.value)}`).join(' '),fill:'none',stroke:'#00f2fe','stroke-width':3});
            points.forEach((p,i)=>{const dot=el('circle',{cx:x(i),cy:y(p.value),r:4,fill:'#fff'});const title=document.createElementNS(svgNS,'title');title.textContent=`${p.label}: ${p.value.toFixed(1)} ${unit}`;dot.appendChild(title);if(i===0||i===points.length-1||i%Math.ceil(points.length/4)===0)el('text',{x:x(i),y:height-25,fill:'#94a3b8','font-size':11,'text-anchor':'middle'},p.label);});
            target.replaceChildren(svg);
        }

        function setChartMetricMode(mode) {
            chartMetricMode = mode;
            const actualBtn = document.getElementById('chart-mode-actual');
            const oneRmBtn = document.getElementById('chart-mode-1rm');

            if (mode === 'actual') {
                actualBtn.className = "px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cyan-500 text-white transition-all shadow-md";
                oneRmBtn.className = "px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-all";
            } else {
                oneRmBtn.className = "px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500 text-white transition-all shadow-md";
                actualBtn.className = "px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-200 transition-all";
            }

            updateProgressChart();
        }

        function createBentoCard(title, value, statusText, statusClass, valueColorClass, description) {
            return `
                <div class="glass-card p-4 space-y-2 relative overflow-hidden flex flex-col justify-between shadow-md">
                    <div>
                        <div class="text-[11px] text-slate-400 font-semibold mb-1">${escapeHTML(title)}</div>
                        <div class="text-2xl font-black ${escapeHTML(valueColorClass)}">${escapeHTML(value)}</div>
                    </div>
                    <div class="space-y-1">
                        <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${escapeHTML(statusClass)}">${escapeHTML(statusText)}</span>
                        <p class="text-[10px] text-slate-400 pt-1 border-t border-slate-800">${description}</p>
                    </div>
                </div>
            `;
        }

        function renderBentoGridAnalysis() {
            renderRecovery(); renderStrength(); renderMonthReport(); renderRamadan();
            const calContainer = document.getElementById('bento-calories-container');
            const healthContainer = document.getElementById('bento-health-container');
            const compContainer = document.getElementById('bento-comp-container');

            if (!calContainer) return;
            calContainer.innerHTML = ''; healthContainer.innerHTML = ''; compContainer.innerHTML = '';

            const m = GymCalc.bodyMetrics(state.profile);
            if (!m) {
                calContainer.innerHTML = `<div class="col-span-3 glass-card p-4 text-center text-xs text-slate-400">يرجى الانتقال لصفحة "البروفايل" وإدخال الطول والوزن لظهور التحليل الذكي</div>`;
                return;
            }
            const { tdee, cutLow, cutHigh, bulkLow, bulkHigh, bmi } = m;
            calContainer.innerHTML += createBentoCard('تثبيت الوزن (Maintenance)', tdee.toLocaleString() + '', 'هدف التوازن', 'bg-cyan-950 text-cyan-300 border-cyan-800', 'text-cyan-300', 'تقدير يومي للمحافظة على الوزن، ويُراجع حسب تغير وزنك الفعلي.');
            calContainer.innerHTML += createBentoCard('نقصان الوزن (Fat Loss)', `${cutHigh.toLocaleString()}–${cutLow.toLocaleString()}`, 'عجز 10–20%', 'bg-emerald-950 text-emerald-300 border-emerald-800', 'text-emerald-300', 'نطاق مبدئي للتنشيف يُعدّل حسب تغير الوزن والأداء، دون ضمان تلقائي لمنع فقدان العضلات.');
            calContainer.innerHTML += createBentoCard('زيادة نظيفة (Lean Bulk)', `${bulkLow.toLocaleString()}–${bulkHigh.toLocaleString()}`, 'فائض 5–10%', 'bg-amber-950 text-amber-300 border-amber-800', 'text-amber-300', 'فائض محافظ كبداية، ثم يُعدّل حسب معدل زيادة الوزن.');

            const bmiStatus = { under: 'أقل من النطاق الطبيعي', normal: 'ضمن النطاق الطبيعي', over: 'أعلى من النطاق الطبيعي', high: 'مرتفع حسب BMI' }[m.bmiBand];
            healthContainer.innerHTML += createBentoCard('مؤشر الكتلة (BMI)', bmi, bmiStatus, 'bg-emerald-950 text-emerald-300 border-emerald-800', 'text-cyan-300', 'أداة فرز عامة لا تميز بين العضلات والدهون، وقد تضلل لدى لاعبي الحديد.');

            if (m.whtr) {
                const whtr = m.whtr;
                const whtrStatus = { low: 'أقل من 0.5', watch: 'يستحق المتابعة', high: 'مرتفع كأداة فرز' }[m.whtrBand];
                healthContainer.innerHTML += createBentoCard('نسبة الخصر للطول (WHtR)', whtr, whtrStatus, 'bg-blue-950 text-blue-300 border-blue-800', 'text-blue-300', 'مؤشر بسيط مرتبط بالسمنة المركزية، وليس قياسًا مباشرًا للدهون الحشوية.');
            }

            if (m.fat) {
                const fat = m.fat, ffmi = m.ffmi;
                compContainer.innerHTML += createBentoCard('نسبة الدهون %', fat + '%', 'شحوم الجسم', 'bg-rose-950 text-rose-300 border-rose-800', 'text-rose-300', 'نسبة الدهون الكلية.');
                compContainer.innerHTML += createBentoCard('مؤشر الكتلة الخالية من الدهون (FFMI)', ffmi, 'Fat-Free Mass Index', 'bg-purple-950 text-purple-300 border-purple-800', 'text-indigo-400', 'يشمل الكتلة الخالية من الدهون كلها، وليس العضلات وحدها.');
            }

            if (m.muscle) {
                compContainer.innerHTML += createBentoCard('العضلات %', m.muscle + '%', 'أنسجة عضلية', 'bg-teal-950 text-teal-300 border-teal-800', 'text-teal-400', 'نسبة الأنسجة العضلية.');
            }
            if (m.water) {
                compContainer.innerHTML += createBentoCard('السوائل %', m.water + '%', 'ترطيب الخلايا', 'bg-sky-950 text-sky-300 border-sky-800', 'text-sky-300', 'نسبة السوائل الترطيبية.');
            }
        }

        async function toggleGender() {
            state.profile.isMan = !(state.profile.isMan !== false);
            if (!state.profile.id) state.profile.id = 'user_profile';
            await dbSaveAll('profile', [state.profile]);
            updateGenderUI();
            renderBentoGridAnalysis();
            updateTopHeaderStats();
            showToast(state.profile.isMan ? 'تم اختيار وضع الرجل' : 'تم اختيار وضع الأنثى');
        }

        function updateGenderUI() {
            const btn = document.getElementById('gender-toggle-btn');
            const icon = document.getElementById('gender-icon');
            const text = document.getElementById('gender-text');
            if (!btn || !icon || !text) return;

            if (state.profile.isMan !== false) {
                btn.classList.add('neon-glow-amber', 'border-amber-500/60');
                icon.textContent = '';
                text.textContent = 'مفعل: خيار الرجل';
                text.className = 'font-bold text-sm text-amber-300';
            } else {
                btn.classList.remove('neon-glow-amber', 'border-amber-500/60');
                icon.textContent = '';
                text.textContent = 'مفعل: خيار الأنثى';
                text.className = 'font-bold text-sm text-pink-300';
            }
        }

        async function saveProfile() {
            const next={...state.profile,id:'user_profile',updatedAt:Date.now(),name:document.getElementById('prof-name').value.trim()};
            for(const [key,label,min,max] of [['weight','الوزن',20,350],['height','الطول',50,250],['waist','محيط الخصر',30,250],['age','العمر',5,120],['fat','نسبة الدهون',1,70],['muscle','نسبة العضلات',1,80],['water','نسبة السوائل',1,90]]) {
                next[key]=readField('prof-'+key,label,min,max,{optional:true,integer:key==='age',legacyValue:key==='age'?Number(state.profile.age):undefined})??'';
            }
            next.activityFactor=readField('prof-activity','مستوى النشاط',1,3);
            const today=getLocalDateString();next.history=[...(state.profile.history||[])];
            if(next.weight){next.history=next.history.filter(h=>h.date!==today);next.history.push({date:today,weight:next.weight,waist:next.waist});}
            // Validate before replacing the live profile; preserve all historical entries.
            GymData.validate({profile:next});
            state.profile=next;await dbSaveAll();
            renderBentoGridAnalysis();renderProfileHistoryList();updateTopHeaderStats();renderBodyChart();
            showToast('تم حفظ القياسات والبروفايل بنجاح');
        }

        function renderProfileUI() {
            document.getElementById('prof-name').value = state.profile.name || '';
            document.getElementById('prof-weight').value = state.profile.weight || '';
            document.getElementById('prof-height').value = state.profile.height || '';
            document.getElementById('prof-waist').value = state.profile.waist || '';
            document.getElementById('prof-age').value = state.profile.age || '';
            document.getElementById('prof-fat').value = state.profile.fat || '';
            document.getElementById('prof-muscle').value = state.profile.muscle || '';
            document.getElementById('prof-water').value = state.profile.water || '';
            document.getElementById('prof-activity').value = String(state.profile.activityFactor || 1.375);

            updateGenderUI();
            renderBentoGridAnalysis();
            renderProfileHistoryList();
            renderSettings();
            renderBodyChart();
            renderThemePicker();
            renderLangPicker();
        }

        function renderProfileHistoryList() {
            const container = document.getElementById('profile-history-list');
            if (!container) return;
            const history = (state.profile.history || []).slice().reverse();

            if (history.length === 0) {
                container.innerHTML = `<div class="text-[11px] text-slate-500 py-2 text-center">لا توجد قياسات سابقة مسجلة</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            history.forEach(item => {
                const el = document.createElement('div');
                el.className = 'flex justify-between items-center text-xs py-1.5 px-2 bg-slate-900/60 rounded-lg border border-slate-800';
                el.innerHTML = `
                    <span class="text-slate-400 text-[10px]">${escapeHTML(friendlyDate(item.date))}</span>
                    <div class="space-x-3 space-x-reverse font-medium">
                        <span class="text-cyan-300">${escapeHTML(String(item.weight))} كجم</span>
                        ${item.waist ? `<span class="text-blue-300">خصر: ${escapeHTML(String(item.waist))} سم</span>` : ''}
                    </div>
                `;
                fragment.appendChild(el);
            });

            container.innerHTML = '';
            container.appendChild(fragment);
        }

        function buildBackup() {
            const logs=state.logs.map(log=>{
                const l={...log};if(l.type==='weights'){
                    if(!Number.isInteger(Number(l.reps)))l.legacyFractionalReps=true;
                    if(l.rir!=null&&!Number.isInteger(Number(l.rir)))l.legacyFractionalRir=true;
                }return l;
            });
            return JSON.parse(JSON.stringify({...state,logs,schemaVersion:DATA_SCHEMA_VERSION,exportDate:new Date().toISOString()}));
        }
        async function exportDataJSON() {
            const backup=buildBackup();
            let validationError=null;try{GymData.validate(backup);}catch(error){validationError=error;}
            downloadJSON(backup,`gym_tracker_backup_${getLocalDateString()}.json`);
            if(validationError)showModal({title:'تم تجهيز النسخة مع تنبيه',message:'احتفظ بالنسخة. يلزم تصحيح سجل قديم قبل إعادة استيرادها: '+validationError.message,confirmText:'فهمت',cancelText:'إغلاق'});
            else showToast('تم فحص النسخة الاحتياطية وتجهيزها للتنزيل');
        }

        async function downloadSafetyBackup() {
            const snapshot=await GymStorage.backup();
            if(!snapshot?.data)return showToast('لا توجد نسخة أمان سابقة على هذا الجهاز');
            downloadJSON(snapshot.data, 'gym_tracker_safety_'+getLocalDateString()+'.json');
        }
        function downloadJSON(data,filename) {
            const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
            const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
        }
        async function importDataJSON(event) {
            const file=event.target.files?.[0];if(!file)return;
            if(file.size>25*1024*1024){showToast('الملف كبير جدًا؛ الحد 25 ميجابايت');event.target.value='';return;}
            await importBackupText(await file.text());
            event.target.value='';
        }
        function parseBackupText(text) {
            try { return JSON.parse(text); }
            catch { throw Error('الملف مو نسخة احتياطية من التطبيق، أو تالف. اختر ملف .json صدّرته من Gym Tracker.'); }
        }
        async function importBackupText(text) {
            let ok=false;
            await runMutation(async()=>{
                const incoming=GymData.validate(parseBackupText(text));
                const candidate=GymData.merge(state,incoming);
                const oldState=state;state=candidate;
                try {
                    // Refresh only imported/changed session summaries; preserve other history.
                    const changed=new Set((incoming.logs||[]).map(l=>l.sessionId).filter(Boolean));
                    for(const session of incoming.sessions||[])changed.add(session.id);
                    for(const id of changed)await refreshCompletedSessionSummary(id);
                    await GymStorage.save(state);
                }catch(error){state=oldState;throw error;}
                restoreActiveSession();renderCategoryTabs();renderExerciseDropdown();renderProfileUI();updateSessionUI();
                showToast('تم دمج النسخة والتحقق منها وحفظها بنجاح');
                ok=true;
            });
            return ok;
        }

        function confirmClearTodayLogs() {
            showModal({
                title: 'مسح جولات اليوم',
                message: 'هل أنت متاكد من حذف جميع جولات وتسجيلات اليوم فقط؟',
                confirmText: 'مسح اليوم',
                cancelText: 'إلغاء',
                onConfirm: async () => {
                    const today = getLocalDateString();
                    const affected=new Set(state.logs.filter(l=>l.date===today).map(l=>l.sessionId));
                    state.logs = state.logs.filter(l => l.date !== today);
                    for (const session of state.sessions.filter(s => affected.has(s.id) && s.status === 'completed')) {
                        await refreshCompletedSessionSummary(session.id);
                    }
                    await GymStorage.save(state);
                    renderTodayLogs();
                    updateTopHeaderStats();
                    onExerciseSelectChange();
                    showToast('تم مسح جولات اليوم');
                }
            });
        }

        function confirmWipeAllData() {
            showModal({
                title: 'إعادة ضبط شاملة',
                message: 'تحذير: سيتم حذف جميع البيانات الشخصية والسجلات والمكتبة ونسخ الأمان المحلية نهائياً وإعادة التطبيق للوضع الافتراضي.',
                confirmText: 'مسح شامل لكل شيء',
                cancelText: 'إلغاء',
                onConfirm: async () => {
                    state = {
                        profile: { id: 'user_profile', name: '', weight: '', height: '', waist: '', age: '', fat: '', muscle: '', water: '', isMan: true, activityFactor: 1.375, history: [] },
                        exercises: [...DEFAULT_EXERCISES],
                        logs: [],
                        sessions: []
                    };
                    await GymStorage.save(state, {wipe:true});
                    try { await window.GymPhotos?.wipe(); } catch (e) { console.warn('photos wipe', e); }
                    stopRestTimer();
                    activeSessionId = null;
        
                    updateSessionUI();

                    renderCategoryTabs();
                    renderExerciseDropdown();
                    renderTodayLogs();
                    renderProfileUI();
                    updateTopHeaderStats();
                    showToast('تمت إعادة ضبط التطبيق بالكامل');
                }
            });
        }

        function updateTopHeaderStats() {
            const today = getLocalDateString();
            const todayLogs = state.logs.filter(l => l.date === today);
            const logCalories = todayLogs.reduce((sum, l) => {
                if (l.type === 'weights' && ['v9-session','v10-session'].includes(l.calculationVersion)) return sum;
                return sum + (parseFloat(l.calories) || 0);
            }, 0);
            const sessionCalories = state.sessions.filter(s => s.date === today && s.status === 'completed').reduce((sum, s) => sum + (parseFloat(s.estimatedCalories) || 0), 0);
            const totalCals = logCalories + sessionCalories;
            document.getElementById('header-today-cals').textContent = Math.round(totalCals * 10) / 10;
        }

        function showModal({ title, message, confirmText, cancelText, onConfirm, insights, share }) {
            const modal = document.getElementById('custom-modal');
            document.getElementById('modal-title').textContent = title;
            const insightBox = document.getElementById('modal-insights');
            if (insightBox) {
                insightBox.replaceChildren();
                for (const line of insights || []) { const p = document.createElement('p'); p.className = 'insight insight-' + line.kind; p.textContent = line.text; insightBox.appendChild(p); }
                insightBox.classList.toggle('hidden', !insightBox.children.length);
            }
            document.getElementById('modal-message').textContent = message;
            
            const confirmBtn = document.getElementById('modal-confirm-btn');
            const cancelBtn = document.getElementById('modal-cancel-btn');

            confirmBtn.textContent = confirmText || 'تأكيد';
            cancelBtn.textContent = cancelText || 'إلغاء';

            const previousFocus=document.activeElement;
            const close = () => {modal.classList.add('hidden');previousFocus?.focus();};
            confirmBtn.onclick = () => { close(); if (onConfirm) runMutation(onConfirm); };
            cancelBtn.onclick = close;
            const shareBtn = document.getElementById('modal-share-btn');
            if (shareBtn) {
                shareBtn.classList.toggle('hidden', !share);
                shareBtn.onclick = share ? async () => {
                    shareBtn.disabled = true;
                    try { await share(); } catch (e) { console.warn('share', e); showToast(e?.message && /[\u0600-\u06FF]/.test(e.message) ? e.message : 'تعذر تجهيز الصورة'); }
                    finally { shareBtn.disabled = false; }
                } : null;
            }
            modal.classList.remove('hidden');
            cancelBtn.focus();
        }

        // v11.7 (G8): one message at a time: a new one takes the old one's place instead of stacking.
        let toastTimer = null;
        function showToast(msg) {
            if (!msg) return;
            const container = document.getElementById('toast-container');
            clearTimeout(toastTimer);
            const toast = document.createElement('div');
            toast.className = 'glass p-3 rounded-xl border border-cyan-500/40 text-xs font-bold text-center text-cyan-200 shadow-2xl animate-fade-in pointer-events-auto';
            toast.textContent = String(msg);
            container.replaceChildren(toast);
            toastTimer = setTimeout(() => toast.remove(), 5000);
        }

        let addFromWorkout = false;
        function switchTab(tabId) {
            if (tabId !== 'exercises') addFromWorkout = false;
            document.querySelectorAll('.screen-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));

            const targetScreen = document.getElementById(`screen-${tabId}`);
            const targetNav = document.getElementById(`nav-${tabId}`);

            if (targetScreen) targetScreen.classList.remove('hidden');
            if (targetNav) targetNav.classList.add('active');

            if (tabId === 'progress') initProgressScreen();
            else if (tabId === 'exercises') renderManageExercisesList();
            else if (tabId === 'bento') renderBentoGridAnalysis();
            else if (tabId === 'profile') renderProfileUI();
        }

        function initEventListeners() {
            document.addEventListener('keydown', event => {
                const modal=document.querySelector('.modal-overlay:not(.hidden)');if(!modal)return;
                const buttons=[...modal.querySelectorAll('button,input:not([type=hidden]),select')].filter(e=>!e.disabled&&e.getClientRects().length);
                if(event.key==='Escape'){if(saving)return;event.preventDefault();if(modal.id==='edit-log-modal')closeEditLog();else if(modal.id==='finish-session-modal')closeFinishSession();else if(modal.id==='plan-modal')closePlan();else if(modal.id==='busy-modal')closeBusy();else document.getElementById('modal-cancel-btn').click();return;}
                if(event.key==='Tab'&&buttons.length){const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
            });
            document.getElementById('logs-date-filter').addEventListener('change', () => {logsRenderLimit=15;renderTodayLogs();});
            document.addEventListener('visibilitychange', () => {if (!document.hidden) {updateSessionUI();restoreRestTimer();}});
            document.addEventListener('input',event=>clearFieldError(event.target));
            document.addEventListener('change',event=>clearFieldError(event.target));
            document.body.addEventListener('click', function(e) {
                const stepperBtn = e.target.closest('[data-step-target]');
                if (stepperBtn) {
                    handleStepperClick(stepperBtn.dataset.stepTarget, parseFloat(stepperBtn.dataset.step) || 0);
                    haptic('tap');
                }
            });

            document.getElementById('floating-dock').addEventListener('click', function (e) {
                const btn = e.target.closest('[data-tab]');
                if (btn) switchTab(btn.dataset.tab);
            });

            document.getElementById('routine-presets-container').addEventListener('click', function(e) {
                const btn = e.target.closest('[data-routine]');
                if (btn) loadPresetRoutine(btn.dataset.routine);
            });

            document.getElementById('btn-reset-routine-filter').addEventListener('click', resetRoutineFilter);

            document.getElementById('category-tabs-container').addEventListener('click', function (e) {
                const btn = e.target.closest('.cat-btn');
                if (btn && btn.dataset.cat) setWorkoutCategoryFilter(btn.dataset.cat, btn);
            });

            document.getElementById('equip-filters-container').addEventListener('click', function (e) {
                const btn = e.target.closest('.equip-btn');
                if (btn && btn.dataset.equip) setEquipFilter(btn.dataset.equip, btn);
            });

            document.getElementById('rir-container').addEventListener('click', function (e) {
                const btn = e.target.closest('.rir-btn');
                if (btn) setRIR(btn.dataset.rir, btn);
            });

            document.getElementById('set-type-container').addEventListener('click', function (e) {
                const btn = e.target.closest('.set-type-btn');
                if (btn) setSetType(btn.dataset.settype, btn);
            });

            document.getElementById('exercise-search-input').addEventListener('input', renderExerciseDropdown);
            document.getElementById('exercise-dropdown').addEventListener('change', onExerciseSelectChange);
            document.getElementById('input-weight').addEventListener('input', () => { updateWeightConvertedDisplay(); update1RMLiveDisplay(); });
            document.getElementById('input-reps').addEventListener('input', (event) => {
                document.getElementById('val-reps-display').textContent = event.target.value || '0';
                update1RMLiveDisplay();
            });
            document.getElementById('load-mode-select').addEventListener('change', (event) => setLoadMode(event.target.value));
            document.getElementById('input-machine-kg')?.addEventListener('change', () => runMutation(saveMachineKg));
            document.getElementById('input-bar-kg')?.addEventListener('change', () => runMutation(saveBarKg));
            document.getElementById('rig-select')?.addEventListener('change', (event) => runMutation(() => saveExerciseSetting({ rig: event.target.value })));
            document.getElementById('btn-apply-machine-past')?.addEventListener('click', applyMachineToPast);
            for (const id of ['input-duration-sec','input-tm-speed','input-tm-incline','input-tm-duration','input-be-duration','input-cardio-watts','cardio-intensity-select']) document.getElementById(id)?.addEventListener(id.endsWith('select') ? 'change' : 'input', renderEquipVisual);

            document.getElementById('unit-btn-kg').addEventListener('click', () => setWeightUnit('kg'));
            document.getElementById('unit-btn-lbs').addEventListener('click', () => setWeightUnit('lbs'));

            document.getElementById('btn-save-weights').addEventListener('click', () => runMutation(saveSet));
            document.getElementById('btn-save-treadmill').addEventListener('click', () => runMutation(() => saveCardioSet('treadmill')));
            document.getElementById('btn-save-bike').addEventListener('click', () => runMutation(() => saveCardioSet('bike_elliptical')));
            document.getElementById('btn-copy-last-perf').addEventListener('click', () => runMutation(copyLastPerformance));
            document.getElementById('btn-stop-timer').addEventListener('click', stopRestTimer);
            document.getElementById('btn-rest-minus')?.addEventListener('click', () => adjustRest(-15));
            document.getElementById('btn-rest-plus')?.addEventListener('click', () => adjustRest(15));
            document.getElementById('btn-repeat-set')?.addEventListener('click', () => runMutation(repeatLastSet));
            document.getElementById('btn-apply-suggestion')?.addEventListener('click', applySuggestion);
            document.getElementById('btn-plan-session')?.addEventListener('click', openPlan);
            document.getElementById('ex-note-show')?.addEventListener('click', openExNoteEdit);
            document.getElementById('ex-note-save')?.addEventListener('click', () => runMutation(saveExNote));
            document.getElementById('ex-note-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runMutation(saveExNote); } else if (e.key === 'Escape') { e.preventDefault(); renderExNote(); document.getElementById('ex-note-show').focus(); } });
            document.getElementById('rest-timer-duration')?.addEventListener('change', () => runMutation(saveExerciseRest));
            document.getElementById('feel-container')?.addEventListener('click', e => { const b = e.target.closest('.feel-btn'); if (b) setFeel(b.dataset.feelRir); });
            document.getElementById('btn-busy')?.addEventListener('click', openBusy);
            document.getElementById('btn-busy-cancel')?.addEventListener('click', closeBusy);
            document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
            document.getElementById('btn-deload')?.addEventListener('click', fillDeload);
            document.getElementById('month-select')?.addEventListener('change', renderMonthReport);
            document.getElementById('btn-sides')?.addEventListener('click', () => runMutation(toggleSides));
            document.getElementById('plan-program')?.addEventListener('change', () => runMutation(chooseProgram));
            document.getElementById('font-picker')?.addEventListener('click', e => { const b = e.target.closest('[data-font-pick]'); if (b) runMutation(() => saveFont(b.dataset.fontPick)); });
            document.getElementById('plan-days')?.addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) runMutation(() => chooseProgramDay(Number(b.dataset.day))); });
            document.getElementById('set-ramadan')?.addEventListener('change', e => runMutation(() => saveRamadan(e.target.checked)));
            document.getElementById('ramadan-iftar')?.addEventListener('change', () => runMutation(saveIftar));
            document.getElementById('plan-time')?.addEventListener('change', applyPlanTime);
            document.addEventListener('gym:repeat-set', e => runMutation(() => repeatFromNotification(e.detail)));
            document.addEventListener('gym:toast', e => showToast(String(e.detail || '')));
            window.__gymConfirm = showModal;
            document.getElementById('btn-plan-cancel')?.addEventListener('click', closePlan);
            document.getElementById('btn-plan-confirm')?.addEventListener('click', () => runMutation(confirmPlan));
            document.getElementById('plan-search')?.addEventListener('input', renderPlanList);
            document.getElementById('plan-list')?.addEventListener('change', e => { const b = e.target.closest('input[type=checkbox]'); if (!b) return; if (b.checked) planDraft.add(b.value); else planDraft.delete(b.value); document.getElementById('plan-count').textContent = planDraft.size === 1 ? 'تمرين واحد' : `${planDraft.size} تمارين`; renderPlanTime(); });
            initSwipe();
            document.getElementById('theme-picker')?.addEventListener('click', e => { const b = e.target.closest('[data-theme-pick]'); if (b) runMutation(() => saveTheme(b.dataset.themePick)); });
            document.getElementById('lang-picker')?.addEventListener('click', e => { const b = e.target.closest('[data-lang-pick]'); if (b) runMutation(() => saveLang(b.dataset.langPick)); });
            document.getElementById('cb-minus')?.addEventListener('click', () => { adjustRest(-15); tickClockBar(); });
            document.getElementById('cb-plus')?.addEventListener('click', () => { adjustRest(15); tickClockBar(); });
            document.getElementById('cb-stop')?.addEventListener('click', () => { stopRestTimer(); tickClockBar(); });
            document.getElementById('btn-undo')?.addEventListener('click', undoDelete);
            document.addEventListener('visibilitychange', () => { if (document.hidden) flushPendingDeletes(); });
            window.addEventListener('pagehide', flushPendingDeletes);
            document.getElementById('progress-jump')?.addEventListener('click', e => { const b = e.target.closest('[data-jump]'); if (b) document.getElementById(b.dataset.jump)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
            document.getElementById('records-list')?.addEventListener('click', e => { const b = e.target.closest('.record-row'); if (b) openRecord(b.dataset.ex, b.dataset.mode); });
            document.getElementById('cal-prev')?.addEventListener('click', () => { calOffset--; renderCalendar(); });
            document.getElementById('cal-next')?.addEventListener('click', () => { if (calOffset < 0) { calOffset++; renderCalendar(); } });
            document.getElementById('cal-grid')?.addEventListener('click', e => { const b = e.target.closest('.cal-day.on'); if (b) openDay(b.dataset.date); });
            document.getElementById('btn-more-sessions')?.addEventListener('click', () => { sessionsLimit += 10; renderSessions(); });
            document.getElementById('set-keep-awake')?.addEventListener('change', e => runMutation(() => saveSetting('keepAwake', e.target.checked)));
            document.getElementById('set-haptics')?.addEventListener('change', e => runMutation(() => saveSetting('haptics', e.target.checked)));
            document.getElementById('set-feel')?.addEventListener('change', e => runMutation(() => saveSetting('effortMode', e.target.checked ? 'feel' : 'rir')));
            document.querySelectorAll('.rir-btn,.set-type-btn').forEach(b => b.addEventListener('click', () => haptic('tap')));
            document.getElementById('btn-start-session').addEventListener('click', () => runMutation(() => startWorkoutSession()));
            document.getElementById('btn-copy-session').addEventListener('click', () => runMutation(copyPreviousSession));
            document.getElementById('btn-finish-session').addEventListener('click',openFinishSession);
            document.getElementById('btn-confirm-finish')?.addEventListener('click',()=>runMutation(finishWorkoutSession));
            document.getElementById('btn-cancel-finish')?.addEventListener('click',closeFinishSession);
            document.getElementById('btn-cancel-edit-log').addEventListener('click',closeEditLog);
            document.getElementById('edit-log-load-mode')?.addEventListener('change',updateEditModeUI);
            document.getElementById('btn-confirm-edit-log').addEventListener('click', () => runMutation(saveEditedLog));

            document.getElementById('btn-load-more-logs').addEventListener('click', function() {
                logsRenderLimit += 15;
                renderTodayLogs();
            });

            document.getElementById('today-logs-container').addEventListener('click', function (e) {
                const deleteBtn = e.target.closest('[data-action="delete-log"]');
                if (deleteBtn && deleteBtn.dataset.id) deleteLogItem(deleteBtn.dataset.id);
                const editBtn = e.target.closest('[data-action="edit-log"]');
                if (editBtn && editBtn.dataset.id) openEditLog(editBtn.dataset.id);
            });

            document.getElementById('new-ex-name').addEventListener('input', function() { onCustomExerciseInput(this.value); });
            document.getElementById('add-ex-submit-btn').addEventListener('click', () => runMutation(addNewExercise));
            document.getElementById('manage-exercises-list').addEventListener('click', function(e) {
                const deleteBtn = e.target.closest('[data-action="delete-custom-ex"]');
                if (deleteBtn && deleteBtn.dataset.id) deleteExercise(deleteBtn.dataset.id);
            });

            document.getElementById('chart-exercise-select').addEventListener('change', () => {resetProgressLoadMode();updateProgressChart();});
            document.getElementById('progress-load-mode').addEventListener('change', updateProgressChart);
            document.getElementById('chart-mode-actual').addEventListener('click', () => setChartMetricMode('actual'));
            document.getElementById('chart-mode-1rm').addEventListener('click', () => setChartMetricMode('1rm'));

            document.getElementById('gender-toggle-btn').addEventListener('click', () => runMutation(toggleGender));
            document.getElementById('btn-save-profile').addEventListener('click', () => runMutation(saveProfile));
            document.getElementById('btn-save-body').addEventListener('click', () => runMutation(saveProfile));
            document.getElementById('btn-new-exercise').addEventListener('click', () => { addFromWorkout = true; switchTab('exercises'); const n = document.getElementById('new-ex-name'); if (n) n.focus(); });
            document.getElementById('exercises-back').addEventListener('click', () => switchTab('workout'));
            document.getElementById('btn-export-json').addEventListener('click', exportDataJSON);
            document.getElementById('btn-download-safety-backup').addEventListener('click', downloadSafetyBackup);
            document.getElementById('import-file-input').addEventListener('change', importDataJSON);
            document.getElementById('btn-clear-today-logs').addEventListener('click', confirmClearTodayLogs);
            document.getElementById('btn-wipe-all-data').addEventListener('click', confirmWipeAllData);

            document.getElementById('split-btn-ppl').addEventListener('click', () => setSplitSystem('ppl'));
            document.getElementById('split-btn-ul').addEventListener('click', () => setSplitSystem('upper_lower'));
        }

        function registerServiceWorker() {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js')
                    .then((reg) => reg.update())
                    .catch((err) => console.warn('SW Failed:', err));
            }
        }


        /* ---------- v10.7: أثناء التمرين ---------- */
        const nativeHooks = () => window.GymNativeHooks || {};
        function haptic(kind = 'tap') {
            if (state.profile.haptics === false) return;
            try { const p = nativeHooks().haptic?.(kind); p?.catch?.(() => {}); } catch {}
        }
        let wakeLockSentinel = null;
        async function applyKeepAwake() {
            const wanted = state.profile.keepAwake !== false && !!getActiveSession();
            const hook = nativeHooks().keepAwake;
            if (hook) { try { await hook(wanted); } catch {} return; }
            try {
                if (wanted && !document.hidden && 'wakeLock' in navigator && !wakeLockSentinel) {
                    wakeLockSentinel = await navigator.wakeLock.request('screen');
                    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
                } else if (!wanted && wakeLockSentinel) { await wakeLockSentinel.release(); wakeLockSentinel = null; }
            } catch {}
        }
        function renderSettings() {
            const awake = document.getElementById('set-keep-awake'), buzz = document.getElementById('set-haptics');
            if (awake) awake.checked = state.profile.keepAwake !== false;
            if (buzz) buzz.checked = state.profile.haptics !== false;
            const feel = document.getElementById('set-feel');
            if (feel) feel.checked = state.profile.effortMode === 'feel';
            renderFeel();
            renderRamadan();
            renderFont();
        }
        // v11.7 (G10): حجم الخط
        function renderFont() {
            const f = ['large', 'xlarge'].includes(state.profile.fontScale) ? state.profile.fontScale : 'normal';
            if (f === 'normal') delete document.documentElement.dataset.font; else document.documentElement.dataset.font = f;
            try { localStorage.setItem('gym_font', f); } catch {}
            document.querySelectorAll('[data-font-pick]').forEach(b => { const on = b.dataset.fontPick === f; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
        }
        async function saveFont(f) {
            state.profile = { ...state.profile, fontScale: f };
            await GymStorage.save(state);
            renderFont();
            showToast(f === 'normal' ? 'رجع الخط لحجمه العادي' : f === 'large' ? 'كبّرت الخط' : 'كبّرت الخط أكثر');
        }
        async function saveSetting(key, value) {
            state.profile = { ...state.profile, [key]: value };
            await GymStorage.save(state);
            renderSettings();
            if (key === 'keepAwake') await applyKeepAwake();
            if (key === 'haptics' && value) haptic('confirm');
            showToast(key === 'keepAwake' ? (value ? 'الشاشة بتبقى شغالة أثناء الجلسة' : 'الشاشة تنطفي عادي')
                : key === 'effortMode' ? (value === 'feel' ? 'صرت تقيّم الجولة بسهل / مناسب / صعب' : 'رجعت أرقام RIR')
                : (value ? 'الاهتزاز شغال' : 'الاهتزاز مطفي'));
        }

        // مؤقت الراحة: ±15 ثانية
        function formatRest(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
        function adjustRest(delta) {
            if (!restDeadline) return;
            restDeadline.endsAt += delta * 1000;
            if (restDeadline.endsAt - Date.now() < 1000) { stopRestTimer(); showToast('انتهت الراحة'); haptic('long'); return; }
            try { localStorage.setItem('gym_rest_deadline', JSON.stringify(restDeadline)); } catch {}
            haptic('tap');
            restoreRestTimer();
        }

        // كرر الجولة
        function lastSetForRepeat(exerciseId) {
            const today = getLocalDateString();
            return state.logs.filter(l => l.exerciseId === exerciseId && l.type === 'weights' && (activeSessionId ? l.sessionId === activeSessionId : l.date === today))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0] || null;
        }
        function repsText(log) { return log.repsLeft != null && log.repsRight != null ? `يمين ${log.repsRight} · يسار ${log.repsLeft}` : `${log.reps} عدات`; }
        function setLabel(log) {
            if (log.loadMode === 'timed') return `${Number(log.durationSeconds) || 0} ثانية`;
            const r = log.repsLeft != null && log.repsRight != null ? `${log.repsRight}/${log.repsLeft}` : log.reps;
            if (log.loadMode === 'bodyweight') return `وزن الجسم × ${r}`;
            return `${log.displayWeight ?? getCanonicalWeightKg(log)} ${log.unit === 'lbs' ? 'باوند' : 'كجم'} × ${r}`;
        }
        function renderRepeatButton() {
            const btn = document.getElementById('btn-repeat-set');
            if (!btn) return;
            const ex = currentExercise();
            const last = ex && ex.type === 'weights' ? lastSetForRepeat(ex.id) : null;
            btn.classList.toggle('hidden', !last);
            if (last) { btn.textContent = 'كرر الجولة السابقة · ' + setLabel(last); btn.dataset.logId = last.id; }
        }
        function fillFromLog(log) {
            if (log.unit && log.unit !== activeWeightUnit) setWeightUnit(log.unit);
            if (log.loadMode) setLoadMode(log.loadMode);
            if (!['bodyweight', 'timed'].includes(log.loadMode)) document.getElementById('input-weight').value = log.displayWeight ?? getCanonicalWeightKg(log);
            document.getElementById('input-reps').value = log.repsRight ?? log.reps;
            document.getElementById('val-reps-display').textContent = log.repsRight ?? log.reps;
            const leftInput = document.getElementById('input-reps-left');
            if (leftInput) leftInput.value = log.repsLeft ?? log.repsRight ?? log.reps;
            if (log.loadMode === 'timed') document.getElementById('input-duration-sec').value = log.durationSeconds || 60;
            const type = log.setType === 'drop' ? 'dropset' : log.setType === 'failure' ? 'normal' : log.setType || 'normal';
            setSetType(type, document.querySelector('[data-settype="' + type + '"]'));
            const rir = log.rir != null && Number.isInteger(Number(log.rir)) ? String(log.rir) : '';
            setRIR(rir, document.querySelector(`.rir-btn[data-rir="${rir}"]`));
            updateWeightConvertedDisplay(); update1RMLiveDisplay();
        }
        async function repeatLastSet() {
            const ex = currentExercise();
            const last = ex ? lastSetForRepeat(ex.id) : null;
            if (!last) return;
            fillFromLog(last);
            await saveSet();
        }

        // اقتراح الجولة الجاية
        let currentSuggestion = null;
        function renderSuggestion() {
            const box = document.getElementById('next-suggestion');
            if (!box) return;
            const ex = currentExercise();
            currentSuggestion = ramadanSuggestion(ex && ex.type === 'weights' ? GymCalc.suggestNext(state.logs, ex.id, { excludeSessionId: activeSessionId, mode: activeLoadMode }) : null);
            box.classList.toggle('hidden', !currentSuggestion);
            renderWarmup(ex, currentSuggestion);
            renderPlateau(ex, currentSuggestion);
            if (!currentSuggestion) return;
            const sg = currentSuggestion, u = sg.unit === 'lbs' ? 'باوند' : 'كجم';
            document.getElementById('sugg-value').textContent = sg.mode === 'timed' ? `${sg.seconds} ثانية`
                : sg.mode === 'bodyweight' ? `وزن الجسم × ${sg.reps}`
                : sg.mode === 'assisted' ? `مساعدة ${sg.weight} ${u} × ${sg.reps}`
                : `${sg.weight} ${u} × ${sg.reps}`;
            document.getElementById('sugg-reason').textContent = sg.date ? sg.reason.replace(`(${sg.date})`, `(${friendlyDate(sg.date)})`) : sg.reason;
            box.dataset.kind = sg.kind;
        }
        function applySuggestion() {
            const sg = currentSuggestion;
            if (!sg) return;
            if (sg.mode === 'timed') { document.getElementById('input-duration-sec').value = sg.seconds; }
            else {
                if (sg.unit && sg.unit !== activeWeightUnit) setWeightUnit(sg.unit);
                if (sg.mode !== 'bodyweight') document.getElementById('input-weight').value = sg.weight;
                document.getElementById('input-reps').value = sg.reps;
                document.getElementById('val-reps-display').textContent = sg.reps;
            }
            if (activeSetType === 'warmup') setSetType('normal', document.querySelector('[data-settype="normal"]'));
            updateWeightConvertedDisplay(); update1RMLiveDisplay(); renderEquipVisual();
            haptic('tap');
            showToast('تعبّى الاقتراح. عدّله لو تبي، وبعدها احفظ الجولة');
        }


        /* ---------- v11.3 (الدفعة 1) ---------- */
        // B2: ملاحظة ثابتة لكل تمرين (وضع الكرسي، القبضة…) تطلع كل ما اخترته
        function renderExNote() {
            const box = document.getElementById('ex-note');
            if (!box) return;
            const ex = currentExercise();
            box.classList.toggle('hidden', !ex);
            if (!ex) return;
            document.getElementById('ex-note-edit').classList.add('hidden');
            const show = document.getElementById('ex-note-show');
            show.classList.remove('hidden');
            show.replaceChildren();
            if (ex.note) {
                const label = document.createElement('span'); label.className = 'ex-note-label'; label.textContent = 'ملاحظتك:';
                const text = document.createElement('span'); text.className = 'ex-note-text'; text.setAttribute('translate', 'no'); text.dir = 'auto'; text.textContent = ex.note;
                show.append(label, text);
                show.dataset.empty = '0';
            } else {
                show.textContent = '+ أضف ملاحظة لهالتمرين';
                show.dataset.empty = '1';
            }
        }
        function openExNoteEdit() {
            const ex = currentExercise();
            if (!ex) return;
            document.getElementById('ex-note-show').classList.add('hidden');
            document.getElementById('ex-note-edit').classList.remove('hidden');
            const input = document.getElementById('ex-note-input');
            input.value = ex.note || '';
            input.focus();
        }
        async function saveExNote() {
            const ex = currentExercise();
            if (!ex) return;
            const value = document.getElementById('ex-note-input').value.replace(/\s+/g, ' ').trim().slice(0, 120);
            if (value === (ex.note || '')) { renderExNote(); return; }
            await saveExerciseSetting({ note: value || null });
            renderExNote();
            document.getElementById('ex-note-show').focus();
            showToast(value ? 'انحفظت الملاحظة' : 'انمسحت الملاحظة');
        }

        // B3: الراحة تنحفظ لكل تمرين (السكوات 3 دقايق، الباي دقيقة)
        function applyExerciseRest(ex) {
            const select = document.getElementById('rest-timer-duration');
            if (!select || !ex || ex.restSec == null) return;
            const v = String(ex.restSec);
            if ([...select.options].some(o => o.value === v)) select.value = v;
        }
        async function saveExerciseRest() {
            const ex = currentExercise();
            if (!ex || ex.type !== 'weights') return;
            const v = Number(document.getElementById('rest-timer-duration').value);
            if (!Number.isInteger(v) || v < 0 || v > 600 || ex.restSec === v) return;
            await saveExerciseSetting({ restSec: v });
        }

        // A4: جولات التسخين تحت الاقتراح، تختفي أول ما تسجل جولة عمل للتمرين
        function hasWorkingSetNow(exerciseId) {
            const today = getLocalDateString();
            return state.logs.some(l => l.exerciseId === exerciseId && l.type === 'weights' && l.setType !== 'warmup' && (activeSessionId ? l.sessionId === activeSessionId : l.date === today));
        }
        function renderWarmup(ex, sg) {
            const box = document.getElementById('sugg-warmup');
            if (!box) return;
            const sets = ex && sg && !hasWorkingSetNow(ex.id) ? GymCalc.warmupSets(sg.weight, { unit: sg.unit, mode: sg.mode, barbell: ex.equip === 'barbell', barKg: ex.barKg }) : [];
            box.classList.toggle('hidden', !sets.length);
            const wrap = document.getElementById('sugg-warmup-sets');
            wrap.replaceChildren();
            const u = sg?.unit === 'lbs' ? 'باوند' : 'كجم';
            for (const w of sets) {
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'sugg-wchip';
                b.textContent = `${w.weight} ${u} × ${w.reps}`;
                b.addEventListener('click', () => fillWarmup(w, sg.unit));
                wrap.appendChild(b);
            }
        }
        function fillWarmup(w, unit) {
            if (unit && unit !== activeWeightUnit) setWeightUnit(unit);
            document.getElementById('input-weight').value = w.weight;
            document.getElementById('input-reps').value = w.reps;
            document.getElementById('val-reps-display').textContent = w.reps;
            setSetType('warmup', document.querySelector('[data-settype="warmup"]'));
            setRIR('', document.querySelector('.rir-btn[data-rir=""]'));
            updateWeightConvertedDisplay(); update1RMLiveDisplay();
            haptic('tap');
            showToast('تعبّت جولة التسخين. احفظها بعد ما تسويها');
        }

        // A6: سهل / مناسب / صعب بدل أرقام RIR (يتحوّل لـ RIR 3 / 2 / 0)
        function feelOf(rir) { return rir == null ? null : rir >= 3 ? '3' : rir >= 1 ? '2' : '0'; }
        function renderFeel() {
            const feel = state.profile.effortMode === 'feel';
            document.getElementById('feel-container')?.classList.toggle('hidden', !feel);
            document.getElementById('feel-label')?.classList.toggle('hidden', !feel);
            document.getElementById('rir-container')?.classList.toggle('hidden', feel);
            document.getElementById('rir-label')?.classList.toggle('hidden', feel);
            const cur = feelOf(activeRIR);
            document.querySelectorAll('.feel-btn').forEach(b => { const on = b.dataset.feelRir === cur; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
        }
        function setFeel(v) {
            const rir = feelOf(activeRIR) === v ? '' : v; // نفس الزر مرة ثانية = بدون تقييم
            setRIR(rir, document.querySelector(`.rir-btn[data-rir="${rir}"]`));
            haptic('tap');
        }

        // B1: الجهاز مشغول؟ بدائل لنفس العضلة، وتبديلها في خطة الجلسة
        function busyAlternatives(ex) { return ex && ex.type === 'weights' ? GymCalc.alternatives(state.exercises, state.logs, ex.id, 3) : []; }
        function renderBusyButton() {
            const btn = document.getElementById('btn-busy');
            if (btn) btn.classList.toggle('hidden', !busyAlternatives(currentExercise()).length);
        }
        function openBusy() {
            const ex = currentExercise();
            const alts = busyAlternatives(ex);
            if (!alts.length) return;
            document.getElementById('busy-hint').textContent = `بدائل ${shortName(ex.name)} لنفس العضلة. اللي سويتها قبل فوق.`;
            const list = document.getElementById('busy-list');
            list.replaceChildren();
            for (const alt of alts) {
                const last = state.logs.filter(l => l.exerciseId === alt.id && l.type === 'weights' && l.setType !== 'warmup').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
                const row = document.createElement('button');
                row.type = 'button'; row.className = 'busy-row';
                const name = document.createElement('strong'); name.textContent = shortName(alt.name);
                const equip = document.createElement('small'); equip.textContent = EQUIP_NAMES[alt.equip] || 'أوزان حرة';
                const lastEl = document.createElement('small'); lastEl.textContent = last ? 'آخر مرة: ' + setLabel(last) : 'ما سجلته قبل';
                row.append(name, equip, lastEl);
                row.addEventListener('click', () => runMutation(() => swapExercise(ex.id, alt.id)));
                list.appendChild(row);
            }
            document.getElementById('busy-modal').classList.remove('hidden');
            list.querySelector('button')?.focus();
        }
        function closeBusy() { document.getElementById('busy-modal').classList.add('hidden'); document.getElementById('btn-busy')?.focus(); }
        async function swapExercise(fromId, toId) {
            const from = state.exercises.find(e => e.id === fromId), to = state.exercises.find(e => e.id === toId);
            if (!from || !to) throw Error('التمرين غير موجود');
            const session = getActiveSession();
            let swapped = false;
            if (session?.planIds?.includes(fromId) && !session.planIds.includes(toId)) {
                session.planIds = session.planIds.map(id => id === fromId ? toId : id);
                session.editedAt = Date.now();
                await GymStorage.save(state);
                swapped = true;
            }
            document.getElementById('busy-modal').classList.add('hidden');
            selectExercise(toId);
            renderSessionPlan();
            haptic('tap');
            showToast(swapped ? `بدّلت ${shortName(from.name)} بـ ${shortName(to.name)} لهالجلسة` : `انتقلت لـ ${shortName(to.name)}`);
        }

        // C3: سطرين يفهمونك بعد الجلسة: وش كسرت، ووش متأخر
        function sessionInsightLines(sessionId) {
            const ins = GymCalc.sessionInsights(state.logs, state.exercises, sessionId, getLocalDateString());
            const lines = [];
            if (ins.records.length) {
                const names = ins.records.map(shortName), more = names.length - 3;
                lines.push({ kind: 'record', text: more > 0 ? `كسرت رقمك في ${names.slice(0, 3).join('، ')} و${more} غيرها.` : `كسرت رقمك في ${names.join('، ')}.` });
            }
            if (ins.behind) lines.push({ kind: 'behind', text: `متأخر في ${GymCatalog.MUSCLE_NAMES[ins.behind.muscle] || ins.behind.muscle}: ${ins.behind.now} جولات هالأسبوع، و${ins.behind.last} الأسبوع الماضي.` });
            return lines;
        }

        // E1: كل الجولات في ملف يفتحه Excel أو Google Sheets
        function downloadFile(text, type, filename) {
            const url = URL.createObjectURL(new Blob([text], { type }));
            const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
        function exportCSV() {
            const en = window.GymI18n?.lang === 'en';
            const tr = s => (en ? GymI18n.tq(s) : s);
            const logs = state.logs.filter(l => l && l.date).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            if (!logs.length) return showToast('ما فيه جولات تتصدّر للحين');
            const head = en ? ['Date', 'Session', 'Exercise', 'Set type', 'Weight', 'Unit', 'Reps', 'Seconds', 'RIR', 'Estimated 1RM (kg)', 'Volume (kg)', 'Minutes', 'Calories']
                : ['التاريخ', 'الجلسة', 'التمرين', 'نوع الجولة', 'الوزن', 'الوحدة', 'العدات', 'الثواني', 'RIR', '1RM التقديري (كجم)', 'الحجم (كجم)', 'الدقائق', 'السعرات'];
            const sessions = new Map(state.sessions.map(s => [s.id, s.name]));
            const rows = logs.map(l => {
                const session = tr(sessions.get(l.sessionId) || '');
                const ex = state.exercises.find(e => e.id === l.exerciseId);
                const name = ex?.name || l.exerciseName || '';
                if (l.type !== 'weights') return [l.date, session, tr(name), tr('كارديو'), '', '', '', '', '', '', '', Number(l.duration) || '', Number(l.calories) || ''];
                const timed = l.loadMode === 'timed';
                const w = timed || l.loadMode === 'bodyweight' ? '' : (l.displayWeight ?? getCanonicalWeightKg(l));
                const orm = timed ? '' : calculate1RM(getProgressWeightKg(l), l.reps);
                return [l.date, session, tr(name), tr(SET_LABELS[l.setType] || SET_LABELS.normal), w,
                    w === '' ? '' : tr(l.unit === 'lbs' ? 'باوند' : 'كجم'), timed ? '' : l.reps, timed ? Number(l.durationSeconds) || '' : '',
                    l.rir ?? '', Number.isFinite(orm) ? orm : '', timed ? '' : Math.round(GymCalc.volumeLoadKg(l) * (Number(l.reps) || 1) * 10) / 10, '', Number(l.calories) || ''];
            });
            downloadFile('﻿' + GymCalc.toCSV([head, ...rows]), 'text/csv;charset=utf-8', `gym_tracker_sets_${getLocalDateString()}.csv`);
            showToast(`تم تجهيز ملف Excel (${rows.length} صف)`);
        }


        /* ---------- v11.4 (الدفعة 2) ---------- */
        // A2: ثابت من 3 جلسات؟ اقتراح أسبوع خفيف (‎-10%) بنفس العدات
        function renderPlateau(ex, sg) {
            const box = document.getElementById('sugg-plateau');
            if (!box) return;
            const p = ex && sg && sg.weight > 0 ? GymCalc.plateau(state.logs, ex.id, { mode: sg.mode, excludeSessionId: activeSessionId }) : null;
            box.classList.toggle('hidden', !p);
            if (!p) return;
            const step = sg.mode === 'per_hand' ? (sg.unit === 'lbs' ? 5 : 2) : (sg.unit === 'lbs' ? 5 : 2.5);
            const light = Math.max(step, Math.round(sg.weight * 0.9 / step) * step);
            const reps = sg.basedOn?.reps || sg.reps;
            const u = sg.unit === 'lbs' ? 'باوند' : 'كجم';
            document.getElementById('sugg-plateau-text').textContent = `قوتك ثابتة من ${p.sessions} جلسات. هذا طبيعي، والحل غالبًا جلسة أخف: نزّل 10% وسوّ نفس العدات، والجلسة اللي بعدها ارجع لوزنك.`;
            const btn = document.getElementById('btn-deload');
            btn.textContent = `جلسة خفيفة: ${light} ${u} × ${reps}`;
            btn.dataset.weight = light; btn.dataset.reps = reps; btn.dataset.unit = sg.unit;
        }
        function fillDeload() {
            const b = document.getElementById('btn-deload');
            if (b.dataset.unit && b.dataset.unit !== activeWeightUnit) setWeightUnit(b.dataset.unit);
            document.getElementById('input-weight').value = b.dataset.weight;
            document.getElementById('input-reps').value = b.dataset.reps;
            document.getElementById('val-reps-display').textContent = b.dataset.reps;
            if (activeSetType === 'warmup') setSetType('normal', document.querySelector('[data-settype="normal"]'));
            updateWeightConvertedDisplay(); update1RMLiveDisplay();
            haptic('tap');
            showToast('تعبّت الجلسة الخفيفة. احفظ كل جولة بعد ما تسويها');
        }

        // C1: مستوى القوة مقابل وزن الجسم
        const STRENGTH_NAMES = { squat: 'سكوات', bench: 'بنش بريس', deadlift: 'ديدليفت', ohp: 'ضغط أكتاف واقف' };
        const LEVEL_NAMES = ['بداية', 'مبتدئ', 'متوسط', 'متقدم', 'نخبة'];
        function renderStrength() {
            const box = document.getElementById('bento-strength');
            if (!box) return;
            box.replaceChildren();
            const note = (text) => { const p = document.createElement('p'); p.className = 'field-hint'; p.textContent = text; box.appendChild(p); };
            if (!(Number(state.profile.weight) > 0)) { note('أدخل وزنك في البروفايل عشان نقارن قوتك بوزنك.'); return; }
            const rows = GymCalc.strengthLevels(state.logs, state.exercises, state.profile);
            if (!rows.length) { note('سجّل سكوات أو بنش أو ديدليفت أو ضغط أكتاف بالبار، ويطلع مستواك هنا.'); return; }
            for (const r of rows) {
                const row = document.createElement('div'); row.className = 'strength-row';
                const head = document.createElement('div'); head.className = 'strength-head';
                const name = document.createElement('strong'); name.textContent = STRENGTH_NAMES[r.key];
                const level = document.createElement('span'); level.className = 'strength-level'; level.dataset.level = r.level; level.textContent = LEVEL_NAMES[r.level];
                head.append(name, level);
                const bar = document.createElement('div'); bar.className = 'strength-bar'; bar.setAttribute('aria-hidden', 'true');
                for (let i = 1; i <= 4; i++) { const tick = document.createElement('i'); tick.style.insetInlineStart = (i * 20) + '%'; bar.appendChild(tick); }
                const fill = document.createElement('b'); fill.style.width = Math.max(2, Math.round(r.pos * 100)) + '%'; bar.appendChild(fill);
                const meta = document.createElement('small');
                meta.textContent = `1RM ${fmt1(r.oneRm)} كجم = ${r.ratio}× وزنك` + (r.next ? ` · باقي ${fmt1(r.next.kg)} كجم لـ${LEVEL_NAMES[r.next.level]}` : '');
                row.append(head, bar, meta);
                box.appendChild(row);
            }
            note('تقريبي: معايير منتشرة لقوة الرجال والنساء حسب وزن الجسم. العمر والخبرة يفرقون.');
        }

        // C2: تقرير الشهر مقابل الشهر اللي قبله
        function renderMonthReport() {
            const select = document.getElementById('month-select'), box = document.getElementById('bento-month');
            if (!select || !box) return;
            const months = GymCalc.monthsWithLogs(state.logs);
            const current = getLocalDateString().slice(0, 7);
            if (!months.includes(current)) months.unshift(current);
            const keep = months.includes(select.value) ? select.value : months[0];
            const loc = window.GymI18n?.locale || 'ar-SA';
            select.replaceChildren(...months.map(m => { const o = document.createElement('option'); o.value = m; o.textContent = new Date(m + '-15T12:00:00').toLocaleDateString(loc, { month: 'long', year: 'numeric', calendar: 'gregory', numberingSystem: 'latn' }); return o; }));
            select.value = keep;
            const cur = GymCalc.monthStats(state.logs, state.exercises, keep);
            const prev = GymCalc.monthStats(state.logs, state.exercises, GymCalc.prevMonth(keep));
            box.replaceChildren();
            if (!cur.days) { const p = document.createElement('p'); p.className = 'field-hint'; p.textContent = 'ما فيه تمارين مسجلة في هالشهر للحين.'; box.appendChild(p); return; }
            const grid = document.createElement('div'); grid.className = 'month-grid';
            const cell = (label, value, diff) => {
                const c = document.createElement('div'); c.className = 'month-cell';
                const v = document.createElement('b'); v.className = 'num-led'; v.textContent = value;
                const l = document.createElement('span'); l.textContent = label;
                c.append(v, l);
                if (diff != null && prev.days) {
                    const d = document.createElement('small'); d.className = 'month-diff';
                    d.dataset.dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
                    d.textContent = diff === 0 ? 'نفس الشهر اللي قبله' : `${diff > 0 ? '+' : '−'}${fmt1(Math.abs(diff))} عن الشهر اللي قبله`;
                    c.appendChild(d);
                }
                grid.appendChild(c);
            };
            cell('جلسات', cur.sessions, cur.sessions - prev.sessions);
            cell('جولات فعلية', cur.sets, cur.sets - prev.sets);
            cell('الحجم (طن)', fmt1(cur.volumeKg / 1000), Math.round((cur.volumeKg - prev.volumeKg) / 100) / 10);
            cell('أرقام قياسية', cur.records, null);
            box.appendChild(grid);
            const lines = [];
            if (cur.topMuscle) lines.push(`أكثر عضلة اشتغلت عليها: ${GymCatalog.MUSCLE_NAMES[cur.topMuscle.muscle]} (${cur.topMuscle.sets} جولة)`);
            if (cur.cardioMin) lines.push(`كارديو: ${cur.cardioMin} دقيقة`);
            lines.push(`أيام التمرين: ${cur.days}`);
            for (const t of lines) { const p = document.createElement('p'); p.className = 'month-line'; p.textContent = t; box.appendChild(p); }
        }

        // C5: ملخص الجلسة كصورة تشاركها
        function cssVar(name, fallback) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
        async function sessionImage(sessionId) {
            const session = state.sessions.find(s => s.id === sessionId);
            if (!session) throw Error('الجلسة غير موجودة');
            const T = s => (window.GymI18n ? GymI18n.t(s) : s);
            const en = window.GymI18n?.lang === 'en';
            const logs = state.logs.filter(l => l.sessionId === sessionId);
            const working = logs.filter(l => l.type === 'weights' && l.setType !== 'warmup');
            const minutes = Math.max(1, Math.round(((session.endedAt || Date.now()) - session.startedAt) / 60000));
            const best = new Map();
            for (const l of working) {
                const v = l.loadMode === 'timed' ? Number(l.durationSeconds) || 0 : GymData.oneRepMax(getProgressWeightKg(l), l.reps) || 0;
                const cur = best.get(l.exerciseId);
                if (!cur || v > cur.v) best.set(l.exerciseId, { v, log: l });
            }
            const top = [...best.values()].slice(0, 6);
            const records = GymCalc.sessionInsights(state.logs, state.exercises, sessionId, session.date || getLocalDateString()).records;
            try { await document.fonts?.ready; } catch {}
            const W = 1080, pad = 80;
            // square for a short session, taller (Instagram 4:5) when there are more exercises
            const H = Math.min(1350, Math.max(1080, 620 + (records.length ? 80 : 0) + top.length * 90 + 100));
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            const x = c.getContext('2d');
            const bg = cssVar('--panel', '#1B1B1A'), ink = cssVar('--ink', '#EDEBE6'), mute = cssVar('--mute', '#9A978F'), line = cssVar('--line', '#333331'), primary = cssVar('--primary', '#C8322A'), accent = cssVar('--accent-ink', '#E3B21B');
            const font = cssVar('--font', 'Alexandria, sans-serif'), num = cssVar('--stencil', font);
            x.fillStyle = bg; x.fillRect(0, 0, W, H);
            x.fillStyle = primary; x.fillRect(0, 0, W, 18);
            x.direction = en ? 'ltr' : 'rtl'; x.textBaseline = 'alphabetic';
            const start = en ? pad : W - pad, end = en ? W - pad : pad;
            const text = (s, px, y, color, weight = 700, family = font, align = 'start') => {
                x.font = `${weight} ${px}px ${family}`; x.fillStyle = color; x.textAlign = align;
                const max = W - pad * 2; let t = String(s);
                while (t.length > 3 && x.measureText(t).width > max) t = t.slice(0, -2);
                if (t !== String(s)) t = t.trimEnd() + '…';
                x.fillText(t, align === 'start' ? start : end, y);
            };
            text('Gym Tracker', 34, 110, mute, 700, font, 'start');
            text(session.date || '', 34, 110, mute, 600, font, 'end');
            text(T(session.name || 'جلسة'), 76, 220, ink, 800);
            // three big numbers
            const stats = [[String(minutes), T('دقيقة')], [String(working.length), T('جولة')], [fmt1((session.totalVolumeKg || 0) / 1000), T('طن')]];
            const colW = (W - pad * 2) / 3;
            stats.forEach(([v, label], i) => {
                const cx = en ? pad + colW * i : W - pad - colW * i;
                x.textAlign = 'start'; x.direction = en ? 'ltr' : 'rtl';
                x.font = `800 150px ${num}`; x.fillStyle = ink; x.fillText(v, cx, 420);
                x.font = `600 34px ${font}`; x.fillStyle = mute; x.fillText(label, cx, 475);
            });
            x.fillStyle = line; x.fillRect(pad, 540, W - pad * 2, 3);
            let y = 620;
            if (records.length) {
                text(T('كسرت رقمك في') + ' ' + records.slice(0, 3).map(n => T(shortName(n))).join(en ? ', ' : '، '), 38, y, accent, 700);
                y += 80;
            }
            for (const b of top) {
                const name = T(shortName(state.exercises.find(e => e.id === b.log.exerciseId)?.name || b.log.exerciseName || ''));
                text(name, 40, y, ink, 700);
                text(T(setLabel(b.log)), 40, y, mute, 600, font, 'end');
                y += 30; x.fillStyle = line; x.fillRect(pad, y, W - pad * 2, 1); y += 60;
                if (y > H - 140) break;
            }
            x.fillStyle = primary; x.fillRect(0, H - 18, W, 18);
            return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(Error('تعذر تجهيز الصورة')), 'image/png'));
        }
        async function shareSessionImage(sessionId) {
            const blob = await sessionImage(sessionId);
            const name = `gym_tracker_session_${getLocalDateString()}.png`;
            const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
            if (file && navigator.canShare && navigator.canShare({ files: [file] }) && !window.Capacitor) {
                try { await navigator.share({ files: [file], title: 'Gym Tracker' }); return; }
                catch (e) { if (e?.name === 'AbortError') return; }
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
            if (!window.Capacitor) showToast('انحفظت صورة الجلسة');
        }


        /* ---------- v11.5 (الدفعة 3) ---------- */
        // A1: خريطة الاستشفاء: وش جاهز للتمرين اليوم ووش يحتاج راحة
        const SVG_NS = 'http://www.w3.org/2000/svg';
        // simple geometric figure (front, back): [muscle, shape, attrs]; muscle null = neutral body part
        const BODY_FRONT = [
            [null, 'circle', { cx: 60, cy: 18, r: 12 }], [null, 'rect', { x: 54, y: 30, width: 12, height: 8 }],
            ['shoulders', 'circle', { cx: 33, cy: 46, r: 10 }], ['shoulders', 'circle', { cx: 87, cy: 46, r: 10 }],
            ['chest', 'rect', { x: 40, y: 40, width: 19, height: 24, rx: 4 }], ['chest', 'rect', { x: 61, y: 40, width: 19, height: 24, rx: 4 }],
            ['biceps', 'rect', { x: 20, y: 58, width: 12, height: 30, rx: 5 }], ['biceps', 'rect', { x: 88, y: 58, width: 12, height: 30, rx: 5 }],
            [null, 'rect', { x: 16, y: 91, width: 11, height: 32, rx: 5 }], [null, 'rect', { x: 93, y: 91, width: 11, height: 32, rx: 5 }],
            ['abs', 'rect', { x: 46, y: 67, width: 28, height: 40, rx: 4 }],
            [null, 'rect', { x: 42, y: 109, width: 36, height: 14, rx: 4 }],
            ['legs', 'rect', { x: 41, y: 125, width: 18, height: 52, rx: 7 }], ['legs', 'rect', { x: 61, y: 125, width: 18, height: 52, rx: 7 }],
            [null, 'rect', { x: 43, y: 180, width: 14, height: 46, rx: 6 }], [null, 'rect', { x: 63, y: 180, width: 14, height: 46, rx: 6 }]
        ];
        const BODY_BACK = [
            [null, 'circle', { cx: 60, cy: 18, r: 12 }], [null, 'rect', { x: 54, y: 30, width: 12, height: 8 }],
            ['shoulders', 'circle', { cx: 33, cy: 46, r: 10 }], ['shoulders', 'circle', { cx: 87, cy: 46, r: 10 }],
            ['back', 'path', { d: 'M40 38 H80 L78 70 L68 104 H52 L42 70 Z' }],
            ['triceps', 'rect', { x: 20, y: 58, width: 12, height: 30, rx: 5 }], ['triceps', 'rect', { x: 88, y: 58, width: 12, height: 30, rx: 5 }],
            [null, 'rect', { x: 16, y: 91, width: 11, height: 32, rx: 5 }], [null, 'rect', { x: 93, y: 91, width: 11, height: 32, rx: 5 }],
            ['legs', 'rect', { x: 42, y: 106, width: 36, height: 20, rx: 6 }],
            ['legs', 'rect', { x: 41, y: 128, width: 18, height: 50, rx: 7 }], ['legs', 'rect', { x: 61, y: 128, width: 18, height: 50, rx: 7 }],
            ['legs', 'rect', { x: 43, y: 181, width: 14, height: 45, rx: 6 }], ['legs', 'rect', { x: 63, y: 181, width: 14, height: 45, rx: 6 }]
        ];
        function recoveryState(r) { return !r ? 'none' : r.pct >= 1 ? 'ready' : r.pct >= 0.5 ? 'mid' : 'tired'; }
        function bodySvg(parts, rec, label) {
            const svg = document.createElementNS(SVG_NS, 'svg');
            svg.setAttribute('viewBox', '0 0 120 244'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
            for (const [m, tag, attrs] of parts) {
                const el = document.createElementNS(SVG_NS, tag);
                for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
                el.setAttribute('class', m ? 'rec-part' : 'rec-body');
                if (m) { el.dataset.muscle = m; el.dataset.state = recoveryState(rec[m]); }
                svg.appendChild(el);
            }
            const cap = document.createElementNS(SVG_NS, 'text');
            cap.setAttribute('x', 60); cap.setAttribute('y', 241); cap.setAttribute('text-anchor', 'middle'); cap.setAttribute('class', 'rec-cap');
            cap.textContent = label;
            svg.appendChild(cap);
            return svg;
        }
        function renderRecovery() {
            const box = document.getElementById('bento-recovery');
            if (!box) return;
            const rec = GymCalc.recovery(state.logs, state.exercises, Date.now());
            box.replaceChildren();
            const figs = document.createElement('div'); figs.className = 'rec-figs';
            figs.append(bodySvg(BODY_FRONT, rec, 'من قدام'), bodySvg(BODY_BACK, rec, 'من ورا'));
            const list = document.createElement('ul'); list.className = 'rec-list';
            const order = Object.keys(GymCatalog.MUSCLE_NAMES).sort((a, b) => (rec[b]?.pct ?? 2) - (rec[a]?.pct ?? 2));
            for (const m of order) {
                const r = rec[m], li = document.createElement('li');
                li.dataset.state = recoveryState(r);
                const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true');
                const name = document.createElement('strong'); name.textContent = GymCatalog.MUSCLE_NAMES[m];
                const what = document.createElement('span');
                what.textContent = !r ? 'ما تمرنت عليها للحين' : r.pct >= 1 ? 'جاهزة' : `ترتاح كمان ${r.left} ساعة تقريبًا`;
                li.append(dot, name, what);
                list.appendChild(li);
            }
            const note = document.createElement('p'); note.className = 'field-hint';
            note.textContent = 'تقدير من آخر جلسة لكل عضلة وكم جولة سويت: 1–4 جولات تحتاج يوم ونص، 5–9 يومين، و10 أو أكثر 3 أيام. النوم والأكل يفرقون.';
            box.append(figs, list, note);
        }

        // A1 داخل خطة الجلسة: سطر واحد يقول وش جاهز ووش يرتاح
        function renderPlanRecovery() {
            const line = document.getElementById('plan-recovery');
            if (!line) return;
            const rec = GymCalc.recovery(state.logs, state.exercises, Date.now());
            const name = m => GymCatalog.MUSCLE_NAMES[m];
            const ready = Object.keys(rec).filter(m => rec[m] && rec[m].pct >= 1).map(name);
            const resting = Object.keys(rec).filter(m => rec[m] && rec[m].pct < 1).sort((a, b) => rec[a].pct - rec[b].pct).map(name);
            line.classList.toggle('hidden', !ready.length && !resting.length);
            line.textContent = [ready.length ? `جاهز: ${ready.join('، ')}` : '', resting.length ? `يرتاح: ${resting.join('، ')}` : ''].filter(Boolean).join(' · ');
        }

        // I2: «عندي وقت» في خطة الجلسة: يشيل تمارين لين تدخل في وقتك
        function renderPlanTime() {
            const est = document.getElementById('plan-time-est');
            if (!est) return;
            const ids = [...planDraft];
            const total = ids.length ? GymCalc.planMinutes(ids, state.exercises, state.logs).total : 0;
            est.textContent = ids.length ? `تقريبًا ${total} دقيقة` : '';
        }
        function applyPlanTime() {
            const sel = document.getElementById('plan-time');
            const minutes = Number(sel.value);
            if (!minutes) { renderPlanTime(); return; }
            const ids = [...planDraft];
            const { keep, drop, total } = GymCalc.trimPlan(ids, state.exercises, state.logs, minutes);
            const hint = document.getElementById('plan-time-hint');
            if (!drop.length) { hint.textContent = `الخطة تدخل في ${minutes} دقيقة (تقريبًا ${total}).`; renderPlanTime(); return; }
            planDraft = new Set(keep);
            renderPlanList();
            hint.textContent = `شلت ${drop.map(id => shortName(state.exercises.find(e => e.id === id)?.name || id)).join('، ')} عشان تخلص في ${minutes} دقيقة تقريبًا.`;
            haptic('tap');
        }

        // B6: «كرر الجولة» من إشعار الراحة في شاشة القفل (أندرويد يرسل gym:repeat-set)
        async function repeatFromNotification(detail) {
            const exId = detail?.exerciseId;
            if (exId && state.exercises.some(e => e.id === exId) && document.getElementById('exercise-dropdown').value !== exId) selectExercise(exId);
            const ex = currentExercise();
            if (!ex || !lastSetForRepeat(ex.id)) { showToast('ما فيه جولة أكررها'); return; }
            switchTab('workout');
            await repeatLastSet();
        }

        // B5: يمين ويسار لحالهم (لانجز، سكوات بلغاري، سحب بيد وحدة…)
        function sidesOn() { const ex = currentExercise(); return !!ex && ex.sidesOn === true && GymCalc.isUnilateral(ex); }
        function renderSides() {
            const ex = currentExercise();
            const can = !!ex && GymCalc.isUnilateral(ex) && activeLoadMode !== 'timed';
            const toggle = document.getElementById('btn-sides');
            if (!toggle) return;
            toggle.classList.toggle('hidden', !can);
            const on = can && ex.sidesOn === true;
            toggle.setAttribute('aria-pressed', String(on));
            toggle.textContent = on ? 'نفس العدات للجهتين' : 'يمين ويسار مختلفة؟';
            document.getElementById('sides-left').classList.toggle('hidden', !on);
            document.getElementById('reps-side-label').classList.toggle('hidden', !on);
            if (on && !document.getElementById('input-reps-left').value) document.getElementById('input-reps-left').value = document.getElementById('input-reps').value;
            const hint = document.getElementById('sides-hint');
            const bal = on ? GymCalc.sideBalance(state.logs, ex.id) : null;
            hint.classList.toggle('hidden', !bal);
            if (bal) hint.textContent = bal.weak === 'left'
                ? `يسارك أضعف بـ ${bal.pct}% في آخر 3 جلسات. ابدأ باليسار، وخل اليمين يوقف على نفس عداته.`
                : `يمينك أضعف بـ ${bal.pct}% في آخر 3 جلسات. ابدأ باليمين، وخل اليسار يوقف على نفس عداته.`;
        }
        async function toggleSides() {
            const ex = currentExercise();
            if (!ex) return;
            await saveExerciseSetting({ sidesOn: ex.sidesOn === true ? null : true });
            document.getElementById('input-reps-left').value = document.getElementById('input-reps').value;
            renderSides();
        }
        function sideReps() {
            if (!sidesOn() || activeLoadMode === 'timed') return null;
            const right = Number(document.getElementById('input-reps').value);
            const left = readField('input-reps-left', 'عدات اليسار', 0, 150);
            return { right, left };
        }


        /* ---------- v11.6 (الدفعة 4) ---------- */
        // D2: طريقة الأداء لكل تمرين (نص بس)
        function renderGuide() {
            const box = document.getElementById('ex-guide');
            if (!box) return;
            const ex = currentExercise();
            const g = ex && !ex.isCustom ? window.GymGuide?.get(ex.id) : null;
            box.classList.toggle('hidden', !g);
            if (!g) return;
            const T = s => (window.GymI18n ? GymI18n.t(s) : s);
            const body = document.getElementById('ex-guide-body');
            body.replaceChildren();
            const m = document.createElement('p'); m.className = 'guide-muscles';
            const ml = document.createElement('b'); ml.textContent = T('العضلات:') + ' ';
            m.append(ml, g.muscles);
            const ol = document.createElement('ol'); ol.className = 'guide-steps';
            for (const step of g.steps) { const li = document.createElement('li'); li.textContent = step; ol.appendChild(li); }
            const mh = document.createElement('p'); mh.className = 'guide-mistakes-title'; mh.textContent = T('أشهر الأغلاط:');
            const ul = document.createElement('ul'); ul.className = 'guide-mistakes';
            for (const x of g.mistakes) { const li = document.createElement('li'); li.textContent = x; ul.appendChild(li); }
            body.append(m, ol, mh, ul);
        }

        // D1: برامج جاهزة في خطة الجلسة
        let planProgramDay = null;
        const programs = () => window.GymPrograms;
        function targetText(t) {
            const secs = /s$/.test(t.reps);
            // words between the numbers keep "4 × 6-8" in the right order in Arabic too
            return `${t.sets === 1 ? 'جولة وحدة' : t.sets + ' جولات'} × ${t.reps.replace(/s$/, '')} ${secs ? 'ثانية' : 'عدات'}`;
        }
        function fillProgramSelect() {
            const sel = document.getElementById('plan-program');
            if (!sel || !programs() || sel.options.length > 1) return;
            for (const p of programs().list) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); }
        }
        function renderProgramDays() {
            const sel = document.getElementById('plan-program'), days = document.getElementById('plan-days'), info = document.getElementById('plan-program-info');
            if (!sel || !programs()) return;
            const p = programs().find(sel.value);
            days.classList.toggle('hidden', !p); info.classList.toggle('hidden', !p);
            days.replaceChildren();
            if (!p) { info.textContent = ''; return; }
            const next = programs().nextDay(p.id, state.sessions);
            p.split.forEach((d, i) => {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'plan-chip'; b.dataset.day = i;
                b.textContent = d.name + (i === next ? ' · الجاي' : '');
                b.setAttribute('aria-pressed', String(planProgramDay?.program === p.id && planProgramDay.day === i));
                days.appendChild(b);
            });
            const chosen = planProgramDay?.program === p.id ? p.split[planProgramDay.day] : null;
            info.replaceChildren();
            if (chosen) info.textContent = chosen.ex.map(([id, sets, reps]) => `${shortName(state.exercises.find(e => e.id === id)?.name || id)} ${targetText({ sets, reps })}`).join('، ');
            else { const d = document.createElement('b'); d.textContent = p.days; const r = document.createElement('span'); r.textContent = p.rule; info.append(d, document.createElement('br'), r); }
        }
        async function chooseProgram() {
            const v = document.getElementById('plan-program').value;
            if ((state.profile.program || '') !== v) { state.profile = { ...state.profile, program: v }; await GymStorage.save(state); }
            planProgramDay = null;
            renderProgramDays();
        }
        async function chooseProgramDay(day) {
            const p = programs().find(document.getElementById('plan-program').value);
            if (!p || !p.split[day]) return;
            const ids = p.split[day].ex.map(r => r[0]);
            // the deadlift is not in the original library: add it the first time a program needs it
            if (ids.includes('ex_70') && !state.exercises.some(e => e.id === 'ex_70')) {
                state.exercises.push({ ...programs().DEADLIFT, isCustom: false, archived: false, editedAt: Date.now() });
                await GymStorage.save(state);
                renderExerciseDropdown();
            }
            planProgramDay = { program: p.id, day };
            planDraft = new Set(ids.filter(id => state.exercises.some(e => e.id === id && !e.archived)));
            renderPlanList();
            renderProgramDays();
            haptic('tap');
        }
        function renderProgramTarget() {
            const el = document.getElementById('program-target');
            if (!el) return;
            const session = getActiveSession(), ex = currentExercise();
            const pd = session?.programDay;
            const t = pd && ex && programs() ? programs().target(pd.program, pd.day, ex.id) : null;
            el.classList.toggle('hidden', !t);
            if (!t) return;
            const done = state.logs.filter(l => l.sessionId === session.id && l.exerciseId === ex.id && l.type === 'weights' && l.setType !== 'warmup').length;
            el.textContent = `هدف البرنامج: ${targetText(t)} · سويت ${done} من ${t.sets}`;
            el.dataset.done = String(done >= t.sets);
        }

        // I1: وضع رمضان
        const RAMADAN_GROW = ['add-weight', 'add-rep', 'less-assist', 'add-time'];
        function ramadanSuggestion(sg) {
            if (!sg || state.profile.ramadan !== true || !RAMADAN_GROW.includes(sg.kind)) return sg;
            const b = sg.basedOn || {};
            const first = String(sg.reason).replace(/^(.*?\.)\s.*$/, '$1');
            return { ...sg, kind: 'hold', weight: b.weight ?? sg.weight, reps: b.reps ?? sg.reps, seconds: b.seconds ?? sg.seconds,
                reason: first + ' وضع رمضان: ثبّت نفس أرقام آخر مرة. الصيام يقلل طاقتك، والهدف تحافظ على قوتك لين يخلص الشهر.' };
        }
        function renderRamadan() {
            const on = state.profile.ramadan === true;
            const set = document.getElementById('set-ramadan'); if (set) set.checked = on;
            const row = document.getElementById('ramadan-iftar-row'); if (row) row.classList.toggle('hidden', !on);
            const time = document.getElementById('ramadan-iftar'); if (time && document.activeElement !== time) time.value = state.profile.iftar || '18:00';
            const split = document.getElementById('bento-ramadan');
            if (split) {
                const m = on ? GymCalc.bodyMetrics(state.profile) : null;
                split.classList.toggle('hidden', !m);
                if (m) split.textContent = `في رمضان: قسّم سعرات المحافظة (${m.tdee}) على وجبتين: الفطور حوالي ${Math.round(m.tdee * 0.6)} سعرة، والسحور حوالي ${Math.round(m.tdee * 0.4)}. خل البروتين في الوجبتين.`;
            }
            try { localStorage.setItem('gym_ramadan', JSON.stringify({ on, iftar: state.profile.iftar || '18:00' })); } catch {}
        }
        async function saveRamadan(on) {
            state.profile = { ...state.profile, ramadan: on, iftar: state.profile.iftar || document.getElementById('ramadan-iftar')?.value || '18:00' };
            await GymStorage.save(state);
            renderRamadan(); renderSuggestion();
            showToast(on ? 'وضع رمضان شغال: الاقتراح يثبّت الوزن، وتذكير الماء بعد الفطور' : 'وضع رمضان مطفي');
        }
        async function saveIftar() {
            const v = document.getElementById('ramadan-iftar').value;
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { const e = Error('اكتب وقت الفطور مثل 18:05'); e.fieldId = 'ramadan-iftar'; throw e; }
            state.profile = { ...state.profile, iftar: v };
            await GymStorage.save(state);
            renderRamadan();
            showToast(`تذكير الماء الساعة ${addMinutes(v, 15)}`);
        }
        function addMinutes(hhmm, add) { const [h, m] = hhmm.split(':').map(Number); const t = (h * 60 + m + add) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }

        // خطة الجلسة
        let planDraft = new Set();
        function shortName(name) { return String(name).replace(/\s*\([^)]*\)\s*$/, ''); }
        function openPlan() {
            const session = getActiveSession();
            planDraft = new Set(session?.planIds || []);
            if (!planDraft.size) { const routine = document.getElementById('session-routine-select').value; (ROUTINE_PRESETS[routine] || []).forEach(id => planDraft.add(id)); }
            const quick = document.getElementById('plan-quick');
            quick.replaceChildren();
            const addChip = (label, ids) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'plan-chip'; b.textContent = label; b.addEventListener('click', () => { planDraft = new Set(ids); planProgramDay = null; renderPlanList(); renderProgramDays(); }); quick.appendChild(b); };
            for (const [key, ids] of Object.entries(ROUTINE_PRESETS)) addChip(ROUTINE_LABELS[key] || key, ids);
            const prev = getPreviousCompletedSession();
            if (prev) { const ids = [...new Set(state.logs.filter(l => l.sessionId === prev.id).map(l => l.exerciseId))]; if (ids.length) addChip('مثل الجلسة السابقة', ids); }
            addChip('مسح الكل', []);
            document.getElementById('plan-search').value = '';
            const planTime = document.getElementById('plan-time'); if (planTime) planTime.value = '0';
            renderPlanRecovery();
            fillProgramSelect();
            const progSel = document.getElementById('plan-program'); if (progSel) progSel.value = state.profile.program || '';
            planProgramDay = null;
            renderProgramDays();
            const planHint = document.getElementById('plan-time-hint'); if (planHint) planHint.textContent = '';
            document.getElementById('btn-plan-confirm').textContent = session ? 'حفظ الخطة' : 'ابدأ بهذي الخطة';
            renderPlanList();
            document.getElementById('plan-modal').classList.remove('hidden');
            document.getElementById('btn-plan-cancel').focus();
        }
        function closePlan() { document.getElementById('plan-modal').classList.add('hidden'); document.getElementById('btn-plan-session')?.focus(); }
        function renderPlanList() {
            const q = document.getElementById('plan-search').value.trim().toLowerCase();
            const list = document.getElementById('plan-list');
            list.replaceChildren();
            const pool = state.exercises.filter(e => !e.archived && (!q || GymData.matchScore(e.name, q) > 0));
            for (const cat of ['push', 'pull', 'legs', 'abs', 'cardio']) {
                const items = pool.filter(e => e.category === cat).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
                if (!items.length) continue;
                const h = document.createElement('div'); h.className = 'plan-group'; h.textContent = CATEGORY_NAMES[cat] || cat; list.appendChild(h);
                for (const ex of items) {
                    const row = document.createElement('label'); row.className = 'plan-item';
                    const box = document.createElement('input'); box.type = 'checkbox'; box.value = ex.id; box.checked = planDraft.has(ex.id);
                    const name = document.createElement('span'); name.textContent = shortName(ex.name);
                    row.append(box, name); list.appendChild(row);
                }
            }
            if (!list.children.length) { const p = document.createElement('p'); p.className = 'field-hint'; p.textContent = 'ما فيه تمرين بهذا الاسم'; list.appendChild(p); }
            document.getElementById('plan-count').textContent = planDraft.size === 1 ? 'تمرين واحد' : `${planDraft.size} تمارين`;
            renderPlanTime();
        }
        async function confirmPlan() {
            const ids = [...planDraft].filter(id => state.exercises.some(e => e.id === id));
            if (!ids.length) throw Error('اختر تمرين واحد على الأقل');
            let session = getActiveSession();
            if (!session) session = await startWorkoutSession();
            session.planIds = ids; session.editedAt = Date.now();
            if (planProgramDay) session.programDay = planProgramDay; else delete session.programDay;
            await GymStorage.save(state);
            document.getElementById('plan-modal').classList.add('hidden');
            renderSessionPlan();
            const next = ids.find(id => !state.logs.some(l => l.sessionId === session.id && l.exerciseId === id));
            if (next) selectExercise(next);
            showToast(`الخطة: ${ids.length === 1 ? 'تمرين واحد' : ids.length + ' تمارين'}. تقدر تضيف غيرها عادي`);
        }
        function selectExercise(id) {
            const dropdown = document.getElementById('exercise-dropdown');
            if (![...dropdown.options].some(o => o.value === id)) {
                activePresetFilterIds = null; currentFilterCat = 'all';
                document.getElementById('exercise-search-input').value = '';
                renderCategoryTabs(); setEquipFilter('all', document.querySelector('[data-equip="all"]'));
            }
            dropdown.value = id;
            onExerciseSelectChange();
        }
        function renderSessionPlan() {
            const box = document.getElementById('session-plan');
            if (!box) return;
            const session = getActiveSession();
            const plan = session?.planIds || [];
            box.classList.toggle('hidden', !plan.length);
            const btn = document.getElementById('btn-plan-session');
            if (btn) btn.textContent = plan.length ? 'عدّل الخطة' : 'خطّط الجلسة: اختر تمارينك';
            if (!plan.length) { box.replaceChildren(); return; }
            const logs = state.logs.filter(l => l.sessionId === session.id);
            const count = id => logs.filter(l => l.exerciseId === id && l.setType !== 'warmup').length;
            const extras = [...new Set(logs.map(l => l.exerciseId))].filter(id => !plan.includes(id));
            const done = plan.filter(id => count(id) > 0).length;
            const next = plan.find(id => !count(id));
            const head = document.createElement('div'); head.className = 'plan-head';
            head.textContent = `الخطة: ${done} من ${plan.length}`;
            const row = document.createElement('div'); row.className = 'plan-chips';
            for (const id of [...plan, ...extras]) {
                const ex = state.exercises.find(e => e.id === id);
                if (!ex) continue;
                const n = count(id);
                const b = document.createElement('button'); b.type = 'button'; b.dataset.ex = id;
                b.className = 'plan-step' + (n ? ' done' : '') + (id === next ? ' next' : '') + (plan.includes(id) ? '' : ' extra');
                const name = document.createElement('span'); name.textContent = shortName(ex.name);
                const c = document.createElement('b'); c.textContent = n ? '×' + n : (plan.includes(id) ? '—' : '+');
                b.append(name, c);
                b.addEventListener('click', () => { selectExercise(id); document.getElementById('exercise-dropdown').scrollIntoView({ block: 'center' }); });
                row.appendChild(b);
            }
            box.replaceChildren(head, row);
        }


        /* ---------- v10.8: التطور والتحليل ---------- */
        const AR_DAYS = GymI18n.list('days', ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']);
        const AR_MONTHS = GymI18n.list('months', ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']);
        const fmt1 = n => String(Math.round(Number(n) * 10) / 10);
        const modeUnit = mode => mode === 'timed' ? 'ثانية' : mode === 'per_hand' ? 'كجم لكل يد' : 'كجم';
        const MODE_NOTE = { per_hand: 'لكل يد', bodyweight: 'وزن الجسم', added: 'وزن جسم + إضافي', assisted: 'بمساعدة', timed: 'بالوقت' };
        function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
        /** v11.7 (G7): «اليوم»، «أمس»، «الثلاثاء 29 سبتمبر»، ولسنة ثانية يضيف السنة. ملف Excel يبقى بالأرقام. */
        function friendlyDate(d) {
            if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || '';
            const today = getLocalDateString();
            const y = new Date(today + 'T12:00:00'); y.setDate(y.getDate() - 1);
            if (d === today) return 'اليوم';
            if (d === `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`) return 'أمس';
            return prettyDate(d) + (d.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + d.slice(0, 4));
        }
        function prettyDate(d) { const x = new Date(d + 'T12:00:00'); return Number.isFinite(x.getTime()) ? `${AR_DAYS[x.getDay()]} ${x.getDate()} ${AR_MONTHS[x.getMonth()]}` : d; }

        function renderRecords() {
            const box = document.getElementById('records-list');
            if (!box) return;
            const recs = [...GymCalc.personalRecords(state.logs).values()].filter(r => r.top);
            box.replaceChildren();
            if (!recs.length) { box.appendChild(el('p', 'field-hint', 'سجّل جولات وبتطلع أرقامك هنا.')); return; }
            const latest = r => [r.top?.date, r.best1rm?.date].filter(Boolean).sort().pop() || '';
            recs.sort((a, b) => latest(b).localeCompare(latest(a)));
            for (const r of recs) {
                const ex = state.exercises.find(e => e.id === r.exerciseId);
                const row = el('button', 'record-row'); row.type = 'button'; row.dataset.ex = r.exerciseId; row.dataset.mode = r.mode;
                const name = el('span', 'record-name', shortName(ex?.name || r.exerciseName || ''));
                if (MODE_NOTE[r.mode]) name.appendChild(el('small', 'record-mode', ' · ' + MODE_NOTE[r.mode]));
                const top = el('span', 'record-cell');
                top.append(el('b', 'num-led', r.mode === 'timed' ? fmt1(r.top.value) + 'ث' : `${fmt1(r.top.value)}×${r.top.reps}`), el('small', '', friendlyDate(r.top.date)));
                const rm = el('span', 'record-cell');
                if (r.best1rm) rm.append(el('b', 'num-led led-red', fmt1(r.best1rm.value)), el('small', '', friendlyDate(r.best1rm.date)));
                else rm.append(el('b', 'num-led', '—'), el('small', '', r.mode === 'timed' ? 'ما ينطبق' : '1RM حتى 15 عدة'));
                row.append(name, top, rm);
                box.appendChild(row);
            }
        }
        function openRecord(exId, mode) {
            const select = document.getElementById('chart-exercise-select');
            if (![...select.options].some(o => o.value === exId)) return;
            select.value = exId;
            document.getElementById('progress-load-mode').value = mode;
            updateProgressChart();
            document.getElementById('progressChart').scrollIntoView({ block: 'center', behavior: 'smooth' });
        }

        let calOffset = 0;
        function renderCalendar() {
            const grid = document.getElementById('cal-grid');
            if (!grid) return;
            const today = getLocalDateString();
            const c = GymCalc.consistency(state.logs, today);
            const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + calOffset);
            const y = base.getFullYear(), m = base.getMonth();
            document.getElementById('cal-title').textContent = `${AR_MONTHS[m]} ${y}`;
            document.getElementById('cal-next').disabled = calOffset >= 0;
            const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
            document.getElementById('cal-streak').textContent = c.streak;
            document.getElementById('cal-week').textContent = c.thisWeekDays;
            document.getElementById('cal-month').textContent = [...c.days].filter(d => d.startsWith(prefix)).length;
            grid.replaceChildren();
            for (const d of ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']) grid.appendChild(el('span', 'cal-dow', d));
            const first = new Date(y, m, 1).getDay(), count = new Date(y, m + 1, 0).getDate();
            for (let i = 0; i < first; i++) grid.appendChild(el('span', 'cal-pad'));
            for (let day = 1; day <= count; day++) {
                const date = prefix + String(day).padStart(2, '0');
                const trained = c.days.has(date);
                const cell = el(trained ? 'button' : 'span', 'cal-day' + (trained ? ' on' : '') + (date === today ? ' today' : '') + (date > today ? ' future' : ''), String(day));
                if (trained) { cell.type = 'button'; cell.dataset.date = date; cell.setAttribute('aria-label', 'تمرنت يوم ' + prettyDate(date)); }
                grid.appendChild(cell);
            }
        }
        function openDay(date) {
            const f = document.getElementById('logs-date-filter');
            f.value = date; logsRenderLimit = 15; renderTodayLogs();
            switchTab('workout');
            document.getElementById('today-logs-container').scrollIntoView({ block: 'start' });
            showToast('جولات ' + prettyDate(date));
        }

        function renderMuscles() {
            const box = document.getElementById('muscle-bars');
            if (!box) return;
            const start = GymCalc.weekStart(getLocalDateString());
            const prev = new Date(start + 'T12:00:00'); prev.setDate(prev.getDate() - 7);
            const now = GymCalc.weeklyMuscleSets(state.logs, state.exercises, start);
            const last = GymCalc.weeklyMuscleSets(state.logs, state.exercises, getLocalDateString(prev));
            const max = Math.max(10, ...Object.values(now), ...Object.values(last));
            box.replaceChildren();
            for (const [k, label] of Object.entries(GymCatalog.MUSCLE_NAMES)) {
                const row = el('div', 'muscle-row' + (now[k] ? '' : ' zero'));
                const bar = el('div', 'muscle-bar');
                const fill = el('i'); fill.style.width = (now[k] / max * 100) + '%';
                const ghost = el('s'); ghost.style.right = (last[k] / max * 100) + '%'; ghost.title = 'الأسبوع الماضي: ' + last[k];
                bar.append(fill, ghost);
                row.append(el('span', 'muscle-name', label), bar, el('b', 'num-led', now[k] ? String(now[k]) : '0'));
                row.setAttribute('aria-label', `${label}: ${now[k]} جولة هالأسبوع، ${last[k]} الأسبوع الماضي`);
                box.appendChild(row);
            }
        }

        let sessionsLimit = 10;
        function renderSessions() {
            const box = document.getElementById('sessions-list');
            if (!box) return;
            const items = state.sessions.filter(x => x.status === 'completed').map(x => ({ key: x.id, date: x.date, name: x.name, session: x, logs: state.logs.filter(l => l.sessionId === x.id), time: x.startedAt }));
            const loose = new Map();
            for (const l of state.logs) if (!l.sessionId) { if (!loose.has(l.date)) loose.set(l.date, []); loose.get(l.date).push(l); }
            for (const [date, logs] of loose) items.push({ key: 'day-' + date, date, name: 'تمرين بدون جلسة', session: null, logs, time: Date.parse(date + 'T12:00:00') });
            items.sort((a, b) => (b.time || 0) - (a.time || 0));
            box.replaceChildren();
            if (!items.length) { box.appendChild(el('p', 'field-hint', 'لما تنهي أول جلسة بتطلع هنا.')); }
            for (const it of items.slice(0, sessionsLimit)) {
                const working = it.logs.filter(l => l.type === 'weights' && l.setType !== 'warmup');
                const s = it.session;
                const mins = s && s.endedAt ? Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000)) : null;
                const tons = s?.totalVolumeKg != null ? s.totalVolumeKg / 1000 : working.reduce((n, l) => n + getVolumeLoadKg(l) * (Number(l.reps) || 1), 0) / 1000;
                const d = el('details', 'session-item');
                const sum = el('summary');
                const head = el('span', 'session-head');
                head.append(el('b', '', it.name), el('small', '', friendlyDate(it.date)));
                const stats = el('span', 'session-stats');
                if (mins) stats.append(el('span', '', mins + ' د'));
                stats.append(el('span', '', working.length + ' جولة'), el('span', '', tons.toFixed(2) + ' طن'));
                if (s?.totalEstimatedCalories) stats.append(el('span', '', Math.round(s.totalEstimatedCalories) + ' سعرة'));
                sum.append(head, stats);
                d.appendChild(sum);
                const body = el('div', 'session-body');
                const byEx = new Map();
                for (const l of it.logs.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))) { if (!byEx.has(l.exerciseId)) byEx.set(l.exerciseId, []); byEx.get(l.exerciseId).push(l); }
                for (const [, logs] of byEx) {
                    const line = el('div', 'session-ex');
                    line.appendChild(el('span', 'session-ex-name', shortName(logs[0].exerciseName)));
                    line.appendChild(el('span', 'session-sets num-led', logs.map(l => l.type !== 'weights' ? `${l.duration} د` : (l.setType === 'warmup' ? '(' : '') + setLabel(l).replace(' كجم', '').replace(' باوند', 'lb').replace('وزن الجسم', 'BW').replace(' ثانية', 'ث') + (l.setType === 'warmup' ? ')' : '')).join('  ·  ')));
                    body.appendChild(line);
                }
                d.appendChild(body);
                box.appendChild(d);
            }
            document.getElementById('btn-more-sessions').classList.toggle('hidden', items.length <= sessionsLimit);
        }

        function lineChart(points, { unit, label }) {
            const NS = 'http://www.w3.org/2000/svg';
            const W = 600, H = 200, L = 46, R = 16, T = 16, B = 34;
            const vals = points.map(p => p.v), lo = Math.min(...vals), hi = Math.max(...vals);
            const pad = Math.max(1, (hi - lo) * 0.25);
            const min = Math.floor(lo - pad), max = Math.ceil(hi + pad);
            const x = i => L + (W - L - R) * (points.length === 1 ? 0.5 : i / (points.length - 1));
            const y = v => H - B - (H - T - B) * (v - min) / (max - min);
            const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
            const add = (n, a, t) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (t !== undefined) e.textContent = t; svg.appendChild(e); return e; };
            for (let i = 0; i <= 3; i++) { const v = min + (max - min) * i / 3; add('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }); add('text', { x: L - 8, y: y(v) + 5, 'text-anchor': 'end', class: 'tick' }, fmt1(v)); }
            add('polyline', { points: points.map((p, i) => `${x(i)},${y(p.v)}`).join(' '), class: 'line' });
            points.forEach((p, i) => { const c = add('circle', { cx: x(i), cy: y(p.v), r: i === points.length - 1 ? 5 : 3, class: i === points.length - 1 ? 'dot last' : 'dot' }); const t = document.createElementNS(NS, 'title'); t.textContent = `${p.d}: ${fmt1(p.v)} ${unit}`; c.appendChild(t); });
            add('text', { x: L, y: H - 10, class: 'tick' }, points[0].d);
            if (points.length > 1) add('text', { x: W - R, y: H - 10, 'text-anchor': 'end', class: 'tick' }, points[points.length - 1].d);
            return svg;
        }
        function renderBodyChart() {
            const box = document.getElementById('body-chart');
            if (!box) return;
            const h = (state.profile.history || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
            box.replaceChildren();
            const series = [['weight', 'الوزن', 'كجم'], ['waist', 'محيط الخصر', 'سم']];
            let drawn = 0;
            for (const [k, label, unit] of series) {
                const pts = h.filter(x => Number(x[k]) > 0).map(x => ({ d: x.date, v: Number(x[k]) }));
                if (!pts.length) continue;
                drawn++;
                const first = pts[0].v, last = pts[pts.length - 1].v, diff = Math.round((last - first) * 10) / 10;
                const head = el('div', 'body-head');
                head.append(el('span', '', label), el('b', 'num-led', `${fmt1(last)} ${unit}`), el('small', diff === 0 ? '' : diff > 0 ? 'up' : 'down', pts.length > 1 ? `${diff > 0 ? '+' : ''}${diff} من ${pts[0].d}` : 'قياس واحد'));
                box.append(head, lineChart(pts, { unit, label }));
            }
            if (!drawn) box.appendChild(el('p', 'field-hint', 'احفظ وزنك (ومحيط خصرك لو تبي) من فوق، وكل يوم تحفظ فيه يصير نقطة في الرسم.'));
        }


        /* ---------- v10.9: سحب الجولة (يمين = تعديل، يسار = حذف مع تراجع 6 ثواني) ----------
         * منع الأخطاء: السحب ما يبدأ إلا إذا كانت الحركة أفقية واضحة (أكثر من 14px وضعف الحركة العمودية)،
         * وما يتنفذ إلا إذا تعدى 40% من عرض الجولة. الحذف ما ينكتب في التخزين إلا بعد 6 ثواني، وتقدر تتراجع قبلها.
         */
        const pendingDeletes = new Map(); // logId -> timer
        const UNDO_MS = 6000;
        function undoBar() { return document.getElementById('undo-bar'); }
        function showUndo(logId, label) {
            const bar = undoBar(); if (!bar) return;
            bar.querySelector('#undo-text').textContent = 'انحذفت: ' + label;
            bar.dataset.logId = logId;
            const meter = bar.querySelector('#undo-meter');
            meter.style.transition = 'none'; meter.style.transform = 'scaleX(1)';
            bar.classList.remove('hidden');
            requestAnimationFrame(() => requestAnimationFrame(() => { meter.style.transition = `transform ${UNDO_MS}ms linear`; meter.style.transform = 'scaleX(0)'; }));
        }
        function hideUndo(logId) { const bar = undoBar(); if (bar && (!logId || bar.dataset.logId === logId)) bar.classList.add('hidden'); }
        function swipeDelete(logId) {
            const log = state.logs.find(l => l.id === logId);
            if (!log || pendingDeletes.has(logId)) return;
            const timer = setTimeout(() => commitDelete(logId), UNDO_MS);
            pendingDeletes.set(logId, timer);
            renderTodayLogs();
            haptic('long');
            showUndo(logId, `${shortName(log.exerciseName)} · ${log.type === 'weights' ? setLabel(log) : log.duration + ' دقيقة'}`);
        }
        function undoDelete() {
            const logId = undoBar()?.dataset.logId;
            if (!logId || !pendingDeletes.has(logId)) return;
            clearTimeout(pendingDeletes.get(logId));
            pendingDeletes.delete(logId);
            hideUndo(logId);
            renderTodayLogs();
            haptic('tap');
            showToast('رجعت الجولة');
        }
        function commitDelete(logId) {
            if (!pendingDeletes.has(logId)) return;
            if (saving) { pendingDeletes.set(logId, setTimeout(() => commitDelete(logId), 400)); return; }
            pendingDeletes.delete(logId);
            hideUndo(logId);
            runMutation(async () => {
                const deletedLog = state.logs.find(l => l.id === logId);
                if (!deletedLog) return;
                state.logs = state.logs.filter(l => l.id !== logId);
                if (deletedLog.sessionId) await refreshCompletedSessionSummary(deletedLog.sessionId);
                await GymStorage.save(state);
                renderTodayLogs(); updateTopHeaderStats();
                if (!document.getElementById('screen-progress').classList.contains('hidden')) initProgressScreen();
            });
        }
        function flushPendingDeletes() { for (const id of [...pendingDeletes.keys()]) { clearTimeout(pendingDeletes.get(id)); commitDelete(id); } }

        function initSwipe() {
            const list = document.getElementById('today-logs-container');
            if (!list || !window.PointerEvent) return;
            let g = null;
            const armedAt = w => Math.max(96, w * 0.4);
            const reset = (row, animate) => { if (!row) return; row.style.transition = animate ? 'transform .18s ease-out' : 'none'; row.style.transform = ''; row.classList.remove('swipe-edit', 'swipe-delete'); setTimeout(() => row.classList.remove('swiping'), 50); };
            list.addEventListener('pointerdown', e => {
                if (e.button !== 0 || saving) return;
                const row = e.target.closest('.log-row');
                if (!row || e.target.closest('button,a,input,select')) return;
                g = { row, id: row.dataset.logId, x: e.clientX, y: e.clientY, dx: 0, locked: false, pointer: e.pointerId, w: row.getBoundingClientRect().width };
            });
            list.addEventListener('pointermove', e => {
                if (!g || e.pointerId !== g.pointer) return;
                const dx = e.clientX - g.x, dy = e.clientY - g.y;
                if (!g.locked) {
                    if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { g = null; return; } // تمرير عمودي: نترك الصفحة تتحرك
                    if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 2) return;
                    g.locked = true; g.row.classList.add('swiping');
                    try { g.row.setPointerCapture(g.pointer); } catch {}
                }
                e.preventDefault();
                const limit = g.w * 0.6, a = Math.abs(dx);
                const eased = Math.sign(dx) * (a <= limit ? a : limit + (a - limit) * 0.25);
                g.dx = dx;
                g.row.style.transition = 'none';
                g.row.style.transform = `translateX(${eased}px)`;
                const armed = a >= armedAt(g.w);
                g.row.classList.toggle('swipe-edit', dx > 0 && armed);
                g.row.classList.toggle('swipe-delete', dx < 0 && armed);
            }, { passive: false });
            const end = e => {
                if (!g || e.pointerId !== g.pointer) return;
                const { row, id, dx, locked, w } = g; g = null;
                if (!locked) return;
                const armed = Math.abs(dx) >= armedAt(w);
                if (armed && dx < 0) { row.style.transition = 'transform .15s ease-in'; row.style.transform = `translateX(${-w}px)`; setTimeout(() => swipeDelete(id), 150); return; }
                reset(row, true);
                if (armed && dx > 0) openEditLog(id);
            };
            list.addEventListener('pointerup', end);
            list.addEventListener('pointercancel', e => { if (g && e.pointerId === g.pointer) { reset(g.row, true); g = null; } });
            // نقرة بعد سحب ما تنحسب ضغطة
            list.addEventListener('click', e => { if (e.target.closest('.log-row.swiping')) { e.stopPropagation(); e.preventDefault(); } }, true);
        }


        /* ---------- v11: الثيمات (الأقراص · الدفتر · الساعة) ----------
         * الثيم يغيّر الشكل وترتيب العرض بس. البيانات والحسابات نفسها في كل الثيمات.
         */
        const THEMES = ['plates', 'logbook', 'clock'];
        const lightQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
        function currentTheme() {
            const t = state.profile.theme || 'plates';
            if (t === 'auto') return lightQuery && lightQuery.matches ? 'logbook' : 'plates';
            return THEMES.includes(t) ? t : 'plates';
        }
        function applyTheme() {
            const t = currentTheme(), root = document.documentElement;
            if (t === 'plates') delete root.dataset.theme; else root.dataset.theme = t;
            try { localStorage.setItem('gym_theme', t); } catch {}
            const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || '#121212';
            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
            try { nativeHooks().setBars?.(bg, t === 'logbook')?.catch?.(() => {}); } catch {}
            renderThemePicker();
            renderTodayLogs();
            if (!document.getElementById('screen-progress').classList.contains('hidden')) initProgressScreen();
            renderEquipVisual();
            tickClockBar();
        }
        function renderThemePicker() {
            const pick = state.profile.theme || 'plates';
            document.querySelectorAll('[data-theme-pick]').forEach(b => { const on = b.dataset.themePick === pick; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
        }
        async function saveTheme(t) {
            state.profile = { ...state.profile, theme: t };
            await GymStorage.save(state);
            applyTheme();
            haptic('confirm');
        }
        lightQuery?.addEventListener?.('change', () => { if (state.profile.theme === 'auto') applyTheme(); });

        /* ---------- v11.1: اللغة (العربية / English) ----------
         * الترجمة نفسها في i18n.js و en.js. هنا بس الاختيار: ينحفظ في البروفايل (عشان ينتقل مع النسخة الاحتياطية)
         * وفي الجهاز، وبعدها تنفتح الصفحة من جديد باللغة الجديدة واتجاهها. */
        function renderLangPicker() {
            const pl = document.getElementById('privacy-link'); if (pl) pl.href = './privacy.html#' + GymI18n.lang;
            document.querySelectorAll('[data-lang-pick]').forEach(b => { const on = b.dataset.langPick === GymI18n.lang; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
        }
        async function saveLang(lang) {
            if (lang === GymI18n.lang) return;
            state.profile = { ...state.profile, lang };
            await GymStorage.save(state);
            if (!GymI18n.setLang(lang)) { showToast(lang === 'en' ? 'Could not save the language on this device' : 'ما قدرت أحفظ اللغة على هذا الجهاز'); return; }
            haptic('confirm');
            location.reload();
        }
        // a backup restored on a new phone carries the language with it
        function syncLangFromProfile() {
            const want = state.profile.lang;
            if ((want === 'ar' || want === 'en') && want !== GymI18n.lang && !GymI18n.stored() && GymI18n.setLang(want)) { location.reload(); return true; }
            return false;
        }

        // الساعة: شريط المؤقتات فوق
        let clockTimer = null;
        function tickClockBar() {
            const on = currentTheme() === 'clock';
            clearInterval(clockTimer);
            if (!on) return;
            const draw = () => {
                const s = getActiveSession();
                const sec = s ? Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000)) : 0;
                const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), ss = sec % 60;
                document.getElementById('cb-session').textContent = s ? (h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`) : '0:00';
                document.getElementById('cb-session').classList.toggle('off', !s);
                document.getElementById('cb-session').classList.toggle('long', h > 0);
                const left = restDeadline ? Math.max(0, Math.ceil((restDeadline.endsAt - Date.now()) / 1000)) : 0;
                document.getElementById('cb-rest').textContent = left ? formatRest(left) : '0:00';
                document.getElementById('cb-rest').classList.toggle('off', !left);
                ['cb-minus', 'cb-plus', 'cb-stop'].forEach(id => { document.getElementById(id).disabled = !left; });
            };
            draw();
            clockTimer = setInterval(draw, 500);
        }

        // الدفتر: الجولات صف تحت صف لكل تمرين
        function logbookCell(log) {
            if (log.type !== 'weights') return { w: `${log.duration}د`, r: log.type === 'treadmill' ? `${log.speed}كم` : ({ light: 'خفيفة', moderate: 'متوسطة', vigorous: 'عالية' }[log.intensity] || '—'), rir: '—' };
            const u = log.unit === 'lbs' ? 'lb' : '';
            const w = log.displayWeight ?? getCanonicalWeightKg(log);
            const weight = log.loadMode === 'timed' ? `${Number(log.durationSeconds) || 0}ث`
                : log.loadMode === 'bodyweight' ? 'BW'
                : log.loadMode === 'added' ? `BW+${w}${u}`
                : log.loadMode === 'assisted' ? `BW−${w}${u}`
                : log.loadMode === 'per_hand' ? `${w}${u}×2`
                : `${w}${u}`;
            return { w: weight, r: log.loadMode === 'timed' ? '—' : String(log.reps), rir: log.rir == null ? '—' : log.rir === 4 ? '4+' : String(log.rir) };
        }
        function renderLogbook(container, logs) {
            const groups = new Map();
            for (const l of logs.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))) { if (!groups.has(l.exerciseId)) groups.set(l.exerciseId, []); groups.get(l.exerciseId).push(l); }
            const frag = document.createDocumentFragment();
            for (const [, list] of groups) {
                const sec = document.createElement('section'); sec.className = 'lb-group';
                const h = document.createElement('h4'); h.className = 'lb-title'; h.textContent = shortName(list[0].exerciseName);
                const n = document.createElement('small'); n.textContent = list.length === 1 ? 'جولة واحدة' : `${list.length} جولات`; h.appendChild(n);
                const head = document.createElement('div'); head.className = 'lb-row lb-head'; head.setAttribute('aria-hidden', 'true');
                head.innerHTML = list[0].type === 'weights' ? '<span>#</span><span>الوزن</span><span>العدات</span><span>RIR</span><span>النوع</span><span></span>' : '<span>#</span><span>المدة</span><span>السرعة/الشدة</span><span></span><span></span><span></span>';
                sec.append(h, head);
                list.forEach((log, i) => {
                    const c = logbookCell(log);
                    const row = document.createElement('div');
                    row.className = 'lb-row log-row' + (log.setType === 'warmup' ? ' warm' : '');
                    row.dataset.logId = log.id;
                    const type = log.type === 'weights' ? (SET_LABELS[log.setType] || SET_LABELS.normal) : '';
                    row.innerHTML = `<span class="lb-n">${i + 1}</span><span class="lb-w">${escapeHTML(c.w)}</span><span class="lb-r">${escapeHTML(c.r)}</span><span class="lb-rir">${escapeHTML(c.rir)}</span><span class="lb-t">${escapeHTML(type)}</span><span class="lb-act"><button data-action="edit-log" data-id="${escapeHTML(log.id)}" aria-label="تعديل التسجيل"><i class="fa-solid fa-pen"></i></button><button data-action="delete-log" data-id="${escapeHTML(log.id)}" aria-label="حذف التسجيل"><i class="fa-solid fa-trash-can"></i></button></span>`;
                    sec.appendChild(row);
                });
                frag.appendChild(sec);
            }
            container.replaceChildren(frag);
        }

        // الساعة: أعمدة LED للتطور
        function renderLedColumns(points, unit) {
            const box = document.getElementById('led-columns');
            if (!box) return;
            box.replaceChildren();
            if (currentTheme() !== 'clock' || !points.length) return;
            const max = Math.max(...points.map(p => p.value)) || 1;
            const SEG = 16;
            const last = points.slice(-10);
            for (const p of last) {
                const col = document.createElement('div'); col.className = 'led-col' + (p.value === max ? ' best' : '');
                const v = document.createElement('b'); v.textContent = fmt1(p.value);
                const stack = document.createElement('div'); stack.className = 'led-stack';
                const lit = Math.max(1, Math.round(p.value / max * SEG));
                for (let i = 0; i < SEG; i++) { const seg = document.createElement('i'); if (i < lit) seg.className = 'lit'; stack.appendChild(seg); }
                const d = document.createElement('small'); d.textContent = p.label.slice(5).replace('-', '/');
                col.append(v, stack, d);
                col.title = `${p.label}: ${fmt1(p.value)} ${unit}`;
                box.appendChild(col);
            }
        }

        window.GymApp = Object.freeze({ buildBackup, importBackupText, showToast, logCount: () => state.logs.length, version: '11.0' });

        window.addEventListener('DOMContentLoaded', async () => {
            registerServiceWorker();
            if(!document.getElementById('previous-set-picker')){
                const notice=document.createElement('div');notice.setAttribute('role','status');notice.style.cssText='padding:12px;background:#78350f;color:white;text-align:center';
                notice.textContent='ملفات الموقع غير متوافقة. ارفع index.html مع باقي ملفات التحديث ثم أغلق التطبيق وافتحه. سجلك محفوظ.';document.body.prepend(notice);
            }
            try { await loadStateFromDB(); } catch(error) { document.getElementById('db-status-badge').textContent=error.message; return; }
            initEventListeners();updateSetHelp();
            document.getElementById('logs-date-filter').value = getLocalDateString();
            renderCategoryTabs();
            renderExerciseDropdown();
            renderTodayLogs();
            updateTopHeaderStats();
            renderProfileUI();
            updateWeightConvertedDisplay();
            update1RMLiveDisplay();
            updateSessionUI();
            restoreRestTimer();
            applyTheme();
            if (syncLangFromProfile()) return;
            document.dispatchEvent(new CustomEvent('gym:ready'));
        });

    })();
