import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// The production page inside the real app shell, through the preview harness and its sample data.
// Its own Vite cache, so this never disturbs a running dev server.
const server = await createServer({ cacheDir: 'node_modules/.vite-market-layout', server: { port: 0, fs: { strict: false } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/preview.html', server.resolvedUrls.local[0]).href);
  await page.getByText('Demo controls', { exact: true }).click();
  await page.locator('#preview-state').selectOption('market');
  await page.getByText('Demo controls', { exact: true }).click();
  await page.getByRole('heading', { name: 'How this forecast was made' }).waitFor({ timeout: 60000 });
  await page.getByRole('heading', { name: 'Market pulse' }).waitFor();

  for (const width of [1920, 1440, 1280, 1024, 768, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    const layout = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const clipped = element => element.scrollWidth > element.clientWidth + 1;
      const sales = document.querySelector('.sm-sales .sm-table-scroll');
      return { scrollWidth: document.documentElement.scrollWidth, salesClipped: sales.scrollWidth - sales.clientWidth,
        overflow: [...document.querySelectorAll('.stored-market button, .sm-price, .mf-value, .mf-steps strong, .sm-history-price')].filter(clipped).map(element => element.textContent),
        order: ['.sm-prices', '.mf', '.sm-history', '.sm-lower-grid'].map(selector => [box(selector).top, box(selector).bottom]),
        smallTargets: [...document.querySelectorAll('.stored-market .bb-button, .sm-range button, .sm-history select, .sm-search input')].filter(element => element.getBoundingClientRect().height < 44).map(element => element.textContent) };
    });
    assert.ok(layout.scrollWidth <= width, `page overflow at ${width}px: ${layout.scrollWidth}`);
    assert.deepEqual(layout.overflow, [], `content overflow at ${width}px`);
    assert.ok(layout.salesClipped <= 1, `sales figures clipped at ${width}px`);
    assert.deepEqual(layout.smallTargets, [], `controls under 44px at ${width}px`);
    layout.order.slice(1).forEach(([top], index) => assert.ok(top >= layout.order[index][1] - 1, `block ${index + 1} overlaps the one above at ${width}px`));
    console.log(`PASS ${width}px`);
    if (process.env.LAYOUT_SCREENSHOT_DIR && [1440, 768, 390].includes(width)) {
      await mkdir(process.env.LAYOUT_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/market-${width}.png`, fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'View recent values' }).click();
  assert.equal(await page.locator('.sm-history table tbody tr').count(), 7);
  await page.getByRole('button', { name: 'View all 16 categories' }).click();
  assert.equal(await page.locator('.sm-sales tbody tr').count(), 16);
  assert.deepEqual(errors, []);
  console.log('PASS interactions');
} finally {
  await browser?.close();
  await server.close();
}
