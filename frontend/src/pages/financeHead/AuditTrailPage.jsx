import { InfoCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Empty, Input, Table } from "antd";
import { useState } from "react";

import { getTimeline, listClaims } from "../../api/claimsApi";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { formatINR } from "../../utils/formatMoney";
import { AUDIT_ACTION_TONE, claimStatus, formatDate } from "../../utils/statusLabels";

/** before/after JSON of one event → "field  old → new" lines. */
function changeLines(entry) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  if (!keys.length) return "No field changes recorded.";
  const show = (v) => (v === undefined || v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const width = Math.max(...keys.map((k) => k.length));
  return keys.map((k) => `${k.padEnd(width)}  ${show(before[k])} → ${show(after[k])}`).join("\n");
}

function Timeline({ claim }) {
  const [selectedId, setSelectedId] = useState(null);
  const query = useQuery({ queryKey: ["timeline", claim.id], queryFn: () => getTimeline(claim.id) });

  return (
    <LoadingOrError query={query}>
      {(events) => {
        const selected = events.find((e) => e.id === selectedId) ?? events[events.length - 1];
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
            <div style={{ flex: "2 1 520px", minWidth: 0 }}>
              <Table
                rowKey="id"
                dataSource={events}
                pagination={false}
                scroll={{ x: 640 }}
                locale={{ emptyText: "No events for this claim." }}
                onRow={(e) => ({
                  onClick: () => setSelectedId(e.id),
                  onKeyDown: (k) => k.key === "Enter" && setSelectedId(e.id),
                  tabIndex: 0,
                  "aria-selected": e.id === selected?.id,
                  style: { cursor: "pointer", background: e.id === selected?.id ? "#F3F7FF" : undefined },
                })}
                columns={[
                  { title: "When", dataIndex: "ts", render: (v) => <span className="num" style={{ color: "#5B6475" }}>{formatDate(v, true)}</span> },
                  {
                    title: "Who",
                    dataIndex: "actor_name",
                    render: (a, e) => (
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{a}</span>
                        {e.on_behalf_of_name ? <span style={{ fontSize: 12, color: "#5B6475" }}>On behalf of {e.on_behalf_of_name}</span> : null}
                      </span>
                    ),
                  },
                  { title: "What", dataIndex: "action", render: (a) => <StatusChip tone={AUDIT_ACTION_TONE(a)}>{a}</StatusChip> },
                ]}
              />
            </div>
            {selected ? (
              <aside className="panel-alt" aria-label="Selected event" style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#5B6475" }}>Event #{selected.id.toLocaleString("en-IN")}</span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{selected.action}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: "#5B6475" }}>Actor</span>
                    <span>{selected.actor_name}</span>
                  </div>
                  {selected.on_behalf_of_name ? (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ color: "#5B6475" }}>On behalf of</span>
                      <span>{selected.on_behalf_of_name}</span>
                    </div>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ color: "#5B6475" }}>When</span>
                    <span>{new Date(selected.ts).toLocaleString("en-IN")}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#5B6475" }}>Change</span>
                  <pre className="mono" style={{ background: "#fff", border: "1px solid #E5E8EF", borderRadius: 10, padding: "12px 14px", lineHeight: 1.8, margin: 0, overflowX: "auto" }}>
                    {changeLines(selected)}
                  </pre>
                </div>
              </aside>
            ) : null}
          </div>
        );
      }}
    </LoadingOrError>
  );
}

export default function AuditTrailPage() {
  const [q, setQ] = useState("");
  const [claimId, setClaimId] = useState(null);
  const claims = useQuery({ queryKey: ["claims", "all", q], queryFn: () => listClaims({ scope: "all", q: q.trim() || undefined, limit: 50 }) });
  const selected = claims.data?.items.find((c) => c.id === claimId);

  return (
    <>
      <TopBar
        left={
          <span>
            Admin <span aria-hidden="true">/</span> <span style={{ color: "#0E1424", fontWeight: 700 }}>Audit trail</span>
          </span>
        }
      />
      <div className="ef-page">
        <PageHeader title="Audit trail" description="Every action is written once and can’t be edited or deleted, not even by the finance head." />
        <div className="banner banner-info">
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <InfoCircleOutlined />
            <span>Pick a claim to see its full history. A company-wide event list needs a GET /audit-events endpoint, which the backend does not offer yet.</span>
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
          <section style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }} aria-label="Claims">
            <Input prefix={<SearchOutlined />} placeholder="Search claim number, title or person" aria-label="Search claims" allowClear value={q} onChange={(e) => setQ(e.target.value)} />
            <LoadingOrError query={claims}>
              {(data) =>
                data.items.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 640, overflowY: "auto" }}>
                    {data.items.map((c) => {
                      const st = claimStatus(c.status);
                      const on = c.id === claimId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setClaimId(c.id)}
                          style={{
                            textAlign: "left",
                            border: 0,
                            borderRadius: 14,
                            padding: "10px 12px",
                            cursor: "pointer",
                            font: "inherit",
                            background: on ? "#EEF3FF" : "#F3F5FB",
                            boxShadow: on ? "0 0 0 2px #2563EB" : "none",
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                          }}
                        >
                          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontWeight: 700 }}>{c.claim_no}</span>
                            <span className="num">{formatINR(c.payable_paise)}</span>
                          </span>
                          <span style={{ fontSize: 12, color: "#5B6475" }}>
                            {c.owner_name} · {c.title}
                          </span>
                          <span>
                            <StatusChip tone={st.tone}>{st.label}</StatusChip>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Empty description="No claims match" />
                )
              }
            </LoadingOrError>
          </section>
          <section style={{ flex: "3 1 640px", minWidth: 0 }} aria-label="Claim history">
            {selected ? <Timeline key={selected.id} claim={selected} /> : <Empty description="Pick a claim on the left to see its history" />}
          </section>
        </div>
      </div>
    </>
  );
}
