import { STATUS, getEnv } from '../../config/environments';
import { ConfigAdmin } from '../../src/api/config-admin';
import { Claim } from '../../src/api/types';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { addDays, daysAgo, isolatedDate } from '../../src/data/dates';
import { claimTitle, line, uniqueVendor } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { newReceipt } from '../../src/data/receipts';
import { findings } from '../../src/data/scenarios';

const env = getEnv();
const ref = (id: string) => ({ epic: 'Catalogue', feature: 'Policy engine', severity: 'critical' as const, ref: id });
const rejects = (c: Claim, rule: string) => findings(c, rule).filter((f) => f.outcome === 'REJECT');

test.describe('Policy engine: meals', () => {
  test('TC-POL-001 Meals up to 1,499.99 INR in a day passes @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-001'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-001'), [line.meals(149999)]);
    expect(findings(c, 'MEALS_DAILY_CAP')).toHaveLength(0);
    expect(c.lines[0].status).toBe(STATUS.lineAutoApproved);
  });

  test('TC-POL-002 Meals exactly 1,500.00 INR in a day passes (inclusive) @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-002'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-002'), [line.meals(inr(1500))]);
    expect(findings(c, 'MEALS_DAILY_CAP')).toHaveLength(0);
    expect(c.lines[0].status).toBe(STATUS.lineAutoApproved);
  });

  test('TC-POL-003 Meals 1,500.01 INR in a day is auto-rejected @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-003'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-003'), [line.meals(150001)]);
    expect(c.lines[0].status).toBe(STATUS.lineAutoRejected);
    expect(rejects(c, 'MEALS_DAILY_CAP')[0].reason).toMatch(/1,500|daily/i);
    expect(c.status, 'the only line is rejected').toBe(STATUS.rejected);
  });

  test('TC-POL-004 Two meals lines on the same day are summed @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-004'));
    const date = isolatedDate();
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-004'), [line.meals(inr(900), { date }), line.meals(inr(700), { date })]);
    expect(rejects(c, 'MEALS_DAILY_CAP').length).toBeGreaterThan(0);
    expect(rejects(c, 'MEALS_DAILY_CAP')[0].reason).toBeTruthy();
  });

  test('TC-POL-005 Two meals lines totalling exactly 1,500 pass @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-005'));
    const date = isolatedDate();
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-005'), [line.meals(inr(800), { date }), line.meals(inr(700), { date })]);
    expect(findings(c, 'MEALS_DAILY_CAP')).toHaveLength(0);
  });

  test('TC-POL-006 Meals on different days are evaluated separately @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-006'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-006'), [line.meals(inr(1000)), line.meals(inr(1000))]);
    expect(findings(c, 'MEALS_DAILY_CAP')).toHaveLength(0);
  });

  test('TC-POL-007 Meals daily cap includes the employee\'s earlier claims for the same day @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-007'));
    const e = await as('employee');
    const date = isolatedDate();
    await e.claims.createAndSubmit(claimTitle('POL-007 first'), [line.meals(inr(1000), { date })]);
    const second = await e.claims.createAndSubmit(claimTitle('POL-007 second'), [line.meals(inr(600), { date })]);
    expect(rejects(second, 'MEALS_DAILY_CAP').length, 'cap breach across claims').toBeGreaterThan(0);
  });

  test('TC-POL-008 Another employee\'s meals do not count towards my daily cap @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-008'));
    const [a, b] = [await as('employee'), await as('employee2')];
    const date = isolatedDate();
    await a.claims.createAndSubmit(claimTitle('POL-008 a'), [line.meals(inr(1400), { date })]);
    const mine = await b.claims.createAndSubmit(claimTitle('POL-008 b'), [line.meals(inr(1400), { date })]);
    expect(rejects(mine, 'MEALS_DAILY_CAP')).toHaveLength(0);
  });
});

test.describe('Policy engine: hotel, cab, receipts', () => {
  test('TC-POL-009 Hotel 6,000 INR per night in a tier-1 city passes @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-009'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-009'), [line.hotel(inr(6000), 1)]);
    expect(findings(c, 'HOTEL_NIGHT_CAP')).toHaveLength(0);
  });

  test('TC-POL-010 Hotel above 6,000 INR per night in a tier-1 city is rejected @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-010'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-010'), [line.hotel(600001, 1)]);
    expect(c.lines[0].status).toBe(STATUS.lineAutoRejected);
    expect(rejects(c, 'HOTEL_NIGHT_CAP')[0].reason).toMatch(/6,000|night/i);
  });

  test('TC-POL-011 Hotel 4,000 INR per night in a non-tier-1 city passes @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-011'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-011'), [line.hotel(inr(4000), 1, { city: env.cities.other })]);
    expect(findings(c, 'HOTEL_NIGHT_CAP')).toHaveLength(0);
  });

  test('TC-POL-012 Hotel above 4,000 INR per night in a non-tier-1 city is rejected @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-012'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-012'), [line.hotel(400001, 1, { city: env.cities.other })]);
    expect(c.lines[0].status).toBe(STATUS.lineAutoRejected);
  });

  test('TC-POL-013 Same hotel rate passes in tier 1 but fails in tier 2 @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-013'));
    const e = await as('employee');
    const t1 = await e.claims.createAndSubmit(claimTitle('POL-013 t1'), [line.hotel(inr(5000), 1, { city: env.cities.tier1 })]);
    const t2 = await e.claims.createAndSubmit(claimTitle('POL-013 t2'), [line.hotel(inr(5000), 1, { city: env.cities.other })]);
    expect(rejects(t1, 'HOTEL_NIGHT_CAP')).toHaveLength(0);
    expect(rejects(t2, 'HOTEL_NIGHT_CAP').length).toBeGreaterThan(0);
  });

  test('TC-POL-014 Per-night comparison uses exact arithmetic for odd night counts @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-014'));
    const e = await as('employee');
    const at = await e.claims.createAndSubmit(claimTitle('POL-014 at'), [line.hotel(inr(18000), 3)]);
    const above = await e.claims.createAndSubmit(claimTitle('POL-014 above'), [line.hotel(1800001, 3)]);
    expect(rejects(at, 'HOTEL_NIGHT_CAP')).toHaveLength(0);
    expect(rejects(above, 'HOTEL_NIGHT_CAP').length).toBeGreaterThan(0);
  });

  test('TC-POL-016 Local cab 2,000 INR per trip passes @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-016'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-016'), [line.cab(inr(2000))]);
    expect(findings(c, 'CAB_TRIP_CAP')).toHaveLength(0);
  });

  test('TC-POL-017 Local cab above 2,000 INR per trip is rejected @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-017'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-017'), [line.cab(200001)]);
    expect(c.lines[0].status).toBe(STATUS.lineAutoRejected);
    expect(rejects(c, 'CAB_TRIP_CAP')[0].reason).toBeTruthy();
  });

  test('TC-POL-018 Each cab line is one trip with its own cap @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-018'));
    const date = isolatedDate();
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-018'), [line.cab(inr(1800), { date }), line.cab(inr(1800), { date }), line.cab(inr(1800), { date })]);
    expect(findings(c, 'CAB_TRIP_CAP')).toHaveLength(0);
  });

  test('TC-POL-019 Receipt not required at exactly 500.00 INR @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-019'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-019'), [line.other(inr(500), { receipt: null })]);
    expect(findings(c, 'RECEIPT_REQUIRED')).toHaveLength(0);
  });

  test('TC-POL-020 Receipt required above 500 INR @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-020'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-020'), [line.other(50001, { receipt: null })]);
    expect(c.lines[0].status).toBe(STATUS.lineAutoRejected);
    expect(rejects(c, 'RECEIPT_REQUIRED')[0].reason).toMatch(/receipt/i);
  });

  test('TC-POL-021 Receipt rule applies to every category @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-021'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-021'), [
      line.meals(inr(600), { receipt: null }),
      line.hotel(inr(5000), 1, { receipt: null }),
      line.cab(inr(700), { receipt: null }),
    ]);
    for (const l of c.lines) expect(l.findings.some((f) => f.rule_code === 'RECEIPT_REQUIRED' && f.outcome === 'REJECT'), `${l.category} rejected for no receipt`).toBe(true);
  });

  test('TC-POL-022 Line above 500 INR with receipt passes @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-022'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-022'), [line.other(inr(900))]);
    expect(findings(c, 'RECEIPT_REQUIRED')).toHaveLength(0);
  });
});

test.describe('Policy engine: duplicates', () => {
  test('TC-POL-023 Duplicate: same vendor, amount and date as an earlier line @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-023'));
    const e = await as('employee');
    const [date, vendor] = [isolatedDate(), uniqueVendor('Dup')];
    await e.claims.createAndSubmit(claimTitle('POL-023 a'), [line.other(inr(1200), { vendor, date })]);
    const b = await e.claims.createAndSubmit(claimTitle('POL-023 b'), [line.other(inr(1200), { vendor, date })]);
    const f = findings(b, 'DUPLICATE_LINE')[0];
    expect(f.outcome).toBe('ROUTE');
    expect(f.severity).toBe('high');
    expect(b.required_levels, 'the auditor level is forced').toContain(2);
    expect(b.status).not.toBe(STATUS.approved);
  });

  test('TC-POL-024 Duplicate detection works across employees @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-024'));
    const [a, b] = [await as('employee'), await as('employee2')];
    const [date, vendor] = [isolatedDate(), uniqueVendor('DupX')];
    await a.claims.createAndSubmit(claimTitle('POL-024 a'), [line.other(inr(1200), { vendor, date })]);
    const c = await b.claims.createAndSubmit(claimTitle('POL-024 b'), [line.other(inr(1200), { vendor, date })]);
    expect(findings(c, 'DUPLICATE_LINE').length).toBeGreaterThan(0);
  });

  test('TC-POL-025 Vendor name differences in case and spacing still match @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-025'));
    const e = await as('employee');
    const [date, vendor] = [isolatedDate(), uniqueVendor('Acme Traders')];
    await e.claims.createAndSubmit(claimTitle('POL-025 a'), [line.other(inr(1200), { vendor, date })]);
    const b = await e.claims.createAndSubmit(claimTitle('POL-025 b'), [line.other(inr(1200), { vendor: `  ${vendor.toUpperCase().replace(' ', '   ')}  `, date })]);
    expect(findings(b, 'DUPLICATE_LINE').length).toBeGreaterThan(0);
  });

  test('TC-POL-026 One paisa difference in amount is not a duplicate @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-026'));
    const e = await as('employee');
    const [date, vendor] = [isolatedDate(), uniqueVendor('Paisa')];
    await e.claims.createAndSubmit(claimTitle('POL-026 a'), [line.other(inr(1200), { vendor, date })]);
    const b = await e.claims.createAndSubmit(claimTitle('POL-026 b'), [line.other(120001, { vendor, date })]);
    expect(findings(b, 'DUPLICATE_LINE')).toHaveLength(0);
  });

  test('TC-POL-027 Different date is not a duplicate @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-027'));
    const e = await as('employee');
    const vendor = uniqueVendor('Date');
    await e.claims.createAndSubmit(claimTitle('POL-027 a'), [line.other(inr(1200), { vendor, date: isolatedDate() })]);
    const b = await e.claims.createAndSubmit(claimTitle('POL-027 b'), [line.other(inr(1200), { vendor, date: isolatedDate() })]);
    expect(findings(b, 'DUPLICATE_LINE')).toHaveLength(0);
  });

  test('TC-POL-028 Duplicate by identical receipt file hash @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-028'));
    const e = await as('employee');
    const file = newReceipt();
    await e.claims.createAndSubmit(claimTitle('POL-028 a'), [line.other(inr(900), { receipt: file })]);
    const b = await e.claims.createAndSubmit(claimTitle('POL-028 b'), [line.other(inr(1300), { receipt: file })]);
    expect(findings(b, 'DUPLICATE_LINE').length).toBeGreaterThan(0);
  });

  test('TC-POL-029 Same receipt on two lines of the same claim is flagged @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-029'));
    const file = newReceipt();
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-029'), [line.other(inr(900), { receipt: file }), line.other(inr(1300), { receipt: file })]);
    expect(c.lines.some((l) => l.findings.some((f) => f.rule_code === 'DUPLICATE_LINE'))).toBe(true);
  });

  test('TC-POL-030 An earlier auto-rejected line does not trigger duplicate @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-030'));
    const e = await as('employee');
    const [date, vendor] = [isolatedDate(), uniqueVendor('Corrected')];
    const first = await e.claims.createAndSubmit(claimTitle('POL-030 a'), [line.other(inr(1000), { vendor, date, receipt: null })]);
    expect(first.lines[0].status).toBe(STATUS.lineAutoRejected);
    const corrected = await e.claims.createAndSubmit(claimTitle('POL-030 b'), [line.other(inr(1000), { vendor, date })]);
    expect(findings(corrected, 'DUPLICATE_LINE'), 'lookback covers non-rejected lines only').toHaveLength(0);
  });

  test('TC-POL-031 Duplicate on a small claim forces the auditor level @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-031'));
    const [e, m] = [await as('employee'), await as('manager')];
    const [date, vendor] = [isolatedDate(), uniqueVendor('SmallDup')];
    await e.claims.createAndSubmit(claimTitle('POL-031 a'), [line.other(inr(1200), { vendor, date })]);
    const b = await e.claims.createAndSubmit(claimTitle('POL-031 b'), [line.other(inr(1200), { vendor, date })]);
    expect(b.total_paise).toBeLessThan(inr(25000));
    expect(b.required_levels).toContain(2);
    const after = await m.approvals.decide(b.id, 'approve');
    expect(after.status).toBe(STATUS.pendingAuditor);
  });
});

test.describe('Policy engine: weekend, outcome and configuration', () => {
  for (const [id, kind, flagged] of [['TC-POL-032', 'saturday', true], ['TC-POL-033', 'sunday', true]] as const) {
    test(`${id} ${kind} expense is flagged for manager attention @catalogue @policy`, async ({ as }) => {
      await describeTest(ref(id));
      const c = await (await as('employee')).claims.createAndSubmit(claimTitle(id), [line.other(inr(1000), { date: isolatedDate(kind) })]);
      expect(findings(c, 'WEEKEND_SPEND')[0]?.outcome).toBe('FLAG');
      expect(c.status, 'goes to the manager, not auto-approved').toBe(STATUS.pendingManager);
      expect(flagged).toBe(true);
    });
  }

  test('TC-POL-034 Friday and Monday expenses are not flagged @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-034'));
    const e = await as('employee');
    for (const kind of ['friday', 'monday'] as const) {
      const c = await e.claims.createAndSubmit(claimTitle(`POL-034 ${kind}`), [line.other(inr(1000), { date: isolatedDate(kind) })]);
      expect(findings(c, 'WEEKEND_SPEND'), kind).toHaveLength(0);
    }
  });

  test('TC-POL-035 Weekend flag is visible to the manager on the review screen @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-POL-035'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-035'), [line.other(inr(1000), { date: isolatedDate('saturday') })]);
    const app = await ui('manager');
    await app.review.open('manager', c.id);
    await expect(app.review.lineItems().getByText(findings(c, 'WEEKEND_SPEND')[0].reason)).toBeVisible();
  });

  test('TC-POL-036 Clean small claim is auto-approved by SYSTEM with no approval steps @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-036'));
    const e = await as('employee');
    const c = await e.claims.createAndSubmit(claimTitle('POL-036'), [line.cab(inr(1200))]);
    expect(c.status).toBe(STATUS.approved);
    expect(c.auto_approved).toBe(true);
    expect(c.steps).toHaveLength(0);
    const tl = await e.claims.timeline(c.id);
    expect(tl.some((t) => /system/i.test(t.actor_name)), 'audit actor SYSTEM').toBe(true);
  });

  test('TC-POL-037 Auto-approve limit boundary: 5,000.00 vs 5,000.01 INR @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-037'));
    const e = await as('employee');
    const at = await e.claims.createAndSubmit(claimTitle('POL-037 at'), [line.travel(inr(5000))]);
    const above = await e.claims.createAndSubmit(claimTitle('POL-037 above'), [line.travel(500001)]);
    expect(at.status).toBe(STATUS.approved);
    expect(above.status).toBe(STATUS.pendingManager);
  });

  test('TC-POL-038 Claim with one rejected line and one clean line continues @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-038'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-038'), [line.meals(inr(1800)), line.other(inr(900))]);
    expect(c.lines.find((l) => l.category === 'MEALS')!.status).toBe(STATUS.lineAutoRejected);
    expect(c.payable_paise).toBe(inr(900));
    expect(c.status, 'payable 900 is under the auto-approve limit but the claim had a breach').toMatch(/PENDING_MANAGER|APPROVED/);
    expect(c.status).toBe(STATUS.pendingManager);
  });

  test('TC-POL-039 Claim with every line rejected becomes REJECTED with no approval steps @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-039'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-039'), [line.meals(inr(1800)), line.cab(inr(2500))]);
    expect(c.status).toBe(STATUS.rejected);
    expect(c.steps).toHaveLength(0);
    expect(c.rejection_reasons.length).toBeGreaterThanOrEqual(2);
  });

  test('TC-POL-040 Line with several findings lists all reasons @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-040'));
    const c = await (await as('employee')).claims.createAndSubmit(claimTitle('POL-040'), [line.meals(inr(1800), { receipt: null, date: isolatedDate('saturday') })]);
    const codes = c.lines[0].findings.map((f) => f.rule_code);
    expect(codes).toEqual(expect.arrayContaining(['MEALS_DAILY_CAP', 'RECEIPT_REQUIRED', 'WEEKEND_SPEND']));
  });

  test('TC-POL-041 REJECT outranks ROUTE and FLAG in resolution @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-041'));
    const e = await as('employee');
    const [date, vendor] = [isolatedDate(), uniqueVendor('Both')];
    await e.claims.createAndSubmit(claimTitle('POL-041 a'), [line.meals(inr(1500), { vendor, date })]);
    const b = await e.claims.createAndSubmit(claimTitle('POL-041 b'), [line.meals(inr(1500), { vendor, date })]);
    const codes = b.lines[0].findings.map((f) => f.rule_code);
    expect(codes).toEqual(expect.arrayContaining(['DUPLICATE_LINE', 'MEALS_DAILY_CAP']));
    expect(b.lines[0].status).toBe(STATUS.lineAutoRejected);
  });

  test('TC-POL-042 Findings and policy version are stored with the submitted claim @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-042'));
    const e = await as('employee');
    const policy = await new ConfigAdmin(await as('head')).active();
    const c = await e.claims.createAndSubmit(claimTitle('POL-042'), [line.meals(inr(1800))]);
    const back = await e.claims.get(c.id);
    expect(back.lines[0].findings.length).toBeGreaterThan(0);
    expect((back as unknown as { policy_version_id: string }).policy_version_id).toBe(policy.id);
  });

  test('TC-POL-043 Policy limits come from configuration, not code @catalogue @policy @config', async ({ as }) => {
    await describeTest(ref('TC-POL-043'));
    const [e, head] = [await as('employee'), await as('head')];
    const admin = new ConfigAdmin(head);
    const older = await e.claims.createAndSubmit(claimTitle('POL-043 old'), [line.meals(inr(1800))]);
    await admin.withPolicy(
      (rules) => rules.map((r) => (r.code === 'MEALS_DAILY_CAP' ? { ...r, params: { ...r.params, cap: inr(2000) } } : r)),
      async (version) => {
        const c = await e.claims.createAndSubmit(claimTitle('POL-043 new'), [line.meals(inr(1800))]);
        expect(rejects(c, 'MEALS_DAILY_CAP'), 'passes under the new 2,000 cap').toHaveLength(0);
        expect((c as unknown as { policy_version_id: string }).policy_version_id).toBe(version.id);
        const old = await e.claims.get(older.id);
        expect(rejects(old, 'MEALS_DAILY_CAP').length, 'the older claim keeps its original verdict').toBeGreaterThan(0);
        expect((old as unknown as { policy_version_id: string }).policy_version_id).not.toBe(version.id);
      },
    );
  });

  test('TC-POL-044 Split-claim pattern is routed to the auditor @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-044'));
    const e = await as('employee');
    const vendor = uniqueVendor('Splitter');
    const d1 = isolatedDate('monday');
    const claims: Claim[] = [];
    for (const d of [d1, addDays(d1, 1), addDays(d1, 2)]) claims.push(await e.claims.createAndSubmit(claimTitle('POL-044'), [line.travel(inr(10000), { vendor, date: d })]));
    expect(findings(claims[2], 'SPLIT_SUSPECT').length, 'third claim flagged SPLIT_SUSPECT').toBeGreaterThan(0);
    expect(claims[2].required_levels, 'forces the auditor level').toContain(2);
  });

  test('TC-POL-045 CLAIM_AGE_LIMIT is inactive by default and works when activated @catalogue @policy @config', async ({ as }) => {
    await describeTest(ref('TC-POL-045'));
    const [e, head] = [await as('employee'), await as('head')];
    const old = () => {
      const d = new Date(daysAgo(90));
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    };
    const first = await e.claims.createAndSubmit(claimTitle('POL-045 a'), [line.travel(inr(1000), { date: old() })]);
    expect(findings(first, 'CLAIM_AGE_LIMIT'), 'inactive by default').toHaveLength(0);
    await new ConfigAdmin(head).withPolicy(
      (rules) => rules.map((r) => (r.code === 'CLAIM_AGE_LIMIT' ? { ...r, active: true, params: { ...r.params, max_age_days: 60 } } : r)),
      async () => {
        const second = await e.claims.createAndSubmit(claimTitle('POL-045 b'), [line.travel(inr(1000), { date: old() })]);
        expect(findings(second, 'CLAIM_AGE_LIMIT').length, 'flagged once activated').toBeGreaterThan(0);
      },
    );
  });

  test('TC-POL-046 Policy engine is a pure function: the preview is repeatable and writes nothing @catalogue @policy', async ({ as }) => {
    await describeTest(ref('TC-POL-046'));
    const e = await as('employee');
    const d = await e.claims.createDraft(claimTitle('POL-046'), [line.meals(inr(1800)), line.travel(inr(3000))]);
    const [a, b] = [await e.claims.previewRaw(d.id), await e.claims.previewRaw(d.id)];
    expect(a.body).toEqual(b.body);
    const after = await e.claims.get(d.id);
    expect(after.version, 'no writes').toBe(d.version);
    expect(after.lines.every((l) => l.findings.length === 0)).toBe(true);
  });
});
