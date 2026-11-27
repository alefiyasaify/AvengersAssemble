import { DownloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Popconfirm, Steps, Table } from "antd";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { exportBatch, getPayoutBatches, getPayoutEligible, markBatchPaid } from "../../api/expenseApi";
import { TopBar } from "../../components/layout/TopBar";
import { StatusChip } from "../../components/common/StatusChip";
import { PageHeader } from "../../components/common/PageHeader";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { APPROVAL_LABEL } from "../../mockData/mockFinance";
import { formatINR } from "../../utils/formatMoney";
import { buildPayoutCsv, payoutFileName } from "../../utils/payoutCsvFile";

const STEP_INDEX = { DRAFT: 1, VERIFIED: 2, EXPORTED: 3, PAID: 4 };
const BATCH_TONE = { DRAFT: "neutral", VERIFIED: "info", EXPORTED: "warn", PAID: "ok" };

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function BatchPanel({ batch, eligible }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const claims = useMemo(() => eligible.filter((c) => batch.claim_ids.includes(c.id)), [eligible, batch]);
  const csv = useMemo(() => buildPayoutCsv(batch, claims), [batch, claims]);
  const csvLines = csv.split("\n");

  const doExport = useMutation({
    mutationFn: () => exportBatch(batch.id),
    onSuccess: () => {
      download(payoutFileName(batch), csv);
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      message.success("Bank file exported. The batch is now frozen.");
    },
    onError: (e) => message.error(e.message),
  });
  const doPaid = useMutation({
    mutationFn: () => markBatchPaid(batch.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      message.success(`${batch.claim_count} claims moved to Paid.`);
    },
    onError: (e) => message.error(e.message),
  });

  const exported = batch.status === "EXPORTED" || batch.status === "PAID";

  return (
    <aside className="panel-alt" style={{ flex: "1 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20, padding: 24 }} aria-label={`Batch ${batch.batch_no}`}>
      <div className="hero" style={{ borderRadius: 20, padding: 22, gap: 6 }}>
        <span className="label">Batch {batch.batch_no}</span>
        <span className="big num" style={{ fontSize: 44 }}>
          {formatINR(batch.total_paise)}
        </span>
        <span style={{ fontSize: 14, color: "#DCE6FF" }}>
          {batch.claim_count} claims · {batch.claim_count} employees · value date 30 Nov
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <StatusChip tone="ok">
          Verified by {batch.verified_by}, {batch.verified_label}
        </StatusChip>
        <StatusChip tone="ok">Count and total match the claims</StatusChip>
        {batch.excluded?.length ? <StatusChip tone="warn">{batch.excluded.length} claim left out: no bank details</StatusChip> : null}
        {batch.status !== "VERIFIED" ? <StatusChip tone={BATCH_TONE[batch.status]}>Status: {batch.status}</StatusChip> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Button type="primary" icon={<DownloadOutlined />} block style={{ height: 50 }} loading={doExport.isPending} onClick={() => (exported ? download(payoutFileName(batch), csv) : doExport.mutate())}>
          {exported ? "Download bank file again" : "Export bank file (CSV)"}
        </Button>
        <Popconfirm
          title={`Mark ${batch.claim_count} claims as Paid?`}
          description="This can’t be undone and is written to the audit trail."
          okText="Mark as paid"
          onConfirm={() => doPaid.mutate()}
          disabled={batch.status !== "EXPORTED"}
        >
          <Button block disabled={batch.status !== "EXPORTED"} loading={doPaid.isPending}>
            {batch.status === "PAID" ? "All claims paid" : `Mark ${batch.claim_count} claims as Paid`}
          </Button>
        </Popconfirm>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "#5B6475" }}>
          Export freezes the batch. Marking as paid moves all {batch.claim_count} claims to Paid, can’t be undone and is written to the audit trail.
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>File preview</span>
          <StatusChip tone="neutral" style={{ background: "#fff" }}>
            Mock bank format · UTF-8
          </StatusChip>
        </div>
        <pre className="mono" style={{ overflowX: "auto", background: "#fff", border: "1px solid #E5E8EF", borderRadius: 10, color: "#2B3040", padding: "14px 16px", lineHeight: 1.8, margin: 0 }}>
          {[payoutFileName(batch), ...csvLines.slice(0, 4), `… ${Math.max(0, csvLines.length - 5)} more detail rows`, csvLines[csvLines.length - 1]].join("\n")}
        </pre>
      </div>
    </aside>
  );
}

export default function PayoutBatchPage() {
  const eligible = useQuery({ queryKey: ["payouts", "eligible"], queryFn: getPayoutEligible });
  const batches = useQuery({ queryKey: ["payouts", "batches"], queryFn: getPayoutBatches });

  return (
    <>
      <TopBar
        left={
          <>
            <Link to="/head/payouts">Payout batches</Link>
            <span aria-hidden="true">/</span>
            <span style={{ color: "#0E1424", fontWeight: 600 }}>New batch</span>
          </>
        }
      />
      <div className="ef-page">
        <PageHeader
          title="Build a payout batch"
          description="Approved claims go into one bank file. A different person, the auditor, must verify the batch before you can export it. Claims move to Paid only after export."
        />
        <LoadingOrError query={batches}>
          {(bdata) => {
            const current = bdata.items[0];
            const step = STEP_INDEX[current.status];
            return (
              <>
                <Steps
                  current={Math.min(step, 3)}
                  status={step === 4 ? "finish" : "process"}
                  items={[
                    { title: "Create", description: current.created_by },
                    { title: "Verify", description: current.verified_by },
                    { title: "Export" },
                    { title: "Mark as paid" },
                  ]}
                />
                <LoadingOrError query={eligible}>
                  {(edata) => (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "flex-start" }}>
                      <div style={{ flex: "1.5 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 32 }}>
                        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div className="section-title">
                            <b style={{ fontSize: 15 }}>Approved and ready to pay</b>
                            <span>
                              {edata.items.length} claims · {formatINR(edata.items.reduce((s, c) => s + c.payable_paise, 0))} · sample-audit holds excluded
                            </span>
                          </div>
                          <Table
                            rowKey="id"
                            dataSource={edata.items}
                            pagination={false}
                            scroll={{ x: 640 }}
                            rowSelection={{
                              selectedRowKeys: current.claim_ids,
                              getCheckboxProps: (r) => ({ disabled: true, "aria-label": `${r.claim_no} ${r.bank_ok ? "in batch" : "excluded"}` }),
                            }}
                            onRow={(r) => ({ style: !r.bank_ok ? { background: "#FFF8F7" } : undefined })}
                            columns={[
                              { title: "Claim", dataIndex: "claim_no", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
                              {
                                title: "Employee",
                                dataIndex: "owner",
                                render: (o, r) => (
                                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <span style={{ fontWeight: 500 }}>{o}</span>
                                    <span style={{ fontSize: 12, color: "#5B6475" }}>{r.department}</span>
                                  </span>
                                ),
                              },
                              { title: "Amount", dataIndex: "payable_paise", align: "right", render: (v) => <span className="num" style={{ fontWeight: 700 }}>{formatINR(v)}</span> },
                              {
                                title: "Status",
                                dataIndex: "approval",
                                render: (a, r) => (r.bank_ok ? <StatusChip tone="ok">{APPROVAL_LABEL[a]}</StatusChip> : <StatusChip tone="bad">No bank details</StatusChip>),
                              },
                            ]}
                          />
                        </section>
                        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <b style={{ fontSize: 15 }}>Recent batches</b>
                          <Table
                            rowKey="id"
                            dataSource={bdata.items.slice(1)}
                            pagination={false}
                            scroll={{ x: 620 }}
                            columns={[
                              { title: "Batch", dataIndex: "batch_no", render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
                              { title: "Created", dataIndex: "created_label", render: (v) => <span style={{ color: "#5B6475" }}>{v}</span> },
                              { title: "Claims", dataIndex: "claim_count" },
                              { title: "Total", dataIndex: "total_paise", align: "right", render: (v) => <span className="num" style={{ fontWeight: 700 }}>{formatINR(v)}</span> },
                              { title: "Status", dataIndex: "status", render: (s) => <StatusChip tone={BATCH_TONE[s]}>{s[0] + s.slice(1).toLowerCase()}</StatusChip> },
                            ]}
                          />
                        </section>
                      </div>
                      <BatchPanel batch={current} eligible={edata.items} />
                    </div>
                  )}
                </LoadingOrError>
              </>
            );
          }}
        </LoadingOrError>
      </div>
    </>
  );
}
