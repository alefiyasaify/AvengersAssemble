import { expect } from '@playwright/test';
import { STATUS } from '../../config/environments';
import { parseBankFile } from '../data/bank-file';
import { inr } from '../data/money';
import { submitTravel } from '../data/scenarios';
import { Given, Then, When } from './bdd';
import { roleOf } from './claims.steps';

// ---------- payouts ----------

Given('{int} payable claim(s) is/are selected for payout', async ({ as, world }, count: number) => {
  const picked = (await (await as('head')).payouts.eligible()).slice(0, count);
  expect(picked.length, 'the seed should leave payable claims').toBe(count);
  world.batchClaimIds = picked.map((c) => c.claim_id);
  world.batchTotalPaise = picked.reduce((sum, c) => sum + c.payable_paise, 0);
});

When('the finance head creates a payout batch', async ({ as, world }) => {
  world.batch = await (await as('head')).payouts.createBatch(world.batchClaimIds);
  const head = await as('head');
  const batchId = world.batch.id;
  world.onCleanup(async () => {
    const current = await head.payouts.getRaw(batchId);
    if (['DRAFT', 'VERIFIED'].includes(current.body?.status)) await head.payouts.cancelRaw(batchId);
  });
});

When('the auditor verifies the batch', async ({ as, world }) => {
  world.batch = await (await as('auditor')).payouts.verify(world.batch!.id);
});

When('the finance head exports the batch', async ({ as, world }) => {
  const head = await as('head');
  world.batch = await head.payouts.export(world.batch!.id);
  world.csv = await head.payouts.file(world.batch.id);
});

When('the finance head marks the batch as paid', async ({ as, world }) => {
  world.batch = await (await as('head')).payouts.markPaid(world.batch!.id);
});

When('the finance head tries to verify the batch they created', async ({ as, world }) => {
  world.response = await (await as('head')).payouts.verifyRaw(world.batch!.id);
});

When('the finance head tries to export the unverified batch', async ({ as, world }) => {
  world.response = await (await as('head')).payouts.exportRaw(world.batch!.id);
});

When('the finance head tries to mark the batch as paid again', async ({ as, world }) => {
  world.response = await (await as('head')).payouts.markPaidRaw(world.batch!.id);
});

When('the finance head cancels the batch', async ({ as, world }) => {
  world.response = await (await as('head')).payouts.cancelRaw(world.batch!.id);
});

When('the {person} tries to create a payout batch', async ({ as, world }, who: string) => {
  world.response = await (await as(roleOf(who))).payouts.createBatchRaw(world.batchClaimIds);
});

Then('the batch status is {string}', async ({ world }, status: string) => {
  expect(world.batch?.status).toBe(status);
});

Then('the batch total equals the sum of its claims', async ({ world }) => {
  expect(world.batch?.total_paise).toBe(world.batchTotalPaise);
});

Then('the verifier is not the creator of the batch', async ({ world }) => {
  expect(world.batch?.verified_by_id).toBeTruthy();
  expect(world.batch?.verified_by_id).not.toBe(world.batch?.created_by_id);
});

Then('the bank file has one detail row per claim', async ({ world }) => {
  expect(parseBankFile(world.csv).details).toHaveLength(world.batchClaimIds.length);
});

Then('the bank file trailer total equals the batch total', async ({ world }) => {
  const csv = parseBankFile(world.csv);
  expect(csv.trailerTotalPaise).toBe(world.batchTotalPaise);
  expect(csv.detailTotalPaise).toBe(csv.trailerTotalPaise);
  expect(csv.trailerCount).toBe(world.batchClaimIds.length);
});

Then('every claim in the batch is paid', async ({ as, world }) => {
  const head = await as('head');
  for (const id of world.batchClaimIds) expect((await head.claims.get(id)).status).toBe(STATUS.paid);
});

Then('the claim returns to the payable list', async ({ as, world }) => {
  expect(await (await as('head')).payouts.isEligible(world.batchClaimIds[0])).toBe(true);
});

Then('the claim is not offered for payout again', async ({ as, world }) => {
  expect(await (await as('head')).payouts.isEligible(world.batchClaimIds[0])).toBe(false);
});

Then('the {person} cannot list payable claims', async ({ as }, who: string) => {
  expect((await (await as(roleOf(who))).payouts.eligibleRaw()).status).toBe(403);
});

// ---------- security ----------

When('the {person} opens the claim', async ({ as, world }, who: string) => {
  world.response = await (await as(roleOf(who))).claims.getRaw(world.claim.id);
});

When('the {person} opens the receipt of the claim', async ({ as, world }, who: string) => {
  world.response = await (await as(roleOf(who))).claims.receiptFileRaw(world.claim.lines[0].receipt!.id);
});

When('the {person} reads the audit timeline of the claim', async ({ as, world }, who: string) => {
  world.response = await (await as(roleOf(who))).http.get(`/api/v1/claims/${world.claim.id}/timeline`);
});

When('the {person} calls the approval step directly with approve', async ({ as, world }, who: string) => {
  world.response = await (await as(roleOf(who))).approvals.actRaw(world.claim.current_step!.id, 'approve', { expected_version: world.claim.version });
});

When('{person} requests {string}', async ({ as, anonymous, world }, who: string, path: string) => {
  const http = who === 'anonymous' ? await anonymous() : (await as(roleOf(who))).http;
  world.response = await http.get(path);
});

When('the finance head tries to delete the audit timeline of the claim', async ({ as, world }) => {
  world.response = await (await as('head')).http.request('DELETE', `/api/v1/claims/${world.claim.id}/timeline`);
});

Then('the response status is {int}', async ({ world }, status: number) => {
  expect(world.response?.status).toBe(status);
});

Then('the response is not found, never forbidden', async ({ world }) => {
  expect(world.response?.status).toBe(404);
});

Then('the audit timeline has at least {int} entries naming who acted', async ({ as, world }, count: number) => {
  const timeline = await (await as('employee')).claims.timeline(world.claim.id);
  expect(timeline.length).toBeGreaterThanOrEqual(count);
  for (const entry of timeline) expect(entry.actor_name).not.toBe('');
});

Then('the audit timeline mentions {string}', async ({ as, world }, word: string) => {
  const actions = (await (await as('employee')).claims.timeline(world.claim.id)).map((t) => t.action).join(' ');
  expect(actions).toMatch(new RegExp(word, 'i'));
});

Then('the earlier audit entries are unchanged', async ({ as, world }) => {
  const before = JSON.parse(world.title || '[]');
  const after = await (await as('employee')).claims.timeline(world.claim.id);
  expect(after.length).toBeGreaterThan(before.length);
  expect(after.slice(0, before.length)).toEqual(before);
});

Given('the audit timeline of the claim is noted', async ({ as, world }) => {
  world.title = JSON.stringify(await (await as('employee')).claims.timeline(world.claim.id));
});

Given('another employee has submitted a travel claim of {float} INR', async ({ as, world }, amount: number) => {
  world.claim = await submitTravel(await as('employee2'), 'BDD other', inr(amount));
});

