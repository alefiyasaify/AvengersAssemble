// Display vocabulary for UPPER_SNAKE enum values from the API. Tones map to .chip-* classes.

export const CLAIM_STATUS = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_MANAGER: { label: "With manager", tone: "info" },
  PENDING_AUDITOR: { label: "With auditor", tone: "info" },
  PENDING_HEAD: { label: "With finance head", tone: "info" },
  SENT_BACK: { label: "Sent back", tone: "warn" },
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  PAID: { label: "Paid", tone: "ok" },
};

export function claimStatus(code) {
  return CLAIM_STATUS[code] ?? { label: code, tone: "neutral" };
}

export const isPending = (status) => typeof status === "string" && status.startsWith("PENDING_");

export const ROLE_NAME = { MANAGER: "Manager", AUDITOR: "Auditor", FINANCE_HEAD: "Finance head" };

/** Approval step status (StepRead.status). */
export const STEP_STATUS = {
  PENDING: { label: "Waiting", tone: "info" },
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  SENT_BACK: { label: "Sent back", tone: "warn" },
  SKIPPED: { label: "Skipped", tone: "neutral" },
  SUPERSEDED: { label: "Superseded", tone: "neutral" },
};

/** Line status (LineRead.status). */
export const LINE_STATUS = {
  DRAFT: { label: "Draft", tone: "neutral" },
  AUTO_APPROVED: { label: "Clear", tone: "ok" },
  NEEDS_APPROVAL: { label: "Needs approval", tone: "warn" },
  AUTO_REJECTED: { label: "Rejected by policy", tone: "bad" },
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
};

/** Policy rule codes (findings, review-queue flags). */
export const RULE_LABEL = {
  MEALS_DAILY_CAP: "Over meals limit",
  HOTEL_NIGHT_CAP: "Over hotel limit",
  CAB_TRIP_CAP: "Over cab limit",
  RECEIPT_REQUIRED: "No receipt",
  DUPLICATE_LINE: "Duplicate",
  WEEKEND_SPEND: "Weekend",
  SPLIT_SUSPECT: "Split suspect",
  CLAIM_AGE_LIMIT: "Too old",
};

/** Finding outcome (FindingRead.outcome) → chip tone. */
export const OUTCOME_TONE = { REJECT: "bad", ROUTE: "warn", FLAG: "info" };

export const ruleLabel = (code) => RULE_LABEL[code] ?? code;

/** Tone for a rule code shown without its finding (e.g. ClaimSummary.finding_codes). */
export function ruleTone(code) {
  if (["DUPLICATE_LINE", "SPLIT_SUSPECT"].includes(code)) return "bad";
  if (["WEEKEND_SPEND", "CLAIM_AGE_LIMIT"].includes(code)) return "warn";
  return "warn";
}

/** Payout batch status. */
export const BATCH_STATUS = {
  DRAFT: { label: "Draft · needs verifying", tone: "neutral" },
  VERIFIED: { label: "Verified", tone: "info" },
  EXPORTED: { label: "Exported", tone: "warn" },
  PAID: { label: "Paid", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const AUDIT_ACTION_TONE = (action) => {
  if (/REJECT|FAIL|CANCEL/.test(action)) return "bad";
  if (/APPROV|PAID|VERIF|PASS/.test(action)) return "ok";
  if (/SENT_BACK|SAMPLE|FLAG|POLICY/.test(action)) return "warn";
  return "neutral";
};

/** Days (whole) since an ISO timestamp. */
export function daysSince(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export function formatDate(iso, withTime = false) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
