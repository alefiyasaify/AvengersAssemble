import { STATUS } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { parseBankFile } from '../../src/data/bank-file';
import { inr } from '../../src/data/money';
import { approvedClaim } from '../../src/data/scenarios';

/**
 * Payout tests use claims that are already payable in the seeded data: their owners have a bank
 * account on file (the API cannot create one). Each test takes its own claims from the eligible
 * list and works with them only. Claims that sit in a draft batch are not eligible, so tests
 * do not collide.
 */
test.describe('Payout batches (maker-checker)', () => {
  test('PO-01 create, verify by another person, export and mark paid: the CSV trailer matches @regression @payout @e2e', async ({ as }) => {
    await describeTest({ epic: 'Payouts', feature: 'Batch lifecycle', severity: 'blocker', ref: 'E2E09 / ARD 10' });
    const [head, auditor] = [await as('head'), await as('auditor')];
    const picked = (await head.payouts.eligible()).slice(0, 2);
    expect(picked.length, 'seed should leave payable claims').toBe(2);
    const total = picked.reduce((sum, c) => sum + c.payable_paise, 0);

    const batch = await head.payouts.createBatch(picked.map((c) => c.claim_id));
    expect(batch.status).toBe('DRAFT');
    expect(batch.total_paise).toBe(total);

    const verified = await auditor.payouts.verify(batch.id);
    expect(verified.status).toBe('VERIFIED');
    expect(verified.verified_by_id, 'the checker is not the maker').not.toBe(batch.created_by_id);

    const exported = await head.payouts.export(batch.id);
    expect(exported.status).toBe('EXPORTED');
    expect(exported.file_sha256).toMatch(/^[0-9a-f]{64}$/);

    const csv = parseBankFile(await head.payouts.file(batch.id));
    expect(csv.details, 'one detail row per claim').toHaveLength(2);
    expect(csv.trailerCount).toBe(2);
    expect(csv.trailerTotalPaise, 'trailer total equals the batch total').toBe(total);
    expect(csv.detailTotalPaise, 'detail rows add up to the trailer').toBe(csv.trailerTotalPaise);

    const paid = await head.payouts.markPaid(batch.id);
    expect(paid.status).toBe('PAID');
    for (const c of picked) expect((await head.claims.get(c.claim_id)).status).toBe(STATUS.paid);
  });

  test('PO-02 the person who created a batch cannot verify it @regression @payout @security', async ({ as }) => {
    await describeTest({ epic: 'Payouts', feature: 'Maker-checker', severity: 'blocker', ref: 'ARD 3 rule 5 / C9' });
    const head = await as('head');
    const [claim] = (await head.payouts.eligible()).slice(0, 1);
    const batch = await head.payouts.createBatch([claim.claim_id]);
    try {
      const self = await head.payouts.verifyRaw(batch.id);
      expect([403, 409], `maker verifying own batch (got ${self.status})`).toContain(self.status);
      expect((await head.payouts.getRaw(batch.id)).body.status).toBe('DRAFT');
    } finally {
      await head.payouts.cancelRaw(batch.id);
    }
  });

  test('PO-03 export is refused until the batch is verified, and a paid batch cannot be paid twice @regression @payout', async ({ as }) => {
    await describeTest({ epic: 'Payouts', feature: 'Batch states', severity: 'critical', ref: 'ARD 10' });
    const [head, auditor] = [await as('head'), await as('auditor')];
    const [claim] = (await head.payouts.eligible()).slice(0, 1);
    const batch = await head.payouts.createBatch([claim.claim_id]);

    expect((await head.payouts.exportRaw(batch.id)).status, 'export before verify').toBe(409);
    expect((await head.payouts.markPaidRaw(batch.id)).status, 'pay before export').toBe(409);

    await auditor.payouts.verify(batch.id);
    await head.payouts.export(batch.id);
    await head.payouts.markPaid(batch.id);
    expect((await head.payouts.markPaidRaw(batch.id)).status, 'second payment').toBe(409);
  });

  test('PO-04 a cancelled batch returns its claims to the eligible list @regression @payout', async ({ as }) => {
    await describeTest({ epic: 'Payouts', feature: 'Batch states', severity: 'normal', ref: 'ARD 10 / PO' });
    const head = await as('head');
    const [claim] = (await head.payouts.eligible()).slice(0, 1);
    const batch = await head.payouts.createBatch([claim.claim_id]);
    expect(await head.payouts.isEligible(claim.claim_id), 'claims in a batch are not offered again').toBe(false);

    expect((await head.payouts.cancelRaw(batch.id)).status).toBe(200);
    expect(await head.payouts.isEligible(claim.claim_id)).toBe(true);
  });

  test('PO-05 only the finance head can create, export or pay; employees and managers see nothing @regression @payout @security', async ({ as }) => {
    await describeTest({ epic: 'Payouts', feature: 'Access', severity: 'critical', ref: 'ARD 3 / C9' });
    const [head, auditor, employee, manager] = [await as('head'), await as('auditor'), await as('employee'), await as('manager')];
    const [claim] = (await head.payouts.eligible()).slice(0, 1);

    expect((await auditor.payouts.createBatchRaw([claim.claim_id])).status, 'auditor creating').toBe(403);
    for (const who of [employee, manager]) {
      expect((await who.payouts.eligibleRaw()).status).toBe(403);
      expect((await who.payouts.createBatchRaw([claim.claim_id])).status).toBe(403);
    }
  });

  test('PO-06 a claim that is not approved cannot be put into a batch @regression @payout', async ({ as }) => {
    await describeTest({ epic: 'Payouts', feature: 'Eligibility', severity: 'critical', ref: 'ARD 10' });
    const [employee, head] = [await as('employee'), await as('head')];
    const pending = await employee.claims.createAndSubmit('QA PO-06', [
      { category: 'TRAVEL', amountPaise: inr(9000), date: '2025-02-04', vendor: `PO06 ${Date.now()}`, description: 'x', receipt: undefined },
    ]);
    // Without a receipt this line is rejected by policy; either way the claim is not payable.
    const res = await head.payouts.createBatchRaw([pending.id]);
    expect([400, 404, 409, 422]).toContain(res.status);
  });

  test('PO-07 a newly approved claim becomes payable unless held by a sample audit @regression @payout', async ({ as }) => {
    await describeTest({ epic: 'Payouts', feature: 'Eligibility', severity: 'normal', ref: 'ARD 5 sample audit' });
    const [employee, manager, head] = [await as('employee'), await as('manager'), await as('head')];
    const claim = await approvedClaim(employee, manager, 'PO-07');
    expect(claim.status).toBe(STATUS.approved);
    expect(await head.payouts.isEligible(claim.id)).toBe(true);
  });
});
