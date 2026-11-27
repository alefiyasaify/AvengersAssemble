import { STATUS } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { parseBankFile } from '../../src/data/bank-file';
import { isolatedDate } from '../../src/data/dates';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { approvedLevels, duplicatePairAtAuditor, submitTravel } from '../../src/data/scenarios';

const ref = (id: string) => ({ epic: 'Catalogue', feature: 'End-to-end', severity: 'blocker' as const, ref: id });

test.describe('End-to-end scenarios (ARD section 12)', () => {
  test('TC-E2E-001 E2E-01 Clean claim is drafted, saved, submitted and auto-approved @catalogue @e2e @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-E2E-001'));
    const [e, a, h] = [await as('employee'), await as('auditor'), await as('head')];
    const app = await ui('employee');
    const title = claimTitle('E2E-001');
    await app.capture.open();
    await app.capture.setTitle(title);
    await app.capture.fillLine(1, line.cab(inr(1200), { date: isolatedDate(), description: 'Airport drop' }));
    const id = await app.capture.saveDraft();
    expect((await e.claims.get(id)).status).toBe(STATUS.draft);
    await app.capture.submit();
    const c = await e.claims.get(id);
    expect(c.status).toBe(STATUS.approved);
    expect(c.auto_approved).toBe(true);
    const payable = await h.payouts.isEligible(id);
    const sampled = (await a.claims.get(id)).sample_audit_pending;
    expect(payable || sampled, 'payable, or held in the sample audit').toBe(true);
  });

  test('TC-E2E-002 E2E-02 Meals over the daily limit is auto-rejected with a reason @catalogue @e2e @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-E2E-002'));
    const e = await as('employee');
    const app = await ui('employee');
    const title = claimTitle('E2E-002');
    await app.capture.open();
    await app.capture.setTitle(title);
    await app.capture.fillLine(1, line.meals(inr(1800), { description: 'Team dinner' }));
    await app.capture.addLine(line.travel(inr(8000), { description: 'Client visit' }), 2);
    await app.capture.reviewButton().click();
    await expect(app.capture.reviewModal().getByText('Rejected by policy')).toBeVisible();
    await expect(app.capture.reviewModal().getByText(/1,500/).first()).toBeVisible();
    await app.capture.reviewModal().getByRole('button', { name: 'Submit claim' }).click();
    await app.page.waitForURL(/\/employee\/claims$/);
    const c = (await e.claims.list({ q: title })).body.items[0];
    const full = await e.claims.get(c.id);
    expect(full.lines.find((l) => l.category === 'MEALS')!.status).toBe(STATUS.lineAutoRejected);
    expect(full.lines.find((l) => l.category === 'MEALS')!.findings[0].reason).toMatch(/1,500/);
    await app.capture.openClaim(c.id);
    await expect(app.page.getByText(/1,500/).first(), 'the reason is shown to the employee').toBeVisible();
  });

  test('TC-E2E-003 E2E-03 8,000 INR claim approved by the manager only @catalogue @e2e @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-E2E-003'));
    const e = await as('employee');
    const c = await submitTravel(e, 'E2E-003', inr(8000));
    const app = await ui('manager');
    await app.inbox.open('/manager/inbox');
    await app.inbox.row(c.claim_no).click();
    await app.review.approveButton().click();
    await expect.poll(async () => (await e.claims.get(c.id)).status).toBe(STATUS.approved);
    expect((await e.claims.get(c.id)).steps.filter((s) => s.role !== 'MANAGER')).toHaveLength(0);
  });

  test('TC-E2E-004 E2E-04 30,000 INR claim needs manager then auditor @catalogue @e2e', async ({ as }) => {
    await describeTest(ref('TC-E2E-004'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const c = await submitTravel(e, 'E2E-004', inr(30000));
    const mid = await m.approvals.decide(c.id, 'approve');
    expect(mid.status, 'not complete after the manager').toBe(STATUS.pendingAuditor);
    expect((await a.approvals.decide(c.id, 'approve')).status).toBe(STATUS.approved);
  });

  test('TC-E2E-005 E2E-05 1,20,000 INR claim runs the full chain in order @catalogue @e2e', async ({ as }) => {
    await describeTest(ref('TC-E2E-005'));
    const [e, m, a, h] = [await as('employee'), await as('manager'), await as('auditor'), await as('head')];
    const c = await submitTravel(e, 'E2E-005', inr(120000));
    expect((await h.approvals.decideRaw(c.id, 'approve')).ok, 'the head cannot jump the queue').toBe(false);
    expect((await m.approvals.decide(c.id, 'approve')).status).toBe(STATUS.pendingAuditor);
    expect((await a.approvals.decide(c.id, 'approve')).status).toBe(STATUS.pendingHead);
    const done = await h.approvals.decide(c.id, 'approve');
    expect(done.status).toBe(STATUS.approved);
    expect(approvedLevels(done)).toEqual([1, 2, 3]);
  });

  test('TC-E2E-006 E2E-06 Send back, edit and resubmit restarts the chain; earlier steps are SUPERSEDED @catalogue @e2e', async ({ as }) => {
    await describeTest(ref('TC-E2E-006'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'E2E-006', inr(8000));
    const sent = await m.approvals.decide(c.id, 'send-back', 'Please fix the invoice');
    await e.claims.editLineAmount(c.id, sent.lines[0].id, inr(7500));
    const re = await e.claims.resubmit(c.id);
    expect(re.round).toBeGreaterThan(sent.round);
    expect(re.current_step?.level_no, 'starts at the manager').toBe(1);
    expect(re.steps.filter((s) => s.round === sent.round).map((s) => s.status), 'earlier steps are SUPERSEDED').toEqual(['SUPERSEDED']);
  });

  test('TC-E2E-007 E2E-07 Manager on leave delegates and the delegate approves @catalogue @e2e', async ({ as, env }) => {
    await describeTest(ref('TC-E2E-007'));
    const [e, m, d] = [await as('employee'), await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const del = await m.delegations.create((await d.me()).id, 1);
    try {
      const c = await submitTravel(e, 'E2E-007', inr(8000));
      const done = await d.approvals.decide(c.id, 'approve', 'Covering for the manager');
      expect(done.status).toBe(STATUS.approved);
      const step = done.steps.find((s) => s.status === 'APPROVED')!;
      expect([step.acted_by_name, step.on_behalf_of_name]).toEqual([env.personas.delegate!.name, env.personas.manager!.name]);
    } finally {
      await m.delegations.remove(del.id);
    }
  });

  test('TC-E2E-008 E2E-08 Same receipt submitted twice is flagged and skipped in bulk approve @catalogue @e2e @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-E2E-008'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const { duplicate, clean } = await duplicatePairAtAuditor(e, m);
    const app = await ui('auditor');
    await app.review.open('auditor', duplicate.id);
    await expect(app.review.lineItems().getByText(/duplicate/i).first(), 'the duplicate flag is visible').toBeVisible();
    const res = await a.review.bulkApproveRaw([duplicate, clean].map((c) => ({ claim_id: c.id, expected_version: c.version })));
    const by = Object.fromEntries(res.body.results.map((r) => [r.claim_id, r]));
    expect(by[duplicate.id].result).toBe('SKIPPED');
    expect(by[duplicate.id].reason).toBeTruthy();
  });

  test('TC-E2E-009 E2E-09 Batch, verify, export and mark paid: the CSV trailer matches @catalogue @e2e', async ({ as }) => {
    await describeTest(ref('TC-E2E-009'));
    const [h, a] = [await as('head'), await as('auditor')];
    const picked = (await h.payouts.eligible()).slice(0, 3);
    const b = await h.payouts.createBatch(picked.map((c) => c.claim_id));
    await a.payouts.verify(b.id);
    await h.payouts.export(b.id);
    const csv = parseBankFile(await h.payouts.file(b.id));
    expect(csv.trailerTotalPaise).toBe(b.total_paise);
    await h.payouts.markPaid(b.id);
    for (const c of picked) expect((await h.claims.get(c.claim_id)).status).toBe(STATUS.paid);
  });

  test('TC-E2E-010 E2E-10 Employee cannot open another employee\'s claim or receipt @catalogue @e2e @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-E2E-010'));
    const [owner, other] = [await as('employee'), await as('employee2')];
    const c = await submitTravel(owner, 'E2E-010', inr(8000));
    expect((await other.claims.getRaw(c.id)).status).toBe(404);
    expect((await other.claims.receiptFileRaw(c.lines[0].receipt!.id)).status).toBe(404);
    const app = await ui('employee2');
    await app.capture.openClaim(c.id);
    await expect(app.page.getByText(/not found|not yours to see/i).first()).toBeVisible();
  });
});
