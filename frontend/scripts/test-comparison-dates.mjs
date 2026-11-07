import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false } });
let browser;
try {
  await server.listen();
  console.log('Started comparison preview');
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  await page.route(/\/__comparison-dates-(?:current|stale)__$/, async route => {
    const path = new URL(route.request().url()).pathname;
    const current = path.includes('-current');
    const html = await server.transformIndexHtml(path, `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root" class="bb-app"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/app/app.css';
      import '/src/features/recommendations/recommendations.css';
      import {CompareBuyingDates} from '/src/features/recommendations/TimingComparison.tsx';
      const today = '2026-11-06', quote = '2026-10-26';
      const entries = [7,14,30].map(h => ({horizon:h, forecast:{horizon_days:h,
        anchor_quote_date:quote, anchor_price:1351.5,
        target_date:new Date(Date.parse(${current} ? today : quote) + h * 86400000).toISOString().slice(0,10),
        forecast:1351.5, low:1056, high:1578}}));
      function Preview() {
        return React.createElement('main', {className:'recommendations'}, React.createElement(CompareBuyingDates,
          {entries, quantity:888, today, deadline:'2026-11-26', recommended:[]}));
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Preview));
      </script></body></html>`);
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  for (const current of [false, true]) {
    const port = server.httpServer.address().port;
    await page.goto(`http://127.0.0.1:${port}/__comparison-dates-${current ? 'current' : 'stale'}__`, {waitUntil:'domcontentloaded', timeout:15_000});
    await page.getByRole('group', {name:'14 days', exact:true}).waitFor({timeout:15_000});
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({width, height:1000});
      for (const [horizon, date] of [[7,'Fri 13 Nov'],[14,'Fri 20 Nov'],[30,'Sun 06 Dec']]) {
        const card = page.getByRole('group', {name:`${horizon} days`, exact:true});
        assert.equal(await card.locator('.rec-col-date').innerText(), date);
        assert.equal((await card.getAttribute('class')).includes('rec-col--unavailable'), !current);
        if (!current) assert.equal(await card.locator('.rec-col-plot').count(), 0, 'mismatched dates have no price plot');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
      if (process.env.LAYOUT_SCREENSHOT_DIR && width !== 320) {
        await mkdir(process.env.LAYOUT_SCREENSHOT_DIR, {recursive:true});
        await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOT_DIR}/dates-${current ? 'current' : 'stale'}-${width}.png`, fullPage:true});
      }
      console.log(`PASS ${width}px / ${current ? 'matching' : 'old'} forecast targets`);
    }
    if (current) {
      assert.equal(await page.getByRole('button', {name:/days$/}).count(), 0, 'dates are not selectable');
      assert.equal(await page.getByRole('group', {name:'30 days', exact:true}).getAttribute('class').then(s => s.includes('rec-col--late')), true);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
