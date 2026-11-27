import { CheckOutlined, RightOutlined, SafetyOutlined, WalletOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Empty, Segmented } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { getDashboardSummary } from "../../api/dashboardApi";
import { HorizontalBarList } from "../../components/charts/HorizontalBarList";
import { MonthlyStackedBars, monthsBetween } from "../../components/charts/MonthlyStackedBars";
import { Sparkline } from "../../components/charts/Sparkline";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { SectionTitle } from "../../components/common/SectionTitle";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useAuth } from "../../context/AuthContext";
import { useCategories } from "../../hooks/useLookups";
import { formatINR, formatLakh } from "../../utils/formatMoney";
import { ROLE_NAME, ruleLabel } from "../../utils/statusLabels";

const PERIOD_WORD = { MONTH: "month", QUARTER: "quarter", YEAR: "year" };
const toLakh = (paise) => paise / 100 / 100000;
const ymd = (d) => d.format("YYYY-MM-DD");

/** from/to for the period toggle (dates in the company timezone are close enough for a range filter). */
function periodRange(period) {
  const today = dayjs();
  const start = period === "YEAR" ? today.startOf("year") : period === "QUARTER" ? today.month(Math.floor(today.month() / 3) * 3).startOf("month") : today.startOf("month");
  return { from: ymd(start), to: ymd(today) };
}

const hours = (h) => (h === null || h === undefined ? "–" : h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`);

function DashboardBody({ d, trend, period, setPeriod }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const categories = useCategories();
  const categoryName = (code) => categories.byCode[code] ?? code;
  const periodWord = PERIOD_WORD[period];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayText = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const spendTotal = d.spend_by_category.reduce((s, c) => s + c.amount_paise, 0);
  const trendMonths = trend ? monthsBetween(trend.date_from, trend.date_to) : [];
  const monthTotals = trendMonths.map((m) => trend.spend_by_month.filter((r) => r.month === m).reduce((s, r) => s + r.amount_paise, 0));
  const at = d.approval_time;
  const decided = at.auto_approved_count + at.chain_count;
  const autoPct = decided ? Math.round((at.auto_approved_count / decided) * 100) : 0;
  const flagsTotal = d.violations.by_rule.reduce((s, r) => s + r.count, 0);
  const queue = d.queue_health ?? [];
  const headQueue = queue.find((q) => q.role === "FINANCE_HEAD");
  const oldest = queue.filter((q) => q.oldest_age_seconds).sort((a, b) => b.oldest_age_seconds - a.oldest_age_seconds)[0];

  return (
    <div className="ef-page" style={{ gap: 30, paddingTop: 14 }}>
      <div className="ef-page-head">
        <div>
          <h1>
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p>
            {todayText}. Showing {d.scope === "company" ? "the whole company" : d.scope === "team" ? "your team" : "your own claims"}, {dayjs(d.date_from).format("D MMM")} to {dayjs(d.date_to).format("D MMM YYYY")}.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Segmented aria-label="Period" value={period} onChange={setPeriod} options={[{ label: "Month", value: "MONTH" }, { label: "Quarter", value: "QUARTER" }, { label: "Year", value: "YEAR" }]} style={{ border: "1px solid #D5D9E3", padding: 2 }} />
          <Button onClick={() => window.print()}>Export PDF</Button>
        </div>
      </div>

      {headQueue?.pending || d.sample_audit?.pending ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-labelledby="att">
          <span id="att" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: "#5B6475" }}>
            NEEDS ATTENTION
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {headQueue?.pending ? (
              <button type="button" className="att" onClick={() => navigate("/head/approvals")}>
                <span className="tile" style={{ background: "#FCE0DC", color: "#A5271B" }}>
                  <SafetyOutlined />
                </span>
                <span style={{ flex: 1 }}>
                  {headQueue.pending} high-value claim{headQueue.pending > 1 ? "s are" : " is"} waiting for you
                  <br />
                  <span style={{ fontWeight: 500, fontSize: 12, color: "#5B6475" }}>Oldest {Math.round((headQueue.oldest_age_seconds ?? 0) / 86400)} days</span>
                </span>
                <RightOutlined style={{ color: "#5B6475" }} />
              </button>
            ) : null}
            {d.sample_audit?.pending ? (
              <button type="button" className="att" onClick={() => navigate("/head/payouts")}>
                <span className="tile" style={{ background: "#FFEBC2", color: "#7A4200" }}>
                  <WalletOutlined />
                </span>
                <span style={{ flex: 1 }}>
                  {d.sample_audit.pending} sampled claim{d.sample_audit.pending > 1 ? "s are" : " is"} held from payout
                  <br />
                  <span style={{ fontWeight: 500, fontSize: 12, color: "#5B6475" }}>Until the auditor passes or fails them</span>
                </span>
                <RightOutlined style={{ color: "#5B6475" }} />
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "stretch" }}>
        <section className="hero" style={{ flex: "1.3 1 420px", minWidth: 0, padding: 28, gap: 14 }} aria-label={`Spend this ${periodWord}`}>
          <span className="label" style={{ fontSize: 14 }}>
            Spend this {periodWord}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="num" style={{ fontSize: 64, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.03em" }}>
                {formatLakh(spendTotal)}
              </span>
              <span className="pill" style={{ alignSelf: "flex-start", fontSize: 13 }}>
                {formatINR(spendTotal)} across {d.spend_by_category.length} categories
              </span>
            </div>
            {monthTotals.length > 1 ? <Sparkline values={monthTotals} width={300} height={70} color="#FFFFFF" area label="Spend over the last six months" /> : null}
          </div>
        </section>

        <div style={{ flex: "1 1 360px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20, alignContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#5B6475", fontWeight: 600 }}>Policy flags</span>
            <span className="num" style={{ fontSize: 40, lineHeight: 1, fontWeight: 800 }}>
              {flagsTotal}
            </span>
            <span style={{ fontSize: 12, color: "#5B6475" }}>
              {(d.violations.violation_rate * 100).toFixed(1)}% of {d.violations.submitted_lines} submitted lines
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#5B6475", fontWeight: 600 }}>Average approval time</span>
            <span className="num" style={{ fontSize: 40, lineHeight: 1, fontWeight: 800 }}>
              {hours(at.mean_hours)}
            </span>
            <span style={{ fontSize: 12, color: "#5B6475" }}>
              Median {hours(at.median_hours)} · p90 {hours(at.p90_hours)} · auto-approved reported apart
            </span>
          </div>
          {oldest ? (
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6, background: "#FFF1EF", borderRadius: 16, padding: "14px 16px" }}>
              <span style={{ fontSize: 13, color: "#A5271B", fontWeight: 700 }}>Oldest pending step</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span className="num" style={{ fontSize: 28, fontWeight: 800, color: "#A5271B" }}>
                  {Math.round(oldest.oldest_age_seconds / 86400)} days
                </span>
                <span style={{ fontSize: 13, color: "#5B6475" }}>waiting on the {(ROLE_NAME[oldest.role] ?? oldest.role).toLowerCase()} step</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1.4 1 480px" }}>
          <SectionTitle title="Spend by month" hint="₹ lakh, last six months, stacked by category" />
          {trend ? <MonthlyStackedBars rows={trend.spend_by_month} months={trendMonths} categoryName={categoryName} format={(p) => toLakh(p).toFixed(1)} /> : <Empty />}
        </div>
        <div className="col" style={{ flex: "1 1 340px" }}>
          <SectionTitle title="Claim outcomes" hint={`${decided} decided claims this ${periodWord}`} />
          {decided ? (
            <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
              <div role="img" aria-label={`${autoPct}% auto-approved, ${100 - autoPct}% through the approval chain`} style={{ position: "relative", width: 170, height: 170, flex: "none" }}>
                <div style={{ width: 170, height: 170, borderRadius: "50%", background: `conic-gradient(#1E40AF 0 ${autoPct}%, #60A5FA ${autoPct}% 100%)` }} />
                <div style={{ position: "absolute", left: 30, top: 30, width: 110, height: 110, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span className="num" style={{ fontSize: 24, fontWeight: 700 }}>
                    {autoPct}%
                  </span>
                  <span style={{ fontSize: 11, color: "#5B6475" }}>auto-approved</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: "#1E40AF" }} />
                  Auto-approved · {at.auto_approved_count}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: "#60A5FA" }} />
                  Through the approval chain · {at.chain_count}
                </span>
              </div>
            </div>
          ) : (
            <Empty description="No decided claims yet" />
          )}
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1 1 380px" }}>
          <SectionTitle title="Spend by category" hint={`₹ lakh, this ${periodWord}`} />
          {d.spend_by_category.length ? <HorizontalBarList rows={d.spend_by_category.map((c) => [categoryName(c.category), toLakh(c.amount_paise)])} unit="lakh" /> : <Empty />}
        </div>
        <div className="col" style={{ flex: "1 1 380px" }}>
          <SectionTitle title="Spend by department" hint={`₹ lakh, this ${periodWord}`} />
          {d.spend_by_department.length ? <HorizontalBarList rows={d.spend_by_department.map((x) => [x.department_name, toLakh(x.amount_paise)])} unit="lakh" /> : <Empty />}
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1 1 300px" }}>
          <SectionTitle title="Policy violations" hint={`${(d.violations.violation_rate * 100).toFixed(1)}% of submitted lines`} />
          {d.violations.by_rule.length ? (
            <HorizontalBarList rows={d.violations.by_rule.map((r) => [ruleLabel(r.rule_code), r.count])} color="#C26A00" format={(v) => String(v)} unit="flags" />
          ) : (
            <Empty description="No violations" />
          )}
        </div>
        {queue.length ? (
          <div className="col" style={{ flex: "1 1 300px" }}>
            <SectionTitle title="Queue health" hint="pending steps, oldest age" />
            <HorizontalBarList
              rows={queue.map((q) => [`${ROLE_NAME[q.role] ?? q.role} (${Math.round((q.oldest_age_seconds ?? 0) / 86400)}d)`, q.pending])}
              format={(v) => String(v)}
              unit="pending"
            />
          </div>
        ) : null}
        <div className="col" style={{ flex: "1.2 1 380px" }}>
          <SectionTitle title="Violation rate by department" hint="top five, % of lines" />
          {d.violations.top_departments.length ? (
            <HorizontalBarList rows={d.violations.top_departments.map((x) => [x.department_name, x.rate * 100])} color="#C26A00" format={(v) => `${v.toFixed(1)}%`} />
          ) : (
            <Empty />
          )}
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1 1 300px" }}>
          <SectionTitle title="Approval time" hint="chain-approved claims" />
          <HorizontalBarList
            rows={[
              ["Mean", (at.mean_hours ?? 0) / 24],
              ["Median", (at.median_hours ?? 0) / 24],
              ["p90", (at.p90_hours ?? 0) / 24],
            ]}
            unit="days"
          />
          <p style={{ fontSize: 12, color: "#5B6475" }}>In days. Time spent in Sent back is not counted.</p>
        </div>
        {d.sample_audit ? (
          <div className="col" style={{ flex: "1 1 300px" }}>
            <SectionTitle title="Sample audit" hint={`this ${periodWord}`} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              {[
                ["Passed", d.sample_audit.passed],
                ["Failed", d.sample_audit.failed, "#A5271B"],
                ["Pending", d.sample_audit.pending],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="num" style={{ fontSize: 28, fontWeight: 700, color: c }}>
                    {v}
                  </span>
                  <span style={{ fontSize: 12, color: "#5B6475" }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState("MONTH");
  const range = periodRange(period);
  const query = useQuery({ queryKey: ["dashboard", range], queryFn: () => getDashboardSummary(range) });
  // A second, fixed six-month window feeds the monthly chart and the sparkline.
  const trendRange = { from: ymd(dayjs().subtract(5, "month").startOf("month")), to: ymd(dayjs()) };
  const trend = useQuery({ queryKey: ["dashboard", trendRange], queryFn: () => getDashboardSummary(trendRange) });

  return (
    <>
      <TopBar
        left={
          <span>
            Finance <span aria-hidden="true">/</span> <span style={{ color: "#0E1424", fontWeight: 700 }}>Dashboard</span>
          </span>
        }
        right={
          <StatusChip tone="ok" icon={<CheckOutlined />}>
            Live data
          </StatusChip>
        }
      />
      <LoadingOrError query={query} rows={16}>
        {(d) => <DashboardBody d={d} trend={trend.data} period={period} setPeriod={setPeriod} />}
      </LoadingOrError>
    </>
  );
}
