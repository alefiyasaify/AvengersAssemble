import { api } from "./httpClient";

/**
 * GET /review-queue → Page<ClaimSummary>
 * Filters: flag (policy rule code), department_id, category, sample_audit, min/max_payable_paise, q.
 */
export const getReviewQueue = (filters = {}) => api.get("/review-queue", { limit: 100, ...filters });

/** POST /review-queue/bulk-approve { items: [{ claim_id, expected_version }] } → BulkApproveResult (max 50) */
export const bulkApprove = (claims, comment) =>
  api.post("/review-queue/bulk-approve", {
    items: claims.map((c) => ({ claim_id: c.id, expected_version: c.version })),
    comment: comment || null,
  });

/** GET /sample-audits?status= → Page<SampleAuditRead> */
export const listSampleAudits = (status) => api.get("/sample-audits", { status, limit: 100 });

/** POST /sample-audits/{id}/resolve { result: PASSED|FAILED, note? } → SampleAuditRead */
export const resolveSampleAudit = (sampleId, result, note) => api.post(`/sample-audits/${sampleId}/resolve`, { result, note: note || null });
