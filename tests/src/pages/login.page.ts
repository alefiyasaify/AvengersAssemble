import { Page, test } from '@playwright/test';
import { Persona } from '../../config/environments';
import { BasePage } from './base.page';

/** Where each role lands after sign-in (frontend ROLE_HOME). */
export const ROLE_HOME: Record<string, RegExp> = {
  employee: /\/employee\/claims$/,
  manager: /\/manager\/inbox$/,
  auditor: /\/auditor\/queue$/,
  head: /\/head\/dashboard$/,
};

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.page.goto('/');
  }

  email() {
    return this.page.getByLabel('Work email');
  }
  password() {
    return this.page.getByLabel('Password');
  }
  submitButton() {
    return this.page.getByRole('button', { name: /sign in/i });
  }
  heading() {
    return this.page.getByRole('heading', { name: 'Welcome back' });
  }
  /** Inline validation under a field, or the red banner for a failed sign-in. */
  error(text: string | RegExp) {
    return this.page.getByText(text).first();
  }

  async fillAndSubmit(email: string, password: string): Promise<void> {
    await this.email().fill(email);
    await this.password().fill(password);
    await this.submitButton().click();
  }

  async signIn(persona: Persona): Promise<void> {
    await test.step(`Sign in as ${persona.role} through the form`, async () => {
      // Sign-in is rate limited per client; wait out the limit rather than fail on it.
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.open();
        await this.fillAndSubmit(persona.email, persona.password);
        const moved = await this.page
          .waitForURL((url) => url.pathname !== '/', { timeout: 8_000 })
          .then(() => true)
          .catch(() => false);
        if (moved) return;
        if (!(await this.page.getByText(/Too many sign-in attempts/).isVisible())) break;
        await this.page.waitForTimeout(20_000);
      }
      await this.page.waitForURL((url) => url.pathname !== '/');
    });
  }
}
