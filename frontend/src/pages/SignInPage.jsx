import { ArrowRightOutlined, CheckCircleFilled, CheckOutlined } from "@ant-design/icons";
import { Button } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { BrandLogo } from "../components/common/BrandLogo";
import { StatusChip } from "../components/common/StatusChip";
import { InitialsAvatar } from "../components/common/InitialsAvatar";
import { ROLE_HOME, useRole } from "../context/RoleContext";

const ROLES = [
  { id: "employee", name: "Employee", initials: "AM", who: "Aarav Mehta · Engineering", desc: "Raise claims and track their status" },
  { id: "manager", name: "Line manager", initials: "PN", who: "Priya Nair · Engineering", desc: "First-level approvals and delegation" },
  { id: "auditor", name: "Finance auditor", initials: "KS", who: "Karan Shah · Finance", desc: "Review queue, bulk approve, sample audit" },
  { id: "head", name: "Finance head", initials: "MI", who: "Meera Iyer · Finance", desc: "High-value approvals, payouts, policy, audit" },
];

function PolicyPreviewCard() {
  const rows = [
    { cls: "rise-1", pop: "pop-1", title: "Hotel · 1 night", sub: "₹5,400 · limit ₹6,000", chip: ["ok", "Within limit"] },
    { cls: "rise-2", pop: "pop-2", title: "Meals · Saturday", sub: "₹1,350 · within ₹1,500 daily limit", chip: ["warn", "Weekend · flagged"] },
    { cls: "rise-3", pop: "pop-3", title: "Local cab", sub: "₹640 · no receipt, above ₹500", chip: ["bad", "Line rejected"] },
  ];
  return (
    <div style={{ position: "relative", maxWidth: 500 }}>
      <div className="float" style={{ background: "#fff", color: "#0E1424", borderRadius: 22, padding: 22, boxShadow: "0 30px 60px rgba(8,20,70,.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottom: "1px solid #E7EAF2" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Policy check · 3 lines</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5B6475" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16A34A" }} />
            Live as you type
          </span>
        </div>
        {rows.map((r, i) => (
          <div key={r.title} className={r.cls} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: i === 2 ? "14px 0 4px" : "14px 0", borderBottom: i === 2 ? 0 : "1px solid #EEF0F5" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.title}</span>
              <span style={{ fontSize: 12, color: "#5B6475" }}>{r.sub}</span>
            </div>
            <span className={r.pop}>
              <StatusChip tone={r.chip[0]}>{r.chip[1]}</StatusChip>
            </span>
          </div>
        ))}
      </div>
      <div className="toast-in" style={{ position: "absolute", right: -24, bottom: -34, background: "#0E1424", color: "#fff", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 16px 32px rgba(8,20,70,.4)" }}>
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckOutlined style={{ fontSize: 13 }} />
        </span>
        Payable ₹6,750 · goes to manager
      </div>
    </div>
  );
}

export default function SignInPage() {
  const { role, setRole } = useRole();
  const [selected, setSelected] = useState(role ?? "employee");
  const navigate = useNavigate();
  const current = ROLES.find((r) => r.id === selected);

  const onContinue = () => {
    setRole(selected);
    navigate(ROLE_HOME[selected]);
  };

  return (
    <main id="main" className="signin">
      <section className="signin-hero" aria-label="About ExpenseFlow">
        <div aria-hidden="true" style={{ position: "absolute", right: -140, bottom: -160, width: 520, height: 520, borderRadius: "50%", background: "rgba(255,255,255,.07)" }} />
        <div aria-hidden="true" style={{ position: "absolute", right: 30, bottom: 30, width: 240, height: 240, borderRadius: "50%", background: "rgba(255,255,255,.07)" }} />
        <div aria-hidden="true" style={{ position: "absolute", left: -90, top: 120, width: 260, height: 260, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          <BrandLogo size={40} inverted />
          <span className="ef-display" style={{ fontSize: 24, fontWeight: 700 }}>
            ExpenseFlow
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 34, position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <h1 style={{ fontSize: 60, lineHeight: 1.02, fontWeight: 700, maxWidth: 560 }}>Every rupee approved with a reason.</h1>
            <p style={{ fontSize: 18, lineHeight: 1.55, color: "#DCE6FF", maxWidth: 500 }}>
              Claims are checked against company policy line by line, routed by amount, and logged in a trail nobody can edit.
            </p>
          </div>
          <PolicyPreviewCard />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 32px", fontSize: 14, color: "#DCE6FF", position: "relative" }}>
          <span>Manager → Auditor → Finance head</span>
          <span>Duplicate receipt detection</span>
          <span>Hash-verified audit trail</span>
        </div>
      </section>

      <section className="signin-form" aria-labelledby="welcome">
        <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 id="welcome" style={{ fontSize: 36, fontWeight: 700 }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: "#5B6475" }}>Demo mode. Pick who you want to be and explore that role’s screens.</p>
          </div>

          <div role="group" aria-label="Choose a role" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {ROLES.map((r) => {
              const on = r.id === selected;
              return (
                <button key={r.id} type="button" className="role-card" aria-pressed={on} onClick={() => setSelected(r.id)} onDoubleClick={onContinue}>
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
                    <InitialsAvatar text={r.initials} size={48} filled={on} />
                    {on ? <CheckCircleFilled style={{ color: "#2563EB", fontSize: 22 }} aria-label="Selected" /> : null}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 16, color: "#0E1424" }}>{r.name}</span>
                    <span style={{ fontSize: 12, color: "#5B6475" }}>{r.who}</span>
                    <span style={{ fontSize: 12, lineHeight: 1.4, color: "#5B6475", marginTop: 4 }}>{r.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <Button type="primary" size="large" block onClick={onContinue} style={{ height: 52, borderRadius: 14, fontWeight: 700, fontSize: 15 }}>
            Continue as {current.name} <ArrowRightOutlined />
          </Button>
          <p style={{ fontSize: 13, color: "#5B6475", textAlign: "center" }}>You can switch role anytime from the avatar menu.</p>
        </div>
      </section>
    </main>
  );
}
