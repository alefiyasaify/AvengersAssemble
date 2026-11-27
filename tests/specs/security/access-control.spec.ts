import { MATRIX, WHO } from '../../src/data/rbac-matrix';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { inr } from '../../src/data/money';
import { submitTravel } from '../../src/data/scenarios';

test.describe('RBAC matrix', () => {
  for (const row of MATRIX) {
    test(`RB GET ${row.path} by role @regression @security @rbac`, async ({ as, anonymous }) => {
      await describeTest({ epic: 'Security', feature: 'RBAC matrix', story: row.path, severity: 'critical', ref: 'ARD 12 RBAC' });
      const outcomes: Record<string, number> = {};
      for (const who of WHO) {
        const http = who === 'anonymous' ? await anonymous() : (await as(who)).http;
        outcomes[who] = (await http.get(row.path)).status;
      }
      for (const who of WHO) {
        const expected = row.allow.includes(who) ? 200 : who === 'anonymous' ? 401 : 403;
        expect(outcomes[who], `${who} on ${row.path}`).toBe(expected);
      }
    });
  }
});

test.describe('Visibility and bypass controls', () => {
  test('SEC-01 an employee gets 404, not 403, for another employee\'s claim and receipt @regression @security', async ({ as }) => {
    await describeTest({ epic: 'Security', feature: 'Visibility', severity: 'blocker', ref: 'E2E10 / C5' });
    const [owner, other] = [await as('employee'), await as('employee2')];
    const claim = await submitTravel(owner, 'SEC-01', inr(8000));
    const receiptId = claim.lines[0].receipt!.id;

    const c = await other.claims.getRaw(claim.id);
    expect(c.status).toBe(404);
    expect(c.body).toMatchObject({ error: { code: expect.stringMatching(/NOT_FOUND/) } });
    expect((await other.claims.receiptFileRaw(receiptId)).status).toBe(404);
    expect((await owner.claims.receiptFileRaw(receiptId)).status, 'the owner can still open it').toBe(200);
  });

  test('SEC-02 a manager sees only the claims of their own reporting line @regression @security', async ({ as }) => {
    await describeTest({ epic: 'Security', feature: 'Visibility', severity: 'blocker', ref: 'ARD 3 / C5' });
    const [employee, manager, manager2] = [await as('employee'), await as('manager'), await as('manager2')];
    const claim = await submitTravel(employee, 'SEC-02', inr(8000));
    expect((await manager.claims.getRaw(claim.id)).status, 'own report').toBe(200);
    expect((await manager2.claims.getRaw(claim.id)).status, 'someone else\'s report').toBe(404);
  });

  test('SEC-03 an employee cannot act on approval steps @regression @security', async ({ as }) => {
    await describeTest({ epic: 'Security', feature: 'Authorization', severity: 'blocker', ref: 'C2' });
    const [employee, owner] = [await as('employee2'), await as('employee')];
    const claim = await submitTravel(owner, 'SEC-03', inr(8000));
    const res = await employee.approvals.actRaw(claim.current_step!.id, 'approve', { expected_version: claim.version });
    expect([403, 404]).toContain(res.status);
  });

  test('SEC-04 the owner cannot approve their own claim by calling the step directly @regression @security', async ({ as }) => {
    await describeTest({ epic: 'Security', feature: 'Separation of duties', severity: 'blocker', ref: 'C3' });
    const employee = await as('employee');
    const claim = await submitTravel(employee, 'SEC-04', inr(8000));
    const res = await employee.approvals.actRaw(claim.current_step!.id, 'approve', { expected_version: claim.version });
    expect([403, 404]).toContain(res.status);
  });

  test('SEC-05 state-changing calls without the CSRF header are refused @regression @security', async ({ as, env, request }) => {
    await describeTest({ epic: 'Security', feature: 'CSRF', severity: 'critical', ref: 'ADR-0006' });
    const employee = await as('employee');
    const state = await employee.http.storageState();
    const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const res = await request.post(`${env.apiUrl}/api/v1/claims`, { headers: { cookie }, data: { title: 'no csrf' } });
    expect(res.status()).toBe(403);
  });

  test('SEC-06 errors use the standard envelope and echo X-Request-ID @regression @security', async ({ as, anonymous }) => {
    await describeTest({ epic: 'Security', feature: 'Error envelope', severity: 'normal', ref: 'docs/02' });
    const employee = await as('employee');
    const missing = await employee.http.get('/api/v1/claims/00000000-0000-7000-8000-000000000000');
    expect(missing.status).toBe(404);
    const err = (missing.body as { error: { code: string; message: string; request_id: string } }).error;
    expect(err.code).toMatch(/^[A-Z_]+$/);
    expect(err.request_id).toBe(missing.headers['x-request-id']);
    expect(JSON.stringify(missing.body)).not.toMatch(/Traceback|sqlalchemy|SELECT /i);

    const unauth = await (await anonymous()).get('/api/v1/claims');
    expect(unauth.status).toBe(401);
    expect(unauth.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  test('SEC-07 five wrong passwords lock the account (tested on a throwaway user) @regression @security', async ({ as, anonymous, env }) => {
    await describeTest({ epic: 'Security', feature: 'Lockout', severity: 'critical', ref: 'ARD 8 / AT-05' });
    const head = await as('head');
    const me = await head.me();
    const email = `qa.lock.${Date.now().toString(36)}@${me.email.split('@')[1]}`;
    const password = 'Lock!Test-Password-1';
    const created = await head.http.post('/api/v1/admin/users', {
      email, full_name: 'QA Lockout', employee_code: `QL${Date.now().toString(36)}`.toUpperCase().slice(0, 16),
      role: 'EMPLOYEE', department_id: me.department_id, manager_id: me.id, password,
    });
    expect(created.status).toBe(201);

    const http = await anonymous();
    for (let i = 0; i < 5; i++) expect((await http.post('/api/v1/auth/login', { email, password: 'wrong-password-123' })).status).toBe(401);
    const locked = await http.post('/api/v1/auth/login', { email, password });
    expect(locked.status, 'the right password no longer works while locked').not.toBe(200);
    expect([401, 423, 429], `env ${env.name}`).toContain(locked.status);
  });
});
