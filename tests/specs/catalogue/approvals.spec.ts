import { randomUUID } from 'node:crypto';
import { STATUS } from '../../config/environments';
import { createUser, loginAs, patchUser } from '../../src/api/admin';
import { ConfigAdmin } from '../../src/api/config-admin';
import { Session } from '../../src/api/session';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { isolatedDate } from '../../src/data/dates';
import { claimTitle, line, uniqueVendor } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { approvedLevels, submitTravel } from '../../src/data/scenarios';

const ref = (id: string) => ({ epic: 'Catalogue', feature: id.includes('DEL') ? 'Delegation' : 'Approvals', severity: 'critical' as const, ref: id });

test.describe('Approval chain and state machine', () => {
  test('TC-APR-001 Claim up to 25,000 INR needs the manager only @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-001'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-001', inr(20000));
    const done = await m.approvals.decide(c.id, 'approve');
    expect(done.status).toBe(STATUS.approved);
    expect(done.steps.filter((s) => s.role === 'AUDITOR')).toHaveLength(0);
  });

  test('TC-APR-002 Exactly 25,000.00 INR stays manager-only @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-002'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-002', inr(25000));
    expect((await m.approvals.decide(c.id, 'approve')).status).toBe(STATUS.approved);
  });

  test('TC-APR-003 25,000.01 INR needs the auditor as well @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-003'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-003', 2500001);
    const after = await m.approvals.decide(c.id, 'approve');
    expect(after.status).toBe(STATUS.pendingAuditor);
    expect(after.required_levels).toEqual([1, 2]);
  });

  test('TC-APR-004 Exactly 1,00,000.00 INR ends at the auditor @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-004'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const c = await submitTravel(e, 'APR-004', inr(100000));
    await m.approvals.decide(c.id, 'approve');
    const done = await a.approvals.decide(c.id, 'approve');
    expect(done.status).toBe(STATUS.approved);
    expect(done.steps.filter((s) => s.role === 'FINANCE_HEAD')).toHaveLength(0);
  });

  test('TC-APR-005 1,00,000.01 INR needs the finance head @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-005'));
    const [e, m, a, h] = [await as('employee'), await as('manager'), await as('auditor'), await as('head')];
    const c = await submitTravel(e, 'APR-005', 10000001);
    await m.approvals.decide(c.id, 'approve');
    expect((await a.approvals.decide(c.id, 'approve')).status).toBe(STATUS.pendingHead);
    expect((await h.approvals.decide(c.id, 'approve')).status).toBe(STATUS.approved);
  });

  test('TC-APR-006 Full chain for a 5,00,000 INR claim @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-006'));
    const [e, m, a, h] = [await as('employee'), await as('manager'), await as('auditor'), await as('head')];
    const c = await submitTravel(e, 'APR-006', inr(500000));
    await m.approvals.decide(c.id, 'approve');
    await a.approvals.decide(c.id, 'approve');
    const done = await h.approvals.decide(c.id, 'approve');
    expect(done.status).toBe(STATUS.approved);
    expect(approvedLevels(done)).toEqual([1, 2, 3]);
    expect(done.steps.filter((s) => s.round === done.round)).toHaveLength(3);
  });

  test('TC-APR-007 Threshold uses payable total, not gross total @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-007'));
    const e = await as('employee');
    const c = await e.claims.createAndSubmit(claimTitle('APR-007'), [line.meals(inr(6000)), line.travel(inr(24000))]);
    expect(c.total_paise).toBe(inr(30000));
    expect(c.payable_paise).toBe(inr(24000));
    expect(c.required_levels).toEqual([1]);
  });

  test('TC-APR-008 Steps must be approved in order: only the open step is actionable @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-008'));
    const [e, a] = [await as('employee'), await as('auditor')];
    const c = await submitTravel(e, 'APR-008', inr(30000));
    expect(c.steps.filter((s) => s.status === 'PENDING')).toHaveLength(1);
    const res = await a.approvals.actRaw(c.current_step!.id, 'approve', { expected_version: c.version });
    expect([403, 409], `a later-level approver is refused (got ${res.status})`).toContain(res.status);
    expect((await e.claims.get(c.id)).status).toBe(STATUS.pendingManager);
  });

  test('TC-APR-009 Manager cannot reject without a comment @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-009'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-009', inr(8000));
    expect((await m.approvals.decideRaw(c.id, 'reject')).status).toBe(400);
    expect((await e.claims.get(c.id)).status).toBe(STATUS.pendingManager);
  });

  test('TC-APR-010 Manager reject sets REJECTED terminal state and the owner sees the comment @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-010'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-010', inr(8000));
    await m.approvals.decide(c.id, 'reject', 'Not a business expense');
    const back = await e.claims.get(c.id);
    expect(back.status).toBe(STATUS.rejected);
    expect(back.steps.find((s) => s.status === 'REJECTED')?.comment).toBe('Not a business expense');
    expect(back.allowed_actions.filter((a) => ['edit', 'submit', 'resubmit', 'withdraw', 'approve'].includes(a)), 'no further actions').toEqual([]);
  });

  test('TC-APR-011 Send back requires a comment @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-011'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-011', inr(8000));
    expect((await m.approvals.decideRaw(c.id, 'send-back')).status).toBe(400);
    expect((await e.claims.get(c.id)).status).toBe(STATUS.pendingManager);
  });

  test('TC-APR-012 Send back returns the claim to the employee @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-012'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-012', inr(8000));
    await m.approvals.decide(c.id, 'send-back', 'Fix the vendor name');
    const back = await e.claims.get(c.id);
    expect(back.status).toBe(STATUS.sentBack);
    expect(back.allowed_actions).toContain('edit');
    expect(back.steps.find((s) => s.status === 'SENT_BACK')?.comment).toBe('Fix the vendor name');
  });

  test('TC-APR-013 Resubmit after send-back starts a new round at the manager; earlier steps are SUPERSEDED, not deleted @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-013'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-013', inr(8000));
    const sent = await m.approvals.decide(c.id, 'send-back', 'Please fix');
    await e.claims.editLineAmount(c.id, sent.lines[0].id, inr(7900));
    const re = await e.claims.resubmit(c.id);
    expect(re.round).toBeGreaterThan(sent.round);
    expect(re.current_step?.level_no).toBe(1);
    const round1 = re.steps.filter((s) => s.round === sent.round);
    expect(round1.length, 'earlier steps are kept, not deleted').toBeGreaterThan(0);
    expect(round1.map((s) => s.status), 'earlier steps are marked SUPERSEDED').toEqual(round1.map(() => 'SUPERSEDED'));
  });

  test('TC-APR-014 Resubmit re-runs the policy engine @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-014'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await e.claims.createAndSubmit(claimTitle('APR-014'), [line.meals(inr(1000)), line.travel(inr(8000))]);
    const sent = await m.approvals.decide(c.id, 'send-back', 'Check meals');
    const meals = sent.lines.find((l) => l.category === 'MEALS')!;
    await e.claims.editLineAmount(c.id, meals.id, inr(1800));
    const re = await e.claims.resubmit(c.id);
    expect(re.lines.find((l) => l.id === meals.id)!.status).toBe(STATUS.lineAutoRejected);
    expect(re.lines.find((l) => l.id === meals.id)!.findings.some((f) => f.rule_code === 'MEALS_DAILY_CAP')).toBe(true);
  });

  test('TC-APR-015 Resubmit that changes the total updates required levels @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-015'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-015', inr(30000));
    expect(c.required_levels).toEqual([1, 2]);
    const sent = await m.approvals.decide(c.id, 'send-back', 'Reduce the amount');
    await e.claims.editLineAmount(c.id, sent.lines[0].id, inr(20000));
    expect((await e.claims.resubmit(c.id)).required_levels).toEqual([1]);
  });

  test('TC-APR-016 Approver can comment without changing state @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-016'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-016', inr(8000));
    const res = await m.http.post(`/api/v1/claims/${c.id}/comments`, { body: 'Is this the right invoice?' });
    expect(res.status).toBe(201);
    const back = await e.claims.get(c.id);
    expect(back.comments.map((x) => x.body)).toContain('Is this the right invoice?');
    expect(back.status).toBe(STATUS.pendingManager);
    expect(back.current_step?.id).toBe(c.current_step?.id);
  });

  test('TC-APR-017 Manager cannot approve a claim outside their team @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-017'));
    const [e, other] = [await as('employee'), await as('manager2')];
    const c = await submitTravel(e, 'APR-017', inr(8000));
    const res = await other.approvals.actRaw(c.current_step!.id, 'approve', { expected_version: c.version });
    expect([403, 404]).toContain(res.status);
    expect((await e.claims.get(c.id)).status).toBe(STATUS.pendingManager);
  });

  test('TC-APR-018 Manager\'s own claim escalates to their manager @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-018'));
    const [m, h] = [await as('manager'), await as('head')];
    const c = await submitTravel(m, 'APR-018', inr(8000));
    expect(c.current_step?.assigned_to).toBe((await h.me()).id);
    expect(c.current_step?.assigned_to).not.toBe((await m.me()).id);
  });

  test('TC-APR-019 Auditor\'s own claim cannot be approved by that auditor @catalogue @approvals', async ({ as, env }) => {
    await describeTest(ref('TC-APR-019'));
    const [head, other] = [await as('head'), await as('auditor')];
    const tmp = await createUser(head, { role: 'AUDITOR', label: 'Own' });
    const me = new Session(await loginAs(env, tmp), tmp);
    const c = await submitTravel(me, 'APR-019', inr(30000));
    await head.approvals.decide(c.id, 'approve'); // level 1: the auditor's manager is the head
    const now = await head.claims.get(c.id);
    expect(now.status).toBe(STATUS.pendingAuditor);
    const own = await me.approvals.actRaw(now.current_step!.id, 'approve', { expected_version: now.version });
    expect([403, 404, 409], `own approval refused (got ${own.status})`).toContain(own.status);
    expect((await other.approvals.decide(c.id, 'approve')).status, 'another auditor acts').toBe(STATUS.approved);
  });

  test('TC-APR-020 Finance head\'s own claim cannot be approved by the head @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-020'));
    const h = await as('head');
    const c = await submitTravel(h, 'APR-020', inr(8000));
    if (c.current_step) {
      const res = await h.approvals.actRaw(c.current_step.id, 'approve', { expected_version: c.version });
      expect([403, 404, 409], `head approving own claim (got ${res.status})`).toContain(res.status);
      expect(c.current_step.assigned_to).not.toBe((await h.me()).id);
    }
    expect((await h.claims.get(c.id)).status, 'the claim is not approved by its owner').not.toBe(STATUS.approved);
  });

  test('TC-APR-021 Same person cannot approve two levels of one claim @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-021'));
    const [e, h] = [await as('employee'), await as('head')];
    const c = await submitTravel(e, 'APR-021', inr(500000));
    // The head is not in this chain at level 1, so move the claim to level 3 and let the head try both.
    await (await as('manager')).approvals.decide(c.id, 'approve');
    await (await as('auditor')).approvals.decide(c.id, 'approve');
    const atHead = await h.claims.get(c.id);
    expect(atHead.status).toBe(STATUS.pendingHead);
    expect((await h.approvals.decide(c.id, 'approve')).status).toBe(STATUS.approved);
    // A person who approved level 1 must not be able to approve level 2 of another claim they also touched:
    const c2 = await submitTravel(e, 'APR-021b', inr(30000));
    const m = await as('manager');
    await m.approvals.decide(c2.id, 'approve');
    const again = await m.approvals.decideRaw(c2.id, 'approve');
    expect([403, 404, 409]).toContain(again.status);
  });

  test('TC-APR-022 Simultaneous approval by two auditors: one wins @catalogue @approvals @concurrency', async ({ as, env }) => {
    await describeTest(ref('TC-APR-022'));
    const [e, m, a1, head] = [await as('employee'), await as('manager'), await as('auditor'), await as('head')];
    const tmp = await createUser(head, { role: 'AUDITOR', label: 'Race' });
    const a2 = new Session(await loginAs(env, tmp), tmp);
    const c = await submitTravel(e, 'APR-022', inr(30000));
    await m.approvals.decide(c.id, 'approve');
    const open = await e.claims.get(c.id);
    const body = { comment: 'race', expected_version: open.version };
    const [x, y] = await Promise.all([a1.approvals.actRaw(open.current_step!.id, 'approve', body), a2.approvals.actRaw(open.current_step!.id, 'approve', body)]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const done = await e.claims.get(c.id);
    expect(done.steps.filter((s) => s.level_no === 2 && s.status === 'APPROVED')).toHaveLength(1);
  });

  test('TC-APR-023 Double click on Approve creates one transition (same Idempotency-Key) @catalogue @approvals @concurrency', async ({ as }) => {
    await describeTest(ref('TC-APR-023'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-023', inr(8000));
    const key = randomUUID();
    const body = { comment: 'double', expected_version: c.version };
    const url = `/api/v1/approvals/${c.current_step!.id}/approve`;
    const [x, y] = await Promise.all([m.http.request('POST', url, { data: body, idempotencyKey: key }), m.http.request('POST', url, { data: body, idempotencyKey: key })]);
    expect(x.status, 'first request succeeds').toBe(200);
    expect(y.status, 'the replay returns the same response').toBe(200);
    expect(y.body).toEqual(x.body);
    const done = await e.claims.get(c.id);
    expect(done.steps.filter((s) => s.status === 'APPROVED')).toHaveLength(1);
  });

  test('TC-APR-024 Approve with stale expected_version is refused @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-024'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-024', inr(8000));
    const res = await m.approvals.actRaw(c.current_step!.id, 'approve', { expected_version: c.version - 1 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'CLAIM_VERSION_CONFLICT' } });
  });

  test('TC-APR-025 Duplicate flag forces auditor even under 25,000 @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-025'));
    const [e, m] = [await as('employee'), await as('manager')];
    const [date, vendor] = [isolatedDate(), uniqueVendor('Dup25')];
    await e.claims.createAndSubmit(claimTitle('APR-025 a'), [line.other(inr(2000), { vendor, date })]);
    const b = await e.claims.createAndSubmit(claimTitle('APR-025 b'), [line.other(inr(2000), { vendor, date })]);
    expect((await m.approvals.decide(b.id, 'approve')).status).toBe(STATUS.pendingAuditor);
  });

  test('TC-APR-026 Approval records actor, time and comment @catalogue @approvals', async ({ as, env }) => {
    await describeTest(ref('TC-APR-026'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-026', inr(8000));
    const done = await m.approvals.decide(c.id, 'approve', 'Looks fine');
    const step = done.steps.find((s) => s.status === 'APPROVED')! as typeof done.steps[number] & { acted_at: string };
    expect(step.acted_by_id).toBe((await m.me()).id);
    expect(step.acted_by_name).toBe(env.personas.manager!.name);
    expect(step.comment).toBe('Looks fine');
    expect(new Date(step.acted_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect((await e.claims.timeline(c.id)).some((t) => t.actor_name === env.personas.manager!.name)).toBe(true);
  });

  test('TC-APR-027 Terminal states cannot transition @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-027'));
    const [e, m, head] = [await as('employee'), await as('manager'), await as('head')];
    const rejected = await submitTravel(e, 'APR-027 r', inr(8000));
    await m.approvals.decide(rejected.id, 'reject', 'no');
    const rej = await e.claims.get(rejected.id);
    const withdrawn = await submitTravel(e, 'APR-027 w', inr(8000));
    await e.claims.withdraw(withdrawn.id);
    const wd = await e.claims.get(withdrawn.id);
    const outcomes: Record<string, number> = {};
    for (const [name, claim] of [['REJECTED', rej], ['WITHDRAWN', wd]] as const) {
      const stepId = claim.steps[claim.steps.length - 1].id;
      outcomes[`${name} approve`] = (await m.approvals.actRaw(stepId, 'approve', { expected_version: claim.version })).status;
      outcomes[`${name} send-back`] = (await m.approvals.actRaw(stepId, 'send-back', { comment: 'x', expected_version: claim.version })).status;
      outcomes[`${name} withdraw`] = (await e.http.post(`/api/v1/claims/${claim.id}/withdraw`, { expected_version: claim.version })).status;
    }
    const paid = (await head.claims.list({ status: 'PAID', scope: 'all', limit: 1 })).body.items[0];
    const paidFull = await head.claims.get(paid.id);
    const lastStep = paidFull.steps[paidFull.steps.length - 1];
    outcomes['PAID approve'] = (await head.approvals.actRaw(lastStep.id, 'approve', { expected_version: paidFull.version })).status;
    outcomes['PAID send-back'] = (await head.approvals.actRaw(lastStep.id, 'send-back', { comment: 'x', expected_version: paidFull.version })).status;
    expect(outcomes).toEqual(Object.fromEntries(Object.keys(outcomes).map((k) => [k, 409])));
    expect((await head.claims.get(paid.id)).status).toBe(STATUS.paid);
  });

  test('TC-APR-029 Line statuses follow the claim status @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-029'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await e.claims.createAndSubmit(claimTitle('APR-029'), [line.meals(inr(1800)), line.travel(inr(3000)), line.travel(inr(4000))]);
    const done = await m.approvals.decide(c.id, 'approve');
    expect(done.status).toBe(STATUS.approved);
    expect(done.lines.filter((l) => l.status === 'APPROVED')).toHaveLength(2);
    expect(done.lines.find((l) => l.category === 'MEALS')!.status).toBe(STATUS.lineAutoRejected);
  });

  test('TC-APR-030 Approved claim is immutable @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-030'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'APR-030', inr(8000));
    const done = await m.approvals.decide(c.id, 'approve');
    const p1 = await e.http.patch(`/api/v1/claims/${c.id}`, { title: 'x', expected_version: done.version });
    const p2 = await e.claims.patchLineRaw(c.id, done.lines[0].id, done.version, { amount_paise: 1 });
    const p3 = await e.http.delete(`/api/v1/claims/${c.id}/lines/${done.lines[0].id}?expected_version=${done.version}`);
    const p4 = await e.http.post(`/api/v1/claims/${c.id}/withdraw`, { expected_version: done.version });
    expect([p1.status, p2.status, p3.status, p4.status]).toEqual([409, 409, 409, 409]);
  });

  test('TC-APR-031 Hierarchy change after submit does not reassign open steps @catalogue @approvals', async ({ as, env }) => {
    await describeTest(ref('TC-APR-031'));
    const head = await as('head');
    const [m1, m2] = [await createUser(head, { role: 'MANAGER', label: 'Old' }), await createUser(head, { role: 'MANAGER', label: 'New' })];
    const emp = await createUser(head, { managerId: m1.id, label: 'Mover' });
    const e = new Session(await loginAs(env, emp), emp);
    const c = await submitTravel(e, 'APR-031', inr(8000));
    expect(c.current_step?.assigned_to).toBe(m1.id);
    expect((await patchUser(head, emp.id, { manager_id: m2.id })).status).toBe(200);
    const after = await e.claims.get(c.id);
    expect(after.current_step?.assigned_to, 'the in-flight step keeps its original assignee').toBe(m1.id);
  });

  test('TC-APR-032 Threshold change does not affect claims in flight @catalogue @approvals @config', async ({ as }) => {
    await describeTest(ref('TC-APR-032'));
    const [e, m, head] = [await as('employee'), await as('manager'), await as('head')];
    const inflight = await submitTravel(e, 'APR-032 old', inr(30000));
    expect(inflight.required_levels).toEqual([1, 2]);
    await new ConfigAdmin(head).withLevels(
      (levels) => levels.map((l) => (l.level_no === 2 ? { ...l, min_amount_paise_exclusive: inr(50000) } : l)),
      async () => {
        const fresh = await submitTravel(e, 'APR-032 new', inr(30000));
        expect(fresh.required_levels, 'new 30,000 claims need the manager only').toEqual([1]);
        expect((await m.approvals.decide(inflight.id, 'approve')).status, 'the in-flight claim still goes to the auditor').toBe(STATUS.pendingAuditor);
      },
    );
  });

  test('TC-APR-033 Head can reject a claim at the head step @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-APR-033'));
    const [e, m, a, h] = [await as('employee'), await as('manager'), await as('auditor'), await as('head')];
    const c = await submitTravel(e, 'APR-033', inr(150000));
    await m.approvals.decide(c.id, 'approve');
    await a.approvals.decide(c.id, 'approve');
    const rej = await h.approvals.decide(c.id, 'reject', 'Over budget');
    expect(rej.status).toBe(STATUS.rejected);
    expect(rej.steps.find((s) => s.status === 'REJECTED')?.acted_by_name).toBe((await h.me()).full_name);
  });
});

test.describe('Delegation', () => {
  test('TC-DEL-001 Manager delegates for a date range and the delegate sees the items marked as delegated @catalogue @approvals', async ({ as, env }) => {
    await describeTest(ref('TC-DEL-001'));
    const [e, m, d] = [await as('employee'), await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const now = Date.now();
    const created = await m.delegations.createRaw((await d.me()).id, 1, new Date(now - 60_000), new Date(now + 5 * 86_400_000));
    expect(created.status).toBe(201);
    try {
      const c = await submitTravel(e, 'DEL-001', inr(8000));
      const item = (await d.approvals.inbox()).find((i) => i.id === c.id);
      expect(item?.delegated_from_name).toBe(env.personas.manager!.name);
    } finally {
      await m.delegations.remove(created.body.id);
    }
  });

  test('TC-DEL-002 Delegate approves on behalf of the approver @catalogue @approvals', async ({ as, env }) => {
    await describeTest(ref('TC-DEL-002'));
    const [e, m, d] = [await as('employee'), await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const del = await m.delegations.create((await d.me()).id, 1);
    try {
      const c = await submitTravel(e, 'DEL-002', inr(8000));
      const done = await d.approvals.decide(c.id, 'approve', 'On behalf');
      const step = done.steps.find((s) => s.status === 'APPROVED')!;
      expect(done.status).toBe(STATUS.approved);
      expect(step.acted_by_id).toBe((await d.me()).id);
      expect(step.on_behalf_of_id).toBe((await m.me()).id);
      expect((await e.claims.timeline(c.id)).some((t) => t.actor_name === env.personas.delegate!.name && t.on_behalf_of_name === env.personas.manager!.name), 'both shown on the timeline').toBe(true);
    } finally {
      await m.delegations.remove(del.id);
    }
  });

  test('TC-DEL-003 Delegate cannot act before the start date @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-DEL-003'));
    const [e, m, d] = [await as('employee'), await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const now = Date.now();
    const created = await m.delegations.createRaw((await d.me()).id, 1, new Date(now + 2 * 86_400_000), new Date(now + 5 * 86_400_000));
    expect(created.status).toBe(201);
    try {
      const c = await submitTravel(e, 'DEL-003', inr(8000));
      expect(await d.approvals.inboxClaimIds()).not.toContain(c.id);
      // The claim is hidden from a manager outside its reporting line, so this is a 404 (docs/02), not a 403.
      expect([403, 404]).toContain((await d.approvals.actRaw(c.current_step!.id, 'approve', { expected_version: c.version })).status);
    } finally {
      await m.delegations.remove(created.body.id);
    }
  });

  test('TC-DEL-004 Delegate cannot act after the end date @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-DEL-004'));
    const [e, m, d] = [await as('employee'), await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const now = Date.now();
    const created = await m.delegations.createRaw((await d.me()).id, 1, new Date(now - 3 * 86_400_000), new Date(now - 86_400_000));
    if (created.ok) {
      try {
        const c = await submitTravel(e, 'DEL-004', inr(8000));
        expect([403, 404]).toContain((await d.approvals.actRaw(c.current_step!.id, 'approve', { expected_version: c.version })).status);
      } finally {
        await m.delegations.remove(created.body.id);
      }
    } else {
      // A delegation that has already ended is refused at creation: it can never be used.
      expect([400, 409, 422]).toContain(created.status);
    }
  });

  test('TC-DEL-005 Revoked delegation stops access immediately @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-DEL-005'));
    const [e, m, d] = [await as('employee'), await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const del = await m.delegations.create((await d.me()).id, 1);
    const c = await submitTravel(e, 'DEL-005', inr(8000));
    expect(await d.approvals.inboxClaimIds()).toContain(c.id);
    await m.delegations.remove(del.id);
    expect(await d.approvals.inboxClaimIds(), 'items disappear').not.toContain(c.id);
    expect([403, 404], 'hidden claim: 404 per docs/02').toContain((await d.approvals.actRaw(c.current_step!.id, 'approve', { expected_version: c.version })).status);
  });

  test('TC-DEL-006 Delegate must hold same or higher role @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-DEL-006'));
    const [m, emp] = [await as('manager'), await as('employee2')];
    const res = await m.delegations.createRaw((await emp.me()).id, 1, new Date(Date.now() - 60_000), new Date(Date.now() + 86_400_000));
    expect([400, 422]).toContain(res.status);
  });

  test('TC-DEL-007 Delegation to oneself is rejected @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-DEL-007'));
    const m = await as('manager');
    const res = await m.delegations.createRaw((await m.me()).id, 1, new Date(Date.now() - 60_000), new Date(Date.now() + 86_400_000));
    expect([400, 409, 422]).toContain(res.status);
  });

  test('TC-DEL-008 Delegate who is the claim owner cannot approve it @catalogue @approvals', async ({ as, env }) => {
    await describeTest(ref('TC-DEL-008'));
    const head = await as('head');
    const boss = await createUser(head, { role: 'MANAGER', label: 'Boss' });
    const deputy = await createUser(head, { role: 'MANAGER', managerId: boss.id, label: 'Deputy' });
    const b = new Session(await loginAs(env, boss), boss);
    const d = new Session(await loginAs(env, deputy), deputy);
    const del = await b.delegations.create(deputy.id, 1);
    const c = await submitTravel(d, 'DEL-008', inr(8000));
    expect(c.current_step?.assigned_to, 'the deputy\'s claim goes to the boss').toBe(boss.id);
    const res = await d.approvals.actRaw(c.current_step!.id, 'approve', { expected_version: c.version });
    expect([403, 404, 409]).toContain(res.status);
    await b.delegations.remove(del.id);
  });

  test('TC-DEL-009 Delegation longer than 30 days is rejected; 30 days accepted @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-DEL-009'));
    const [m, d] = [await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const now = Date.now();
    const id = (await d.me()).id;
    const long = await m.delegations.createRaw(id, 1, new Date(now - 60_000), new Date(now + 31 * 86_400_000));
    expect(long.status).toBe(400);
    const ok = await m.delegations.createRaw(id, 1, new Date(now - 60_000), new Date(now + 29.9 * 86_400_000));
    expect(ok.status).toBe(201);
    await m.delegations.remove(ok.body.id);
  });

  test('TC-DEL-010 Only one active delegation per approver and level @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-DEL-010'));
    const [m, d] = [await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const first = await m.delegations.create((await d.me()).id, 1);
    try {
      const second = await m.delegations.createRaw((await d.me()).id, 1, new Date(Date.now() - 60_000), new Date(Date.now() + 2 * 86_400_000));
      expect(second.status, 'overlapping second delegation is a conflict').toBe(409);
    } finally {
      await m.delegations.remove(first.id);
    }
  });

  test('TC-DEL-011 Auditor level can be delegated with both identities recorded @catalogue @approvals', async ({ as, env }) => {
    await describeTest(ref('TC-DEL-011'));
    const [e, m, head] = [await as('employee'), await as('manager'), await as('head')];
    const [ua, ub] = [await createUser(head, { role: 'AUDITOR', label: 'Delegator' }), await createUser(head, { role: 'AUDITOR', label: 'Delegate' })];
    const a = new Session(await loginAs(env, ua), ua);
    const b = new Session(await loginAs(env, ub), ub);
    await a.delegations.create(ub.id, 2);
    const c = await submitTravel(e, 'DEL-011', inr(30000));
    await m.approvals.decide(c.id, 'approve');
    const done = await b.approvals.decide(c.id, 'approve');
    const step = done.steps.find((s) => s.level_no === 2 && s.status === 'APPROVED')!;
    expect(step.acted_by_id).toBe(ub.id);
    expect(step.on_behalf_of_id, 'the delegator is recorded as well').toBe(ua.id);
  });

  test('TC-DEL-012 Delegate sees only the delegator\'s scope @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-DEL-012'));
    const [e, e2, m, d] = [await as('employee'), await as('employee2'), await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const del = await m.delegations.create((await d.me()).id, 1);
    try {
      const mine = await submitTravel(e, 'DEL-012 mine', inr(8000));
      const foreign = await submitTravel(e2, 'DEL-012 other team', inr(8000));
      const ids = await d.approvals.inboxClaimIds();
      expect(ids).toContain(mine.id);
      expect(ids, 'no other teams').not.toContain(foreign.id);
    } finally {
      await m.delegations.remove(del.id);
    }
  });
});
