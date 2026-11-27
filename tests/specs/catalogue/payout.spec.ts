import { createHash } from 'node:crypto';
import { STATUS, getEnv } from '../../config/environments';
import { Session } from '../../src/api/session';
import { Batch } from '../../src/api/types';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { parseBankFile } from '../../src/data/bank-file';
import { claimTitle, line } from '../../src/data/factories';
import { isolatedDate } from '../../src/data/dates';
import { inr } from '../../src/data/money';
import { payableClaim, seededPair } from '../../src/data/seeded';

const ref = (id: string) => ({ epic: 'Catalogue', feature: 'Payout', severity: 'critical' as const, ref: id });
type FileBatch = Batch & { file_name: string | null; paid_at: string | null };

test.describe('Payout batch and bank file', () => {
  test('TC-PAY-001 Eligible list shows only approved, unbatched, released claims @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-001'));
    const h = await as('head');
    const items = (await h.payouts.eligible()).slice(0, 8);
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      const c = await h.claims.get(i.claim_id);
      expect(c.status, i.claim_no).toBe(STATUS.approved);
      expect(c.payout_batch_id).toBeNull();
      expect(c.payable_paise).toBeGreaterThan(0);
      expect(c.sample_audit_pending, 'no pending sample audit').toBe(false);
    }
  });

  test('TC-PAY-002 Create a payout batch from selected claims @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-002'));
    const h = await as('head');
    const picked = (await h.payouts.eligible()).slice(0, 5);
    const batch = await h.payouts.createBatch(picked.map((c) => c.claim_id));
    try {
      expect(batch.status).toBe('DRAFT');
      expect(batch.batch_no).toBeTruthy();
      expect(batch.claim_count).toBe(5);
      expect(batch.total_paise).toBe(picked.reduce((s, c) => s + c.payable_paise, 0));
    } finally {
      await h.payouts.cancelRaw(batch.id);
    }
  });

  test('TC-PAY-003 A claim cannot be in two batches @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-003'));
    const h = await as('head');
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const first = await h.payouts.createBatch([c.claim_id]);
    try {
      const second = await h.payouts.createBatchRaw([c.claim_id]);
      expect(second.ok, `second batch refused (got ${second.status})`).toBe(false);
      expect((await h.payouts.getRaw(first.id)).body.claim_count).toBe(1);
    } finally {
      await h.payouts.cancelRaw(first.id);
    }
  });

  test('TC-PAY-004 Concurrent batch creation with the same claim: exactly one succeeds @catalogue @payout @concurrency', async ({ as }) => {
    await describeTest(ref('TC-PAY-004'));
    const h = await as('head');
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const [x, y] = await Promise.all([h.payouts.createBatchRaw([c.claim_id]), h.payouts.createBatchRaw([c.claim_id])]);
    const won = [x, y].filter((r) => r.ok);
    try {
      expect([x.status, y.status].sort()).toEqual([201, 409]);
    } finally {
      for (const r of won) await h.payouts.cancelRaw(r.body.id);
    }
  });

  test('TC-PAY-005 Auditor verifies a batch created by the head @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-005'));
    const [h, a] = [await as('head'), await as('auditor')];
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    try {
      const v = await a.payouts.verify(b.id);
      expect(v.status).toBe('VERIFIED');
      expect(v.verified_by_id).toBe((await a.me()).id);
    } finally {
      await h.payouts.cancelRaw(b.id);
    }
  });

  test('TC-PAY-006 Creator cannot verify their own batch @catalogue @payout @security', async ({ as }) => {
    await describeTest(ref('TC-PAY-006'));
    const h = await as('head');
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    try {
      expect([403, 409]).toContain((await h.payouts.verifyRaw(b.id)).status);
      expect((await h.payouts.getRaw(b.id)).body.status).toBe('DRAFT');
    } finally {
      await h.payouts.cancelRaw(b.id);
    }
  });

  test('TC-PAY-007 Export is blocked unless the batch is VERIFIED @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-007'));
    const h = await as('head');
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    try {
      expect((await h.payouts.exportRaw(b.id)).status).toBe(409);
      expect((await h.http.get(`/api/v1/payouts/batches/${b.id}/file`)).ok, 'no file generated').toBe(false);
    } finally {
      await h.payouts.cancelRaw(b.id);
    }
  });

  test('TC-PAY-008 Export generates the CSV and freezes the batch @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-008'));
    const [h, a] = [await as('head'), await as('auditor')];
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    await a.payouts.verify(b.id);
    const ex = (await h.payouts.export(b.id)) as FileBatch;
    expect(ex.status).toBe('EXPORTED');
    expect(ex.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ex.file_name, 'EXPFLOW_<batch_no>_<date>.csv').toMatch(new RegExp(`^EXPFLOW_${b.batch_no}_\\d{8}\\.csv$`));
  });

  /** One exported batch of four tiny claims, shared by the bank-file cases below (built once per worker). */
  let bankFileMemo: Promise<{ csv: string; again: string; ex: FileBatch }> | undefined;
  const bankFile = (h: Session, a: Session, env: ReturnType<typeof getEnv>) =>
    (bankFileMemo ??= (async () => {
      const pair = await seededPair(h, env);
      const claims = [];
      for (const paise of [10, 20, 128050, 1]) claims.push(await payableClaim(pair, paise)); // 0.10, 0.20, 1,280.50, 0.01 INR
      const b = await h.payouts.createBatch(claims.map((c) => c.id));
      await a.payouts.verify(b.id);
      const ex = (await h.payouts.export(b.id)) as FileBatch;
      const csv = (await h.http.get<string>(`/api/v1/payouts/batches/${b.id}/file`)).text;
      const again = (await h.http.get<string>(`/api/v1/payouts/batches/${b.id}/file`)).text;
      return { csv, again, ex };
    })());

  test('TC-PAY-009 CSV structure: header, detail rows and trailer @catalogue @payout', async ({ as, env }) => {
    await describeTest(ref('TC-PAY-009'));
    const { csv } = await bankFile(await as('head'), await as('auditor'), env);
    const rows = csv.trim().split('\n');
    expect(rows.filter((r) => r.startsWith('H,'))).toHaveLength(1);
    expect(rows.filter((r) => r.startsWith('D,'))).toHaveLength(4);
    expect(rows.filter((r) => r.startsWith('T,'))).toHaveLength(1);
    for (const r of rows) expect(r.split(',').length, `12 columns: ${r.slice(0, 40)}`).toBe(12);
    expect(csv, 'LF line endings').not.toContain('\r');
  });

  test('TC-PAY-010 Trailer total and count match the detail rows @catalogue @payout', async ({ as, env }) => {
    await describeTest(ref('TC-PAY-010'));
    const { csv } = await bankFile(await as('head'), await as('auditor'), env);
    const parsed = parseBankFile(csv);
    expect(parsed.trailerTotalPaise).toBe(10 + 20 + 128050 + 1);
    expect(parsed.trailerCount).toBe(4);
    expect(parsed.detailTotalPaise).toBe(parsed.trailerTotalPaise);
  });

  test('TC-PAY-011 Amounts are formatted from integer paise without float error @catalogue @payout', async ({ as, env }) => {
    await describeTest(ref('TC-PAY-011'));
    const { csv } = await bankFile(await as('head'), await as('auditor'), env);
    expect(parseBankFile(csv).details.map((d) => d[5]).sort()).toEqual(['0.01', '0.10', '0.20', '1280.50']);
  });

  test('TC-PAY-013 Narration is sanitised: letters, digits and spaces, at most 30 characters @catalogue @payout', async ({ as, env }) => {
    await describeTest(ref('TC-PAY-013'));
    const { csv } = await bankFile(await as('head'), await as('auditor'), env);
    for (const d of parseBankFile(csv).details) expect(d[9], 'narration').toMatch(/^[A-Za-z0-9 ]{0,30}$/);
    test.info().annotations.push({ type: 'note', description: 'docs/14 records that hyphens are kept on purpose so claim numbers like EF-2026-004312 survive.' });
  });

  test('TC-PAY-015 Export is deterministic and the file hash matches file_sha256 @catalogue @payout', async ({ as, env }) => {
    await describeTest(ref('TC-PAY-015'));
    const { csv, again, ex } = await bankFile(await as('head'), await as('auditor'), env);
    expect(again).toBe(csv);
    expect(createHash('sha256').update(csv).digest('hex')).toBe(ex.file_sha256);
  });

  test('TC-PAY-012 Payment mode switches at 2,00,000 INR @catalogue @payout', async ({ as, env }) => {
    await describeTest(ref('TC-PAY-012'));
    const [h, a, m] = [await as('head'), await as('auditor'), await as('manager')];
    const pair = await seededPair(h, env);
    void m;
    const make = async (paise: number) => {
      const c = await pair.employee.claims.createAndSubmit(claimTitle('PAY-012'), [line.travel(paise, { date: isolatedDate('saturday') })]);
      await pair.manager.approvals.decide(c.id, 'approve');
      await a.approvals.decide(c.id, 'approve');
      return (await h.approvals.decide(c.id, 'approve')).id;
    };
    const [atCap, above] = [await make(inr(200000)), await make(20000001)];
    const b = await h.payouts.createBatch([atCap, above]);
    await a.payouts.verify(b.id);
    await h.payouts.export(b.id);
    const parsed = parseBankFile(await h.payouts.file(b.id));
    const mode = Object.fromEntries(parsed.details.map((d) => [d[5], d[7]]));
    expect(mode['200000.00']).toBe('IMPS');
    expect(mode['200000.01']).toBe('NEFT');
  });

  test('TC-PAY-017 Exported batch is frozen @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-017'));
    const [h, a] = [await as('head'), await as('auditor')];
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    await a.payouts.verify(b.id);
    const ex = await h.payouts.export(b.id);
    for (const attempt of [h.payouts.exportRaw(b.id), a.payouts.verifyRaw(b.id), h.payouts.cancelRaw(b.id)]) expect((await attempt).status).toBe(409);
    const after = await h.payouts.getRaw(b.id);
    expect(after.body.file_sha256).toBe(ex.file_sha256);
    expect(after.body.claim_count).toBe(1);
  });

  test('TC-PAY-018 Mark paid moves every claim in the batch to PAID @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-018'));
    const [h, a] = [await as('head'), await as('auditor')];
    const picked = (await h.payouts.eligible()).slice(0, 2);
    const b = await h.payouts.createBatch(picked.map((c) => c.claim_id));
    await a.payouts.verify(b.id);
    await h.payouts.export(b.id);
    const paid = (await h.payouts.markPaid(b.id)) as FileBatch;
    expect(paid.paid_at, 'batch paid_at').toBeTruthy();
    for (const c of picked) {
      const back = await h.claims.get(c.claim_id);
      expect(back.status).toBe(STATUS.paid);
      expect((back as unknown as { paid_at: string }).paid_at).toBeTruthy();
      expect((await h.claims.timeline(c.claim_id)).some((t) => /paid/i.test(t.action)), 'an audit event per claim').toBe(true);
    }
  });

  test('TC-PAY-020 Mark paid before export is blocked @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-020'));
    const [h, a] = [await as('head'), await as('auditor')];
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    try {
      expect((await h.payouts.markPaidRaw(b.id)).status, 'draft').toBe(409);
      await a.payouts.verify(b.id);
      expect((await h.payouts.markPaidRaw(b.id)).status, 'verified but not exported').toBe(409);
      expect((await h.claims.get(c.claim_id)).status).toBe(STATUS.approved);
    } finally {
      await h.payouts.cancelRaw(b.id);
    }
  });

  test('TC-PAY-021 Cancel a DRAFT or VERIFIED batch releases its claims @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-021'));
    const [h, a] = [await as('head'), await as('auditor')];
    const [c1, c2] = (await h.payouts.eligible()).slice(0, 2);
    const draft = await h.payouts.createBatch([c1.claim_id]);
    const verified = await h.payouts.createBatch([c2.claim_id]);
    await a.payouts.verify(verified.id);
    for (const b of [draft, verified]) {
      const res = await h.payouts.cancelRaw(b.id);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
    }
    expect(await h.payouts.isEligible(c1.claim_id)).toBe(true);
    expect(await h.payouts.isEligible(c2.claim_id)).toBe(true);
  });

  test('TC-PAY-022 EXPORTED batch cannot be cancelled @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-022'));
    const [h, a] = [await as('head'), await as('auditor')];
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    await a.payouts.verify(b.id);
    await h.payouts.export(b.id);
    expect((await h.payouts.cancelRaw(b.id)).status).toBe(409);
  });

  test('TC-PAY-023 Paid claim cannot be batched again @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-023'));
    const h = await as('head');
    const paid = (await h.claims.list({ status: 'PAID', scope: 'all', limit: 1 })).body.items[0];
    const res = await h.payouts.createBatchRaw([paid.id]);
    expect(res.ok, `refused (got ${res.status})`).toBe(false);
  });

  test('TC-PAY-024 Only the finance head can create, export and mark paid @catalogue @payout @security', async ({ as }) => {
    await describeTest(ref('TC-PAY-024'));
    const [h, a, e, m] = [await as('head'), await as('auditor'), await as('employee'), await as('manager')];
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    try {
      for (const who of [a, e, m]) {
        expect((await who.payouts.createBatchRaw([c.claim_id])).status).toBe(403);
        expect((await who.payouts.exportRaw(b.id)).status).toBe(403);
        expect((await who.payouts.markPaidRaw(b.id)).status).toBe(403);
      }
    } finally {
      await h.payouts.cancelRaw(b.id);
    }
  });

  test('TC-PAY-025 Claims with zero payable total are not eligible @catalogue @payout', async ({ as }) => {
    await describeTest(ref('TC-PAY-025'));
    const items = await (await as('head')).payouts.eligible();
    expect(items.filter((i) => i.payable_paise <= 0)).toHaveLength(0);
  });

  test('TC-PAY-026 Payout amount equals payable total excluding rejected lines @catalogue @payout', async ({ as, env }) => {
    await describeTest(ref('TC-PAY-026'));
    const [h, a] = [await as('head'), await as('auditor')];
    const pair = await seededPair(h, env);
    const c = await payableClaim(pair, inr(900), [line.meals(inr(1800))]);
    expect(c.payable_paise).toBe(inr(900));
    const b = await h.payouts.createBatch([c.id]);
    try {
      expect(b.items[0].amount_paise, 'item excludes the rejected 1,800').toBe(inr(900));
      expect(b.total_paise).toBe(inr(900));
    } finally {
      await h.payouts.cancelRaw(b.id);
    }
    void a;
  });

  test('TC-PAY-027 Bank account numbers are masked (last four digits only) @catalogue @payout @security', async ({ as }) => {
    await describeTest(ref('TC-PAY-027'));
    const h = await as('head');
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    try {
      const detail = await h.payouts.getRaw(b.id);
      expect(JSON.stringify(detail.body)).not.toMatch(/\d{9,}/);
      expect((detail.body.items[0] as unknown as { account_last4: string }).account_last4).toMatch(/^\d{4}$/);
    } finally {
      await h.payouts.cancelRaw(b.id);
    }
  });
});
