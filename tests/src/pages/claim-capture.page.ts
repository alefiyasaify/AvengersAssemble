import { Locator, expect, test } from '@playwright/test';
import { LineInput } from '../api/types';
import { BasePage } from './base.page';

const CATEGORY_LABEL = { MEALS: 'Meals', HOTEL: 'Hotel', LOCAL_CAB: 'Local cab', TRAVEL: 'Travel', OTHER: 'Other' } as const;

/** "2025-11-05" -> "5 Nov 2025", the format of the date picker. */
const pickerDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${d} ${mon} ${y}`;
};

/** The employee's claim form: /employee/claims/new and /employee/claims/:id. */
export class ClaimCapturePage extends BasePage {
  async open(): Promise<void> {
    await this.page.goto('/employee/claims/new');
    await expect(this.title()).toBeVisible();
  }

  async openClaim(claimId: string): Promise<void> {
    await this.page.goto(`/employee/claims/${claimId}`);
  }

  title(): Locator {
    return this.page.getByLabel('Claim title');
  }

  async setTitle(title: string): Promise<void> {
    await this.title().fill(title);
  }

  lineCards(): Locator {
    return this.page.getByRole('region', { name: /^Line \d+,/ });
  }

  lineCard(index: number): Locator {
    return this.page.getByRole('region', { name: new RegExp(`^Line ${index},`) });
  }

  /** Fills line `index` (1-based). The form starts with one empty line; use addLineButton for more. */
  async fillLine(index: number, line: LineInput): Promise<void> {
    await test.step(`Fill line ${index}: ${line.category} ${line.amountPaise / 100}`, async () => {
      const card = this.lineCard(index);
      await expect(card).toBeVisible();
      await this.pick(card, 'Category', CATEGORY_LABEL[line.category]);
      // The card is renamed when the category changes, so re-resolve it by position.
      const fresh = this.lineCard(index);
      const date = fresh.getByLabel('Date');
      await date.fill(pickerDate(line.date));
      await date.press('Enter');
      await fresh.getByLabel('Amount (₹)').fill(String(line.amountPaise / 100));
      await fresh.getByLabel('Vendor').fill(line.vendor);
      if (line.category === 'HOTEL') {
        await this.pick(fresh, 'City', new RegExp(`^${line.city}`));
        await fresh.getByLabel('Nights').fill(String(line.nights ?? 1));
      }
      await fresh.getByLabel('What was it for?').fill(line.description);
      if (line.receipt) {
        await fresh.locator('input[type="file"]').first().setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: line.receipt });
        await expect(fresh.getByText('Receipt uploaded')).toBeVisible();
      }
    });
  }

  amountField(index: number): Locator {
    return this.lineCard(index).getByLabel('Amount (₹)');
  }

  addLineButton(): Locator {
    return this.page.getByRole('button', { name: /add line item/i });
  }

  async addLine(line: LineInput, index: number): Promise<void> {
    await this.addLineButton().click();
    await this.fillLine(index, line);
  }

  saveDraftButton(): Locator {
    return this.page.getByRole('button', { name: 'Save draft' });
  }

  reviewButton(): Locator {
    return this.page.getByRole('button', { name: /review and (re)?submit/i });
  }

  async saveDraft(): Promise<string> {
    await this.saveDraftButton().click();
    await expect(this.toast('Draft saved')).toBeVisible();
    await this.page.waitForURL(/\/employee\/claims\/[0-9a-f-]{36}$/);
    return this.claimId();
  }

  claimId(): string {
    const match = /\/employee\/claims\/([0-9a-f-]{36})/.exec(new URL(this.page.url()).pathname);
    if (!match) throw new Error(`no claim id in URL ${this.page.url()}`);
    return match[1];
  }

  /** Review modal (server-side policy preview) -> confirm. Lands on My claims. */
  async submit(): Promise<void> {
    await test.step('Review and submit the claim', async () => {
      await this.reviewButton().click();
      const modal = this.reviewModal();
      await expect(modal).toBeVisible();
      await modal.getByRole('button', { name: /^(Resubmit|Submit) claim$/ }).click();
      await this.page.waitForURL(/\/employee\/claims$/);
    });
  }

  reviewModal(): Locator {
    return this.page.getByRole('dialog', { name: /Review before you (re)?submit/ });
  }

  /** Inline policy finding under a line, e.g. the meals limit. */
  advisory(text: string | RegExp): Locator {
    return this.page.getByText(text).first();
  }
}
