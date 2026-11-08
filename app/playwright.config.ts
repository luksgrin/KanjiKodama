/**
 * End-to-end tests of the built web app in real browser engines at phone sizes (`npm run e2e`).
 * WebKit stands in for iOS Safari, Chromium for Android Chrome / Samsung Internet, Firefox (desktop
 * engine: Playwright has no Firefox mobile) at a phone viewport. See test/e2e/README.md.
 *
 * The app is built with the private content and served on 127.0.0.1 only (test/e2e/serve.sh).
 * Nothing is deployed; screenshots go to test/e2e/screenshots/ (git-ignored: they show WaniKani text).
 */
import { defineConfig, devices, type Project } from '@playwright/test';

const PORT = Number(process.env.KK_E2E_PORT ?? 4317);

/** Samsung Internet on a Galaxy S23-class phone (360×780 CSS px, dpr 3). */
const SAMSUNG_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36';
/** A small, old Android phone (320×568). */
const SMALL_ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/130.0.0.0 Mobile Safari/537.36';

const dark = { colorScheme: 'dark' as const };

const projects: Project[] = [
  // iOS (WebKit)
  { name: 'iphone-se', use: { ...devices['iPhone SE (3rd gen)'] } },
  { name: 'iphone-15', use: { ...devices['iPhone 15'] } },
  { name: 'iphone-15-dark', use: { ...devices['iPhone 15'], ...dark } },
  { name: 'iphone-15-pro-max', use: { ...devices['iPhone 15 Pro Max'] } },
  { name: 'ipad', use: { ...devices['iPad (gen 11)'] } },
  // Android (Chromium)
  { name: 'pixel-5', use: { ...devices['Pixel 5'] } },
  { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  { name: 'pixel-7-dark', use: { ...devices['Pixel 7'], ...dark } },
  { name: 'galaxy-s9plus', use: { ...devices['Galaxy S9+'] } },
  {
    name: 'galaxy-s23-samsung',
    use: {
      browserName: 'chromium', userAgent: SAMSUNG_UA, viewport: { width: 360, height: 780 },
      deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    },
  },
  {
    name: 'android-small-320',
    use: {
      browserName: 'chromium', userAgent: SMALL_ANDROID_UA, viewport: { width: 320, height: 568 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    },
  },
  // Firefox (desktop engine at a phone viewport; isMobile is not supported by Firefox)
  { name: 'firefox-390', use: { browserName: 'firefox', viewport: { width: 390, height: 844 }, hasTouch: true } },
  { name: 'firefox-390-dark', use: { browserName: 'firefox', viewport: { width: 390, height: 844 }, hasTouch: true, ...dark } },
];

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test/e2e/results',
  globalSetup: './test/e2e/global-setup.ts',
  fullyParallel: true,
  workers: process.env.KK_E2E_WORKERS ?? '50%',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: './test/e2e/report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    locale: 'en-US',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Most tests don't want the service worker in the way; the offline test turns it on.
    serviceWorkers: 'block',
  },
  projects,
  webServer: {
    command: 'sh test/e2e/serve.sh',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: process.env.KK_E2E_REUSE === '1',
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
