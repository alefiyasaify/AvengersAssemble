import { BrowserContext } from '@playwright/test';
// playwright-bdd's test is Playwright's test plus the Gherkin plumbing, so specs and features share these fixtures.
import { test as base } from 'playwright-bdd';
import * as allure from 'allure-js-commons';
import type { Logger } from 'winston';
import { EnvConfig, Role, getEnv } from '../../config/environments';
import { HttpClient } from '../api/http-client';
import { Session, SessionPool } from '../api/session';
import { App } from '../ui/app';
import { World } from './world';
import { TestLogCapture, getLogger } from './logger';

interface TestFixtures {
  /** Winston logger; every line is also attached to the report for this test. */
  log: Logger;
  /** API session for a persona (logged in once per worker). */
  as: (role: Role) => Promise<Session>;
  /** Unauthenticated API client, for health checks and negative tests. */
  anonymous: () => Promise<HttpClient>;
  /** A fresh browser context signed in as a persona (cookies from the API login), with page objects attached. */
  ui: (role: Role) => Promise<App>;
  /** A fresh, signed-out browser page with page objects attached (for the login form itself). */
  guest: () => Promise<App>;
  /** Scratch state shared by the steps of one Gherkin scenario. */
  world: World;
  _hooks: void;
}

interface WorkerFixtures {
  env: EnvConfig;
  pool: SessionPool;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  env: [
    async ({}, use) => {
      await use(getEnv());
    },
    { scope: 'worker' },
  ],

  pool: [
    async ({ env }, use) => {
      const pool = new SessionPool(env);
      await use(pool);
      await pool.dispose();
    },
    { scope: 'worker' },
  ],

  log: async ({}, use) => {
    await use(getLogger('test'));
  },

  as: async ({ pool }, use) => {
    await use((role) => pool.get(role));
  },

  anonymous: async ({ pool }, use) => {
    await use(() => pool.anonymous());
  },

  ui: async ({ browser, env, pool, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }, use) => {
    const contexts: BrowserContext[] = [];
    const uiLog = getLogger('ui');
    await use(async (role) => {
      const session = await pool.get(role);
      // New contexts do not inherit the project's device settings, so pass them on.
      const context = await browser.newContext({
        baseURL: env.baseUrl,
        storageState: await session.http.storageState(),
        viewport: viewport ?? undefined,
        isMobile,
        hasTouch,
        userAgent,
        deviceScaleFactor,
      });
      contexts.push(context);
      const page = await context.newPage();
      page.on('pageerror', (e) => uiLog.error(`page error (${role}): ${e.message}`, { url: page.url() }));
      return new App(page, session.persona);
    });
    for (const context of contexts) await context.close();
  },

  guest: async ({ browser, env, viewport, isMobile, hasTouch, userAgent, deviceScaleFactor }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({ baseURL: env.baseUrl, viewport: viewport ?? undefined, isMobile, hasTouch, userAgent, deviceScaleFactor });
      contexts.push(context);
      return new App(await context.newPage());
    });
    for (const context of contexts) await context.close();
  },

  world: async ({}, use) => {
    const world = new World();
    await use(world);
    await world.runCleanup();
  },

  // Runs for every test: read-only guard, per-test log capture, failure logging, report parameters.
  _hooks: [
    async ({ env }, use, testInfo) => {
      const log = getLogger('test');
      if (env.readOnly && !testInfo.tags.includes('@readonly')) {
        testInfo.skip(true, `read-only environment (${env.name}): only @readonly tests run`);
      }
      const capture = new TestLogCapture();
      const name = testInfo.titlePath.slice(1).join(' > ');
      await allure.parameter('environment', env.name);
      if (testInfo.project.name.startsWith('bdd')) {
        await allure.epic('Behaviour (Gherkin features)');
        await allure.feature(testInfo.titlePath[1] ?? 'feature');
        const severity = testInfo.tags.map((t) => t.slice(1)).find((t) => ['blocker', 'critical', 'normal', 'minor', 'trivial'].includes(t));
        if (severity) await allure.severity(severity);
      }
      log.info(`START ${name}`, { project: testInfo.project.name, tags: testInfo.tags });

      await use();

      const failed = testInfo.status !== testInfo.expectedStatus && testInfo.status !== 'skipped';
      if (failed) {
        // error level: lands in the app, execution and error logs.
        log.error(`FAILED ${name}`, {
          project: testInfo.project.name,
          status: testInfo.status,
          retry: testInfo.retry,
          file: `${testInfo.file}:${testInfo.line}`,
          error: testInfo.error?.message?.split('\n').slice(0, 8).join(' | '),
        });
      } else {
        log.info(`${testInfo.status === 'skipped' ? 'SKIPPED' : 'PASSED'} ${name} (${testInfo.duration} ms)`);
      }
      const text = capture.text();
      capture.stop();
      await testInfo.attach('test-log', { body: text, contentType: 'text/plain' });
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
export type { Session } from '../api/session';
