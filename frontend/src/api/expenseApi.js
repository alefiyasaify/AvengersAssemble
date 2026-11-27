// One function per endpoint the UI uses. Each names its endpoint (see endpoints.js) and supplies a
// mock response in the contract shape. Swapping to the real backend needs no change here.

import { callApi, newIdempotencyKey } from "./callApi";
import { ApiError } from "./httpClient";
import { CLAIM_DETAILS, INBOX, MY_CLAIMS, MY_SUMMARY, NEW_CLAIM_DRAFT, fallbackDetail } from "../mockData/mockClaims";
import { AUDIT_EVENTS, DASHBOARD_SUMMARY, PAYOUT_BATCHES, PAYOUT_ELIGIBLE, REVIEW_QUEUE } from "../mockData/mockFinance";
import { POLICY_VERSIONS } from "../mockData/mockPolicy";
import { USERS } from "../mockData/mockUsers";

const notFound = (what) =>
  new ApiError({ status: 404, code: "NOT_FOUND", message: `${what} not found.` });

/* ----------------------------- Auth ----------------------------- */

/** GET /me. In demo mode the persona comes from the role picker. */
export const getMe = (demoRole) => callApi("me", {}, () => USERS[demoRole] ?? USERS.employee);

/* ----------------------------- Claims ----------------------------- */

/** GET /claims (employees get their own only). */
export const listMyClaims = (query = {}) =>
  callApi("listClaims", { query: { limit: 50, ...query } }, () => {
    const items = query.status ? MY_CLAIMS.filter((c) => c.status === query.status) : MY_CLAIMS;
    return { items, next_cursor: null, total_estimate: items.length, summary: MY_SUMMARY };
  });

/** GET /claims/{id} (includes lines, findings, steps, receipts meta). */
export const getClaim = (id) =>
  callApi("getClaim", { params: { id } }, () => {
    if (CLAIM_DETAILS[id]) return CLAIM_DETAILS[id];
    const inboxItem = INBOX.find((i) => i.claim_id === id);
    if (inboxItem) return fallbackDetail(inboxItem);
    throw notFound("Claim");
  });

/** Draft used by the New claim screen (POST /claims creates it; GET returns it). */
export const getNewClaimDraft = () =>
  callApi("getClaim", { params: { id: NEW_CLAIM_DRAFT.id } }, () => NEW_CLAIM_DRAFT);

/** PATCH /claims/{id}: save title and lines while DRAFT. */
export const saveDraft = (id, draft) =>
  callApi(
    "updateClaim",
    { params: { id }, body: { ...draft, expected_version: draft.version } },
    () => ({ ...draft, version: (draft.version ?? 1) + 1 }),
  );

/** POST /claims/{id}/submit: runs the authoritative policy and returns the first step. */
export const submitClaim = (id, version) =>
  callApi(
    "submitClaim",
    { params: { id }, body: { expected_version: version }, idempotencyKey: newIdempotencyKey() },
    () => ({ id, claim_no: "EF-2026-002431", status: "PENDING_MANAGER", version: version + 1 }),
  );

/** POST /claims/{id}/comments */
export const addComment = (id, body) =>
  callApi("addComment", { params: { id }, body: { body } }, () => ({
    id: `cm-${Date.now()}`,
    author: "Priya Nair",
    initials: "PN",
    context: "just now",
    body,
  }));

/* ----------------------------- Approvals ----------------------------- */

/** GET /approvals/inbox: steps assigned to me or delegated to me. */
export const getInbox = () =>
  callApi("approvalInbox", { query: { limit: 50 } }, () => ({
    items: INBOX,
    next_cursor: null,
    total_estimate: INBOX.length,
  }));

/**
 * POST /approvals/{step_id}/approve | reject | send-back.
 * Reject and send-back require a comment (ARD); approve takes an optional one.
 */
export const decideStep = (decision, stepId, { comment, expectedVersion }) => {
  const name = { APPROVE: "approveStep", REJECT: "rejectStep", SEND_BACK: "sendBackStep" }[decision];
  if (decision !== "APPROVE" && !comment?.trim()) {
    return Promise.reject(
      new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        message: "A comment is required.",
        details: { fields: [{ field: "comment", issue: "required" }] },
      }),
    );
  }
  return callApi(
    name,
    {
      params: { step_id: stepId },
      body: { comment: comment || undefined, expected_version: expectedVersion },
      idempotencyKey: newIdempotencyKey(),
    },
    () => ({ step_id: stepId, decision, version: expectedVersion + 1 }),
  );
};

/* ----------------------------- Review queue ----------------------------- */

/** GET /review-queue with filters (flag type, department, category, amount, age). */
export const getReviewQueue = (query = {}) =>
  callApi("reviewQueue", { query: { limit: 50, ...query } }, () => {
    let items = REVIEW_QUEUE.items;
    if (query.flag === "PAST_SLA") items = items.filter((i) => i.past_sla);
    else if (query.flag) items = items.filter((i) => i.flags.includes(query.flag));
    if (query.department) items = items.filter((i) => i.department === query.department);
    if (query.category) items = items.filter((i) => i.category === query.category);
    return { ...REVIEW_QUEUE, items };
  });

/** POST /review-queue/bulk-approve: up to 50 ids, per-item result. */
export const bulkApprove = (claimIds) => {
  if (claimIds.length > 50) {
    return Promise.reject(
      new ApiError({ status: 400, code: "VALIDATION_FAILED", message: "Up to 50 claims per call." }),
    );
  }
  return callApi(
    "bulkApprove",
    { body: { claim_ids: claimIds }, idempotencyKey: newIdempotencyKey() },
    () => ({
      results: claimIds.map((id) => {
        const row = REVIEW_QUEUE.items.find((r) => r.id === id);
        const skipped = row?.flags.includes("DUPLICATE");
        return skipped
          ? { claim_id: id, result: "SKIPPED", reason: "HIGH_SEVERITY_FLAG" }
          : { claim_id: id, result: "APPROVED" };
      }),
    }),
  );
};

/* ----------------------------- Payouts ----------------------------- */

/** GET /payouts/eligible: approved claims not yet in a batch. */
export const getPayoutEligible = () =>
  callApi("payoutEligible", {}, () => ({ items: PAYOUT_ELIGIBLE, next_cursor: null, total_estimate: PAYOUT_ELIGIBLE.length }));

/** GET /payouts/batches */
export const getPayoutBatches = () =>
  callApi("listBatches", {}, () => ({ items: PAYOUT_BATCHES, next_cursor: null, total_estimate: PAYOUT_BATCHES.length }));

/** POST /payouts/batches/{id}/export: only from VERIFIED; freezes the batch. */
export const exportBatch = (id) =>
  callApi("exportBatch", { params: { id }, idempotencyKey: newIdempotencyKey() }, () => {
    const batch = PAYOUT_BATCHES.find((b) => b.id === id);
    if (!batch) throw notFound("Batch");
    if (batch.status !== "VERIFIED" && batch.status !== "EXPORTED") {
      throw new ApiError({ status: 409, code: "ILLEGAL_TRANSITION", message: "Only a verified batch can be exported." });
    }
    batch.status = "EXPORTED";
    return { ...batch };
  });

/** POST /payouts/batches/{id}/mark-paid: moves every claim in the batch to PAID. */
export const markBatchPaid = (id) =>
  callApi("markBatchPaid", { params: { id }, idempotencyKey: newIdempotencyKey() }, () => {
    const batch = PAYOUT_BATCHES.find((b) => b.id === id);
    if (!batch) throw notFound("Batch");
    if (batch.status !== "EXPORTED") {
      throw new ApiError({ status: 409, code: "ILLEGAL_TRANSITION", message: "Export the batch before marking it paid." });
    }
    batch.status = "PAID";
    return { ...batch };
  });

/* ----------------------------- Dashboard, audit, admin ----------------------------- */

/** GET /dashboard/summary?from&to&department&category */
export const getDashboardSummary = (period = "MONTH") =>
  callApi("dashboardSummary", { query: { period } }, () => ({ ...DASHBOARD_SUMMARY, period }));

/** GET /audit-events?claim_id&actor_id&action&from&to */
export const getAuditEvents = (query = {}) =>
  callApi("auditEvents", { query: { limit: 50, ...query } }, () => {
    let items = AUDIT_EVENTS.items;
    if (query.action) items = items.filter((e) => e.action === query.action);
    if (query.actor) items = items.filter((e) => e.actor === query.actor);
    return { ...AUDIT_EVENTS, items };
  });

/** GET /admin/policy/versions */
export const getPolicyVersions = () =>
  callApi("policyVersions", {}, () => ({ items: POLICY_VERSIONS, next_cursor: null, total_estimate: POLICY_VERSIONS.length }));

/** The active version's limits, used by the advisory policy check on the New claim screen. */
export const getActivePolicy = () =>
  callApi("policyVersions", { query: { status: "ACTIVE" } }, () =>
    POLICY_VERSIONS.find((v) => v.status === "ACTIVE"),
  );

/** POST /admin/policy/versions/{id}/publish (atomic). */
export const publishPolicyVersion = (id) =>
  callApi("publishPolicyVersion", { params: { id }, idempotencyKey: newIdempotencyKey() }, () => {
    const target = POLICY_VERSIONS.find((v) => v.id === id);
    if (!target) throw notFound("Policy version");
    if (target.status !== "DRAFT") {
      throw new ApiError({ status: 409, code: "ILLEGAL_TRANSITION", message: "Only a draft can be published." });
    }
    POLICY_VERSIONS.forEach((v) => {
      if (v.status === "ACTIVE") v.status = "RETIRED";
    });
    target.status = "ACTIVE";
    target.published_by = "Meera Iyer";
    target.published_at = new Date().toISOString();
    return { ...target };
  });
