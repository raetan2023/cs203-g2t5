// Captures the approved wireframe login as the visual reference (finished state, reduced motion).
import { chromium } from '@playwright/test';

const url = process.env.WIREFRAME_URL ?? 'http://127.0.0.1:5175/wireframe.html';
const browser = await chromium.launch();
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `../reference/wireframe-login-${name}.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log('saved to ../reference/');
