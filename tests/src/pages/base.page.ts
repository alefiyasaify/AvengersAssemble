import { Locator, Page, expect } from '@playwright/test';

/**
 * The frontend exposes no data-testid attributes, so every page object uses what a user (and a
 * screen reader) sees: roles, labels and visible text. Missing labels are findings for the
 * frontend team, not reasons to add ids silently (tests/CLAUDE.md).
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** Document has no horizontal scroll (mobile layout check). */
  async hasHorizontalScroll(): Promise<boolean> {
    return this.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  }

  /** Ant Design toast (message.success / error / warning). */
  toast(text: string | RegExp): Locator {
    return this.page.locator('.ant-message-notice').filter({ hasText: text }).first();
  }

  /** Pick an option of an Ant Design Select that is labelled `label` inside `scope`. */
  protected async pick(scope: Locator | Page, label: string | RegExp, option: string | RegExp): Promise<void> {
    // The <label> wraps the Select, so its accessible name also contains the selected value.
    await scope.getByLabel(label).first().click();
    // Ant Design keeps role=option nodes in a hidden a11y listbox; the clickable items are these.
    await this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: option }).first().click();
  }

  async expectPath(path: RegExp | string): Promise<void> {
    await expect(this.page).toHaveURL(path);
  }
}
