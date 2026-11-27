import { Role } from '../../config/environments';
import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { ROLE_HOME } from '../../src/pages/login.page';

test.describe('Sign-in page', () => {
  test('UI-01 the sign-in page renders with email, password and a sign-in button @smoke @ui @readonly', async ({ guest }) => {
    await describeTest({ epic: 'Access', feature: 'Sign in', severity: 'critical', ref: 'AT-06' });
    const app = await guest();
    await app.login.open();
    await expect(app.login.heading()).toBeVisible();
    await expect(app.login.email()).toBeVisible();
    await expect(app.login.password()).toBeVisible();
    await expect(app.login.submitButton()).toBeEnabled();
  });

  for (const role of ['employee', 'manager', 'auditor', 'head'] as Role[]) {
    test(`UI-02 ${role} signs in and lands on their own home screen @smoke @ui`, async ({ guest, as, env }) => {
      await describeTest({ epic: 'Access', feature: 'Sign in', story: `${role} landing page`, severity: 'blocker', ref: 'AT-06 / role-based screens' });
      await as(role); // provisions the user when needed
      const app = await guest();
      await app.login.signIn(env.personas[role]!);
      await expect(app.page).toHaveURL(ROLE_HOME[role]);
    });
  }

  test('UI-03 a wrong password shows an error and stays on the page @regression @ui', async ({ guest, as, env }) => {
    await describeTest({ epic: 'Access', feature: 'Sign in', severity: 'critical', ref: 'AT-05' });
    await as('employee');
    const app = await guest();
    await app.login.open();
    await app.login.fillAndSubmit(env.personas.employee!.email, 'definitely-not-the-password');
    await expect(app.page.getByRole('alert')).toBeVisible();
    await expect(app.login.heading()).toBeVisible();
  });

  test('UI-04 empty and malformed input is validated before any request @regression @ui', async ({ guest }) => {
    await describeTest({ epic: 'Access', feature: 'Sign in', severity: 'normal', ref: 'AT-06' });
    const app = await guest();
    await app.login.open();
    await app.login.submitButton().click();
    await expect(app.login.error('Enter your email.')).toBeVisible();
    await expect(app.login.error('Enter your password.')).toBeVisible();
    await app.login.email().fill('not-an-email');
    await app.login.submitButton().click();
    await expect(app.login.error('Enter a valid email address.')).toBeVisible();
  });

  test('UI-05 role areas are guarded: an employee cannot open the manager inbox @regression @ui @security', async ({ ui }) => {
    await describeTest({ epic: 'Access', feature: 'Role guard', severity: 'critical', ref: 'ARD 3 / UX' });
    const app = await ui('employee');
    await app.page.goto('/manager/inbox');
    await expect(app.page, 'redirected away from the manager area').not.toHaveURL(/\/manager\/inbox/);
  });

  test('UI-06 a signed-out visitor is sent to the sign-in page @regression @ui @security', async ({ guest }) => {
    await describeTest({ epic: 'Access', feature: 'Role guard', severity: 'critical', ref: 'ARD 3' });
    const app = await guest();
    await app.page.goto('/employee/claims');
    await expect(app.login.heading()).toBeVisible();
  });
});
