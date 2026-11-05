// Captures preview states as screenshots (1440 and 390), static HTML snapshots for the taste inspector, and
// hierarchy metrics (type styles, heading sizes, boxes, accent fills) for the UI audit.
// Usage: node docs/ui-revamp/tools/capture-states.mjs <outDir> [state,state,...]   (dev server on 127.0.0.1:5190)
// Uses the frontend's own Playwright install so the tools folder needs no node_modules.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(resolve('frontend/package.json'));
const { chromium } = require('playwright');

const BASE = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5190';
const out = resolve(process.argv[2] ?? '.taste-skill/before/states');
const only = process.argv[3]?.split(',');

// key: the preview example; path: route to open after the state loads (admin has no recommendation example).
const STATES = [
  // Recommendation page, every state and role.
  { key: 'rec-monitor', role: 'buyer' }, { key: 'rec-buy', role: 'buyer' }, { key: 'rec-wait', role: 'buyer' },
  { key: 'rec-loading', role: 'buyer', wait: 2500 }, { key: 'rec-ready', role: 'buyer' },
  { key: 'rec-unavailable', role: 'buyer' }, { key: 'rec-error', role: 'buyer' }, { key: 'rec-empty', role: 'buyer' },
  // Approval states submit a plan through the mock service first, so they need longer to settle.
  { key: 'rec-awaiting', role: 'buyer', wait: 8000 }, { key: 'rec-approved', role: 'buyer', wait: 8000 }, { key: 'rec-rejected', role: 'buyer', wait: 8000 },
  { key: 'rec-withdrawn', role: 'buyer', wait: 8000 }, { key: 'rec-purchased', role: 'buyer', wait: 8000 },
  { key: 'rec-review', role: 'manager', wait: 8000 },
  { key: 'rec-analyst', role: 'analyst' }, { key: 'rec-analyst-awaiting', role: 'analyst', wait: 8000 },
  { key: 'home-admin', role: 'admin', path: '/purchase-plans/recommendation', name: 'rec-admin' },
  // The rest of the app.
  { key: 'login', role: 'public' }, { key: 'signup', role: 'public' },
  { key: 'home', role: 'buyer' }, { key: 'home-manager', role: 'manager' }, { key: 'home-analyst', role: 'analyst' }, { key: 'home-admin', role: 'admin' },
  { key: 'home-price-error', role: 'buyer' },
  { key: 'multiple', role: 'buyer' }, { key: 'empty', role: 'buyer' }, { key: 'saved', role: 'buyer' }, { key: 'load-error', role: 'buyer' },
  { key: 'plans-decisions', role: 'buyer', wait: 6000 },
  { key: 'home-manager', role: 'manager', path: '/purchase-plans', name: 'plans-manager' },
  { key: 'plans-decisions', role: 'buyer', wait: 6000, path: '/purchase-plans/decisions', name: 'decision-history' },
  { key: 'plans-decisions', role: 'buyer', wait: 6000, path: '/purchase-plans/notifications', name: 'manager-decisions' },
  { key: 'market', role: 'buyer', name: 'forecast-widget' },
  { key: 'home', role: 'buyer', menu: true, name: 'navigation' },
];

/** Hierarchy metrics for the rendered page: what a reader's eye has to sort out. */
function measure() {
  const rgb = v => v.replace(/\s+/g, '');
  const visible = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0; };
  const styles = new Map(); const sizes = new Map(); const weights = new Map(); const colours = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim(); const e = n.parentElement;
    if (!text || !e || e.closest('.preview-tools, script, style, [aria-hidden=true]') || !visible(e)) continue;
    const s = getComputedStyle(e); const size = Math.round(parseFloat(s.fontSize) * 10) / 10;
    const key = `${size}px/${s.fontWeight}/${rgb(s.color)}`;
    const add = (m, k) => m.set(k, (m.get(k) ?? 0) + text.length);
    add(styles, key); add(sizes, size); add(weights, s.fontWeight); add(colours, rgb(s.color));
    if (!styles.get(key + '#sample')) styles.set(key + '#sample', text.slice(0, 40));
  }
  const sorted = m => [...m.entries()].filter(([k]) => !String(k).endsWith('#sample')).sort((a, b) => b[1] - a[1]);
  const body = sorted(sizes)[0]?.[0] ?? 0;
  const largest = Math.max(0, ...sizes.keys());
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')].filter(visible).map(h => { const s = getComputedStyle(h); return `${h.tagName.toLowerCase()} ${parseFloat(s.fontSize)}px/${s.fontWeight} "${h.textContent.trim().slice(0, 32)}"`; });
  const fold = innerHeight; let boxes = 0, fills = 0, buttons = 0, primary = 0;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--bb-action').trim();
  const probe = document.createElement('i'); probe.style.color = accent; document.body.append(probe); const accentRgb = rgb(getComputedStyle(probe).color); probe.remove();
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('.preview-tools') || !visible(e)) continue;
    const r = e.getBoundingClientRect(); if (r.top >= fold || r.bottom <= 0) continue;
    const s = getComputedStyle(e);
    if (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && !/,\s*0\)$/.test(s.borderTopColor) && r.width > 60 && r.height > 30) boxes++;
    if (rgb(s.backgroundColor) === accentRgb && r.width > 20) fills++;
    if (e.matches('button, a.bb-button, [role=button]')) { buttons++; if (rgb(s.backgroundColor) === accentRgb) primary++; }
  }
  return {
    typeStyles: sorted(styles).length, sizes: sorted(sizes).map(([k]) => k).sort((a, b) => a - b), weights: sorted(weights).map(([k]) => k).sort(),
    textColours: sorted(colours).length, body, largest, ratio: body ? +(largest / body).toFixed(2) : 0,
    headings, boxesAboveFold: boxes, accentFillsAboveFold: fills, buttonsAboveFold: buttons, primaryButtonsAboveFold: primary,
    pageHeight: document.documentElement.scrollHeight, words: document.body.innerText.trim().split(/\s+/).length,
    topStyles: sorted(styles).slice(0, 6).map(([k, n]) => `${k} ×${n} "${styles.get(k + '#sample')}"`),
  };
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const summary = [];
for (const state of STATES.filter(s => !only || only.includes(s.name ?? s.key))) {
  const name = state.name ?? state.key;
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 844 }, reducedMotion: 'reduce' });
    await page.goto(`${BASE}/preview.html`);
    await page.locator('summary', { hasText: 'Demo controls' }).click();
    await page.selectOption('#preview-state', state.key);
    await page.addStyleTag({ content: '.preview-tools{display:none!important}' });
    await page.waitForTimeout(state.wait ?? 3000);
    if (state.path) {
      await page.evaluate(path => { window.history.pushState(null, '', path); window.dispatchEvent(new Event('bunker-buddy:navigate')); }, state.path);
      await page.waitForTimeout(2500);
    }
    if (state.menu) { await page.getByRole('button', { name: 'Open navigation' }).click(); await page.waitForTimeout(600); }
    await page.screenshot({ path: resolve(out, `${name}-${width}.png`), fullPage: !state.menu });
    if (width === 1440) {
      const metrics = await page.evaluate(measure);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const h1 = await page.locator('h1').first().textContent({ timeout: 1000 }).catch(() => '');
      // Static snapshot: the rendered DOM with Vite's injected <style> tags kept and every script removed.
      const html = await page.evaluate(() => {
        document.querySelectorAll('script, .preview-tools').forEach(n => n.remove());
        document.querySelectorAll('details.rec-fine').forEach(d => d.removeAttribute('open'));
        return '<!doctype html>\n' + document.documentElement.outerHTML;
      });
      writeFileSync(resolve(out, `${name}.html`), html);
      summary.push({ name, role: state.role, h1: h1?.trim(), overflow, ...metrics });
    } else {
      const small = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const targets = [...document.querySelectorAll('button, a, input, select, textarea, summary')].filter(e => !e.closest('.preview-tools')).map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
        return { overflow390: overflow, targetsUnder44: targets.filter(r => r.height < 44 || r.width < 44).length, targetsUnder24: targets.filter(r => r.height < 24 || r.width < 24).length, targets: targets.length };
      });
      Object.assign(summary.find(s => s.name === name) ?? {}, small);
    }
    await page.close();
  }
  console.log(`captured ${name}`);
}
await browser.close();
writeFileSync(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.table(summary.map(({ name, role, typeStyles, sizes, textColours, ratio, boxesAboveFold, primaryButtonsAboveFold, overflow, overflow390, targetsUnder44 }) =>
  ({ name, role, typeStyles, sizes: sizes.length, textColours, ratio, boxes: boxesAboveFold, primaries: primaryButtonsAboveFold, overflow, overflow390, under44: targetsUnder44 })));
