import { Page } from '@playwright/test';
import { Persona } from '../../config/environments';
import { ApprovalReviewPage } from '../pages/approval-review.page';
import { ClaimCapturePage } from '../pages/claim-capture.page';
import { ClaimsListPage } from '../pages/claims-list.page';
import { LoginPage } from '../pages/login.page';
import { InboxPage, ReviewQueuePage } from '../pages/review-queue.page';

/** One browser page with all page objects attached. */
export class App {
  readonly login: LoginPage;
  readonly claims: ClaimsListPage;
  readonly capture: ClaimCapturePage;
  readonly review: ApprovalReviewPage;
  readonly queue: ReviewQueuePage;
  readonly inbox: InboxPage;

  constructor(
    readonly page: Page,
    readonly persona?: Persona,
  ) {
    this.login = new LoginPage(page);
    this.claims = new ClaimsListPage(page);
    this.capture = new ClaimCapturePage(page);
    this.review = new ApprovalReviewPage(page);
    this.queue = new ReviewQueuePage(page);
    this.inbox = new InboxPage(page);
  }
}
