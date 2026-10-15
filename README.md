# coship_website

Static rebuild of **coship.ca** (formerly Wix) for GitHub Pages. No framework — `node scripts/build.mjs` turns `content/` + `site.json` into `dist/`, and the GitHub Actions workflow deploys it.

## Layout
- `content/en|ko/part*.txt` – page text extracted verbatim from the Wix site (one `=== /path` block per page)
- `site.json` – nav, footer, offices, home page data, contact e-mail, form endpoint, tracking API URL
- `assets/` – CSS/JS (and `assets/img/` once images are downloaded)
- `embeds/` – the Wix HTML embeds (shipping calculators, tracking result card)
- `scripts/build.mjs`, `scripts/fetch-wix-assets.mjs`

## Do these BEFORE cancelling Wix
1. **Download images + calculators**: Actions → *Fetch Wix assets* → Run workflow (or locally: `node scripts/build.mjs && node scripts/fetch-wix-assets.mjs`). Until then the site hot-links Wix media and Wix-hosted embeds, which disappear when Wix is cancelled.
2. **Export Wix form submissions / CRM contacts** (Wix Dashboard → Contacts / Form submissions → Export CSV). They are not part of the site files.
3. **Contact form**: set `formEndpoint` in `site.json` (e.g. a Formspree/Basin/own endpoint accepting JSON POST). With it empty, the form opens the visitor's mail app addressed to `contactEmail`.

## Go-live
Settings → Pages → Source: *GitHub Actions*; custom domain `www.coship.ca` (`CNAME` file included). DNS: `www` CNAME → `coship-canada.github.io`; apex `coship.ca` A records → 185.199.108–111.153. **Leave `bms.`, `form.` and MX records untouched.** Tracking calls `https://bms.coship.ca/tracking/<BL>` directly from the browser (CORS is allowed for www.coship.ca).

## Known items
- Tracking detail rows: the API's `details` field names are mapped heuristically in `assets/js/main.js` (`KEYS`); confirm with a BL that has events.
- Not migrated (empty Wix template pages): `/general-6`, `/inquiry-services-page`.
- Local preview: `node scripts/build.mjs && cd dist && python3 -m http.server`.
