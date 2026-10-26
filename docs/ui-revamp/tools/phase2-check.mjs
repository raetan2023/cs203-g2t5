// Desktop shell acceptance checks. Does not replace approved visual baselines.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const output = new URL('../phase2/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const results = [];
try {
  for (const state of ['home', 'home-loading', 'session-error', 'loading', 'load-error', 'saved', 'rec-ready']) {
    await page.goto('http://127.0.0.1:5173/preview.html');
    await page.locator('summary', { hasText: 'Demo controls' }).click();
    await page.selectOption('#preview-state', state);
    await page.addStyleTag({ content: '.preview-tools{display:none!important}' });
    await page.waitForTimeout(state.includes('loading') ? 1500 : 3000);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${state}: horizontal overflow`);
    const header = page.locator('.bb-header');
    assert.equal(await header.count(), 1, `${state}: shared header`);
    assert.equal(await header.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(12, 13, 14)');
    await page.screenshot({ path: fileURLToPath(new URL(`${state}-desktop.png`, output)), fullPage: true });
    const audit = await new AxeBuilder({ page }).include('.bb-header').analyze();
    assert.deepEqual(audit.violations.map(v => v.id), [], `${state}: header accessibility`);
    results.push({ state, headerAccessibility: 'pass', desktopOverflow: 'pass' });
    if (state === 'home') {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      const dialog = page.getByRole('dialog', { name: 'Main navigation' });
      await dialog.waitFor();
      assert.equal(await page.getByRole('button', { name: 'Close navigation' }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.getByRole('button', { name: 'Close navigation' }).evaluate(el => el === document.activeElement), true);
      assert.equal(await dialog.locator('[aria-current=page]').innerText(), 'Home');
      const bounds = await dialog.evaluate(el => {
        const r = el.getBoundingClientRect();
        return [...el.querySelectorAll('button, a, .bb-brand')].every(child => {
          const c = child.getBoundingClientRect();
          return c.left >= r.left && c.right <= r.right;
        });
      });
      assert.equal(bounds, true, 'navigation controls fit in the dialog');
      const navAudit = await new AxeBuilder({ page }).include('.bb-sidebar').analyze();
      assert.deepEqual(navAudit.violations.map(v => v.id), [], 'navigation accessibility');
      await page.screenshot({ path: fileURLToPath(new URL('navigation-desktop.png', output)) });
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button', { name: 'Open navigation' }).evaluate(el => el === document.activeElement), true);
      results.push({ navigation: 'focus loop, Escape, focus return, active item, control bounds and axe pass' });
    }
  }
  await writeFile(new URL('checks.json', output), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
