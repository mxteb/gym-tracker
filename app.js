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
            showToast(`بدأت ${session.name} 💪`);
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
            showModal({
                title: `ملخص ${session.name} ✅`,
                message: `المدة: ${durationLabel} دقيقة | الجولات الفعلية: ${workingLogs.length} | الحجم الفعلي: ${(session.totalVolumeKg / 1000).toFixed(2)} طن | متوسط RIR: ${avgRir} | أعلى 1RM مسجل بين التمارين: ${bestOneRm} | السعرات التقديرية للحديد والكارديو: ${session.totalEstimatedCalories}`,
                confirmText: 'تم', cancelText: 'إغلاق'
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
            showToast(`تم تحميل ${Object.keys(grouped).length} تمارين من الجلسة السابقة 📋`);
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
                meta.textContent = `بدأت ${new Date(session.startedAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`;
                startBtn.disabled = true;
                finishBtn.disabled = false;
                clearInterval(sessionTimerInterval);
                const tick = () => {
                    const seconds = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
                    document.getElementById('active-session-timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
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
            }
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
            showToast('تم عرض قائمة التمارين الجاهزة ⚡');
        }

        function resetRoutineFilter() {
            activePresetFilterIds = null;currentFilterCat='all';
            document.getElementById('exercise-search-input').value='';renderCategoryTabs();
            setEquipFilter('all',document.querySelector('[data-equip="all"]'));
            showToast('تم إظهار جميع التمارين 🎯');
        }

        function renderCategoryTabs() {
            const container = document.getElementById('category-tabs-container');
            const fragment = document.createDocumentFragment();

            const categories = currentSplit === 'ppl' ? [
                { id: 'all', label: 'الكل 🎯' },
                { id: 'push', label: 'دفع 🏋️' },
                { id: 'pull', label: 'سحب 🧗' },
                { id: 'legs', label: 'أرجل 🦵' },
                { id: 'abs', label: 'بطن 🧱' },
                { id: 'cardio', label: 'كارديو 🏃' }
            ] : [
                { id: 'all', label: 'الكل 🎯' },
                { id: 'upper', label: 'علوي (Upper 🦾)' },
                { id: 'lower', label: 'سفلي (Lower 🦵)' },
                { id: 'cardio', label: 'كارديو 🏃' }
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
                return;
            }

            equipBadge.textContent = EQUIP_NAMES[ex.equip] || 'أوزان حرة 🏋️‍♂️';

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

            if (ex.type === 'weights') formWeights.classList.remove('hidden');
            else if (ex.type === 'treadmill') formTm.classList.remove('hidden');
            else if (ex.type === 'bike_elliptical') formBe.classList.remove('hidden');
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
                span.textContent = get1RMLabel(weightInKg, reps);
            }
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
            if (firstWorkingSet.unit && firstWorkingSet.unit !== activeWeightUnit) {
                setWeightUnit(firstWorkingSet.unit);
            }
            const wVal = firstWorkingSet.displayWeight ?? getCanonicalWeightKg(firstWorkingSet);
            document.getElementById('input-weight').value = wVal;
            document.getElementById('input-reps').value = firstWorkingSet.reps;
            document.getElementById('val-reps-display').textContent = firstWorkingSet.reps;
            if (firstWorkingSet.loadMode) setLoadMode(firstWorkingSet.loadMode);
            if (firstWorkingSet.loadMode === 'timed') document.getElementById('input-duration-sec').value = firstWorkingSet.durationSeconds || 60;
            const previousType=firstWorkingSet.setType==='drop'?'dropset':firstWorkingSet.setType==='failure'?'normal':firstWorkingSet.setType||'normal';
            setSetType(previousType,document.querySelector('[data-settype="'+previousType+'"]'));
            if (firstWorkingSet.rir == null || !Number.isInteger(Number(firstWorkingSet.rir))) setRIR('', document.querySelector('[data-rir=""]'));
            if (firstWorkingSet.rir != null && Number.isInteger(Number(firstWorkingSet.rir))) {
                const rirBtn = document.querySelector(`.rir-btn[data-rir="${firstWorkingSet.rir}"]`);
                setRIR(String(firstWorkingSet.rir), rirBtn);
            }

            updateWeightConvertedDisplay();
            update1RMLiveDisplay();
            showToast('تمت تعبئة الجولة المختارة؛ اضغط حفظ بعد أدائها 📋');
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
        }

        async function saveSet() {
            const dropdown = document.getElementById('exercise-dropdown');
            const exId = dropdown.value;
            const ex = state.exercises.find(e => e.id === exId);
            if (!ex) return;

            const rawWeight = ['bodyweight','timed'].includes(activeLoadMode)?0:readField('input-weight','الوزن',0,activeWeightUnit==='lbs'?2204.62:1000);
            const reps = activeLoadMode === 'timed' ? 1 : readField('input-reps','العدات',1,150,{integer:true});
            const durationSeconds = activeLoadMode === 'timed' ? readField('input-duration-sec','المدة بالثواني',1,3600) : null;
            let weightInKg = activeLoadMode === 'timed' ? 0 : activeWeightUnit === 'lbs' ? rawWeight / 2.20462 : rawWeight;
            const bodyWeightKg = parseFloat(state.profile.weight) || 0;
            if (['bodyweight', 'added', 'assisted'].includes(activeLoadMode) && !bodyWeightKg) {
                showToast('أدخل وزن جسمك في البروفايل أولًا لهذا النوع من التمارين');
                return;
            }
            const session = await ensureActiveSession();
            let effectiveLoadKg = weightInKg;
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
                oneRepMax,
                rir: activeRIR,
                setType: activeSetType,
                loadMode: activeLoadMode,
                bodyWeightKgAtLog: bodyWeightKg || null,
                effectiveLoadKg,
                volumeLoadKg,
                durationSeconds,
                calories,
                calculationVersion: 'v10-session'
            };

            Object.assign(logEntry,GymData.validateLog(logEntry));
            state.logs.push(logEntry);
            await dbSaveAll('logs', state.logs);

            renderTodayLogs();
            updateTopHeaderStats();
            updateLastPerformanceDisplay(ex.id);
            showToast(activeLoadMode === 'timed' ? `تم حفظ ${durationSeconds} ثانية ✔️` : `تم حفظ الجولة (${rawWeight} ${activeWeightUnit === 'lbs' ? 'باوند' : 'كجم'}) ✔️`);

            document.getElementById('logs-date-filter').value = getLocalDateString();
            renderTodayLogs();
            const customRestSecs = Number(document.getElementById('rest-timer-duration').value);
            if(customRestSecs>0)startRestTimer(customRestSecs, ex.name);else stopRestTimer();
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
            showToast('تم حفظ تمرين الكارديو 🏃');
        }

        function deleteLogItem(logId) {
            showModal({
                title: 'حذف الجولة 🗑️',
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
                    if(!Number.isInteger(log.reps))log.legacyFractionalReps=true;else delete log.legacyFractionalReps;
                    if(['bodyweight','added','assisted'].includes(log.loadMode))log.bodyWeightKgAtLog=readField('edit-log-body','وزن الجسم وقت الجولة',20,350);
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
            const todayLogs = state.logs.filter(l => l.date === selectedDate).sort((a,b) => (b.timestamp||0)-(a.timestamp||0));

            document.getElementById('today-sets-count').textContent = todayLogs.length===1?'جولة واحدة':`${todayLogs.length} جولات`;

            if (todayLogs.length === 0) {
                container.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs glass-card border border-slate-800">لا توجد جولات مسجلة في هذا التاريخ. 💪</div>`;
                loadMoreWrapper.classList.add('hidden');
                return;
            }

            const visibleLogs = todayLogs.slice(0, logsRenderLimit);
            loadMoreWrapper.classList.toggle('hidden', todayLogs.length <= logsRenderLimit);

            const fragment = document.createDocumentFragment();
            visibleLogs.forEach(log => {
                const item = document.createElement('div');
                item.className = 'glass-card p-3 flex justify-between items-center border border-slate-800 hover:border-slate-700 transition';
                
                let detailText = '';
                if (log.type === 'weights') {
                    const unitLabel = log.unit === 'lbs' ? 'باوند' : 'كجم';
                    const printWeight = log.displayWeight ?? getCanonicalWeightKg(log);
                    const loadLabel = log.loadMode === 'per_hand' ? ' لكل يد' : log.loadMode === 'assisted' ? ' مساعدة' : log.loadMode === 'added' ? ' إضافي' : '';
                    if (log.loadMode === 'timed') detailText = `<span class="font-bold text-cyan-300">${escapeHTML(String(log.durationSeconds || 0))} ثانية</span>`;
                    else detailText = `<span class="font-bold text-cyan-300">${log.loadMode==='bodyweight'?'وزن الجسم ('+escapeHTML(String(log.bodyWeightKgAtLog??log.effectiveLoadKg??'—'))+' كجم)':escapeHTML(String(printWeight))+' '+unitLabel+loadLabel}</span> × <span class="font-bold text-cyan-300">${escapeHTML(String(log.reps))} عدات</span> <span class="text-[10px] text-emerald-400 font-bold">[1RM: ${escapeHTML(get1RMLabel(getProgressWeightKg(log), log.reps))}]</span>`;
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
                            <div class="text-[10px] font-black text-amber-400">${log.type === 'weights' && ['v9-session','v10-session'].includes(log.calculationVersion) ? 'سعرات ضمن الجلسة' : `${escapeHTML(String(log.calories || 0))}🔥 تقديري`}</div>
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
        }

        function startRestTimer(seconds, exName = '') {
            stopRestTimer();
            restDeadline = {endsAt: Date.now() + seconds * 1000, name: exName};
            try { localStorage.setItem('gym_rest_deadline', JSON.stringify(restDeadline)); } catch { showToast('المؤقت يعمل؛ تعذر حفظه لإعادة فتح الصفحة'); }
            restoreRestTimer();
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
                    showToast('انتهى وقت الراحة! حان وقت الجولة التالية 🏋️');
                    return false;
                }
                document.getElementById('rest-timer-widget').classList.remove('hidden');
                document.getElementById('timer-display').textContent = remaining + 's';
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
                statusEl.innerHTML = `<i class="fa-solid fa-bolt text-cyan-400"></i> تم تصنيف التمرين تلقائياً بنجاح ⚡`;
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
                showToast('يرجى إدخال اسم التمرين أولاً ⚠️');
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
            showToast('تمت إضافة التمرين المخصص بنجاح! 🎉');
        }

        function deleteExercise(exId) {
            showModal({
                title: 'حذف تمرين مخصص ⚠️',
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
                container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs glass-card border border-slate-800">لم تقم بإضافة أي تمارين مخصصة بعد. قم بإضافة تمارينك الخاصة أعلاه! 💡</div>`;
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
            container.innerHTML=groups.map((row,i)=>{
                const prev=groups[i-1];let delta='البداية';
                if(prev){const d=Math.round((row.weight-prev.weight)*10)/10;const r=row.reps-prev.reps;delta=`${d>0?'+':''}${d} ${unit}`+(mode==='timed'?'':` | ${r>0?'+':''}${r} عدات`);}
                return `<div class="glass-card p-3 text-xs"><div class="text-slate-400">${escapeHTML(row.date)}</div><strong>${Number(row.weight.toFixed(1))} ${unit}${mode==='timed'?'':` × ${row.reps} عدات`}</strong><div class="text-cyan-300">${escapeHTML(delta)}</div>${mode==='timed'?'':`<small>أعلى 1RM تقديري: ${row.oneRm??'غير متاح'} | RIR: ${row.rir??'غير محدد'}</small>`}</div>`;
            }).reverse().join('') || 'لا توجد جولات عمل بهذه الطريقة';
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
            const calContainer = document.getElementById('bento-calories-container');
            const healthContainer = document.getElementById('bento-health-container');
            const compContainer = document.getElementById('bento-comp-container');

            if (!calContainer) return;
            calContainer.innerHTML = ''; healthContainer.innerHTML = ''; compContainer.innerHTML = '';

            const m = GymCalc.bodyMetrics(state.profile);
            if (!m) {
                calContainer.innerHTML = `<div class="col-span-3 glass-card p-4 text-center text-xs text-slate-400">يرجى الانتقال لصفحة "البروفايل" وإدخال الطول والوزن لظهور التحليل الذكي 🧠</div>`;
                return;
            }
            const { tdee, cutLow, cutHigh, bulkLow, bulkHigh, bmi } = m;
            calContainer.innerHTML += createBentoCard('تثبيت الوزن (Maintenance)', tdee.toLocaleString() + '🔥', 'هدف التوازن 🎯', 'bg-cyan-950 text-cyan-300 border-cyan-800', 'text-cyan-300', 'تقدير يومي للمحافظة على الوزن، ويُراجع حسب تغير وزنك الفعلي.');
            calContainer.innerHTML += createBentoCard('نقصان الوزن (Fat Loss)', `${cutHigh.toLocaleString()}–${cutLow.toLocaleString()}🔥`, 'عجز 10–20% 📉', 'bg-emerald-950 text-emerald-300 border-emerald-800', 'text-emerald-300', 'نطاق مبدئي للتنشيف يُعدّل حسب تغير الوزن والأداء، دون ضمان تلقائي لمنع فقدان العضلات.');
            calContainer.innerHTML += createBentoCard('زيادة نظيفة (Lean Bulk)', `${bulkLow.toLocaleString()}–${bulkHigh.toLocaleString()}🔥`, 'فائض 5–10% 📈', 'bg-amber-950 text-amber-300 border-amber-800', 'text-amber-300', 'فائض محافظ كبداية، ثم يُعدّل حسب معدل زيادة الوزن.');

            const bmiStatus = { under: 'أقل من النطاق الطبيعي 🟡', normal: 'ضمن النطاق الطبيعي 🟢', over: 'أعلى من النطاق الطبيعي 🟠', high: 'مرتفع حسب BMI 🔴' }[m.bmiBand];
            healthContainer.innerHTML += createBentoCard('مؤشر الكتلة (BMI)', bmi, bmiStatus, 'bg-emerald-950 text-emerald-300 border-emerald-800', 'text-cyan-300', 'أداة فرز عامة لا تميز بين العضلات والدهون، وقد تضلل لدى لاعبي الحديد.');

            if (m.whtr) {
                const whtr = m.whtr;
                const whtrStatus = { low: 'أقل من 0.5 🟢', watch: 'يستحق المتابعة 🟠', high: 'مرتفع كأداة فرز 🔴' }[m.whtrBand];
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
            showToast(state.profile.isMan ? 'تم اختيار وضع الرجل 💪' : 'تم اختيار وضع الأنثى 🌸');
        }

        function updateGenderUI() {
            const btn = document.getElementById('gender-toggle-btn');
            const icon = document.getElementById('gender-icon');
            const text = document.getElementById('gender-text');
            if (!btn || !icon || !text) return;

            if (state.profile.isMan !== false) {
                btn.classList.add('neon-glow-amber', 'border-amber-500/60');
                icon.textContent = '🔥';
                text.textContent = 'مفعل: خيار الرجل 💪';
                text.className = 'font-bold text-sm text-amber-300';
            } else {
                btn.classList.remove('neon-glow-amber', 'border-amber-500/60');
                icon.textContent = '🌸';
                text.textContent = 'مفعل: خيار الأنثى 🌸';
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
            renderBentoGridAnalysis();renderProfileHistoryList();updateTopHeaderStats();
            showToast('تم حفظ القياسات والبروفايل بنجاح 🎯');
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
                    <span class="text-slate-400 text-[10px]">${escapeHTML(item.date)}</span>
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

        async function exportDataJSON() {
            const logs=state.logs.map(log=>{
                const l={...log};if(l.type==='weights'){
                    if(!Number.isInteger(Number(l.reps)))l.legacyFractionalReps=true;
                    if(l.rir!=null&&!Number.isInteger(Number(l.rir)))l.legacyFractionalRir=true;
                }return l;
            });
            const backup={...state,logs,schemaVersion:DATA_SCHEMA_VERSION,exportDate:new Date().toISOString()};
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
            await runMutation(async()=>{
                const incoming=GymData.validate(JSON.parse(await file.text()));
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
            });
            event.target.value='';
        }

        function confirmClearTodayLogs() {
            showModal({
                title: 'مسح جولات اليوم 🧹',
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
                title: 'إعادة ضبط شاملة 💣',
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

        function showModal({ title, message, confirmText, cancelText, onConfirm }) {
            const modal = document.getElementById('custom-modal');
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-message').textContent = message;
            
            const confirmBtn = document.getElementById('modal-confirm-btn');
            const cancelBtn = document.getElementById('modal-cancel-btn');

            confirmBtn.textContent = confirmText || 'تأكيد';
            cancelBtn.textContent = cancelText || 'إلغاء';

            const previousFocus=document.activeElement;
            const close = () => {modal.classList.add('hidden');previousFocus?.focus();};
            confirmBtn.onclick = () => { close(); if (onConfirm) runMutation(onConfirm); };
            cancelBtn.onclick = close;
            modal.classList.remove('hidden');
            cancelBtn.focus();
        }

        function showToast(msg) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'glass p-3 rounded-xl border border-cyan-500/40 text-xs font-bold text-center text-cyan-200 shadow-2xl animate-fade-in pointer-events-auto';
            toast.textContent = msg;
            container.appendChild(toast);
            setTimeout(() => { toast.remove(); }, 6500);
        }

        function switchTab(tabId) {
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
                if(event.key==='Escape'){if(saving)return;event.preventDefault();if(modal.id==='edit-log-modal')closeEditLog();else if(modal.id==='finish-session-modal')closeFinishSession();else document.getElementById('modal-cancel-btn').click();return;}
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

            document.getElementById('unit-btn-kg').addEventListener('click', () => setWeightUnit('kg'));
            document.getElementById('unit-btn-lbs').addEventListener('click', () => setWeightUnit('lbs'));

            document.getElementById('btn-save-weights').addEventListener('click', () => runMutation(saveSet));
            document.getElementById('btn-save-treadmill').addEventListener('click', () => runMutation(() => saveCardioSet('treadmill')));
            document.getElementById('btn-save-bike').addEventListener('click', () => runMutation(() => saveCardioSet('bike_elliptical')));
            document.getElementById('btn-copy-last-perf').addEventListener('click', () => runMutation(copyLastPerformance));
            document.getElementById('btn-stop-timer').addEventListener('click', stopRestTimer);
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
        });

    })();
