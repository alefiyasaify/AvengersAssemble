// Display vocabulary for UPPER_SNAKE enum values from the API. Tones map to .chip-* classes.

export const CLAIM_STATUS = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_MANAGER: { label: "With manager", tone: "info" },
  PENDING_AUDITOR: { label: "With auditor", tone: "info" },
  PENDING_FINANCE_HEAD: { label: "With finance head", tone: "info" },
  SENT_BACK: { label: "Sent back", tone: "warn" },
  APPROVED: { label: "Approved", tone: "ok" },
  AUTO_APPROVED: { label: "Auto-approved", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  PAID: { label: "Paid", tone: "ok" },
};

export function claimStatus(code) {
  return CLAIM_STATUS[code] ?? { label: code, tone: "neutral" };
}

export const AUDIT_ACTION_TONE = {
  PAYOUT_BATCH_CREATED: "neutral",
  STEP_APPROVED: "info",
  BATCH_VERIFIED: "ok",
  SAMPLE_SELECTED: "warn",
  CLAIM_SUBMITTED: "neutral",
  POLICY_EVALUATED: "neutral",
  DELEGATION_CREATED: "info",
  POLICY_PUBLISHED: "warn",
};

export const RULE_OUTCOME = {
  REJECT_LINE: { label: "Reject line", tone: "bad" },
  ROUTE_HIGH: { label: "Route, high", tone: "warn" },
  ROUTE: { label: "Route", tone: "warn" },
  FLAG: { label: "Flag", tone: "info" },
};

export const ROLE_LABEL = {
  EMPLOYEE: "Employee",
  MANAGER: "Line manager",
  AUDITOR: "Finance auditor",
  FINANCE_HEAD: "Finance head",
};
