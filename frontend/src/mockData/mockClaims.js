// Shapes of GET /claims (employee), GET /approvals/inbox and GET /claims/{id}.

export const TODAY = "2026-11-27";

// Employee "My claims" (Aarav Mehta). steps: one entry per chain level, state DONE|CURRENT|WAITING|HOLD.
export const MY_CLAIMS = [
  {
    id: "c-2418",
    claim_no: "EF-2026-002418",
    title: "Client visit – Bengaluru",
    status: "PENDING_MANAGER",
    total_paise: 6200000,
    date_label: "25 Nov",
    step_label: "Manager, then auditor",
    steps: ["CURRENT", "WAITING", "WAITING"],
    note: null,
  },
  {
    id: "c-2403",
    claim_no: "EF-2026-002403",
    title: "Team lunch, Sat 14 Nov",
    status: "SENT_BACK",
    total_paise: 385000,
    date_label: "16 Nov",
    step_label: "Needs your reply",
    steps: ["HOLD", "WAITING", "WAITING"],
    note: "Priya asked: please add the attendee names for this weekend lunch.",
  },
  {
    id: "c-2368",
    claim_no: "EF-2026-002368",
    title: "Cab rides – October",
    status: "PAID",
    total_paise: 294000,
    date_label: "2 Nov",
    step_label: "Paid 12 Nov",
    steps: ["DONE", "DONE", "DONE"],
    note: null,
  },
  {
    id: "c-draft-1",
    claim_no: null,
    title: "Office supplies",
    status: "DRAFT",
    total_paise: 126000,
    date_label: "Saved 24 Nov",
    step_label: "2 lines · not submitted",
    steps: ["WAITING", "WAITING", "WAITING"],
    note: null,
  },
];

export const MY_SUMMARY = { in_review_paise: 6585000, open_count: 2, paid_this_month_paise: 294000 };

// Approval inbox for Priya Nair (includes claims delegated from Ravi Menon).
export const INBOX = [
  { step_id: "s-2310", claim_id: "c-2310", claim_no: "EF-2026-002310", title: "Trade fair stall supplies", owner: "Tanvi Shah", department: "Sales", payable_paise: 1840000, waiting_days: 6, flags: [], delegated_from: "Ravi Menon" },
  { step_id: "s-2421", claim_id: "c-2421", claim_no: "EF-2026-002421", title: "Hackathon team dinner", owner: "Aditya Kulkarni", department: "Engineering", payable_paise: 725000, waiting_days: 2, flags: ["WEEKEND"], delegated_from: null },
  { step_id: "s-2425", claim_id: "c-2425", claim_no: "EF-2026-002425", title: "Partner workshop – Hyderabad", owner: "Rohan Desai", department: "Engineering", payable_paise: 6155000, waiting_days: 2, flags: ["DUPLICATE", "WEEKEND", "OVER_LIMIT"], delegated_from: "Ravi Menon" },
  { step_id: "s-2418", claim_id: "c-2418", claim_no: "EF-2026-002418", title: "Client visit – Bengaluru", owner: "Aarav Mehta", department: "Engineering", payable_paise: 6200000, waiting_days: 2, flags: [], delegated_from: null },
  { step_id: "s-2427", claim_id: "c-2427", claim_no: "EF-2026-002427", title: "Cloud certification exam", owner: "Sneha Iyer", department: "Engineering", payable_paise: 1499900, waiting_days: 1, flags: [], delegated_from: null },
  { step_id: "s-2430", claim_id: "c-2430", claim_no: "EF-2026-002430", title: "Customer site visit, Pune", owner: "Manish Gupta", department: "Engineering", payable_paise: 986000, waiting_days: 0, flags: [], delegated_from: "Ravi Menon" },
];

// Full detail for the claim drawn in the "Manager · Claim review" artboard.
export const CLAIM_DETAILS = {
  "c-2425": {
    id: "c-2425",
    claim_no: "EF-2026-002425",
    version: 6,
    title: "Partner workshop – Hyderabad",
    status: "PENDING_MANAGER",
    owner: { name: "Rohan Desai", initials: "RD", department: "Engineering" },
    submitted_label: "25 Nov",
    waiting_days: 2,
    claimed_total_paise: 6335000,
    payable_total_paise: 6155000,
    rejected_total_paise: 180000,
    risk: { score: 58, band: "MEDIUM" },
    ai_summary:
      "Hotel, flights and workshop fee are in order. A Sunday meal over the ₹1,500 daily limit was rejected and left out. The Ola ride matches a line in EF-2026-002290, which forces the auditor step. The Saturday lunch carries a weekend flag.",
    delegation: { acting_for: "Ravi Menon", until_label: "30 Nov" },
    current_step_id: "s-2425",
    allowed_actions: ["APPROVE", "REJECT", "SEND_BACK", "DELEGATE", "COMMENT"],
    lines: [
      { id: "l1", category: "HOTEL", vendor: "Novotel Hyderabad", date_label: "13–16 Nov · 3 nights", amount_paise: 1740000, findings: [{ label: "Within limit · ₹5,800 a night", tone: "ok" }], rejected: false, receipt: { file_name: "novotel-folio.pdf", hash_unique: true, status: "MATCH" } },
      { id: "l2", category: "AIR", vendor: "IndiGo · BOM–HYD return", date_label: "13 and 16 Nov", amount_paise: 2430000, findings: [{ label: "No cap on this category", tone: "neutral" }], rejected: false, receipt: { file_name: "indigo-pnr.pdf", hash_unique: true, status: "MATCH" } },
      {
        id: "l3",
        category: "MEALS",
        vendor: "Paradise Biryani",
        date_label: "Sat 14 Nov",
        amount_paise: 135000,
        findings: [{ label: "Weekend flag", tone: "warn" }],
        rejected: false,
        receipt: {
          file_name: "paradise-14nov.jpg",
          hash_unique: true,
          status: "WARN",
          merchant: "PARADISE BIRYANI",
          address: "Secunderabad, Hyderabad",
          date_text: "Sat 14/11/2026",
          time_text: "13:42",
          items: [
            ["Chicken biryani x2", "780.00"],
            ["Kebab platter", "300.00"],
            ["Beverages x2", "140.00"],
            ["Taxes", "130.00"],
          ],
          total_text: "1,350.00",
        },
      },
      { id: "l4", category: "LOCAL_CAB", vendor: "Ola", date_label: "Fri 13 Nov", amount_paise: 165000, findings: [{ label: "Duplicate of EF-2026-002290", tone: "bad" }, { label: "Forces auditor", tone: "neutral" }], rejected: false, receipt: { file_name: "ola-13nov.png", hash_unique: false, status: "BAD" } },
      { id: "l5", category: "OTHER", vendor: "Workshop registration", date_label: "13 Nov", amount_paise: 1685000, findings: [{ label: "Receipt attached", tone: "ok" }], rejected: false, receipt: { file_name: "workshop-invoice.pdf", hash_unique: true, status: "MATCH" } },
      { id: "l6", category: "MEALS", vendor: "Barbeque Nation", date_label: "Sun 15 Nov", amount_paise: 180000, findings: [{ label: "Rejected: over ₹1,500 daily limit", tone: "bad" }, { label: "Not payable", tone: "neutral" }], rejected: true, receipt: { file_name: "bbq-15nov.jpg", hash_unique: true, status: "BAD" } },
    ],
    steps: [
      { level: 1, role: "Manager", initials: "PN", note: "Ravi Menon, delegated to you", state: "CURRENT" },
      { level: 2, role: "Auditor", initials: "2", note: "Needed: above ₹25,000, and the duplicate forces it", state: "WAITING" },
      { level: 3, role: "Finance head", initials: "3", note: "Not needed: below ₹1,00,000", state: "SKIPPED" },
    ],
    comments: [
      { id: "cm1", author: "Rohan Desai", initials: "RD", context: "line 3 · 25 Nov", body: "Partner lunch, Saturday was the only day they were free. Receipt attached." },
    ],
  },
};

/** Minimal detail for inbox claims that the design does not draw in full. */
export function fallbackDetail(item) {
  return {
    id: item.claim_id,
    claim_no: item.claim_no,
    version: 3,
    title: item.title,
    status: "PENDING_MANAGER",
    owner: {
      name: item.owner,
      initials: item.owner.split(" ").map((p) => p[0]).join(""),
      department: item.department,
    },
    submitted_label: `${Math.max(1, item.waiting_days)} days ago`,
    waiting_days: item.waiting_days,
    claimed_total_paise: item.payable_paise,
    payable_total_paise: item.payable_paise,
    rejected_total_paise: 0,
    risk: { score: 18, band: "LOW" },
    ai_summary: "All lines are inside policy and every receipt matches its line.",
    delegation: item.delegated_from ? { acting_for: item.delegated_from, until_label: "30 Nov" } : null,
    current_step_id: item.step_id,
    allowed_actions: ["APPROVE", "REJECT", "SEND_BACK", "DELEGATE", "COMMENT"],
    lines: [
      { id: "l1", category: "OTHER", vendor: item.title, date_label: "This month", amount_paise: item.payable_paise, findings: [{ label: "Receipt attached", tone: "ok" }], rejected: false, receipt: { file_name: "receipt.pdf", hash_unique: true, status: "MATCH" } },
    ],
    steps: [
      { level: 1, role: "Manager", initials: "PN", note: item.delegated_from ? `${item.delegated_from}, delegated to you` : "You", state: "CURRENT" },
      { level: 2, role: "Auditor", initials: "2", note: item.payable_paise > 2500000 ? "Needed: above ₹25,000" : "Not needed: ₹25,000 or below", state: item.payable_paise > 2500000 ? "WAITING" : "SKIPPED" },
      { level: 3, role: "Finance head", initials: "3", note: "Not needed: below ₹1,00,000", state: "SKIPPED" },
    ],
    comments: [],
  };
}

// Starting state of the "New claim" artboard (a saved draft).
export const NEW_CLAIM_DRAFT = {
  id: "c-draft-2",
  version: 1,
  title: "Client visit – Bengaluru, 19–21 Nov",
  lines: [
    { key: "n1", category: "MEALS", vendor: "Truffles", amount_paise: 135000, expense_date: "2026-11-21", receipt_id: "r-1", receipt_name: "truffles-21nov.jpg" },
    { key: "n2", category: "HOTEL", vendor: "Taj Vivanta, Bengaluru", amount_paise: 540000, expense_date: "2026-11-19", city_tier: 1, nights: 1, receipt_id: "r-2", receipt_name: "taj-folio.pdf" },
    { key: "n3", category: "LOCAL_CAB", vendor: "Uber", amount_paise: 64000, expense_date: "2026-11-20", receipt_id: null, receipt_name: null },
  ],
};
