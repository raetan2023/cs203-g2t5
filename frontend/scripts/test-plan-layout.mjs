import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Render the real page and stylesheet with synthetic plans, without Clerk or a backend.
const server = await createServer({ server: { port: 0 } });
let browser;
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', error => console.error(error));
  await page.route('**/__layout-test__', async route => {
    const html = await server.transformIndexHtml('/__layout-test__', `
      <html><body style="margin:0"><div id="root"></div><script type="module">
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import { PurchasePlanPage } from '/src/features/purchase-plan/PurchasePlanPage.tsx';
        import { createMockPlanService } from '/src/features/purchase-plan/mockService.ts';
        import { DEMO_PLAN, DEMO_SCENARIO_DATE } from '/src/features/purchase-plan/fixtures.ts';
        window.renderPlans = (canEdit, count) => {
          const service = createMockPlanService({ delayMs: 0, initialPlans: Array.from({length: count}, (_, i) => ({...DEMO_PLAN, plan_id: 'plan-' + i})) });
          window.planRoot ??= ReactDOM.createRoot(document.getElementById('root'));
          window.planRoot.render(React.createElement(PurchasePlanPage, {service, scenarioDate: DEMO_SCENARIO_DATE, canEdit}));
        };
        window.renderPlans(false, 3);
      </script></body></html>`);
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto(new URL('/__layout-test__', origin).href);
  await page.waitForFunction(() => typeof window.renderPlans === 'function');
  for (const canEdit of [false, true]) {
    for (const count of [1, 3]) {
      await page.evaluate(({canEdit, count}) => window.renderPlans(canEdit, count), {canEdit, count});
      await page.waitForFunction(count => document.querySelectorAll('.pp-summary').length === count, count);
      for (const width of [1920, 1280, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page.evaluate(() => {
          const cards = [...document.querySelectorAll('.pp-summary')].map(card => {
            const { x, y, width, right, bottom } = card.getBoundingClientRect();
            return { x, y, width, right, bottom };
          });
          const overflow = [...document.querySelectorAll('.pp-actions .pp-button')].some(button => {
            const rect = button.getBoundingClientRect();
            const card = button.closest('.pp-summary').getBoundingClientRect();
            return rect.x < card.x || rect.right > card.right || rect.bottom > card.bottom;
          });
          return { cards, overflow, scrollWidth: document.documentElement.scrollWidth };
        });
        assert.ok(layout.scrollWidth <= width, `page overflow at ${width}px`);
        assert.equal(layout.overflow, false, `button overflow at ${width}px`);
        if (count > 1) {
          if (width >= 1280) {
            assert.equal(layout.cards[0].y, layout.cards[1].y, 'desktop cards share a row');
            assert.ok(layout.cards[1].x > layout.cards[0].x, 'desktop cards sit side by side');
          } else {
            assert.ok(layout.cards[1].y >= layout.cards[0].bottom, 'narrow cards stack without overlap');
          }
        }
        assert.ok(Math.abs(Math.max(...layout.cards.map(card => card.right)) - (width - (width <= 640 ? 16 : 40))) < 2,
          'cards use available width');
        console.log(`PASS ${canEdit ? 'buyer' : 'manager'} / ${count} plans / ${width}px`);
      }
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
