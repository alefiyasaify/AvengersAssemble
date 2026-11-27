import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { STATUS } from '../../config/environments';
import { createUser } from '../../src/api/admin';
import { HttpClient } from '../../src/api/http-client';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { addDays, isolatedDate } from '../../src/data/dates';
import { claimTitle, line, uniqueVendor } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { newReceipt } from '../../src/data/receipts';
import { duplicatePairAtAuditor, submitTravel } from '../../src/data/scenarios';

const ref = (id: string) => ({ epic: 'Catalogue', feature: 'Security', severity: 'critical' as const, ref: id });
const BAD = [400, 415, 422];

test.describe('Security and approval-bypass controls (C1 to C14)', () => {
  test('TC-SEC-001 C1: claim splitting is detected @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-001'));
    const e = await as('employee');
    const vendor = uniqueVendor('Split');
    const d = isolatedDate('monday');
    const third = [d, addDays(d, 1), addDays(d, 2)].map((day) => ({ day }));
    let last;
    for (const { day } of third) last = await e.claims.createAndSubmit(claimTitle('SEC-001'), [line.travel(inr(10000), { vendor, date: day })]);
    expect(last!.lines.flatMap((l) => l.findings).some((f) => f.rule_code === 'SPLIT_SUSPECT')).toBe(true);
    expect(last!.required_levels).toContain(2);
  });

  test('TC-SEC-002 C2: submitted lines cannot be edited through any path @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-002'));
    const e = await as('employee');
    const c = await submitTravel(e, 'SEC-002', inr(8000));
    const other = await e.claims.uploadReceipt(newReceipt());
    const amount = await e.claims.patchLineRaw(c.id, c.lines[0].id, c.version, { amount_paise: 1 });
    const receipt = await e.claims.patchLineRaw(c.id, c.lines[0].id, c.version, { receipt_id: other.id });
    expect([amount.status, receipt.status]).toEqual([409, 409]);
    const back = await e.claims.get(c.id);
    expect(back.lines[0].amount_paise).toBe(inr(8000));
    expect(back.lines[0].receipt?.id).toBe(c.lines[0].receipt?.id);
  });

  test('TC-SEC-003 C3: manager hierarchy cannot form a cycle @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-003'));
    const head = await as('head');
    const a = await createUser(head, { role: 'MANAGER', label: 'CycA' });
    const b = await createUser(head, { role: 'MANAGER', managerId: a.id, label: 'CycB' });
    const res = await head.http.patch(`/api/v1/admin/users/${a.id}`, { manager_id: b.id });
    expect([400, 409, 422]).toContain(res.status);
  });

  test('TC-SEC-004 C4: delegation to claimant, junior or with an open end date is blocked @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-004'));
    const [m, junior, e] = [await as('manager'), await as('employee2'), await as('employee')];
    const win = (days: number) => ({ starts_at: new Date(Date.now() - 60_000).toISOString(), ends_at: new Date(Date.now() + days * 86_400_000).toISOString() });
    const toClaimant = await m.http.post('/api/v1/delegations', { delegate_id: (await e.me()).id, level_no: 1, ...win(2) });
    const toJunior = await m.http.post('/api/v1/delegations', { delegate_id: (await junior.me()).id, level_no: 1, ...win(2) });
    const open = await m.http.post('/api/v1/delegations', { delegate_id: (await (await as('delegate')).me()).id, level_no: 1, starts_at: win(1).starts_at });
    expect({ claimant: toClaimant.ok, junior: toJunior.ok, openEnd: open.ok }).toEqual({ claimant: false, junior: false, openEnd: false });
  });

  test('TC-SEC-005 C5: approving a later step directly is refused @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-005'));
    const [e, a, h] = [await as('employee'), await as('auditor'), await as('head')];
    const c = await submitTravel(e, 'SEC-005', inr(500000));
    expect(c.steps.filter((s) => s.status === 'PENDING'), 'only level 1 is open').toHaveLength(1);
    for (const who of [a, h]) {
      const res = await who.approvals.actRaw(c.current_step!.id, 'approve', { expected_version: c.version });
      expect([403, 409]).toContain(res.status);
    }
    const ghost = await h.approvals.actRaw(randomUUID(), 'approve', { expected_version: c.version });
    expect([404, 409]).toContain(ghost.status);
    expect((await e.claims.get(c.id)).status).toBe(STATUS.pendingManager);
  });

  test('TC-SEC-006 C6: vendor spelling variants are still caught @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-006'));
    const e = await as('employee');
    const base = uniqueVendor('Cafe Delight');
    const date = isolatedDate();
    await e.claims.createAndSubmit(claimTitle('SEC-006 base'), [line.other(inr(1250), { vendor: base, date })]);
    const variants = [base.toUpperCase(), base.replace(' ', '    '), `${base}.`, `  ${base.toLowerCase()}  `];
    const missed: string[] = [];
    for (const v of variants) {
      const c = await e.claims.createAndSubmit(claimTitle('SEC-006'), [line.other(inr(1250), { vendor: v, date })]);
      if (!c.lines.some((l) => l.findings.some((f) => f.rule_code === 'DUPLICATE_LINE'))) missed.push(JSON.stringify(v));
    }
    expect(missed, 'variants not flagged as duplicates').toEqual([]);
  });

  test('TC-SEC-008 C7: maker-checker on payout @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-008'));
    const h = await as('head');
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    try {
      expect([403, 409]).toContain((await h.payouts.verifyRaw(b.id)).status);
      expect((await h.payouts.exportRaw(b.id)).status).toBe(409);
      expect((await h.payouts.createBatchRaw([c.claim_id])).ok).toBe(false);
    } finally {
      await h.payouts.cancelRaw(b.id);
    }
  });

  test('TC-SEC-011 C10: bulk approve cannot wave through risky claims; one audit event per approval @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-011'));
    const [e, m, a] = [await as('employee'), await as('manager'), await as('auditor')];
    const { duplicate, clean } = await duplicatePairAtAuditor(e, m);
    const res = await a.review.bulkApproveRaw([duplicate, clean].map((c) => ({ claim_id: c.id, expected_version: c.version })));
    const by = Object.fromEntries(res.body.results.map((r) => [r.claim_id, r.result]));
    expect(by[duplicate.id]).toBe('SKIPPED');
    expect(by[clean.id]).toBe('APPROVED');
    const approvals = async (id: string) => (await e.claims.timeline(id)).filter((t) => t.action === 'approval.approved').length;
    expect(await approvals(clean.id), 'one audit event per approval: manager and auditor').toBe(2);
    expect(await approvals(duplicate.id), 'only the manager approved the duplicate').toBe(1);
  });

  test('TC-SEC-012 C11: employee cannot influence or observe sampling @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-012'));
    const e = await as('employee');
    const c = await e.claims.createAndSubmit(claimTitle('SEC-012'), [line.cab(inr(900))]);
    expect(c.status).toBe(STATUS.approved);
    const res = await e.http.post(`/api/v1/claims/${c.id}/withdraw`, { expected_version: c.version });
    expect(res.status, 'an auto-approved claim cannot be withdrawn and resubmitted to re-roll the draw').toBe(409);
    expect((await e.claims.get(c.id)).sample_audit_pending).toBe(false);
  });

  test('TC-SEC-013 C12: parallel mark-paid calls: exactly one succeeds @catalogue @security @concurrency', async ({ as }) => {
    await describeTest(ref('TC-SEC-013'));
    const [h, a] = [await as('head'), await as('auditor')];
    const [c] = (await h.payouts.eligible()).slice(0, 1);
    const b = await h.payouts.createBatch([c.claim_id]);
    await a.payouts.verify(b.id);
    await h.payouts.export(b.id);
    const [x, y] = await Promise.all([h.payouts.markPaidRaw(b.id), h.payouts.markPaidRaw(b.id)]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  test('TC-SEC-014 C13: IDOR on claims, receipts and batches @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-014'));
    const [owner, other, h] = [await as('employee'), await as('employee2'), await as('head')];
    const c = await submitTravel(owner, 'SEC-014', inr(8000));
    expect(c.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect((await other.claims.getRaw(c.id)).status).toBe(404);
    expect((await other.claims.receiptFileRaw(c.lines[0].receipt!.id)).status).toBe(404);
    expect((await other.http.get(`/api/v1/claims/${c.id}/timeline`)).status).toBe(404);
    const [batch] = (await h.http.get('/api/v1/payouts/batches')).body.items;
    expect([403, 404]).toContain((await other.http.get(`/api/v1/payouts/batches/${batch.id}`)).status);
    expect((await other.http.get(`/api/v1/claims/${randomUUID()}`)).status).toBe(404);
  });

  test('TC-SEC-015 C14: future and very old expense dates @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-015'));
    const e = await as('employee');
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const future = await e.http.post('/api/v1/claims', { title: claimTitle('SEC-015 f'), lines: [{ ...(await e.claims.lineBody(line.travel(inr(10)))), expense_date: tomorrow }] });
    expect(future.status).toBe(400);
    const old = new Date(Date.now() - 730 * 86_400_000);
    while (old.getDay() === 0 || old.getDay() === 6) old.setDate(old.getDate() - 1);
    const c = await e.claims.createAndSubmit(claimTitle('SEC-015 o'), [line.travel(inr(1000), { date: old.toISOString().slice(0, 10) })]);
    expect(c.lines[0].findings.filter((f) => f.rule_code === 'CLAIM_AGE_LIMIT'), 'rule is inactive by default').toHaveLength(0);
    expect(c.status).not.toBe(STATUS.rejected);
  });

  test('TC-SEC-016 SQL injection in search and filter parameters @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-016'));
    const [e, a] = [await as('employee'), await as('auditor')];
    const payloads = ["' OR 1=1 --", "1' UNION SELECT NULL,NULL--", "'; DROP TABLE claims;--"];
    const baseline = (await a.review.queueRaw({ q: 'zzz-no-such-claim' })).body.items.length;
    for (const p of payloads) {
      for (const [who, path, query] of [
        [e, '/api/v1/claims', { q: p }],
        [a, '/api/v1/review-queue', { q: p }],
        [a, '/api/v1/review-queue', { department_id: p }],
        [a, '/api/v1/users', { q: p }],
      ] as const) {
        const res = await who.http.get(path, query as Record<string, string>);
        expect([200, 400, 422], `${path} ${JSON.stringify(query)} -> ${res.status}`).toContain(res.status);
        expect(res.text).not.toMatch(/sqlite|syntax error|traceback|sqlalchemy/i);
        if (res.status === 200 && 'q' in query) expect(res.body.items?.length ?? 0, 'results unchanged by the payload').toBeLessThanOrEqual(baseline);
      }
    }
    expect((await e.claims.list()).status, 'the database is intact').toBe(200);
  });

  test('TC-SEC-017 Stored XSS in vendor, description and comment fields @catalogue @security @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-SEC-017'));
    const [e, m] = [await as('employee'), await as('manager')];
    const script = '<script>window.__xss=1</script>';
    const img = '<img src=x onerror="window.__xss=1">';
    const c = await e.claims.createAndSubmit(claimTitle('SEC-017'), [line.travel(inr(8000), { vendor: `${script} V`, description: img })]);
    await m.http.post(`/api/v1/claims/${c.id}/comments`, { body: `${script}${img}` });
    const app = await ui('manager');
    let dialog = false;
    app.page.on('dialog', async (d) => {
      dialog = true;
      await d.dismiss();
    });
    await app.review.open('manager', c.id);
    await expect(app.review.lineItems().getByText(script, { exact: false }), 'rendered as text, not executed').toBeVisible();
    expect(await app.page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialog).toBe(false);
  });

  test('TC-SEC-018 Mass assignment is blocked @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-018'));
    const [e, other] = [await as('employee'), await as('employee2')];
    const res = await e.http.post('/api/v1/claims', {
      title: claimTitle('SEC-018'),
      lines: [await e.claims.lineBody(line.travel(inr(1000)))],
      status: 'APPROVED',
      owner_id: (await other.me()).id,
      payable_paise: 1,
    });
    expect([400, 422], `unknown fields are refused (got ${res.status})`).toContain(res.status);
  });

  test('TC-SEC-019 Tampered or unsigned JWT is rejected @catalogue @security', async ({ as, env }) => {
    await describeTest(ref('TC-SEC-019'));
    const e = await as('employee');
    const token = (await e.http.storageState()).cookies.find((c) => c.name === 'ef_access')!.value;
    const [h, p, s] = token.split('.');
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const payload = { ...JSON.parse(Buffer.from(p, 'base64url').toString()), role: 'FINANCE_HEAD' };
    const forged = `${h}.${b64(payload)}.${s}`;
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
    const client = await HttpClient.anonymous(env);
    for (const [name, t] of [['payload altered', forged], ['alg none', none]]) {
      const res = await client.request('GET', '/api/v1/admin/config', { headers: { Authorization: `Bearer ${t}` } });
      expect(res.status, name).toBe(401);
    }
    await client.dispose();
  });

  test('TC-SEC-020 Security headers are present on web and API responses @catalogue @security', async ({ request, env }) => {
    await describeTest(ref('TC-SEC-020'));
    const missing: string[] = [];
    for (const url of [`${env.apiUrl}/api/v1/version`, `${env.baseUrl}/`]) {
      const h = (await request.get(url)).headers();
      const need = ['content-security-policy', 'x-content-type-options', 'x-frame-options', ...(url.startsWith('https') ? ['strict-transport-security'] : [])];
      for (const n of need) if (!h[n]) missing.push(`${url} lacks ${n}`);
    }
    expect(missing).toEqual([]);
  });

  test('TC-SEC-021 CORS only allows the same origin @catalogue @security', async ({ request, env }) => {
    await describeTest(ref('TC-SEC-021'));
    const res = await request.get(`${env.apiUrl}/api/v1/version`, { headers: { Origin: 'https://evil.example' } });
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
    const pre = await request.fetch(`${env.apiUrl}/api/v1/claims`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    expect(pre.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('TC-SEC-022 Receipts are served only through the authorised endpoint @catalogue @security', async ({ as, anonymous }) => {
    await describeTest(ref('TC-SEC-022'));
    const e = await as('employee');
    const c = await submitTravel(e, 'SEC-022', inr(8000));
    const id = c.lines[0].receipt!.id;
    const http = await anonymous();
    expect((await http.get(`/api/v1/receipts/${id}/file`)).status, 'no anonymous access').toBe(401);
    for (const guess of [`/api/v1/receipts/${id}`, `/receipts/${id}`, `/data/receipts/${id}`, `/uploads/${id}`, `/static/receipts/${id}.png`]) {
      expect((await http.get(guess)).headers['content-type'] ?? '', guess).not.toMatch(/image|pdf/);
    }
    expect((await e.claims.receiptFileRaw(id)).status).toBe(200);
  });

  test('TC-SEC-023 Error responses do not leak stack traces or SQL @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-SEC-023'));
    const e = await as('employee');
    for (const res of [await e.http.get('/api/v1/claims/not-a-uuid'), await e.http.post('/api/v1/claims', { title: 1 }), await e.http.get('/api/v1/nothing-here')]) {
      expect(res.text).not.toMatch(/Traceback|File ".*\.py"|sqlalchemy|SELECT |INSERT |sqlite3/i);
      if (res.status >= 400 && res.body?.error) expect(res.body.error.request_id).toBe(res.headers['x-request-id']);
    }
  });

  test('TC-SEC-026 Logs contain no tokens or passwords @catalogue @security', async ({ env }) => {
    await describeTest(ref('TC-SEC-026'));
    const path = process.env.EF_BACKEND_LOG;
    test.skip(!path || !fs.existsSync(path), 'set EF_BACKEND_LOG to the backend log file to run this check');
    const log = fs.readFileSync(path!, 'utf8');
    expect(log).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./);
    expect(log).not.toContain(env.personas.head!.password);
    expect(log).not.toMatch(/"password"\s*:/i);
  });

  test('TC-SEC-027 Upload size and type abuse is contained @catalogue @security', async ({ as, anonymous }) => {
    await describeTest(ref('TC-SEC-027'));
    const e = await as('employee');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(4096, 0)]);
    for (const [name, buf, type] of [['empty', Buffer.alloc(0), 'image/png'], ['svg', svg, 'image/svg+xml'], ['zip', zip, 'application/zip'], ['zip as pdf', zip, 'application/pdf']] as const) {
      const res = await e.claims.uploadReceiptRaw(buf, `x-${name}.png`, type);
      expect(BAD, `${name} -> ${res.status}`).toContain(res.status);
    }
    expect(((await (await anonymous()).get('/api/v1/health/ready')).status), 'the server is unaffected').toBe(200);
  });
});
