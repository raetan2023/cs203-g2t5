import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Synthetic team data; no Clerk session, production API or shared database access.
const server = await createServer({ server: { port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__manager-layout__', async route => {
    const html = await server.transformIndexHtml('/__manager-layout__', `
      <html><body style="margin:0"><div id="root"></div><script type="module">
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import '/src/styles/tokens.css';
        import { PurchasePlanPage } from '/src/features/purchase-plan/PurchasePlanPage.tsx';
        import { createMockPlanService } from '/src/features/purchase-plan/mockService.ts';
        import { DEMO_PLAN, DEMO_SCENARIO_DATE } from '/src/features/purchase-plan/fixtures.ts';
        const service = createMockPlanService({ delayMs: 0, initialPlans: [DEMO_PLAN] });
        service.notifications = async () => ({notifications: []});
        service.managerOverview = async () => ({plan_count: 1, total_quantity_mt: 12345.67,
          open_quantity_mt: 12345.67, pending_approval_count: 0,
          reference_price_usd_per_mt: 600, reference_date: '2026-11-02', exposure_usd: 7407402});
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(PurchasePlanPage,
          {service, scenarioDate: DEMO_SCENARIO_DATE, canEdit: false, isManager: true}));
      </script></body></html>`);
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto(new URL('/__manager-layout__', server.resolvedUrls.local[0]).href);
  await page.getByText('$7,407,402.00').waitFor();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`);
    const panel = page.getByRole('region', { name: 'Team oversight' });
    const rects = await panel.locator('dd').evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect(); return { left: box.left, right: box.right };
    }));
    assert.ok(rects.every(rect => rect.left >= 0 && rect.right <= width), `totals overflow at ${width}px`);
    if (width === 1440 || width === 390) await page.screenshot({ path: `/tmp/manager-oversight-${width}.png`, fullPage: true });
    console.log(`PASS manager oversight / ${width}px`);
  }
  const refresh = page.getByRole('button', { name: 'Refresh team overview' });
  await refresh.focus();
  await page.keyboard.press('Enter');
  await page.getByText('$7,407,402.00').waitFor();
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
