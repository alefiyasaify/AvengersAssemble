import { ClaimsService } from './claims.service';
import { ApiResult, HttpClient, itemsOf, mustOk } from './http-client';
import { Claim, DecisionAction, InboxItem } from './types';

export class ApprovalsService {
  constructor(
    private readonly http: HttpClient,
    private readonly claims: ClaimsService,
  ) {}

  async inbox(): Promise<InboxItem[]> {
    return itemsOf<InboxItem>(mustOk(await this.http.get('/api/v1/approvals/inbox', { limit: 100 }), 'inbox'));
  }

  async inboxClaimIds(): Promise<string[]> {
    return (await this.inbox()).map((i) => i.id);
  }

  /** Acts on a specific step id (use for negative and race tests). */
  actRaw(stepId: string, action: DecisionAction, body: { comment?: string; expected_version: number }): Promise<ApiResult<Claim>> {
    return this.http.post(`/api/v1/approvals/${stepId}/${action}`, body);
  }

  /** Acts on the claim's open step as the logged-in user and returns the updated claim. */
  async decide(claimId: string, action: DecisionAction, comment?: string): Promise<Claim> {
    const res = await this.decideRaw(claimId, action, comment);
    mustOk(res, `${action} claim ${claimId}`);
    return this.claims.get(claimId);
  }

  async decideRaw(claimId: string, action: DecisionAction, comment?: string): Promise<ApiResult<Claim>> {
    const claim = await this.claims.get(claimId);
    if (!claim.current_step) throw new Error(`claim ${claim.claim_no} has no open step (status ${claim.status})`);
    return this.actRaw(claim.current_step.id, action, { comment, expected_version: claim.version });
  }

  reassignRaw(stepId: string, assigneeId: string): Promise<ApiResult<unknown>> {
    return this.http.post(`/api/v1/approvals/${stepId}/reassign`, { assignee_id: assigneeId });
  }
}
