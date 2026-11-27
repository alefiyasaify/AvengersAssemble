import { expect } from '@playwright/test';
import { Role, STATUS, getEnv } from '../../config/environments';
import { LineInput } from '../api/types';
import { isolatedDate } from '../data/dates';
import { claimTitle, line } from '../data/factories';
import { inr } from '../data/money';
import { newReceipt } from '../data/receipts';
import { findings, submitTravel } from '../data/scenarios';
import { Given, Then, When } from './bdd';

const env = getEnv();

/** Status names used in the feature files, as the product shows them. */
export const STATUS_BY_NAME: Record<string, string> = {
  draft: STATUS.draft,
  'with manager': STATUS.pendingManager,
  'with auditor': STATUS.pendingAuditor,
  'with finance head': STATUS.pendingHead,
  'sent back': STATUS.sentBack,
  approved: STATUS.approved,
  rejected: STATUS.rejected,
  withdrawn: STATUS.withdrawn,
  paid: STATUS.paid,
};
export const statusOf = (name: string): string => {
  const status = STATUS_BY_NAME[name.toLowerCase()];
  if (!status) throw new Error(`Unknown claim status "${name}". Use one of: ${Object.keys(STATUS_BY_NAME).join(', ')}`);
  return status;
};

export const roleOf = (name: string): Role => {
  const map: Record<string, Role> = {
    employee: 'employee', 'other employee': 'employee2', manager: 'manager', 'other manager': 'manager2',
    delegate: 'delegate', auditor: 'auditor', 'finance head': 'head', head: 'head',
  };
  const role = map[name.toLowerCase()];
  if (!role) throw new Error(`Unknown person "${name}". Use one of: ${Object.keys(map).join(', ')}`);
  return role;
};

type Kind = 'meals' | 'cab' | 'travel' | 'other';
const simple = (kind: Kind, paise: number, receipt: boolean, date?: string): LineInput =>
  line[kind](paise, { receipt: receipt ? undefined : null, date });

// ---------- creating claims ----------

When('the employee submits a {word} expense of {float} INR', async ({ as, world }, kind: Kind, amount: number) => {
  world.claim = await (await as('employee')).claims.createAndSubmit(claimTitle(`BDD ${kind}`), [simple(kind, inr(amount), true)]);
});

When('the employee submits a {word} expense of {float} INR without a receipt', async ({ as, world }, kind: Kind, amount: number) => {
  world.claim = await (await as('employee')).claims.createAndSubmit(claimTitle(`BDD ${kind}`), [simple(kind, inr(amount), false)]);
});

When('the employee submits a {word} expense of {float} INR on a Saturday', async ({ as, world }, kind: Kind, amount: number) => {
  world.claim = await (await as('employee')).claims.createAndSubmit(claimTitle(`BDD ${kind}`), [simple(kind, inr(amount), true, isolatedDate('saturday'))]);
});

When(
  'the employee submits a hotel stay of {float} INR for {int} nights in a {word} city',
  async ({ as, world }, amount: number, nights: number, tier: string) => {
    const city = tier === 'tier-1' ? env.cities.tier1 : env.cities.other;
    world.claim = await (await as('employee')).claims.createAndSubmit(claimTitle('BDD hotel'), [line.hotel(inr(amount), nights, { city })]);
  },
);

When('the employee submits two meals expenses of {float} INR each on the same day', async ({ as, world }, amount: number) => {
  const date = isolatedDate();
  world.claim = await (await as('employee')).claims.createAndSubmit(claimTitle('BDD meals x2'), [
    line.meals(inr(amount), { date }),
    line.meals(inr(amount), { date }),
  ]);
});

When(
  'the employee submits a meals expense of {float} INR and a travel expense of {float} INR',
  async ({ as, world }, meals: number, travel: number) => {
    world.claim = await (await as('employee')).claims.createAndSubmit(claimTitle('BDD mixed'), [line.meals(inr(meals)), line.travel(inr(travel))]);
  },
);

Given('the employee has submitted a travel claim of {float} INR', async ({ as, world }, amount: number) => {
  world.claim = await submitTravel(await as('employee'), 'BDD', inr(amount));
});

Given('the manager has submitted a travel claim of {float} INR', async ({ as, world }, amount: number) => {
  world.claim = await submitTravel(await as('manager'), 'BDD manager own', inr(amount));
});

Given('the employee has saved a draft with a travel expense of {float} INR', async ({ as, world }, amount: number) => {
  world.claim = await (await as('employee')).claims.createDraft(claimTitle('BDD draft'), [line.travel(inr(amount))]);
});

When('the employee submits the draft', async ({ as, world }) => {
  world.claim = await (await as('employee')).claims.submit(world.claim.id);
});

When('the employee withdraws the claim', async ({ as, world }) => {
  world.claim = await (await as('employee')).claims.withdraw(world.claim.id);
});

When('the employee edits the line to {float} INR and resubmits', async ({ as, world }, amount: number) => {
  const employee = await as('employee');
  await employee.claims.editLineAmount(world.claim.id, world.claim.lines[0].id, inr(amount));
  world.claim = await employee.claims.resubmit(world.claim.id);
});

Given('the employee has submitted the same vendor, amount and date twice', async ({ as, world }) => {
  const employee = await as('employee');
  const date = isolatedDate();
  const vendor = `BDD Vendor ${Date.now()}`;
  await employee.claims.createAndSubmit(claimTitle('BDD dup first'), [line.other(inr(1200), { vendor, date })]);
  world.claim = await employee.claims.createAndSubmit(claimTitle('BDD dup second'), [line.other(inr(1200), { vendor: ` ${vendor.toUpperCase()} `, date })]);
});

Given('the employee has submitted the same receipt file on two claims', async ({ as, world }) => {
  const employee = await as('employee');
  const file = newReceipt();
  await employee.claims.createAndSubmit(claimTitle('BDD receipt first'), [line.other(inr(900), { receipt: file })]);
  world.claim = await employee.claims.createAndSubmit(claimTitle('BDD receipt second'), [line.other(inr(1300), { receipt: file })]);
});

// ---------- checking claims ----------

Then('the claim status is {string}', async ({ world }, name: string) => {
  expect(world.claim.status).toBe(statusOf(name));
});

Then('the claim is rejected because of {string}', async ({ world }, rule: string) => {
  expect(world.claim.status).toBe(STATUS.rejected);
  expect(findings(world.claim, rule).length, `a ${rule} finding`).toBeGreaterThan(0);
  expect(world.claim.rejection_reasons.length, 'the employee is told why').toBeGreaterThan(0);
});

Then('the claim is auto-approved', async ({ world }) => {
  expect(world.claim.status).toBe(STATUS.approved);
  expect(world.claim.auto_approved).toBe(true);
});

Then('the {string} rule rejects the line', async ({ world }, rule: string) => {
  const rejects = findings(world.claim, rule).filter((f) => f.outcome === 'REJECT');
  expect(rejects.length, `${rule} should reject`).toBeGreaterThan(0);
  expect(rejects[0].reason, 'a reason is shown to the employee').not.toBe('');
});

Then('the {string} rule does not reject the line', async ({ world }, rule: string) => {
  expect(findings(world.claim, rule).filter((f) => f.outcome === 'REJECT')).toHaveLength(0);
});

Then('the claim has a {string} finding with outcome {string}', async ({ world }, rule: string, outcome: string) => {
  const found = findings(world.claim, rule);
  expect(found.length, `a ${rule} finding`).toBeGreaterThan(0);
  expect(found[0].outcome).toBe(outcome);
});

Then('the claim has no {string} finding', async ({ world }, rule: string) => {
  expect(findings(world.claim, rule)).toHaveLength(0);
});

Then('the payable total is {float} INR', async ({ world }, amount: number) => {
  expect(world.claim.payable_paise).toBe(inr(amount));
});

Then('the total is {float} INR', async ({ world }, amount: number) => {
  expect(world.claim.total_paise).toBe(inr(amount));
});

Then('exactly {int} line(s) is/are rejected by policy', async ({ world }, count: number) => {
  expect(world.claim.lines.filter((l) => l.status === STATUS.lineAutoRejected)).toHaveLength(count);
});

Then('the approval levels required are {string}', async ({ world }, levels: string) => {
  expect(world.claim.required_levels.join(',')).toBe(levels);
});

Then('the claim can no longer be edited', async ({ as, world }) => {
  const res = await (await as('employee')).claims.patchLineRaw(world.claim.id, world.claim.lines[0].id, world.claim.version, { amount_paise: 100 });
  expect(res.status).toBe(409);
});
