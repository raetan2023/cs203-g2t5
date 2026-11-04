import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Exercise real routes and styles with an isolated synthetic session. No live account or data writes.
const server = await createServer({ server: { port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = server.resolvedUrls.local[0];
  await page.route('**/__home-navigation__', async route => {
    const html = await server.transformIndexHtml('/__home-navigation__', `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body><div id="root"></div><script type="module">
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import { App } from '/src/app/App.tsx';
        import { createMockAuthService, DEMO_USER } from '/src/preview/mockAuthService.ts';
        import { createMockPlanService } from '/src/features/purchase-plan/mockService.ts';
        history.replaceState(null, '', '/home');
        const auth = createMockAuthService({user: DEMO_USER, delayMs: 0});
        const plans = createMockPlanService({delayMs: 0});
        const quote = async () => ({value: 1351.5, currency: 'USD', unit: 'USD/MT',
          observedDate: '2026-10-26', history: [1340, 1351.5]});
        const Market = () => React.createElement('h1', null, 'Synthetic market dashboard');
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, {
          auth, createPlanService: () => plans, scenarioDate: '2026-11-04',
          readMarketQuote: quote, MarketDashboard: Market,
        }));
      </script></body></html>`);
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  const home = async () => {
    await page.goto(new URL('/__home-navigation__', origin).href);
    await page.getByRole('link', { name: 'Open purchase plans', exact: true }).waitFor();
  };
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await home();
    if (process.env.LAYOUT_SCREENSHOT_DIR) {
      await mkdir(process.env.LAYOUT_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.LAYOUT_SCREENSHOT_DIR}/home-${width}.png`, fullPage: true });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // The photograph and greeting both open plans, beyond the visible CTA's bounds.
    for (const target of ['background', 'greeting']) {
      if (target === 'background') await page.mouse.click(width / 2, 250);
      else {
        const greeting = await page.getByRole('heading', { level: 1 }).boundingBox();
        await page.mouse.click(greeting.x + greeting.width / 2, greeting.y + greeting.height / 2);
      }
      await page.waitForURL('**/purchase-plans');
      await page.locator('.purchase-plan').waitFor();
      assert.equal(await page.locator('.purchase-plan').evaluate(el => getComputedStyle(el).animationName), 'bb-page-enter');
      await home();
    }
    await page.getByRole('button', { name: 'Open navigation' }).click();
    assert.equal(await page.getByRole('dialog', { name: 'Main navigation' }).isVisible(), true);
    assert.match(page.url(), /\/home$/);
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: /Open market dashboard/ }).click();
    await page.getByRole('heading', { name: 'Synthetic market dashboard' }).waitFor();
    assert.match(page.url(), /\/market-dashboard$/);
    await home();
    const background = page.getByRole('link', { name: 'Open purchase plans', exact: true });
    await background.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/purchase-plans');
    console.log(`PASS ${width}px: background, greeting, keyboard, header and market navigation`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await home();
  await page.mouse.click(195, 250);
  await page.locator('.purchase-plan').waitFor();
  assert.equal(await page.locator('.purchase-plan').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.deepEqual(errors, []);
  console.log('PASS reduced motion: immediate navigation with no arrival animation');
} finally {
  await browser?.close();
  await server.close();
}
