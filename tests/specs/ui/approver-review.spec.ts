import { STATUS } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { inr } from '../../src/data/money';
import { duplicatePairAtAuditor, submitTravel } from '../../src/data/scenarios';

test.describe('Approver screens', () => {
  test('E2E03 the manager approves an 8,000 INR claim from the inbox: APPROVED, chain ends @smoke @regression @e2e @ui', async ({ as, ui }) => {
    await describeTest({ epic: 'Approvals', feature: 'Approve in the UI', severity: 'blocker', ref: 'E2E03' });
    const employee = await as('employee');
    const claim = await submitTravel(employee, 'E2E03', inr(8000));
    const app = await ui('manager');

    await app.inbox.open('/manager/inbox');
    await expect(app.inbox.row(claim.claim_no)).toBeVisible();
    await app.inbox.row(claim.claim_no).click();
    await expect(app.page).toHaveURL(new RegExp(`/manager/claims/${claim.id}`));

    await app.review.approveButton().click();
    await expect(app.review.toast(/approved/i)).toBeVisible();
    await expect.poll(async () => (await employee.claims.get(claim.id)).status).toBe(STATUS.approved);
  });

  test('UX-02 reject needs a comment: the confirm button stays disabled until one is typed @regression @ui', async ({ as, ui }) => {
    await describeTest({ epic: 'Approvals', feature: 'Review screen', severity: 'critical', ref: 'AP-04 / ARD 9 approver review' });
    const employee = await as('employee');
    const claim = await submitTravel(employee, 'UX-02', inr(8000));
    const app = await ui('manager');
    await app.review.open('manager', claim.id);

    await app.review.rejectButton().click();
    const confirm = app.review.decisionDialog().getByRole('button', { name: 'Reject claim' });
    await expect(confirm).toBeDisabled();
    await app.review.decisionDialog().getByLabel('Comment (required)').fill('Not a business expense');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect.poll(async () => (await employee.claims.get(claim.id)).status).toBe(STATUS.rejected);
  });

  test('E2E06 the manager sends a claim back; the employee fixes it in the UI and resubmits: a new round starts @regression @e2e @ui', async ({ as, ui }) => {
    await describeTest({ epic: 'Approvals', feature: 'Send back and resubmit', severity: 'critical', ref: 'E2E06' });
    const employee = await as('employee');
    const claim = await submitTravel(employee, 'E2E06', inr(8000));

    const manager = await ui('manager');
    await manager.review.open('manager', claim.id);
    await manager.review.decideWithComment('sendback', 'Please attach the right invoice');
    await expect.poll(async () => (await employee.claims.get(claim.id)).status).toBe(STATUS.sentBack);

    const emp = await ui('employee');
    await emp.capture.openClaim(claim.id);
    await expect(emp.page.getByText('This claim was sent back to you')).toBeVisible();
    await emp.capture.amountField(1).fill('7500');
    await emp.capture.submit();

    const after = await employee.claims.get(claim.id);
    expect(after.status).toBe(STATUS.pendingManager);
    expect(after.round).toBeGreaterThan(1);
  });

  test('UX-05 the review screen shows the lines, the chain and the keyboard shortcut for approve @regression @ui', async ({ as, ui }) => {
    await describeTest({ epic: 'Approvals', feature: 'Review screen', severity: 'normal', ref: 'ARD 9 keyboard shortcuts' });
    const employee = await as('employee');
    const claim = await submitTravel(employee, 'UX-05', inr(8000));
    const app = await ui('manager');
    await app.review.open('manager', claim.id);
    await expect(app.review.heading()).toContainText('UX-05');
    await expect(app.review.lineItems()).toBeVisible();
    await expect(app.review.approvalChain()).toBeVisible();

    await app.review.press('a');
    await expect.poll(async () => (await employee.claims.get(claim.id)).status, 'pressing A approves').toBe(STATUS.approved);
  });

  test('UX-06 someone who is not the assigned approver sees a read-only banner, not the action buttons @regression @ui @security', async ({ as, ui }) => {
    await describeTest({ epic: 'Approvals', feature: 'Review screen', severity: 'critical', ref: 'ARD 3 / C2' });
    const employee = await as('employee');
    const claim = await submitTravel(employee, 'UX-06', inr(30000));
    const manager = await as('manager');
    await manager.approvals.decide(claim.id, 'approve'); // now waiting for the auditor

    const app = await ui('manager');
    await app.review.open('manager', claim.id);
    await expect(app.review.approveButton()).toHaveCount(0);
    await expect(app.review.cannotActBanner()).toBeVisible();
  });

  test('E2E10 an employee opening another employee\'s claim sees "not found" @regression @e2e @ui @security', async ({ as, ui }) => {
    await describeTest({ epic: 'Security', feature: 'Visibility', severity: 'blocker', ref: 'E2E10' });
    const owner = await as('employee');
    const claim = await submitTravel(owner, 'E2E10', inr(8000));
    const app = await ui('employee2');
    await app.capture.openClaim(claim.id);
    await expect(app.page.getByText(/not found|not yours to see/i).first()).toBeVisible();
    await expect(app.page.getByText(claim.title)).toHaveCount(0);
  });
});

test.describe('Auditor queue', () => {
  test('UX-03 the duplicate cannot be ticked for bulk approve; the clean claim is approved in one click @regression @e2e @ui', async ({ as, ui }) => {
    await describeTest({ epic: 'Auditor queue', feature: 'Bulk approve UI', severity: 'critical', ref: 'E2E08 / C10' });
    const [employee, manager] = [await as('employee'), await as('manager')];
    const { duplicate, clean } = await duplicatePairAtAuditor(employee, manager);

    const app = await ui('auditor');
    await app.queue.open();
    await app.queue.find(clean.claim_no);
    await expect(app.queue.row(clean.claim_no)).toBeVisible();
    await app.queue.find(duplicate.claim_no);
    await expect(app.queue.checkbox(duplicate.claim_no), 'high-severity flags block bulk approve').toBeDisabled();
    await expect(app.queue.row(duplicate.claim_no).getByText('Duplicate')).toBeVisible();

    await app.queue.find(clean.claim_no);
    await app.queue.select([clean.claim_no]);
    await app.queue.bulkApprove(1);
    await expect(app.queue.toast(/1 approved/i)).toBeVisible();
    await expect.poll(async () => (await employee.claims.get(clean.id)).status).toBe(STATUS.approved);
    expect((await employee.claims.get(duplicate.id)).status).toBe(STATUS.pendingAuditor);
  });

  test('UX-07 the Duplicates screen lists only claims flagged as duplicates @regression @ui', async ({ as, ui }) => {
    await describeTest({ epic: 'Auditor queue', feature: 'Duplicates', severity: 'normal', ref: 'ARD 9' });
    const [employee, manager] = [await as('employee'), await as('manager')];
    const { duplicate, clean } = await duplicatePairAtAuditor(employee, manager);
    const app = await ui('auditor');
    await app.queue.open('/auditor/duplicates');
    await app.queue.find(duplicate.claim_no);
    await app.queue.search().fill(clean.claim_no);
    await expect(app.queue.row(clean.claim_no)).toHaveCount(0);
  });
});
