import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Keys of `examples` in frontend/src/preview/PreviewApp.tsx that render without an extra action.
const STATES = [
  'login', 'signup', 'home', 'home-loading', 'session-error',
  'multiple', 'empty', 'saved', 'loading', 'load-error',
  'rec-ready', 'rec-loading', 'rec-error', 'rec-unavailable', 'rec-missing', 'rec-unsupported', 'rec-empty',
];
const only = process.env.STATES?.split(',');

async function openState(page: Page, key: string) {
  await page.goto('/preview.html');
  await page.locator('summary', { hasText: 'Demo controls' }).click();
  await page.selectOption('#preview-state', key);
  await page.addStyleTag({ content: '.preview-tools{display:none!important}' });
  // Mock auth takes ~0.65s, then the plan/recommendation service ~0.7s. The *-loading states delay
  // 8s, so 1.5s lands inside the loading screen; everything else needs to settle.
  await page.waitForTimeout(key.includes('loading') ? 1500 : 3000);
}

for (const key of STATES.filter(k => !only || only.includes(k))) {
  test.describe(key, () => {
    test.beforeEach(async ({ page }) => openState(page, key));

    test(`${key} · layout`, async ({ page }) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(0);
      const tiny = await page.evaluate(() => [...document.body.querySelectorAll<HTMLElement>('*')]
        .filter(e => !e.closest('.preview-tools') && e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim()))
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 12)
        .map(e => `${e.tagName.toLowerCase()}.${e.className}`).slice(0, 10));
      expect.soft(tiny, 'text under 12px').toEqual([]);
    });

    test(`${key} · theme`, async ({ page }) => {
      // Every rendered colour must equal one of the --bb-* colour tokens.
      const offTheme = await page.evaluate(() => {
        const probe = document.createElement('i'); document.body.append(probe);
        const norm = (v: string) => { probe.style.color = ''; probe.style.color = v; return getComputedStyle(probe).color; };
        const allowed = new Set(['rgba(0, 0, 0, 0)']);
        const root = getComputedStyle(document.documentElement);
        for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) {
          const r = rule as CSSStyleRule;
          if (r.selectorText !== ':root') continue;
          for (const name of r.style) {
            const v = root.getPropertyValue(name).trim();
            if (name.startsWith('--bb-') && CSS.supports('color', v)) allowed.add(norm(v));
          }
        }
        probe.remove();
        const bad: string[] = [];
        for (const e of document.body.querySelectorAll<HTMLElement>('*')) {
          if (e.closest('.preview-tools')) continue;
          const s = getComputedStyle(e);
          const checks: [string, string][] = [['color', s.color], ['background', s.backgroundColor]];
          if (parseFloat(s.borderTopWidth) > 0) checks.push(['border', s.borderTopColor]);
          if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) checks.push(['outline', s.outlineColor]);
          for (const [prop, val] of checks) if (!allowed.has(val)) bad.push(`${e.tagName.toLowerCase()}.${e.className || '-'} ${prop}=${val}`);
        }
        return [...new Set(bad)].slice(0, 25);
      });
      expect(offTheme, 'colours that are not --bb-* tokens').toEqual([]);
    });

    test(`${key} · a11y`, async ({ page }) => {
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(result.violations.map(v => `${v.id} x${v.nodes.length}`)).toEqual([]);
    });

    test(`${key} · focus`, async ({ page }) => {
      const hidden: string[] = [];
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab');
        const r = await page.evaluate(() => {
          const e = document.activeElement as HTMLElement | null;
          if (!e || e === document.body) return null;
          const s = getComputedStyle(e);
          const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
          return { name: `${e.tagName.toLowerCase()}${e.getAttribute('aria-label') ? `[${e.getAttribute('aria-label')}]` : ''}`, ring };
        });
        if (r && !r.ring) hidden.push(r.name);
      }
      expect.soft([...new Set(hidden)], 'focused elements with no outline/shadow').toEqual([]);
    });

    test(`${key} · visual`, async ({ page }) => {
      await expect(page).toHaveScreenshot(`${key}.png`, { fullPage: true });
    });
  });
}
