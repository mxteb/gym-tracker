/*
 * Gym Tracker — صور التقدم (v11.5، C4).
 * الصور خاصة: تنحفظ في قاعدة بيانات لحالها في الجهاز (gym_photos)، وما تدخل في النسخة الاحتياطية ولا تطلع لأي مكان.
 * كل صورة تتصغر قبل الحفظ (أطول ضلع 1280px، JPEG) عشان ما تاكل مساحة الجوال.
 * اضغط صورة = تكبرها. اضغط صورتين = تقارنهم جنب بعض.
 */
(function () {
  'use strict';
  var DB = 'gym_photos', STORE = 'photos', MAX = 1280, LIMIT = 200;
  var dbPromise = null;
  var urls = [];
  var selected = [];
  var T = function (s) { return window.GymI18n ? GymI18n.t(s) : s; };
  var toast = function (s) { document.dispatchEvent(new CustomEvent('gym:toast', { detail: s })); };

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(Error('التخزين غير متاح في هذا المتصفح')); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || Error('تعذر فتح تخزين الصور')); };
    });
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }
  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode), store = tx.objectStore(STORE), out;
        var r = fn(store);
        if (r) r.onsuccess = function () { out = r.result; };
        tx.oncomplete = function () { resolve(out); };
        tx.onerror = tx.onabort = function () { reject(tx.error || Error('تعذر حفظ الصورة')); };
      });
    });
  }
  function all() { return run('readonly', function (s) { return s.getAll(); }).then(function (list) { return (list || []).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt; }); }); }

  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(Error('الملف مو صورة يقدر التطبيق يقراها')); };
      img.src = url;
    });
  }
  async function shrink(file) {
    var loaded = await loadImage(file);
    try {
      var img = loaded.img, scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.85); });
      if (!blob) throw Error('تعذر تجهيز الصورة');
      // a small copy for the grid, so 100 photos don't load 100 full images
      var ts = Math.min(1, 320 / Math.max(w, h)), t = document.createElement('canvas');
      t.width = Math.max(1, Math.round(w * ts)); t.height = Math.max(1, Math.round(h * ts));
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      var thumb = await new Promise(function (res) { t.toBlob(res, 'image/jpeg', 0.8); });
      return { blob: blob, thumb: thumb || blob, w: w, h: h };
    } finally { URL.revokeObjectURL(loaded.url); }
  }

  async function add(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || 'image/')) throw Error('اختر صورة (JPG أو PNG)');
    if (file.size > 30 * 1024 * 1024) throw Error('الصورة كبيرة جدًا؛ الحد 30 ميجابايت');
    var count = (await all()).length;
    if (count >= LIMIT) throw Error('وصلت ' + LIMIT + ' صورة. احذف صور قديمة عشان تضيف جديدة');
    var s = await shrink(file);
    var id = 'photo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await run('readwrite', function (st) { return st.put({ id: id, date: today(), createdAt: Date.now(), blob: s.blob, thumb: s.thumb, w: s.w, h: s.h }); });
    selected = [id];
    await render();
    toast('انحفظت الصورة في جوالك بس');
  }
  async function remove(id) {
    await run('readwrite', function (st) { return st.delete(id); });
    selected = selected.filter(function (x) { return x !== id; });
    await render();
    toast('انحذفت الصورة');
  }
  async function wipe() {
    selected = [];
    try { await run('readwrite', function (st) { return st.clear(); }); } catch (e) { /* nothing stored yet */ }
    await render();
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function urlFor(p, small) { var u = URL.createObjectURL(small && p.thumb ? p.thumb : p.blob); urls.push(u); return u; }
  function daysBetween(a, b) { return Math.round(Math.abs(Date.parse(a + 'T12:00:00') - Date.parse(b + 'T12:00:00')) / 86400000); }

  async function render() {
    var grid = document.getElementById('photo-grid'), view = document.getElementById('photo-view');
    if (!grid || !view) return;
    urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = [];
    var list;
    try { list = await all(); } catch (e) { grid.replaceChildren(el('p', 'field-hint', T(e.message))); return; }
    selected = selected.filter(function (id) { return list.some(function (p) { return p.id === id; }); });
    grid.replaceChildren();
    document.getElementById('photo-empty').classList.toggle('hidden', list.length > 0);
    list.forEach(function (p) {
      var b = el('button', 'photo-thumb'); b.type = 'button'; b.dataset.id = p.id;
      var i = selected.indexOf(p.id);
      b.setAttribute('aria-pressed', String(i >= 0));
      b.setAttribute('aria-label', T('صورة') + ' ' + p.date);
      var img = el('img'); img.src = urlFor(p, true); img.alt = ''; img.decoding = 'async';
      var d = el('span', 'photo-date', p.date);
      b.append(img, d);
      if (i >= 0) b.appendChild(el('b', 'photo-pick', String(i + 1)));
      grid.appendChild(b);
    });
    view.replaceChildren();
    var picked = selected.map(function (id) { return list.find(function (p) { return p.id === id; }); }).filter(Boolean)
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt; });
    view.classList.toggle('hidden', !picked.length);
    if (!picked.length) return;
    var row = el('div', 'photo-row' + (picked.length === 2 ? ' two' : ''));
    picked.forEach(function (p) {
      var fig = el('figure', 'photo-fig');
      var img = el('img'); img.src = urlFor(p); img.alt = T('صورة') + ' ' + p.date;
      var cap = el('figcaption');
      cap.appendChild(el('span', null, p.date));
      var del = el('button', 'photo-del', T('حذف')); del.type = 'button'; del.dataset.del = p.id;
      cap.appendChild(del);
      fig.append(img, cap);
      row.appendChild(fig);
    });
    view.appendChild(row);
    view.appendChild(el('p', 'field-hint', picked.length === 2
      ? T(daysBetween(picked[0].date, picked[1].date) + ' يوم بين الصورتين. صوّر بنفس المكان والإضاءة عشان المقارنة تكون عادلة.')
      : T('اختر صورة ثانية عشان تقارنهم جنب بعض.')));
  }

  function confirmDelete(id) {
    var ui = window.__gymConfirm;
    if (ui) ui({ title: 'حذف الصورة', message: 'الصورة تنحذف من جوالك نهائيًا، وما ترجع.', confirmText: 'حذف', cancelText: 'إلغاء', onConfirm: function () { return remove(id); } });
    else if (window.confirm(T('حذف الصورة نهائيًا؟'))) remove(id).catch(function (e) { toast(e.message); });
  }

  function init() {
    var input = document.getElementById('photo-input'), grid = document.getElementById('photo-grid'), view = document.getElementById('photo-view');
    if (!input || !grid || !view) return;
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.value = '';
      add(f).catch(function (e) { toast(e && e.message ? e.message : 'تعذر حفظ الصورة'); });
    });
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('.photo-thumb'); if (!b) return;
      var id = b.dataset.id, i = selected.indexOf(id);
      if (i >= 0) selected.splice(i, 1);
      else { selected.push(id); if (selected.length > 2) selected.shift(); }
      render();
    });
    view.addEventListener('click', function (e) { var d = e.target.closest('[data-del]'); if (d) confirmDelete(d.dataset.del); });
    render();
  }

  window.GymPhotos = { add: add, remove: remove, wipe: wipe, render: render, all: all };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
