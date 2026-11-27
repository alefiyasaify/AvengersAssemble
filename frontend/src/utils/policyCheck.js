// Client-side ADVISORY policy check, mirroring POST /claims/{id}/policy-preview so the New claim
// screen can react as the employee types. The backend stays authoritative on submit.
// Limits come from the policy version passed in (GET /admin/policy/versions), never hard-coded here.

/** @typedef {{ code: string, label: string, detail: string, tone: "ok"|"warn"|"bad"|"info" }} Finding */

function isWeekend(isoDate) {
  if (!isoDate) return false;
  const day = new Date(`${isoDate}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function daysBetween(isoDate, today) {
  const ms = new Date(`${today}T00:00:00`) - new Date(`${isoDate}T00:00:00`);
  return Math.floor(ms / 86_400_000);
}

/**
 * Evaluate one line. "Above X" means strictly greater than X (CLAUDE.md business rules).
 * @returns {{ outcome: "OK"|"FLAG"|"REJECT", findings: Finding[] }}
 */
export function evaluateLine(line, policy, { today, otherLines = [] } = {}) {
  const findings = [];
  const amount = line.amount_paise ?? 0;
  const limits = policy.limits;

  const cap = (() => {
    switch (line.category) {
      case "MEALS":
        return { value: limits.meals_daily_paise, what: "daily meals limit" };
      case "HOTEL":
        return line.city_tier === 1
          ? { value: limits.hotel_tier1_night_paise, what: "tier-1 nightly limit" }
          : { value: limits.hotel_other_night_paise, what: "nightly limit" };
      case "LOCAL_CAB":
        return { value: limits.cab_trip_paise, what: "per-trip limit" };
      default:
        return null;
    }
  })();

  if (cap) {
    const nights = line.category === "HOTEL" ? Math.max(1, line.nights ?? 1) : 1;
    const allowed = cap.value * nights;
    if (amount > allowed) {
      findings.push({
        code: "OVER_LIMIT",
        label: "Over limit",
        detail: `Above the ${cap.what}.`,
        tone: "bad",
      });
    } else if (amount > 0) {
      findings.push({
        code: "WITHIN_LIMIT",
        label: "Within limit",
        detail: `Inside the ${cap.what}.`,
        tone: "ok",
      });
    }
  }

  if (amount > limits.receipt_required_above_paise && !line.receipt_id) {
    findings.push({
      code: "RECEIPT_MISSING",
      label: "No receipt",
      detail: "Lines above the receipt threshold need a receipt. Without one this line is rejected.",
      tone: "bad",
    });
  }

  const dup = otherLines.find(
    (o) =>
      o !== line &&
      o.vendor &&
      o.vendor.trim().toLowerCase() === (line.vendor ?? "").trim().toLowerCase() &&
      o.amount_paise === amount &&
      o.expense_date === line.expense_date,
  );
  if (dup && amount > 0) {
    findings.push({
      code: "DUPLICATE",
      label: "Possible duplicate",
      detail: "Same vendor, amount and date as another line.",
      tone: "warn",
    });
  }

  if (isWeekend(line.expense_date)) {
    findings.push({
      code: "WEEKEND",
      label: "Weekend · flagged",
      detail: "Dated on a weekend. Your manager will see a weekend flag.",
      tone: "warn",
    });
  }

  if (today && line.expense_date && daysBetween(line.expense_date, today) > limits.stale_after_days) {
    findings.push({
      code: "STALE",
      label: "Older than policy allows",
      detail: `Expenses older than ${limits.stale_after_days} days are rejected.`,
      tone: "bad",
    });
  }

  const outcome = findings.some((f) => f.tone === "bad")
    ? "REJECT"
    : findings.some((f) => f.tone === "warn")
      ? "FLAG"
      : "OK";
  return { outcome, findings };
}

/** Which approval steps a payable total needs (ADR-0009). */
export function approvalChain(payablePaise, policy) {
  const { auto_approve_up_to_paise, auditor_above_paise, finance_head_above_paise } =
    policy.levels;
  if (payablePaise <= auto_approve_up_to_paise) return ["AUTO_APPROVE"];
  const chain = ["MANAGER"];
  if (payablePaise > auditor_above_paise) chain.push("AUDITOR");
  if (payablePaise > finance_head_above_paise) chain.push("FINANCE_HEAD");
  return chain;
}

/** Whole-claim preview: per-line results, totals and the route it would take. */
export function evaluateClaim(lines, policy, opts = {}) {
  const results = lines.map((line) => ({
    line,
    ...evaluateLine(line, policy, { ...opts, otherLines: lines }),
  }));
  const claimed = lines.reduce((sum, l) => sum + (l.amount_paise ?? 0), 0);
  const payable = results
    .filter((r) => r.outcome !== "REJECT")
    .reduce((sum, r) => sum + (r.line.amount_paise ?? 0), 0);
  const counts = {
    clear: results.filter((r) => r.outcome === "OK").length,
    flagged: results.filter((r) => r.outcome === "FLAG").length,
    rejected: results.filter((r) => r.outcome === "REJECT").length,
  };
  const hasFlags = counts.flagged > 0 || counts.rejected > 0;
  let chain = approvalChain(payable, policy);
  // A clean claim under the limit auto-approves; any flag forces at least the manager.
  if (chain[0] === "AUTO_APPROVE" && hasFlags) chain = ["MANAGER"];
  return { results, claimed, payable, counts, chain };
}
