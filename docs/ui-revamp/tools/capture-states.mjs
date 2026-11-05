// Captures preview states as screenshots (1440 and 390) and static HTML snapshots for the taste inspector.
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
  { key: 'rec-monitor', role: 'buyer' }, { key: 'rec-buy', role: 'buyer' }, { key: 'rec-wait', role: 'buyer' },
  { key: 'rec-loading', role: 'buyer', wait: 2500 }, { key: 'rec-ready', role: 'buyer' },
  { key: 'rec-unavailable', role: 'buyer' }, { key: 'rec-error', role: 'buyer' }, { key: 'rec-empty', role: 'buyer' },
  // Approval states submit a plan through the mock service first, so they need longer to settle.
  { key: 'rec-awaiting', role: 'buyer', wait: 8000 }, { key: 'rec-approved', role: 'buyer', wait: 8000 }, { key: 'rec-rejected', role: 'buyer', wait: 8000 },
  { key: 'rec-withdrawn', role: 'buyer', wait: 8000 }, { key: 'rec-purchased', role: 'buyer', wait: 8000 },
  { key: 'rec-review', role: 'manager', wait: 8000 },
  { key: 'rec-admin', role: 'admin' }, { key: 'rec-admin-awaiting', role: 'admin', wait: 8000 },
  { key: 'home-admin', role: 'admin', path: '/purchase-plans/recommendation', name: 'rec-admin-no-plan' },
];

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
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: resolve(out, `${name}-${width}.png`), fullPage: true });
    if (width === 1440) {
      // Static snapshot: the rendered DOM with Vite's injected <style> tags kept and every script removed.
      const html = await page.evaluate(() => {
        document.querySelectorAll('script, .preview-tools').forEach(n => n.remove());
        document.querySelectorAll('details.rec-fine').forEach(d => d.removeAttribute('open'));
        return '<!doctype html>\n' + document.documentElement.outerHTML;
      });
      writeFileSync(resolve(out, `${name}.html`), html);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const h1 = await page.locator('h1').first().textContent().catch(() => '');
      summary.push({ name, role: state.role, h1: h1?.trim(), overflow });
    }
    await page.close();
  }
  console.log(`captured ${name}`);
}
await browser.close();
writeFileSync(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.table(summary);
