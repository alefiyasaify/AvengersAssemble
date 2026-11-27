import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Input, Modal, Segmented, Table } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";

import { listSampleAudits, resolveSampleAudit } from "../../api/reviewQueueApi";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { formatINR } from "../../utils/formatMoney";
import { formatDate } from "../../utils/statusLabels";

const STATUS_TONE = { PENDING: "info", PASSED: "ok", FAILED: "bad" };

/** GET /sample-audits + POST /sample-audits/{id}/resolve. Sampled claims are held from payout until resolved. */
export default function SampleAuditPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("PENDING");
  const [resolving, setResolving] = useState(null); // { sample, result }
  const [note, setNote] = useState("");
  const query = useQuery({ queryKey: ["sample-audits", status], queryFn: () => listSampleAudits(status || undefined) });

  const resolve = useMutation({
    mutationFn: () => resolveSampleAudit(resolving.sample.id, resolving.result, note.trim()),
    onSuccess: (res) => {
      message.success(`${res.claim_number} marked ${res.status.toLowerCase()}`);
      setResolving(null);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["sample-audits"] });
    },
    onError: (err) => message.error(err.message),
  });

  return (
    <>
      <TopBar left={<span style={{ color: "#0E1424", fontWeight: 700 }}>Sample audit</span>} />
      <div className="ef-page">
        <PageHeader
          title="Sample audit"
          description="A random share of auto-approved claims is picked for checking. They stay out of payout batches until you pass or fail them."
          extra={
            <Segmented
              aria-label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { label: "Pending", value: "PENDING" },
                { label: "Passed", value: "PASSED" },
                { label: "Failed", value: "FAILED" },
                { label: "All", value: "" },
              ]}
            />
          }
        />
        <LoadingOrError query={query}>
          {(data) => (
            <Table
              rowKey="id"
              dataSource={data.items}
              pagination={false}
              scroll={{ x: 820 }}
              locale={{ emptyText: "No sampled claims here." }}
              columns={[
                {
                  title: "Claim",
                  dataIndex: "claim_number",
                  render: (no, r) => (
                    <Link to={`/auditor/claims/${r.claim_id}`} style={{ fontWeight: 600 }}>
                      {no}
                    </Link>
                  ),
                },
                { title: "Employee", dataIndex: "owner_name" },
                {
                  title: "Payable",
                  dataIndex: "payable_paise",
                  align: "right",
                  render: (v) => (
                    <span className="num" style={{ fontWeight: 700 }}>
                      {formatINR(v)}
                    </span>
                  ),
                },
                { title: "Picked", dataIndex: "selected_at", render: (v) => formatDate(v) },
                {
                  title: "Result",
                  dataIndex: "status",
                  render: (s, r) => (
                    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <StatusChip tone={STATUS_TONE[s]}>{s[0] + s.slice(1).toLowerCase()}</StatusChip>
                      {r.outcome_note ? <span style={{ fontSize: 12, color: "#5B6475" }}>{r.outcome_note}</span> : null}
                    </span>
                  ),
                },
                {
                  title: "",
                  key: "actions",
                  render: (_, r) =>
                    r.status === "PENDING" ? (
                      <span style={{ display: "flex", gap: 8 }}>
                        <Button size="small" onClick={() => setResolving({ sample: r, result: "PASSED" })}>
                          Pass
                        </Button>
                        <Button size="small" danger onClick={() => setResolving({ sample: r, result: "FAILED" })}>
                          Fail
                        </Button>
                      </span>
                    ) : null,
                },
              ]}
            />
          )}
        </LoadingOrError>
      </div>

      <Modal
        open={!!resolving}
        title={resolving ? `${resolving.result === "PASSED" ? "Pass" : "Fail"} ${resolving.sample.claim_number}?` : ""}
        okText={resolving?.result === "PASSED" ? "Mark passed" : "Mark failed"}
        okButtonProps={{ danger: resolving?.result === "FAILED", disabled: resolving?.result === "FAILED" && !note.trim() }}
        confirmLoading={resolve.isPending}
        onOk={() => resolve.mutate()}
        onCancel={() => setResolving(null)}
      >
        <label htmlFor="sample-note" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
          Note {resolving?.result === "FAILED" ? "(required)" : "(optional)"}
        </label>
        <Input.TextArea id="sample-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </>
  );
}
