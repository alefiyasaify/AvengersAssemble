import { Locator } from '@playwright/test';
import { BasePage } from './base.page';

/** /employee/claims: the employee's own claims. */
export class ClaimsListPage extends BasePage {
  async open(): Promise<void> {
    await this.page.goto('/employee/claims');
  }

  summary(): Locator {
    return this.page.getByRole('region', { name: 'Claims summary' });
  }

  /** The card for a claim, found by its title (unique per test). */
  card(title: string): Locator {
    return this.page.getByRole('region', { name: 'Claims' }).getByText(title, { exact: false }).first();
  }

  newClaimButton(): Locator {
    return this.page.getByRole('button', { name: /new claim/i }).first();
  }

  filter(name: RegExp | string): Locator {
    return this.page.getByRole('group', { name: 'Filter claims' }).getByRole('button', { name });
  }
}
