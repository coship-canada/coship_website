#!/usr/bin/env node
// Downloads every image + HTML embed that the site still loads from Wix, into assets/img and embeds/.
// RUN THIS BEFORE CANCELLING WIX (Wix deletes its media/embeds afterwards).
//   node scripts/build.mjs && node scripts/fetch-wix-assets.mjs && node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const images = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/images.json'), 'utf8'));

const jobs = [];
for (const uri of images) jobs.push({ url: `https://static.wixstatic.com/media/${uri}`, out: path.join('assets/img', uri.replace('~mv2', '')) });
for (const e of Object.values(site.embeds)) for (const lang of ['en', 'ko'])
  jobs.push({ url: `https://www-coship-ca.filesusr.com/html/${e.remote[lang]}.html`, out: path.join('embeds', e[lang]) });

let ok = 0, skip = 0; const fail = [];
const queue = jobs.slice();
async function worker() {
  while (queue.length) {
    const j = queue.shift();
    const dest = path.join(ROOT, j.out);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { skip++; continue; }
    try {
      const r = await fetch(j.url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      ok++;
    } catch (e) { fail.push(`${j.url}  (${e.message})`); }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`downloaded ${ok}, already present ${skip}, failed ${fail.length}`);
if (fail.length) { console.log(fail.join('\n')); process.exitCode = 1; }
