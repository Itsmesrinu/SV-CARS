/**
 * UI review harness — see .claude/skills/ui-review/SKILL.md.
 *
 * Microsoft Edge, always. `channel: 'msedge'` uses the Edge already installed on
 * this machine, so no Playwright browser download is needed and what we
 * screenshot is a real Chromium the customer could be running.
 *
 * Three projects, because the thing this site is judged on is the phone:
 *   mobile-small  360×740  the narrowest device that must not scroll sideways
 *   mobile        393×852  Pixel-class Android Chrome — ~all real traffic
 *   desktop      1440×900  the secondary case
 *
 * The dev server is started here and reused if one is already up on 3000. The
 * API is NOT started: `tests/ui/mock-api.ts` fulfils every /api/** route from
 * fixtures, so screenshots never depend on a Neon database being reachable.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/ui',
  outputDir: './.ui-review/_artifacts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Generous, because a cold `vite dev` pre-bundles dependencies on the first
  // navigation and that alone can eat 30s. A warm server does a page in ~5s.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: '.ui-review/_report', open: 'never' }],
  ],

  use: {
    baseURL: BASE_URL,
    channel: 'msedge',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Entrance animations are everywhere (motion/react). Reduced motion is both
    // the accessible path we must support and what makes shots deterministic.
    // A spec that is specifically reviewing an animation overrides this itself.
    reducedMotion: 'reduce',
  },

  projects: [
    {
      name: 'mobile-small',
      use: {
        ...devices['Galaxy S9+'],
        channel: 'msedge',
        viewport: { width: 360, height: 740 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        channel: 'msedge',
        viewport: { width: 393, height: 852 },
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      // Any non-empty value: `cldUrl()` returns '' without one and every <img>
      // would render the placeholder. The mock rewrites res.cloudinary.com to
      // the real .webp files in public/, so the cloud name is never dialled.
      VITE_CLOUDINARY_CLOUD_NAME: 'ui-review',
      DISABLE_HMR: 'true',
    },
  },
});
