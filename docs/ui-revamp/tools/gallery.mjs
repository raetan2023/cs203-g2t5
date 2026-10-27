import { readdirSync, writeFileSync } from 'node:fs';

const imgs = readdirSync('baselines').filter(f => f.endsWith('.png'));
writeFileSync('gallery.html', `<body style="background:#111;color:#eee;font:13px sans-serif;display:flex;flex-wrap:wrap;gap:12px">${
  imgs.map(f => `<figure style="margin:0"><img src="baselines/${f}" width="320" loading="lazy"><figcaption>${f}</figcaption></figure>`).join('')}</body>`);
console.log(`gallery.html: ${imgs.length} images`);
