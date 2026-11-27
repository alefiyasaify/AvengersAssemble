import { api } from "./httpClient";

// Every state-changing call on a claim sends expected_version (optimistic locking, docs/02).
// A stale version answers 409 CLAIM_VERSION_CONFLICT.

/** GET /claims?scope=mine|team|all&status=&q= → Page<ClaimSummary> */
export const listClaims = (query = {}) => api.get("/claims", { scope: "mine", limit: 100, ...query });

/**
 * GET /claims, following next_cursor until done or `maxPages` pages (100 each) are read.
 * → { items, total, truncated }
 */
export async function listAllClaims(query = {}, maxPages = 10) {
  const items = [];
  let cursor;
  let total = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await listClaims({ ...query, limit: 100, cursor });
    items.push(...res.items);
    total = res.total_estimate;
    cursor = res.next_cursor;
    if (!cursor) return { items, total, truncated: false };
  }
  return { items, total, truncated: true };
}

/** GET /claims/{id} → ClaimDetail (lines + findings, steps, comments, allowed_actions) */
export const getClaim = (claimId) => api.get(`/claims/${claimId}`);

/** POST /claims { title, lines? } → ClaimDetail (a new DRAFT) */
export const createClaim = (title, lines = []) => api.post("/claims", { title, lines });

/** PATCH /claims/{id} { title, expected_version } → ClaimDetail */
export const renameClaim = (claimId, title, version) => api.patch(`/claims/${claimId}`, { title, expected_version: version });

/** POST /claims/{id}/lines → ClaimDetail */
export const addLine = (claimId, line, version) => api.post(`/claims/${claimId}/lines`, { ...line, expected_version: version });

/** PATCH /claims/{id}/lines/{lineId} → ClaimDetail */
export const updateLine = (claimId, lineId, changes, version) =>
  api.patch(`/claims/${claimId}/lines/${lineId}`, { ...changes, expected_version: version });

/** DELETE /claims/{id}/lines/{lineId}?expected_version= → ClaimDetail */
export const deleteLine = (claimId, lineId, version) => api.delete(`/claims/${claimId}/lines/${lineId}`, { expected_version: version });

/** POST /claims/{id}/policy-preview → PolicyPreview (advisory; nothing is stored) */
export const previewPolicy = (claimId) => api.post(`/claims/${claimId}/policy-preview`);

/** POST /claims/{id}/submit → ClaimDetail */
export const submitClaim = (claimId, version) => api.post(`/claims/${claimId}/submit`, { expected_version: version });

/** POST /claims/{id}/resubmit (after a send-back; starts a new round) → ClaimDetail */
export const resubmitClaim = (claimId, version) => api.post(`/claims/${claimId}/resubmit`, { expected_version: version });

/** POST /claims/{id}/withdraw (only before the first approval) → ClaimDetail */
export const withdrawClaim = (claimId, version) => api.post(`/claims/${claimId}/withdraw`, { expected_version: version });

/** POST /claims/{id}/comments { body, line_id? } → CommentRead */
export const addComment = (claimId, body, lineId) => api.post(`/claims/${claimId}/comments`, { body, line_id: lineId ?? null });

/** GET /claims/{id}/timeline → [TimelineEntry] (human-readable audit events for one claim) */
export const getTimeline = (claimId) => api.get(`/claims/${claimId}/timeline`);

/** POST /receipts (multipart, max 5 MB, PDF/JPG/PNG) → ReceiptRead { id, original_name, ... } */
export const uploadReceipt = (file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/receipts", form);
};
