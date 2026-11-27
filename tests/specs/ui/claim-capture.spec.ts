import { STATUS } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { isolatedDate } from '../../src/data/dates';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';

test.describe('Claim capture in the browser', () => {
  test('E2E01 an employee drafts, saves and submits a clean 1,200 INR claim: auto-approved @smoke @regression @e2e @ui', async ({ as, ui }) => {
    await describeTest({ epic: 'Claims', feature: 'Capture and submit', severity: 'blocker', ref: 'E2E01 / CL-01..CL-05' });
    const employee = await as('employee');
    const app = await ui('employee');
    const title = claimTitle('E2E01 clean cab');

    await app.capture.open();
    await app.capture.setTitle(title);
    await app.capture.fillLine(1, line.cab(inr(1200), { date: isolatedDate(), description: 'Airport drop' }));
    const claimId = await app.capture.saveDraft();
    expect((await employee.claims.get(claimId)).status).toBe(STATUS.draft);

    await app.page.reload();
    await expect(app.capture.title(), 'the draft survives a reload').toHaveValue(title);
    await expect(app.capture.lineCards()).toHaveCount(1);

    await app.capture.submit();
    await expect(app.page.getByText(title).first()).toBeVisible();
    expect((await employee.claims.get(claimId)).status, 'clean and up to 5,000 INR').toBe(STATUS.approved);
  });

  test('E2E02 meals of 1,800 INR in a day: the line is rejected and the reason is shown in the review step @regression @e2e @ui', async ({ as, ui }) => {
    await describeTest({ epic: 'Claims', feature: 'Policy feedback', severity: 'blocker', ref: 'E2E02 / CL-04' });
    const employee = await as('employee');
    const app = await ui('employee');

    await app.capture.open();
    await app.capture.setTitle(claimTitle('E2E02 meals'));
    await app.capture.fillLine(1, line.meals(inr(1800), { description: 'Team dinner' }));
    await app.capture.addLine(line.travel(inr(8000), { description: 'Client visit train' }), 2);
    await app.capture.reviewButton().click();

    const modal = app.capture.reviewModal();
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/1,500/).first(), 'the employee sees why the meals line fails').toBeVisible();
    await expect(modal.getByText('Rejected by policy')).toBeVisible();
    await modal.getByRole('button', { name: 'Submit claim' }).click();
    await app.page.waitForURL(/\/employee\/claims$/);

    const list = await employee.claims.list({ q: 'E2E02' });
    const claim = list.body.items.find((c) => c.title.includes('E2E02'));
    expect(claim?.status).toBe(STATUS.pendingManager);
  });

  test('CAP-03 the form refuses to review a claim without a title or with an incomplete line @regression @ui', async ({ ui }) => {
    await describeTest({ epic: 'Claims', feature: 'Form validation', severity: 'normal', ref: 'CL-02' });
    const app = await ui('employee');
    await app.capture.open();
    await expect(app.capture.reviewButton(), 'no title yet').toBeDisabled();
    await app.capture.setTitle(claimTitle('CAP-03'));
    await app.capture.reviewButton().click(); // the first line has no vendor/amount
    await expect(app.page.getByText(/is missing/i).first()).toBeVisible();
  });

  test('CAP-04 a hotel line asks for a city and nights and applies the tier-1 limit @regression @ui', async ({ ui, env }) => {
    await describeTest({ epic: 'Claims', feature: 'Hotel line', severity: 'normal', ref: 'PE-04' });
    const app = await ui('employee');
    await app.capture.open();
    await app.capture.setTitle(claimTitle('CAP-04'));
    await app.capture.fillLine(1, line.hotel(1200002, 2, { city: env.cities.tier1 }));
    await expect(app.capture.lineCard(1).getByLabel('City')).toBeVisible();
    await expect(app.capture.advisory(/6,000/), 'the live check names the limit').toBeVisible();
  });

  test('CAP-05 a draft can be opened from My claims and withdrawn after submit @regression @ui', async ({ as, ui }) => {
    await describeTest({ epic: 'Claims', feature: 'Withdraw', severity: 'normal', ref: 'CL-07' });
    const employee = await as('employee');
    const claim = await employee.claims.createAndSubmit(claimTitle('CAP-05'), [line.travel(inr(8000))]);
    const app = await ui('employee');
    await app.capture.openClaim(claim.id);
    await app.page.getByRole('button', { name: 'Withdraw claim' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
    await expect.poll(async () => (await employee.claims.get(claim.id)).status).toBe(STATUS.withdrawn);
  });
});
