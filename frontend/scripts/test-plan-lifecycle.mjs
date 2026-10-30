import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Real UI with explicitly synthetic preview services; never writes to Supabase.
const server = await createServer({ server: { port: 0 } });
const output = process.env.LIFECYCLE_SCREENSHOTS ?? '/tmp/bunker-lifecycle-ui';
let browser;
try {
  await server.listen(); await mkdir(output, { recursive: true });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/preview.html', server.resolvedUrls.local[0]).href);
  await page.getByText('Demo controls', { exact: true }).click();
  const select = page.getByLabel('Starting state');
  const snap = async name => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
    await page.locator('.preview-tools').evaluate(el => { el.style.visibility = 'hidden'; });
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    await page.locator('.preview-tools').evaluate(el => { el.style.visibility = ''; });
  };
  await select.selectOption('rec-awaiting');
  await page.getByRole('button', { name: 'Withdraw request', exact: true }).click();
  await page.getByLabel('Withdrawal reason (optional)').fill('Delivery schedule changed.');
  await snap('withdraw-desktop');
  await page.getByRole('button', { name: 'Confirm withdrawal', exact: true }).click();
  await page.getByRole('heading', { name: 'Request withdrawn', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Copy to new draft', exact: true }).click();
  await page.getByRole('button', { name: 'Create linked draft', exact: true }).click();
  await page.getByRole('heading', { name: 'Your purchase plan', exact: true }).waitFor();
  await page.getByText('Earlier reason: Delivery schedule changed.', { exact: true }).waitFor();
  await snap('copied-draft-desktop');

  await select.selectOption('rec-approved');
  await page.getByRole('button', { name: 'Record purchase', exact: true }).click();
  await page.getByLabel('Supplier', { exact: true }).fill('Synthetic supplier');
  await page.getByLabel('Actual quantity (MT)', { exact: true }).fill('20.5');
  await page.getByLabel('Price paid (USD/MT)', { exact: true }).fill('1200.12');
  await snap('purchase-form-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await snap('purchase-form-mobile');
  await page.getByRole('button', { name: 'Confirm purchase record', exact: true }).click();
  await page.getByRole('region', { name: 'Recorded purchase', exact: true }).waitFor();
  await page.getByText('USD 24,602.46', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Record purchase', exact: true }).count(), 0);
  await snap('purchase-record-mobile');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await snap('purchase-record-desktop');
  await page.getByRole('link', { name: 'Back to purchase plans', exact: true }).click();
  await page.getByRole('button', { name: 'Mark as seen', exact: true }).click();
  await page.getByRole('link', { name: '1 unread decision', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Finished', exact: true }).click();
  await page.getByText('Purchased', { exact: true }).waitFor();
  await snap('decisions-and-finished-plans');

  await select.selectOption('rec-review');
  await page.getByRole('button', { name: 'Approve recommendation', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await page.getByRole('heading', { name: 'Recommendation approved', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Record purchase', exact: true }).count(), 0, 'Manager is read-only after deciding');
  assert.deepEqual(errors, []);
  console.log(`PASS withdrawal, linked draft, purchase, comparison, notifications, filters, manager role and desktop/mobile overflow. Screenshots: ${output}`);
} finally {
  await browser?.close(); await server.close();
}
