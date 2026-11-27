import { createUser, loginAs, patchUser } from '../../src/api/admin';
import { HttpClient } from '../../src/api/http-client';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { MATRIX, WHO } from '../../src/data/rbac-matrix';
import { submitTravel } from '../../src/data/scenarios';

const ref = (id: string) => ({ epic: 'Catalogue', feature: id.split('-')[1], severity: 'critical' as const, ref: id });

test.describe('Authentication and session', () => {
  test('TC-AUTH-001 Login succeeds for each role with valid credentials @catalogue @regression', async ({ as, env, guest }) => {
    await describeTest(ref('TC-AUTH-001'));
    for (const role of ['employee', 'manager', 'auditor', 'head'] as const) {
      const session = await as(role);
      const client = await loginAs(env, env.personas[role]!);
      const cookies = (await client.storageState()).cookies;
      const access = cookies.find((c) => c.name === 'ef_access');
      expect(access?.httpOnly, `${role}: session cookie is httpOnly`).toBe(true);
      const me = await client.get('/api/v1/me');
      expect(me.body.role).toBe({ employee: 'EMPLOYEE', manager: 'MANAGER', auditor: 'AUDITOR', head: 'FINANCE_HEAD' }[role]);
      expect(me.body.permissions.length, `${role}: permissions returned`).toBeGreaterThan(0);
      expect((await session.me()).id).toBe(me.body.id);
      await client.dispose();
    }
    const app = await guest();
    await app.login.signIn(env.personas.manager!);
    await expect(app.page, 'user lands on the role home route').toHaveURL(/\/manager\/inbox$/);
  });

  test('TC-AUTH-002 Login fails with wrong password @catalogue @regression', async ({ env, as }) => {
    await describeTest(ref('TC-AUTH-002'));
    await as('employee');
    const http = await HttpClient.anonymous(env);
    const res = await http.post('/api/v1/auth/login', { email: env.personas.employee!.email, password: 'Wrong-password-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/invalid|incorrect/i);
    expect((await http.storageState()).cookies.filter((c) => c.name.startsWith('ef_a')), 'no session cookie').toHaveLength(0);
    await http.dispose();
  });

  test('TC-AUTH-003 Login error does not reveal whether the email exists @catalogue @security', async ({ env, as }) => {
    await describeTest(ref('TC-AUTH-003'));
    await as('employee');
    const http = await HttpClient.anonymous(env);
    const time = async (email: string) => {
      const ms: number[] = [];
      let last;
      for (let i = 0; i < 3; i++) {
        last = await http.post('/api/v1/auth/login', { email, password: 'Wrong-password-123' });
        ms.push(last.ms);
      }
      return { last: last!, median: ms.sort((a, b) => a - b)[1] };
    };
    const unknown = await time(`nobody.${Date.now()}@expenseflow.test`);
    const known = await time(env.personas.employee!.email);
    expect(unknown.last.status).toBe(known.last.status);
    expect(unknown.last.body.error.message).toBe(known.last.body.error.message);
    expect(unknown.last.body.error.code).toBe(known.last.body.error.code);
    expect(Math.abs(unknown.median - known.median), `timing ${unknown.median} vs ${known.median} ms`).toBeLessThan(150);
    await http.dispose();
  });

  test('TC-AUTH-004 Account locks after 5 failed attempts @catalogue @security', async ({ as, env }) => {
    await describeTest(ref('TC-AUTH-004'));
    const head = await as('head');
    const user = await createUser(head, { label: 'Lock' });
    const http = await HttpClient.anonymous(env);
    for (let i = 0; i < 5; i++) expect((await http.post('/api/v1/auth/login', { email: user.email, password: 'wrong-password-123' })).status).toBe(401);
    const sixth = await http.post('/api/v1/auth/login', { email: user.email, password: user.password });
    expect([401, 423, 429], 'locked even with the correct password').toContain(sixth.status);
    expect(sixth.ok).toBe(false);
    await http.dispose();
  });

  test('TC-AUTH-006 Inactive employee cannot log in @catalogue @security', async ({ as, env }) => {
    await describeTest(ref('TC-AUTH-006'));
    const head = await as('head');
    const user = await createUser(head, { label: 'Inactive' });
    expect((await patchUser(head, user.id, { is_active: false })).status).toBe(200);
    const http = await HttpClient.anonymous(env);
    const res = await http.post('/api/v1/auth/login', { email: user.email, password: user.password });
    const wrong = await http.post('/api/v1/auth/login', { email: user.email, password: 'wrong-password-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.message, 'same generic message').toBe(wrong.body.error.message);
    expect((await http.storageState()).cookies.filter((c) => c.name === 'ef_access')).toHaveLength(0);
    await http.dispose();
  });

  test('TC-AUTH-007 Logout invalidates the session @catalogue @regression', async ({ as, env }) => {
    await describeTest(ref('TC-AUTH-007'));
    await as('employee');
    const client = await loginAs(env, env.personas.employee!);
    const before = await client.storageState();
    const access = before.cookies.find((c) => c.name === 'ef_access')!.value;
    expect((await client.get('/api/v1/me')).status).toBe(200);
    expect([200, 204]).toContain((await client.post('/api/v1/auth/logout')).status);
    expect((await client.get('/api/v1/me')).status, 'cookies were cleared').toBe(401);
    // Replay of the old access token must not work either (server-side revocation).
    const replay = await HttpClient.anonymous(env);
    const res = await replay.request('GET', '/api/v1/me', { headers: { Authorization: `Bearer ${access}` } });
    expect(res.status, 'a logged-out access token is rejected').toBe(401);
    await client.dispose();
    await replay.dispose();
  });

  test('TC-AUTH-008 Refresh token rotation works and old token is rejected @catalogue @security', async ({ as, env }) => {
    await describeTest(ref('TC-AUTH-008'));
    await as('employee');
    const client = await loginAs(env, env.personas.employee!);
    const oldRefresh = (await client.storageState()).cookies.find((c) => c.name === 'ef_refresh')!.value;
    const first = await client.post('/api/v1/auth/refresh');
    expect(first.status).toBe(200);
    const newRefresh = (await client.storageState()).cookies.find((c) => c.name === 'ef_refresh')!.value;
    expect(newRefresh, 'a new refresh token is issued').not.toBe(oldRefresh);
    const replay = await HttpClient.anonymous(env);
    const old = await replay.request('POST', '/api/v1/auth/refresh', { headers: { Cookie: `ef_refresh=${oldRefresh}` } });
    expect(old.status, 'the old refresh token is rejected').toBe(401);
    await client.dispose();
    await replay.dispose();
  });

  test('TC-AUTH-010 Session cookies carry httpOnly and SameSite=Lax; nothing sensitive in localStorage @catalogue @security', async ({ as, env, guest }) => {
    await describeTest(ref('TC-AUTH-010'));
    await as('employee');
    const client = await loginAs(env, env.personas.employee!);
    const cookies = (await client.storageState()).cookies;
    for (const name of ['ef_access', 'ef_refresh']) {
      const c = cookies.find((x) => x.name === name)!;
      expect(c.httpOnly, `${name} httpOnly`).toBe(true);
      expect(c.sameSite, `${name} SameSite`).toBe('Lax');
    }
    await client.dispose();
    const app = await guest();
    await app.login.signIn(env.personas.employee!);
    const keys = await app.page.evaluate(() => ({ ls: JSON.stringify({ ...localStorage }), ss: JSON.stringify({ ...sessionStorage }), cookie: document.cookie }));
    expect(keys.ls + keys.ss, 'no tokens in web storage').not.toMatch(/eyJ|token|password/i);
    expect(keys.cookie, 'tokens are not readable from JavaScript').not.toMatch(/ef_access|ef_refresh/);
  });

  test('TC-AUTH-011 State-changing request without CSRF header is rejected @catalogue @security', async ({ as, env, request }) => {
    await describeTest(ref('TC-AUTH-011'));
    const employee = await as('employee');
    const cookie = (await employee.http.storageState()).cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const before = (await employee.claims.list()).body.items.length;
    const res = await request.post(`${env.apiUrl}/api/v1/claims`, { headers: { cookie }, data: { title: 'no csrf' } });
    expect(res.status()).toBe(403);
    expect((await employee.claims.list()).body.items.length, 'no claim created').toBe(before);
  });
});

test.describe('Access control and data isolation', () => {
  test('TC-RBAC-001 Role-by-endpoint access matrix matches the ARD @catalogue @security @rbac', async ({ as, anonymous }) => {
    await describeTest(ref('TC-RBAC-001'));
    const mismatches: string[] = [];
    for (const row of MATRIX) {
      for (const who of WHO) {
        const http = who === 'anonymous' ? await anonymous() : (await as(who)).http;
        const status = (await http.get(row.path)).status;
        const expected = row.allow.includes(who) ? 200 : who === 'anonymous' ? 401 : 403;
        if (status !== expected) mismatches.push(`${who} ${row.path}: expected ${expected}, got ${status}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test('TC-RBAC-002 Employee list shows own claims only @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-RBAC-002'));
    const [a, b] = [await as('employee'), await as('employee2')];
    const mine = await submitTravel(a, 'RBAC-002 a', inr(3000));
    const theirs = await submitTravel(b, 'RBAC-002 b', inr(3000));
    const ids = (await a.claims.list({ limit: 100 })).body.items;
    expect(ids.map((c) => c.id)).toContain(mine.id);
    expect(ids.map((c) => c.id)).not.toContain(theirs.id);
    const me = await a.me();
    for (const c of ids) expect(c.owner_id).toBe(me.id);
  });

  test('TC-RBAC-003 Employee opening another employee\'s claim by ID gets 404 @catalogue @security', async ({ as, ui }) => {
    await describeTest(ref('TC-RBAC-003'));
    const [owner, other] = [await as('employee'), await as('employee2')];
    const claim = await submitTravel(owner, 'RBAC-003', inr(3000));
    const res = await other.claims.getRaw(claim.id);
    expect(res.status).toBe(404);
    const app = await ui('employee2');
    await app.capture.openClaim(claim.id);
    await expect(app.page.getByText(/not found|not yours to see/i).first()).toBeVisible();
  });

  test('TC-RBAC-004 Employee cannot download another employee\'s receipt @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-RBAC-004'));
    const [owner, other] = [await as('employee'), await as('employee2')];
    const claim = await submitTravel(owner, 'RBAC-004', inr(3000));
    const res = await other.claims.receiptFileRaw(claim.lines[0].receipt!.id);
    expect(res.status).toBe(404);
    expect(res.text.length, 'no file bytes served').toBeLessThan(500);
  });

  test('TC-RBAC-005 Employee cannot pass owner_id to see other claims @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-RBAC-005'));
    const [a, b] = [await as('employee'), await as('employee2')];
    const theirs = await submitTravel(b, 'RBAC-005', inr(3000));
    const listed = await a.claims.list({ owner_id: (await b.me()).id });
    if (listed.ok) expect(listed.body.items.map((c) => c.id)).not.toContain(theirs.id);
    else expect([400, 422]).toContain(listed.status);
    const created = await a.http.post('/api/v1/claims', { title: claimTitle('RBAC-005'), owner_id: (await b.me()).id, lines: [await a.claims.lineBody(line.travel(inr(1000)))] });
    if (created.ok) expect(created.body.owner_id, 'claim belongs to the caller').toBe((await a.me()).id);
    else expect([400, 422]).toContain(created.status);
  });

  test('TC-RBAC-006 Employee cannot reach approver endpoints (all return 403) @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-RBAC-006'));
    const e = await as('employee');
    const [payable] = (await (await as('head')).payouts.eligible()).slice(0, 1);
    const results = {
      inbox: (await e.http.get('/api/v1/approvals/inbox')).status,
      queue: (await e.http.get('/api/v1/review-queue')).status,
      batch: (await e.payouts.createBatchRaw([payable.claim_id])).status,
    };
    expect(results).toEqual({ inbox: 403, queue: 403, batch: 403 });
  });

  test('TC-RBAC-007 Manager sees only their own team; another department claim is 404 @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-RBAC-007'));
    const [owner, manager, other] = [await as('employee'), await as('manager'), await as('manager2')];
    const claim = await submitTravel(owner, 'RBAC-007', inr(8000));
    expect(await manager.approvals.inboxClaimIds()).toContain(claim.id);
    expect(await other.approvals.inboxClaimIds()).not.toContain(claim.id);
    expect((await other.claims.getRaw(claim.id)).status).toBe(404);
  });

  test('TC-RBAC-008 Manager cannot access the auditor review queue @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-RBAC-008'));
    const m = await as('manager');
    expect((await m.review.queueRaw()).status).toBe(403);
    expect((await m.review.sampleAuditsRaw()).status).toBe(403);
  });

  test('TC-RBAC-009 Auditor can read all claims but cannot approve at the manager step @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-RBAC-009'));
    const [owner, auditor] = [await as('employee'), await as('auditor')];
    const claim = await submitTravel(owner, 'RBAC-009', inr(8000));
    expect((await auditor.claims.getRaw(claim.id)).status).toBe(200);
    const res = await auditor.approvals.actRaw(claim.current_step!.id, 'approve', { expected_version: claim.version });
    expect([403, 409]).toContain(res.status);
    expect((await owner.claims.get(claim.id)).status).toBe('PENDING_MANAGER');
  });

  test('TC-RBAC-010 Auditor cannot create or export payout batches @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-RBAC-010'));
    const [head, auditor] = [await as('head'), await as('auditor')];
    const [c] = (await head.payouts.eligible()).slice(0, 1);
    expect((await auditor.payouts.createBatchRaw([c.claim_id])).status).toBe(403);
    const batch = await head.payouts.createBatch([c.claim_id]);
    try {
      expect((await auditor.payouts.exportRaw(batch.id)).status).toBe(403);
    } finally {
      await head.payouts.cancelRaw(batch.id);
    }
  });

  test('TC-RBAC-011 Only the finance head can publish policy versions and edit configuration @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-RBAC-011'));
    for (const role of ['employee', 'manager', 'auditor'] as const) {
      const u = await as(role);
      expect((await u.http.get('/api/v1/admin/config')).status, `${role} read config`).toBe(403);
      expect((await u.http.put('/api/v1/admin/config', { sample_audit_rate: 0.1 })).status, `${role} write config`).toBe(403);
      expect((await u.http.post('/api/v1/admin/policy/versions', {})).status, `${role} create version`).toBe(403);
    }
    expect(((await (await as('head')).http.get('/api/v1/admin/config')).status)).toBe(200);
  });

  test('TC-RBAC-013 Navigation shows only items permitted for the role @catalogue @ui', async ({ ui }) => {
    await describeTest(ref('TC-RBAC-013'));
    const expected: Record<string, { has: string[]; hasNot: string[] }> = {
      employee: { has: ['My claims', 'New claim'], hasNot: ['Approval inbox', 'Review queue', 'Payout batches', 'Policy rules'] },
      manager: { has: ['Approval inbox', 'Delegation', 'My claims'], hasNot: ['Review queue', 'Payout batches', 'Policy rules'] },
      auditor: { has: ['Review queue', 'Sample audit', 'Payout batches'], hasNot: ['Policy rules', 'Approval inbox'] },
      head: { has: ['High-value approvals', 'Payout batches', 'Policy rules', 'Audit trail'], hasNot: ['Review queue'] },
    };
    for (const role of ['employee', 'manager', 'auditor', 'head'] as const) {
      const app = await ui(role);
      await app.page.goto('/');
      const nav = app.page.getByRole('navigation', { name: 'Main' });
      await expect(nav).toBeVisible();
      for (const item of expected[role].has) await expect(nav.getByRole('link', { name: item }), `${role} sees ${item}`).toBeVisible();
      for (const item of expected[role].hasNot) await expect(nav.getByRole('link', { name: item }), `${role} must not see ${item}`).toHaveCount(0);
    }
  });

  test('TC-RBAC-014 Role change takes effect on the next request @catalogue @security', async ({ as, env }) => {
    await describeTest(ref('TC-RBAC-014'));
    const head = await as('head');
    const user = await createUser(head, { role: 'AUDITOR', label: 'Demoted' });
    const client = await loginAs(env, user);
    expect((await client.get('/api/v1/review-queue')).status).toBe(200);
    expect((await patchUser(head, user.id, { role: 'EMPLOYEE' })).status).toBe(200);
    expect((await client.get('/api/v1/review-queue')).status, 'the existing session loses the permission at once').toBe(403);
    await client.dispose();
  });

  test('TC-RBAC-015 Dashboard scope follows role @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-RBAC-015'));
    for (const [role, scope] of [['employee', 'own'], ['manager', 'team'], ['auditor', 'company'], ['head', 'company']] as const) {
      const res = await (await as(role)).ops.dashboardRaw();
      expect(res.body.scope, role).toBe(scope);
    }
  });
});
