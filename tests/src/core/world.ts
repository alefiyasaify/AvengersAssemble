import { ApiResult } from '../api/http-client';
import { Batch, BulkResult, Claim } from '../api/types';
import type { App } from '../ui/app';

/** Scratch state for one Gherkin scenario: the claims it created and the last response it saw. */
export class World {
  /** Claims by alias; "claim" is the one most recently created or fetched. */
  readonly claims = new Map<string, Claim>();
  response?: ApiResult<any>;
  bulk?: BulkResult;
  batch?: Batch;
  batchClaimIds: string[] = [];
  batchTotalPaise = 0;
  csv = '';
  title = '';
  /** The browser page of the person currently acting in a UI scenario. */
  app?: App;
  /** Id of the claim the browser form created (UI scenarios). */
  claimId = '';
  lineCount = 0;
  private readonly cleanups: Array<() => Promise<void>> = [];

  get browser(): App {
    if (!this.app) throw new Error('No browser page yet: start with a "signed in to the browser" or "on the sign-in page" step.');
    return this.app;
  }

  get claim(): Claim {
    const c = this.claims.get('claim');
    if (!c) throw new Error('No claim yet in this scenario: add a step that submits one first.');
    return c;
  }

  set claim(value: Claim) {
    this.claims.set('claim', value);
  }

  onCleanup(fn: () => Promise<void>): void {
    this.cleanups.push(fn);
  }

  async runCleanup(): Promise<void> {
    for (const fn of this.cleanups.reverse()) await fn().catch(() => undefined);
  }
}
