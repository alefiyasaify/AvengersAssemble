import { getEnv, STATUS } from '../../config/environments';
import { LineInput } from '../../src/api/types';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { isolatedDate } from '../../src/data/dates';
import { claimTitle, line, uniqueVendor } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { newReceipt } from '../../src/data/receipts';
import { findings } from '../../src/data/scenarios';

const env = getEnv();

interface RuleCase {
  id: string;
  ref: string;
  title: string;
  rule: string;
  expect: 'breach' | 'pass';
  lines: () => LineInput[];
}

/** Boundary cases: at and just above each limit (ARD 5 and 12). "Up to X" passes at X; "above X" breaches. */
export const CASES: RuleCase[] = [
  { id: 'PE-03a', ref: 'ARD 5 / PE-03', rule: 'MEALS_DAILY_CAP', expect: 'pass', title: 'meals exactly 1,500 INR in a day', lines: () => [line.meals(inr(1500))] },
  { id: 'PE-03b', ref: 'ARD 5 / PE-03', rule: 'MEALS_DAILY_CAP', expect: 'breach', title: 'meals 1,500.01 INR in a day', lines: () => [line.meals(150001)] },
  {
    id: 'PE-03c', ref: 'ARD 5 / PE-03', rule: 'MEALS_DAILY_CAP', expect: 'breach', title: 'two meals lines of 900 INR on one day (sum 1,800)',
    lines: () => { const date = isolatedDate(); return [line.meals(inr(900), { date }), line.meals(inr(900), { date })]; },
  },
  { id: 'PE-04a', ref: 'ARD 5 / PE-04', rule: 'HOTEL_NIGHT_CAP', expect: 'pass', title: 'hotel 6,000 per night in a tier-1 city', lines: () => [line.hotel(inr(12000), 2)] },
  { id: 'PE-04b', ref: 'ARD 5 / PE-04', rule: 'HOTEL_NIGHT_CAP', expect: 'breach', title: 'hotel above 6,000 per night in a tier-1 city', lines: () => [line.hotel(1200002, 2)] },
  { id: 'PE-04c', ref: 'ARD 5 / PE-04', rule: 'HOTEL_NIGHT_CAP', expect: 'pass', title: 'hotel 4,000 per night elsewhere', lines: () => [line.hotel(inr(8000), 2, { city: env.cities.other })] },
  { id: 'PE-04d', ref: 'ARD 5 / PE-04', rule: 'HOTEL_NIGHT_CAP', expect: 'breach', title: 'hotel above 4,000 per night elsewhere', lines: () => [line.hotel(800002, 2, { city: env.cities.other })] },
  { id: 'PE-05a', ref: 'ARD 5 / PE-05', rule: 'CAB_TRIP_CAP', expect: 'pass', title: 'cab trip of exactly 2,000 INR', lines: () => [line.cab(inr(2000))] },
  { id: 'PE-05b', ref: 'ARD 5 / PE-05', rule: 'CAB_TRIP_CAP', expect: 'breach', title: 'cab trip of 2,000.01 INR', lines: () => [line.cab(200001)] },
  { id: 'PE-06a', ref: 'ARD 5 / PE-06', rule: 'RECEIPT_REQUIRED', expect: 'pass', title: '500 INR without a receipt', lines: () => [line.other(inr(500), { receipt: null })] },
  { id: 'PE-06b', ref: 'ARD 5 / PE-06', rule: 'RECEIPT_REQUIRED', expect: 'breach', title: '500.01 INR without a receipt', lines: () => [line.other(50001, { receipt: null })] },
  { id: 'PE-06c', ref: 'ARD 5 / PE-06', rule: 'RECEIPT_REQUIRED', expect: 'pass', title: '5,000 INR with a receipt', lines: () => [line.other(inr(5000))] },
];

test.describe('Policy engine: limits and receipts', () => {
  for (const c of CASES) {
    test(`${c.id} ${c.title} @regression @policy`, async ({ as, log }) => {
      await describeTest({ epic: 'Policy engine', feature: c.rule, story: c.title, severity: 'critical', ref: c.ref });
      const employee = await as('employee');
      const claim = await employee.claims.createAndSubmit(claimTitle(c.id), c.lines());

      const rejects = findings(claim, c.rule).filter((f) => f.outcome === 'REJECT');
      log.info('findings', { rule: c.rule, count: rejects.length });
      if (c.expect === 'breach') {
        expect(rejects.length, `${c.rule} should reject`).toBeGreaterThan(0);
        expect(rejects[0].reason, 'a reason is shown to the employee').not.toBe('');
      } else {
        expect(rejects, `${c.rule} should not reject`).toHaveLength(0);
      }
    });
  }
});

test.describe('Policy engine: duplicates, weekend and claim outcome', () => {
  test('PE-07a same vendor, amount and date is a duplicate (vendor is normalised) @regression @policy', async ({ as }) => {
    await describeTest({ epic: 'Policy engine', feature: 'DUPLICATE_LINE', severity: 'critical', ref: 'ARD 5 / PE-07' });
    const employee = await as('employee');
    const date = isolatedDate();
    const vendor = uniqueVendor('Acme Stores');
    await employee.claims.createAndSubmit(claimTitle('PE-07a first'), [line.other(inr(1200), { vendor, date })]);
    const second = await employee.claims.createAndSubmit(claimTitle('PE-07a second'), [
      line.other(inr(1200), { vendor: `  ${vendor.toUpperCase()}  `, date }),
    ]);
    const dup = findings(second, 'DUPLICATE_LINE');
    expect(dup.length, 'case and spacing must not hide a duplicate').toBeGreaterThan(0);
    expect(dup[0].outcome).toBe('ROUTE');
    expect(second.status, 'a duplicate forces approval').not.toBe(STATUS.approved);
  });

  test("PE-07b a duplicate of another employee's line is also flagged @regression @policy", async ({ as }) => {
    await describeTest({ epic: 'Policy engine', feature: 'DUPLICATE_LINE', severity: 'critical', ref: 'ARD 5 / C6' });
    const [employee, other] = [await as('employee'), await as('employee2')];
    const date = isolatedDate();
    const vendor = uniqueVendor('Shared Vendor');
    await employee.claims.createAndSubmit(claimTitle('PE-07b first'), [line.other(inr(1750), { vendor, date })]);
    const copy = await other.claims.createAndSubmit(claimTitle('PE-07b copy'), [line.other(inr(1750), { vendor, date })]);
    expect(findings(copy, 'DUPLICATE_LINE').length).toBeGreaterThan(0);
  });

  test('PE-08 the same receipt file on another line is flagged even if vendor and date differ @regression @policy', async ({ as }) => {
    await describeTest({ epic: 'Policy engine', feature: 'DUPLICATE_LINE', severity: 'critical', ref: 'ARD 5 / PE-08' });
    const employee = await as('employee');
    const file = newReceipt();
    await employee.claims.createAndSubmit(claimTitle('PE-08 first'), [line.other(inr(900), { receipt: file })]);
    const second = await employee.claims.createAndSubmit(claimTitle('PE-08 second'), [line.other(inr(1300), { receipt: file })]);
    expect(findings(second, 'DUPLICATE_LINE').length).toBeGreaterThan(0);
  });

  test('PE-07c a different amount is not a duplicate @regression @policy', async ({ as }) => {
    await describeTest({ epic: 'Policy engine', feature: 'DUPLICATE_LINE', severity: 'normal', ref: 'ARD 5 / PE-07' });
    const employee = await as('employee');
    const date = isolatedDate();
    const vendor = uniqueVendor('Near Miss');
    await employee.claims.createAndSubmit(claimTitle('PE-07c first'), [line.other(inr(1200), { vendor, date })]);
    const second = await employee.claims.createAndSubmit(claimTitle('PE-07c second'), [line.other(120001, { vendor, date })]);
    expect(findings(second, 'DUPLICATE_LINE')).toHaveLength(0);
  });

  test('PE-09 weekend spend is flagged but not rejected @regression @policy', async ({ as }) => {
    await describeTest({ epic: 'Policy engine', feature: 'WEEKEND_SPEND', severity: 'normal', ref: 'ARD 5 / PE-09' });
    const employee = await as('employee');
    const claim = await employee.claims.createAndSubmit(claimTitle('PE-09'), [line.other(inr(1000), { date: isolatedDate('saturday') })]);
    const flag = findings(claim, 'WEEKEND_SPEND');
    expect(flag.length).toBeGreaterThan(0);
    expect(flag[0].outcome).toBe('FLAG');
    expect(claim.lines[0].status, 'a flag never rejects the line').not.toBe(STATUS.lineAutoRejected);
  });

  test('PE-10 a rejected line is excluded from the payable total and the rest continues @regression @policy', async ({ as }) => {
    await describeTest({ epic: 'Policy engine', feature: 'Outcome resolution', severity: 'critical', ref: 'ARD 5 / open question 2' });
    const employee = await as('employee');
    const claim = await employee.claims.createAndSubmit(claimTitle('PE-10'), [
      line.meals(inr(1800)), // breaches the daily cap
      line.travel(inr(8000)),
    ]);
    expect(claim.lines.filter((l) => l.status === STATUS.lineAutoRejected)).toHaveLength(1);
    expect(claim.total_paise).toBe(inr(9800));
    expect(claim.payable_paise).toBe(inr(8000));
    expect(claim.status).toBe(STATUS.pendingManager);
  });

  test('PE-10b a claim with only rejected lines is rejected @regression @policy', async ({ as }) => {
    await describeTest({ epic: 'Policy engine', feature: 'Outcome resolution', severity: 'critical', ref: 'ARD 5 step 4' });
    const employee = await as('employee');
    const claim = await employee.claims.createAndSubmit(claimTitle('PE-10b'), [line.cab(inr(2500))]);
    expect(claim.status).toBe(STATUS.rejected);
    expect(claim.payable_paise).toBe(0);
    expect(claim.rejection_reasons.length, 'the employee is told why').toBeGreaterThan(0);
  });

  test('PE-11 a clean claim up to 5,000 INR is auto-approved @regression @policy', async ({ as }) => {
    await describeTest({ epic: 'Policy engine', feature: 'Auto-approval', severity: 'blocker', ref: 'ARD 5 / E2E01' });
    const employee = await as('employee');
    const claim = await employee.claims.createAndSubmit(claimTitle('PE-11'), [line.cab(inr(1200))]);
    expect(claim.status).toBe(STATUS.approved);
    expect(claim.auto_approved).toBe(true);
  });

  test('PE-11b a clean claim of 5,000.01 INR goes to the manager @regression @policy', async ({ as }) => {
    await describeTest({ epic: 'Policy engine', feature: 'Auto-approval', severity: 'critical', ref: 'ARD 5 / boundary' });
    const employee = await as('employee');
    const at = await employee.claims.createAndSubmit(claimTitle('PE-11b at'), [line.travel(inr(5000))]);
    const above = await employee.claims.createAndSubmit(claimTitle('PE-11b above'), [line.travel(500001)]);
    expect(at.status, 'exactly 5,000 still auto-approves').toBe(STATUS.approved);
    expect(above.status).toBe(STATUS.pendingManager);
  });
});
