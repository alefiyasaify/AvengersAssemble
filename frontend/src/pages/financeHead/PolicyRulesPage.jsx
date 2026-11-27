import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Modal, Table } from "antd";
import { useState } from "react";

import { getAppConfig, listApprovalLevels, listPolicyVersions, publishPolicyVersion } from "../../api/policyApi";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useCategories } from "../../hooks/useLookups";
import { formatINR } from "../../utils/formatMoney";
import { ROLE_NAME, formatDate } from "../../utils/statusLabels";

const STATUS_LABEL = { ACTIVE: "Active", DRAFT: "Draft", RETIRED: "Retired" };
const OUTCOME = { REJECT: { label: "Reject line", tone: "bad" }, ROUTE: { label: "Route", tone: "warn" }, FLAG: { label: "Flag", tone: "info" } };
const TYPE_LABEL = {
  daily_cap: "Daily cap",
  per_unit_cap_by_tier: "Cap by city tier",
  per_line_cap: "Per-line cap",
  receipt_required_above: "Receipt threshold",
  duplicate: "Duplicate match",
  weekend_flag: "Weekend flag",
  split_window: "Split window",
  max_age_days: "Max age",
};
const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Human-readable limit from a rule's params (PolicyRuleConfig.params). */
function limitText(rule) {
  const p = rule.params ?? {};
  switch (rule.type) {
    case "daily_cap":
      return `${formatINR(p.cap)} per employee per day`;
    case "per_unit_cap_by_tier":
      return Object.entries(p.cap_by_tier ?? {})
        .map(([tier, cap]) => `${tier === "default" ? "Other cities" : `Tier ${tier}`} ${formatINR(cap)}`)
        .join(", ")
        .concat(p.unit ? ` per ${p.unit}` : "");
    case "per_line_cap":
      return `${formatINR(p.cap)} per line`;
    case "receipt_required_above":
      return `Receipt needed above ${formatINR(p.threshold)}`;
    case "duplicate":
      return "Same vendor, amount and date, or same receipt file";
    case "weekend_flag":
      return (p.weekend_days ?? []).map((d) => WEEKDAY[d]).join(" or ");
    case "split_window":
      return `Same vendor or category within ${p.window_days} days`;
    case "max_age_days":
      return `${p.max_age_days} days`;
    default:
      return JSON.stringify(p);
  }
}

/** Rules whose settings differ between two versions, by code. */
function diffRules(draft, active) {
  if (!draft || !active) return [];
  const before = Object.fromEntries(active.rules.map((r) => [r.code, r]));
  return draft.rules
    .filter((r) => JSON.stringify(r) !== JSON.stringify(before[r.code]))
    .map((r) => ({ code: r.code, before: before[r.code] ? limitText(before[r.code]) : "New rule", after: limitText(r), activeChange: before[r.code] && before[r.code].active !== r.active }));
}

function PolicyBody({ versions, levels, config }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const draft = versions.find((v) => v.status === "DRAFT");
  const active = versions.find((v) => v.status === "ACTIVE");
  const [selectedId, setSelectedId] = useState((draft ?? active ?? versions[0])?.id);
  const [diffOpen, setDiffOpen] = useState(false);
  const selected = versions.find((v) => v.id === selectedId) ?? active ?? versions[0];
  const changes = selected?.status === "DRAFT" ? diffRules(selected, active) : [];

  const publish = useMutation({
    mutationFn: () => publishPolicyVersion(draft.id),
    onSuccess: (v) => {
      queryClient.invalidateQueries({ queryKey: ["policy"] });
      message.success(`Version ${v.version_no} is now active.`);
    },
    onError: (e) => message.error(e.message),
  });

  if (!selected) return <p className="ef-page">No policy versions exist yet.</p>;

  return (
    <div className="ef-page">
      <PageHeader
        title="Policy rules"
        description="Limits are data, not code. Edit a draft version, then publish it. Claims already submitted keep the version they were checked under."
        extra={
          draft ? (
            <Button
              type="primary"
              loading={publish.isPending}
              onClick={() =>
                Modal.confirm({
                  title: `Publish version ${draft.version_no}?`,
                  content: "New claims will be checked against it. This is written to the audit trail.",
                  okText: "Publish",
                  onOk: () => publish.mutateAsync(),
                })
              }
            >
              Publish version {draft.version_no}
            </Button>
          ) : null
        }
      />

      <div role="group" aria-label="Policy versions" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {[...versions]
          .sort((a, b) => b.version_no - a.version_no)
          .map((v) => (
            <Button key={v.id} className="filter-pill" type={v.id === selected.id ? "primary" : "default"} aria-pressed={v.id === selected.id} onClick={() => setSelectedId(v.id)}>
              Version {v.version_no} · {STATUS_LABEL[v.status]}
            </Button>
          ))}
        {active?.published_at ? (
          <span style={{ fontSize: 13, color: "#5B6475", marginLeft: 8 }}>
            Version {active.version_no} published {formatDate(active.published_at)}
          </span>
        ) : null}
      </div>

      {selected.notes ? <p style={{ color: "#3F4859" }}>{selected.notes}</p> : null}

      {changes.length ? (
        <div className="banner banner-warn">
          <span>
            <strong>
              {changes.length} change{changes.length > 1 ? "s" : ""} in this draft.
            </strong>{" "}
            {changes.map((c) => c.code).join(", ")}. Publishing is written to the audit trail with the before and after.
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
            onRow={(r) => ({ style: changes.some((c) => c.code === r.code) ? { background: "#FFF8E8" } : undefined })}
            columns={[
              {
                title: "Rule",
                dataIndex: "code",
                render: (c, r) => (
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {c}
                    </span>
                    <span style={{ fontSize: 12, color: "#5B6475" }}>{TYPE_LABEL[r.type] ?? r.type}</span>
                  </span>
                ),
              },
              { title: "Applies to", dataIndex: "category", render: (c) => (c ? categories.byCode[c] ?? c : "All categories") },
              { title: "Limit", key: "limit", className: "num", render: (_, r) => limitText(r) },
              { title: "If breached", dataIndex: "outcome", render: (o) => <StatusChip tone={OUTCOME[o].tone}>{OUTCOME[o].label}</StatusChip> },
              { title: "Forces level", dataIndex: "force_level", render: (l) => <span style={{ color: "#5B6475" }}>{l ? ROLE_NAME[levels.find((x) => x.level_no === l)?.role] ?? `Level ${l}` : "None"}</span> },
              { title: "Active", dataIndex: "active", render: (a) => <StatusChip tone={a !== false ? "ok" : "neutral"}>{a !== false ? "On" : "Off"}</StatusChip> },
            ]}
          />
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 28 }}>
          <section>
            <b style={{ fontSize: 15, display: "block", paddingBottom: 6 }}>Approval levels</b>
            {[...levels]
              .sort((a, b) => a.level_no - b.level_no)
              .map((l) => (
                <div key={l.level_no} className="kv">
                  <span>
                    {l.level_no} · {ROLE_NAME[l.role]}
                    {l.active === false ? " (off)" : ""}
                  </span>
                  <span className="num" style={{ fontWeight: 600 }}>
                    {l.min_amount_paise_exclusive ? `Payable above ${formatINR(l.min_amount_paise_exclusive)}` : "Always"}
                  </span>
                </div>
              ))}
            <p style={{ fontSize: 12, color: "#5B6475", lineHeight: 1.5 }}>“Above” means strictly greater. Levels are fixed on a claim when it is submitted.</p>
          </section>
          <section>
            <b style={{ fontSize: 15, display: "block", paddingBottom: 6 }}>Settings</b>
            <div className="kv">
              <span>Auto-approve up to</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {formatINR(config.auto_approve_max_total_paise)} payable
              </span>
            </div>
            <div className="kv">
              <span>Sample audit rate</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {Math.round(config.sample_audit_rate * 100)}%
              </span>
            </div>
            <div className="kv">
              <span>Delegation limit</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {config.delegation_max_days} days
              </span>
            </div>
            <div className="kv">
              <span>IMPS limit per payment</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {formatINR(config.imps_max_paise)}
              </span>
            </div>
            <div className="kv">
              <span>Timezone</span>
              <span style={{ fontWeight: 600 }}>{config.timezone}</span>
            </div>
          </section>
        </div>
      </div>

      <Modal open={diffOpen} onCancel={() => setDiffOpen(false)} footer={null} width={720} title={`Version ${selected.version_no} vs version ${active?.version_no}`}>
        <Table
          rowKey="code"
          size="small"
          pagination={false}
          dataSource={changes}
          columns={[
            { title: "Rule", dataIndex: "code", render: (r) => <span className="mono">{r}</span> },
            { title: "Before", dataIndex: "before" },
            { title: "After", dataIndex: "after", render: (v, r) => <strong>{v}{r.activeChange ? " (on/off changed)" : ""}</strong> },
          ]}
        />
      </Modal>
    </div>
  );
}

export default function PolicyRulesPage() {
  const versions = useQuery({ queryKey: ["policy", "versions"], queryFn: listPolicyVersions });
  const levels = useQuery({ queryKey: ["policy", "levels"], queryFn: listApprovalLevels });
  const config = useQuery({ queryKey: ["policy", "config"], queryFn: getAppConfig });
  // Wait for all three; show the first error if any fails.
  const combined = {
    isPending: versions.isPending || levels.isPending || config.isPending,
    isError: versions.isError || levels.isError || config.isError,
    error: versions.error ?? levels.error ?? config.error,
    refetch: () => Promise.all([versions.refetch(), levels.refetch(), config.refetch()]),
    data: { versions: versions.data, levels: levels.data, config: config.data },
  };
  return (
    <>
      <TopBar
        left={
          <span>
            Admin <span aria-hidden="true">/</span> <span style={{ color: "#0E1424", fontWeight: 700 }}>Policy rules</span>
          </span>
        }
      />
      <LoadingOrError query={combined}>{(d) => <PolicyBody versions={d.versions} levels={d.levels} config={d.config} />}</LoadingOrError>
    </>
  );
}
