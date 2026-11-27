import { SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Input, Select, Table } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { bulkApprove, getReviewQueue } from "../../api/reviewQueueApi";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useCategories, useDepartments } from "../../hooks/useLookups";
import { formatINR, rupeesToPaise } from "../../utils/formatMoney";
import { claimStatus, daysSince, ruleLabel, ruleTone } from "../../utils/statusLabels";

// Tabs map to GET /review-queue filters. `flag` is a policy rule code.
const TABS = [
  { key: "ALL", label: "All pending", filters: {} },
  { key: "DUPLICATE_LINE", label: "Duplicates", filters: { flag: "DUPLICATE_LINE" } },
  { key: "SPLIT_SUSPECT", label: "Split suspect", filters: { flag: "SPLIT_SUSPECT" } },
  { key: "WEEKEND_SPEND", label: "Weekend", filters: { flag: "WEEKEND_SPEND" } },
  { key: "SAMPLE", label: "Sample audit", filters: { sample_audit: true } },
];
const BULK_LIMIT = 50;

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

/** GET /review-queue + POST /review-queue/bulk-approve. `initialFlag` presets the tab. */
export default function ReviewQueuePage({ initialFlag = "ALL" }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const departments = useDepartments();
  const categories = useCategories();
  const [tab, setTab] = useState(initialFlag);
  const [departmentId, setDepartmentId] = useState("");
  const [category, setCategory] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]);

  const filters = {
    ...TABS.find((t) => t.key === tab)?.filters,
    department_id: departmentId || undefined,
    category: category || undefined,
    min_payable_paise: rupeesToPaise(minAmount) ?? undefined,
    q: q.trim() || undefined,
  };
  const query = useQuery({ queryKey: ["review-queue", filters], queryFn: () => getReviewQueue(filters) });
  const rows = query.data?.items ?? [];
  const selectedRows = rows.filter((r) => selected.includes(r.id));
  const selectedTotal = selectedRows.reduce((s, r) => s + r.payable_paise, 0);

  const approve = useMutation({
    mutationFn: () => bulkApprove(selectedRows),
    onSuccess: (res) => {
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      const parts = [`${res.approved} approved`];
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      if (res.failed) parts.push(`${res.failed} failed`);
      const reasons = [...new Set(res.results.filter((r) => r.result !== "APPROVED" && r.reason).map((r) => r.reason))];
      (res.failed || res.skipped ? message.warning : message.success)(`${parts.join(", ")}.${reasons.length ? ` ${reasons.join(" ")}` : ""}`);
    },
    onError: (err) => message.error(err.message),
  });

  return (
    <>
      <TopBar
        left={
          <Input
            prefix={<SearchOutlined style={{ color: "#5B6475" }} />}
            placeholder="Search claims, people, vendors"
            aria-label="Search claims"
            allowClear
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 360, maxWidth: "100%", background: "#F7F8FA", border: 0 }}
          />
        }
      />
      <div className="ef-page">
        <PageHeader title="Review queue" description="Claims waiting on the auditor step, plus auto-approved claims picked for the sample audit." />

        <div role="group" aria-label="Queue filter" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TABS.map((t) => (
            <Button
              key={t.key}
              className="filter-pill"
              type={tab === t.key ? "primary" : "default"}
              aria-pressed={tab === t.key}
              onClick={() => {
                setTab(t.key);
                setSelected([]);
              }}
            >
              {t.label}
              {tab === t.key && query.data ? ` · ${query.data.total_estimate}` : ""}
            </Button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Select
            aria-label="Department"
            value={departmentId}
            onChange={setDepartmentId}
            style={{ minWidth: 200 }}
            prefix={<span style={{ color: "#5B6475" }}>Department:</span>}
            options={[{ value: "", label: "All" }, ...departments.list.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <Select
            aria-label="Category"
            value={category}
            onChange={setCategory}
            style={{ minWidth: 180 }}
            prefix={<span style={{ color: "#5B6475" }}>Category:</span>}
            options={[{ value: "", label: "All" }, ...categories.list.map((c) => ({ value: c.code, label: c.name }))]}
          />
          <Input
            aria-label="Minimum payable amount in rupees"
            prefix={<span style={{ color: "#5B6475" }}>Amount from ₹</span>}
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            inputMode="decimal"
            allowClear
            style={{ width: 220 }}
          />
        </div>

        {selected.length ? (
          <div className="action-bar" style={{ borderRadius: 18, padding: "14px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, fontSize: 14 }}>
              <span style={{ fontWeight: 700 }}>{selected.length} selected</span>
              <span className="num">{formatINR(selectedTotal)} in total</span>
              <span style={{ color: "#C9D0E2" }}>Claims with high-severity flags are skipped in bulk. Up to {BULK_LIMIT} per call.</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button onClick={() => setSelected([])}>Clear</Button>
              <Button type="primary" loading={approve.isPending} disabled={selected.length > BULK_LIMIT} onClick={() => approve.mutate()}>
                Approve {selected.length}
              </Button>
            </div>
          </div>
        ) : null}

        <LoadingOrError query={query}>
          {(data) => (
            <>
              <Table
                rowKey="id"
                dataSource={data.items}
                pagination={false}
                scroll={{ x: 1000 }}
                locale={{ emptyText: "Nothing in this queue." }}
                rowSelection={{
                  selectedRowKeys: selected,
                  onChange: (keys) => setSelected(keys),
                  getCheckboxProps: (r) => ({ disabled: r.has_high_severity, "aria-label": `Select ${r.claim_no}` }),
                }}
                onRow={(r) => ({
                  onDoubleClick: () => navigate(`/auditor/claims/${r.id}`),
                  style: r.has_high_severity ? { background: "#FFF8F7" } : undefined,
                })}
                columns={[
                  {
                    title: "Claim",
                    dataIndex: "title",
                    render: (t, r) => (
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <a
                          href={`/auditor/claims/${r.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/auditor/claims/${r.id}`);
                          }}
                          style={{ fontWeight: 600 }}
                        >
                          {t}
                        </a>
                        <span style={{ fontSize: 12, color: "#5B6475" }}>
                          {r.claim_no} · {claimStatus(r.status).label}
                        </span>
                      </span>
                    ),
                  },
                  {
                    title: "Employee",
                    dataIndex: "owner_name",
                    render: (o, r) => (
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <InitialsAvatar text={initials(o)} />
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontWeight: 600 }}>{o}</span>
                          <span style={{ fontSize: 12, color: "#5B6475" }}>{departments.byId[r.department_id] ?? ""}</span>
                        </span>
                      </span>
                    ),
                  },
                  {
                    title: "Amount",
                    dataIndex: "payable_paise",
                    align: "right",
                    sorter: (a, b) => a.payable_paise - b.payable_paise,
                    render: (v) => (
                      <span className="num" style={{ fontWeight: 700, fontSize: 14 }}>
                        {formatINR(v)}
                      </span>
                    ),
                  },
                  {
                    title: "Flags",
                    dataIndex: "finding_codes",
                    render: (codes, r) => (
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {codes.length ? (
                          codes.map((c) => (
                            <StatusChip key={c} tone={ruleTone(c)}>
                              {ruleLabel(c)}
                            </StatusChip>
                          ))
                        ) : (
                          <StatusChip tone="ok">Clean</StatusChip>
                        )}
                        {r.sample_audit_pending ? <StatusChip tone="info">Sample audit</StatusChip> : null}
                      </span>
                    ),
                  },
                  {
                    title: "Waiting",
                    key: "waiting",
                    sorter: (a, b) => daysSince(a.current_step?.since) - daysSince(b.current_step?.since),
                    render: (_, r) => {
                      const d = daysSince(r.current_step?.since ?? r.submitted_at);
                      return <StatusChip tone={d >= 4 ? "bad" : d >= 2 ? "warn" : "neutral"}>{d === 0 ? "Today" : `${d} day${d > 1 ? "s" : ""}`}</StatusChip>;
                    },
                  },
                ]}
              />
              <div style={{ fontSize: 13, color: "#5B6475" }}>
                Showing {data.items.length} of {data.total_estimate}
                {data.next_cursor ? " · narrow the filters to see the rest" : ""}
              </div>
            </>
          )}
        </LoadingOrError>
      </div>
    </>
  );
}
