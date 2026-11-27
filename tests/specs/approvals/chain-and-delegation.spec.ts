import { Role, STATUS } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { inr } from '../../src/data/money';
import { approvedLevels, submitTravel } from '../../src/data/scenarios';

interface ThresholdCase {
  id: string;
  title: string;
  amountPaise: number;
  /** Who approves next, and the claim status expected right after. */
  path: Array<[Role, string]>;
}

/** The chain is chosen from the payable total: above (not at) 25,000 and 1,00,000 (ADR-001). */
const THRESHOLDS: ThresholdCase[] = [
  { id: 'AP-01a', title: '8,000 INR stops at the manager', amountPaise: inr(8000), path: [['manager', STATUS.approved]] },
  { id: 'AP-01b', title: 'exactly 25,000 INR stays manager-only', amountPaise: inr(25000), path: [['manager', STATUS.approved]] },
  {
    id: 'AP-01c', title: '25,000.01 INR adds the auditor', amountPaise: 2500001,
    path: [['manager', STATUS.pendingAuditor], ['auditor', STATUS.approved]],
  },
  {
    id: 'AP-01d', title: 'exactly 1,00,000 INR stops at the auditor', amountPaise: inr(100000),
    path: [['manager', STATUS.pendingAuditor], ['auditor', STATUS.approved]],
  },
  {
    id: 'AP-01e', title: '1,00,000.01 INR adds the finance head', amountPaise: 10000001,
    path: [['manager', STATUS.pendingAuditor], ['auditor', STATUS.pendingHead], ['head', STATUS.approved]],
  },
];

test.describe('Approval chain thresholds', () => {
  for (const c of THRESHOLDS) {
    test(`${c.id} ${c.title} @regression @approvals`, async ({ as }) => {
      await describeTest({ epic: 'Approvals', feature: 'Threshold routing', story: c.title, severity: 'blocker', ref: 'ARD 6 / ADR-001' });
      const employee = await as('employee');
      const claim = await submitTravel(employee, c.id, c.amountPaise);
      expect(claim.status).toBe(STATUS.pendingManager);
      expect(claim.required_levels, 'levels are frozen on the claim at submit').toEqual(c.path.map((_, i) => i + 1));

      let current = claim;
      for (const [role, expectedStatus] of c.path) {
        current = await (await as(role)).approvals.decide(claim.id, 'approve', `${role} approves`);
        expect(current.status, `after ${role}`).toBe(expectedStatus);
      }
      expect(approvedLevels(current)).toEqual(c.path.map((_, i) => i + 1));
    });
  }
});

test.describe('Approval actions', () => {
  test('AP-06 send-back, edit and resubmit restarts the chain at level 1 @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Send back', severity: 'critical', ref: 'ARD 11 / E2E06' });
    const [employee, manager] = [await as('employee'), await as('manager')];
    const claim = await submitTravel(employee, 'AP-06', inr(8000));

    const sentBack = await manager.approvals.decide(claim.id, 'send-back', 'Please correct the amount');
    expect(sentBack.status).toBe(STATUS.sentBack);
    const firstRound = sentBack.round;

    await employee.claims.editLineAmount(claim.id, sentBack.lines[0].id, inr(7500));
    const resubmitted = await employee.claims.resubmit(claim.id);

    expect(resubmitted.status).toBe(STATUS.pendingManager);
    expect(resubmitted.round, 'a new round starts').toBeGreaterThan(firstRound);
    expect(resubmitted.current_step?.level_no).toBe(1);
    expect(resubmitted.steps.filter((s) => s.round === resubmitted.round && s.status === 'PENDING')).toHaveLength(1);
  });

  test('AP-06b a send-back at level 2 restarts the chain: the old approval is history and level 1 must approve again @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Send back', severity: 'critical', ref: 'ARD 6 / E2E06' });
    const [employee, manager, auditor] = [await as('employee'), await as('manager'), await as('auditor')];
    const claim = await submitTravel(employee, 'AP-06b', inr(30000));
    await manager.approvals.decide(claim.id, 'approve');
    const sentBack = await auditor.approvals.decide(claim.id, 'send-back', 'Receipt is unreadable');
    expect(sentBack.status).toBe(STATUS.sentBack);

    await employee.claims.editLineAmount(claim.id, sentBack.lines[0].id, inr(29000));
    const resubmitted = await employee.claims.resubmit(claim.id);

    expect(resubmitted.status, 'the chain restarts at level 1').toBe(STATUS.pendingManager);
    expect(resubmitted.current_step?.level_no).toBe(1);
    expect(approvedLevels(resubmitted), 'only approvals of the current round count').toEqual([]);
    // The round-1 approval is kept as history (the backend supersedes only steps that were still open).
    expect(resubmitted.steps.some((s) => s.round === 1 && s.level_no === 1 && s.status === 'APPROVED')).toBeTruthy();
  });

  test('AP-04 reject needs a comment and stores it @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Reject', severity: 'critical', ref: 'AP-04' });
    const [employee, manager] = [await as('employee'), await as('manager')];
    const claim = await submitTravel(employee, 'AP-04', inr(8000));

    const noComment = await manager.approvals.decideRaw(claim.id, 'reject');
    expect(noComment.status, 'a reject without a comment is refused').toBe(400);

    const rejected = await manager.approvals.decide(claim.id, 'reject', 'Not a business expense');
    expect(rejected.status).toBe(STATUS.rejected);
    expect(rejected.steps.find((s) => s.status === 'REJECTED')?.comment).toBe('Not a business expense');
  });

  test('AP-05 send back also needs a comment @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Send back', severity: 'normal', ref: 'AP-05' });
    const [employee, manager] = [await as('employee'), await as('manager')];
    const claim = await submitTravel(employee, 'AP-05', inr(8000));
    expect((await manager.approvals.decideRaw(claim.id, 'send-back')).status).toBe(400);
    expect((await employee.claims.get(claim.id)).status, 'nothing changed').toBe(STATUS.pendingManager);
  });

  test('AP-09 a manager cannot approve their own claim; it goes to their own manager @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Separation of duties', severity: 'blocker', ref: 'ARD 3 rule 2 / C3' });
    const manager = await as('manager');
    const myId = (await manager.me()).id;
    const claim = await submitTravel(manager, 'AP-09', inr(8000));

    expect(claim.current_step?.assigned_to, 'step is not assigned to the claimant').not.toBe(myId);
    const attempt = await manager.approvals.decideRaw(claim.id, 'approve');
    expect([403, 404, 409], `own-claim approval refused (got ${attempt.status})`).toContain(attempt.status);
    expect((await manager.claims.get(claim.id)).status).toBe(STATUS.pendingManager);
  });

  test('AP-11 a manager outside the reporting line cannot decide the claim @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Visibility and authority', severity: 'blocker', ref: 'ARD 3 / C5' });
    const [employee, stranger] = [await as('employee'), await as('manager2')];
    const claim = await submitTravel(employee, 'AP-11', inr(8000));
    const attempt = await stranger.approvals.decideRaw(claim.id, 'approve').catch((e: Error) => e);
    // The claim is not visible to them at all, so even reading it to find the step fails.
    expect(attempt instanceof Error || [403, 404].includes((attempt as { status: number }).status)).toBeTruthy();
    expect((await employee.claims.get(claim.id)).status).toBe(STATUS.pendingManager);
  });

  test('AP-10 two simultaneous approvals: one wins, one gets 409; replay is refused @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Concurrency', severity: 'blocker', ref: 'ARD 7 / C12' });
    const [employee, manager] = [await as('employee'), await as('manager')];
    const claim = await submitTravel(employee, 'AP-10', inr(8000));
    const step = claim.current_step!;
    const body = { comment: 'race', expected_version: claim.version };

    const [a, b] = await Promise.all([manager.approvals.actRaw(step.id, 'approve', body), manager.approvals.actRaw(step.id, 'approve', body)]);
    expect([a, b].filter((r) => r.ok), 'exactly one approval succeeds').toHaveLength(1);
    expect([a, b].find((r) => !r.ok)?.status).toBe(409);

    const replay = await manager.approvals.actRaw(step.id, 'approve', body);
    expect(replay.status, 'an approved step cannot be approved again').toBe(409);
  });

  test('AP-12 a stale expected_version is a 409 CLAIM_VERSION_CONFLICT @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Concurrency', severity: 'critical', ref: 'docs/02 optimistic locking' });
    const [employee, manager] = [await as('employee'), await as('manager')];
    const claim = await submitTravel(employee, 'AP-12', inr(8000));
    const res = await manager.approvals.actRaw(claim.current_step!.id, 'approve', { expected_version: claim.version + 5 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'CLAIM_VERSION_CONFLICT' } });
  });

  test('AP-13 one person approves at most one level of a claim @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Separation of duties', severity: 'blocker', ref: 'ARD 3 rule 3' });
    const [employee, manager, head] = [await as('employee'), await as('manager'), await as('head')];
    const claim = await submitTravel(employee, 'AP-13', inr(30000));
    await manager.approvals.decide(claim.id, 'approve');
    // The auditor step is open. The manager already approved level 1, so cannot take level 2.
    const attempt = await manager.approvals.decideRaw(claim.id, 'approve');
    expect([403, 404, 409]).toContain(attempt.status);
    expect((await head.claims.get(claim.id)).status).toBe(STATUS.pendingAuditor);
  });
});

test.describe('Delegation', () => {
  test('AP-07 delegate approves on behalf of a manager and the audit trail shows both names @regression @approvals', async ({ as, env }) => {
    await describeTest({ epic: 'Approvals', feature: 'Delegation', severity: 'critical', ref: 'AP-07 / E2E07 / C4' });
    const [employee, manager, delegate] = [await as('employee'), await as('manager'), await as('delegate')];
    await manager.delegations.clear();
    const delegation = await manager.delegations.create((await delegate.me()).id, 1);

    try {
      const claim = await submitTravel(employee, 'AP-07', inr(8000));
      expect(await delegate.approvals.inboxClaimIds(), 'delegate sees the item in the inbox').toContain(claim.id);

      const done = await delegate.approvals.decide(claim.id, 'approve', 'Approved while manager is on leave');
      expect(done.status).toBe(STATUS.approved);

      const step = done.steps.find((s) => s.status === 'APPROVED')!;
      expect(step.acted_by_name).toBe(env.personas.delegate!.name);
      expect(step.on_behalf_of_name).toBe(env.personas.manager!.name);

      const timeline = await employee.claims.timeline(claim.id);
      const onBehalf = timeline.find((t) => t.on_behalf_of_name === env.personas.manager!.name);
      expect(onBehalf?.actor_name, 'audit shows the delegate and on-behalf-of').toBe(env.personas.delegate!.name);
    } finally {
      await manager.delegations.remove(delegation.id);
    }
  });

  test('AP-08 a delegation is limited to 30 days and cannot point at oneself @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Delegation', severity: 'critical', ref: 'ARD 3 rule 4 / C4' });
    const [manager, delegate] = [await as('manager'), await as('delegate')];
    const now = Date.now();
    const days = (n: number) => new Date(now + n * 86_400_000);

    const tooLong = await manager.delegations.createRaw((await delegate.me()).id, 1, new Date(now - 60_000), days(31));
    expect(tooLong.status, 'more than 30 days is refused').toBe(400);

    const self = await manager.delegations.createRaw((await manager.me()).id, 1, new Date(now - 60_000), days(2));
    expect([400, 403, 409]).toContain(self.status);
  });

  test('AP-14 a revoked delegation stops working @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Approvals', feature: 'Delegation', severity: 'critical', ref: 'AP-08' });
    const [employee, manager, delegate] = [await as('employee'), await as('manager'), await as('delegate')];
    await manager.delegations.clear();
    const delegation = await manager.delegations.create((await delegate.me()).id, 1);
    await manager.delegations.remove(delegation.id);

    const claim = await submitTravel(employee, 'AP-14', inr(8000));
    expect(await delegate.approvals.inboxClaimIds()).not.toContain(claim.id);
    const attempt = await delegate.approvals.actRaw(claim.current_step!.id, 'approve', { expected_version: claim.version });
    expect([403, 404, 409]).toContain(attempt.status);
  });
});
