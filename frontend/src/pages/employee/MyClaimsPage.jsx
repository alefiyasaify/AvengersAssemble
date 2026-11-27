import { BellOutlined, LogoutOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Dropdown, Empty } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { listMyClaims } from "../../api/expenseApi";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useRole } from "../../context/RoleContext";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { formatINR } from "../../utils/formatMoney";
import { claimStatus } from "../../utils/statusLabels";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "SENT_BACK", label: "Sent back" },
  { key: "PAID", label: "Paid" },
];

/** The 3-step approval progress on each claim card (manager → auditor → finance head). */
function StepDots({ steps, label }) {
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
      <span style={{ flex: 1, textAlign: "right", fontSize: 12, color: "#5B6475" }}>{label}</span>
    </div>
  );
}

function ClaimCard({ claim }) {
  const st = claimStatus(claim.status);
  return (
    <article className="mobile-card claim-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{claim.title}</span>
          <span style={{ fontSize: 12, color: "#5B6475" }}>
            {claim.claim_no ?? "Draft"} · {claim.date_label}
          </span>
        </div>
        <span className="num" style={{ fontWeight: 800, fontSize: 17, whiteSpace: "nowrap" }}>
          {formatINR(claim.total_paise)}
        </span>
      </div>
      <StepDots steps={claim.steps} label={claim.step_label} />
      <div>
        <StatusChip tone={st.tone}>{st.label}</StatusChip>
      </div>
      {claim.note ? (
        <div style={{ background: "#FFF3D6", borderRadius: 14, padding: "10px 12px", fontSize: 13, lineHeight: 1.4, color: "#6B3A00" }}>{claim.note}</div>
      ) : null}
    </article>
  );
}

function FilterPills({ filter, setFilter, counts, dark }) {
  return (
    <div role="group" aria-label="Filter claims" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
      {FILTERS.map((f) => {
        const on = f.key === filter;
        const n = f.key !== "ALL" && f.key !== "PAID" ? counts[f.key] : null;
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

function SummaryHero({ summary }) {
  return (
    <section className="hero" style={{ borderRadius: 28, padding: 22, gap: 16, boxShadow: "0 18px 36px rgba(31,79,216,.35)" }} aria-label="Claims summary">
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label">In review</span>
        <span className="big num">{formatINR(summary.in_review_paise)}</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span className="pill">{summary.open_count} open claims</span>
        <span className="pill">{formatINR(summary.paid_this_month_paise)} paid this month</span>
      </div>
    </section>
  );
}

export default function MyClaimsPage() {
  const { user, setRole } = useRole();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [filter, setFilter] = useState("ALL");
  const query = useQuery({ queryKey: ["claims", "mine"], queryFn: () => listMyClaims() });

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const firstName = user.name.split(" ")[0];

  const content = (
    <LoadingOrError query={query} rows={8}>
      {(data) => {
        const counts = data.items.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
        const items = filter === "ALL" ? data.items : data.items.filter((c) => c.status === filter);
        return (
          <>
            <div className="claims-summary-row">
              <SummaryHero summary={data.summary} />
              {isDesktop ? (
                <div className="claims-stats">
                  {[
                    ["Open claims", data.summary.open_count],
                    ["Drafts", counts.DRAFT ?? 0],
                    ["Need your reply", counts.SENT_BACK ?? 0],
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

            <FilterPills filter={filter} setFilter={setFilter} counts={counts} dark={!isDesktop} />

            <section aria-label="Claims" className="claims-grid">
              {items.length === 0 ? <Empty description="No claims here yet" /> : null}
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
              items: [{ key: "out", icon: <LogoutOutlined />, label: "Switch role" }],
              onClick: () => {
                setRole(null);
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
          <Button className="round-btn" icon={<BellOutlined />} aria-label="Notifications, 2 unread" />
        </Badge>
      </header>
      {content}
    </div>
  );
}
