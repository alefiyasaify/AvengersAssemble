import fs from 'node:fs';
import { HttpClient } from '../../src/api/http-client';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';

const ref = (id: string) => ({ epic: 'Catalogue', feature: 'Authentication', severity: 'critical' as const, ref: id });

// Named zz-* so it runs after the rest of the catalogue: it deliberately uses up the sign-in budget.
test.describe('Rate limit and logs', () => {
  test('TC-AUTH-005 Login endpoint is rate limited (30 requests in 10 s) @catalogue @security @slow', async ({ env, as }) => {
    test.setTimeout(180_000);
    await describeTest(ref('TC-AUTH-005'));
    await as('employee');
    const http = await HttpClient.anonymous(env);
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 40 }, () => http.post('/api/v1/auth/login', { email: `nobody.${Date.now()}@expenseflow.test`, password: 'Wrong-password-123' })));
    expect(Date.now() - started, 'the burst fits inside 10 seconds').toBeLessThan(10_000);
    const limited = results.filter((r) => r.status === 429);
    expect(limited.length, 'requests beyond the limit return 429').toBeGreaterThan(0);
    expect(limited[0].body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    await new Promise((r) => setTimeout(r, 65_000));
    const again = await HttpClient.login(env, env.personas.employee!);
    expect((await again.get('/api/v1/me')).status, 'legitimate logins work again after the window').toBe(200);
    await again.dispose();
    await http.dispose();
  });

  test('TC-AUTH-013 Passwords and tokens never appear in logs @catalogue @security', async ({ env }) => {
    await describeTest(ref('TC-AUTH-013'));
    const path = process.env.EF_BACKEND_LOG;
    test.skip(!path || !fs.existsSync(path), 'set EF_BACKEND_LOG to the backend log file to run this check');
    const log = fs.readFileSync(path!, 'utf8');
    for (const secret of [env.personas.head!.password, env.personas.employee!.password]) expect(log).not.toContain(secret);
    expect(log).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./);
    expect(log).not.toMatch(/ef_(access|refresh)=[A-Za-z0-9._-]{20,}/);
  });
});
