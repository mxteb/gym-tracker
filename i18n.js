/*
 * Gym Tracker — اللغة (العربية / English).
 * يشتغل قبل أي ملف ثاني. في العربي ما يسوي شي: الصفحة نفسها حرف بحرف.
 * في الإنجليزي يقلب اتجاه الصفحة لليسار، ويترجم كل نص يظهر على الشاشة لحظة ما ينكتب
 * (MutationObserver)، فالكود الأصلي يبقى يكتب عربي وما يحتاج يتغير.
 *
 * طريقة البحث عن الترجمة (en.js):
 *  1) النص كامل كما هو.
 *  2) النص بعد ما تتحول أرقامه لـ {0} {1}… (مثل "{0} جولة").
 *  3) أنماط regex للنصوص اللي فيها أسماء أو كلمات متغيرة.
 *  4) "عربي (English)" ← الجزء الإنجليزي (أسماء التمارين).
 *  5) نص مركب بفواصل ( · | — : ، ) ← يترجم كل جزء لحاله.
 * أي نص عربي ما لقى له ترجمة ينحفظ في GymI18n.misses عشان الاختبار يطلعه.
 */
(function () {
  'use strict';
  var KEY = 'gym_lang';
  var AR = /[\u0600-\u06FF]/;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function detect() {
    var s = stored();
    if (s === 'ar' || s === 'en') return s;
    // anyone who already used the app (v11 writes gym_theme on every start) stays in Arabic
    try { if (localStorage.getItem('gym_theme')) return 'ar'; } catch (e) { return 'ar'; }
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'ar';
    return /^ar\b/i.test(nav) ? 'ar' : 'en';
  }
  var lang = detect();
  var root = document.documentElement;
  if (lang === 'en') { root.lang = 'en'; root.dir = 'ltr'; }

  var EN = Object.create(null);
  var PATTERNS = [];
  var LISTS = Object.create(null);
  var WORDS = Object.create(null);
  var misses = Object.create(null);
  // a number, a date or a time; not the "1" in "1RM"
  var NUM = /(?<![A-Za-z])[−+-]?[0-9\u0660-\u0669][0-9\u0660-\u0669.,\u066B\u066C:\/-]*(?![A-Za-z0-9])/g;
  var SEPS = [' | ', ' · ', ' — ', ' – ', '، ', ': ', ' - ', ' + '];

  function latin(s) {
    return String(s).replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/\u066B/g, '.').replace(/\u066C/g, ',');
  }
  function punct(s) { return s.replace(/،/g, ',').replace(/؛/g, ';').replace(/؟/g, '?'); }
  function fill(v, args) {
    if (typeof v === 'function') return v.apply(null, args.map(function (a) { return latin(a); }));
    return String(v).replace(/\{(\d+)\}/g, function (_, i) { return args[i] === undefined ? '' : latin(args[i]); });
  }
  var LAZY = [];
  function lookup(key, depth) {
    if (LAZY.length) LAZY = LAZY.filter(function (fn) { try { return !fn(); } catch (e) { return true; } });
    if (key in EN) return fill(EN[key], []);
    var args = [];
    var tpl = key.replace(NUM, function (x) { args.push(x); return '{' + (args.length - 1) + '}'; });
    if (args.length && tpl in EN) return fill(EN[tpl], args);
    for (var i = 0; i < PATTERNS.length; i++) {
      var m = PATTERNS[i][0].exec(key);
      if (m) {
        var to = PATTERNS[i][1];
        var r0 = typeof to === 'function' ? to.apply(null, m.slice(1).map(function (x) { return x === undefined ? '' : x; })) : key.replace(PATTERNS[i][0], to);
        if (r0 != null && !AR.test(r0)) return r0;
      }
    }
    var paren = /^[^()]*[\u0600-\u06FF][^()]*\(([^()]*[A-Za-z][^()]*)\)\s*$/.exec(key);
    if (paren) return paren[1].trim();
    if ((depth || 0) < 3) {
      for (var j = 0; j < SEPS.length; j++) {
        var sep = SEPS[j];
        if (key.indexOf(sep) < 0) continue;
        var parts = key.split(sep), ok = true;
        var outParts = parts.map(function (p) {
          var t = p.trim();
          if (!AR.test(t)) return latin(p);
          var r = lookup(t, (depth || 0) + 1);
          if (r == null) { ok = false; return p; }
          return p.replace(t, r);
        });
        if (ok) return outParts.join(sep === '، ' ? ', ' : sep);
      }
    }
    // short labels: numbers and unit words only ("60كجم×10", "BW−5كجم")
    var allKnown = true;
    var w = key.replace(/[\u0600-\u06FF]+/g, function (word) {
      if (word in WORDS) return WORDS[word];
      allKnown = false; return word;
    });
    if (allKnown && !AR.test(w)) return latin(w);
    return null;
  }
  function tr(raw, quiet) {
    if (lang !== 'en' || raw == null) return raw;
    var s = String(raw);
    if (!AR.test(s)) return s;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    var key = m[2].replace(/\s+/g, ' ');
    var out = lookup(key, 0);
    if (out == null && /\n/.test(m[2])) {
      // dialogs keep their line breaks: translate line by line
      var ok = true;
      out = m[2].split('\n').map(function (line) {
        if (!AR.test(line)) return line;
        var r = lookup(line.trim().replace(/\s+/g, ' '), 0);
        if (r == null) { ok = false; return line; }
        return line.replace(line.trim(), r);
      }).join('\n');
      if (!ok) out = null;
    }
    if (out == null) { if (!quiet) misses[key] = (misses[key] || 0) + 1; return s; }
    return m[1] + punct(out) + m[3];
  }

  /* ---------- the page ---------- */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function skip(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (e.getAttribute('translate') === 'no') return true;
      var tag = e.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return true;
    }
    return false;
  }
  function doText(n) {
    var v = n.nodeValue;
    if (!v || !AR.test(v) || skip(n.parentNode)) return;
    var t = tr(v);
    if (t !== v) n.nodeValue = t;
  }
  function doAttrs(el) {
    if (!el.getAttribute || skip(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (v && AR.test(v)) { var t = tr(v); if (t !== v) el.setAttribute(ATTRS[i], t); }
    }
    if (el.tagName === 'META' && el.getAttribute('name') === 'description') {
      var c = el.getAttribute('content'); if (c && AR.test(c)) el.setAttribute('content', tr(c));
    }
  }
  function walk(node) {
    if (node.nodeType === 3) { doText(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) { if (skip(node)) return; doAttrs(node); }
    var tw = document.createTreeWalker(node, 5 /* elements + text */, null);
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else doAttrs(n);
    }
  }
  if (lang === 'en' && window.MutationObserver) {
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r.type === 'childList') { for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]); }
        else if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') doAttrs(r.target);
      }
    });
    mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['content']) });
    walk(root);
    document.addEventListener('DOMContentLoaded', function () { walk(root); });
  }

  function setLang(next) {
    if (next !== 'ar' && next !== 'en') return false;
    try { localStorage.setItem(KEY, next); } catch (e) { return false; }
    return true;
  }

  window.GymI18n = {
    lang: lang,
    locale: lang === 'en' ? 'en-US' : 'ar-SA',
    t: function (s) { return tr(s); },
    /** نفس t بس ما يسجل النص كناقص (للأجزاء اللي تتجرب داخل الأنماط) */
    tq: function (s) { return tr(s, true); },
    /** ترجمة نص بقيم: GymI18n.f('{0} جولة', [3]) */
    f: function (tpl, args) { var s = String(tpl).replace(/\{(\d+)\}/g, function (_, i) { return args[i]; }); return tr(s); },
    add: function (dict, patterns) {
      for (var k in dict) EN[k.replace(/\s+/g, ' ').trim()] = dict[k];
      if (patterns) PATTERNS.push.apply(PATTERNS, patterns);
      for (var m in misses) delete misses[m];
      if (lang === 'en') walk(root);
    },
    list: function (name, arabic) { return lang === 'en' && LISTS[name] ? LISTS[name].slice() : arabic; },
    addLists: function (lists) { for (var k in lists) LISTS[k] = lists[k]; },
    addWords: function (words) { for (var k in words) WORDS[k] = words[k]; },
    /** fn يرجع true لما يقدر يضيف ترجماته (مثلاً بعد ما تنحمل مكتبة التمارين) */
    addLazy: function (fn) { LAZY.push(fn); },
    setLang: setLang,
    stored: stored,
    misses: misses,
    translateAll: function () { walk(root); }
  };
})();
