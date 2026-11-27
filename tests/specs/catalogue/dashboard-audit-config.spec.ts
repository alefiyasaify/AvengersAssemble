import { STATUS } from '../../config/environments';
import { createUser, loginAs, patchUser } from '../../src/api/admin';
import { ConfigAdmin } from '../../src/api/config-admin';
import { Session } from '../../src/api/session';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { isolatedDate } from '../../src/data/dates';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { seededPair } from '../../src/data/seeded';
import { submitTravel } from '../../src/data/scenarios';

const ref = (id: string) => ({ epic: 'Catalogue', feature: id.split('-')[1], severity: 'critical' as const, ref: id });

interface Summary {
  scope: string;
  spend_by_category: Array<{ category: string; amount_paise: number }>;
  spend_by_department: Array<{ department_id: string; amount_paise: number }>;
  spend_by_month: Array<{ month: string; category: string; amount_paise: number }>;
  violations: { by_rule: Array<{ rule_code: string; outcome: string; count: number }>; violation_rate: number; submitted_lines: number };
  approval_time: { chain_count: number; auto_approved_count: number };
  queue_health: Array<{ level_no: number; pending: number; oldest_age_seconds: number | null }> | null;
  sample_audit: unknown;
}
const sum = (rows: Array<{ amount_paise: number }>) => rows.reduce((t, r) => t + r.amount_paise, 0);

/** A weekday long before the seeded history whose dashboard window is empty, so exact totals can be asserted. */
const emptyDate = async (s: Session): Promise<string> => {
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.UTC(2005 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 27)));
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const date = d.toISOString().slice(0, 10);
    const res = await s.http.get<Summary>('/api/v1/dashboard/summary', { from: date, to: date });
    if (sum(res.body.spend_by_category) === 0) return date;
  }
  throw new Error('could not find an empty dashboard date');
};
const summary = async (s: Session, q: Record<string, string | undefined> = {}): Promise<Summary> => {
  const res = await s.http.get<Summary>('/api/v1/dashboard/summary', Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) as Record<string, string>);
  expect(res.status).toBe(200);
  return res.body;
};
const cat = (d: Summary, c: string) => d.spend_by_category.find((x) => x.category === c)?.amount_paise ?? 0;
const today = () => new Date().toISOString().slice(0, 10);

test.describe('Dashboard', () => {
  test('TC-DSH-001 Spend by category counts only final approved lines @catalogue @ops', async ({ as }) => {
    await describeTest(ref('TC-DSH-001'));
    const [e, m, h] = [await as('employee'), await as('manager'), await as('head')];
    const d = await emptyDate(h);
    const w = { from: d, to: d };
    await e.claims.createAndSubmit(claimTitle('DSH-001 auto'), [line.cab(inr(1200), { date: d })]); // auto-approved
    const pending = await e.claims.createAndSubmit(claimTitle('DSH-001 pending'), [line.travel(inr(8000), { date: d })]); // manager step
    await e.claims.createAndSubmit(claimTitle('DSH-001 rejected'), [line.meals(inr(1800), { date: d })]); // rejected
    await e.claims.createDraft(claimTitle('DSH-001 draft'), [line.other(inr(700), { date: d })]); // draft
    let s = await summary(h, w);
    expect(s.spend_by_category, 'only the auto-approved line counts').toEqual([{ category: 'LOCAL_CAB', amount_paise: inr(1200) }]);
    await m.approvals.decide(pending.id, 'approve');
    s = await summary(h, w);
    expect(cat(s, 'TRAVEL')).toBe(inr(8000));
    expect(cat(s, 'MEALS')).toBe(0);
    expect(cat(s, 'OTHER')).toBe(0);
  });

  test('TC-DSH-002 Spend by department uses the department stored at submission @catalogue @ops', async ({ as, env }) => {
    await describeTest(ref('TC-DSH-002'));
    const h = await as('head');
    const me = await h.me();
    const depts = (await h.http.get('/api/v1/departments')).body as Array<{ id: string }>;
    const other = depts.find((x) => x.id !== me.department_id)!;
    const user = await createUser(h, { label: 'Mover' });
    const e = new Session(await loginAs(env, user), user);
    const d = await emptyDate(h);
    await e.claims.createAndSubmit(claimTitle('DSH-002'), [line.cab(inr(1500), { date: d })]);
    expect((await patchUser(h, user.id, { department_id: other.id })).status).toBe(200);
    const s = await summary(h, { from: d, to: d });
    expect(s.spend_by_department).toEqual([expect.objectContaining({ department_id: me.department_id, amount_paise: inr(1500) })]);
  });

  test('TC-DSH-003 Spend by month groups by expense date in Asia/Kolkata @catalogue @ops', async ({ as }) => {
    await describeTest(ref('TC-DSH-003'));
    const [e, h] = [await as('employee'), await as('head')];
    // The last weekday of a month with an empty window: a UTC conversion bug would push it into the next month.
    let date = '';
    for (let i = 0; i < 30 && !date; i++) {
      const d = new Date(Date.UTC(2005 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 12) + 1, 0));
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
      const candidate = d.toISOString().slice(0, 10);
      if (sum((await summary(h, { from: candidate, to: candidate })).spend_by_category) === 0) date = candidate;
    }
    expect(date).not.toBe('');
    await e.claims.createAndSubmit(claimTitle('DSH-003'), [line.cab(inr(777), { date })]);
    const s = await summary(h, { from: date, to: date });
    expect(s.spend_by_month).toEqual([{ month: date.slice(0, 7), category: 'LOCAL_CAB', amount_paise: inr(777) }]);
  });

  test('TC-DSH-004 Policy violations count by rule and outcome @catalogue @ops', async ({ as }) => {
    await describeTest(ref('TC-DSH-004'));
    const [e, h] = [await as('employee'), await as('head')];
    const w = { from: today(), to: today() };
    const count = (s: Summary, code: string) => s.violations.by_rule.filter((r) => r.rule_code === code).reduce((t, r) => t + r.count, 0);
    const before = await summary(h, w);
    await e.claims.createAndSubmit(claimTitle('DSH-004'), [
      line.meals(inr(1800)), // MEALS_DAILY_CAP
      line.other(inr(900), { receipt: null }), // RECEIPT_REQUIRED
      line.other(inr(1000), { date: isolatedDate('saturday') }), // WEEKEND_SPEND
    ]);
    const after = await summary(h, w);
    expect(count(after, 'MEALS_DAILY_CAP') - count(before, 'MEALS_DAILY_CAP')).toBe(1);
    expect(count(after, 'RECEIPT_REQUIRED') - count(before, 'RECEIPT_REQUIRED')).toBe(1);
    expect(count(after, 'WEEKEND_SPEND') - count(before, 'WEEKEND_SPEND')).toBe(1);
  });

  test('TC-DSH-005 Violation rate formula @catalogue @ops', async ({ as }) => {
    await describeTest(ref('TC-DSH-005'));
    const [e, h] = [await as('employee'), await as('head')];
    const w = { from: today(), to: today() };
    const before = await summary(h, w);
    const flagged = (b: Summary) => Math.round(b.violations.violation_rate * b.violations.submitted_lines);
    await e.claims.createAndSubmit(claimTitle('DSH-005'), [
      line.meals(inr(1800)), // rejected
      line.other(inr(1000), { date: isolatedDate('saturday') }), // flagged
      line.travel(inr(1000)), // clean
      line.travel(inr(1100)), // clean
    ]);
    const after = await summary(h, w);
    expect(after.violations.submitted_lines - before.violations.submitted_lines).toBe(4);
    const expected = (flagged(before) + 2) / after.violations.submitted_lines;
    expect(after.violations.violation_rate).toBeCloseTo(expected, 2);
  });

  test('TC-DSH-007 Queue health shows pending counts and oldest age @catalogue @ops', async ({ as }) => {
    await describeTest(ref('TC-DSH-007'));
    const [e, m, h] = [await as('employee'), await as('manager'), await as('head')];
    const level = (s: Summary, n: number) => s.queue_health!.find((q) => q.level_no === n)!;
    const before = await summary(h);
    const a = await submitTravel(e, 'DSH-007 a', inr(8000));
    const b = await submitTravel(e, 'DSH-007 b', inr(30000));
    await m.approvals.decide(b.id, 'approve');
    const after = await summary(h);
    expect(level(after, 1).pending - level(before, 1).pending).toBe(1);
    expect(level(after, 2).pending - level(before, 2).pending).toBe(1);
    expect(level(after, 1).oldest_age_seconds).toBeGreaterThanOrEqual(0);
    expect(a.id).toBeTruthy();
  });

  test('TC-DSH-008 Dashboard filters by date range, department and category stay consistent @catalogue @ops', async ({ as }) => {
    await describeTest(ref('TC-DSH-008'));
    const [e, m, h] = [await as('employee'), await as('manager'), await as('head')];
    const d = await emptyDate(h);
    const c = await e.claims.createAndSubmit(claimTitle('DSH-008'), [line.travel(inr(6000), { date: d }), line.cab(inr(900), { date: d })]);
    await m.approvals.decide(c.id, 'approve');
    const dept = (await h.claims.get(c.id) as unknown as { department_id: string }).department_id;
    for (const q of [{ from: d, to: d }, { from: d, to: d, category: 'TRAVEL' }, { from: d, to: d, department: dept }, { from: d, to: d, category: 'TRAVEL', department: dept }]) {
      const s = await summary(h, q);
      expect(sum(s.spend_by_department), JSON.stringify(q)).toBe(sum(s.spend_by_category));
      expect(sum(s.spend_by_month), JSON.stringify(q)).toBe(sum(s.spend_by_category));
    }
    expect(sum((await summary(h, { from: d, to: d, category: 'TRAVEL' })).spend_by_category)).toBe(inr(6000));
    expect(sum((await summary(h, { from: d, to: d, department: 'no-such-department' })).spend_by_category)).toBe(0);
  });

  test('TC-DSH-009 Dashboard scope: employee, manager and auditor see no cross-scope data @catalogue @ops @security', async ({ as }) => {
    await describeTest(ref('TC-DSH-009'));
    const [e, e2, m, a] = [await as('employee'), await as('employee2'), await as('manager'), await as('auditor')];
    const d = await emptyDate(await as('head'));
    const w = { from: d, to: d };
    await e2.claims.createAndSubmit(claimTitle('DSH-009'), [line.cab(inr(1300), { date: d })]); // team of manager2
    expect(sum((await summary(e, w)).spend_by_category), 'employee sees own only').toBe(0);
    expect(sum((await summary(m, w)).spend_by_category), 'manager sees own team only').toBe(0);
    expect(sum((await summary(await as('manager2'), w)).spend_by_category)).toBe(inr(1300));
    expect(sum((await summary(a, w)).spend_by_category), 'auditor is company-wide').toBe(inr(1300));
  });

  test('TC-DSH-010 Dashboard responds within 500 ms on seed volume (p95 of 20 calls) @catalogue @ops', async ({ as }) => {
    await describeTest(ref('TC-DSH-010'));
    const h = await as('head');
    const times: number[] = [];
    for (let i = 0; i < 20; i++) times.push((await h.http.get('/api/v1/dashboard/summary')).ms);
    times.sort((x, y) => x - y);
    expect(times[Math.ceil(0.95 * times.length) - 1], `timings ${times.join(', ')}`).toBeLessThan(500);
  });

  test('TC-DSH-011 Dashboard for a new employee is empty without errors or NaN @catalogue @ops', async ({ as, env }) => {
    await describeTest(ref('TC-DSH-011'));
    const user = await createUser(await as('head'), { label: 'Fresh' });
    const s = new Session(await loginAs(env, user), user);
    const res = await s.http.get('/api/v1/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/NaN|Infinity/);
    expect(sum(res.body.spend_by_category)).toBe(0);
  });

  test('TC-DSH-012 Dashboard totals reconcile with payout totals @catalogue @ops', async ({ as, env }) => {
    await describeTest(ref('TC-DSH-012'));
    const [h, a] = [await as('head'), await as('auditor')];
    const pair = await seededPair(h, env);
    const d = isolatedDate('saturday');
    const make = async (paise: number) => {
      const c = await pair.employee.claims.createAndSubmit(claimTitle('DSH-012'), [line.travel(paise, { date: d })]);
      return pair.manager.approvals.decide(c.id, 'approve');
    };
    const claims = [await make(inr(2300)), await make(inr(1100))];
    const b = await h.payouts.createBatch(claims.map((c) => c.id));
    await a.payouts.verify(b.id);
    await h.payouts.export(b.id);
    await h.payouts.markPaid(b.id);
    const s = await summary(h, { from: d, to: d });
    expect(sum(s.spend_by_category), 'PAID spend equals the batch total').toBe(b.total_paise);
  });
});

test.describe('Audit trail', () => {
  test('TC-TRL-001 Every state change writes an audit event @catalogue @audit', async ({ as }) => {
    await describeTest(ref('TC-TRL-001'));
    const [e, m] = [await as('employee'), await as('manager')];
    const d = await e.claims.createDraft(claimTitle('TRL-001'), [line.travel(inr(8000))]);
    const n = async () => (await e.claims.timeline(d.id)).length;
    const counts = [await n()];
    await e.claims.submit(d.id);
    counts.push(await n());
    await m.approvals.decide(d.id, 'send-back', 'again');
    counts.push(await n());
    await e.claims.resubmit(d.id);
    counts.push(await n());
    await e.claims.withdraw(d.id);
    counts.push(await n());
    for (let i = 1; i < counts.length; i++) expect(counts[i], `step ${i}`).toBeGreaterThan(counts[i - 1]);
    const actions = (await e.claims.timeline(d.id)).map((t) => t.action).join(' ');
    expect(actions).toMatch(/submit/i);
    expect(actions).toMatch(/send|back/i);
    expect(actions).toMatch(/withdraw/i);
  });

  test('TC-TRL-008 No API can modify or delete audit events @catalogue @audit @security', async ({ as }) => {
    await describeTest(ref('TC-TRL-008'));
    const [e, h] = [await as('employee'), await as('head')];
    const c = await submitTravel(e, 'TRL-008', inr(8000));
    for (const who of [e, h]) {
      for (const [method, url] of [['PUT', `/api/v1/claims/${c.id}/timeline`], ['PATCH', `/api/v1/claims/${c.id}/timeline`], ['DELETE', `/api/v1/claims/${c.id}/timeline`], ['POST', `/api/v1/claims/${c.id}/timeline`], ['DELETE', '/api/v1/audit-events/1'], ['PUT', '/api/v1/audit-events/1']] as const) {
        const res = await who.http.request(method, url, { data: { action: 'tamper' } });
        expect([404, 405], `${method} ${url}`).toContain(res.status);
      }
    }
  });

  test('TC-TRL-010 Employees see a timeline of their own claims only @catalogue @audit @security', async ({ as }) => {
    await describeTest(ref('TC-TRL-010'));
    const [e, other] = [await as('employee'), await as('employee2')];
    const c = await submitTravel(e, 'TRL-010', inr(8000));
    expect((await e.http.get(`/api/v1/claims/${c.id}/timeline`)).status).toBe(200);
    expect((await other.http.get(`/api/v1/claims/${c.id}/timeline`)).status).toBe(404);
  });

  test('TC-TRL-012 Auto-approval event has actor SYSTEM and the policy version @catalogue @audit', async ({ as }) => {
    await describeTest(ref('TC-TRL-012'));
    const e = await as('employee');
    const policy = await new ConfigAdmin(await as('head')).active();
    const missing: string[] = [];
    for (let i = 0; i < 6; i++) {
      const c = await e.claims.createAndSubmit(claimTitle('TRL-012'), [line.cab(inr(1200 + i))]);
      const system = (await e.claims.timeline(c.id)).filter((t) => /system/i.test(t.actor_name));
      expect(system.map((t) => t.action), 'auto-approval is written by SYSTEM').toContain('claim.auto_approved');
      const payload = JSON.stringify(system);
      expect(payload, 'policy version id recorded').toContain(policy.id);
      if (!/draw_value/.test(payload)) missing.push(c.claim_no);
    }
    expect(missing, 'claims whose sample draw value was not recorded').toEqual([]);
  });
});

test.describe('Policy and system configuration', () => {
  test('TC-CFG-001 Head creates, edits and publishes a policy version @catalogue @policy @config', async ({ as }) => {
    await describeTest(ref('TC-CFG-001'));
    const head = await as('head');
    const admin = new ConfigAdmin(head);
    const original = await admin.active();
    const draft = (await admin.createDraftRaw(structuredClone(original.rules), 'QA CFG-001')).body;
    expect(draft.status).toBe('DRAFT');
    const edited = structuredClone(original.rules);
    edited.find((r) => r.code === 'CAB_TRIP_CAP')!.params.cap = inr(2100);
    expect((await head.http.put(`/api/v1/admin/policy/versions/${draft.id}`, { rules: edited, notes: 'QA edit' })).status).toBe(200);
    try {
      const published = (await admin.publishRaw(draft.id)).body;
      expect(published.status).toBe('ACTIVE');
      const versions = await admin.versions();
      expect(versions.filter((v) => v.status === 'ACTIVE')).toHaveLength(1);
      expect(versions.find((v) => v.id === original.id)!.status).toBe('RETIRED');
    } finally {
      await admin.publish(original.rules, 'QA restore');
    }
  });

  test('TC-CFG-002 Published policy version is immutable @catalogue @policy @config', async ({ as }) => {
    await describeTest(ref('TC-CFG-002'));
    const head = await as('head');
    const admin = new ConfigAdmin(head);
    const active = await admin.active();
    const res = await head.http.put(`/api/v1/admin/policy/versions/${active.id}`, { rules: active.rules, notes: 'tamper' });
    expect([400, 403, 409], `editing an ACTIVE version (got ${res.status})`).toContain(res.status);
    const retired = (await admin.versions()).find((v) => v.status === 'RETIRED');
    if (retired) expect([400, 403, 409]).toContain((await head.http.put(`/api/v1/admin/policy/versions/${retired.id}`, { rules: retired.rules })).status);
  });

  test('TC-CFG-003 Existing claims keep the policy version they were evaluated under @catalogue @policy @config', async ({ as }) => {
    await describeTest(ref('TC-CFG-003'));
    const [e, head] = [await as('employee'), await as('head')];
    const admin = new ConfigAdmin(head);
    const old = await e.claims.createAndSubmit(claimTitle('CFG-003'), [line.meals(inr(1800))]);
    const before = await e.claims.get(old.id);
    await admin.withPolicy((r) => r, async (v) => {
      const after = await e.claims.get(old.id);
      expect((after as unknown as { policy_version_id: string }).policy_version_id).toBe((before as unknown as { policy_version_id: string }).policy_version_id);
      expect((after as unknown as { policy_version_id: string }).policy_version_id).not.toBe(v.id);
      expect(after.lines[0].findings).toEqual(before.lines[0].findings);
    });
  });

  test('TC-CFG-004 Invalid rule parameters are rejected @catalogue @policy @config', async ({ as }) => {
    await describeTest(ref('TC-CFG-004'));
    const head = await as('head');
    const admin = new ConfigAdmin(head);
    const active = await admin.active();
    const countBefore = (await admin.versions()).length;
    const bad = structuredClone(active.rules);
    bad.find((r) => r.code === 'MEALS_DAILY_CAP')!.params.cap = -5;
    const res = await admin.createDraftRaw(bad, 'invalid');
    if (res.ok) {
      const upd = await head.http.post(`/api/v1/admin/policy/versions/${res.body.id}/publish`);
      expect(upd.ok, 'a negative cap must never become active').toBe(false);
    } else {
      expect([400, 422]).toContain(res.status);
    }
    const malformed = structuredClone(active.rules);
    malformed.find((r) => r.code === 'CAB_TRIP_CAP')!.params = { cap: 'abc' } as never;
    expect([400, 422], 'malformed params').toContain((await admin.createDraftRaw(malformed, 'malformed')).status);
    expect((await admin.versions()).length, 'nothing saved').toBe(countBefore);
  });

  test('TC-CFG-006 Approval level thresholds are editable by the head @catalogue @approvals @config', async ({ as }) => {
    await describeTest(ref('TC-CFG-006'));
    const [e, head] = [await as('employee'), await as('head')];
    await new ConfigAdmin(head).withLevels((ls) => ls.map((l) => (l.level_no === 2 ? { ...l, min_amount_paise_exclusive: inr(50000) } : l)), async () => {
      expect((await submitTravel(e, 'CFG-006 a', inr(40000))).required_levels).toEqual([1]);
      expect((await submitTravel(e, 'CFG-006 b', inr(50001))).required_levels).toEqual([1, 2]);
    });
    expect((await submitTravel(e, 'CFG-006 restored', inr(40000))).required_levels, 'restored to 25,000').toEqual([1, 2]);
  });

  test('TC-CFG-007 auto_approve_max_total and sample_audit_rate are configurable @catalogue @policy @config', async ({ as }) => {
    await describeTest(ref('TC-CFG-007'));
    const [e, a, head] = [await as('employee'), await as('auditor'), await as('head')];
    await new ConfigAdmin(head).withConfig({ auto_approve_max_total_paise: inr(2000), sample_audit_rate: 1.0 }, async () => {
      const routed = await submitTravel(e, 'CFG-007 3000', inr(3000));
      expect(routed.status, 'above the new limit').toBe(STATUS.pendingManager);
      const auto = await e.claims.createAndSubmit(claimTitle('CFG-007 1500'), [line.travel(inr(1500))]);
      expect(auto.status).toBe(STATUS.approved);
      expect((await a.claims.get(auto.id)).sample_audit_pending, 'every auto-approval is sampled at rate 1.0').toBe(true);
    });
  });

  test('TC-CFG-008 Admin creates users and changes managers @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-CFG-008'));
    const head = await as('head');
    const [m1, m2] = [await createUser(head, { role: 'MANAGER', label: 'M1' }), await createUser(head, { role: 'MANAGER', label: 'M2' })];
    const emp = await createUser(head, { managerId: m1.id, label: 'E' });
    const created = (await head.http.get('/api/v1/admin/users', { q: emp.email })).body.items[0];
    expect(created.manager_id).toBe(m1.id);
    expect((await patchUser(head, emp.id, { manager_id: m2.id })).status).toBe(200);
    expect((await head.http.get('/api/v1/admin/users', { q: emp.email })).body.items[0].manager_id).toBe(m2.id);
  });

  test('TC-CFG-009 Manager change that creates a cycle is refused @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-CFG-009'));
    const head = await as('head');
    const a = await createUser(head, { role: 'MANAGER', label: 'A' });
    const b = await createUser(head, { role: 'MANAGER', managerId: a.id, label: 'B' });
    const direct = await patchUser(head, a.id, { manager_id: b.id });
    expect([400, 409, 422], `A under B (got ${direct.status})`).toContain(direct.status);
    const c = await createUser(head, { role: 'MANAGER', managerId: b.id, label: 'C' });
    const indirect = await patchUser(head, a.id, { manager_id: c.id });
    expect([400, 409, 422], `A under C (got ${indirect.status})`).toContain(indirect.status);
  });
});
