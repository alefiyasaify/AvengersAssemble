import { Locator, expect, test } from '@playwright/test';
import { BasePage } from './base.page';

export type ReviewerArea = 'manager' | 'auditor' | 'head';

/** Side-by-side approver screen: /manager|auditor|head/claims/:id. */
export class ApprovalReviewPage extends BasePage {
  async open(area: ReviewerArea, claimId: string): Promise<void> {
    await this.page.goto(`/${area}/claims/${claimId}`);
  }

  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  approveButton(): Locator {
    return this.page.getByRole('button', { name: /^Approve/ });
  }
  rejectButton(): Locator {
    return this.page.getByRole('button', { name: /^Reject/ });
  }
  sendBackButton(): Locator {
    return this.page.getByRole('button', { name: /^Send back/ });
  }

  lineItems(): Locator {
    return this.page.getByRole('region', { name: 'Line items' });
  }
  approvalChain(): Locator {
    return this.page.getByRole('region', { name: 'Approval chain' });
  }
  cannotActBanner(): Locator {
    return this.page.getByText(/You can.t act on this claim right now/);
  }
  notFound(): Locator {
    return this.page.getByText('Claim not found');
  }

  decisionDialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async approve(area: ReviewerArea, claimId: string): Promise<void> {
    await test.step(`Approve ${claimId} as ${area}`, async () => {
      await this.open(area, claimId);
      await this.approveButton().click();
      await expect(this.toast(/approved/i)).toBeVisible();
    });
  }

  /** Reject / send back both ask for a comment in a dialog. */
  async decideWithComment(kind: 'reject' | 'sendback', comment: string): Promise<void> {
    await (kind === 'reject' ? this.rejectButton() : this.sendBackButton()).click();
    const dialog = this.decisionDialog();
    await dialog.getByLabel('Comment (required)').fill(comment);
    await dialog.getByRole('button', { name: kind === 'reject' ? 'Reject claim' : 'Send back' }).click();
  }

  /** Keyboard shortcuts from the ARD: A approve, R reject, S send back, J/K lines. */
  async press(key: 'a' | 'r' | 's' | 'j' | 'k'): Promise<void> {
    await this.page.keyboard.press(key);
  }
}
