import { randomUUID } from 'node:crypto';
import { STATUS } from '../../config/environments';
import { Claim } from '../../src/api/types';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { duplicatePairAtAuditor, submitTravel } from '../../src/data/scenarios';
import { sampledClaim } from '../../src/data/seeded';

const ref = (id: string) => ({ epic: 'Catalogue', feature: 'Auditor queue', severity: 'critical' as const, ref: id });
const ids = (r: { body: { items: Array<{ id: string }> } }) => r.body.items.map((c) => c.id);
type Summary = Claim & { department_id: string; sample_audit_pending: boolean; has_high_severity: boolean };

test.describe('Auditor review queue', () => {
  test('TC-AUD-001 Review queue lists auditor-level steps and pending sample audits only @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-001'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const atAuditor = await submitTravel(e, 'AUD-001 auditor', inr(30000));
    await m.approvals.decide(atAuditor.id, 'approve');
    const atManager = await submitTravel(e, 'AUD-001 manager', inr(30000));
    const res = await a.review.queueRaw({ limit: 100 });
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(atAuditor.id);
    expect(ids(res), 'a claim still at the manager is not listed').not.toContain(atManager.id);
    for (const c of res.body.items as Summary[]) expect(c.status === STATUS.pendingAuditor || c.sample_audit_pending, `${c.claim_no} (${c.status})`).toBe(true);
  });

  test('TC-AUD-002 Queue filter by status (tabs) with the filter reflected in the URL @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-AUD-002'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'AUD-002', inr(30000));
    await m.approvals.decide(c.id, 'approve');
    const app = await ui('auditor');
    await app.queue.open();
    const tabs = app.page.getByRole('group', { name: 'Queue filter' }).getByRole('button');
    expect(await tabs.count(), 'the queue offers filters').toBeGreaterThan(1);
    await tabs.nth(1).click();
    await expect(app.page, 'the chosen filter appears in the URL query').toHaveURL(/\?.+/);
  });

  test('TC-AUD-003 Queue filter by department and category @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-003'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const c = await e.claims.createAndSubmit(claimTitle('AUD-003'), [line.travel(inr(30000))]);
    await m.approvals.decide(c.id, 'approve');
    const dept = (await a.claims.get(c.id) as Summary).department_id;
    const both = await a.review.queueRaw({ department_id: dept, category: 'TRAVEL', q: c.claim_no });
    expect(ids(both)).toContain(c.id);
    const wrongCat = await a.review.queueRaw({ department_id: dept, category: 'HOTEL', q: c.claim_no });
    expect(ids(wrongCat), 'both filters must hold').not.toContain(c.id);
    const widened = await a.review.queueRaw({ category: 'TRAVEL', q: c.claim_no });
    expect(ids(widened), 'clearing one filter widens the results').toContain(c.id);
  });

  test('TC-AUD-004 Queue filter by amount range and date range @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-004'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const atMin = await submitTravel(e, 'AUD-004 min', inr(25001));
    const inside = await submitTravel(e, 'AUD-004 in', inr(40000));
    const above = await submitTravel(e, 'AUD-004 above', inr(50001));
    for (const c of [atMin, inside, above]) await m.approvals.decide(c.id, 'approve');
    const to = new Date(Date.now() + 60_000).toISOString();
    const from30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const res = await a.review.queueRaw({ min_payable_paise: inr(25000), max_payable_paise: inr(50000), submitted_from: from30, submitted_to: to, limit: 100 });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(expect.arrayContaining([atMin.id, inside.id]));
    expect(ids(res), 'above the range').not.toContain(above.id);
    for (const c of res.body.items) {
      expect(c.payable_paise).toBeGreaterThanOrEqual(inr(25000));
      expect(c.payable_paise).toBeLessThanOrEqual(inr(50000));
    }
  });

  test('TC-AUD-005 Queue filter by flag type and sample-audit marker @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-005'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const { duplicate, clean } = await duplicatePairAtAuditor(e, m);
    const flagged = await a.review.queueRaw({ flag: 'DUPLICATE_LINE', limit: 100 });
    expect(ids(flagged)).toContain(duplicate.id);
    expect(ids(flagged)).not.toContain(clean.id);
    const sampled = await a.review.queueRaw({ sample_audit: true, limit: 100 });
    for (const c of sampled.body.items as Summary[]) expect(c.sample_audit_pending).toBe(true);
  });

  test('TC-AUD-006 Queue free-text search by owner or claim number @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-006'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const c = await submitTravel(e, 'AUD-006', inr(30000));
    await m.approvals.decide(c.id, 'approve');
    expect(ids(await a.review.queueRaw({ q: c.claim_no }))).toEqual([c.id]);
    const byOwner = await a.review.queueRaw({ q: (await e.me()).full_name, limit: 100 });
    expect(ids(byOwner)).toContain(c.id);
    expect(ids(await a.review.queueRaw({ q: `nomatch-${randomUUID()}` }))).toEqual([]);
  });

  test('TC-AUD-008 Cursor pagination is stable while data changes @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-008'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const made: Claim[] = [];
    for (let i = 0; i < 6; i++) {
      const c = await submitTravel(e, `AUD-008 ${i}`, inr(30000 + i));
      await m.approvals.decide(c.id, 'approve');
      made.push(c);
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    let page = 0;
    do {
      const res = await a.review.queueRaw({ limit: 5, ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      seen.push(...ids(res));
      cursor = (res.body as { next_cursor?: string }).next_cursor ?? undefined;
      if (page++ === 0) await a.approvals.decide(made[5].id, 'approve'); // data changes between pages
    } while (cursor && page < 40);
    expect(new Set(seen).size, 'no row is duplicated across pages').toBe(seen.length);
  });
});

test.describe('Bulk approve', () => {
  test('TC-AUD-009 Bulk approve of 10 clean auditor-level claims @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-009'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const made: Claim[] = [];
    for (let i = 0; i < 10; i++) {
      const c = await submitTravel(e, `AUD-009 ${i}`, inr(30000 + i));
      made.push(await m.approvals.decide(c.id, 'approve'));
    }
    const res = await a.review.bulkApproveRaw(made.map((c) => ({ claim_id: c.id, expected_version: c.version })));
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(10);
    expect(res.body.approved).toBe(10);
    for (const c of made) {
      const back = await e.claims.get(c.id);
      expect(back.status).toBe(STATUS.approved);
      expect((await e.claims.timeline(c.id)).filter((t) => /approv/i.test(t.action)).length, 'an audit event per approval').toBeGreaterThanOrEqual(2);
    }
  });

  test('TC-AUD-010 Bulk approve skips claims with a duplicate flag @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-010'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const { duplicate, clean } = await duplicatePairAtAuditor(e, m);
    const res = await a.review.bulkApproveRaw([duplicate, clean].map((c) => ({ claim_id: c.id, expected_version: c.version })));
    const by = Object.fromEntries(res.body.results.map((r) => [r.claim_id, r]));
    expect(by[duplicate.id].result).toBe('SKIPPED');
    expect(by[duplicate.id].reason).toBeTruthy();
    expect(by[clean.id].result).toBe('APPROVED');
  });

  test('TC-AUD-011 Bulk approve skips high-severity flagged claims @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-011'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const { duplicate } = await duplicatePairAtAuditor(e, m);
    expect((await a.claims.get(duplicate.id) as Summary).has_high_severity).toBe(true);
    const res = await a.review.bulkApproveRaw([{ claim_id: duplicate.id, expected_version: duplicate.version }]);
    expect(res.body.results[0].result).toBe('SKIPPED');
    expect(res.body.results[0].reason).toMatch(/review|severity|flag|duplicate/i);
  });

  test('TC-AUD-012 Bulk approve is capped at 50 per call @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-012'));
    const a = await as('auditor');
    const items = (n: number) => Array.from({ length: n }, () => ({ claim_id: randomUUID(), expected_version: 1 }));
    expect((await a.review.bulkApproveRaw(items(50))).status, '50 accepted').toBe(200);
    expect((await a.review.bulkApproveRaw(items(51))).status, '51 rejected').toBe(400);
  });

  test('TC-AUD-013 Bulk approve reports per-item failures for stale versions @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-013'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const [c1, c2] = [await submitTravel(e, 'AUD-013 a', inr(30000)), await submitTravel(e, 'AUD-013 b', inr(30000))];
    const [x, y] = [await m.approvals.decide(c1.id, 'approve'), await m.approvals.decide(c2.id, 'approve')];
    const res = await a.review.bulkApproveRaw([
      { claim_id: x.id, expected_version: x.version + 7 },
      { claim_id: y.id, expected_version: y.version },
    ]);
    const by = Object.fromEntries(res.body.results.map((r) => [r.claim_id, r.result]));
    expect(by[x.id], 'stale claim is reported as FAILED').toBe('FAILED');
    expect(by[y.id]).toBe('APPROVED');
  });

  test('TC-AUD-014 Bulk approve skips claims not at the caller level @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-014'));
    const [e, a] = [await as('employee'), await as('auditor')];
    const c = await submitTravel(e, 'AUD-014', inr(30000));
    const res = await a.review.bulkApproveRaw([{ claim_id: c.id, expected_version: c.version }]);
    expect(res.body.results[0].result).toBe('SKIPPED');
    expect((await e.claims.get(c.id)).status).toBe(STATUS.pendingManager);
  });

  test('TC-AUD-015 Bulk approve of a claim above 1,00,000 INR advances it to the head @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-015'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const c = await m.approvals.decide((await submitTravel(e, 'AUD-015', inr(150000))).id, 'approve');
    const res = await a.review.bulkApproveRaw([{ claim_id: c.id, expected_version: c.version }]);
    expect(res.body.results[0].result).toBe('APPROVED');
    expect((await e.claims.get(c.id)).status, 'advanced, not approved').toBe(STATUS.pendingHead);
  });
});

test.describe('Sample audit', () => {
  test('TC-AUD-017 Auto-approved claims are sampled at about 10% (seed history) @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-017'));
    const h = await as('head');
    const res = await h.ops.dashboardRaw();
    const body = res.body as unknown as { sample_audit: { pending: number; passed: number; failed: number }; approval_time: { auto_approved_count: number } };
    const sampled = body.sample_audit.pending + body.sample_audit.passed + body.sample_audit.failed;
    const rate = sampled / body.approval_time.auto_approved_count;
    expect(rate, `${sampled} sampled of ${body.approval_time.auto_approved_count} auto-approvals`).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.12);
  });

  test('TC-AUD-018 Sampled claim is not payable until resolved @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-018'));
    const [e, a, h] = [await as('employee'), await as('auditor'), await as('head')];
    const c = await sampledClaim(e, a);
    expect(c.status).toBe(STATUS.approved);
    expect(await h.payouts.isEligible(c.id)).toBe(false);
  });

  test('TC-AUD-019 Sample audit PASSED releases the claim for payout @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-019'));
    const [e, a, h] = [await as('employee'), await as('auditor'), await as('head')];
    const c = await sampledClaim(e, a);
    const sample = (await a.review.sampleAudits('PENDING')).find((s) => s.claim_id === c.id)!;
    expect((await a.review.resolveSampleRaw(sample.id, 'PASSED', 'Looks fine')).status).toBe(200);
    expect(await h.payouts.isEligible(c.id)).toBe(true);
  });

  test('TC-AUD-020 Sample audit FAILED reopens at the auditor level @catalogue @approvals', async ({ as }) => {
    await describeTest(ref('TC-AUD-020'));
    const [e, a] = [await as('employee'), await as('auditor')];
    const c = await sampledClaim(e, a);
    const sample = (await a.review.sampleAudits('PENDING')).find((s) => s.claim_id === c.id)!;
    expect((await a.review.resolveSampleRaw(sample.id, 'FAILED', 'Receipt does not match')).status).toBe(200);
    const back = await a.claims.get(c.id);
    expect(back.status).toBe(STATUS.pendingAuditor);
    expect(back.round, 'a new round').toBeGreaterThan(c.round);
    expect((await a.claims.timeline(c.id)).some((t) => /sample/i.test(t.action)), 'the audit trail records the sample result').toBe(true);
  });

  test('TC-AUD-021 Employee never sees that a claim was sampled @catalogue @approvals @security', async ({ as }) => {
    await describeTest(ref('TC-AUD-021'));
    const [e, a] = [await as('employee'), await as('auditor')];
    const c = await sampledClaim(e, a);
    const own = await e.claims.getRaw(c.id);
    const body = own.body as unknown as { sample_audit_pending: boolean; sample_audit: unknown };
    expect(body.sample_audit_pending, 'the employee payload never says the claim was sampled').toBe(false);
    expect(body.sample_audit).toBeNull();
    const list = (await e.claims.list({ limit: 50 })).body.items.find((x) => x.id === c.id) as unknown as { sample_audit_pending: boolean };
    expect(list.sample_audit_pending).toBe(false);
    test.info().annotations.push({ type: 'note', description: 'The fields sample_audit and sample_audit_pending are present in the employee payload but always null/false; the sampled state itself is not disclosed.' });
  });

  test('TC-AUD-023 Only auditor or head can resolve sample audits @catalogue @approvals @security', async ({ as }) => {
    await describeTest(ref('TC-AUD-023'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const c = await sampledClaim(e, a);
    const sample = (await a.review.sampleAudits('PENDING')).find((s) => s.claim_id === c.id)!;
    expect((await e.review.resolveSampleRaw(sample.id, 'PASSED')).status).toBe(403);
    expect((await m.review.resolveSampleRaw(sample.id, 'PASSED')).status).toBe(403);
    expect((await a.review.sampleAudits('PENDING')).some((s) => s.id === sample.id), 'still pending').toBe(true);
  });
});
