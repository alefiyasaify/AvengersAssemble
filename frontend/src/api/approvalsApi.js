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

/** GET /delegations → [DelegationRead] */
export const listDelegations = () => api.get("/delegations");
