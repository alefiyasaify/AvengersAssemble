import { FileTextOutlined, LeftOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Empty, Segmented } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getDashboardSummary } from "../../api/dashboardApi";
import { HorizontalBarList } from "../../components/charts/HorizontalBarList";
import { MonthlyStackedBars, monthsBetween } from "../../components/charts/MonthlyStackedBars";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { SectionTitle } from "../../components/common/SectionTitle";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useCategories } from "../../hooks/useLookups";
import { formatCompactINR, formatINR } from "../../utils/formatMoney";
import { OUTCOME_TONE, ruleLabel } from "../../utils/statusLabels";

// GET /dashboard/summary answers with scope "own" for the signed-in employee, so every figure
// here is about their own claims. queue_health and sample_audit are null for this scope.

const PERIODS = {
  MONTH: { word: "month", label: "Month", start: (d) => d.startOf("month") },
  QUARTER: { word: "quarter", label: "Quarter", start: (d) => d.month(Math.floor(d.month() / 3) * 3).startOf("month") },
  YEAR: { word: "year", label: "Year", start: (d) => d.startOf("year") },
};
const ymd = (d) => d.format("YYYY-MM-DD");

const OUTCOME_TEXT = {
  REJECT: "Line rejected, not paid",
  ROUTE: "Sent for an extra approval",
  FLAG: "Flagged for your approver",
};

function hoursText(h) {
  if (h === null || h === undefined) return "–";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

function StatTile({ value, label, hint }) {
  return (
    <div className="stat-tile">
      <span className="num" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, color: "#0E1424", fontWeight: 600 }}>{label}</span>
        {hint ? <span style={{ fontSize: 12, color: "#5B6475" }}>{hint}</span> : null}
      </span>
    </div>
  );
}

function SpendBody({ summary, trend, period }) {
  const navigate = useNavigate();
  const categories = useCategories();
  const categoryName = (code) => categories.byCode[code] ?? code;
  const word = PERIODS[period].word;

  const total = summary.spend_by_category.reduce((s, c) => s + c.amount_paise, 0);
  const topCategory = [...summary.spend_by_category].sort((a, b) => b.amount_paise - a.amount_paise)[0];
  const at = summary.approval_time;
  const decided = at.auto_approved_count + at.chain_count;
  const v = summary.violations;
  const flaggedLines = Math.round(v.violation_rate * v.submitted_lines);

  return (
    <>
      <div className="claims-summary-row">
        <section className="hero" style={{ borderRadius: 28, padding: 22, gap: 16, boxShadow: "0 18px 36px rgba(31,79,216,.35)" }} aria-label={`Spend this ${word}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="label">My spend this {word}</span>
            <span className="big num">{formatINR(total)}</span>
            <span style={{ fontSize: 13, color: "#DCE6FF" }}>
              {dayjs(summary.date_from).format("D MMM")} to {dayjs(summary.date_to).format("D MMM YYYY")}
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="pill">{v.submitted_lines} lines submitted</span>
            {topCategory ? (
              <span className="pill">
                Most on {categoryName(topCategory.category).toLowerCase()} · {formatCompactINR(topCategory.amount_paise)}
              </span>
            ) : null}
          </div>
        </section>
        <div className="claims-stats">
          <StatTile value={decided} label="Claims decided" hint={`${at.auto_approved_count} approved automatically`} />
          <StatTile value={hoursText(at.mean_hours)} label="Average approval time" hint={at.chain_count ? `Median ${hoursText(at.median_hours)}` : "No claims through approvers yet"} />
          <StatTile value={`${(v.violation_rate * 100).toFixed(0)}%`} label="Lines flagged" hint={`${flaggedLines} of ${v.submitted_lines}`} />
        </div>
      </div>

      {total === 0 && v.submitted_lines === 0 ? (
        <Empty description={`You haven’t submitted any claims this ${word}`}>
          <Button type="primary" onClick={() => navigate("/employee/claims/new")}>
            Start a claim
          </Button>
        </Empty>
      ) : null}

      <div className="band">
        <div className="col" style={{ flex: "1.4 1 440px" }}>
          <SectionTitle title="Spend by month" hint="last six months, stacked by category" />
          {trend ? <MonthlyStackedBars rows={trend.spend_by_month} months={monthsBetween(trend.date_from, trend.date_to)} categoryName={categoryName} format={formatCompactINR} height={240} /> : <Empty />}
        </div>
        <div className="col" style={{ flex: "1 1 320px" }}>
          <SectionTitle title="Spend by category" hint={`this ${word}`} />
          {summary.spend_by_category.length ? (
            <HorizontalBarList
              rows={[...summary.spend_by_category].sort((a, b) => b.amount_paise - a.amount_paise).map((c) => [categoryName(c.category), c.amount_paise])}
              format={formatCompactINR}
            />
          ) : (
            <Empty description="Nothing spent yet" />
          )}
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1 1 440px" }}>
          <SectionTitle title="Policy flags on my lines" hint={`this ${word}`} />
          {v.by_rule.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...v.by_rule]
                .sort((a, b) => b.count - a.count)
                .map((r) => (
                  <div key={r.rule_code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#F3F5FB" }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontWeight: 700 }}>{ruleLabel(r.rule_code)}</span>
                      <span style={{ fontSize: 12, color: "#5B6475" }}>{OUTCOME_TEXT[r.outcome] ?? r.outcome}</span>
                    </span>
                    <StatusChip tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>
                      {r.count} line{r.count === 1 ? "" : "s"}
                    </StatusChip>
                  </div>
                ))}
            </div>
          ) : (
            <Empty description="No policy flags. Every line was within policy." />
          )}
        </div>
        <div className="col" style={{ flex: "1 1 320px" }}>
          <SectionTitle title="How my claims were decided" hint={`this ${word}`} />
          {decided ? (
            <HorizontalBarList
              rows={[
                ["Automatically", at.auto_approved_count],
                ["By approvers", at.chain_count],
              ]}
              format={(n) => String(n)}
              unit="claims"
            />
          ) : (
            <Empty description="No decided claims yet" />
          )}
          <p style={{ fontSize: 12, color: "#5B6475" }}>“Automatically” counts claims approved by policy without an approver (only when auto-approve is switched on). Approval time counts claims that went through approvers.</p>
          <Link to="/employee/claims" style={{ fontWeight: 600, display: "inline-flex", gap: 6, alignItems: "center" }}>
            <FileTextOutlined /> See my claims
          </Link>
        </div>
      </div>
    </>
  );
}

/** /employee/spend: the signed-in person's own spend, from GET /dashboard/summary (scope own). */
export default function MySpendPage() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [period, setPeriod] = useState("MONTH");
  const today = dayjs();
  const range = { from: ymd(PERIODS[period].start(today)), to: ymd(today) };
  const summary = useQuery({ queryKey: ["dashboard", "own", range], queryFn: () => getDashboardSummary(range) });
  const trendRange = { from: ymd(today.subtract(5, "month").startOf("month")), to: ymd(today) };
  const trend = useQuery({ queryKey: ["dashboard", "own", trendRange], queryFn: () => getDashboardSummary(trendRange) });

  const periodToggle = (
    <Segmented aria-label="Period" value={period} onChange={setPeriod} options={Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }))} style={{ border: "1px solid #D5D9E3", padding: 2 }} />
  );
  const body = <LoadingOrError query={summary} rows={10}>{(data) => <SpendBody summary={data} trend={trend.data} period={period} />}</LoadingOrError>;

  if (isDesktop) {
    return (
      <>
        <TopBar left={<span style={{ color: "#0E1424", fontWeight: 700 }}>My spend</span>} />
        <div className="ef-page">
          <PageHeader title="My spend" description="What you’ve claimed, how it was decided, and where policy flagged your lines." extra={periodToggle} />
          {body}
        </div>
      </>
    );
  }

  // Phone layout, matching the other employee screens.
  return (
    <div style={{ padding: "22px 20px 0", display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button className="round-btn" icon={<LeftOutlined />} aria-label="Back to my claims" onClick={() => navigate("/employee/claims")} />
        <h1 style={{ flex: 1, fontSize: 24, fontWeight: 700 }}>My spend</h1>
      </header>
      <div style={{ overflowX: "auto" }}>{periodToggle}</div>
      {body}
    </div>
  );
}
