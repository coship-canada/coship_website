(function () {
  'use strict';

  /* mobile nav */
  var burger = document.querySelector('.burger');
  var nav = document.getElementById('mainnav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
    });
  }

  /* contact: pick service from ?service= or buttons */
  var sel = document.getElementById('f-service');
  function pick(text) {
    if (!sel || !text) return;
    var t = String(text).toLowerCase();
    var best = null;
    Array.prototype.forEach.call(sel.options, function (o) {
      if (!o.value) return;
      if (o.value.toLowerCase() === t) best = best || o;
      else if (!best && o.value.toLowerCase().indexOf(t) !== -1) best = o;
    });
    if (best) { sel.value = best.value; }
    var title = document.getElementById('inquiry-title');
    if (title) title.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.querySelectorAll('.svc-pick').forEach(function (b) {
    b.addEventListener('click', function () { pick(b.getAttribute('data-value')); });
  });
  try {
    var qs = new URLSearchParams(location.search).get('service');
    if (qs && sel) {
      // CTA text from other pages: match on the trailing part of the option label
      var t = qs.toLowerCase(), hit = null;
      Array.prototype.forEach.call(sel.options, function (o) {
        if (!o.value) return;
        var v = o.value.toLowerCase();
        if (!hit && (v === t || v.slice(v.indexOf('–') + 2) === t)) hit = o;
      });
      if (hit) sel.value = hit.value;
    }
  } catch (e) {}

  /* inquiry form */
  var form = document.getElementById('inquiry');
  if (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = form.querySelector('.form-msg');
      var fd = new FormData(form);
      if (fd.get('_gotcha')) return;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var endpoint = form.getAttribute('data-endpoint');
      var data = {};
      fd.forEach(function (v, k) { if (k !== '_gotcha') data[k] = v; });
      if (endpoint) {
        fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
          .then(function (r) { if (!r.ok) throw new Error(r.status); msg.textContent = form.getAttribute('data-ok'); msg.className = 'form-msg ok'; form.reset(); })
          .catch(function () { msg.textContent = form.getAttribute('data-fail'); msg.className = 'form-msg err'; });
      } else {
        var body = ['Name: ' + data.name, 'Email: ' + data.email, 'Phone: ' + (data.phone || ''), 'Service: ' + (data.service || ''), '', data.message].join('\n');
        var subj = '[COSHIP] ' + (data.service || 'Inquiry') + ' - ' + data.name;
        msg.textContent = form.getAttribute('data-mail'); msg.className = 'form-msg ok';
        location.href = 'mailto:' + form.getAttribute('data-email') + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
      }
    });
  }

  /* tracking */
  var tf = document.getElementById('track-form');
  var frame = document.getElementById('track-result');
  if (tf && frame) {
    var ready = false, queue = [];
    function post(m) { if (ready) frame.contentWindow.postMessage(m, '*'); else queue.push(m); }
    frame.addEventListener('load', function () { ready = true; queue.splice(0).forEach(function (m) { frame.contentWindow.postMessage(m, '*'); }); });
    window.addEventListener('message', function (e) {
      if (e.source === frame.contentWindow && e.data && e.data.action === 'setHeight') frame.style.height = (e.data.height + 8) + 'px';
    });

    var DATE_RE = /\d{4}[-./]\d{1,2}[-./]\d{1,2}/;
    function pickKey(o, keys) {
      var lower = {}; for (var k in o) lower[k.toLowerCase()] = o[k];
      for (var i = 0; i < keys.length; i++) { var v = lower[keys[i]]; if (v !== undefined && v !== null) { v = String(v).trim(); if (v !== '' && v !== '-') return v; } }
      return '';
    }
    // The tracking API returns { resultJson: { mArray: [ { ..., details: [ {...} ] } ] } }.
    // The detail row keys are mapped heuristically; adjust KEYS if the API uses other names.
    var KEYS = {
      date: ['date', 'dt', 'stepdt', 'trackdt', 'trackingdt', 'eventdt', 'eventdate', 'regdt', 'scandt', 'procdt', 'datetime', 'time'],
      status: ['status', 'statusnm', 'stepnm', 'step', 'event', 'eventnm', 'desc', 'description', 'stat', 'statnm', 'state'],
      location: ['locationnm', 'location', 'loc', 'locnm', 'place', 'placenm', 'city', 'site', 'branch'],
      memo: ['memo', 'remark', 'remarks', 'rmk', 'note', 'comment']
    };
    function mapRow(d) {
      if (typeof d === 'string') return { date: '', status: d, location: '', memo: '' };
      var row = { date: pickKey(d, KEYS.date), status: pickKey(d, KEYS.status), location: pickKey(d, KEYS.location), memo: pickKey(d, KEYS.memo) };
      if (!row.date) { for (var k in d) { if (typeof d[k] === 'string' && DATE_RE.test(d[k])) { row.date = d[k]; break; } } }
      if (!row.status) { for (var k2 in d) { var v = d[k2]; if (typeof v === 'string' && v && v !== row.date && v !== row.location && v !== row.memo) { row.status = v; break; } } }
      return row;
    }
    function lookup(no) {
      post({ action: 'loading' });
      fetch(tf.getAttribute('data-api') + encodeURIComponent(no), { headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) {
          var arr = j && j.resultJson && j.resultJson.mArray;
          var item = arr && arr[0];
          var details = (item && item.details) || [];
          var rows = details.map(mapRow).filter(function (r) { return r.status || r.date; });
          // oldest -> newest (the renderer treats the last row as the latest event)
          var allDated = rows.length > 1 && rows.every(function (r) { return !isNaN(Date.parse(String(r.date).replace(/\./g, '-'))); });
          if (allDated) rows.sort(function (a, b) { return Date.parse(String(a.date).replace(/\./g, '-')) - Date.parse(String(b.date).replace(/\./g, '-')); });
          if (!item || !rows.length) { post({ action: 'error', message: tf.getAttribute('data-nf') }); return; }
          post({ action: 'result', trackingNumber: item.hawbno || no, rows: rows });
        })
        .catch(function () { post({ action: 'error', message: tf.getAttribute('data-err') }); });
    }
    tf.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var no = document.getElementById('track-no').value.trim();
      if (!no) { post({ action: 'error', message: tf.getAttribute('data-empty') }); return; }
      history.replaceState(null, '', '#' + encodeURIComponent(no));
      lookup(no);
    });
    var h = '';
    try {
      var qp = new URLSearchParams(location.search);
      ['no', 'bl', 'hawb', 'hawbno', 'tracking', 'trackingno', 'trackingnumber', 'number', 'num', 'q', 'id'].some(function (k) {
        var hit = null; qp.forEach(function (v, key) { if (!hit && key.toLowerCase() === k && v) hit = v; });
        if (hit) { h = hit.trim(); return true; }
      });
    } catch (e) {}
    if (!h) h = decodeURIComponent((location.hash || '').slice(1));
    if (h) { document.getElementById('track-no').value = h; lookup(h); }
  }
})();

/* home hero slider */
(function () {
  var box = document.querySelector('.hero-slider');
  if (!box) return;
  var slides = box.querySelectorAll('.slide'), dots = box.querySelectorAll('.dots button'), i = 0, timer;
  function show(n) {
    i = (n + slides.length) % slides.length;
    slides.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
  }
  function start() { clearInterval(timer); timer = setInterval(function () { show(i + 1); }, 5000); }
  dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); start(); }); });
  box.addEventListener('mouseenter', function () { clearInterval(timer); });
  box.addEventListener('mouseleave', start);
  start();
})();

/* locations tabs */
(function () {
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    var tabs = box.querySelectorAll('.loc-tab'), panels = box.querySelectorAll('.loc-panel');
    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x, j) { x.classList.toggle('on', j === k); x.setAttribute('aria-selected', j === k); });
        panels.forEach(function (p, j) {
          p.classList.toggle('on', j === k);
          if (j === k) p.querySelectorAll('iframe').forEach(function (f) { if (!f.getAttribute('src')) f.setAttribute('src', f.getAttribute('data-src')); });
        });
      });
    });
  });
})();

/* gallery lightbox */
(function () {
  var box = document.querySelector('.collage');
  if (!box) return;
  var all = Array.prototype.slice.call(box.querySelectorAll('.ct')), tiles = [], seenI = {}, cur = 0, lb;
  all.forEach(function (t) { var k = t.getAttribute('data-i'); if (!seenI[k]) { seenI[k] = 1; tiles.push(t); } });
  function build() {
    lb = document.createElement('div');
    lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.hidden = true;
    lb.innerHTML = '<button class="lb-fs" type="button" aria-label="Fullscreen">⤢</button><button class="lb-x" type="button" aria-label="Close">✕</button>' +
      '<button class="lb-nav lb-prev" type="button" aria-label="Previous">‹</button>' +
      '<div class="lb-body"><div class="lb-img"><img alt=""></div><div class="lb-text"><h3></h3><p></p></div></div>' +
      '<button class="lb-nav lb-next" type="button" aria-label="Next">›</button>';
    document.body.appendChild(lb);
    lb.querySelector('.lb-x').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', function () { show(cur - 1); });
    lb.querySelector('.lb-next').addEventListener('click', function () { show(cur + 1); });
    lb.querySelector('.lb-fs').addEventListener('click', function () {
      try { if (document.fullscreenElement) document.exitFullscreen(); else lb.requestFullscreen(); } catch (e) {}
    });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb-body')) close(); });
    var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) { if (x0 === null) return; var d = e.changedTouches[0].clientX - x0; if (Math.abs(d) > 50) show(cur + (d < 0 ? 1 : -1)); x0 = null; });
  }
  function show(n) {
    cur = (n + tiles.length) % tiles.length;
    var t = tiles[cur], img = t.querySelector('img'), cap = t.querySelector('figcaption');
    lb.querySelector('.lb-img img').src = img.currentSrc || img.src;
    lb.querySelector('.lb-img img').alt = img.alt;
    lb.querySelector('h3').textContent = cap.querySelector('strong').textContent;
    var s = cap.querySelector('span'); lb.querySelector('p').textContent = s ? s.textContent : '';
  }
  function open(n) { if (!lb) build(); show(n); lb.hidden = false; document.body.classList.add('lb-open'); lb.querySelector('.lb-x').focus(); }
  function close() {
    if (!lb || lb.hidden) return;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    lb.hidden = true; document.body.classList.remove('lb-open');
  }
  all.forEach(function (t) {
    var k = parseInt(t.getAttribute('data-i'), 10);
    t.setAttribute('tabindex', '0'); t.setAttribute('role', 'button');
    t.addEventListener('click', function () { open(k); });
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(k); } });
  });
  document.addEventListener('keydown', function (e) {
    if (!lb || lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(cur + 1);
    else if (e.key === 'ArrowLeft') show(cur - 1);
  });
})();

/* gallery slider arrows (loops) */
(function () {
  var wrap = document.querySelector('.collage-wrap');
  if (!wrap) return;
  var box = wrap.querySelector('.collage');
  function step() { return Math.max(200, Math.round(box.clientWidth * 0.8)); }
  function go(dir) {
    var max = box.scrollWidth - box.clientWidth;
    if (dir > 0 && box.scrollLeft >= max - 4) box.scrollTo({ left: 0, behavior: 'smooth' });
    else if (dir < 0 && box.scrollLeft <= 4) box.scrollTo({ left: max, behavior: 'smooth' });
    else box.scrollBy({ left: dir * step(), behavior: 'smooth' });
  }
  wrap.querySelector('.cg-prev').addEventListener('click', function () { go(-1); });
  wrap.querySelector('.cg-next').addEventListener('click', function () { go(1); });
  box.addEventListener('keydown', function (e) { if (e.target !== box) return; if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); });
})();
