// Shapes of GET /review-queue, /payouts/*, /dashboard/summary and /audit-events.

export const REVIEW_QUEUE = {
  counts: { ALL: 38, DUPLICATE: 6, SPLIT_SUSPECT: 11, SAMPLE_AUDIT: 9, PAST_SLA: 4 },
  total_estimate: 38,
  next_cursor: "b3BhcXVlLTI",
  items: [
    { id: "c-2409", claim_no: "EF-2026-002409", title: "Sales offsite travel", stage: "Manager approved", owner: "Neha Kapoor", department: "Sales", category: "Travel", payable_paise: 4860000, flags: [], risk_score: 18, waiting_days: 1, past_sla: false },
    { id: "c-2412", claim_no: "EF-2026-002412", title: "Vendor audit trip, Pune", stage: "Manager approved", owner: "Sameer Khan", department: "Operations", category: "Travel", payable_paise: 2780000, flags: ["WEEKEND"], risk_score: 44, waiting_days: 1, past_sla: false },
    { id: "c-2414", claim_no: "EF-2026-002414", title: "Training course fee", stage: "Manager approved", owner: "Divya Pillai", department: "Legal", category: "Other", payable_paise: 3125000, flags: [], risk_score: 22, waiting_days: 3, past_sla: false },
    { id: "c-2416", claim_no: "EF-2026-002416", title: "Client dinner series", stage: "Manager approved", owner: "Ishita Rao", department: "Marketing", category: "Meals", payable_paise: 2640000, flags: ["SPLIT_SUSPECT", "WEEKEND"], risk_score: 71, waiting_days: 1, past_sla: false },
    { id: "c-2419", claim_no: "EF-2026-002419", title: "Conference travel, Chennai", stage: "Manager approved", owner: "Arjun Bhat", department: "Engineering", category: "Travel", payable_paise: 3990000, flags: [], risk_score: 15, waiting_days: 2, past_sla: false },
    { id: "c-2420", claim_no: "EF-2026-002420", title: "Hotel block, Mumbai", stage: "Manager approved", owner: "Anjali Verma", department: "HR", category: "Hotel", payable_paise: 2970000, flags: ["DUPLICATE"], risk_score: 88, waiting_days: 4, past_sla: true },
    { id: "c-2388", claim_no: "EF-2026-002388", title: "Taxi and meals, October", stage: "Auto-approved", owner: "Vikram Singh", department: "Operations", category: "Local cab", payable_paise: 342000, flags: ["SAMPLE_AUDIT"], risk_score: 30, waiting_days: 2, past_sla: false },
    { id: "c-2391", claim_no: "EF-2026-002391", title: "Laptop accessories", stage: "Manager approved", owner: "Karthik Rao", department: "Engineering", category: "Other", payable_paise: 2815000, flags: [], risk_score: 20, waiting_days: 1, past_sla: false },
  ],
};

export const PAYOUT_ELIGIBLE = [
  { id: "c-2377", claim_no: "EF-2026-002377", owner: "Neha Kapoor", department: "Sales", employee_code: "E00117", payable_paise: 845000, approval: "AUTO_APPROVED", bank_ok: true, account_masked: "XXXXXXXX4821", ifsc: "MOCK0000123" },
  { id: "c-2381", claim_no: "EF-2026-002381", owner: "Rohan Desai", department: "Engineering", employee_code: "E00092", payable_paise: 3120000, approval: "AUDITOR_APPROVED", bank_ok: true, account_masked: "XXXXXXXX9034", ifsc: "MOCK0000456" },
  { id: "c-2385", claim_no: "EF-2026-002385", owner: "Ishita Rao", department: "Marketing", employee_code: "E00140", payable_paise: 498000, approval: "MANAGER_APPROVED", bank_ok: true, account_masked: "XXXXXXXX1177", ifsc: "MOCK0000789" },
  { id: "c-2389", claim_no: "EF-2026-002389", owner: "Vikram Singh", department: "Operations", employee_code: "E00063", payable_paise: 11250000, approval: "FINANCE_HEAD_APPROVED", bank_ok: true, account_masked: "XXXXXXXX3390", ifsc: "MOCK0000321" },
  { id: "c-2392", claim_no: "EF-2026-002392", owner: "Anjali Verma", department: "HR", employee_code: "E00155", payable_paise: 234000, approval: "AUTO_APPROVED", bank_ok: true, account_masked: "XXXXXXXX6402", ifsc: "MOCK0000654" },
  { id: "c-2394", claim_no: "EF-2026-002394", owner: "Nikhil Joshi", department: "Sales", employee_code: "E00171", payable_paise: 2780000, approval: "MANAGER_APPROVED", bank_ok: false, account_masked: null, ifsc: null },
  { id: "c-2396", claim_no: "EF-2026-002396", owner: "Divya Pillai", department: "Legal", employee_code: "E00088", payable_paise: 672500, approval: "MANAGER_APPROVED", bank_ok: true, account_masked: "XXXXXXXX2215", ifsc: "MOCK0000987" },
  { id: "c-2399", claim_no: "EF-2026-002399", owner: "Arjun Bhat", department: "Engineering", employee_code: "E00104", payable_paise: 1515000, approval: "MANAGER_APPROVED", bank_ok: true, account_masked: "XXXXXXXX5568", ifsc: "MOCK0000246" },
];

export const APPROVAL_LABEL = {
  AUTO_APPROVED: "Auto-approved",
  MANAGER_APPROVED: "Manager approved",
  AUDITOR_APPROVED: "Auditor approved",
  FINANCE_HEAD_APPROVED: "Finance head approved",
};

export const PAYOUT_BATCHES = [
  {
    id: "pb-8",
    batch_no: "PB-2026-0008",
    status: "VERIFIED",
    created_by: "Meera Iyer",
    verified_by: "Karan Shah",
    verified_label: "27 Nov",
    created_label: "27 Nov",
    value_date: "2026-11-30",
    claim_ids: ["c-2377", "c-2381", "c-2385", "c-2389", "c-2392", "c-2396", "c-2399"],
    claim_count: 7,
    total_paise: 18134500,
    excluded: [{ claim_no: "EF-2026-002394", reason: "NO_BANK_DETAILS" }],
  },
  { id: "pb-7", batch_no: "PB-2026-0007", status: "PAID", created_label: "20 Nov", claim_count: 12, total_paise: 29486000 },
  { id: "pb-6", batch_no: "PB-2026-0006", status: "PAID", created_label: "13 Nov", claim_count: 15, total_paise: 34012000 },
];

export const DASHBOARD_SUMMARY = {
  period: "MONTH",
  spend: { current_paise: 386000000, previous_paise: 401000000, previous_label: "October", trend_lakh: [31.4, 34.9, 33.2, 36.8, 40.1, 38.6] },
  attention: [
    { kind: "HIGH_VALUE", title: "3 high-value claims are waiting for you", detail: "Above ₹1,00,000, oldest 2 days", to: "/head/approvals" },
    { kind: "BATCH", title: "Batch PB-2026-0008 is verified", detail: "7 claims, ₹1,81,345, ready to export", to: "/head/payouts" },
    { kind: "POLICY", title: "Policy version 13 is a draft", detail: "1 change waiting to be published", to: "/head/policy" },
  ],
  flags: { total: 97, trend: [14, 19, 22, 17, 25], by_type: { OVER_LIMIT: 41, WEEKEND: 35, DUPLICATE: 12, NO_RECEIPT: 9 } },
  approval_time: { mean_days: 1.4, median_days: 0.9, p90_days: 3.1, trend: [1.9, 1.7, 1.6, 1.5, 1.4] },
  oldest_pending: { claim_no: "EF-2026-002310", days: 6, with: "the manager" },
  categories: ["Travel", "Hotel", "Meals", "Local cab", "Other"],
  by_month: [
    { label: "Jun", lakh: [11.9, 9.0, 4.6, 2.6, 3.3] },
    { label: "Jul", lakh: [13.0, 9.8, 5.0, 2.9, 4.2] },
    { label: "Aug", lakh: [12.4, 9.4, 4.8, 2.8, 3.8] },
    { label: "Sep", lakh: [13.5, 10.3, 5.2, 3.0, 4.8] },
    { label: "Oct", lakh: [15.1, 11.2, 5.8, 3.3, 4.7] },
    { label: "Nov", lakh: [14.2, 10.8, 5.4, 3.1, 5.1] },
  ],
  outcomes: { total: 412, auto_approved_pct: 46, routed_pct: 44, auto_rejected_pct: 10 },
  by_category: [["Travel", 14.2], ["Hotel", 10.8], ["Meals", 5.4], ["Other", 5.1], ["Local cab", 3.1]],
  by_department: [["Sales", 9.8], ["Engineering", 7.9], ["Operations", 5.6], ["Marketing", 4.2], ["Consulting", 3.9], ["HR", 2.6], ["Legal", 2.3], ["Finance", 2.3]],
  violation_rate_pct: 9.4,
  queue_health: [["Manager (6d)", 14], ["Auditor (4d)", 38], ["Head (2d)", 3]],
  longest_waiting: [
    { claim_no: "EF-2026-002310", who: "Tanvi Shah · Sales", with: "With manager", days: 6 },
    { claim_no: "EF-2026-002332", who: "Dev Malhotra · Operations", with: "With auditor", days: 5 },
    { claim_no: "EF-2026-002347", who: "Reema Joseph · Marketing", with: "With finance head", days: 4 },
  ],
  sample_audit: { sampled: 41, passed: 33, failed: 2, pending: 6 },
  violation_by_department: [["Sales", 12.1], ["Operations", 10.4], ["Marketing", 9.8], ["Engineering", 7.2], ["Consulting", 6.9]],
};

export const AUDIT_EVENTS = {
  total_estimate: 4812,
  next_cursor: "b3BhcXVlLWV2",
  chain: { verified: true, checked: 4812, checked_label: "02:00 today" },
  items: [
    { id: 4811, at_label: "27 Nov, 09:41", actor: "Meera Iyer", on_behalf: null, action: "PAYOUT_BATCH_CREATED", claim: "7 claims", detail: "Batch PB-2026-0008, ₹1,81,345", request_id: "req_91b0c4", change: "status   — → DRAFT\nclaims   7", prev_hash: "b27d…41f3", row_hash: "e18a…0c92" },
    { id: 4806, at_label: "27 Nov, 09:12", actor: "Priya Nair", on_behalf: "Ravi Menon", action: "STEP_APPROVED", claim: "EF-2026-002425", detail: "Level 1 approved, moved to auditor", request_id: "req_8f3a21", change: "status   PENDING_MANAGER → PENDING_AUDITOR\nversion  6 → 7\nstep 1   PENDING → APPROVED", prev_hash: "9c41…e07a", row_hash: "b27d…41f3" },
    { id: 4799, at_label: "26 Nov, 17:03", actor: "Karan Shah", on_behalf: null, action: "BATCH_VERIFIED", claim: "7 claims", detail: "Count and total checked", request_id: "req_77d2aa", change: "status   DRAFT → VERIFIED", prev_hash: "41aa…9b10", row_hash: "9c41…e07a" },
    { id: 4790, at_label: "26 Nov, 11:20", actor: "System", on_behalf: "Secure draw 0.07, rate 0.10", action: "SAMPLE_SELECTED", claim: "EF-2026-002388", detail: "Auto-approved claim picked for sample audit", request_id: "req_5521e0", change: "sample   — → PENDING\npayout   HELD", prev_hash: "07fe…aa31", row_hash: "41aa…9b10" },
    { id: 4781, at_label: "25 Nov, 16:48", actor: "Rohan Desai", on_behalf: null, action: "CLAIM_SUBMITTED", claim: "EF-2026-002425", detail: "Policy version 12, 1 line rejected, 2 flags", request_id: "req_3e9f12", change: "status   DRAFT → PENDING_MANAGER\nversion  5 → 6", prev_hash: "c3d0…71e4", row_hash: "07fe…aa31" },
    { id: 4780, at_label: "25 Nov, 16:48", actor: "System", on_behalf: "Policy version 12", action: "POLICY_EVALUATED", claim: "EF-2026-002425", detail: "Duplicate forces auditor level", request_id: "req_3e9f12", change: "levels   [1] → [1, 2]", prev_hash: "5ab9…22c8", row_hash: "c3d0…71e4" },
    { id: 4702, at_label: "24 Nov, 10:05", actor: "Ravi Menon", on_behalf: null, action: "DELEGATION_CREATED", claim: "", detail: "Level 1 to Priya Nair, 24 to 30 Nov", request_id: "req_1c07b5", change: "delegate — → Priya Nair\nwindow   24 Nov → 30 Nov", prev_hash: "f190…6d02", row_hash: "5ab9…22c8" },
    { id: 4588, at_label: "20 Nov, 14:30", actor: "Meera Iyer", on_behalf: null, action: "POLICY_PUBLISHED", claim: "", detail: "Version 12, 1 rule changed", request_id: "req_0a4410", change: "policy   v11 → v12", prev_hash: "8e2c…3f75", row_hash: "f190…6d02" },
  ],
};
