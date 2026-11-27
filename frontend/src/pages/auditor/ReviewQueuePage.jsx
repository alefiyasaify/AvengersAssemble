import { LeftOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { App, Button, Input, Select, Table } from "antd";
import { useMemo, useState } from "react";

import { bulkApprove, getReviewQueue } from "../../api/expenseApi";
import { TopBar } from "../../components/layout/TopBar";
import { StatusChip } from "../../components/common/StatusChip";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { KeyboardKey } from "../../components/common/KeyboardKey";
import { PageHeader } from "../../components/common/PageHeader";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { formatINR } from "../../utils/formatMoney";

const TABS = [
  { key: "ALL", label: "All pending" },
  { key: "DUPLICATE", label: "Duplicates" },
  { key: "SPLIT_SUSPECT", label: "Split suspect" },
  { key: "SAMPLE_AUDIT", label: "Sample audit" },
  { key: "PAST_SLA", label: "Past SLA" },
];

const FLAG_CHIP = {
  WEEKEND: ["warn", "Weekend"],
  SPLIT_SUSPECT: ["bad", "Split suspect"],
  DUPLICATE: ["bad", "Duplicate receipt"],
  SAMPLE_AUDIT: ["info", "Sample audit"],
};

const blocked = (row) => row.flags.includes("DUPLICATE");
const riskColor = (v) => (v >= 70 ? "#E5483A" : v >= 40 ? "#E59A12" : "#2563EB");

function Filter({ label, value, onChange, options }) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={onChange}
      style={{ minWidth: 170 }}
      prefix={<span style={{ color: "#5B6475" }}>{label}:</span>}
      options={options}
    />
  );
}

/** GET /review-queue + POST /review-queue/bulk-approve. `initialFlag` presets the tab. */
export default function ReviewQueuePage({ initialFlag = "ALL" }) {
  const { message } = App.useApp();
  const [flag, setFlag] = useState(initialFlag);
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [approved, setApproved] = useState([]);

  const query = useQuery({
    queryKey: ["review-queue", flag, department, category],
    queryFn: () => getReviewQueue({ flag: flag === "ALL" ? undefined : flag, department: department || undefined, category: category || undefined }),
  });

  // Pre-select clean rows the way the design shows (everything except flagged high-risk).
  const [selected, setSelected] = useState(null);
  const rows = useMemo(() => {
    const items = (query.data?.items ?? []).filter((r) => !approved.includes(r.id));
    if (!q.trim()) return items;
    const needle = q.trim().toLowerCase();
    return items.filter((r) => [r.title, r.claim_no, r.owner, r.department].some((s) => s.toLowerCase().includes(needle)));
  }, [query.data, approved, q]);
  const selectedKeys = selected ?? rows.filter((r) => !blocked(r) && r.flags.length === 0).map((r) => r.id);
  const selectedRows = rows.filter((r) => selectedKeys.includes(r.id));
  const selectedTotal = selectedRows.reduce((s, r) => s + r.payable_paise, 0);

  const approve = useMutation({
    mutationFn: () => bulkApprove(selectedKeys),
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.result === "APPROVED").map((r) => r.claim_id);
      const skipped = res.results.length - ok.length;
      setApproved((a) => [...a, ...ok]);
      setSelected([]);
      message.success(`${ok.length} approved${skipped ? `, ${skipped} skipped (high-severity flag)` : ""}.`);
    },
    onError: (err) => message.error(err.message),
  });

  const counts = query.data?.counts;
  const depts = [...new Set((query.data?.items ?? []).map((r) => r.department))];

  return (
    <>
      <TopBar
        left={
          <Input
            prefix={<SearchOutlined style={{ color: "#5B6475" }} />}
            suffix={<KeyboardKey>Ctrl K</KeyboardKey>}
            placeholder="Search claims, people, vendors"
            aria-label="Search claims"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 360, maxWidth: "100%", background: "#F7F8FA", border: 0 }}
          />
        }
      />
      <div className="ef-page">
        <PageHeader
          title="Review queue"
          description="Claims above ₹25,000 after manager approval, plus the 10% sample of auto-approved claims."
          extra={
            <>
              <Button>Export CSV</Button>
              <Button>Save this view</Button>
            </>
          }
        />

        <div role="group" aria-label="Queue filter" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TABS.map((t) => (
            <Button
              key={t.key}
              className="filter-pill"
              type={flag === t.key ? "primary" : "default"}
              aria-pressed={flag === t.key}
              onClick={() => {
                setFlag(t.key);
                setSelected(null);
              }}
            >
              {t.label}
              {counts ? ` · ${counts[t.key]}` : ""}
            </Button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Filter label="Department" value={department} onChange={setDepartment} options={[{ value: "", label: "All" }, ...depts.map((d) => ({ value: d, label: d }))]} />
          <Filter
            label="Category"
            value={category}
            onChange={setCategory}
            options={[{ value: "", label: "All" }, ...["Travel", "Hotel", "Meals", "Local cab", "Other"].map((d) => ({ value: d, label: d }))]}
          />
          <Filter label="Amount" value="25000" onChange={() => {}} options={[{ value: "25000", label: "₹25,000 and above" }]} />
          <Filter label="Age" value="any" onChange={() => {}} options={[{ value: "any", label: "Any" }]} />
        </div>

        {selectedKeys.length ? (
          <div className="action-bar" style={{ borderRadius: 18, padding: "14px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, fontSize: 14 }}>
              <span style={{ fontWeight: 700 }}>{selectedKeys.length} selected</span>
              <span className="num">{formatINR(selectedTotal)} in total</span>
              <span style={{ color: "#C9D0E2" }}>Duplicates and high-severity flags are skipped in bulk. Up to 50 per call.</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button onClick={() => setSelected([])}>Clear</Button>
              <Button type="primary" loading={approve.isPending} onClick={() => approve.mutate()}>
                Approve {selectedKeys.length}
              </Button>
            </div>
          </div>
        ) : null}

        <LoadingOrError query={query}>
          {(data) => (
            <>
              <Table
                rowKey="id"
                dataSource={rows}
                pagination={false}
                scroll={{ x: 1080 }}
                rowSelection={{
                  selectedRowKeys: selectedKeys,
                  onChange: (keys) => setSelected(keys),
                  getCheckboxProps: (r) => ({ disabled: blocked(r), "aria-label": `Select ${r.claim_no}` }),
                }}
                rowClassName={(r) => (blocked(r) ? "row-blocked" : "")}
                onRow={(r) => ({ style: blocked(r) ? { background: "#FFF8F7" } : undefined })}
                columns={[
                  {
                    title: "Claim",
                    dataIndex: "title",
                    render: (t, r) => (
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{t}</span>
                        <span style={{ fontSize: 12, color: "#5B6475" }}>
                          {r.claim_no} · {r.stage}
                        </span>
                      </span>
                    ),
                  },
                  {
                    title: "Employee",
                    dataIndex: "owner",
                    render: (o, r) => (
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <InitialsAvatar text={o.split(" ").map((p) => p[0]).join("")} />
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontWeight: 600 }}>{o}</span>
                          <span style={{ fontSize: 12, color: "#5B6475" }}>{r.department}</span>
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
                    dataIndex: "flags",
                    render: (flags) => (
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {flags.length ? flags.map((f) => <StatusChip key={f} tone={FLAG_CHIP[f][0]}>{FLAG_CHIP[f][1]}</StatusChip>) : <StatusChip tone="ok">Clean</StatusChip>}
                      </span>
                    ),
                  },
                  {
                    title: "Risk",
                    dataIndex: "risk_score",
                    sorter: (a, b) => a.risk_score - b.risk_score,
                    render: (v) => (
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }} aria-label={`Risk ${v} of 100`}>
                        <span style={{ width: 52, height: 8, borderRadius: 4, background: "#E8EBF3", overflow: "hidden" }}>
                          <span style={{ display: "block", height: 8, width: `${v}%`, background: riskColor(v) }} />
                        </span>
                        <span className="num" style={{ fontWeight: 800 }}>
                          {v}
                        </span>
                      </span>
                    ),
                  },
                  {
                    title: "Waiting",
                    dataIndex: "waiting_days",
                    sorter: (a, b) => a.waiting_days - b.waiting_days,
                    render: (d, r) => (
                      <StatusChip tone={r.past_sla ? "bad" : d >= 3 ? "warn" : "neutral"}>
                        {d} day{d > 1 ? "s" : ""}
                        {r.past_sla ? ", past SLA" : ""}
                      </StatusChip>
                    ),
                  },
                ]}
              />
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13, color: "#5B6475" }}>
                <span>
                  Showing 1 to {rows.length} of {flag === "ALL" ? data.total_estimate : (counts?.[flag] ?? rows.length)}
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  <Button icon={<LeftOutlined />} aria-label="Previous page" disabled />
                  <Button icon={<RightOutlined />} aria-label="Next page" disabled={!data.next_cursor} />
                </span>
              </div>
            </>
          )}
        </LoadingOrError>
      </div>
    </>
  );
}
