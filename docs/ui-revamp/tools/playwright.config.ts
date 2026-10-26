import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  snapshotPathTemplate: '{testDir}/baselines/{arg}-{projectName}{ext}',
  // Default threshold 0.2 hides dark-on-dark changes, so keep it tight for this theme.
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.02, animations: 'disabled' } },
  use: { baseURL: 'http://127.0.0.1:5173', reducedMotion: 'reduce' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
