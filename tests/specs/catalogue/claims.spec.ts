import { createHash } from 'node:crypto';
import { STATUS } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { Session, expect, test } from '../../src/core/fixtures';
import { claimTitle, line, uniqueVendor } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { newReceipt } from '../../src/data/receipts';
import { submitTravel } from '../../src/data/scenarios';

const ref = (id: string) => ({ epic: 'Catalogue', feature: 'Claims', severity: 'critical' as const, ref: id });
const pdf = (bytes: number): Buffer => Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'), Buffer.alloc(bytes, 0x20), Buffer.from('\n%%EOF\n')]);

test.describe('Claim capture, drafts and receipts', () => {
  test('TC-CLM-001 Create draft claim with one line @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-001'));
    const e = await as('employee');
    const draft = await e.claims.createDraft(claimTitle('CLM-001'), [line.meals(inr(400))]);
    expect(draft.status).toBe(STATUS.draft);
    expect(draft.claim_no).toMatch(/^[A-Z]+-\d{4}-\d+/);
    expect(draft.lines).toHaveLength(1);
  });

  test('TC-CLM-002 Create claim with several lines across categories: total is the sum @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-002'));
    const e = await as('employee');
    const lines = [line.meals(inr(400)), line.hotel(inr(5000), 1), line.cab(inr(900)), line.travel(inr(3200)), line.other(inr(250))];
    const draft = await e.claims.createDraft(claimTitle('CLM-002'), lines);
    expect(draft.lines).toHaveLength(5);
    expect(draft.total_paise, 'total_paise of the saved claim equals the sum of its lines').toBe(inr(400 + 5000 + 900 + 3200 + 250));
  });

  test('TC-CLM-003 Saved draft reopens with all data intact @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-003'));
    const e = await as('employee');
    const l = line.travel(inr(1234), { vendor: uniqueVendor('Reopen') });
    const draft = await e.claims.createDraft(claimTitle('CLM-003'), [l]);
    const back = await e.claims.get(draft.id);
    expect(back.lines[0]).toMatchObject({ amount_paise: inr(1234), vendor: l.vendor, expense_date: l.date, category: 'TRAVEL' });
    expect(back.lines[0].receipt?.id).toBeTruthy();
  });

  test('TC-CLM-005 Edit a line in a draft updates the total @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-005'));
    const e = await as('employee');
    const draft = await e.claims.createDraft(claimTitle('CLM-005'), [line.meals(inr(400))]);
    const edited = await e.claims.editLineAmount(draft.id, draft.lines[0].id, inr(600));
    expect(edited.lines[0].amount_paise).toBe(inr(600));
    expect(edited.total_paise, 'claim total recalculated').toBe(inr(600));
  });

  test('TC-CLM-006 Add and delete lines in a draft @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-006'));
    const e = await as('employee');
    const draft = await e.claims.createDraft(claimTitle('CLM-006'), [line.travel(inr(1000)), line.travel(inr(2000))]);
    const added = await e.claims.addLine(draft.id, line.travel(inr(500)));
    expect(added.lines).toHaveLength(3);
    const del = await e.http.delete(`/api/v1/claims/${draft.id}/lines/${added.lines[0].id}?expected_version=${added.version}`);
    expect(del.status).toBe(200);
    const back = await e.claims.get(draft.id);
    expect(back.lines).toHaveLength(2);
    expect(back.total_paise, 'total reflects both changes').toBe(back.lines.reduce((s, x) => s + x.amount_paise, 0));
  });

  test('TC-CLM-007 Submit with no lines is blocked @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-007'));
    const e = await as('employee');
    const draft = await e.claims.createDraft(claimTitle('CLM-007'));
    const res = await e.claims.submitRaw(draft.id, draft.version);
    expect([400, 409, 422]).toContain(res.status);
    expect(JSON.stringify(res.body)).toMatch(/line/i);
    expect((await e.claims.get(draft.id)).status).toBe(STATUS.draft);
  });

  test('TC-CLM-009 Zero or negative amount is rejected @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-009'));
    const e = await as('employee');
    for (const amount of [0, -100]) {
      const res = await e.http.post('/api/v1/claims', { title: claimTitle('CLM-009'), lines: [{ ...(await e.claims.lineBody(line.travel(inr(10)))), amount_paise: amount }] });
      expect(res.status, `amount ${amount}`).toBe(400);
      expect(JSON.stringify(res.body)).toContain('amount_paise');
    }
  });

  test('TC-CLM-010 Amount with more than two decimals is rejected (API: fractional paise) @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-010'));
    const e = await as('employee');
    const res = await e.http.post('/api/v1/claims', { title: claimTitle('CLM-010'), lines: [{ ...(await e.claims.lineBody(line.travel(inr(10)))), amount_paise: 10055.5 }] });
    expect(res.status).toBe(400);
  });

  test('TC-CLM-011 Future expense date is rejected @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-011'));
    const e = await as('employee');
    const d = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const res = await e.http.post('/api/v1/claims', { title: claimTitle('CLM-011'), lines: [{ ...(await e.claims.lineBody(line.travel(inr(10)))), expense_date: d }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FUTURE_EXPENSE_DATE');
  });

  test('TC-CLM-012 Very large amount is handled without overflow @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-012'));
    const e = await as('employee');
    const res = await e.http.post('/api/v1/claims', { title: claimTitle('CLM-012'), lines: [{ ...(await e.claims.lineBody(line.travel(inr(10)))), amount_paise: 9_99_99_999_99 }] });
    if (res.ok) expect(res.body.lines[0].amount_paise, 'stored exactly in paise').toBe(9_99_99_999_99);
    else expect(res.status, `a clear validation limit message: ${res.text.slice(0, 120)}`).toBe(400);
  });

  /** A hotel line may be saved as an incomplete draft, but it must be refused by the time the claim is submitted. */
  const hotelRefusedBy = async (e: Session, override: Record<string, unknown>) => {
    const body = { ...(await e.claims.lineBody(line.hotel(inr(6000), 1))), ...override };
    const created = await e.http.post('/api/v1/claims', { title: claimTitle('CLM-hotel'), lines: [body] });
    if (!created.ok) return `create ${created.status}`;
    const submit = await e.claims.submitRaw(created.body.id, created.body.version);
    return submit.ok ? `accepted (status ${submit.body.status})` : `submit ${submit.status}`;
  };

  test('TC-CLM-013 Hotel line requires number of nights (refused at save or at submit) @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-013'));
    const e = await as('employee');
    for (const nights of [0, undefined]) expect(await hotelRefusedBy(e, { nights }), `nights=${nights}`).toMatch(/^(create|submit) 4\d\d$/);
  });

  test('TC-CLM-014 City is required for hotel lines (refused at save or at submit) @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-014'));
    const e = await as('employee');
    expect(await hotelRefusedBy(e, { city_id: null }), 'hotel line without a city').toMatch(/^(create|submit) 4\d\d$/);
  });

  test('TC-CLM-015 Upload valid PDF receipt @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-015'));
    const e = await as('employee');
    const buf = pdf(1024 * 1024);
    const res = await e.claims.uploadReceiptRaw(buf, 'invoice.pdf', 'application/pdf');
    expect(res.status).toBe(201);
    expect(res.body.sha256).toBe(createHash('sha256').update(buf).digest('hex'));
    const file = await e.claims.receiptFileRaw(res.body.id);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('pdf');
  });

  test('TC-CLM-016 Upload valid JPG and PNG receipts @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-016'));
    const e = await as('employee');
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), Buffer.from(`${Date.now()}${Math.random()}`), Buffer.from([0xff, 0xd9])]);
    const a = await e.claims.uploadReceiptRaw(jpg, 'r.jpg', 'image/jpeg');
    const b = await e.claims.uploadReceiptRaw(newReceipt(), 'r.png', 'image/png');
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(b.body.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('TC-CLM-017 Receipt over 5 MB is rejected @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-017'));
    const e = await as('employee');
    const res = await e.claims.uploadReceiptRaw(pdf(5 * 1024 * 1024 + 10), 'big.pdf', 'application/pdf');
    expect(res.status).toBe(413);
    expect(JSON.stringify(res.body)).toMatch(/large|size|5 ?MB/i);
  });

  test('TC-CLM-018 Receipt with disallowed type is rejected by magic bytes @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-CLM-018'));
    const e = await as('employee');
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
    expect([400, 415, 422]).toContain((await e.claims.uploadReceiptRaw(exe, 'virus.pdf', 'application/pdf')).status);
    expect([400, 415, 422]).toContain((await e.claims.uploadReceiptRaw(Buffer.from('<html><script>1</script></html>'), 'x.png', 'image/png')).status);
  });

  test('TC-CLM-019 Malicious filename is not used as storage path @catalogue @security', async ({ as }) => {
    await describeTest(ref('TC-CLM-019'));
    const e = await as('employee');
    const res = await e.claims.uploadReceiptRaw(pdf(2048), '../../etc/passwd.pdf', 'application/pdf');
    expect([201, 400]).toContain(res.status);
    if (res.status === 201) {
      const file = await e.claims.receiptFileRaw(res.body.id);
      expect(file.status).toBe(200);
      expect(file.headers['content-disposition'] ?? '').not.toContain('..');
    }
  });

  test('TC-CLM-020 Same file uploaded twice produces the same SHA-256 @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-020'));
    const e = await as('employee');
    const buf = newReceipt();
    const [a, b] = [await e.claims.uploadReceipt(buf), await e.claims.uploadReceipt(buf)];
    expect(a.sha256).toBe(b.sha256);
  });

  test('TC-CLM-022 Submitted claim is immutable (PATCH claim, PATCH line, DELETE line all 409) @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-022'));
    const e = await as('employee');
    const c = await submitTravel(e, 'CLM-022', inr(8000));
    const patchClaim = await e.http.patch(`/api/v1/claims/${c.id}`, { title: 'changed', expected_version: c.version });
    const patchLine = await e.claims.patchLineRaw(c.id, c.lines[0].id, c.version, { amount_paise: inr(1) });
    const delLine = await e.http.delete(`/api/v1/claims/${c.id}/lines/${c.lines[0].id}?expected_version=${c.version}`);
    expect([patchClaim.status, patchLine.status, delLine.status]).toEqual([409, 409, 409]);
    const back = await e.claims.get(c.id);
    expect(back.title).toBe(c.title);
    expect(back.lines[0].amount_paise).toBe(inr(8000));
  });

  test('TC-CLM-023 Employee can withdraw before the first approval @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-023'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'CLM-023', inr(8000));
    expect(await m.approvals.inboxClaimIds()).toContain(c.id);
    const w = await e.claims.withdraw(c.id);
    expect(w.status).toBe(STATUS.withdrawn);
    expect(await m.approvals.inboxClaimIds(), 'claim leaves the manager inbox').not.toContain(c.id);
    const tl = await e.claims.timeline(c.id);
    expect(tl.map((t) => t.action).join(' ')).toMatch(/withdraw/i);
  });

  test('TC-CLM-024 Withdraw is blocked once an approval is recorded @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-024'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'CLM-024', inr(30000));
    await m.approvals.decide(c.id, 'approve');
    const cur = await e.claims.get(c.id);
    const res = await e.http.post(`/api/v1/claims/${c.id}/withdraw`, { expected_version: cur.version });
    expect(res.status).toBe(409);
    expect((await e.claims.get(c.id)).status).toBe(STATUS.pendingAuditor);
  });

  test('TC-CLM-025 Employee can withdraw a draft @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-025'));
    const e = await as('employee');
    const d = await e.claims.createDraft(claimTitle('CLM-025'), [line.travel(inr(1000))]);
    expect((await e.claims.withdraw(d.id)).status).toBe(STATUS.withdrawn);
    const active = await e.claims.list({ status: 'DRAFT', limit: 100 });
    expect(active.body.items.map((c) => c.id)).not.toContain(d.id);
  });

  test('TC-CLM-026 Policy preview is advisory and not stored @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-026'));
    const e = await as('employee');
    const d = await e.claims.createDraft(claimTitle('CLM-026'), [line.meals(inr(1800))]);
    const preview = await e.claims.previewRaw(d.id);
    expect(preview.status).toBe(200);
    expect(JSON.stringify(preview.body)).toMatch(/1,500|MEALS_DAILY_CAP/);
    const stored = await e.claims.get(d.id);
    expect(stored.lines[0].findings, 'nothing stored until submit').toHaveLength(0);
    expect(stored.status).toBe(STATUS.draft);
  });

  test('TC-CLM-027 Submit result matches preview for the same data @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-027'));
    const e = await as('employee');
    const d = await e.claims.createDraft(claimTitle('CLM-027'), [line.meals(inr(1800)), line.travel(inr(8000))]);
    const preview = await e.claims.previewRaw(d.id);
    const submitted = await e.claims.submit(d.id);
    const pv = (preview.body as unknown as { lines: Array<{ line_id: string; findings: Array<{ rule_code: string }> }> }).lines;
    for (const l of submitted.lines) {
      const expected = pv.find((p) => p.line_id === l.id)!.findings.map((f) => f.rule_code).sort();
      expect(l.findings.map((f) => f.rule_code).sort(), `line ${l.id}`).toEqual(expected);
    }
  });

  test('TC-CLM-028 Concurrent edits of one draft raise a version conflict @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-028'));
    const e = await as('employee');
    const d = await e.claims.createDraft(claimTitle('CLM-028'), [line.travel(inr(1000)), line.travel(inr(2000))]);
    const a = await e.claims.patchLineRaw(d.id, d.lines[0].id, d.version, { amount_paise: inr(1100) });
    const b = await e.claims.patchLineRaw(d.id, d.lines[1].id, d.version, { amount_paise: inr(2200) });
    expect(a.status).toBe(200);
    expect(b.status, 'the second tab holds a stale version').toBe(409);
    expect(b.body).toMatchObject({ error: { code: 'CLAIM_VERSION_CONFLICT' } });
    expect((await e.claims.get(d.id)).lines.find((l) => l.id === d.lines[1].id)!.amount_paise, 'no silent overwrite').toBe(inr(2000));
  });

  test('TC-CLM-029 Claim numbers stay unique under concurrent creation (100 in parallel) @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-029'));
    const [a, b] = [await as('employee'), await as('employee2')];
    const make = (s: typeof a, i: number) => s.http.post('/api/v1/claims', { title: claimTitle(`CLM-029 ${i}`), lines: [] });
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => make(i % 2 ? a : b, i)));
    const failed = results.filter((r) => !r.ok);
    expect(failed.map((r) => `${r.status}`), 'no errors or deadlocks').toEqual([]);
    const nos = results.map((r) => r.body.claim_no);
    expect(new Set(nos).size, 'all claim_no values are unique').toBe(nos.length);
  });

  test('TC-CLM-030 Drafts do not appear in approver queues @catalogue @regression', async ({ as }) => {
    await describeTest(ref('TC-CLM-030'));
    const [e, m, au, h] = [await as('employee'), await as('manager'), await as('auditor'), await as('head')];
    const d = await e.claims.createDraft(claimTitle('CLM-030'), [line.travel(inr(30000))]);
    expect(await m.approvals.inboxClaimIds()).not.toContain(d.id);
    expect((await au.review.queueRaw({ q: d.claim_no })).body.items.map((c) => c.id)).not.toContain(d.id);
    expect((await h.claims.list({ q: d.claim_no })).body.items.map((c) => c.id), 'not even in the head\'s list').not.toContain(d.id);
    expect((await m.claims.getRaw(d.id)).status, 'a draft is not readable by others').toBe(404);
  });
});
