import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { claimTitle, line } from '../../src/data/factories';
import { inr } from '../../src/data/money';

test.describe('Mobile claim capture (phone width)', () => {
  test('UX-01 the capture screen fits the phone and shows the live policy finding @regression @mobile @ui', async ({ ui }) => {
    await describeTest({ epic: 'Claims', feature: 'Mobile capture', severity: 'critical', ref: 'ARD 9 / UX-01' });
    const app = await ui('employee');
    await app.capture.open();
    expect(await app.capture.hasHorizontalScroll(), 'no sideways scrolling').toBe(false);

    await app.capture.setTitle(claimTitle('UX-01'));
    await app.capture.fillLine(1, line.meals(inr(1800)));
    await expect(app.capture.amountField(1)).toHaveAttribute('inputmode', 'decimal');
    await expect(app.capture.advisory(/1,500/), 'advisory policy finding appears inline').toBeVisible();
    await expect(app.capture.reviewButton()).toBeVisible();
    expect(await app.capture.hasHorizontalScroll()).toBe(false);
  });

  test('UX-04 My claims is usable at phone width @regression @mobile @ui', async ({ ui }) => {
    await describeTest({ epic: 'Claims', feature: 'Mobile list', severity: 'normal', ref: 'ARD 9' });
    const app = await ui('employee');
    await app.claims.open();
    await expect(app.claims.summary()).toBeVisible();
    expect(await app.claims.hasHorizontalScroll()).toBe(false);
  });
});
