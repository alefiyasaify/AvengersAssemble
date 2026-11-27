import { paiseToCsvAmount } from "./formatMoney";

const HEADER =
  "record_type,txn_ref,beneficiary_name,beneficiary_account,ifsc,amount_inr,currency,payment_mode,value_date,narration,claim_no,employee_code";

const esc = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote fields with separators; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * Mock bank file (header, one detail row per claim, trailer with count and total).
 * In live mode the backend generates it: GET /payouts/batches/{id}/file.
 */
export function buildPayoutCsv(batch, claims) {
  const date = batch.value_date;
  const rows = [
    HEADER,
    ["H", batch.batch_no, "ExpenseFlow Services Pvt Ltd", "000123456789", "MOCK0000001", "", "INR", "", date, "Expense reimbursement batch", "", ""],
    ...claims.map((c, i) => [
      "D",
      `${batch.batch_no}-${String(i + 1).padStart(4, "0")}`,
      c.owner,
      c.account_masked,
      c.ifsc,
      paiseToCsvAmount(c.payable_paise),
      "INR",
      "IMPS",
      date,
      c.claim_no,
      c.claim_no,
      c.employee_code,
    ]),
    ["T", batch.batch_no, "", "", "", paiseToCsvAmount(claims.reduce((s, c) => s + c.payable_paise, 0)), "INR", "", "", `COUNT=${claims.length}`, "", ""],
  ];
  return rows.map((r) => (typeof r === "string" ? r : r.map(esc).join(","))).join("\n");
}

export function payoutFileName(batch) {
  return `EXPFLOW_${batch.batch_no}_${batch.value_date.replace(/-/g, "")}.csv`;
}
