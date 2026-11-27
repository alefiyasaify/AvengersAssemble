import { expect } from '@playwright/test';
import { STATUS, getEnv } from '../../config/environments';
import { approvedLevels, duplicatePairAtAuditor } from '../data/scenarios';
import { Given, Then, When } from './bdd';
import { roleOf, statusOf } from './claims.steps';

const env = getEnv();

// ---------- decisions ----------

When('the {person} approves the claim', async ({ as, world }, who: string) => {
  world.claim = await (await as(roleOf(who))).approvals.decide(world.claim.id, 'approve', `${who} approves`);
});

When('the {person} sends the claim back with the comment {string}', async ({ as, world }, who: string, comment: string) => {
  world.claim = await (await as(roleOf(who))).approvals.decide(world.claim.id, 'send-back', comment);
});

When('the {person} rejects the claim with the comment {string}', async ({ as, world }, who: string, comment: string) => {
  world.claim = await (await as(roleOf(who))).approvals.decide(world.claim.id, 'reject', comment);
});

When('the {person} tries to reject the claim without a comment', async ({ as, world }, who: string) => {
  world.response = await (await as(roleOf(who))).approvals.decideRaw(world.claim.id, 'reject');
});

When('the {person} tries to send the claim back without a comment', async ({ as, world }, who: string) => {
  world.response = await (await as(roleOf(who))).approvals.decideRaw(world.claim.id, 'send-back');
});

When('the {person} tries to approve the claim', async ({ as, world }, who: string) => {
  world.response = await (await as(roleOf(who))).approvals.decideRaw(world.claim.id, 'approve').catch(() => ({ status: 404 }) as never);
});

When('the {person} approves the claim with a stale version', async ({ as, world }, who: string) => {
  world.response = await (await as(roleOf(who))).approvals.actRaw(world.claim.current_step!.id, 'approve', { expected_version: world.claim.version + 5 });
});

When('two approvals of the same step arrive at the same moment', async ({ as, world }) => {
  const manager = await as('manager');
  const body = { comment: 'race', expected_version: world.claim.version };
  const stepId = world.claim.current_step!.id;
  const [a, b] = await Promise.all([manager.approvals.actRaw(stepId, 'approve', body), manager.approvals.actRaw(stepId, 'approve', body)]);
  world.response = [a, b].find((r) => !r.ok) ?? a;
  expect([a, b].filter((r) => r.ok), 'exactly one approval succeeds').toHaveLength(1);
});

Then('the request is refused with status {int}', async ({ world }, status: number) => {
  expect(world.response?.status).toBe(status);
});

Then('the request is refused', async ({ world }) => {
  expect([400, 403, 404, 409], `status ${world.response?.status}`).toContain(world.response?.status);
});

Then('the error code is {string}', async ({ world }, code: string) => {
  expect(world.response?.body).toMatchObject({ error: { code } });
});

Then('the claim is still {string}', async ({ as, world }, name: string) => {
  // The finance head can read every claim, so this also works for a manager's own claim.
  world.claim = await (await as('head')).claims.get(world.claim.id);
  expect(world.claim.status).toBe(statusOf(name));
});

Then('the approval step is not assigned to the manager who filed the claim', async ({ as, world }) => {
  const me = await (await as('manager')).me();
  expect(world.claim.current_step?.assigned_to).not.toBe(me.id);
});

Then('the open step is level {int}', async ({ world }, level: number) => {
  expect(world.claim.current_step?.level_no).toBe(level);
});

Then('the approvals of the current round are levels {string}', async ({ world }, levels: string) => {
  expect(approvedLevels(world.claim).join(',')).toBe(levels);
});

Then('the claim is in a new approval round', async ({ world }) => {
  expect(world.claim.round).toBeGreaterThan(1);
});

// ---------- delegation ----------

Given('the manager has delegated level {int} to the delegate', async ({ as, world }, level: number) => {
  const [manager, delegate] = [await as('manager'), await as('delegate')];
  await manager.delegations.clear();
  const d = await manager.delegations.create((await delegate.me()).id, level);
  world.onCleanup(() => manager.delegations.remove(d.id));
});

Given('the manager delegated level {int} to the delegate and then revoked it', async ({ as }, level: number) => {
  const [manager, delegate] = [await as('manager'), await as('delegate')];
  await manager.delegations.clear();
  const d = await manager.delegations.create((await delegate.me()).id, level);
  await manager.delegations.remove(d.id);
});

When('the manager tries to delegate for {int} days', async ({ as, world }, days: number) => {
  const [manager, delegate] = [await as('manager'), await as('delegate')];
  const now = Date.now();
  world.response = await manager.delegations.createRaw((await delegate.me()).id, 1, new Date(now - 60_000), new Date(now + days * 86_400_000));
});

When('the manager tries to delegate to themselves', async ({ as, world }) => {
  const manager = await as('manager');
  const now = Date.now();
  world.response = await manager.delegations.createRaw((await manager.me()).id, 1, new Date(now - 60_000), new Date(now + 2 * 86_400_000));
});

Then('the delegate sees the claim in their inbox', async ({ as, world }) => {
  expect(await (await as('delegate')).approvals.inboxClaimIds()).toContain(world.claim.id);
});

Then('the delegate does not see the claim in their inbox', async ({ as, world }) => {
  expect(await (await as('delegate')).approvals.inboxClaimIds()).not.toContain(world.claim.id);
});

Then('the approved step shows the delegate acting on behalf of the manager', async ({ world }) => {
  const step = world.claim.steps.find((s) => s.status === 'APPROVED')!;
  expect(step.acted_by_name).toBe(env.personas.delegate!.name);
  expect(step.on_behalf_of_name).toBe(env.personas.manager!.name);
});

Then('the audit timeline shows the delegate acting on behalf of the manager', async ({ as, world }) => {
  const timeline = await (await as('employee')).claims.timeline(world.claim.id);
  const entry = timeline.find((t) => t.on_behalf_of_name === env.personas.manager!.name);
  expect(entry?.actor_name).toBe(env.personas.delegate!.name);
});

// ---------- the auditor queue ----------

Given('two claims of 30,000 INR wait at the auditor: one duplicate and one clean', async ({ as, world }) => {
  const pair = await duplicatePairAtAuditor(await as('employee'), await as('manager'));
  world.claims.set('duplicate', pair.duplicate);
  world.claims.set('clean', pair.clean);
  world.claim = pair.clean;
});

When('the auditor bulk approves both claims', async ({ as, world }) => {
  const [d, c] = [world.claims.get('duplicate')!, world.claims.get('clean')!];
  const res = await (await as('auditor')).review.bulkApproveRaw([
    { claim_id: d.id, expected_version: d.version },
    { claim_id: c.id, expected_version: c.version },
  ]);
  expect(res.status).toBe(200);
  world.bulk = res.body;
});

When('the auditor bulk approves the clean claim with a stale version', async ({ as, world }) => {
  const c = world.claims.get('clean')!;
  const res = await (await as('auditor')).review.bulkApproveRaw([{ claim_id: c.id, expected_version: c.version + 9 }]);
  world.bulk = res.body;
});

Then('the duplicate claim is skipped with a reason', async ({ world }) => {
  const result = world.bulk!.results.find((r) => r.claim_id === world.claims.get('duplicate')!.id)!;
  expect(result.result).toBe('SKIPPED');
  expect(result.reason).toBeTruthy();
});

Then('the clean claim is approved', async ({ as, world }) => {
  const result = world.bulk!.results.find((r) => r.claim_id === world.claims.get('clean')!.id)!;
  expect(result.result).toBe('APPROVED');
  expect((await (await as('employee')).claims.get(world.claims.get('clean')!.id)).status).toBe(STATUS.approved);
});

Then('the duplicate claim still waits for the auditor', async ({ as, world }) => {
  expect((await (await as('employee')).claims.get(world.claims.get('duplicate')!.id)).status).toBe(STATUS.pendingAuditor);
});

Then('nothing is approved', async ({ as, world }) => {
  expect(world.bulk!.approved).toBe(0);
  expect((await (await as('employee')).claims.get(world.claims.get('clean')!.id)).status).toBe(STATUS.pendingAuditor);
});

Then('the review queue lists the clean claim', async ({ as, world }) => {
  const res = await (await as('auditor')).review.queueRaw({ q: world.claims.get('clean')!.claim_no });
  expect(res.body.items.map((c) => c.id)).toContain(world.claims.get('clean')!.id);
});

Then('the duplicate filter lists the duplicate claim but not the clean claim', async ({ as, world }) => {
  const auditor = await as('auditor');
  const dup = world.claims.get('duplicate')!;
  const clean = world.claims.get('clean')!;
  expect((await auditor.review.queueRaw({ flag: 'DUPLICATE_LINE', q: dup.claim_no })).body.items.map((c) => c.id)).toContain(dup.id);
  expect((await auditor.review.queueRaw({ flag: 'DUPLICATE_LINE', q: clean.claim_no })).body.items.map((c) => c.id)).not.toContain(clean.id);
});

