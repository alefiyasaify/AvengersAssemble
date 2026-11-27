import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { STATUS } from '../../config/environments';
import { itemsOf } from '../../src/api/http-client';
import { Session } from '../../src/api/session';
import { Claim } from '../../src/api/types';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { newReceipt } from '../../src/data/receipts';

const ref = (id: string) => ({ epic: 'Catalogue', feature: id.split('-')[1], severity: 'critical' as const, ref: id });

interface Plant {
  kind: string;
  expected_rule: string | null;
  claim_no: string;
  expected_levels: number[] | null;
  absent_rule: string | null;
}
interface Manifest {
  claims: number;
  claim_statuses: Record<string, number>;
  payout_batches: number;
  plants: Plant[];
}
const MANIFEST = path.resolve(__dirname, '..', '..', '..', 'backend', 'app', 'seeds', 'seed_manifest.json');
const manifest = (): Manifest => JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

/** The seeded claim behind each planted case, fetched once per worker. */
let plantedMemo: Promise<Map<string, Claim>> | undefined;
const planted = (head: Session): Promise<Map<string, Claim>> =>
  (plantedMemo ??= (async () => {
    const out = new Map<string, Claim>();
    const plants = manifest().plants;
    for (let i = 0; i < plants.length; i += 10) {
      await Promise.all(
        plants.slice(i, i + 10).map(async (p) => {
          const found = itemsOf<{ id: string }>((await head.claims.list({ scope: 'all', q: p.claim_no, limit: 5 })).body)[0];
          if (found) out.set(p.claim_no, await head.claims.get(found.id));
        }),
      );
    }
    return out;
  })());

const detected = (c: Claim | undefined, rule: string | null): boolean => !!c && (rule === null || c.lines.some((l) => l.findings.some((f) => f.rule_code === rule)));

test.describe('Synthetic data', () => {
  test('TC-DATA-003 Volumes: 150 employees, 8 departments, 3,000 claims @catalogue @data', async ({ as }) => {
    await describeTest(ref('TC-DATA-003'));
    const h = await as('head');
    const users = [];
    let cursor: string | undefined;
    do {
      const res = await h.http.get('/api/v1/admin/users', { limit: 100, ...(cursor ? { cursor } : {}) });
      users.push(...itemsOf<{ email: string; employee_code: string }>(res.body));
      cursor = (res.body as { next_cursor?: string }).next_cursor ?? undefined;
    } while (cursor);
    expect(users.filter((u) => /^E\d{5}$/.test(u.employee_code)), 'seeded people (employee codes E#####)').toHaveLength(150);
    expect(((await h.http.get('/api/v1/departments')).body as unknown[]).length).toBe(8);
    expect(manifest().claims, 'claims in the seed manifest').toBe(3000);
  });

  test('TC-DATA-004 Hierarchy is acyclic and complete @catalogue @data', async ({ as }) => {
    await describeTest(ref('TC-DATA-004'));
    const h = await as('head');
    const users: Array<{ id: string; email: string; employee_code: string; manager_id: string | null; role: string }> = [];
    let cursor: string | undefined;
    do {
      const res = await h.http.get('/api/v1/admin/users', { limit: 100, ...(cursor ? { cursor } : {}) });
      users.push(...itemsOf<(typeof users)[number]>(res.body));
      cursor = (res.body as { next_cursor?: string }).next_cursor ?? undefined;
    } while (cursor);
    const seeded = users.filter((u) => /^E\d{5}$/.test(u.employee_code));
    const byId = new Map(seeded.map((u) => [u.id, u]));
    const roots = seeded.filter((u) => !u.manager_id);
    expect(roots.map((r) => r.role), 'only the finance head has no manager').toEqual(['FINANCE_HEAD']);
    const depths = seeded.map((u) => {
      let d = 0;
      for (let cur: typeof u | undefined = u; cur?.manager_id; cur = byId.get(cur.manager_id)) {
        if (++d > 10) throw new Error(`cycle at ${u.email}`);
      }
      return d;
    });
    expect(Math.max(...depths), 'depth 3 to 4').toBeLessThanOrEqual(4);
    expect(Math.max(...depths)).toBeGreaterThanOrEqual(3);
  });

  test('TC-DATA-005 All claim statuses appear in the history, with real payout batches @catalogue @data', async ({ as }) => {
    await describeTest(ref('TC-DATA-005'));
    const statuses = Object.keys(manifest().claim_statuses);
    for (const s of ['DRAFT', 'PENDING_MANAGER', 'PENDING_AUDITOR', 'SENT_BACK', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PAID']) expect(statuses, `status ${s} in the seeded history`).toContain(s);
    const batches = (await (await as('head')).http.get('/api/v1/payouts/batches', { limit: 100 })).body.items as Array<{ status: string }>;
    expect(batches.map((b) => b.status)).toContain('PAID');
  });

  test('TC-DATA-006 All 100 planted duplicates are detected @catalogue @data', async ({ as }) => {
    await describeTest(ref('TC-DATA-006'));
    const claims = await planted(await as('head'));
    const dups = manifest().plants.filter((p) => p.kind === 'dup_vendor' || p.kind === 'dup_receipt');
    expect(dups.filter((p) => p.kind === 'dup_vendor')).toHaveLength(60);
    expect(dups.filter((p) => p.kind === 'dup_receipt')).toHaveLength(40);
    expect(dups.filter((p) => !detected(claims.get(p.claim_no), 'DUPLICATE_LINE')).map((p) => p.claim_no), 'planted duplicates without a finding').toEqual([]);
  });

  test('TC-DATA-007 Planted breaches, missing receipts and weekend lines are detected @catalogue @data', async ({ as }) => {
    await describeTest(ref('TC-DATA-007'));
    const claims = await planted(await as('head'));
    const kinds = ['meals_breach', 'hotel_breach', 'cab_breach', 'missing_receipt', 'weekend'];
    const counts = Object.fromEntries(kinds.map((k) => [k, manifest().plants.filter((p) => p.kind === k).length]));
    expect(counts).toEqual({ meals_breach: 30, hotel_breach: 30, cab_breach: 30, missing_receipt: 50, weekend: 120 });
    const missed = manifest().plants.filter((p) => kinds.includes(p.kind) && !detected(claims.get(p.claim_no), p.expected_rule)).map((p) => `${p.kind} ${p.claim_no}`);
    expect(missed).toEqual([]);
  });

  test('TC-DATA-008 Boundary cases evaluate correctly @catalogue @data', async ({ as }) => {
    await describeTest(ref('TC-DATA-008'));
    const claims = await planted(await as('head'));
    const wrong: string[] = [];
    for (const p of manifest().plants.filter((x) => x.kind.startsWith('boundary_'))) {
      const c = claims.get(p.claim_no);
      if (!c) { wrong.push(`${p.kind}: claim not found`); continue; }
      if (p.expected_rule && !detected(c, p.expected_rule)) wrong.push(`${p.kind}: missing ${p.expected_rule}`);
      if (p.absent_rule && detected(c, p.absent_rule)) wrong.push(`${p.kind}: unexpected ${p.absent_rule}`);
      if (p.expected_levels && JSON.stringify(c.required_levels) !== JSON.stringify(p.expected_levels)) wrong.push(`${p.kind}: levels ${c.required_levels} != ${p.expected_levels}`);
    }
    expect(wrong).toEqual([]);
  });

  test('TC-DATA-009 Planted split patterns are flagged @catalogue @data', async ({ as }) => {
    await describeTest(ref('TC-DATA-009'));
    const claims = await planted(await as('head'));
    const splits = manifest().plants.filter((p) => p.kind === 'split');
    expect(splits).toHaveLength(15);
    expect(splits.filter((p) => !detected(claims.get(p.claim_no), 'SPLIT_SUSPECT')).map((p) => p.claim_no)).toEqual([]);
  });

  test('TC-DATA-010 Historical claims have real findings, steps and audit events (sample of 20) @catalogue @data', async ({ as }) => {
    await describeTest(ref('TC-DATA-010'));
    const h = await as('head');
    const claims = [...(await planted(h)).values()].filter((c) => c.status === STATUS.paid || c.status === STATUS.approved).slice(0, 20);
    expect(claims).toHaveLength(20);
    for (const c of claims) {
      expect(c.steps.length || c.auto_approved, `${c.claim_no} has approval steps or was auto-approved`).toBeTruthy();
      const tl = await h.claims.timeline(c.id);
      expect(tl.length, `${c.claim_no} audit events`).toBeGreaterThanOrEqual(3);
      const ts = tl.map((t) => new Date((t as unknown as { ts: string }).ts).getTime());
      expect(ts, `${c.claim_no} timestamps are in order`).toEqual([...ts].sort((x, y) => x - y));
    }
  });
});

test.describe('Performance and reliability', () => {
  test('TC-NFR-001 API latency under mixed load with 50 concurrent users (30 s) @catalogue @nfr', async ({ as }) => {
    await describeTest(ref('TC-NFR-001'));
    const [e, m, h] = [await as('employee'), await as('manager'), await as('head')];
    const times: number[] = [];
    let errors = 0;
    let total = 0;
    const until = Date.now() + 30_000;
    const claimIds = (await e.claims.list({ limit: 20 })).body.items.map((c) => c.id);
    const worker = async (n: number) => {
      while (Date.now() < until) {
        const res = n % 5 === 0 ? await m.http.get('/api/v1/approvals/inbox') : n % 5 === 1 ? await h.claims.list({ scope: 'all', limit: 50 }) : await e.claims.getRaw(claimIds[n % claimIds.length]);
        total++;
        times.push(res.ms);
        if (res.status >= 500) errors++;
      }
    };
    await Promise.all(Array.from({ length: 50 }, (_, i) => worker(i)));
    times.sort((x, y) => x - y);
    const p95 = times[Math.ceil(0.95 * times.length) - 1];
    expect(p95, `p95 ${p95} ms over ${total} requests`).toBeLessThan(800);
    expect(errors / total, `error rate ${errors}/${total}`).toBeLessThan(0.01);
  });

  test('TC-NFR-002 Claim list paginates the full history quickly @catalogue @nfr', async ({ as }) => {
    await describeTest(ref('TC-NFR-002'));
    const h = await as('head');
    let cursor: string | undefined;
    let rows = 0;
    const slow: string[] = [];
    do {
      const res = await h.claims.list({ scope: 'all', limit: 100, ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      if (res.ms > 500) slow.push(`${res.ms} ms`);
      rows += res.body.items.length;
      cursor = (res.body as { next_cursor?: string }).next_cursor ?? undefined;
    } while (cursor && rows < 12_000);
    expect(rows).toBeGreaterThanOrEqual(3000);
    expect(slow, 'pages slower than 500 ms').toEqual([]);
  });

  test('TC-NFR-003 Idempotency key replay @catalogue @nfr', async ({ as }) => {
    await describeTest(ref('TC-NFR-003'));
    const e = await as('employee');
    const key = randomUUID();
    const body = { title: claimTitle('NFR-003'), lines: [] as unknown[] };
    const first = await e.http.request('POST', '/api/v1/claims', { data: body, idempotencyKey: key });
    const replay = await e.http.request('POST', '/api/v1/claims', { data: body, idempotencyKey: key });
    expect(first.status).toBe(201);
    expect(replay.body.id, 'replay returns the stored response, not a second claim').toBe(first.body.id);
    const different = await e.http.request('POST', '/api/v1/claims', { data: { ...body, title: 'different' }, idempotencyKey: key });
    expect([409, 422, 400], 'same key with another payload is refused').toContain(different.status);
  });

  test('TC-NFR-004 Claim with 100 lines saves, evaluates and displays @catalogue @nfr', async ({ as }) => {
    await describeTest(ref('TC-NFR-004'));
    const e = await as('employee');
    const make = (n: number) => Array.from({ length: n }, (_, i) => line.travel(inr(100 + i), { receipt: null }));
    const body = async (n: number) => ({ title: claimTitle('NFR-004'), lines: await Promise.all(make(n).map((l) => e.claims.lineBody(l))) });
    // 50 lines: the most the backend accepts. Timed for the baseline.
    const started = Date.now();
    const fifty = await e.http.post<Claim>('/api/v1/claims', await body(50));
    expect(fifty.status).toBe(201);
    const submitted = await e.claims.submitRaw(fifty.body.id, fifty.body.version);
    const took = Date.now() - started;
    expect(submitted.ok).toBe(true);
    test.info().annotations.push({ type: 'note', description: `A 50-line claim saved and submitted in ${took} ms. The backend limits a claim to 50 lines.` });
    // The case asks for 100 lines.
    const hundred = await e.http.post('/api/v1/claims', await body(100));
    expect(hundred.status, `100 lines: ${hundred.text.slice(0, 160)}`).toBe(201);
  });

  test('TC-NFR-005 Parallel receipt uploads (30 files) @catalogue @nfr', async ({ as }) => {
    await describeTest(ref('TC-NFR-005'));
    const e = await as('employee');
    const files = Array.from({ length: 30 }, () => newReceipt());
    const results = await Promise.all(files.map((f) => e.claims.uploadReceiptRaw(f, 'p.png', 'image/png')));
    expect(results.filter((r) => !r.ok).map((r) => r.status), 'failed uploads').toEqual([]);
    results.forEach((r, i) => expect(r.body.sha256).toBe(createHash('sha256').update(files[i]).digest('hex')));
  });

  test('TC-NFR-008 The future-date check uses the Asia/Kolkata calendar day @catalogue @nfr', async ({ as }) => {
    await describeTest(ref('TC-NFR-008'));
    const e = await as('employee');
    const ist = (offsetDays: number) => new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
    const body = (date: string) => e.claims.lineBody(line.travel(inr(10), { date }));
    const todayIst = await e.http.post('/api/v1/claims', { title: claimTitle('NFR-008 today'), lines: [await body(ist(0))] });
    expect(todayIst.status, 'today in IST is accepted').toBe(201);
    const tomorrowIst = await e.http.post('/api/v1/claims', { title: claimTitle('NFR-008 tomorrow'), lines: [await body(ist(1))] });
    expect(tomorrowIst.status, 'tomorrow in IST is a future date').toBe(400);
  });
});

test.describe('Deployment and operations', () => {
  test('TC-OPS-001 Health and readiness endpoints answer 200 @catalogue @ops', async ({ anonymous, request, env }) => {
    await describeTest(ref('TC-OPS-001'));
    const http = await anonymous();
    expect((await http.get('/api/v1/health/live')).status).toBe(200);
    expect((await http.get('/api/v1/health/ready')).body.checks.database).toBe('ok');
    if (env.backendUrl) {
      expect((await request.get(`${env.backendUrl}/healthz`)).status()).toBe(200);
      expect((await request.get(`${env.backendUrl}/readyz`)).status()).toBe(200);
    }
  });

  test('TC-OPS-002 Metrics endpoint exposes the required series @catalogue @ops', async ({ request, env }) => {
    await describeTest(ref('TC-OPS-002'));
    const res = await request.get(`${env.backendUrl || env.apiUrl}/metrics`);
    expect(res.status(), 'GET /metrics').toBe(200);
    const text = await res.text();
    for (const series of ['pending', 'oldest', 'latency', 'requests', 'policy', 'sample_audit', 'payout', 'audit_chain_valid']) expect(text, series).toMatch(new RegExp(series, 'i'));
  });
});
