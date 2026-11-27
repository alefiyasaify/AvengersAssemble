import { api } from "./httpClient";

// Batch life cycle: DRAFT (head creates) → VERIFIED (a different user, the auditor) →
// EXPORTED (head; freezes the batch and produces the bank CSV) → PAID (head). Cancel before export.

/** GET /payouts/eligible → [EligibleClaim] (approved claims not yet in a batch) */
export const listEligible = () => api.get("/payouts/eligible");

/** GET /payouts/batches → Page<BatchSummary> */
export const listBatches = () => api.get("/payouts/batches", { limit: 50 });

/** GET /payouts/batches/{id} → BatchRead (with items) */
export const getBatch = (batchId) => api.get(`/payouts/batches/${batchId}`);

/** POST /payouts/batches { claim_ids } → BatchRead (DRAFT) */
export const createBatch = (claimIds) => api.post("/payouts/batches", { claim_ids: claimIds });

/** POST /payouts/batches/{id}/verify → BatchRead (auditor; not the creator) */
export const verifyBatch = (batchId) => api.post(`/payouts/batches/${batchId}/verify`);

/** POST /payouts/batches/{id}/export → BatchRead (only from VERIFIED) */
export const exportBatch = (batchId) => api.post(`/payouts/batches/${batchId}/export`);

/** GET /payouts/batches/{id}/file → the bank CSV as text */
export const downloadBatchFile = (batchId) => api.get(`/payouts/batches/${batchId}/file`, undefined, { as: "text" });

/** POST /payouts/batches/{id}/mark-paid → BatchRead (moves every claim to PAID) */
export const markBatchPaid = (batchId) => api.post(`/payouts/batches/${batchId}/mark-paid`);

/** POST /payouts/batches/{id}/cancel → BatchRead (before export only) */
export const cancelBatch = (batchId) => api.post(`/payouts/batches/${batchId}/cancel`);
