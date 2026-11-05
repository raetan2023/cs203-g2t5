import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 0 } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__admin-layout__', async route => {
    const html = await server.transformIndexHtml('/__admin-layout__', `
      <html><body style="margin:0"><div class="bb-app" id="root"></div><script type="module">
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import '/src/styles/tokens.css'; import '/src/app/app.css';
        import { AdminPage } from '/src/features/admin/AdminPage.tsx';
        window.manageOpened = 0;
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AdminPage,{organisationName: 'Bunker Buddy · Preview', onManageOrganisation: () => window.manageOpened++}));
      </script></body></html>`);
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto(new URL('/__admin-layout__', server.resolvedUrls.local[0]).href);
  await page.getByRole('heading', { name: 'Bunker Buddy · Preview' }).waitFor();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByText('Which role should I assign?').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow at ${width}px`);
    if (width === 1440 || width === 390) await page.screenshot({ path: '/tmp/admin-system-health-' + width + '.png', fullPage: true });
    await page.getByText('Which role should I assign?').click();
    console.log('PASS admin console / ' + width + 'px');
  }
  assert.equal(await page.getByRole('button', { name: /retrain/i }).count(), 0);
  await page.getByRole('button', { name: 'Manage organisation' }).click();
  assert.equal(await page.evaluate(() => window.manageOpened), 1);
  assert.deepEqual(errors, []);
  console.log('PASS organisation profile action and no retraining controls');
} finally {
  await browser?.close(); await server.close();
}
