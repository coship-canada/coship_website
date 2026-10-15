#!/usr/bin/env node
// Static site builder: content/<lang>/part*.txt + site.json  ->  dist/
// Usage: node scripts/build.mjs            (production, root-absolute links)
//        BASE=/coship_website node scripts/build.mjs   (preview under a sub-path)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const BASE = (process.env.BASE || '').replace(/\/$/, '');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));

const SKIP = new Set(['/general-6', '/ko/general-6', '/inquiry-services-page', '/ko/inquiry-services-page', '/ko/shipnow', '/ko/blank']);
const CUSTOM = new Set(['/', '/ko', '/contact', '/ko/contact', '/tracking', '/ko/tracking', '/partner-tracking', '/ko/partner-tracking', '/faq', '/ko/faq']);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const has = (p) => fs.existsSync(path.join(ROOT, p));

/* ---------- images / embeds ---------- */
const usedImages = new Set();
import crypto from 'node:crypto';
const hashOf = f => crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 8);
const ASSET_V = { css: hashOf('assets/css/style.css'), js: hashOf('assets/js/main.js') };
let ICONS = new Set();
const placeholders = new Map(); // uri -> svg
const HOTLINK = process.env.WIX_HOTLINK === '1';
function hash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function makePlaceholder(uri) {
  const h = hash(uri) % 360;
  if (uri === site.logo) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 48"><text x="0" y="36" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="36" fill="#c8102e">COSHIP</text></svg>`;
  if (uri === site.favicon) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#c8102e"/><text x="32" y="43" text-anchor="middle" font-family="Arial" font-weight="800" font-size="30" fill="#fff">C</text></svg>`;
  if (ICONS.has(uri)) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#fdecef" stroke="#c8102e" stroke-width="2"/><path d="M20 38l8-10 6 7 4-5 6 8z" fill="#c8102e"/><circle cx="25" cy="24" r="3" fill="#c8102e"/></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},18%,86%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},22%,72%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><g fill="none" stroke="rgba(255,255,255,.85)" stroke-width="14" stroke-linejoin="round"><path d="M250 380l110-140 80 100 55-70 105 110z"/><circle cx="300" cy="230" r="28"/></g><text x="400" y="500" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="34" fill="rgba(255,255,255,.9)" letter-spacing="6">COSHIP</text></svg>`;
}
function imgName(uri) { return uri.replace('~mv2', ''); }
function imgSrc(uri) {
  if (/^https?:/.test(uri)) return uri;
  usedImages.add(uri);
  const local = `assets/img/${imgName(uri)}`;
  if (has(local)) return `${BASE}/${local}`;
  if (HOTLINK) return `https://static.wixstatic.com/media/${uri}`;
  if (!placeholders.has(uri)) placeholders.set(uri, makePlaceholder(uri));
  return `${BASE}/assets/placeholder/${imgName(uri).replace(/\.[a-z]+$/i, '')}.svg`;
}
function embedSrc(key, lang) {
  const e = site.embeds[key];
  const local = `embeds/${e[lang]}`;
  if (has(local)) return `${BASE}/${local}`;
  return `https://www-coship-ca.filesusr.com/html/${e.remote[lang]}.html`;
}

/* ---------- content parsing ---------- */
function loadPages() {
  const pages = [];
  for (const lang of ['en', 'ko']) {
    const dir = path.join(ROOT, 'content', lang);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const chunk of txt.split(/^=== /m).slice(1)) {
        const nl = chunk.indexOf('\n');
        let p = chunk.slice(0, nl).trim();
        const body = chunk.slice(nl + 1).replace(/\s+$/, '');
        if (p === '/post/founder-s-story-1') p = '/ko/post/founder-s-story-1';
        if (SKIP.has(p)) continue;
        const lines = body.split('\n');
        const meta = {};
        const rest = [];
        for (const l of lines) {
          const m = l.match(/^(TITLE|DESC|NOTE): ?(.*)$/);
          if (m && !('done' in meta)) meta[m[1]] = m[2]; else rest.push(l);
        }
        pages.push({ path: p, lang: p.startsWith('/ko') ? 'ko' : 'en', title: meta.TITLE || '', desc: meta.DESC || '', lines: rest });
      }
    }
  }
  return pages;
}

// every uri whose alt marks it as an icon
function collectIcons(pages) {
  const set = new Set();
  for (const pg of pages) for (const l of pg.lines) {
    const m = l.match(/^IMG: (\S+) \| alt=(.*)$/);
    if (m && /-(light|fill)\b/i.test(m[2])) set.add(m[1]);
  }
  return set;
}

/* ---------- link helpers ---------- */
function nl(h, lang) {
  if (!h) return '#';
  h = h.replace(/^https?:\/\/(www\.)?coship\.ca/, '');
  if (/^(https?:|mailto:|tel:|#)/.test(h)) return h;
  if (h === '' ) h = '/';
  if (h === '/privacy') h = '/privacypolicy';
  if (h === '/terms') h = '/termsandconditions';
  if (lang === 'en' && h === '/post/founder-s-story-1') h = '/post/founder-s-story';
  if (h.startsWith('/ko/') === false && h !== '/ko' && lang === 'ko' && !h.startsWith('/ko')) h = '/ko' + h;
  return BASE + (h === '/' ? '/' : h);
}
const url = (p) => BASE + (p === '/' ? '/' : p);

/* ---------- generic renderer ---------- */
function renderGeneric(pg, ctx) {
  const { lang, icons } = ctx;
  const L = site[lang];
  const faqPage = /-faq$/.test(pg.path);
  const out = [];
  let sectionOpen = false;
  let i = 0;
  const lines = pg.lines;
  let seenHeading = false;
  let bannerDone = false;
  let faqOpen = false;
  let faqMode = faqPage;
  let faqDone = false;
  let list = null; // {tag, cls, items}
  let btns = [];
  let imgs = [];
  let tableRows = [];
  let compare = [];

  const closeFaq = () => { if (faqOpen) { out.push('</div></details>'); faqOpen = false; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}${list.cls ? ` class="${list.cls}"` : ''}>${list.items.map((x) => `<li>${x}</li>`).join('')}</${list.tag}>`); list = null; } };
  const flushBtns = () => { if (btns.length) { out.push(`<div class="btn-row">${btns.join('')}</div>`); btns = []; } };
  const flushImgs = () => {
    if (!imgs.length) return;
    const allIcons = imgs.every((x) => icons.has(x.uri));
    if (allIcons) out.push(`<div class="icon-row">${imgs.map((x) => `<img class="icon" src="${imgSrc(x.uri)}" alt="" loading="lazy">`).join('')}</div>`);
    else if (!bannerDone && !seenHeading) { bannerDone = true; out.push(`<div class="banner"><img src="${imgSrc(imgs[0].uri)}" alt="${esc(imgs[0].alt)}"></div>`); imgs.slice(1).forEach((x) => out.push(figure(x))); }
    else if (imgs.length >= 3) out.push(`<div class="gallery">${imgs.map((x) => `<a href="${imgSrc(x.uri)}" target="_blank" rel="noopener"><img src="${imgSrc(x.uri)}" alt="${esc(x.alt)}" loading="lazy"></a>`).join('')}</div>`);
    else imgs.forEach((x) => out.push(icons.has(x.uri) ? `<img class="icon" src="${imgSrc(x.uri)}" alt="" loading="lazy">` : figure(x)));
    imgs = [];
  };
  const figure = (x) => `<figure><img src="${imgSrc(x.uri)}" alt="${esc(x.alt)}" loading="lazy"></figure>`;
  const flushTable = () => {
    if (!tableRows.length) return;
    const [head, ...body] = tableRows;
    out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    tableRows = [];
  };
  const flushAll = () => { flushList(); flushBtns(); flushImgs(); flushTable(); };
  const closeSection = () => { closeFaq(); flushAll(); if (sectionOpen) { out.push('</section>'); sectionOpen = false; } };
  const openSection = () => { out.push('<section class="sec"><div class="wrap">'); sectionOpen = true; };

  const inlineLink = (text, links) => {
    let t = esc(text);
    for (const [lt, lh] of links) { const e = esc(lt); if (e && t.includes(e)) t = t.replace(e, `<a href="${nl(lh, lang)}">${e}</a>`); }
    return t;
  };

  while (i < lines.length) {
    let line = lines[i++];
    if (!line.trim()) continue;
    if (line.startsWith(' ') && compare.length >= 0 && ctx._inCompare) {
      const t = line.trim();
      if (!t.startsWith('IMG:')) compare.push(t);
      continue;
    }
    ctx._inCompare = false;
    let m;
    // gather following LINK: lines for p/li/breadcrumb
    const takeLinks = () => { const ls = []; while (i < lines.length && /^\s+LINK: /.test(lines[i])) { const mm = lines[i++].match(/^\s+LINK: (.*?) -> (.*)$/); if (mm) ls.push([mm[1], mm[2]]); } return ls; };

    if ((m = line.match(/^(#{1,6}) (.*)$/))) {
      const n = m[1].length; const text = m[2];
      // FAQ handling
      if (faqMode && n === 3 && !faqDone) {
        flushAll(); closeFaq();
        if (!sectionOpen) openSection();
        out.push(`<details class="faq"><summary>${esc(text)}</summary><div class="faq-body">`); faqOpen = true;
        continue;
      }
      if (faqOpen) { closeFaq(); faqDone = true; faqMode = false; }
      if (/^FAQ$/i.test(text.replace(/\s+/g, ''))) { closeSection(); openSection(); out.push(`<h2>${esc(text)}</h2>`); faqMode = true; seenHeading = true; continue; }
      flushAll();
      if (n <= 2 && seenHeading) { closeSection(); openSection(); }
      else if (!sectionOpen) openSection();
      seenHeading = true;
      const tag = n === 1 && !ctx.h1done ? 'h1' : `h${Math.max(2, Math.min(n, 6))}`;
      if (n === 1) ctx.h1done = true;
      out.push(`<${tag} class="h${n}">${esc(text)}</${tag}>`);
      continue;
    }
    if ((m = line.match(/^IMG: (\S+)(?: \| alt=(.*))?$/))) {
      if (faqOpen && !icons.has(m[1])) { closeFaq(); faqDone = true; faqMode = false; }
      flushList(); flushBtns(); flushTable();
      if (!sectionOpen && seenHeading) openSection();
      imgs.push({ uri: m[1], alt: (m[2] || '').replace(/\.(png|jpe?g)$/i, '') });
      continue;
    }
    flushImgs();
    if ((m = line.match(/^BTN: (.*?) -> (.*)$/))) {
      const text = m[1].trim(); const href = m[2].trim();
      if (!text || /^#comp-/.test(text) || text === 'Button' || href.startsWith('(')) continue;
      if (faqOpen && !/^(Full FAQ|전체 FAQ)/i.test(text)) { closeFaq(); faqDone = true; faqMode = false; }
      if (/^(Full FAQ|전체 FAQ)/i.test(text)) {
        flushList(); closeFaq(); out.push(`<p class="more"><a class="btn ghost" href="${nl(href, lang)}">${esc(text)}</a></p>`); faqDone = true; faqMode = false; continue;
      }
      flushList(); if (!sectionOpen) openSection();
      if (/^(FAQ Categor|FAQ 카테고리)/.test(text)) { out.push(`<p class="back"><a href="${nl(href, lang)}">← ${esc(text)}</a></p>`); continue; }
      const ext = /^https?:/.test(nl(href, lang));
      btns.push(`<a class="btn" href="${nl(href, lang)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${esc(text)}</a>`);
      continue;
    }
    if ((m = line.match(/^CTA: (.*)$/))) {
      if (faqOpen) { closeFaq(); faqDone = true; faqMode = false; }
      flushList(); if (!sectionOpen) openSection();
      btns.push(`<a class="btn" href="${BASE}${L.prefix}/contact/?service=${encodeURIComponent(m[1].trim())}">${esc(m[1].trim())}</a>`);
      continue;
    }
    flushBtns();
    if ((m = line.match(/^EMBED: (.*)$/))) {
      if (!sectionOpen) openSection();
      const id = m[1].trim();
      const key = { 'calc-ca-to-kr': 'calc-ca-to-kr', 'comp-mo0w8830': 'calc-ca-to-kr', 'calc-kr-to-ca': 'calc-kr-to-ca', 'comp-mo2gy7zk': 'calc-kr-to-ca' }[id];
      if (key) out.push(`<div class="calc-frame"><iframe src="${embedSrc(key, lang)}" title="Shipping calculator" loading="lazy"></iframe></div>`);
      continue;
    }
    if (line.startsWith('FORM:') || line.startsWith('LOCATIONS:') || line.startsWith('CONSENT:')) continue;
    if (/^(GALLERY|STEPS|CARD|CARDLINK|SUB|STAT|FEATURE|REVIEW|CONTACTCARD): ?/.test(line)) continue;
    if ((m = line.match(/^STEPDESC: \d+ \| (.*)$/))) { out.push(`<p class="stepdesc">${esc(m[1])}</p>`); continue; }
    if ((m = line.match(/^LABELS: (.*)$/))) { out.push(`<ul class="chips">${m[1].split('|').map((x) => `<li>${esc(x.trim())}</li>`).join('')}</ul>`); continue; }
    if ((m = line.match(/^ROUTES: (.*)$/))) { out.push(`<ul class="chips">${m[1].split('|').map((x) => `<li>${esc(x.trim())}</li>`).join('')}</ul>`); continue; }
    if (line.startsWith('COMPARE:')) { ctx._inCompare = true; compare = []; continue; }
    if ((m = line.match(/^TABLE: (.*)$/))) { tableRows.push(m[1].split('|').map((x) => x.trim())); continue; }
    flushTable();
    if (/^\s+LINK: /.test(line)) continue;
    if (/^\/ /.test(line)) {
      const links = takeLinks();
      out.push(`<nav class="crumbs" aria-label="breadcrumb"><a href="${BASE}${L.prefix || '/'}">${lang === 'ko' ? '홈' : 'Home'}</a> ${inlineLink(line, links)}</nav>`);
      continue;
    }
    if ((m = line.match(/^- (.*)$/))) {
      const links = takeLinks();
      if (!sectionOpen) openSection();
      if (!list || list.tag !== 'ul' || list.cls) { flushList(); list = { tag: 'ul', cls: '', items: [] }; }
      list.items.push(inlineLink(m[1], links));
      continue;
    }
    if (line.startsWith('☐ ')) {
      if (!sectionOpen) openSection();
      if (!list || list.cls !== 'checks') { flushList(); list = { tag: 'ul', cls: 'checks', items: [] }; }
      list.items.push(esc(line.slice(2)));
      continue;
    }
    // plain paragraph
    flushList();
    const links = takeLinks();
    if (!sectionOpen) openSection();
    out.push(`<p>${inlineLink(line, links)}</p>`);
  }
  closeSection();
  return out.join('\n');
}

/* ---------- shared chrome ---------- */
function navHtml(L) {
  const item = (n) => {
    if (n.c) {
      return `<li class="has-sub"><a href="${n.h ? url(n.h) : '#'}"${n.h ? '' : ' role="button"'} aria-haspopup="true">${esc(n.t)}</a><ul class="sub">${n.c.map(item).join('')}</ul></li>`;
    }
    return `<li><a href="${url(n.h)}">${esc(n.t)}</a></li>`;
  };
  return `<ul class="menu">${L.nav.map(item).join('')}</ul>`;
}

function altPath(p, lang) {
  if (lang === 'en') return p === '/' ? '/ko' : '/ko' + p;
  return p === '/ko' ? '/' : p.replace(/^\/ko/, '') || '/';
}

function layout({ lang, p, title, desc, body, existing, jsonld, extraHead = '' }) {
  const L = site[lang];
  const ui = L.ui;
  const other = site[L.other];
  const altP = altPath(p, lang);
  const altOK = existing.has(altP);
  const canonical = site.siteUrl + (p === '/' ? '/' : p.replace(/\/$/, '') + '/');
  const fullTitle = title || 'COSHIP';
  const social = site.social;
  return `<!doctype html>
<html lang="${L.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}
<link rel="canonical" href="${canonical}">
${altOK ? `<link rel="alternate" hreflang="${other.lang}" href="${site.siteUrl}${altP === '/' ? '/' : altP + '/'}">` : ''}
<link rel="alternate" hreflang="${L.lang}" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(fullTitle)}">${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}<meta property="og:url" content="${canonical}"><meta property="og:image" content="${imgSrc(site.logo)}">
<link rel="icon" href="${imgSrc(site.favicon)}">
<link rel="stylesheet" href="${BASE}/assets/css/style.css?v=${ASSET_V.css}">
${extraHead}
</head>
<body>
<header class="site-header">
  <div class="bar">
    <a class="logo" href="${url(L.prefix || '/')}"><img src="${imgSrc(site.logo)}" alt="COSHIP" height="40"></a>
    <button class="burger" aria-label="${esc(ui.menu)}" aria-expanded="false" aria-controls="mainnav"><span></span><span></span><span></span></button>
    <nav id="mainnav">${navHtml(L)}
      <a class="lang" href="${altOK ? url(altP) : url(other.prefix || '/')}" hreflang="${other.lang}">${esc(L.otherLabel)}</a>
    </nav>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="foot-top">
      <img src="${imgSrc(site.logo)}" alt="COSHIP" height="36" class="foot-logo">
      <div class="social">
        <a href="${social.instagram}" target="_blank" rel="noopener" aria-label="Instagram">Instagram</a>
        <a href="${social.youtube}" target="_blank" rel="noopener" aria-label="YouTube">YouTube</a>
        <a href="${social.whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp">WhatsApp</a>
        <a href="${social.kakao}" target="_blank" rel="noopener" aria-label="KakaoTalk">KakaoTalk</a>
      </div>
    </div>
    <p class="company">${esc(L.company)}</p>
    <p class="note">${esc(L.footerNote)}</p>
    <p class="legal"><a href="${url(L.prefix + '/termsandconditions')}">${esc(L.terms)}</a> · <a href="${url(L.prefix + '/privacypolicy')}">${esc(L.privacy)}</a></p>
    <p class="copy">© ${new Date().getFullYear()} COSHIP. All rights reserved.</p>
  </div>
</footer>
<script src="${BASE}/assets/js/main.js?v=${ASSET_V.js}" defer></script>
</body>
</html>`;
}

/* ---------- custom templates ---------- */
function locationsHtml(lang) {
  const L = site[lang]; const ui = L.ui; const ko = lang === 'ko';
  const groups = [
    [ko ? '밴쿠버' : 'Vancouver', ['hq', 'burnaby']],
    [ko ? '토론토' : 'Toronto', ['toronto']],
    [ko ? '한국' : 'Korea', ['kr']]
  ];
  const tabs = groups.map(([n], k) => `<button type="button" role="tab" class="loc-tab${k === 0 ? ' on' : ''}" aria-selected="${k === 0}">${esc(n)}</button>`).join('');
  const panels = groups.map(([, keys], k) => `<div class="loc-panel${k === 0 ? ' on' : ''}" role="tabpanel">${keys.map((key) => {
    const loc = site.locations.find((x) => x.key === key); const d = loc[lang];
    const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(loc.map)}&output=embed`;
    return `<article class="loc">
      <h3>${esc(d.name)}</h3>
      <dl>
        <dt>${esc(ui.phone)}</dt><dd><a href="tel:${loc.tel}">${esc(loc.phone)}</a>${d.extra ? `<br><span class="muted">${esc(d.extra)}</span>` : ''}</dd>
        <dt>${esc(ui.address)}</dt><dd>${loc.link ? `<a href="${loc.link}" target="_blank" rel="noopener">${esc(d.addr)}</a>` : esc(d.addr)}</dd>
        <dt>${esc(ui.hours)}</dt><dd>${d.hours.map(esc).join('<br>')}</dd>
      </dl>
      <iframe class="map" title="${esc(d.name)}" ${k === 0 ? `src="${mapUrl}"` : ''} data-src="${mapUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </article>`;
  }).join('')}</div>`).join('');
  return `<div class="locations" data-tabs><div class="loc-tabs" role="tablist">${tabs}</div>${panels}</div>`;
}

const COLLAGE = [
  ['62e435_e4d621d7af914b609003d0396d37ec78~mv2.jpg', 'COSHIP Head Office, Vancouver', 'Our home base and operation center in Coquitlam, BC'],
  ['62e435_915866c41cfe403b9a0a254184130a43~mv2.png', 'Local Delivery', 'Last-mile delivery across Canada by our trusted team.'],
  ['62e435_6a0698dca1424faf8e4fa6ae03d360b8~mv2.jpg', 'Professional Packing', 'Careful Packing with quality materials to protect what matters most.'],
  ['62e435_cbde4d46f17f4ef8a3983a8bfbaf8ecb~mv2.png', 'International Vehicle Shipping', 'We move vehicles safely from origin to destination.'],
  ['62e435_244f5bcc3d1d41d0942789efd5392295~mv2.jpeg', 'CBSA Bonded Warehouse', 'Secure storage and efficient handling in our CBSA-certified bonded facility.'],
  ['62e435_ac7a4569084b43f79488ab83f0d0a6b9~mv2.jpg', 'COSHIP Head Office, Vancouver', ''],
  ['62e435_3e7982259c6b4089b2580127133c6ab5~mv2.jpeg', 'COSHIP Head Office, Vancouver', ''],
  ['62e435_c3fc9b6646a2479aa85f321c1d4ce6af~mv2.jpg', 'COSHIP Head Office, Vancouver', '']
];
// horizontal collage: one large tile, then a 2x2 block of small tiles, repeating (as on the original site)
function collage() {
  const N = COLLAGE.length;
  const tile = (k, big) => { const [u, t, d] = COLLAGE[k % N]; return `<figure class="ct${big ? ' big' : ''}" data-i="${k % N}"><img src="${imgSrc(u)}" alt="${esc(t)}" loading="lazy"><figcaption><strong>${esc(t)}</strong>${d ? `<span>${esc(d)}</span>` : ''}</figcaption></figure>`; };
  // one cycle = N pairs of (1 large tile + 2x2 small tiles); the cycle is rendered twice so the slider can loop endlessly
  const cycle = () => { let k = 0, out = ''; for (let p = 0; p < N; p++) { out += `<div class="cc cc-big">${tile(k, true)}</div>`; k += 1; out += `<div class="cc cc-grid">${[0, 1, 2, 3].map((x) => tile(k + x)).join('')}</div>`; k += 4; } return `<div class="cycle">${out}</div>`; };
  return `<div class="collage-wrap"><button type="button" class="cg-nav cg-prev" aria-label="Previous">‹</button><div class="collage" tabindex="0" aria-label="Gallery">${cycle()}${cycle().replace(/ data-i=/g, ' data-d="1" data-i=')}</div><button type="button" class="cg-nav cg-next" aria-label="Next">›</button></div>`;
}

function homeBody(lang) {
  const L = site[lang]; const H = L.home;
  const cards = H.cards.map((c) => `<article class="card">
      <a class="card-img" href="${url(c.h)}"><img src="${imgSrc(c.img)}" alt="" loading="lazy"></a>
      <h3><a href="${url(c.h)}">${esc(c.t)}</a></h3>
      ${c.q ? `<p class="q">${esc(c.q)}</p>` : ''}
      <p>${esc(c.s)}</p>
      ${c.b.length ? `<div class="btn-row">${c.b.map(([t, h]) => `<a class="btn small" href="${url(h)}">${esc(t)}</a>`).join('')}</div>` : ''}
    </article>`).join('');
  return `
<section class="hero-slider" aria-roledescription="carousel">
${H.slides.map((s, k) => `  <div class="slide${k === 0 ? ' on' : ''}" style="background-image:linear-gradient(rgba(0,0,0,.42),rgba(0,0,0,.42)),url('${imgSrc(s.img)}')"><div class="wrap">${k === 0 ? '<h1>' : '<h2 class="h1">'}${esc(s.h1)}${k === 0 ? '</h1>' : '</h2>'}<p>${esc(s.sub)}</p><a class="btn" href="${url(L.prefix + '/contact')}">${esc(H.hero.cta)}</a></div></div>`).join('\n')}
  <div class="dots">${H.slides.map((s, k) => `<button type="button" aria-label="Slide ${k + 1}"${k === 0 ? ' class="on"' : ''}></button>`).join('')}</div>
</section>
<section class="sec"><div class="wrap"><h2>${esc(H.servicesTitle)}</h2><div class="cards svc-cards">${cards}</div></div></section>
<section class="sec alt"><div class="wrap">
  <h2>${esc(H.reviewsTitle)}</h2>
  <div class="rating"><img src="${imgSrc(H.reviewsImg)}" alt="" height="48" loading="lazy"><strong>${esc(H.rating)}</strong><span>${esc(H.ratingNote)}</span><img src="${imgSrc(H.reviewsLogo)}" alt="Google" height="28" loading="lazy"></div>
  <div class="reviews">${H.reviews.map(([t, q]) => `<blockquote><p>${esc(q)}</p><footer>${esc(t)}</footer></blockquote>`).join('')}</div>
  <p class="center"><a class="btn ghost" href="${H.reviewsLink}" target="_blank" rel="noopener">${esc(H.reviewsLinkText)}</a></p>
</div></section>
<section class="sec"><div class="wrap">
  <h2>${esc(H.whyTitle)}</h2>
  <div class="stats">${H.stats.map(([a, b]) => `<div><strong>${esc(a)}</strong><span>${esc(b)}</span></div>`).join('')}</div>
  <div class="features">${H.features.map(([i, t, d]) => `<div><img class="icon" src="${imgSrc(i)}" alt="" loading="lazy"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join('')}</div>
</div></section>
<section class="sec alt"><div class="wrap">
  <p class="kicker">${esc(H.galleryKicker)}</p><h2>${esc(H.galleryTitle)}</h2><p class="center">${esc(H.gallerySub)}</p></div><div class="wrap wide">
  ${collage(H.gallery)}
</div></section>
<section class="sec"><div class="wrap"><h2>${esc(L.ui.locations)}</h2>${locationsHtml(lang)}</div></section>`;
}

const SERVICE_GROUPS = {
  en: [
    ['International Moving', 'truck', ['To Canada', 'From Canada', 'Korea to Canada', 'Canada to Korea']],
    ['Vehicle Transport', 'car', ['Korea to Canada', 'Canada to Korea']],
    ['E-Commerce', 'basket', ['Korea to Canada', 'Canada to Korea', 'Courier (International/Domestic)', 'Interprovincial Moving', 'Freight Forwarding', 'NRI Services', '3PL Fulfillment']]
  ],
  ko: [
    ['해외이사', 'truck', ['캐나다 도착', '캐나다 출발', '한국에서 캐나다로', '캐나다에서 한국으로']],
    ['차량운송', 'car', ['한국에서 캐나다로', '캐나다에서 한국으로']],
    ['이커머스', 'basket', ['한국에서 캐나다로', '캐나다에서 한국으로', '택배 (국제 / 캐나다 국내)', '타주이사', '상업화물', 'NRI 서비스', '3PL 풀필먼트']]
  ]
};

function formHtml(lang) {
  const ui = site[lang].ui;
  const opts = SERVICE_GROUPS[lang].map(([g, , items]) => `<optgroup label="${esc(g)}">${items.map((x) => `<option value="${esc(g + ' – ' + x)}">${esc(g + ' – ' + x)}</option>`).join('')}</optgroup>`).join('');
  return `<form class="inquiry" id="inquiry" data-endpoint="${esc(site.formEndpoint)}" data-email="${esc(site.contactEmail)}" data-ok="${esc(ui.f_sent)}" data-fail="${esc(ui.f_fail)}" data-mail="${esc(ui.f_mail)}" novalidate>
    <div class="row"><label>${esc(ui.f_name)}*<input name="name" required autocomplete="name"></label>
    <label>${esc(ui.f_email)}*<input name="email" type="email" required autocomplete="email"></label></div>
    <div class="row"><label>${esc(ui.f_phone)}<input name="phone" type="tel" autocomplete="tel"></label>
    <label>${esc(ui.f_service)}<select name="service" id="f-service"><option value="">${esc(ui.f_choose)}</option>${opts}</select></label></div>
    <label>${esc(ui.f_message)}*<textarea name="message" rows="6" required></textarea></label>
    <label class="check"><input type="checkbox" name="consent" required> <span>${esc(ui.f_consent)} <a href="${url(site[lang].prefix + '/privacypolicy')}" target="_blank">↗</a></span></label>
    <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <button class="btn" type="submit">${esc(ui.f_send)}</button>
    <p class="form-msg" role="status"></p>
  </form>`;
}

function contactBody(lang) {
  const L = site[lang]; const ui = L.ui; const s = site.social;
  const ko = lang === 'ko';
  const cards = [
    ['WhatsApp', ko ? '왓츠앱 상담하기' : 'Chat with us', s.whatsapp, '62e435_6c9d090b70444a5f874ade2070a9cbe0~mv2.png'],
    ['Kakao Talk', ko ? '카톡 상담하기' : 'Chat with us', s.kakao, '62e435_49f19ee64a124081bc8940608e46bcde~mv2.png'],
    ['Email', site.contactEmail, 'mailto:' + site.contactEmail, null]
  ];
  return `
<section class="track-hero contact-hero" style="background-image:url('${imgSrc('62e435_b150d79ce5bf44d7ab9b1534e06ac683~mv2.png')}')"><div class="wrap"><div class="track-hero-in">
  <h1>${ko ? '문의하기' : 'Contact Us'}</h1>
  <p class="lead">${ko ? '해외이사 및 물류 운송에 대한 문의사항이 있으신가요? 무엇이든 편하게 물어보세요.' : 'Questions about shipping or logistics? We\'re here to help.'}</p>
</div></div></section>
<section class="contact-top"><div class="wrap">
  <div class="contact-cards">${cards.map(([t, sub, h, im]) => `<a class="card ccard" href="${h}" ${h.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${im ? `<img src="${imgSrc(im)}" alt="" height="48">` : '<span class="mail-ico" aria-hidden="true">✉</span>'}<h3>${t}</h3><p>${esc(sub)}</p></a>`).join('')}</div>
</div></section>
<section class="sec alt"><div class="wrap">
  <h2>${esc(ui.select_service)}</h2>
  <div class="svc-groups">${SERVICE_GROUPS[lang].map(([g, , items]) => `<div class="svc"><h3>${esc(g)}</h3><div class="btn-row">${items.map((x) => `<button type="button" class="btn small ghost svc-pick" data-value="${esc(g + ' – ' + x)}">${esc(x)}</button>`).join('')}</div></div>`).join('')}</div>
  <h2 id="inquiry-title">${esc(ui.general_inquiry)}</h2>
  ${formHtml(lang)}
</div></section>
<section class="sec"><div class="wrap"><h2>${esc(ui.locations)}</h2>${locationsHtml(lang)}</div></section>`;
}

function trackingBody(lang, partner) {
  const L = site[lang]; const ui = L.ui; const ko = lang === 'ko';
  const links = [
    [ko ? '해외이사' : 'International Moving', '/international-moving'],
    [ko ? '차량운송' : 'Vehicle Transport', '/vehicle-transport'],
    [ko ? '상업화물' : 'Freight Forwarding', '/freight-forwarding'],
    [ko ? '택배' : 'Courier', '/courier-ecommerce']
  ];
  return `
<section class="track-hero" style="background-image:url('${imgSrc('62e435_a35cd7c27dd64f64ba8025e9fc872c34~mv2.jpeg')}')"><div class="wrap">
  <div class="track-hero-in">
  <h1>${ko ? '배송조회하기' : 'Tracking'}</h1>
  <p class="lead">${ko ? '2007년부터 한국-캐나다 운송을 전문으로 해온 캐나다 운송 대표, 캐나다쉬핑' : 'Canada-based logistics company since 2007, specializing in Korea–Canada shipping'}</p>
  <form class="track-form" id="track-form" data-api="${esc(site.trackingApi)}" data-nf="${esc(ui.trackNotFound)}" data-err="${esc(ui.trackError)}" data-empty="${esc(ui.trackEmpty)}">
    <input id="track-no" name="no" inputmode="latin" autocomplete="off" placeholder="${esc(ui.trackingPlaceholder)}" aria-label="${esc(ui.trackingPlaceholder)}">
    <button class="btn" type="submit">${esc(ui.trackBtn)}</button>
  </form>
  </div>
</div></section>
<section class="track-body"><div class="wrap">
  <iframe id="track-result" class="track-result" title="Tracking result" src="${embedSrc('tracking-result', lang)}" scrolling="no"></iframe>
  <div class="track-card">
    <img src="${imgSrc('62e435_f465d24f8ce24a84ab6d23a92f2b35c1~mv2.png')}" alt="" loading="lazy">
    <div>
      ${partner ? `<p>${ko ? '캐나다 현지 배송' : 'Final delivery by'} <a class="btn ghost small" href="https://www.canadapost-postescanada.ca/track-reperage/en/home" target="_blank" rel="noopener">${ko ? '캐나다포스트 배송조회' : 'Track with Canada Post'}</a></p>` : ''}
      <p class="since">Canada–Korea · Since 2007</p>
      <div class="chip-grid">${links.map(([t, h]) => `<a href="${url(L.prefix + h)}">${esc(t)} ›</a>`).join('')}</div>
    </div>
  </div>
</div></section>`;
}

const FAQ_CARDS = {
  en: [['International Moving', 'international-moving-faq', '62e435_b0f8f35417f24d19953571eeafbbec70~mv2.png'], ['Vehicle Transport', 'vehicle-transport-faq', '62e435_dbe78c5d786f43b68e316c162c110a22~mv2.png'], ['Interprovincial Moving', 'interprovincial-moving-faq', '62e435_810714f0aec8437da8d871e5519d1f7a~mv2.png'], ['Courier', 'courier-faq', '62e435_76d7cb9aef444e71b6c2112311a65230~mv2.png'], ['NRI Services', 'nri-services-faq', '62e435_ff9bd82fcf304be6b8b466f270292cce~mv2.png'], ['Freight Forwarding', 'freight-forwarding-faq', '62e435_fc427f2f5c72450cb982f4f28a07cd97~mv2.png'], ['3PL Fulfillment', '3pl-fulfillment-faq', '62e435_241508946e8e467e9919bacd85a75132~mv2.png']],
  ko: [['해외이사 FAQ', 'international-moving-faq', '62e435_b0f8f35417f24d19953571eeafbbec70~mv2.png'], ['차량운송 FAQ', 'vehicle-transport-faq', '62e435_dbe78c5d786f43b68e316c162c110a22~mv2.png'], ['타주이사 FAQ', 'interprovincial-moving-faq', '62e435_810714f0aec8437da8d871e5519d1f7a~mv2.png'], ['택배 FAQ', 'courier-faq', '62e435_76d7cb9aef444e71b6c2112311a65230~mv2.png'], ['NRI 서비스 FAQ', 'nri-services-faq', '62e435_ff9bd82fcf304be6b8b466f270292cce~mv2.png'], ['상업화물 FAQ', 'freight-forwarding-faq', '62e435_fc427f2f5c72450cb982f4f28a07cd97~mv2.png'], ['3PL FAQ', '3pl-fulfillment-faq', '62e435_241508946e8e467e9919bacd85a75132~mv2.png']]
};
function faqIndexBody(lang) {
  const L = site[lang]; const ko = lang === 'ko';
  return `<section class="sec"><div class="wrap"><h1>FAQ</h1>
  <p class="lead">${ko ? '서비스 카테고리를 선택하여 필요한 답변을 빠르게 확인해 보세요.' : 'Choose a service category to find the right answers faster.'}</p>
  <div class="cards">${FAQ_CARDS[lang].map(([t, h, im]) => `<a class="card ccard" href="${url(L.prefix + '/' + h)}"><img class="icon" src="${imgSrc(im)}" alt=""><h3>${esc(t)}</h3></a>`).join('')}</div></div></section>`;
}

/* ---------- build ---------- */
function write(rel, content) {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name); const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  const pages = loadPages();
  const icons = collectIcons(pages);
  ICONS = icons;
  // pages that exist (for hreflang / lang switcher)
  const homeEn = { path: '/', lang: 'en', title: site.en.home.title, desc: site.en.home.desc, lines: [] };
  const homeKo = { path: '/ko', lang: 'ko', title: site.ko.home.title, desc: site.ko.home.desc, lines: [] };
  const byPath = new Map();
  for (const p of [homeEn, homeKo, ...pages]) byPath.set(p.path, p);
  // ensure custom pages exist for both langs
  for (const p of ['/contact', '/ko/contact', '/tracking', '/ko/tracking', '/partner-tracking', '/ko/partner-tracking', '/faq', '/ko/faq']) if (!byPath.has(p)) byPath.set(p, { path: p, lang: p.startsWith('/ko') ? 'ko' : 'en', title: '', desc: '', lines: [] });
  const existing = new Set(byPath.keys());

  const urls = [];
  for (const pg of byPath.values()) {
    const lang = pg.lang;
    const ctx = { lang, icons, h1done: false };
    let body;
    const bare = pg.path.replace(/^\/ko(?=\/|$)/, '') || '/';
    if (bare === '/') body = homeBody(lang);
    else if (bare === '/contact') body = contactBody(lang);
    else if (bare === '/tracking') body = trackingBody(lang, false);
    else if (bare === '/partner-tracking') body = trackingBody(lang, true);
    else if (bare === '/faq') body = faqIndexBody(lang);
    else body = renderGeneric(pg, ctx);
    const noindex = bare === '/partner-tracking' || site.noindex === true;
    const html = layout({ lang, p: pg.path, title: pg.title, desc: pg.desc, body, existing, extraHead: noindex ? '<meta name="robots" content="noindex">' : '' });
    const rel = pg.path === '/' ? 'index.html' : path.join(pg.path.replace(/^\//, ''), 'index.html');
    write(rel, html);
    if (bare !== '/partner-tracking' && site.noindex !== true) urls.push(pg.path);
  }

  // static assets
  copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  copyDir(path.join(ROOT, 'embeds'), path.join(DIST, 'embeds'));
  for (const f of ['CNAME', 'robots.txt']) if (has(f)) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
  // preview mode: block all crawlers (set "noindex": false in site.json at launch)
  if (site.noindex === true) fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

  for (const [uri, svg] of placeholders) write(`assets/placeholder/${imgName(uri).replace(/\.[a-z]+$/i, '')}.svg`, svg);

  // sitemap
  const sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    .concat(urls.sort().map((u) => `<url><loc>${site.siteUrl}${u === '/' ? '/' : u + '/'}</loc></url>`)).concat('</urlset>').join('\n');
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sm);

  // 404
  const L = site.en;
  fs.writeFileSync(path.join(DIST, '404.html'), layout({ lang: 'en', p: '/404', title: 'Page not found | COSHIP', desc: '', existing, body: `<section class="sec"><div class="wrap center"><h1>${L.ui.page404}</h1><p><a class="btn" href="${url('/')}">${L.ui.back}</a> <a class="btn ghost" href="${url('/ko')}">홈으로 (한국어)</a></p></div></section>`, extraHead: '<meta name="robots" content="noindex"><script>(function(){var m=location.pathname.match(/^(.*?\\/(?:ko\\/)?tracking)\\/([^\\/]+)\\/?$/);if(m)location.replace(m[1]+"/"+location.search+"#"+encodeURIComponent(decodeURIComponent(m[2])));})();</script>' }));

  // image manifest for the downloader
  const manifest = [...usedImages].filter((u) => !/^https?:/.test(u)).sort();
  fs.writeFileSync(path.join(ROOT, 'scripts', 'images.json'), JSON.stringify(manifest, null, 1));
  console.log(`built ${byPath.size} pages, ${manifest.length} images referenced -> dist/`);
}
main();
