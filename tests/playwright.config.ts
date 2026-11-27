import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'node:path';
import { defineBddProject, cucumberReporter } from 'playwright-bdd';
import { getEnv } from './config/environments';

// Load env/<TEST_ENV>.env before anything reads process.env.
const envName = (process.env.TEST_ENV ?? 'local').toLowerCase();
dotenv.config({ path: path.resolve(__dirname, 'env', `${envName}.env`) });
process.env.TEST_ENV = envName;

const env = getEnv();

/**
 * Two ways to run the same pack:
 *   spec files     specs/**\/*.spec.ts            projects: api, ui-desktop, ui-mobile
 *   feature files  features/**\/*.feature (BDD)   projects: bdd-api, bdd-ui, bdd-mobile
 * The BDD projects compile each .feature into a spec under .features-gen/ (`npm run bddgen`,
 * done automatically by the bdd npm scripts) and run it through the same Playwright runner,
 * fixtures, Allure reporter and Winston logs as the hand-written specs.
 */
// Steps and the fixtures file they build on (src/core/fixtures.ts is imported by src/steps/bdd.ts).
const STEPS = ['src/steps/**/*.ts'];
const bdd = (name: string, features: string) =>
  defineBddProject({ name, features, steps: STEPS, outputDir: `.features-gen/${name}` });

export default defineConfig({
  testDir: '.',
  outputDir: 'test-results',
  globalSetup: './global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Cases share one seeded database, so run them one at a time by default.
  fullyParallel: false,
  workers: Number(process.env.WORKERS ?? 1),
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    cucumberReporter('html', { outputFile: 'cucumber-report/index.html' }),
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        detail: true,
        suiteTitle: false,
        environmentInfo: {
          environment: env.name,
          base_url: env.baseUrl,
          api_url: env.apiUrl,
          read_only: String(env.readOnly),
          node: process.version,
          os: process.platform,
        },
      },
    ],
  ],
  use: {
    baseURL: env.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    // ---- spec files ----
    { name: 'api', testDir: 'specs', testMatch: /specs\/(smoke|policy|claims|approvals|payout|security|audit|ops|catalogue)\/.*\.spec\.ts/, testIgnore: /catalogue\/ui-.*/ },
    {
      name: 'ui-desktop',
      testDir: 'specs',
      testMatch: /specs\/ui\/.*\.spec\.ts/,
      testIgnore: /.*mobile.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    { name: 'ui-mobile', testDir: 'specs', testMatch: /specs\/ui\/.*mobile.*\.spec\.ts/, use: { ...devices['Pixel 5'] } },

    // ---- cross-browser roll-up (TC-UI-019): the same journey in each browser ----
    { name: 'xb-chrome', testDir: 'specs/cross-browser', use: { ...devices['Desktop Chrome'] } },
    { name: 'xb-firefox', testDir: 'specs/cross-browser', use: { ...devices['Desktop Firefox'] } },
    { name: 'xb-safari', testDir: 'specs/cross-browser', use: { ...devices['Desktop Safari'] } },
    { name: 'xb-mobile-chrome', testDir: 'specs/cross-browser', use: { ...devices['Pixel 5'] } },
    { name: 'xb-mobile-safari', testDir: 'specs/cross-browser', use: { ...devices['iPhone 13'] } },

    // ---- feature files (Cucumber/Gherkin) ----
    { ...bdd('bdd-api', 'features/api/**/*.feature') },
    { ...bdd('bdd-ui', 'features/ui/**/*.feature'), use: { ...devices['Desktop Chrome'] } },
    { ...bdd('bdd-mobile', 'features/mobile/**/*.feature'), use: { ...devices['Pixel 5'] } },
  ],
});
