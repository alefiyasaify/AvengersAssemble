import { Role } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';

const ROLES: Array<[Role, string]> = [
  ['employee', 'EMPLOYEE'],
  ['manager', 'MANAGER'],
  ['auditor', 'AUDITOR'],
  ['head', 'FINANCE_HEAD'],
];

test.describe('Smoke', () => {
  test('API is live and ready through the frontend origin @smoke @readonly', async ({ anonymous }) => {
    await describeTest({ epic: 'Platform', feature: 'Health', severity: 'blocker', ref: 'ARD 8 Ops' });
    const http = await anonymous();
    expect((await http.get('/api/v1/health/live')).status).toBe(200);
    const ready = await http.get('/api/v1/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.checks.database).toBe('ok');
    expect((await http.get('/api/v1/version')).status).toBe(200);
  });

  test('root probes /healthz and /readyz answer on the backend origin @smoke @readonly', async ({ request, env }) => {
    await describeTest({ epic: 'Platform', feature: 'Health', severity: 'critical', ref: 'ARD 8 / G5' });
    test.skip(!env.backendUrl, 'EF_BACKEND_URL not set: the frontend origin serves its own page at /healthz');
    expect((await request.get(`${env.backendUrl}/healthz`)).status()).toBe(200);
    const ready = await request.get(`${env.backendUrl}/readyz`);
    expect(ready.status()).toBe(200);
    expect((await ready.json()).checks.database).toBe('ok');
  });

  for (const [role, expected] of ROLES) {
    test(`${role} signs in and /me reports ${expected} @smoke`, async ({ as }) => {
      await describeTest({ epic: 'Access', feature: 'Authentication', severity: 'blocker', ref: 'AT-06' });
      const me = await (await as(role)).me();
      expect(me.role).toBe(expected);
    });
  }

  test('the frontend serves the sign-in page and proxies /api to the backend @smoke @readonly', async ({ page, request, env }) => {
    await describeTest({ epic: 'Platform', feature: 'Frontend', severity: 'critical', ref: 'ADR-0004' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    const res = await request.get(`${env.baseUrl}/api/v1/version`);
    expect(res.status()).toBe(200);
  });
});
