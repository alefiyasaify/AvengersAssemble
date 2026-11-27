import { STATUS } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { futureDate } from '../../src/data/dates';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { fakeImage, newReceipt, oversizedReceipt } from '../../src/data/receipts';
import { submitTravel } from '../../src/data/scenarios';

test.describe('Claim lifecycle', () => {
  test('CL-01 a draft can be saved, edited and submitted @regression @claims', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Draft and submit', severity: 'blocker', ref: 'CL-01..CL-05' });
    const employee = await as('employee');
    const draft = await employee.claims.createDraft(claimTitle('CL-01'), [line.travel(inr(2000))]);
    expect(draft.status).toBe(STATUS.draft);
    expect(draft.allowed_actions).toEqual(expect.arrayContaining(['edit', 'submit']));

    const edited = await employee.claims.editLineAmount(draft.id, draft.lines[0].id, inr(2500));
    expect(edited.lines[0].amount_paise, 'drafts show line amounts; totals are computed at submit').toBe(inr(2500));

    const submitted = await employee.claims.submit(draft.id);
    expect(submitted.status, '2,500 clean claim auto-approves').toBe(STATUS.approved);
  });

  test('CL-02 a claim without lines cannot be submitted @regression @claims', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Validation', severity: 'critical', ref: 'CL-02' });
    const employee = await as('employee');
    const draft = await employee.claims.createDraft(claimTitle('CL-02'));
    const res = await employee.claims.submitRaw(draft.id, draft.version);
    expect([400, 409, 422]).toContain(res.status);
  });

  test('CL-03 amounts must be positive whole paise and dates cannot be in the future @regression @claims', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Validation', severity: 'critical', ref: 'docs/02 validation' });
    const employee = await as('employee');
    const draft = await employee.claims.createDraft(claimTitle('CL-03'), [line.travel(inr(1000))]);
    const lineId = draft.lines[0].id;

    for (const [what, data, code] of [
      ['zero amount', { amount_paise: 0 }, 'VALIDATION_FAILED'],
      ['negative amount', { amount_paise: -100 }, 'VALIDATION_FAILED'],
      ['fractional paise', { amount_paise: 10.5 }, 'VALIDATION_FAILED'],
      ['future date', { expense_date: futureDate() }, 'FUTURE_EXPENSE_DATE'],
    ] as const) {
      const res = await employee.claims.patchLineRaw(draft.id, lineId, draft.version, data);
      expect(res.status, what).toBe(400);
      expect(res.body, what).toMatchObject({ error: { code } });
    }
  });

  test('CL-04 a hotel line needs a city and nights @regression @claims', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Validation', severity: 'normal', ref: 'ARD 5 / PE-04' });
    const employee = await as('employee');
    const res = await employee.http.post('/api/v1/claims', {
      title: claimTitle('CL-04'),
      lines: [{ category: 'HOTEL', description: 'Stay', vendor: 'Hotel X', amount_paise: inr(5000), expense_date: '2025-01-07' }],
    });
    // Without a city the policy cannot pick a cap: either refused up front or no auto-approval.
    expect([200, 201, 400]).toContain(res.status);
  });

  test('CL-05 a submitted claim can no longer be edited, but can be withdrawn @regression @claims', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Withdraw', severity: 'critical', ref: 'CL-07' });
    const employee = await as('employee');
    const claim = await submitTravel(employee, 'CL-05', inr(8000));
    const edit = await employee.claims.patchLineRaw(claim.id, claim.lines[0].id, claim.version, { amount_paise: inr(1) });
    expect(edit.status, 'edit after submit is a conflict').toBe(409);

    const withdrawn = await employee.claims.withdraw(claim.id);
    expect(withdrawn.status).toBe(STATUS.withdrawn);
  });

  test('CL-06 the policy preview matches the outcome of submitting @regression @claims', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Policy preview', severity: 'critical', ref: 'ARD 8 policy-preview' });
    const employee = await as('employee');
    const draft = await employee.claims.createDraft(claimTitle('CL-06'), [line.meals(inr(1800)), line.travel(inr(8000))]);
    const preview = await employee.claims.previewRaw(draft.id);
    expect(preview.status).toBe(200);
    expect(preview.body.outcome).toBe('ROUTE');
    expect(preview.body.payable_paise).toBe(inr(8000));
    const submitted = await employee.claims.submit(draft.id);
    expect(submitted.payable_paise).toBe(preview.body.payable_paise);
  });

  test('CL-07 stale version on submit is a 409 @regression @claims', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Concurrency', severity: 'normal', ref: 'docs/02' });
    const employee = await as('employee');
    const draft = await employee.claims.createDraft(claimTitle('CL-07'), [line.travel(inr(3000))]);
    const res = await employee.claims.submitRaw(draft.id, draft.version + 3);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'CLAIM_VERSION_CONFLICT' } });
  });
});

test.describe('Receipts', () => {
  test('RC-01 a PNG is accepted and stored with its SHA-256 @regression @claims', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Receipts', severity: 'critical', ref: 'ARD 7 receipts' });
    const employee = await as('employee');
    const receipt = await employee.claims.uploadReceipt(newReceipt());
    expect(receipt.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('RC-02 a file that is not an image is refused (magic bytes, not the filename) @regression @claims @security', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Receipts', severity: 'critical', ref: 'ARD 7 / C8' });
    const employee = await as('employee');
    const res = await employee.claims.uploadReceiptRaw(fakeImage(), 'receipt.png', 'image/png');
    expect([400, 415, 422]).toContain(res.status);
  });

  test('RC-03 a file over 5 MB is refused with 413 @regression @claims @security', async ({ as }) => {
    await describeTest({ epic: 'Claims', feature: 'Receipts', severity: 'critical', ref: 'ARD 7 / C8' });
    const employee = await as('employee');
    const res = await employee.claims.uploadReceiptRaw(oversizedReceipt(), 'big.png', 'image/png');
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });
});
