import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Modal, Table } from "antd";
import { useState } from "react";

import { getPolicyVersions, publishPolicyVersion } from "../../api/expenseApi";
import { TopBar } from "../../components/layout/TopBar";
import { StatusChip } from "../../components/common/StatusChip";
import { PageHeader } from "../../components/common/PageHeader";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { formatINR } from "../../utils/formatMoney";
import { RULE_OUTCOME } from "../../utils/statusLabels";

const STATUS_LABEL = { ACTIVE: "Active", DRAFT: "Draft", RETIRED: "Retired" };
const LEVEL_LABEL = { AUDITOR: "Auditor", FINANCE_HEAD: "Finance head" };

function PolicyBody({ versions }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const draft = versions.find((v) => v.status === "DRAFT");
  const active = versions.find((v) => v.status === "ACTIVE");
  const [selectedId, setSelectedId] = useState((draft ?? active).id);
  const [diffOpen, setDiffOpen] = useState(false);
  const selected = versions.find((v) => v.id === selectedId) ?? active;

  const publish = useMutation({
    mutationFn: () => publishPolicyVersion(draft.id),
    onSuccess: (v) => {
      queryClient.invalidateQueries({ queryKey: ["policy"] });
      message.success(`Version ${v.version} is now active.`);
    },
    onError: (e) => message.error(e.message),
  });

  const { levels, settings } = selected;

  return (
    <div className="ef-page">
      <PageHeader
        title="Policy rules"
        description="Limits are data, not code. Edit a draft version, then publish it. Claims already submitted keep the version they were checked under."
        extra={
          <>
            <Button onClick={() => message.info("Back-testing runs the draft over the last 3,000 claims (backend job).")}>Test against past claims</Button>
            {draft ? (
              <Button type="primary" loading={publish.isPending} onClick={() => Modal.confirm({ title: `Publish version ${draft.version}?`, content: "New claims will be checked against it. This is written to the audit trail.", okText: "Publish", onOk: () => publish.mutateAsync() })}>
                Publish version {draft.version}
              </Button>
            ) : null}
          </>
        }
      />

      <div role="group" aria-label="Policy versions" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {[...versions]
          .sort((a, b) => b.version - a.version)
          .map((v) => (
            <Button key={v.id} className="filter-pill" type={v.id === selectedId ? "primary" : "default"} aria-pressed={v.id === selectedId} onClick={() => setSelectedId(v.id)}>
              Version {v.version} · {STATUS_LABEL[v.status]}
            </Button>
          ))}
        {active ? (
          <span style={{ fontSize: 13, color: "#5B6475", marginLeft: 8 }}>
            Version {active.version} published by {active.published_by} on{" "}
            {new Date(active.published_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        ) : null}
      </div>

      {selected.status === "DRAFT" && selected.changes.length ? (
        <div className="banner banner-warn">
          <span>
            <strong>
              {selected.changes.length} change{selected.changes.length > 1 ? "s" : ""} in this draft.
            </strong>{" "}
            {selected.changes.map((c) => `${c.field}: ${formatINR(c.before_paise)} to ${formatINR(c.after_paise)}`).join("; ")}. Publishing is written to the audit trail with this before and after.
          </span>
          <Button type="link" style={{ color: "#6B3A00", fontWeight: 600, padding: 0 }} onClick={() => setDiffOpen(true)}>
            View full diff
          </Button>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
        <div style={{ flex: "2 1 680px", minWidth: 0 }}>
          <Table
            rowKey="code"
            dataSource={selected.rules}
            pagination={false}
            scroll={{ x: 760 }}
            onRow={(r) => ({ style: r.changed ? { background: "#FFF8E8" } : undefined })}
            columns={[
              {
                title: "Rule",
                dataIndex: "code",
                render: (c, r) => (
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {c}
                    </span>
                    <span style={{ fontSize: 12, color: "#5B6475" }}>{r.type}</span>
                  </span>
                ),
              },
              { title: "Applies to", dataIndex: "applies_to" },
              { title: "Limit", dataIndex: "limit_text", className: "num" },
              { title: "If breached", dataIndex: "outcome", render: (o) => <StatusChip tone={RULE_OUTCOME[o].tone}>{RULE_OUTCOME[o].label}</StatusChip> },
              { title: "Forces level", dataIndex: "forces_level", render: (l) => <span style={{ color: "#5B6475" }}>{LEVEL_LABEL[l] ?? "None"}</span> },
              { title: "Active", dataIndex: "active", render: (a) => <StatusChip tone={a ? "ok" : "neutral"}>{a ? "On" : "Off"}</StatusChip> },
            ]}
          />
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
          <section>
            <b style={{ fontSize: 15, display: "block", paddingBottom: 6 }}>Approval levels</b>
            <div className="kv">
              <span>1 · Manager</span>
              <span style={{ fontWeight: 600 }}>Always</span>
            </div>
            <div className="kv">
              <span>2 · Finance auditor</span>
              <span className="num" style={{ fontWeight: 600 }}>
                Payable above {formatINR(levels.auditor_above_paise)}
              </span>
            </div>
            <div className="kv">
              <span>3 · Finance head</span>
              <span className="num" style={{ fontWeight: 600 }}>
                Payable above {formatINR(levels.finance_head_above_paise)}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#5B6475", lineHeight: 1.5 }}>“Above” means exactly {formatINR(levels.auditor_above_paise)} stays with the manager. Levels are fixed on a claim when it is submitted.</p>
          </section>
          <section>
            <b style={{ fontSize: 15, display: "block", paddingBottom: 6 }}>Settings</b>
            <div className="kv">
              <span>Auto-approve up to</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {formatINR(levels.auto_approve_up_to_paise)} payable
              </span>
            </div>
            <div className="kv">
              <span>Sample audit rate</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {Math.round(settings.sample_audit_rate * 100)}%
              </span>
            </div>
            <div className="kv">
              <span>Delegation limit</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {settings.delegation_limit_days} days
              </span>
            </div>
            <div className="kv">
              <span>Timezone</span>
              <span style={{ fontWeight: 600 }}>{settings.timezone}</span>
            </div>
          </section>
          <section style={{ background: "#F7F8FA", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            <b style={{ fontSize: 14 }}>Test against past claims</b>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: "#3F4859" }}>Run the draft over the last 3,000 claims to see how many would change outcome before you publish.</p>
          </section>
        </div>
      </div>

      <Modal open={diffOpen} onCancel={() => setDiffOpen(false)} footer={null} title={`Version ${selected.version} vs version ${active?.version}`}>
        <Table
          rowKey="rule"
          size="small"
          pagination={false}
          dataSource={selected.changes}
          columns={[
            { title: "Rule", dataIndex: "rule", render: (r) => <span className="mono">{r}</span> },
            { title: "Field", dataIndex: "field" },
            { title: "Before", dataIndex: "before_paise", render: formatINR },
            { title: "After", dataIndex: "after_paise", render: (v) => <strong>{formatINR(v)}</strong> },
          ]}
        />
      </Modal>
    </div>
  );
}

export default function PolicyRulesPage() {
  const query = useQuery({ queryKey: ["policy", "versions"], queryFn: getPolicyVersions });
  return (
    <>
      <TopBar
        left={
          <span>
            Admin <span aria-hidden="true">/</span> <span style={{ color: "#0E1424", fontWeight: 600 }}>Policy rules</span>
          </span>
        }
      />
      <LoadingOrError query={query}>{(d) => <PolicyBody versions={d.items} />}</LoadingOrError>
    </>
  );
}
