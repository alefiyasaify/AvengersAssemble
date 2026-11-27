import { BellOutlined, LogoutOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Dropdown, Empty } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { listClaims } from "../../api/claimsApi";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useAuth } from "../../context/AuthContext";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { formatINR } from "../../utils/formatMoney";
import { ROLE_NAME, claimStatus, formatDate, isPending, ruleLabel } from "../../utils/statusLabels";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "PENDING", label: "In review" },
  { key: "SENT_BACK", label: "Sent back" },
  { key: "PAID", label: "Paid" },
];

const matchesFilter = (claim, filter) =>
  filter === "ALL" ? true : filter === "PENDING" ? isPending(claim.status) : claim.status === filter;

/** Progress dots for levels 1..3 from ClaimSummary.status and current_level. */
function stepStates(claim) {
  const levels = [1, 2, 3];
  if (claim.status === "APPROVED" || claim.status === "PAID") return levels.map(() => "DONE");
  if (claim.status === "SENT_BACK") return ["HOLD", "WAITING", "WAITING"];
  if (!isPending(claim.status)) return levels.map(() => "WAITING");
  const current = claim.current_level ?? 1;
  return levels.map((n) => (n < current ? "DONE" : n === current ? "CURRENT" : "WAITING"));
}

function stepLabel(claim) {
  if (claim.status === "DRAFT") return `${claim.line_count} line${claim.line_count === 1 ? "" : "s"} · not submitted`;
  if (claim.status === "SENT_BACK") return "Needs your changes";
  if (claim.status === "PAID") return `Paid${claim.decided_at ? ` · approved ${formatDate(claim.decided_at)}` : ""}`;
  if (isPending(claim.status) && claim.current_step) {
    const who = claim.current_step.assigned_to_name ?? ROLE_NAME[claim.current_step.role];
    return `With ${who}`;
  }
  return claimStatus(claim.status).label;
}

/** The 3-step approval progress on each claim card (manager → auditor → finance head). */
function StepDots({ claim }) {
  const style = (state) => {
    switch (state) {
      case "DONE":
        return { background: "#2563EB", color: "#fff" };
      case "CURRENT":
        return { background: "#fff", color: "#1D4ED8", border: "2px solid #2563EB" };
      case "HOLD":
        return { background: "#FFEBC2", color: "#7A4200" };
      default:
        return { background: "#ECEFF5", color: "#4A5366" };
    }
  };
  const steps = stepStates(claim);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {steps.map((s, i) => (
        <span key={i} style={{ display: "contents" }}>
          <span className={`step-dot ${s === "CURRENT" ? "ring-now" : ""}`} style={style(s)}>
            {s === "DONE" ? "✓" : s === "HOLD" ? "!" : i + 1}
          </span>
          {i < steps.length - 1 ? <span className="step-line" style={{ background: s === "DONE" ? "#2563EB" : "#DCE1EE" }} /> : null}
        </span>
      ))}
      <span style={{ flex: 1, textAlign: "right", fontSize: 12, color: "#5B6475" }}>{stepLabel(claim)}</span>
    </div>
  );
}

function ClaimCard({ claim }) {
  const st = claimStatus(claim.status);
  const date = claim.submitted_at ?? claim.created_at;
  return (
    <Link to={`/employee/claims/${claim.id}`} className="mobile-card claim-card" style={{ color: "inherit", textDecoration: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{claim.title}</span>
          <span style={{ fontSize: 12, color: "#5B6475" }}>
            {claim.claim_no} · {formatDate(date)}
          </span>
        </div>
        <span className="num" style={{ fontWeight: 800, fontSize: 17, whiteSpace: "nowrap" }}>
          {formatINR(claim.status === "DRAFT" ? claim.total_paise : claim.payable_paise)}
        </span>
      </div>
      <StepDots claim={claim} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <StatusChip tone={st.tone}>{st.label}</StatusChip>
        {claim.sample_audit_pending ? <StatusChip tone="info">Sample audit</StatusChip> : null}
        {claim.finding_codes.slice(0, 2).map((code) => (
          <StatusChip key={code} tone="warn">
            {ruleLabel(code)}
          </StatusChip>
        ))}
      </div>
    </Link>
  );
}

function FilterPills({ filter, setFilter, counts, dark }) {
  return (
    <div role="group" aria-label="Filter claims" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
      {FILTERS.map((f) => {
        const on = f.key === filter;
        const n = f.key !== "ALL" ? counts[f.key] : null;
        return (
          <Button
            key={f.key}
            shape="round"
            aria-pressed={on}
            onClick={() => setFilter(f.key)}
            style={{
              height: 44,
              padding: "0 18px",
              border: dark || on ? 0 : "1px solid #E3E7F1",
              fontWeight: on ? 700 : 600,
              background: on ? "#0E1424" : "#fff",
              color: on ? "#fff" : "#0E1424",
              boxShadow: on || !dark ? "none" : "0 1px 3px rgba(16,24,40,.08)",
            }}
          >
            {f.label}
            {n ? ` · ${n}` : ""}
          </Button>
        );
      })}
    </div>
  );
}

function summarise(items) {
  const pending = items.filter((c) => isPending(c.status));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const paidThisMonth = items
    .filter((c) => c.status === "PAID" && c.decided_at && new Date(c.decided_at) >= monthStart)
    .reduce((s, c) => s + c.payable_paise, 0);
  return {
    inReview: pending.reduce((s, c) => s + c.payable_paise, 0),
    openCount: pending.length,
    paidThisMonth,
    counts: {
      DRAFT: items.filter((c) => c.status === "DRAFT").length,
      PENDING: pending.length,
      SENT_BACK: items.filter((c) => c.status === "SENT_BACK").length,
      PAID: items.filter((c) => c.status === "PAID").length,
    },
  };
}

function SummaryHero({ summary }) {
  return (
    <section className="hero" style={{ borderRadius: 28, padding: 22, gap: 16, boxShadow: "0 18px 36px rgba(31,79,216,.35)" }} aria-label="Claims summary">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label">In review</span>
        <span className="big num">{formatINR(summary.inReview)}</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span className="pill">{summary.openCount} open claims</span>
        <span className="pill">{formatINR(summary.paidThisMonth)} approved and paid this month</span>
      </div>
    </section>
  );
}

export default function MyClaimsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [filter, setFilter] = useState("ALL");
  // GET /claims?scope=mine (first 100; enough for one person's claims list)
  const query = useQuery({ queryKey: ["claims", "mine"], queryFn: () => listClaims({ scope: "mine" }) });

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const firstName = user.name.split(" ")[0];

  const content = (
    <LoadingOrError query={query} rows={8}>
      {(data) => {
        const summary = summarise(data.items);
        const items = data.items.filter((c) => matchesFilter(c, filter));
        return (
          <>
            <div className="claims-summary-row">
              <SummaryHero summary={summary} />
              {isDesktop ? (
                <div className="claims-stats">
                  {[
                    ["Open claims", summary.openCount],
                    ["Drafts", summary.counts.DRAFT],
                    ["Need your changes", summary.counts.SENT_BACK],
                  ].map(([label, value]) => (
                    <div key={label} className="stat-tile">
                      <span className="num" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
                        {value}
                      </span>
                      <span style={{ fontSize: 13, color: "#5B6475", fontWeight: 600 }}>{label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <FilterPills filter={filter} setFilter={setFilter} counts={summary.counts} dark={!isDesktop} />

            <section aria-label="Claims" className="claims-grid">
              {items.length === 0 ? (
                <Empty description={data.items.length ? "No claims match this filter" : "You have no claims yet"}>
                  {data.items.length ? null : (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/employee/claims/new")}>
                      Start a claim
                    </Button>
                  )}
                </Empty>
              ) : null}
              {items.map((c) => (
                <ClaimCard key={c.id} claim={c} />
              ))}
            </section>
          </>
        );
      }}
    </LoadingOrError>
  );

  if (isDesktop) {
    return (
      <>
        <TopBar left={<span style={{ color: "#0E1424", fontWeight: 700 }}>My claims</span>} />
        <div className="ef-page">
          <PageHeader
            title={`Hi ${firstName}`}
            description={`${today}. Track your claims and see where each one is in the approval chain.`}
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/employee/claims/new")}>
                New claim
              </Button>
            }
          />
          {content}
        </div>
      </>
    );
  }

  // Phone layout (the "Employee · My claims (mobile)" artboard).
  return (
    <div style={{ padding: "22px 20px 0", display: "flex", flexDirection: "column", gap: 18 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "who", label: user.email, disabled: true },
                { key: "out", icon: <LogoutOutlined />, label: "Sign out", danger: true },
              ],
              onClick: async ({ key }) => {
                if (key !== "out") return;
                await logout();
                navigate("/");
              },
            }}
          >
            <button type="button" aria-label="Account menu" style={{ border: 0, padding: 0, background: "none", cursor: "pointer" }}>
              <InitialsAvatar text={user.initials} size={46} filled style={{ boxShadow: "0 0 0 3px #DCE6FF" }} />
            </button>
          </Dropdown>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 13, color: "#5B6475" }}>{today}</span>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>Hi {firstName}</h1>
          </div>
        </div>
        <Badge dot color="#E0551B" offset={[-12, 12]}>
          <Button className="round-btn" icon={<BellOutlined />} aria-label="Notifications" />
        </Badge>
      </header>
      {content}
    </div>
  );
}
