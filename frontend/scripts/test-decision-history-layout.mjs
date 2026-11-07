import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// The decision history page with its sample data (scripts/decision-history-preview): no overflow at any width,
// every control at least 44px tall, cards stacked in order, and the filter and search still working.
// Its own Vite cache, so this never disturbs a running dev server.
const server = await createServer({ cacheDir: 'node_modules/.vite-decision-history-layout', server: { port: 0, fs: { strict: false } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const open = async (state) => {
    await page.goto(new URL(`/scripts/decision-history-preview/index.html?state=${state}`, server.resolvedUrls.local[0]).href);
    await page.getByRole('heading', { level: 1, name: 'Decision history' }).waitFor({ timeout: 60000 });
  };
  const shoot = async (name) => {
    if (!process.env.LAYOUT_SCREENSHOT_DIR) return;
    await mkdir(process.env.LAYOUT_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/${name}.png`, fullPage: true });
  };

  await open('ready');
  await page.getByRole('tabpanel').waitFor();
  assert.equal(await page.getByRole('article').count(), 5, 'one card per submitted plan, no draft');

  for (const width of [1920, 1440, 1280, 1024, 768, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    const layout = await page.evaluate(() => {
      const clipped = element => element.scrollWidth > element.clientWidth + 1;
      const boxes = [...document.querySelectorAll('.dh-card')].map(card => card.getBoundingClientRect());
      return {
        scrollWidth: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll('.dh-tile-value, .dh-action, .dh-pill, .dh-chip, .dh-tabs [role=tab]')].filter(clipped).map(element => element.textContent),
        order: boxes.map(box => [box.top, box.bottom]),
        smallTargets: [...document.querySelectorAll('.dh-tabs [role=tab], .dh-search input, .dh .bb-button')].filter(element => element.getBoundingClientRect().height < 44).map(element => element.textContent),
      };
    });
    assert.ok(layout.scrollWidth <= width, `page overflow at ${width}px: ${layout.scrollWidth}`);
    assert.deepEqual(layout.overflow, [], `content overflow at ${width}px`);
    assert.deepEqual(layout.smallTargets, [], `controls under 44px at ${width}px`);
    layout.order.slice(1).forEach(([top], index) => assert.ok(top >= layout.order[index][1] - 1, `card ${index + 1} overlaps the one above at ${width}px`));
    console.log(`PASS ${width}px`);
    if ([1440, 768, 390].includes(width)) await shoot(`decision-history-${width}`);
  }

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('tab', { name: /Approved/ }).click();
  assert.equal(await page.getByRole('article').count(), 1);
  assert.equal(await page.getByRole('list', { name: 'Progress' }).count(), 1, 'approved card shows its progress');
  await page.getByRole('tab', { name: 'All' }).click();
  await page.getByLabel('Find a plan').fill('6,767');
  assert.equal(await page.getByRole('article').count(), 1);
  await page.getByLabel('Find a plan').fill('');
  assert.equal(await page.getByRole('article').count(), 5);
  console.log('PASS interactions');

  await open('empty');
  await page.getByText('Nothing submitted yet').waitFor();
  await shoot('decision-history-empty');
  await open('error');
  await page.getByRole('alert').waitFor();
  await shoot('decision-history-error');
  await open('loading');
  await page.getByRole('status', { name: 'Loading your decisions' }).waitFor();
  await shoot('decision-history-loading');
  console.log('PASS states');

  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
