import { STATUS } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { duplicatePairAtAuditor } from '../../src/data/scenarios';

test.describe('Review queue and bulk approve', () => {
  test('RQ-01 bulk approve skips a duplicate with a reason and approves the clean claim @regression @approvals @e2e', async ({ as }) => {
    await describeTest({ epic: 'Auditor queue', feature: 'Bulk approve', severity: 'critical', ref: 'E2E08 / C10' });
    const [employee, manager, auditor] = [await as('employee'), await as('manager'), await as('auditor')];
    const { duplicate, clean } = await duplicatePairAtAuditor(employee, manager);

    const res = await auditor.review.bulkApproveRaw([
      { claim_id: duplicate.id, expected_version: duplicate.version },
      { claim_id: clean.id, expected_version: clean.version },
    ]);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.results.map((r) => [r.claim_id, r]));
    expect(byId[duplicate.id].result, 'duplicate is skipped').toBe('SKIPPED');
    expect(byId[duplicate.id].reason, 'the skip has a reason').toBeTruthy();
    expect(byId[clean.id].result).toBe('APPROVED');
    expect(res.body).toMatchObject({ approved: 1, skipped: 1, failed: 0 });
    expect((await employee.claims.get(duplicate.id)).status, 'still waiting for a person').toBe(STATUS.pendingAuditor);
  });

  test('RQ-02 a stale version in a bulk call is not approved @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Auditor queue', feature: 'Bulk approve', severity: 'normal', ref: 'docs/02 optimistic locking' });
    const [employee, manager, auditor] = [await as('employee'), await as('manager'), await as('auditor')];
    const { clean } = await duplicatePairAtAuditor(employee, manager);
    const res = await auditor.review.bulkApproveRaw([{ claim_id: clean.id, expected_version: clean.version + 9 }]);
    expect(res.status).toBe(200);
    expect(res.body.results[0].result, 'a stale version is never approved').not.toBe('APPROVED');
    expect(res.body.approved).toBe(0);
    expect((await employee.claims.get(clean.id)).status).toBe(STATUS.pendingAuditor);
  });

  test('RQ-03 the queue lists claims waiting at the auditor and supports filters @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Auditor queue', feature: 'Queue', severity: 'normal', ref: 'ARD 9 data tables' });
    const [employee, manager, auditor] = [await as('employee'), await as('manager'), await as('auditor')];
    const { duplicate, clean } = await duplicatePairAtAuditor(employee, manager);

    const all = await auditor.review.queueRaw({ q: clean.claim_no });
    expect(all.status).toBe(200);
    expect(all.body.items.map((c) => c.id)).toContain(clean.id);

    const flagged = await auditor.review.queueRaw({ flag: 'DUPLICATE_LINE', q: duplicate.claim_no });
    expect(flagged.body.items.map((c) => c.id)).toContain(duplicate.id);
    const flaggedClean = await auditor.review.queueRaw({ flag: 'DUPLICATE_LINE', q: clean.claim_no });
    expect(flaggedClean.body.items.map((c) => c.id), 'a clean claim is not in the duplicate filter').not.toContain(clean.id);
  });

  test('RQ-04 sample audits can be listed and resolved only by finance @regression @approvals', async ({ as }) => {
    await describeTest({ epic: 'Auditor queue', feature: 'Sample audit', severity: 'normal', ref: 'ARD 5 sample audit' });
    const [employee, auditor] = [await as('employee'), await as('auditor')];
    const pending = await auditor.review.sampleAudits('PENDING');
    expect(Array.isArray(pending)).toBe(true);
    if (pending.length) {
      const denied = await employee.review.resolveSampleRaw(pending[0].id, 'PASSED');
      expect(denied.status).toBe(403);
    }
  });
});

test.describe('Dashboard and policy', () => {
  for (const [role, scope] of [['employee', 'own'], ['manager', 'team'], ['auditor', 'company'], ['head', 'company']] as const) {
    test(`DB-01 ${role} dashboard is scoped to "${scope}" @regression @ops`, async ({ as }) => {
      await describeTest({ epic: 'Reporting', feature: 'Dashboard scope', severity: 'normal', ref: 'ARD 9 dashboard' });
      const res = await (await as(role)).ops.dashboardRaw();
      expect(res.status).toBe(200);
      expect(res.body.scope).toBe(scope);
    });
  }

  test('DB-02 the active policy is served with the seeded limits (data, not code) @regression @ops @policy', async ({ as }) => {
    await describeTest({ epic: 'Reporting', feature: 'Active policy', severity: 'normal', ref: 'ARD 5' });
    const res = await (await as('employee')).ops.policyRaw();
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toMatch(/MEALS_DAILY_CAP/);
  });
});
