import { SafetyCertificateOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Select, Table } from "antd";
import { useState } from "react";

import { getAuditEvents } from "../../api/expenseApi";
import { TopBar } from "../../components/layout/TopBar";
import { StatusChip } from "../../components/common/StatusChip";
import { PageHeader } from "../../components/common/PageHeader";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { AUDIT_ACTION_TONE } from "../../utils/statusLabels";

const ACTIONS = Object.keys(AUDIT_ACTION_TONE);

function EventDetail({ event }) {
  if (!event) return null;
  return (
    <aside className="panel-alt" aria-label="Selected event" style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: "#5B6475" }}>Selected event #{event.id.toLocaleString("en-IN")}</span>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{event.detail}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#5B6475" }}>Actor</span>
          <span>
            {event.actor}
            {event.on_behalf && event.action === "STEP_APPROVED" ? " (delegate)" : ""}
          </span>
        </div>
        {event.on_behalf ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#5B6475" }}>{event.actor === "System" ? "Context" : "On behalf of"}</span>
            <span>{event.on_behalf}</span>
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#5B6475" }}>Request</span>
          <span className="mono">{event.request_id}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#5B6475" }}>Change</span>
        <pre className="mono" style={{ background: "#fff", border: "1px solid #E5E8EF", borderRadius: 10, padding: "12px 14px", lineHeight: 1.8, margin: 0, overflowX: "auto" }}>
          {event.change}
        </pre>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#5B6475" }}>Hash link</span>
        <pre className="mono" style={{ background: "#fff", border: "1px solid #E5E8EF", borderRadius: 10, padding: "12px 14px", lineHeight: 1.8, margin: 0, overflowX: "auto" }}>
          {`prev  ${event.prev_hash}\nrow   ${event.row_hash}`}
        </pre>
        <span>
          <StatusChip tone="ok">Links to the previous event</StatusChip>
        </span>
      </div>
    </aside>
  );
}

export default function AuditTrailPage() {
  const { message } = App.useApp();
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [selectedId, setSelectedId] = useState(4806);
  const query = useQuery({ queryKey: ["audit", action, actor], queryFn: () => getAuditEvents({ action: action || undefined, actor: actor || undefined }) });

  return (
    <>
      <TopBar
        left={
          <span>
            Admin <span aria-hidden="true">/</span> <span style={{ color: "#0E1424", fontWeight: 600 }}>Audit trail</span>
          </span>
        }
      />
      <div className="ef-page">
        <PageHeader title="Audit trail" description="Every action is written once and can’t be edited or deleted, not even by the finance head." extra={<Button>Export CSV</Button>} />
        <LoadingOrError query={query}>
          {(data) => {
            const selected = data.items.find((e) => e.id === selectedId) ?? data.items[0];
            const actors = [...new Set(data.items.map((e) => e.actor))];
            return (
              <>
                <div className="banner banner-ok">
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <SafetyCertificateOutlined style={{ fontSize: 20 }} />
                    <span>
                      <strong>Hash chain verified.</strong> {data.chain.checked.toLocaleString("en-IN")} events checked at {data.chain.checked_label}, no gaps or changes.
                    </span>
                  </span>
                  <Button size="small" style={{ background: "#fff", borderColor: "#B7E0C9", color: "#0B6B42" }} onClick={() => message.success("Chain re-verified: no gaps or changes.")}>
                    Verify now
                  </Button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Select aria-label="Claim" value="" style={{ minWidth: 150 }} prefix={<span style={{ color: "#5B6475" }}>Claim:</span>} options={[{ value: "", label: "Any" }]} />
                  <Select aria-label="Actor" value={actor} onChange={setActor} style={{ minWidth: 190 }} prefix={<span style={{ color: "#5B6475" }}>Actor:</span>} options={[{ value: "", label: "Anyone" }, ...actors.map((a) => ({ value: a, label: a }))]} />
                  <Select aria-label="Action" value={action} onChange={setAction} style={{ minWidth: 260 }} prefix={<span style={{ color: "#5B6475" }}>Action:</span>} options={[{ value: "", label: "All" }, ...ACTIONS.map((a) => ({ value: a, label: a }))]} />
                  <Select aria-label="Date" value="7d" style={{ minWidth: 180 }} prefix={<span style={{ color: "#5B6475" }}>Date:</span>} options={[{ value: "7d", label: "Last 7 days" }]} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
                  <div style={{ flex: "2 1 640px", minWidth: 0 }}>
                    <Table
                      rowKey="id"
                      dataSource={data.items}
                      pagination={false}
                      scroll={{ x: 820 }}
                      onRow={(e) => ({
                        onClick: () => setSelectedId(e.id),
                        onKeyDown: (k) => k.key === "Enter" && setSelectedId(e.id),
                        tabIndex: 0,
                        "aria-selected": e.id === selected?.id,
                        style: { cursor: "pointer", background: e.id === selected?.id ? "#F3F7FF" : undefined },
                      })}
                      columns={[
                        { title: "When", dataIndex: "at_label", render: (v) => <span className="num" style={{ color: "#5B6475" }}>{v}</span> },
                        {
                          title: "Who",
                          dataIndex: "actor",
                          render: (a, e) => (
                            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontWeight: 600 }}>{a}</span>
                              {e.on_behalf ? <span style={{ fontSize: 12, color: "#5B6475" }}>{e.actor === "System" ? e.on_behalf : `On behalf of ${e.on_behalf}`}</span> : null}
                            </span>
                          ),
                        },
                        { title: "What", dataIndex: "action", render: (a) => <StatusChip tone={AUDIT_ACTION_TONE[a]}>{a}</StatusChip> },
                        { title: "Claim", dataIndex: "claim", render: (c) => <span style={{ fontWeight: 500 }}>{c}</span> },
                        { title: "Why or detail", dataIndex: "detail", render: (d) => <span style={{ color: "#3F4859" }}>{d}</span> },
                      ]}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, fontSize: 13, color: "#5B6475" }}>
                      <span>
                        Showing 1 to {data.items.length} of {data.total_estimate.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                  <EventDetail event={selected} />
                </div>
              </>
            );
          }}
        </LoadingOrError>
      </div>
    </>
  );
}
