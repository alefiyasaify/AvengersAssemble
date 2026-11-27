import { ArrowDownOutlined, ArrowUpOutlined,CheckOutlined, RightOutlined, SafetyOutlined, SlidersOutlined, WalletOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Button, Segmented } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { getDashboardSummary } from "../../api/expenseApi";
import { TopBar } from "../../components/layout/TopBar";
import { StatusChip } from "../../components/common/StatusChip";
import { HorizontalBarList } from "../../components/charts/HorizontalBarList";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { SectionTitle } from "../../components/common/SectionTitle";
import { Sparkline } from "../../components/charts/Sparkline";
import { useRole } from "../../context/RoleContext";
import { formatLakh } from "../../utils/formatMoney";

const ATT = {
  HIGH_VALUE: { Icon: SafetyOutlined, bg: "#FCE0DC", fg: "#A5271B" },
  BATCH: { Icon: WalletOutlined, bg: "#DDF4E7", fg: "#0B6B42" },
  POLICY: { Icon: SlidersOutlined, bg: "#FFEBC2", fg: "#7A4200" },
};
const PERIOD_WORD = { MONTH: "month", QUARTER: "quarter", YEAR: "year" };
const CAT_COLORS =["#1E3A8A", "#2563EB", "#60A5FA", "#BFDBFE", "#F2A33A"];

function StackedMonths({ months, categories }) {
  const max = Math.max(...months.map((m) => m.lakh.reduce((a, b) => a + b, 0)));
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: "#3F4859" }}>
        {categories.map((c, i) => (
          <span key={c} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[i] }} />
            {c}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 260 }}>
        {months.map((m) => {
          const total = m.lakh.reduce((a, b) => a + b, 0);
          return (
            <div key={m.label} role="img" aria-label={`${m.label}, ${total.toFixed(1)} lakh`} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
              <span className="num" style={{ fontSize: 12, fontWeight: 600 }}>
                {total.toFixed(1)}
              </span>
              <span style={{ display: "flex", flexDirection: "column-reverse", width: "100%", maxWidth: 64, borderRadius: "8px 8px 0 0", overflow: "hidden" }}>
                {m.lakh.map((v, i) => (
                  <span key={i} style={{ display: "block", width: "100%", background: CAT_COLORS[i], height: Math.max(2, Math.round((v / max) * 200)) }} />
                ))}
              </span>
              <span style={{ fontSize: 12, color: "#5B6475" }}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function DashboardBody({ d, period, setPeriod }) {
  const navigate = useNavigate();
  const { user } = useRole();
  const changePct = ((d.spend.current_paise - d.spend.previous_paise) / d.spend.previous_paise) * 100;
  const o = d.outcomes;
  const periodWord = PERIOD_WORD[period];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayText = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="ef-page" style={{ gap: 30, paddingTop: 14 }}>
      <div className="ef-page-head">
        <div>
          <h1>
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p>{todayText}. Figures are mock data until GET /dashboard/summary is live.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Segmented aria-label="Period" value={period} onChange={setPeriod} options={[{ label: "Month", value: "MONTH" }, { label: "Quarter", value: "QUARTER" }, { label: "Year", value: "YEAR" }]} style={{ border: "1px solid #D5D9E3", padding: 2 }} />
          <Button onClick={() => window.print()}>Export PDF</Button>
        </div>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-labelledby="att">
        <span id="att" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", color: "#5B6475" }}>
          NEEDS YOUR ATTENTION
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {d.attention.map((a) => {
            const { Icon, bg, fg } = ATT[a.kind];
            return (
              <button key={a.kind} type="button" className="att" onClick={() => navigate(a.to)}>
                <span className="tile" style={{ background: bg, color: fg }}>
                  <Icon />
                </span>
                <span style={{ flex: 1 }}>
                  {a.title}
                  <br />
                  <span style={{ fontWeight: 500, fontSize: 12, color: "#5B6475" }}>{a.detail}</span>
                </span>
                <RightOutlined style={{ color: "#5B6475" }} />
              </button>
            );
          })}
        </div>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "stretch" }}>
        <section className="hero" style={{ flex: "1.3 1 420px", minWidth: 0, padding: 28, gap: 14 }} aria-label={`Spend this ${periodWord}`}>
          <span className="label" style={{ fontSize: 14 }}>
            Spend this {periodWord}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="num" style={{ fontSize: 64, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.03em" }}>
                {formatLakh(d.spend.current_paise)}
              </span>
              <span className="pill" style={{ alignSelf: "flex-start", fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}>
                {changePct <= 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />} {Math.abs(changePct).toFixed(1)}% {changePct <= 0 ? "below" : "above"}{" "}
                {d.spend.previous_label}’s {formatLakh(d.spend.previous_paise)}
              </span>
            </div>
            <Sparkline values={d.spend.trend_lakh} width={300} height={70} color="#FFFFFF" area label="Spend over the last six months" />
          </div>
        </section>

        <div style={{ flex: "1 1 360px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20, alignContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#5B6475", fontWeight: 600 }}>Policy flags</span>
            <span className="num" style={{ fontSize: 40, lineHeight: 1, fontWeight: 800 }}>
              {d.flags.total}
            </span>
            <Sparkline values={d.flags.trend} color="#E59A12" label="Flags per week" />
            <span style={{ fontSize: 12, color: "#5B6475" }}>
              {d.flags.by_type.OVER_LIMIT} over limit · {d.flags.by_type.WEEKEND} weekend · {d.flags.by_type.DUPLICATE} duplicate · {d.flags.by_type.NO_RECEIPT} no receipt
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#5B6475", fontWeight: 600 }}>Average approval time</span>
            <span className="num" style={{ fontSize: 40, lineHeight: 1, fontWeight: 800 }}>
              {d.approval_time.mean_days} days
            </span>
            <Sparkline values={d.approval_time.trend} label="Approval time trend, falling" />
            <span style={{ fontSize: 12, color: "#5B6475" }}>
              Median {d.approval_time.median_days} · p90 {d.approval_time.p90_days} · auto-approved reported apart
            </span>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6, background: "#FFF1EF", borderRadius: 16, padding: "14px 16px" }}>
            <span style={{ fontSize: 13, color: "#A5271B", fontWeight: 700 }}>Oldest pending claim</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className="num" style={{ fontSize: 28, fontWeight: 800, color: "#A5271B" }}>
                {d.oldest_pending.days} days
              </span>
              <span style={{ fontSize: 13, color: "#5B6475" }}>
                {d.oldest_pending.claim_no} · waiting on {d.oldest_pending.with}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1.4 1 480px" }}>
          <SectionTitle title="Spend by month" hint="₹ lakh, stacked by category" />
          <StackedMonths months={d.by_month} categories={d.categories} />
        </div>
        <div className="col" style={{ flex: "1 1 340px" }}>
          <SectionTitle title="Claim outcomes" hint={`${o.total} claims this ${periodWord}`} />
          <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
            <div role="img" aria-label={`${o.auto_approved_pct}% auto-approved, ${o.routed_pct}% routed, ${o.auto_rejected_pct}% auto-rejected`} style={{ position: "relative", width: 170, height: 170, flex: "none" }}>
              <div style={{ width: 170, height: 170, borderRadius: "50%", background: `conic-gradient(#1E40AF 0 ${o.auto_approved_pct}%, #60A5FA ${o.auto_approved_pct}% ${o.auto_approved_pct + o.routed_pct}%, #CBD5E1 ${o.auto_approved_pct + o.routed_pct}% 100%)` }} />
              <div style={{ position: "absolute", left: 30, top: 30, width: 110, height: 110, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span className="num" style={{ fontSize: 24, fontWeight: 700 }}>
                  {o.auto_approved_pct}%
                </span>
                <span style={{ fontSize: 11, color: "#5B6475" }}>auto-approved</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              {[
                ["#1E40AF", `Auto-approved · ${o.auto_approved_pct}%`],
                ["#60A5FA", `Routed for approval · ${o.routed_pct}%`],
                ["#CBD5E1", `Auto-rejected · ${o.auto_rejected_pct}%`],
              ].map(([c, l]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1 1 380px" }}>
          <SectionTitle title="Spend by category" hint={`₹ lakh, this ${periodWord}`} />
          <HorizontalBarList rows={d.by_category} unit="lakh" />
        </div>
        <div className="col" style={{ flex: "1 1 380px" }}>
          <SectionTitle title="Spend by department" hint={`₹ lakh, this ${periodWord}`} />
          <HorizontalBarList rows={d.by_department} unit="lakh" />
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1 1 300px" }}>
          <SectionTitle title="Policy violations" hint={`${d.violation_rate_pct}% of submitted lines`} />
          <HorizontalBarList
            rows={[["Over limit", d.flags.by_type.OVER_LIMIT], ["Weekend", d.flags.by_type.WEEKEND], ["Duplicate", d.flags.by_type.DUPLICATE], ["No receipt", d.flags.by_type.NO_RECEIPT]]}
            color="#C26A00"
            format={(v) => String(v)}
            unit="flags"
          />
        </div>
        <div className="col" style={{ flex: "1 1 300px" }}>
          <SectionTitle title="Queue health" hint="pending steps, oldest age" />
          <HorizontalBarList rows={d.queue_health} format={(v) => String(v)} unit="pending" />
        </div>
        <div className="col" style={{ flex: "1.2 1 380px" }}>
          <SectionTitle title="Longest waiting" hint="open claims" />
          <div>
            {d.longest_waiting.map((p) => (
              <div key={p.claim_no} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1fr) 110px 90px", gap: 12, alignItems: "center", padding: "12px 8px", borderBottom: "1px solid #EEF0F5", fontSize: 13 }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{p.claim_no}</span>
                  <span style={{ fontSize: 12, color: "#5B6475" }}>{p.who}</span>
                </span>
                <span style={{ color: "#5B6475" }}>{p.with}</span>
                <span>
                  <StatusChip tone={p.days >= 6 ? "bad" : "warn"}>{p.days} days</StatusChip>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1 1 300px" }}>
          <SectionTitle title="Approval time" hint="days, chain-approved claims" />
          <HorizontalBarList rows={[["Mean", d.approval_time.mean_days], ["Median", d.approval_time.median_days], ["p90", d.approval_time.p90_days]]} unit="days" />
          <p style={{ fontSize: 12, color: "#5B6475" }}>Time spent in Sent back is not counted.</p>
        </div>
        <div className="col" style={{ flex: "1 1 300px" }}>
          <SectionTitle title="Sample audit" hint="last 30 days, 10% draw" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
            {[
              ["Sampled", d.sample_audit.sampled],
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
        <div className="col" style={{ flex: "1.2 1 380px" }}>
          <SectionTitle title="Violation rate by department" hint="top five, % of lines" />
          <HorizontalBarList rows={d.violation_by_department} color="#C26A00" format={(v) => `${v.toFixed(1)}%`} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState("MONTH");
  const query = useQuery({ queryKey: ["dashboard", period], queryFn: () => getDashboardSummary(period) });
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
            Audit trail verified
          </StatusChip>
        }
      />
      <LoadingOrError query={query} rows={16}>
        {(d) => <DashboardBody d={d} period={period} setPeriod={setPeriod} />}
      </LoadingOrError>
    </>
  );
}
