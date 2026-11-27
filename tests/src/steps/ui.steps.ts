import { expect } from '@playwright/test';
import { LineInput } from '../api/types';
import { isolatedDate } from '../data/dates';
import { claimTitle, line } from '../data/factories';
import { inr } from '../data/money';
import { ROLE_HOME } from '../pages/login.page';
import { Given, Then, When } from './bdd';
import { roleOf, statusOf } from './claims.steps';

const homeKey = (who: string): string => roleOf(who).replace('2', '');
const lineFor = (kind: string, amount: number, description: string): LineInput => {
  const make = { meals: line.meals, cab: line.cab, travel: line.travel, other: line.other } as Record<string, typeof line.meals>;
  if (!make[kind]) throw new Error(`Unknown expense kind "${kind}"`);
  return make[kind](inr(amount), { date: isolatedDate(), description });
};

// ---------- sign-in ----------

Given('a visitor is on the sign-in page', async ({ guest, world }) => {
  world.app = await guest();
  await world.app.login.open();
});

When('the visitor signs in as the {person}', async ({ as, env, world }, who: string) => {
  const role = roleOf(who);
  await as(role); // makes sure a provisioned user exists
  await world.browser.login.fillAndSubmit(env.personas[role]!.email, env.personas[role]!.password);
});

When('the visitor submits the sign-in form with email {string} and password {string}', async ({ world }, email: string, password: string) => {
  await world.browser.login.fillAndSubmit(email, password);
});

When('the visitor submits the empty sign-in form', async ({ world }) => {
  await world.browser.login.submitButton().click();
});

When('the visitor opens {string}', async ({ guest, world }, path: string) => {
  world.app = await guest();
  await world.app.page.goto(path);
});

Then('the {person} home screen is shown', async ({ world }, who: string) => {
  await expect(world.browser.page).toHaveURL(ROLE_HOME[homeKey(who)]);
});

Then('the sign-in page shows email, password and a sign-in button', async ({ world }) => {
  const { login } = world.browser;
  await expect(login.heading()).toBeVisible();
  await expect(login.email()).toBeVisible();
  await expect(login.password()).toBeVisible();
  await expect(login.submitButton()).toBeEnabled();
});

Then('the sign-in page shows the message {string}', async ({ world }, text: string) => {
  await expect(world.browser.login.error(text)).toBeVisible();
});

Then('an error banner is shown on the sign-in page', async ({ world }) => {
  await expect(world.browser.page.getByRole('alert')).toBeVisible();
  await expect(world.browser.login.heading()).toBeVisible();
});

Then('the sign-in page is shown', async ({ world }) => {
  await expect(world.browser.login.heading()).toBeVisible();
});

// ---------- browser sessions ----------

Given('the {person} is signed in to the browser', async ({ ui, world }, who: string) => {
  world.app = await ui(roleOf(who));
});

When('the signed-in {person} opens {string}', async ({ world }, _who: string, path: string) => {
  await world.browser.page.goto(path);
});

Then('the page is not {string}', async ({ world }, path: string) => {
  await expect(world.browser.page).not.toHaveURL(new RegExp(path));
});

// ---------- claim form ----------

When('the employee starts a new claim titled {string}', async ({ world }, label: string) => {
  world.title = claimTitle(label);
  await world.browser.capture.open();
  await world.browser.capture.setTitle(world.title);
  world.lineCount = 0;
});

When('the employee fills line {int} with a {word} expense of {float} INR for {string}', async ({ world }, index: number, kind: string, amount: number, why: string) => {
  await world.browser.capture.fillLine(index, lineFor(kind, amount, why));
  world.lineCount = Math.max(world.lineCount, index);
});

When('the employee adds line {int} with a {word} expense of {float} INR for {string}', async ({ world }, index: number, kind: string, amount: number, why: string) => {
  await world.browser.capture.addLine(lineFor(kind, amount, why), index);
  world.lineCount = Math.max(world.lineCount, index);
});

When('the employee fills line 1 with a hotel stay of {float} INR for {int} nights in a {word} city', async ({ world, env }, amount: number, nights: number, tier: string) => {
  const city = tier === 'tier-1' ? env.cities.tier1 : env.cities.other;
  await world.browser.capture.fillLine(1, line.hotel(inr(amount), nights, { city, date: isolatedDate() }));
});

When('the employee saves the draft', async ({ world }) => {
  world.claimId = await world.browser.capture.saveDraft();
});

When('the employee reloads the page', async ({ world }) => {
  await world.browser.page.reload();
});

When('the employee opens the review step', async ({ world }) => {
  await world.browser.capture.reviewButton().click();
  await expect(world.browser.capture.reviewModal()).toBeVisible();
});

When('the employee tries to review the claim', async ({ world }) => {
  await world.browser.capture.reviewButton().click();
});

When('the employee confirms the submission', async ({ world }) => {
  await world.browser.capture.reviewModal().getByRole('button', { name: /^(Resubmit|Submit) claim$/ }).click();
  await world.browser.page.waitForURL(/\/employee\/claims$/);
});

When('the employee reviews and submits the claim', async ({ world }) => {
  await world.browser.capture.submit();
});

When('the {person} opens the claim in the browser', async ({ world }, _who: string) => {
  await world.browser.capture.openClaim(world.claim.id);
});

When('the employee changes the amount of line 1 to {float} INR in the browser', async ({ world }, amount: number) => {
  await world.browser.capture.amountField(1).fill(String(amount));
});

When('the employee withdraws the claim in the browser', async ({ world }) => {
  await world.browser.page.getByRole('button', { name: 'Withdraw claim' }).click();
  await world.browser.page.getByRole('dialog').getByRole('button', { name: 'Withdraw' }).click();
});

Then('the claim title field still shows the title', async ({ world }) => {
  await expect(world.browser.capture.title()).toHaveValue(world.title);
  await expect(world.browser.capture.lineCards()).toHaveCount(1);
});

Then('the review step shows {string}', async ({ world }, text: string) => {
  await expect(world.browser.capture.reviewModal().getByText(text).first()).toBeVisible();
});

Then('the review button is disabled', async ({ world }) => {
  await expect(world.browser.capture.reviewButton()).toBeDisabled();
});

Then('the form says a line is missing details', async ({ world }) => {
  await expect(world.browser.page.getByText(/is missing/i).first()).toBeVisible();
});

Then('the live policy check mentions {string}', async ({ world }, text: string) => {
  await expect(world.browser.capture.advisory(text)).toBeVisible();
});

Then('line 1 asks for a city', async ({ world }) => {
  await expect(world.browser.capture.lineCard(1).getByLabel('City')).toBeVisible();
});

Then('the claim titled in this scenario has the status {string}', async ({ as, world }, name: string) => {
  const employee = await as('employee');
  await expect
    .poll(async () => (await employee.claims.list({ q: world.title })).body.items.find((c) => c.title === world.title)?.status)
    .toBe(statusOf(name));
});

Then('the saved draft has the status {string}', async ({ as, world }, name: string) => {
  expect((await (await as('employee')).claims.get(world.claimId)).status).toBe(statusOf(name));
});

Then('the claim in the system eventually has the status {string}', async ({ as, world }, name: string) => {
  const employee = await as('employee');
  await expect.poll(async () => (await employee.claims.get(world.claim.id)).status).toBe(statusOf(name));
});

Then('the claim is in round {int} or later', async ({ as, world }, round: number) => {
  expect((await (await as('employee')).claims.get(world.claim.id)).round).toBeGreaterThanOrEqual(round);
});

Then('the page says the claim was sent back', async ({ world }) => {
  await expect(world.browser.page.getByText('This claim was sent back to you')).toBeVisible();
});

Then('the page says the claim is not found', async ({ world }) => {
  await expect(world.browser.page.getByText(/not found|not yours to see/i).first()).toBeVisible();
});

Then('the page has no sideways scrolling', async ({ world }) => {
  expect(await world.browser.claims.hasHorizontalScroll(), 'no sideways scrolling').toBe(false);
});

Then('the amount field of line 1 uses the decimal keypad', async ({ world }) => {
  await expect(world.browser.capture.amountField(1)).toHaveAttribute('inputmode', 'decimal');
});

Then('My claims shows its summary', async ({ world }) => {
  await world.browser.claims.open();
  await expect(world.browser.claims.summary()).toBeVisible();
});

// ---------- approver screens ----------

When('the manager opens the claim from the inbox', async ({ world }) => {
  const { inbox, page } = world.browser;
  await inbox.open('/manager/inbox');
  await expect(inbox.row(world.claim.claim_no)).toBeVisible();
  await inbox.row(world.claim.claim_no).click();
  await expect(page).toHaveURL(new RegExp(`/manager/claims/${world.claim.id}`));
});

When('the {person} opens the claim on the review screen', async ({ world }, who: string) => {
  await world.browser.review.open(roleOf(who) === 'head' ? 'head' : (roleOf(who).replace('2', '') as 'manager' | 'auditor'), world.claim.id);
});

When('the manager approves the claim on the review screen', async ({ world }) => {
  await world.browser.review.approveButton().click();
  await expect(world.browser.review.toast(/approved/i)).toBeVisible();
});

When('the manager presses the A key', async ({ world }) => {
  await world.browser.review.press('a');
});

When('the manager starts to reject the claim on the review screen', async ({ world }) => {
  await world.browser.review.rejectButton().click();
});

When('the manager types the comment {string} in the dialog', async ({ world }, comment: string) => {
  await world.browser.review.decisionDialog().getByLabel('Comment (required)').fill(comment);
});

When('the manager confirms the rejection', async ({ world }) => {
  await world.browser.review.decisionDialog().getByRole('button', { name: 'Reject claim' }).click();
});

When('the manager sends the claim back on the review screen with the comment {string}', async ({ world }, comment: string) => {
  await world.browser.review.decideWithComment('sendback', comment);
});

Then('the reject confirmation button is disabled', async ({ world }) => {
  await expect(world.browser.review.decisionDialog().getByRole('button', { name: 'Reject claim' })).toBeDisabled();
});

Then('the reject confirmation button is enabled', async ({ world }) => {
  await expect(world.browser.review.decisionDialog().getByRole('button', { name: 'Reject claim' })).toBeEnabled();
});

Then('the review screen shows the line items and the approval chain', async ({ world }) => {
  await expect(world.browser.review.heading()).toContainText(world.claim.title.split(' ').slice(0, 2).join(' '));
  await expect(world.browser.review.lineItems()).toBeVisible();
  await expect(world.browser.review.approvalChain()).toBeVisible();
});

Then('the review screen offers no approve button', async ({ world }) => {
  await expect(world.browser.review.approveButton()).toHaveCount(0);
});

Then('the review screen shows a read-only notice', async ({ world }) => {
  await expect(world.browser.review.cannotActBanner()).toBeVisible();
});

// ---------- auditor queue ----------

When('the auditor opens the review queue', async ({ world }) => {
  await world.browser.queue.open('/auditor/queue');
});

When('the auditor opens the duplicates screen', async ({ world }) => {
  await world.browser.queue.open('/auditor/duplicates');
});

When('the auditor searches for the {word} claim', async ({ world }, which: string) => {
  await world.browser.queue.find(world.claims.get(which)!.claim_no);
});

When('the auditor ticks the clean claim and approves it in bulk', async ({ world }) => {
  await world.browser.queue.find(world.claims.get('clean')!.claim_no);
  await world.browser.queue.select([world.claims.get('clean')!.claim_no]);
  await world.browser.queue.bulkApprove(1);
});

Then('the duplicate claim cannot be ticked', async ({ world }) => {
  await expect(world.browser.queue.checkbox(world.claims.get('duplicate')!.claim_no)).toBeDisabled();
});

Then('the duplicate claim row shows the {string} flag', async ({ world }, flag: string) => {
  await expect(world.browser.queue.row(world.claims.get('duplicate')!.claim_no).getByText(flag)).toBeVisible();
});

Then('a message says {string}', async ({ world }, text: string) => {
  await expect(world.browser.queue.toast(new RegExp(text, 'i'))).toBeVisible();
});

Then('the clean claim is not listed on the duplicates screen', async ({ world }) => {
  await world.browser.queue.search().fill(world.claims.get('clean')!.claim_no);
  await expect(world.browser.queue.row(world.claims.get('clean')!.claim_no)).toHaveCount(0);
});

Then('the clean claim ends up approved in the system', async ({ as, world }) => {
  const employee = await as('employee');
  const id = world.claims.get('clean')!.id;
  await expect.poll(async () => (await employee.claims.get(id)).status).toBe('APPROVED');
});
