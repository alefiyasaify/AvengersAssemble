import { api } from "./httpClient";

/** GET /approvals/inbox → Page<InboxItem> (steps assigned to me or delegated to me) */
export const getInbox = () => api.get("/approvals/inbox", { limit: 100 });

/** POST /approvals/{stepId}/approve { comment?, expected_version } → ClaimDetail */
export const approveStep = (stepId, version, comment) =>
  api.post(`/approvals/${stepId}/approve`, { comment: comment || null, expected_version: version });

/** POST /approvals/{stepId}/reject { comment, expected_version } → ClaimDetail (comment required) */
export const rejectStep = (stepId, version, comment) => api.post(`/approvals/${stepId}/reject`, { comment, expected_version: version });

/** POST /approvals/{stepId}/send-back { comment, expected_version, line_ids? } → ClaimDetail */
export const sendBackStep = (stepId, version, comment, lineIds = []) =>
  api.post(`/approvals/${stepId}/send-back`, { comment, expected_version: version, line_ids: lineIds });

/** GET /delegations → [DelegationRead] (ones I gave and ones given to me) */
export const listDelegations = () => api.get("/delegations");

/**
 * POST /delegations { delegate_id, level_no, starts_at, ends_at } → DelegationRead
 * Backend rules: a level you approve at; delegate has the same or a higher role; end in the
 * future; at most delegation_max_days long; one per level in overlapping dates.
 */
export const createDelegation = ({ delegateId, levelNo, startsAt, endsAt }) =>
  api.post("/delegations", { delegate_id: delegateId, level_no: levelNo, starts_at: startsAt, ends_at: endsAt });

/** DELETE /delegations/{id} → DelegationRead (revoked; only your own) */
export const revokeDelegation = (delegationId) => api.delete(`/delegations/${delegationId}`);
