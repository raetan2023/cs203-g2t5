import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Synthetic large-quantity plan, using the production page, providers and styles.
const server = await createServer({ server: { port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__recommendation-layout__', async route => {
    const html = await server.transformIndexHtml('/__recommendation-layout__', `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root" class="bb-app"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/app/app.css';
      import { RecommendationsPage } from '/src/features/recommendations/RecommendationsPage.tsx';
      import { ForecastProvider } from '/src/features/forecast/ForecastContext.tsx';
      import { buildMockForecast } from '/src/features/forecast/mockService.js';
      import { createMockPlanService } from '/src/features/purchase-plan/mockService.ts';
      import { DEMO_PLAN, DEMO_ANALYSIS } from '/src/features/purchase-plan/fixtures.ts';
      const today = '2026-10-27';
      const plan = {...DEMO_PLAN, quantity_mt: 9898989, scenario_as_of_date: today, purchase_deadline: '2026-11-15', days_remaining: 19};
      const planService = createMockPlanService({initialPlan: plan, scenarioDate: today, delayMs: 0});
      const forecastAt = h => ({...buildMockForecast(h), run_id: 'layout-fixture', forecast: 1351.5, low: 1199.583, high: 1385.546,
        anchor_price: 1351.5, anchor_quote_date: '2026-10-26', forecast_origin_date: '2026-10-26',
        target_date: new Date(Date.parse('2026-10-26') + h * 86400000).toISOString().slice(0,10),
        model_version: 'ridge-sha256-' + 'a'.repeat(64), interval: {...buildMockForecast(h).interval, method: 'experimental_gdelt_scaled_quantiles'}});
      const forecastService = {read: async h => forecastAt(h)};
      const read = async (context, h = 7) => {
        const f = forecastAt(h), q = context.quantity_mt;
        return {...structuredClone(DEMO_ANALYSIS), context, source: 'mock',
          reference: {status: 'ready', value: {price: f.anchor_price, observation_date: f.anchor_quote_date, basis: {commodity: 'MGO', currency: 'USD', unit: 'MT'}}},
          forecast: {status: 'ready', value: {central_estimate: f.forecast, target_date: f.target_date, prices: {lower: f.low, upper: f.high}, basis: {commodity: 'MGO', currency: 'USD', unit: 'MT'}, range_description: 'Synthetic model detail ' + 'a'.repeat(256)}},
          cost_impact: {status: 'ready', value: {currency: 'USD', target_date: f.target_date, reference_total: q*f.anchor_price, forecast_total: {lower: q*f.low, upper: q*f.high}, difference_total: {lower: q*(f.low-f.anchor_price), upper: q*(f.high-f.anchor_price)}}},
          recommendation: {status: 'ready', value: {recommendation_id: 'layout', action: 'MONITOR', explanation: 'Monitor prices. The weighted uncertainty range overlaps today’s price.', evidence: {
            policy_version: 'deadline-weighted-v1', urgency: context.urgency ?? 'NORMAL', direction: 'FLAT', interval_width_fraction: .1376,
            buy_now_cost_usd: q*f.anchor_price, alternative_cost_usd: q*f.forecast, alternative_minus_now_usd: 0,
            reference_age_days: 1, supported_target_date: f.target_date, horizon_description: 'Synthetic 7/14/30-day fixtures',
            reasons: ['The eligible price signal is flat; uncertainty overlaps the reference price.', 'Uncertainty remains; obtain a current supplier quote.'],
            limitations: ['Experimental; no guaranteed savings.'], allocations: []}}}};
      };
      const service = {read, readImpact: read};
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ForecastProvider, {service: forecastService, scenarioDate: today}, React.createElement(RecommendationsPage, {planService, service, scenarioDate: today, planId: plan.plan_id})));
      </script></body></html>`);
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto(new URL('/__recommendation-layout__', server.resolvedUrls.local[0]).href);
  await page.getByRole('heading', { name: 'Monitor', exact: true }).waitFor();
  for (const width of [1920, 1440, 1280, 1024, 768, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const expanded of [false, true]) {
      await page.locator('.timing-chart-disclosure').evaluate((el, open) => { el.open = open; }, expanded);
      await page.locator('.rec-assumptions').evaluate((el, open) => { el.open = open; }, expanded);
      await page.locator('.rec-impact details').evaluate((el, open) => { el.open = open; }, expanded);
      const layout = await page.evaluate(() => {
        const rect = selector => {
          const {x,y,right,bottom} = document.querySelector(selector).getBoundingClientRect();
          return {x,y,right,bottom};
        };
        return { scrollWidth: document.documentElement.scrollWidth, impact: rect('.rec-impact'), guidance: rect('.rec-guidance'),
          overflow: [...document.querySelectorAll('.recommendations button, .recommendations select, .rec-evidence-grid dd')].filter(el => el.getClientRects().length && (el.getBoundingClientRect().right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2)).map(el => el.textContent) };
      });
      assert.ok(layout.scrollWidth <= width, `page overflow at ${width}px, expanded=${expanded}`);
      assert.deepEqual(layout.overflow, [], `content overflow at ${width}px`);
      if (width >= 1280) {
        assert.equal(layout.impact.y, layout.guidance.y, 'desktop panels share a row');
        assert.ok(layout.guidance.x >= layout.impact.right - 1, 'desktop panels do not overlap');
        if (!expanded) assert.ok(layout.impact.y < 1000, 'cost summary appears within the first desktop scroll');
      } else {
        assert.ok(layout.guidance.y >= layout.impact.bottom - 1, 'narrow panels stack');
      }
      console.log('PASS ' + width + 'px / details ' + (expanded ? 'open' : 'closed'));
    }
    if (process.env.LAYOUT_SCREENSHOT_DIR && [1440, 390].includes(width)) {
      await page.locator('details').evaluateAll(elements => elements.forEach(el => { el.open = false; }));
      await mkdir(process.env.LAYOUT_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: process.env.LAYOUT_SCREENSHOT_DIR + '/recommendation-' + width + '.png', fullPage: true });
    }
  }
  assert.match(await page.locator('.rec-total-value').innerText(), /USD 11\.87bn–13\.72bn/);
  await page.getByRole('button', { name: /14 days/ }).first().click();
  await page.waitForFunction(() => document.querySelector('.timing-option[aria-pressed="true"]')?.textContent.includes('14 days'));
  assert.match(await page.locator('.rec-horizon-bar').innerText(), /09 Nov 2026/);
  assert.equal(await page.getByRole('button', { name: /30 days/ }).first().isDisabled(), true);
  assert.equal(await page.getByLabel('Urgency for this analysis', {exact: true}).count(), 0);
  assert.equal(await page.getByRole('region', {name: 'Recommendation', exact: true}).count(), 1);
  await page.getByRole('heading', {name: 'Monitor', exact: true}).waitFor();
  assert.equal(await page.locator('.rec-assumptions').getAttribute('open'), null);
  await page.getByText('Assumptions and limitations', {exact: true}).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.getByText('Experimental; no guaranteed savings.', {exact: true}).isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('PASS horizon selection, deadline guard, single recommendation, disclosure and billion-dollar formatting');
} finally {
  await browser?.close();
  await server.close();
}
