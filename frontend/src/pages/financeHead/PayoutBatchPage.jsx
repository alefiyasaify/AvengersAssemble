import { DownloadOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Input, Popconfirm, Skeleton, Steps, Table } from "antd";
import { useState } from "react";

import * as payoutsApi from "../../api/payoutsApi";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useAuth } from "../../context/AuthContext";
import { formatINR } from "../../utils/formatMoney";
import { BATCH_STATUS, formatDate } from "../../utils/statusLabels";

const STEP_INDEX = { DRAFT: 1, VERIFIED: 2, EXPORTED: 3, PAID: 4, CANCELLED: 0 };

function saveTextFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Right-hand panel: one batch, its claims, and the next action for this role. */
function BatchPanel({ batchId }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const batchQuery = useQuery({ queryKey: ["payouts", "batch", batchId], queryFn: () => payoutsApi.getBatch(batchId) });
  const batch = batchQuery.data;
  const hasFile = batch && (batch.status === "EXPORTED" || batch.status === "PAID");
  const fileQuery = useQuery({ queryKey: ["payouts", "file", batchId], queryFn: () => payoutsApi.downloadBatchFile(batchId), enabled: !!hasFile });

  const act = useMutation({
    mutationFn: (action) => payoutsApi[action](batchId),
    onSuccess: (updated, action) => {
      queryClient.setQueryData(["payouts", "batch", batchId], updated);
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      const done = { verifyBatch: "Batch verified", exportBatch: "Bank file generated. The batch is now frozen.", markBatchPaid: `${updated.claim_count} claims moved to Paid`, cancelBatch: "Batch cancelled" };
      message.success(done[action]);
      if (action === "exportBatch") payoutsApi.downloadBatchFile(batchId).then((csv) => saveTextFile(updated.file_name ?? `${updated.batch_no}.csv`, csv));
    },
    onError: (err) => message.error(err.message),
  });

  if (batchQuery.isPending) return <Skeleton active />;
  if (batchQuery.isError) return <p>Could not load this batch: {batchQuery.error.message}</p>;
  const st = BATCH_STATUS[batch.status];
  const csvLines = fileQuery.data?.split(/\r?\n/).filter(Boolean) ?? [];

  return (
    <aside className="panel-alt" style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20, padding: 24 }} aria-label={`Batch ${batch.batch_no}`}>
      <div className="hero" style={{ borderRadius: 20, padding: 22, gap: 6 }}>
        <span className="label">Batch {batch.batch_no}</span>
        <span className="big num" style={{ fontSize: 44 }}>
          {formatINR(batch.total_paise)}
        </span>
        <span style={{ fontSize: 14, color: "#DCE6FF" }}>
          {batch.claim_count} claims · created {formatDate(batch.created_at)}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <StatusChip tone={st.tone}>{st.label}</StatusChip>
        {batch.verified_at ? <StatusChip tone="ok">Verified {formatDate(batch.verified_at, true)}</StatusChip> : null}
        {batch.exported_at ? <StatusChip tone="ok">Exported {formatDate(batch.exported_at, true)}</StatusChip> : null}
        {batch.paid_at ? <StatusChip tone="ok">Paid {formatDate(batch.paid_at, true)}</StatusChip> : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {batch.status === "DRAFT" && role === "auditor" ? (
          <Button type="primary" block style={{ height: 50 }} loading={act.isPending} onClick={() => act.mutate("verifyBatch")}>
            Verify batch
          </Button>
        ) : null}
        {batch.status === "DRAFT" && role === "head" ? <p style={{ fontSize: 13, color: "#5B6475" }}>Waiting for a finance auditor to verify the count and total. You can’t verify your own batch.</p> : null}
        {batch.status === "VERIFIED" && role === "head" ? (
          <Button type="primary" icon={<DownloadOutlined />} block style={{ height: 50 }} loading={act.isPending} onClick={() => act.mutate("exportBatch")}>
            Export bank file (CSV)
          </Button>
        ) : null}
        {hasFile ? (
          <Button icon={<DownloadOutlined />} block onClick={() => fileQuery.data && saveTextFile(batch.file_name ?? `${batch.batch_no}.csv`, fileQuery.data)} disabled={!fileQuery.data}>
            Download bank file
          </Button>
        ) : null}
        {batch.status === "EXPORTED" && role === "head" ? (
          <Popconfirm title={`Mark ${batch.claim_count} claims as Paid?`} description="This can’t be undone and is written to the audit trail." okText="Mark as paid" onConfirm={() => act.mutate("markBatchPaid")}>
            <Button type="primary" block loading={act.isPending}>
              Mark {batch.claim_count} claims as Paid
            </Button>
          </Popconfirm>
        ) : null}
        {(batch.status === "DRAFT" || batch.status === "VERIFIED") && role === "head" ? (
          <Popconfirm title="Cancel this batch?" description="Its claims go back to the eligible list." okText="Cancel batch" okButtonProps={{ danger: true }} onConfirm={() => act.mutate("cancelBatch")}>
            <Button danger block>
              Cancel batch
            </Button>
          </Popconfirm>
        ) : null}
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "#5B6475" }}>Export freezes the batch. Marking as paid moves every claim in it to Paid, can’t be undone and is written to the audit trail.</p>
      </div>

      {hasFile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>File preview</span>
            {batch.file_sha256 ? <span className="mono" style={{ color: "#5B6475" }}>sha256 {batch.file_sha256.slice(0, 10)}…</span> : null}
          </div>
          <pre className="mono" style={{ overflowX: "auto", background: "#fff", border: "1px solid #E5E8EF", borderRadius: 10, color: "#2B3040", padding: "14px 16px", lineHeight: 1.8, margin: 0 }}>
            {fileQuery.isPending
              ? "Loading…"
              : [batch.file_name, ...csvLines.slice(0, 5), csvLines.length > 6 ? `… ${csvLines.length - 6} more rows` : null, csvLines.length > 5 ? csvLines[csvLines.length - 1] : null].filter(Boolean).join("\n")}
          </pre>
        </div>
      ) : null}
    </aside>
  );
}

/** Eligible claims → new DRAFT batch (finance head only). */
function EligibleClaims({ onCreated }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState([]);
  const query = useQuery({ queryKey: ["payouts", "eligible"], queryFn: payoutsApi.listEligible });

  const create = useMutation({
    mutationFn: () => payoutsApi.createBatch(selected),
    onSuccess: (batch) => {
      message.success(`${batch.batch_no} created with ${batch.claim_count} claims. An auditor must verify it next.`);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      onCreated(batch.id);
    },
    onError: (err) => message.error(err.message),
  });

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <LoadingOrError query={query}>
        {(items) => {
          const total = items.filter((c) => selected.includes(c.claim_id)).reduce((s, c) => s + c.payable_paise, 0);
          return (
            <>
              <div className="section-title">
                <b style={{ fontSize: 15 }}>Approved and ready to pay</b>
                <span>
                  {items.length} claims · {formatINR(items.reduce((s, c) => s + c.payable_paise, 0))} · sample-audit holds excluded
                </span>
              </div>
              <Table
                rowKey="claim_id"
                dataSource={items}
                pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 25, 50, 100], showTotal: (total, [from, to]) => `${from}–${to} of ${total} claims` }}
                scroll={{ x: 560 }}
                locale={{ emptyText: <Empty description="No approved claims are waiting for payout." /> }}
                rowSelection={{
                  selectedRowKeys: selected,
                  onChange: setSelected,
                  preserveSelectedRowKeys: true,
                  selections: [
                    { key: "all", text: `Select all ${items.length} claims`, onSelect: () => setSelected(items.map((c) => c.claim_id)) },
                    Table.SELECTION_INVERT,
                    Table.SELECTION_NONE,
                  ],
                  getCheckboxProps: (r) => ({ "aria-label": `Select ${r.claim_no}` }),
                }}
                columns={[
                  { title: "Claim", dataIndex: "claim_no", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
                  { title: "Employee", dataIndex: "owner_name" },
                  { title: "Approved", dataIndex: "decided_at", render: (v) => formatDate(v) },
                  {
                    title: "Amount",
                    dataIndex: "payable_paise",
                    align: "right",
                    render: (v) => (
                      <span className="num" style={{ fontWeight: 700 }}>
                        {formatINR(v)}
                      </span>
                    ),
                  },
                ]}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="primary" icon={<PlusOutlined />} disabled={!selected.length} loading={create.isPending} onClick={() => create.mutate()}>
                  Create batch{selected.length ? ` · ${selected.length} claims, ${formatINR(total)}` : ""}
                </Button>
              </div>
            </>
          );
        }}
      </LoadingOrError>
    </section>
  );
}

export default function PayoutBatchPage() {
  const { role } = useAuth();
  const [selectedId, setSelectedId] = useState(null);
  const batches = useQuery({ queryKey: ["payouts", "batches"], queryFn: payoutsApi.listBatches });
  const items = batches.data?.items ?? [];
  // Default to the newest batch that still needs an action.
  const active = selectedId ?? (items.find((b) => !["PAID", "CANCELLED"].includes(b.status)) ?? items[0])?.id;
  const activeBatch = items.find((b) => b.id === active);
  const step = activeBatch ? STEP_INDEX[activeBatch.status] : 0;

  return (
    <>
      <TopBar left={<span style={{ color: "#0E1424", fontWeight: 700 }}>Payout batches</span>} />
      <div className="ef-page">
        <PageHeader
          title={role === "head" ? "Build a payout batch" : "Payout batches"}
          description="Approved claims go into one bank file. A different person, the auditor, must verify the batch before it can be exported. Claims move to Paid only after export."
        />
        {activeBatch && activeBatch.status !== "CANCELLED" ? (
          <Steps
            current={Math.min(step, 3)}
            status={step === 4 ? "finish" : "process"}
            items={[{ title: "Create" }, { title: "Verify", description: "Finance auditor" }, { title: "Export" }, { title: "Mark as paid" }]}
          />
        ) : null}
        {/* 1. Eligible claims (head only) with the selected batch's summary and actions beside it. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
          {role === "head" ? (
            <div style={{ flex: "1.5 1 520px", minWidth: 0 }}>
              <EligibleClaims onCreated={setSelectedId} />
            </div>
          ) : null}
          {active ? <BatchPanel key={active} batchId={active} /> : null}
        </div>

        {/* 2. All batches, full width. */}
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-label="Batches">
          <div className="section-title">
            <b>Batches</b>
            <span>Select a batch to see its payments and next step</span>
          </div>
          <LoadingOrError query={batches}>
            {() => (
              <Table
                rowKey="id"
                dataSource={items}
                pagination={{ pageSize: 8, showSizeChanger: false, hideOnSinglePage: true, showTotal: (total, [from, to]) => `${from}–${to} of ${total} batches` }}
                scroll={{ x: 900 }}
                locale={{ emptyText: "No batches yet." }}
                onRow={(b) => ({
                  onClick: () => setSelectedId(b.id),
                  onKeyDown: (e) => e.key === "Enter" && setSelectedId(b.id),
                  tabIndex: 0,
                  "aria-selected": b.id === active,
                  style: { cursor: "pointer", background: b.id === active ? "#F3F7FF" : undefined },
                })}
                columns={[
                  { title: "Batch", dataIndex: "batch_no", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
                  { title: "Status", dataIndex: "status", render: (s) => <StatusChip tone={BATCH_STATUS[s].tone}>{BATCH_STATUS[s].label}</StatusChip> },
                  { title: "Claims", dataIndex: "claim_count", align: "right" },
                  {
                    title: "Total",
                    dataIndex: "total_paise",
                    align: "right",
                    sorter: (a, b) => a.total_paise - b.total_paise,
                    render: (v) => (
                      <span className="num" style={{ fontWeight: 700 }}>
                        {formatINR(v)}
                      </span>
                    ),
                  },
                  { title: "Created", dataIndex: "created_at", sorter: (a, b) => a.created_at.localeCompare(b.created_at), render: (v) => <span style={{ color: "#5B6475" }}>{formatDate(v)}</span> },
                  { title: "Verified", dataIndex: "verified_at", render: (v) => (v ? formatDate(v) : <span style={{ color: "#9AA3B5" }}>–</span>) },
                  { title: "Exported", dataIndex: "exported_at", render: (v) => (v ? formatDate(v) : <span style={{ color: "#9AA3B5" }}>–</span>) },
                  { title: "Paid", dataIndex: "paid_at", render: (v) => (v ? formatDate(v) : <span style={{ color: "#9AA3B5" }}>–</span>) },
                ]}
              />
            )}
          </LoadingOrError>
        </section>

        {/* 3. Payments in the selected batch, full width. */}
        {active ? <BatchItems key={`items-${active}`} batchId={active} /> : null}
      </div>
    </>
  );
}

/** Full-width list of the payments in the selected batch (can be hundreds of rows). */
function BatchItems({ batchId }) {
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["payouts", "batch", batchId], queryFn: () => payoutsApi.getBatch(batchId) });

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-label="Payments in this batch">
      <LoadingOrError query={query} rows={6}>
        {(batch) => {
          const needle = q.trim().toLowerCase();
          const rows = needle
            ? batch.items.filter((i) => i.employee_name.toLowerCase().includes(needle) || i.bank_ref.toLowerCase().includes(needle) || i.account_last4.includes(needle))
            : batch.items;
          return (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div className="section-title" style={{ flex: "1 1 auto" }}>
                  <b>Payments in {batch.batch_no}</b>
                  <span>
                    {batch.claim_count} claims · {formatINR(batch.total_paise)}
                  </span>
                </div>
                <Input prefix={<SearchOutlined />} placeholder="Search employee, account or reference" aria-label="Search payments" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
              </div>
              <Table
                rowKey="claim_id"
                size="middle"
                dataSource={rows}
                pagination={rows.length > 15 ? { pageSize: 15, showSizeChanger: false, showTotal: (total, [from, to]) => `${from}–${to} of ${total}` } : false}
                scroll={{ x: 640 }}
                locale={{ emptyText: q ? "No payment matches that search" : "This batch has no claims" }}
                columns={[
                  { title: "#", dataIndex: "seq", width: 64, sorter: (a, b) => a.seq - b.seq, defaultSortOrder: "ascend" },
                  { title: "Employee", dataIndex: "employee_name", sorter: (a, b) => a.employee_name.localeCompare(b.employee_name) },
                  { title: "Account", dataIndex: "account_last4", render: (v) => <span className="mono">••••{v}</span> },
                  { title: "Bank reference", dataIndex: "bank_ref", render: (v) => <span className="mono">{v}</span> },
                  {
                    title: "Amount",
                    dataIndex: "amount_paise",
                    align: "right",
                    sorter: (a, b) => a.amount_paise - b.amount_paise,
                    render: (v) => (
                      <span className="num" style={{ fontWeight: 700 }}>
                        {formatINR(v)}
                      </span>
                    ),
                  },
                ]}
              />
            </>
          );
        }}
      </LoadingOrError>
    </section>
  );
}
