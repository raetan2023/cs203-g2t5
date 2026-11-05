import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 0 } });
const output = '/tmp/manager-decision-b';
let browser;
try {
  await server.listen(); await mkdir(output, { recursive: true });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/manager-review-preview.html', server.resolvedUrls.local[0]).href);
  const panel = () => page.getByRole('dialog');
  const screenshot = async name => {
    const layout = await panel().evaluate(el => {
      const box = el.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width, pageWidth: innerWidth, overflow: el.scrollWidth > el.clientWidth };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.pageWidth + 1, `${name}: panel outside viewport ${JSON.stringify(layout)}`);
    assert.equal(layout.overflow, false, `${name}: horizontal panel overflow`);
    await panel().screenshot({ path: `${output}/${name}.png` });
  };
  await page.getByRole('dialog', { name: 'Approve plan', exact: true }).waitFor();
  await page.getByText('USD 133,799', { exact: true }).waitFor();
  await screenshot('normal-desktop');
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() => document.querySelector('.md-panel').getBoundingClientRect().width <= innerWidth);
    await screenshot(`normal-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Confirm rejection', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await screenshot('validation');
  await page.getByRole('textbox', { name: 'Rejection reason (required)' }).fill('Outside the approved budget.');
  await page.getByRole('button', { name: 'Confirm rejection', exact: true }).click();
  await page.getByRole('button', { name: 'Close review' }).isDisabled().then(value => assert.equal(value, true));
  await screenshot('submitting');
  await page.getByRole('heading', { name: 'Plan rejected', exact: true, level: 3 }).waitFor();
  await screenshot('success');
  await page.getByRole('button', { name: 'Back to plan', exact: true }).click();
  await page.getByText('Preview decision saved. Shared data was not changed.', { exact: true }).waitFor();

  await page.getByLabel('Example state').selectOption('conflict');
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await page.getByRole('heading', { name: 'Plan already decided', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Confirm approval', exact: true }).count(), 0);
  await screenshot('already-decided');
  await page.getByRole('button', { name: 'Reload request', exact: true }).click();

  await page.getByLabel('Example state').selectOption('error');
  await page.getByRole('textbox', { name: 'Approval comment (optional)' }).fill('Proceed with the supplier.');
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await page.getByText('Couldn’t save your decision', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox').inputValue(), 'Proceed with the supplier.');
  await screenshot('error');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Approve recommendation', exact: true }).click();
  await page.getByRole('button', { name: 'Close review', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button', { name: 'Confirm approval', exact: true }).evaluate(el => document.activeElement === el), true);
  assert.deepEqual(errors, []);
  console.log(`PASS direction B: saved values, validation, submitting, success, conflict, failure, keyboard and 320–1440px. Screenshots: ${output}`);
} finally { await browser?.close(); await server.close(); }
