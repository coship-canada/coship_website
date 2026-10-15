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
    var h = decodeURIComponent((location.hash || '').slice(1));
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
