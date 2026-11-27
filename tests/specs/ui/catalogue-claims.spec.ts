import { expect, test } from '../../src/core/fixtures';
import { describeTest } from '../../src/core/allure';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';

const ref = (id: string) => ({ epic: 'Catalogue', feature: 'Claims (UI)', severity: 'critical' as const, ref: id });

test.describe('Claim capture in the browser (catalogue)', () => {
  test('TC-CLM-004 Draft autosaves 2 seconds after last change @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-CLM-004'));
    const e = await as('employee');
    const draft = await e.claims.createDraft(claimTitle('CLM-004'), [line.travel(inr(400))]);
    const app = await ui('employee');
    await app.capture.openClaim(draft.id);
    await app.capture.amountField(1).fill('600');
    await app.page.waitForTimeout(3_000);
    await expect(app.page.getByText('Saved', { exact: true }), 'the indicator shows Saved without pressing anything').toBeVisible();
    await app.page.reload();
    await expect(app.capture.amountField(1), 'reload shows the new value').toHaveValue(/600/);
  });

  test('TC-CLM-008 Submit with missing mandatory fields shows field-level errors @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-CLM-008'));
    const e = await as('employee');
    const app = await ui('employee');
    await app.capture.open();
    await app.capture.setTitle(claimTitle('CLM-008'));
    await app.capture.reviewButton().click();
    await expect(app.page.getByText(/is missing/i).first(), 'a message names the missing fields').toBeVisible();
    const flagged = await app.capture.lineCard(1).locator('[aria-invalid="true"], .ant-form-item-explain-error, [role="alert"]').count();
    expect(flagged, 'each missing field is flagged inline on the line').toBeGreaterThanOrEqual(3);
    expect((await e.claims.list({ q: 'CLM-008' })).body.items, 'no state change').toHaveLength(0);
  });

  test('TC-CLM-010 Amount with more than two decimals is rejected, not silently rounded @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-CLM-010'));
    const e = await as('employee');
    const app = await ui('employee');
    await app.capture.open();
    const title = claimTitle('CLM-010');
    await app.capture.setTitle(title);
    await app.capture.fillLine(1, { ...line.travel(inr(1)), amountPaise: 100 });
    await app.capture.amountField(1).fill('100.555');
    await app.capture.saveDraftButton().click();
    await app.page.waitForTimeout(1_500);
    const saved = (await e.claims.list({ q: title })).body.items[0];
    if (saved) {
      const claim = await e.claims.get(saved.id);
      expect(claim.lines[0].amount_paise, 'must not be rounded silently to 10056').not.toBe(10056);
    }
    await expect(app.page.getByText(/decimal|two decimals|invalid amount/i).first(), 'a validation message is shown').toBeVisible();
  });

  test('TC-CLM-021 Submit confirmation sheet shows totals and lines to be rejected @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-CLM-021'));
    const e = await as('employee');
    const app = await ui('employee');
    const title = claimTitle('CLM-021');
    await app.capture.open();
    await app.capture.setTitle(title);
    await app.capture.fillLine(1, line.meals(inr(1800), { description: 'Team dinner' }));
    await app.capture.addLine(line.travel(inr(8000), { description: 'Train' }), 2);
    await app.capture.reviewButton().click();
    const sheet = app.capture.reviewModal();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Rejected by policy'), 'the line that will be rejected').toBeVisible();
    await expect(sheet.getByText(/1,500/).first()).toBeVisible();
    await expect(sheet.getByText(/9,800/), 'total').toBeVisible();
    await expect(sheet.getByText(/8,000/).first(), 'payable total').toBeVisible();
    const created = (await e.claims.list({ q: title })).body.items[0];
    expect(created?.status, 'the sheet appears before any submit call').toBe('DRAFT');
  });
});
