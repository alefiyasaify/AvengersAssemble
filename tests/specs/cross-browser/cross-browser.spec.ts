import { STATUS } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { isolatedDate } from '../../src/data/dates';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';

/** Runs in every browser project (see playwright.config.ts: xb-*). One result per browser is rolled up into TC-UI-019. */
test.describe('Cross-browser check', () => {
  test('TC-UI-019 Layouts and functions behave identically across browsers @catalogue @ui @xb', async ({ as, guest, env }, testInfo) => {
    await describeTest({ epic: 'Catalogue', feature: 'UI and UX', severity: 'normal', ref: 'TC-UI-019' });
    await as('employee'); // makes sure the QA users exist
    const e = await as('employee');
    const app = await guest();
    await app.login.signIn(env.personas.employee!);
    await expect(app.page).toHaveURL(/\/employee\/claims$/);

    const title = claimTitle(`UI-019 ${testInfo.project.name}`);
    await app.capture.open();
    await app.capture.setTitle(title);
    await app.capture.fillLine(1, line.cab(inr(1200), { date: isolatedDate(), description: 'Airport drop' }));
    expect(await app.claims.hasHorizontalScroll(), 'no sideways scrolling').toBe(false);
    await app.capture.submit();
    const claim = (await e.claims.list({ q: title })).body.items[0];
    expect(claim?.status).toBe(STATUS.approved);
  });
});
