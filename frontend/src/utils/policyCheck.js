// Client-side ADVISORY policy check so the New claim screen can react as the employee types.
// The rules come from GET /policy/active (never hard-coded here). The backend is authoritative:
// POST /claims/{id}/policy-preview and submit run the real engine.
//
// Rule shape (PolicyRuleConfig): { code, type, category, params, outcome: REJECT|ROUTE|FLAG, active, message_template }

/** @typedef {{ code: string, label: string, detail: string, tone: "ok"|"warn"|"bad"|"info", outcome?: string }} Finding */

import { formatINR } from "./formatMoney";

const TONE = { REJECT: "bad", ROUTE: "warn", FLAG: "warn" };

// Python weekday numbers (Mon=0 … Sun=6), as used by the backend's weekend_days param.
function pyWeekday(isoDate) {
  const jsDay = new Date(`${isoDate}T00:00:00`).getDay(); // Sun=0 … Sat=6
  return (jsDay + 6) % 7;
}

function daysBetween(isoDate, today) {
  return Math.floor((new Date(`${today}T00:00:00`) - new Date(`${isoDate}T00:00:00`)) / 86_400_000);
}

function fill(template, values) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (_, key) => (values[key] ?? `{${key}}`));
}

function finding(rule, values, label) {
  return {
    code: rule.code,
    outcome: rule.outcome,
    tone: TONE[rule.outcome] ?? "warn",
    label,
    detail: fill(rule.message_template, values),
  };
}

const applies = (rule, line) => rule.active !== false && (!rule.category || rule.category === line.category);

/**
 * Evaluate one line against the active rules.
 * @param line { category, amount_paise, expense_date, vendor, receipt_id, nights, city_id }
 * @param ctx  { rules, otherLines, today, cityTier: (cityId) => tier|undefined }
 * @returns {{ outcome: "OK"|"FLAG"|"REJECT", findings: Finding[] }}
 */
export function evaluateLine(line, { rules = [], otherLines = [], today, cityTier = () => undefined } = {}) {
  const findings = [];
  const amount = line.amount_paise ?? 0;

  for (const rule of rules) {
    if (!applies(rule, line)) continue;
    const p = rule.params ?? {};

    switch (rule.type) {
      case "daily_cap": {
        // "above" = strictly greater. Sum the same category on the same day within this claim.
        const dayTotal = [line, ...otherLines.filter((o) => o !== line)]
          .filter((o) => o.category === line.category && o.expense_date === line.expense_date)
          .reduce((s, o) => s + (o.amount_paise ?? 0), 0);
        if (dayTotal > p.cap) findings.push(finding(rule, { date: line.expense_date, total: formatINR(dayTotal), cap: formatINR(p.cap) }, "Over daily limit"));
        else if (amount > 0) findings.push({ code: `${rule.code}_OK`, tone: "ok", label: "Within limit", detail: `Daily limit ${formatINR(p.cap)}` });
        break;
      }
      case "per_unit_cap_by_tier": {
        const nights = Math.max(1, line.nights ?? 1);
        const tier = cityTier(line.city_id);
        const capPerUnit = p.cap_by_tier?.[String(tier)] ?? p.cap_by_tier?.default;
        if (capPerUnit === undefined) break;
        const perNight = Math.round(amount / nights);
        if (perNight > capPerUnit) findings.push(finding(rule, { amount_per_night: formatINR(perNight), cap: formatINR(capPerUnit) }, "Over nightly limit"));
        else if (amount > 0) findings.push({ code: `${rule.code}_OK`, tone: "ok", label: "Within limit", detail: `${formatINR(capPerUnit)} per night` });
        break;
      }
      case "per_line_cap":
        if (amount > p.cap) findings.push(finding(rule, { amount: formatINR(amount), cap: formatINR(p.cap) }, "Over limit"));
        else if (amount > 0) findings.push({ code: `${rule.code}_OK`, tone: "ok", label: "Within limit", detail: `Limit ${formatINR(p.cap)}` });
        break;
      case "receipt_required_above":
        if (amount > p.threshold && !line.receipt_id) findings.push(finding(rule, { threshold: formatINR(p.threshold) }, "No receipt"));
        break;
      case "duplicate": {
        const dup = otherLines.find(
          (o) =>
            o !== line &&
            o.vendor &&
            o.vendor.trim().toLowerCase() === (line.vendor ?? "").trim().toLowerCase() &&
            o.amount_paise === amount &&
            o.expense_date === line.expense_date,
        );
        if (dup && amount > 0) findings.push(finding(rule, { match: "another line in this claim" }, "Possible duplicate"));
        break;
      }
      case "weekend_flag":
        if (line.expense_date && (p.weekend_days ?? [5, 6]).includes(pyWeekday(line.expense_date))) {
          const weekday = new Date(`${line.expense_date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long" });
          findings.push(finding(rule, { weekday }, "Weekend"));
        }
        break;
      case "max_age_days":
        if (today && line.expense_date) {
          const age = daysBetween(line.expense_date, today);
          if (age > p.max_age_days) findings.push(finding(rule, { age_days: age, max_age_days: p.max_age_days }, "Too old"));
        }
        break;
      default:
        // split_window and any new rule types are evaluated only by the backend.
        break;
    }
  }

  const outcome = findings.some((f) => f.outcome === "REJECT") ? "REJECT" : findings.some((f) => f.outcome) ? "FLAG" : "OK";
  return { outcome, findings };
}

/** Whole-claim advisory preview: per-line results and totals. The route comes from the server. */
export function evaluateClaim(lines, ctx = {}) {
  const results = lines.map((line) => ({ line, ...evaluateLine(line, { ...ctx, otherLines: lines }) }));
  const claimed = lines.reduce((sum, l) => sum + (l.amount_paise ?? 0), 0);
  const payable = results.filter((r) => r.outcome !== "REJECT").reduce((sum, r) => sum + (r.line.amount_paise ?? 0), 0);
  const counts = {
    clear: results.filter((r) => r.outcome === "OK").length,
    flagged: results.filter((r) => r.outcome === "FLAG").length,
    rejected: results.filter((r) => r.outcome === "REJECT").length,
  };
  return { results, claimed, payable, counts };
}
