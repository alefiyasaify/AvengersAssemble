import { Locator, expect, test } from '@playwright/test';
import { BasePage } from './base.page';

/** Auditor review queue (/auditor/queue) and the manager/head inboxes share the same table style. */
export class ReviewQueuePage extends BasePage {
  async open(path = '/auditor/queue'): Promise<void> {
    await this.page.goto(path);
  }

  row(claimNo: string): Locator {
    return this.page.getByRole('row').filter({ hasText: claimNo });
  }

  checkbox(claimNo: string): Locator {
    return this.page.getByRole('checkbox', { name: `Select ${claimNo}` });
  }

  search(): Locator {
    return this.page.getByRole('textbox', { name: 'Search claims' });
  }

  async find(claimNo: string): Promise<void> {
    await this.search().fill(claimNo);
    await expect(this.row(claimNo)).toBeVisible();
  }

  async select(claimNos: string[]): Promise<void> {
    for (const no of claimNos) await this.checkbox(no).check();
  }

  bulkApproveButton(count: number): Locator {
    return this.page.getByRole('button', { name: `Approve ${count}` });
  }

  async bulkApprove(count: number): Promise<void> {
    await test.step(`Bulk approve ${count} selected claims`, async () => {
      await this.bulkApproveButton(count).click();
    });
  }

  tab(name: RegExp | string): Locator {
    return this.page.getByRole('group', { name: 'Queue filter' }).getByRole('button', { name });
  }

  emptyState(): Locator {
    return this.page.getByText('Nothing in this queue.');
  }
}

/** Manager and head approval inbox. */
export class InboxPage extends BasePage {
  async open(path = '/manager/inbox'): Promise<void> {
    await this.page.goto(path);
  }

  row(claimNo: string): Locator {
    return this.page.getByRole('row').filter({ hasText: claimNo });
  }

  emptyState(): Locator {
    return this.page.getByText('Inbox zero. Nothing is waiting on you.');
  }
}
