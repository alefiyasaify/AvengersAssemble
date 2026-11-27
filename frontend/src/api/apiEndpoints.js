// API reference: every endpoint the UI uses, from the ARD section 8 endpoint list (ADR-0011).
// Paths are relative to /api/v1. Only health/version exist in backend/openapi.json today; the rest
// are served by src/mocks until the backend implements them (set VITE_USE_MOCKS=false to go live).
//
// Conventions (docs/02): money in integer paise (`*_paise`), snake_case fields, UPPER_SNAKE enums,
// cursor lists `{ items, next_cursor, total_estimate }`, error envelope `{ error: { code, ... } }`,
// state-changing claim calls send `expected_version`, mutations accept `Idempotency-Key`.

export const ENDPOINTS = {
  // Auth
  me: { method: "GET", path: "/me", who: "All" },
  login: { method: "POST", path: "/auth/login", who: "All" },
  logout: { method: "POST", path: "/auth/logout", who: "All" },

  // Claims
  listClaims: { method: "GET", path: "/claims", who: "All (employees get own only)" },
  createClaim: { method: "POST", path: "/claims", who: "All" },
  getClaim: { method: "GET", path: "/claims/{id}", who: "Owner, assigned approver, auditor, head" },
  updateClaim: { method: "PATCH", path: "/claims/{id}", who: "Owner (DRAFT or SENT_BACK)" },
  addLine: { method: "POST", path: "/claims/{id}/lines", who: "Owner" },
  updateLine: { method: "PATCH", path: "/claims/{id}/lines/{line_id}", who: "Owner" },
  deleteLine: { method: "DELETE", path: "/claims/{id}/lines/{line_id}", who: "Owner" },
  policyPreview: { method: "POST", path: "/claims/{id}/policy-preview", who: "Owner" },
  submitClaim: { method: "POST", path: "/claims/{id}/submit", who: "Owner" },
  resubmitClaim: { method: "POST", path: "/claims/{id}/resubmit", who: "Owner" },
  withdrawClaim: { method: "POST", path: "/claims/{id}/withdraw", who: "Owner" },
  claimTimeline: { method: "GET", path: "/claims/{id}/timeline", who: "As view" },
  addComment: { method: "POST", path: "/claims/{id}/comments", who: "Owner, approvers" },

  // Receipts
  uploadReceipt: { method: "POST", path: "/receipts", who: "All (multipart, max 5 MB)" },
  receiptFile: { method: "GET", path: "/receipts/{id}/file", who: "As claim view" },

  // Approvals and delegation
  approvalInbox: { method: "GET", path: "/approvals/inbox", who: "Approvers" },
  approveStep: { method: "POST", path: "/approvals/{step_id}/approve", who: "Assigned approver" },
  rejectStep: { method: "POST", path: "/approvals/{step_id}/reject", who: "Assigned approver" },
  sendBackStep: { method: "POST", path: "/approvals/{step_id}/send-back", who: "Assigned approver" },
  listDelegations: { method: "GET", path: "/delegations", who: "Approvers" },
  createDelegation: { method: "POST", path: "/delegations", who: "Approvers" },
  deleteDelegation: { method: "DELETE", path: "/delegations/{id}", who: "Approvers" },

  // Review queue and sample audit
  reviewQueue: { method: "GET", path: "/review-queue", who: "Auditor, head" },
  bulkApprove: { method: "POST", path: "/review-queue/bulk-approve", who: "Auditor, head" },
  sampleAudits: { method: "GET", path: "/sample-audits", who: "Auditor, head" },
  resolveSampleAudit: { method: "POST", path: "/sample-audits/{id}/resolve", who: "Auditor, head" },

  // Payouts
  payoutEligible: { method: "GET", path: "/payouts/eligible", who: "Head" },
  createBatch: { method: "POST", path: "/payouts/batches", who: "Head" },
  listBatches: { method: "GET", path: "/payouts/batches", who: "Head, auditor" },
  getBatch: { method: "GET", path: "/payouts/batches/{id}", who: "Head, auditor" },
  verifyBatch: { method: "POST", path: "/payouts/batches/{id}/verify", who: "Auditor (not creator)" },
  exportBatch: { method: "POST", path: "/payouts/batches/{id}/export", who: "Head" },
  batchFile: { method: "GET", path: "/payouts/batches/{id}/file", who: "Head, auditor" },
  markBatchPaid: { method: "POST", path: "/payouts/batches/{id}/mark-paid", who: "Head" },

  // Dashboard and audit
  dashboardSummary: { method: "GET", path: "/dashboard/summary", who: "By role scope" },
  auditEvents: { method: "GET", path: "/audit-events", who: "Auditor, head" },

  // Admin
  policyVersions: { method: "GET", path: "/admin/policy/versions", who: "Head" },
  createPolicyVersion: { method: "POST", path: "/admin/policy/versions", who: "Head" },
  updatePolicyVersion: { method: "PUT", path: "/admin/policy/versions/{id}", who: "Head" },
  publishPolicyVersion: {
    method: "POST",
    path: "/admin/policy/versions/{id}/publish",
    who: "Head",
  },
  approvalLevels: { method: "GET", path: "/admin/approval-levels", who: "Head" },
  adminConfig: { method: "GET", path: "/admin/config", who: "Head" },
};

/** "/claims/{id}" + { id: "x" } -> "/claims/x" */
export function buildPath(path, params = {}) {
  return path.replace(/\{(\w+)\}/g, (_, key) => {
    if (params[key] === undefined) throw new Error(`Missing path param "${key}" for ${path}`);
    return encodeURIComponent(params[key]);
  });
}
