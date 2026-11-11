// Mobile pass checker (docs/ui-revamp/MOBILE_PLAN.md).
//   baseline: 1440px screenshots of every state into <out>/desktop-baseline (take before any CSS change).
//   check:    phone screenshots at 360/390/402/430 into <out>/<phase>/, plus 1440px into <out>/desktop-after,
//             compared byte-for-byte with the baseline. Fails on horizontal overflow at any phone width.
// Usage (from the repo root, preview dev server running):
//   node docs/ui-revamp/tools/capture-mobile.mjs baseline
//   node docs/ui-revamp/tools/capture-mobile.mjs check [officer|manager|admin|all] [state,state,...]
// PREVIEW_URL defaults to http://127.0.0.1:5199. Uses the frontend's own Playwright install.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(resolve('frontend/package.json'));
const { chromium } = require('playwright');

const BASE = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5199';
const OUT = resolve(process.env.MOBILE_OUT ?? 'docs/ui-revamp/submission/mobile');
const mode = process.argv[2] ?? 'check';
const phase = process.argv[3] ?? 'all';
const only = process.argv[4]?.split(',');
const PHONES = [{ w: 360, h: 780 }, { w: 390, h: 844 }, { w: 402, h: 874 }, { w: 430, h: 932 }];

// key: preview example; path: route opened after the state loads; click: button pressed before capture;
// menu: open the hamburger and capture the viewport. Phase follows MOBILE_PLAN.md.
const STATES = [
  // Phase 1: Procurement Officer
  { phase: 'officer', key: 'login' }, { phase: 'officer', key: 'signup' },
  { phase: 'officer', key: 'home' }, { phase: 'officer', key: 'home', menu: true, name: 'home-menu' },
  { phase: 'officer', key: 'home-price-error' },
  { phase: 'officer', key: 'multiple' }, { phase: 'officer', key: 'multiple', menu: true, name: 'plans-menu' },
  { phase: 'officer', key: 'empty' }, { phase: 'officer', key: 'saved' }, { phase: 'officer', key: 'load-error' },
  { phase: 'officer', key: 'multiple', click: 'Create plan', name: 'plan-create-dialog', viewportOnly: true },
  { phase: 'officer', key: 'plans-decisions', wait: 6000 },
  { phase: 'officer', key: 'rec-monitor' }, { phase: 'officer', key: 'rec-buy' }, { phase: 'officer', key: 'rec-wait' },
  { phase: 'officer', key: 'rec-stale' }, { phase: 'officer', key: 'rec-loading', wait: 2500 },
  { phase: 'officer', key: 'rec-unavailable' }, { phase: 'officer', key: 'rec-error' }, { phase: 'officer', key: 'rec-empty' },
  { phase: 'officer', key: 'rec-awaiting', wait: 8000 }, { phase: 'officer', key: 'rec-approved', wait: 8000 },
  { phase: 'officer', key: 'rec-rejected', wait: 8000 }, { phase: 'officer', key: 'rec-purchased', wait: 8000 },
  { phase: 'officer', key: 'plans-decisions', wait: 6000, path: '/purchase-plans/notifications', name: 'manager-decisions' },
  { phase: 'officer', key: 'plans-decisions', wait: 6000, path: '/purchase-plans/decisions', name: 'decision-history' },
  { phase: 'officer', key: 'market' }, { phase: 'officer', key: 'market-no-forecast' }, { phase: 'officer', key: 'market-read-error' },
  { phase: 'officer', key: 'home', path: '/nowhere', name: 'not-found' },
  // Phase 2: Procurement Manager
  { phase: 'manager', key: 'home-manager' }, { phase: 'manager', key: 'home-manager', menu: true, name: 'home-manager-menu' },
  { phase: 'manager', key: 'home-manager', path: '/purchase-plans', name: 'plans-manager' },
  { phase: 'manager', key: 'rec-review', wait: 8000 },
  { phase: 'manager', key: 'home-manager', path: '/market-dashboard', name: 'market-manager' },
  { phase: 'manager', key: 'home-manager', path: '/purchase-plans/decisions', name: 'decisions-restricted' },
  // Phase 3: Admin
  { phase: 'admin', key: 'home-admin' }, { phase: 'admin', key: 'home-admin', menu: true, name: 'home-admin-menu' },
  { phase: 'admin', key: 'home-admin', path: '/admin', name: 'admin' },
  { phase: 'admin', key: 'home-admin', path: '/purchase-plans', name: 'plans-admin' },
  { phase: 'admin', key: 'rec-admin' }, { phase: 'admin', key: 'rec-admin-awaiting', wait: 8000 },
];

async function open(browser, state, viewport) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  await page.goto(`${BASE}/preview.html`);
  await page.locator('summary', { hasText: 'Demo controls' }).click();
  await page.selectOption('#preview-state', state.key);
  await page.addStyleTag({ content: '.preview-tools{display:none!important}' });
  await page.waitForTimeout(state.wait ?? 3000);
  if (state.path) {
    await page.evaluate(path => { window.history.pushState(null, '', path); window.dispatchEvent(new Event('bunker-buddy:navigate')); }, state.path);
    await page.waitForTimeout(2500);
  }
  if (state.click) { await page.getByRole('button', { name: state.click }).first().click(); await page.waitForTimeout(800); }
  return page;
}

/** Horizontal overflow plus every visible tap target under 44px, named so it can be found. */
function audit() {
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  const wide = [...document.body.querySelectorAll('*')].filter(e => {
    if (e.closest('.preview-tools')) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.right > document.documentElement.clientWidth + 1;
  }).slice(0, 5).map(e => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`);
  const small = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab]')]
    .filter(e => !e.closest('.preview-tools, .bb-skip'))
    .map(e => ({ e, r: e.getBoundingClientRect(), s: getComputedStyle(e) }))
    .filter(({ r, s }) => r.width > 0 && r.height > 0 && s.visibility !== 'hidden')
    .filter(({ r }) => r.height < 44 || r.width < 44)
    .map(({ e, r }) => `${Math.round(r.width)}x${Math.round(r.height)} ${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).trim().split(/\s+/)[0] : ''} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)}"`);
  return { overflow, wide, small };
}

const browser = await chromium.launch();
const states = STATES.filter(s => (phase === 'all' || s.phase === phase) && (!only || only.includes(s.name ?? s.key)));
const report = []; let failures = 0;

for (const state of states) {
  const name = state.name ?? state.key;
  if (state.menu && mode === 'baseline') continue; // the desktop has no menu
  // Desktop: baseline or comparison.
  const desktopDir = resolve(OUT, mode === 'baseline' ? 'desktop-baseline' : 'desktop-after');
  mkdirSync(desktopDir, { recursive: true });
  if (!state.menu) {
    const page = await open(browser, state, { width: 1440, height: 900 });
    const file = resolve(desktopDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: !state.viewportOnly });
    await page.close();
    if (mode !== 'baseline') {
      const before = resolve(OUT, 'desktop-baseline', `${name}.png`);
      const same = existsSync(before) ? readFileSync(before).equals(readFileSync(file)) : null;
      report.push({ name, width: 1440, desktopUnchanged: same });
    }
  }
  if (mode === 'baseline') { console.log(`baseline ${name}`); continue; }
  // Phones.
  const dir = resolve(OUT, state.phase); mkdirSync(dir, { recursive: true });
  for (const vp of PHONES) {
    const page = await open(browser, state, { width: vp.w, height: vp.h });
    if (state.menu) {
      const button = page.getByRole('button', { name: 'Menu' });
      if (!(await button.isVisible())) { console.log(`skip ${name}: no Menu button`); await page.close(); continue; }
      await button.click(); await page.waitForTimeout(500);
    }
    const result = await page.evaluate(audit);
    await page.screenshot({ path: resolve(dir, `${name}-${vp.w}.png`), fullPage: !state.menu && !state.viewportOnly });
    await page.close();
    if (result.overflow > 0) failures++;
    report.push({ name, width: vp.w, overflow: result.overflow, wide: result.wide, smallTargets: result.small.length, small: vp.w === 390 ? result.small : undefined });
  }
  const r390 = report.find(r => r.name === name && r.width === 390);
  const worst = Math.max(...report.filter(r => r.name === name && r.overflow !== undefined).map(r => r.overflow));
  console.log(`${worst > 0 ? 'FAIL' : 'ok  '} ${name}  overflow=${worst}px  small@390=${r390?.smallTargets ?? '-'}`);
}
await browser.close();

if (mode !== 'baseline') {
  writeFileSync(resolve(OUT, `report-${phase}.json`), JSON.stringify(report, null, 2));
  const changed = report.filter(r => r.desktopUnchanged === false).map(r => r.name);
  if (changed.length) console.log(`desktop changed (review by eye, live data may differ): ${changed.join(', ')}`);
  console.log(failures ? `${failures} phone screenshots overflow` : 'no horizontal overflow');
  process.exitCode = failures ? 1 : 0;
}
