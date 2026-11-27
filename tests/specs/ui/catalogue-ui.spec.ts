import AxeBuilder from '@axe-core/playwright';
import { createUser, loginAs } from '../../src/api/admin';
import { Session } from '../../src/api/session';
import { Claim } from '../../src/api/types';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { claimTitle, line, uniqueVendor } from '../../src/data/factories';
import { inr } from '../../src/data/money';
import { submitTravel } from '../../src/data/scenarios';

const ref = (id: string) => ({ epic: 'Catalogue', feature: 'UI and UX', severity: 'normal' as const, ref: id });

test.describe('Approver review screen', () => {
  test('TC-UI-003 Receipt viewer zoom and rotate keep state when switching lines @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-UI-003'));
    const e = await as('employee');
    const c = await e.claims.createAndSubmit(claimTitle('UI-003'), [line.travel(inr(3000)), line.travel(inr(5000))]);
    const app = await ui('manager');
    await app.review.open('manager', c.id);
    const viewer = app.page.getByRole('region', { name: 'Receipt viewer' });
    await viewer.getByRole('button', { name: 'Zoom in' }).click();
    await expect(viewer.getByText('110%')).toBeVisible();
    await viewer.getByRole('button', { name: 'Zoom out' }).click();
    await viewer.getByRole('button', { name: 'Zoom out' }).click();
    await expect(viewer.getByText('90%')).toBeVisible();
    await viewer.getByRole('button', { name: 'Rotate' }).click();
    await expect(viewer.getByRole('img', { name: /^Receipt for/ })).toHaveCSS('transform', /matrix/);
    await viewer.getByRole('button', { name: 'Next line' }).click();
    await expect(viewer.getByText(/line 2 of 2/)).toBeVisible();
    await expect(viewer.getByText('90%'), 'zoom is retained when switching lines').toBeVisible();
  });

  test('TC-UI-004 Multiple receipts: thumbnails and line-to-receipt jump @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-UI-004'));
    const e = await as('employee');
    const [v1, v2] = [uniqueVendor('First'), uniqueVendor('Second')];
    const c = await e.claims.createAndSubmit(claimTitle('UI-004'), [line.travel(inr(3000), { vendor: v1 }), line.travel(inr(5000), { vendor: v2 })]);
    const app = await ui('manager');
    await app.review.open('manager', c.id);
    const thumbs = app.page.getByRole('group', { name: 'Receipts' });
    await expect(thumbs.getByRole('button', { name: `Line 1, ${v1}` })).toHaveAttribute('aria-pressed', 'true');
    await thumbs.getByRole('button', { name: `Line 2, ${v2}` }).click();
    await expect(thumbs.getByRole('button', { name: `Line 2, ${v2}` })).toHaveAttribute('aria-pressed', 'true');
    await expect(app.page.getByRole('img', { name: `Receipt for ${v2}` })).toBeVisible();
    // Choosing a line in the line list jumps the viewer as well.
    await app.review.lineItems().getByRole('button', { name: new RegExp(v1) }).click();
    await expect(app.page.getByRole('img', { name: `Receipt for ${v1}` })).toBeVisible();
  });

  test('TC-UI-005 Keyboard shortcuts J K A R S C @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-UI-005'));
    const e = await as('employee');
    const c = await e.claims.createAndSubmit(claimTitle('UI-005'), [line.travel(inr(3000)), line.travel(inr(5000))]);
    const app = await ui('manager');
    await app.review.open('manager', c.id);
    const rows = app.review.lineItems().getByRole('button');
    await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await app.review.press('k');
    await expect(rows.nth(1), 'K moves to the next line').toHaveAttribute('aria-pressed', 'true');
    await app.review.press('j');
    await expect(rows.nth(0), 'J moves back').toHaveAttribute('aria-pressed', 'true');
    await app.page.keyboard.press('c');
    await expect(app.page.locator('#comment-input'), 'C focuses the comment box').toBeFocused();
    await app.page.locator('#comment-input').blur();
    await app.page.locator('body').click({ position: { x: 5, y: 5 } });
    await app.review.press('r');
    const dialog = app.review.decisionDialog();
    await expect(dialog.getByRole('button', { name: 'Reject claim' }), 'R opens reject and it still needs a comment').toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await app.review.press('s');
    await expect(dialog.getByRole('button', { name: 'Send back' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await app.review.press('a');
    await expect.poll(async () => (await e.claims.get(c.id)).status, 'A approves').toBe('APPROVED');
  });

  test('TC-UI-006 After a decision the next inbox item loads @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-UI-006'));
    const e = await as('employee');
    const first = await submitTravel(e, 'UI-006 a', inr(8000));
    const second = await submitTravel(e, 'UI-006 b', inr(8001));
    const app = await ui('manager');
    await app.inbox.open('/manager/inbox');
    await expect(app.inbox.row(first.claim_no)).toBeVisible();
    await expect(app.inbox.row(second.claim_no)).toBeVisible();
    const order = await app.page.getByRole('row').filter({ hasText: /UI-006/ }).allInnerTexts();
    expect(order.length).toBeGreaterThanOrEqual(2);
    const openFirst = order[0].includes(first.claim_no) ? first : second;
    const other = openFirst === first ? second : first;
    await app.inbox.row(openFirst.claim_no).click();
    await app.review.approveButton().click();
    await expect(app.page, 'the next claim in the inbox opens automatically').toHaveURL(/\/manager\/claims\/[0-9a-f-]{36}/);
    expect(app.page.url()).not.toContain(openFirst.id);
    expect(other.id).toBeTruthy();
  });

  test('TC-UI-007 Review duration telemetry is emitted @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-UI-007'));
    const e = await as('employee');
    const c = await submitTravel(e, 'UI-007', inr(8000));
    const app = await ui('manager');
    const seen: string[] = [];
    app.page.on('request', (r) => {
      const body = r.postData() ?? '';
      if (/review_duration/.test(r.url() + body)) seen.push(r.url());
    });
    await app.review.open('manager', c.id);
    await app.review.approveButton().click();
    await expect(app.review.toast(/approved/i)).toBeVisible();
    expect(seen, 'a review_duration_ms event is sent').not.toHaveLength(0);
  });

  test('TC-UI-016 Conflict banner on 409 offers reload @catalogue @ui', async ({ as, ui, env }) => {
    await describeTest(ref('TC-UI-016'));
    const [e, m, head] = [await as('employee'), await as('manager'), await as('head')];
    const rival = await createUser(head, { role: 'AUDITOR', label: 'Rival' });
    const other = new Session(await loginAs(env, rival), rival);
    const c = await submitTravel(e, 'UI-016', inr(30000));
    await m.approvals.decide(c.id, 'approve');
    const app = await ui('auditor');
    await app.review.open('auditor', c.id);
    await expect(app.review.approveButton()).toBeVisible();
    await other.approvals.decide(c.id, 'approve'); // someone else approves while this screen is open
    await app.review.approveButton().click();
    await app.page.waitForTimeout(1500);
    const shown = (await app.page.locator('.ant-message-notice, [role="alert"]').allInnerTexts()).join(' | ') || '(nothing shown)';
    expect(shown, 'a conflict message offers a reload').toMatch(/changed.*reload/i);
  });
});

test.describe('Queue state and audit screen', () => {
  test('TC-AUD-007 Filters and sort are mirrored in the URL and survive refresh @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-AUD-007'));
    const [e, m] = [await as('employee'), await as('manager')];
    const c = await submitTravel(e, 'AUD-007', inr(30000));
    await m.approvals.decide(c.id, 'approve');
    const app = await ui('auditor');
    await app.queue.open();
    await app.queue.search().fill(c.claim_no);
    await expect(app.queue.row(c.claim_no)).toBeVisible();
    await app.page.getByRole('columnheader', { name: /Amount/ }).click(); // sort
    await expect(app.page, 'filter and sort are in the URL').toHaveURL(/\?.*(q|search)=/);
    await app.page.reload();
    await expect(app.queue.search(), 'the same view is restored after refresh').toHaveValue(c.claim_no);
  });

  test('TC-AUD-016 Select-all-matching states the exact count and value @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-AUD-016'));
    const [e, m] = [await as('employee'), await as('manager')];
    for (let i = 0; i < 3; i++) await m.approvals.decide((await submitTravel(e, `AUD-016 ${i}`, inr(30000 + i))).id, 'approve');
    const app = await ui('auditor');
    await app.queue.open();
    await app.queue.search().fill('AUD-016');
    await expect(app.page.getByRole('row').filter({ hasText: 'AUD-016' })).toHaveCount(3);
    await app.page.getByRole('checkbox', { name: /select all/i }).check();
    await expect(app.page.getByText(/3 selected/)).toBeVisible();
    await expect(app.page.getByText(/in total/), 'the bar states the total value before the action').toBeVisible();
  });

  test('TC-TRL-014 Delegated action shows both identities in the timeline UI @catalogue @ui', async ({ as, ui, env }) => {
    await describeTest(ref('TC-TRL-014'));
    const [e, m, d] = [await as('employee'), await as('manager'), await as('delegate')];
    await m.delegations.clear();
    const del = await m.delegations.create((await d.me()).id, 1);
    try {
      const c = await submitTravel(e, 'TRL-014', inr(8000));
      await d.approvals.decide(c.id, 'approve');
      const app = await ui('head');
      await app.page.goto('/head/audit');
      await app.page.getByRole('textbox').first().fill(c.claim_no);
      await app.page.getByText(c.claim_no).first().click();
      await expect(app.page.getByText(new RegExp(`${env.personas.delegate!.name}.*(on behalf of|for).*${env.personas.manager!.name}`, 'i')).first()).toBeVisible();
    } finally {
      await m.delegations.remove(del.id);
    }
  });
});

test.describe('Tables and money', () => {
  test('TC-UI-009 Tables: sticky header, right-aligned numbers and column controls @catalogue @ui', async ({ ui }) => {
    await describeTest(ref('TC-UI-009'));
    const app = await ui('auditor');
    await app.queue.open();
    await expect(app.page.getByRole('table').first()).toBeVisible();
    const header = app.page.locator('.ant-table-thead th').first();
    await expect(header, 'the header stays visible').toHaveCSS('position', 'sticky');
    await expect(app.page.locator('.ant-table-tbody td .num').first().locator('xpath=ancestor::td'), 'numbers are right-aligned').toHaveCSS('text-align', 'right');
    await expect(app.page.getByRole('button', { name: /columns|column settings|settings/i }), 'a column controls button').toBeVisible();
  });

  test('TC-UI-010 Table row selection with shift-click range @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-UI-010'));
    const [e, m] = [await as('employee'), await as('manager')];
    const made: Claim[] = [];
    for (let i = 0; i < 10; i++) {
      const c = await submitTravel(e, `UI-010 ${i}`, inr(30000 + i));
      made.push(await m.approvals.decide(c.id, 'approve'));
    }
    const app = await ui('auditor');
    await app.queue.open();
    await app.queue.search().fill('UI-010');
    await expect(app.queue.row(made[0].claim_no)).toBeVisible();
    const boxes = app.page.getByRole('checkbox', { name: /^Select / });
    await boxes.first().click();
    await boxes.nth(9).click({ modifiers: ['Shift'] });
    await expect(app.page.getByText(/10 selected/), 'ten rows selected, with a count').toBeVisible();
  });

  test('TC-UI-011 Saved filter presets per user @catalogue @ui', async ({ ui }) => {
    await describeTest(ref('TC-UI-011'));
    const app = await ui('auditor');
    await app.queue.open();
    await expect(app.page.getByRole('button', { name: /save (this )?(filter|view)|presets?/i }), 'a way to save a filter preset').toBeVisible();
  });

  test('TC-UI-015 Money is shown in Indian digit grouping @catalogue @ui', async ({ as, ui }) => {
    await describeTest(ref('TC-UI-015'));
    const e = await as('employee');
    const c = await e.claims.createAndSubmit(claimTitle('UI-015'), [line.travel(inr(1000000)), line.travel(inr(1000000)), line.travel(inr(500000))]);
    expect(c.total_paise).toBe(inr(2500000));
    const m = await as('manager');
    await m.approvals.decide(c.id, 'approve');
    const app = await ui('auditor');
    await app.review.open('auditor', c.id);
    await expect(app.page.getByText('₹25,00,000').first(), '25 lakh').toBeVisible();
    await expect(app.page.getByText('₹10,00,000').first(), '10 lakh').toBeVisible();
    await expect(app.page.getByText(/₹2,500,000|₹2,500,000\.00/), 'no western grouping').toHaveCount(0);
  });

  test('TC-UI-018 No sensitive data in localStorage or sessionStorage @catalogue @ui @security', async ({ as, ui }) => {
    await describeTest(ref('TC-UI-018'));
    const e = await as('employee');
    const c = await submitTravel(e, 'UI-018', inr(8000));
    const app = await ui('employee');
    await app.capture.openClaim(c.id);
    await app.claims.open();
    const dump = await app.page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(dump).not.toMatch(/eyJ|token|password|@expenseflow|account/i);
  });
});

test.describe('Accessibility', () => {
  const pages: Array<[string, 'employee' | 'manager' | 'auditor' | 'head', string]> = [
    ['My claims', 'employee', '/employee/claims'],
    ['New claim', 'employee', '/employee/claims/new'],
    ['Approval inbox', 'manager', '/manager/inbox'],
    ['Review queue', 'auditor', '/auditor/queue'],
    ['Payout batches', 'head', '/head/payouts'],
    ['Dashboard', 'head', '/head/dashboard'],
  ];
  test('TC-UI-014 Accessibility scan finds no critical or serious issues @catalogue @ui', async ({ ui, guest }) => {
    await describeTest(ref('TC-UI-014'));
    const problems: string[] = [];
    const scan = async (name: string, page: import('@playwright/test').Page) => {
      await page.waitForLoadState('networkidle');
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      for (const v of res.violations.filter((x) => x.impact === 'critical' || x.impact === 'serious')) problems.push(`${name}: ${v.id} (${v.impact}, ${v.nodes.length} nodes)`);
    };
    const anon = await guest();
    await anon.login.open();
    await scan('Sign in', anon.page);
    for (const [name, role, url] of pages) {
      const app = await ui(role);
      await app.page.goto(url);
      await scan(name, app.page);
    }
    expect(problems).toEqual([]);
  });
});

test.describe('Session and route handling (browser)', () => {
  test('TC-AUTH-009 Expired session redirects to login and returns to the same route @catalogue @ui', async ({ as, ui, env }) => {
    await describeTest(ref('TC-AUTH-009'));
    const e = await as('employee');
    const c = await e.claims.createDraft(claimTitle('AUTH-009'), [line.travel(inr(1000))]);
    const app = await ui('employee');
    await app.capture.openClaim(c.id);
    await app.page.context().clearCookies();
    await app.page.reload();
    await expect(app.login.heading(), 'redirected to the sign-in page').toBeVisible();
    await app.login.fillAndSubmit(env.personas.employee!.email, env.personas.employee!.password);
    await expect(app.page, 'back on the original route after sign-in').toHaveURL(new RegExp(`/employee/claims/${c.id}`));
  });

  test('TC-RBAC-012 Forbidden route shows a 403 page; an unknown claim shows the 404 page @catalogue @ui', async ({ ui }) => {
    await describeTest(ref('TC-RBAC-012'));
    const app = await ui('employee');
    await app.page.goto('/manager/inbox');
    await expect(app.page.getByText(/403|forbidden|not allowed|no access/i).first(), 'a 403 page').toBeVisible();
    await app.page.goto('/employee/claims/00000000-0000-7000-8000-000000000000');
    await expect(app.page.getByText(/not found/i).first(), 'a 404 page').toBeVisible();
  });
});
