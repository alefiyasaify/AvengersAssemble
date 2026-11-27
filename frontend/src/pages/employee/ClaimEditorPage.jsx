import { CameraOutlined, CheckOutlined, DeleteOutlined, LeftOutlined, LoadingOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, DatePicker, Input, InputNumber, Modal, Result, Select, Skeleton, Upload } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import * as claimsApi from "../../api/claimsApi";
import { getActivePolicy } from "../../api/policyApi";
import { CATEGORIES, CategoryIcon } from "../../components/common/CategoryIcon";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useCities } from "../../hooks/useLookups";
import { formatINR, rupeesToPaise } from "../../utils/formatMoney";
import { evaluateClaim } from "../../utils/policyCheck";
import { LINE_STATUS, OUTCOME_TONE, ROLE_NAME, STEP_STATUS, claimStatus, formatDate } from "../../utils/statusLabels";

const TODAY = dayjs().format("YYYY-MM-DD");
const LEVEL_NAME = { 1: "Manager", 2: "Auditor", 3: "Finance head" };
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

let lineSeq = 0;
const newKey = () => `new-${(lineSeq += 1)}`;

/** LineRead (server) → editable line in the form. */
function fromServer(line) {
  return {
    key: line.id,
    id: line.id,
    category: line.category,
    vendor: line.vendor,
    description: line.description,
    amount_paise: line.amount_paise,
    expense_date: line.expense_date,
    nights: line.nights,
    city_id: line.city_id,
    receipt_id: line.receipt?.id ?? null,
    receipt_name: line.receipt?.original_name ?? null,
    status: line.status,
    serverFindings: line.findings,
  };
}

/** Editable line → LineCreate / LineAdd body. */
function toPayload(line) {
  return {
    category: line.category,
    vendor: line.vendor.trim(),
    description: (line.description || line.vendor).trim(),
    amount_paise: line.amount_paise ?? 0,
    expense_date: line.expense_date,
    nights: line.category === "HOTEL" ? Math.max(1, line.nights ?? 1) : 1,
    city_id: line.category === "HOTEL" ? line.city_id ?? null : null,
    receipt_id: line.receipt_id ?? null,
  };
}

/** Only the fields that changed, for PATCH /claims/{id}/lines/{lineId}. */
function changedFields(serverLine, line) {
  const next = toPayload(line);
  const before = toPayload(fromServer(serverLine));
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== before[k]));
}

function lineProblems(line) {
  const problems = [];
  if (!line.vendor?.trim()) problems.push("vendor");
  if (!line.amount_paise) problems.push("amount");
  if (!line.expense_date) problems.push("date");
  if (line.category === "HOTEL" && !line.city_id) problems.push("city");
  return problems;
}

function FindingBox({ finding }) {
  if (finding.tone === "ok") return null;
  const kind = finding.outcome === "REJECT" ? "bad" : "warn";
  const dot = kind === "bad" ? "#E5483A" : "#E59A12";
  return (
    <div className={`finding finding-${kind}`} role={kind === "bad" ? "alert" : undefined}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`dot ${kind === "bad" ? "pulse-red" : ""}`} style={{ background: dot }} />
        <span style={{ fontWeight: 800, fontSize: 14 }}>{kind === "bad" ? "This line will be rejected" : finding.label}</span>
      </span>
      <p>
        {finding.detail}
        {kind === "bad" ? " It is left out of the payable total; the rest of the claim carries on." : ""}
      </p>
    </div>
  );
}

function LineCard({ index, line, result, cities, editable, uploading, onChange, onRemove, onReceipt }) {
  const meta = CATEGORIES[line.category] ?? CATEGORIES.OTHER;
  const okChip = result?.findings.find((f) => f.tone === "ok");
  const id = (s) => `l${index}-${s}`;
  const labelStyle = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#5B6475" };
  const pick = (file) => {
    onReceipt(file);
    return false; // we upload ourselves (POST /receipts), antd must not
  };

  // Read-only line: show what the server decided.
  if (!editable) {
    const st = LINE_STATUS[line.status] ?? { label: line.status, tone: "neutral" };
    return (
      <section className="line-card" aria-label={`Line ${index + 1}, ${meta.label}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CategoryIcon category={line.category} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{line.vendor}</span>
            <span style={{ fontSize: 12, color: "#5B6475" }}>
              {meta.label} · {formatDate(line.expense_date)}
              {line.receipt_name ? ` · ${line.receipt_name}` : " · no receipt"}
            </span>
          </div>
          <span className="num" style={{ fontWeight: 800, fontSize: 16 }}>
            {formatINR(line.amount_paise)}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <StatusChip tone={st.tone}>{st.label}</StatusChip>
          {(line.serverFindings ?? []).map((f) => (
            <StatusChip key={f.rule_code} tone={OUTCOME_TONE[f.outcome]}>
              {f.reason}
            </StatusChip>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="line-card" aria-label={`Line ${index + 1}, ${meta.label}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <CategoryIcon category={line.category} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>{meta.label}</span>
          <span style={{ fontSize: 12, color: "#5B6475" }}>
            Line {index + 1}
            {line.expense_date ? ` · ${dayjs(line.expense_date).format("ddd, D MMM")}` : ""}
          </span>
        </div>
        <Button type="text" icon={<DeleteOutlined />} aria-label={`Remove line ${index + 1}`} onClick={onRemove} style={{ width: 44, height: 44 }} />
      </div>

      <div className="line-fields">
        <label htmlFor={id("cat")} style={labelStyle}>
          Category
          <Select
            id={id("cat")}
            className="light-input"
            value={line.category}
            onChange={(category) => onChange({ category })}
            options={Object.entries(CATEGORIES).map(([value, m]) => ({ value, label: m.label }))}
          />
        </label>
        <label htmlFor={id("date")} style={labelStyle}>
          Date
          <DatePicker
            id={id("date")}
            className="light-input"
            value={line.expense_date ? dayjs(line.expense_date) : null}
            onChange={(d) => onChange({ expense_date: d ? d.format("YYYY-MM-DD") : null })}
            format="D MMM YYYY"
            allowClear={false}
            disabledDate={(d) => d.isAfter(dayjs(), "day")}
          />
        </label>
        <label htmlFor={id("amt")} style={labelStyle}>
          Amount (₹)
          <Input
            id={id("amt")}
            className="light-input num"
            inputMode="decimal"
            value={line.amount_text ?? (line.amount_paise ? (line.amount_paise / 100).toLocaleString("en-IN") : "")}
            onChange={(e) => onChange({ amount_text: e.target.value, amount_paise: rupeesToPaise(e.target.value) ?? 0 })}
          />
        </label>
        <label htmlFor={id("ven")} style={labelStyle}>
          Vendor
          <Input id={id("ven")} className="light-input" value={line.vendor} onChange={(e) => onChange({ vendor: e.target.value })} />
        </label>
        {line.category === "HOTEL" ? (
          <>
            <label htmlFor={id("city")} style={labelStyle}>
              City
              <Select
                id={id("city")}
                className="light-input"
                showSearch
                optionFilterProp="label"
                placeholder="Pick the city"
                value={line.city_id ?? undefined}
                onChange={(city_id) => onChange({ city_id })}
                options={cities.map((c) => ({ value: c.id, label: `${c.name} · tier ${c.tier}` }))}
              />
            </label>
            <label htmlFor={id("nights")} style={labelStyle}>
              Nights
              <InputNumber id={id("nights")} className="light-input" min={1} max={60} value={line.nights ?? 1} onChange={(nights) => onChange({ nights: nights ?? 1 })} style={{ width: "100%" }} />
            </label>
          </>
        ) : null}
      </div>
      <label htmlFor={id("desc")} style={labelStyle}>
        What was it for?
        <Input id={id("desc")} className="light-input" placeholder="e.g. Client lunch with Acme" value={line.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} />
      </label>

      {line.receipt_id ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, background: "#F3F5FB", borderRadius: 16 }}>
          <div aria-hidden="true" style={{ width: 44, height: 56, flex: "none", borderRadius: 8, background: "#fff", display: "flex", flexDirection: "column", gap: 4, padding: "9px 7px" }}>
            {[100, 70, 100, 50].map((w, i) => (
              <div key={i} style={{ height: 3, background: "#B9C0D2", borderRadius: 2, width: `${w}%` }} />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{line.receipt_name ?? "Receipt"}</span>
            <span>
              <StatusChip tone="ok">Receipt uploaded</StatusChip>
            </span>
          </div>
          <Upload accept=".pdf,.jpg,.jpeg,.png" showUploadList={false} beforeUpload={pick} disabled={uploading}>
            <Button type="link" style={{ fontWeight: 700 }} loading={uploading}>
              Replace
            </Button>
          </Upload>
        </div>
      ) : (
        <>
          <Upload.Dragger accept=".pdf,.jpg,.jpeg,.png" showUploadList={false} beforeUpload={pick} disabled={uploading} style={{ background: "#F3F5FB", borderRadius: 16, border: "2px dashed #A9C2F5" }}>
            <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontWeight: 700, padding: "18px 0" }}>
              {uploading ? <LoadingOutlined /> : <CameraOutlined style={{ fontSize: 22 }} />} {uploading ? "Uploading receipt…" : "Drop a receipt (PDF, JPG or PNG, max 5 MB)"}
            </p>
          </Upload.Dragger>
          <div style={{ display: "flex", gap: 10 }}>
            <Upload accept="image/*" capture="environment" showUploadList={false} beforeUpload={pick} disabled={uploading}>
              <Button icon={<CameraOutlined />} style={{ flex: 1, height: 46 }}>
                Take photo
              </Button>
            </Upload>
            <Upload accept=".pdf,.jpg,.jpeg,.png" showUploadList={false} beforeUpload={pick} disabled={uploading}>
              <Button icon={<UploadOutlined />} style={{ flex: 1, height: 46 }}>
                Upload
              </Button>
            </Upload>
          </div>
        </>
      )}

      {okChip && result.outcome === "OK" ? (
        <span>
          <StatusChip tone="ok">
            {okChip.label} · {okChip.detail}
          </StatusChip>
        </span>
      ) : null}
      {(result?.findings ?? []).map((f) => (
        <FindingBox key={f.code} finding={f} />
      ))}
    </section>
  );
}

/** Server steps of the current round, for the read-only view. */
function ApprovalSteps({ claim }) {
  const steps = claim.steps.filter((s) => s.round === claim.round).sort((a, b) => a.level_no - b.level_no);
  if (!steps.length) return null;
  return (
    <section className="line-card" aria-label="Approval steps" style={{ gap: 10 }}>
      <b style={{ fontSize: 15 }}>Approval chain</b>
      {steps.map((s) => {
        const st = STEP_STATUS[s.status] ?? { label: s.status, tone: "neutral" };
        return (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span>
              <strong>{ROLE_NAME[s.role]}</strong>
              <span style={{ color: "#5B6475" }}>
                {" "}
                · {s.acted_by_name ?? s.assigned_to_name ?? "Unassigned"}
                {s.on_behalf_of_name ? ` (for ${s.on_behalf_of_name})` : ""}
              </span>
              {s.comment ? <div style={{ fontSize: 13, color: "#3F4859" }}>“{s.comment}”</div> : null}
            </span>
            <StatusChip tone={st.tone}>{st.label}</StatusChip>
          </div>
        );
      })}
    </section>
  );
}

function ClaimEditor({ initialClaim, rules, cities, cityTier }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  const { message } = App.useApp();

  const [claim, setClaim] = useState(initialClaim);
  const [title, setTitle] = useState(initialClaim?.title ?? "");
  const [lines, setLines] = useState(() =>
    initialClaim
      ? initialClaim.lines.map(fromServer)
      : [{ key: newKey(), category: "MEALS", vendor: "", description: "", amount_paise: 0, expense_date: TODAY, receipt_id: null, receipt_name: null, nights: 1, city_id: null }],
  );
  const [dirty, setDirty] = useState(!initialClaim);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState(null);
  const [review, setReview] = useState(null); // PolicyPreview from the server
  const [submitting, setSubmitting] = useState(false);

  const editable = !claim || claim.allowed_actions.includes("edit");
  const canWithdraw = claim?.allowed_actions.includes("withdraw");
  const isResubmit = claim?.status === "SENT_BACK";

  const preview = useMemo(() => evaluateClaim(lines, { rules, today: TODAY, cityTier }), [lines, rules, cityTier]);

  const update = (i, patch) => {
    setDirty(true);
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };
  const remove = (i) => {
    setDirty(true);
    setLines((ls) => ls.filter((_, j) => j !== i));
  };
  const add = () => {
    setDirty(true);
    setLines((ls) => [...ls, { key: newKey(), category: "MEALS", vendor: "", description: "", amount_paise: 0, expense_date: TODAY, receipt_id: null, receipt_name: null, nights: 1, city_id: null }]);
  };

  // POST /receipts as soon as a file is picked; the line keeps the returned receipt id.
  const uploadReceipt = async (index, file) => {
    if (file.size > MAX_RECEIPT_BYTES) {
      message.error("Receipts must be 5 MB or smaller.");
      return;
    }
    const key = lines[index].key;
    setUploadingKey(key);
    try {
      const receipt = await claimsApi.uploadReceipt(file);
      update(index, { receipt_id: receipt.id, receipt_name: receipt.original_name });
    } catch (err) {
      message.error(err.message);
    } finally {
      setUploadingKey(null);
    }
  };

  /** Push the form to the backend: create the claim, or apply title/line changes one by one. */
  const save = async () => {
    if (!title.trim()) throw new Error("Give the claim a title.");
    const incomplete = lines.findIndex((l) => lineProblems(l).length);
    if (incomplete >= 0) throw new Error(`Line ${incomplete + 1} is missing: ${lineProblems(lines[incomplete]).join(", ")}.`);

    let detail;
    if (!claim) {
      detail = await claimsApi.createClaim(title.trim(), lines.map(toPayload));
    } else {
      detail = claim;
      if (title.trim() !== detail.title) detail = await claimsApi.renameClaim(detail.id, title.trim(), detail.version);
      const keptIds = new Set(lines.filter((l) => l.id).map((l) => l.id));
      for (const serverLine of claim.lines) {
        if (!keptIds.has(serverLine.id)) detail = await claimsApi.deleteLine(detail.id, serverLine.id, detail.version);
      }
      for (const line of lines) {
        if (!line.id) {
          detail = await claimsApi.addLine(detail.id, toPayload(line), detail.version);
        } else {
          const serverLine = claim.lines.find((s) => s.id === line.id);
          const changes = serverLine ? changedFields(serverLine, line) : {};
          if (Object.keys(changes).length) detail = await claimsApi.updateLine(detail.id, line.id, changes, detail.version);
        }
      }
    }
    setClaim(detail);
    setTitle(detail.title);
    setLines(detail.lines.map(fromServer));
    setDirty(false);
    queryClient.setQueryData(["claim", detail.id], detail);
    queryClient.invalidateQueries({ queryKey: ["claims"] });
    return detail;
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const detail = await save();
      message.success("Draft saved");
      if (!initialClaim) navigate(`/employee/claims/${detail.id}`, { replace: true });
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Save, then ask the server what the policy engine will decide, before submitting.
  const onReview = async () => {
    setSaving(true);
    try {
      const detail = dirty || !claim ? await save() : claim;
      const result = await claimsApi.previewPolicy(detail.id);
      setReview(result);
    } catch (err) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const detail = isResubmit ? await claimsApi.resubmitClaim(claim.id, claim.version) : await claimsApi.submitClaim(claim.id, claim.version);
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      queryClient.setQueryData(["claim", detail.id], detail);
      message.success(`${detail.claim_no} submitted · ${claimStatus(detail.status).label}`);
      navigate("/employee/claims");
    } catch (err) {
      message.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const onWithdraw = () =>
    Modal.confirm({
      title: `Withdraw ${claim.claim_no}?`,
      content: "It goes back to you as withdrawn. This is only possible before the first approval.",
      okText: "Withdraw",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const detail = await claimsApi.withdrawClaim(claim.id, claim.version);
          setClaim(detail);
          queryClient.invalidateQueries({ queryKey: ["claims"] });
          message.success("Claim withdrawn");
        } catch (err) {
          message.error(err.message);
        }
      },
    });

  const { counts } = preview;
  const status = claim ? claimStatus(claim.status) : null;
  const heading = claim ? claim.title || claim.claim_no : "New claim";

  const savedChip = editable ? (
    <StatusChip tone={dirty ? "neutral" : "ok"} icon={dirty ? null : <CheckOutlined />}>
      {dirty ? "Unsaved changes" : "Saved"}
    </StatusChip>
  ) : (
    <StatusChip tone={status.tone}>{status.label}</StatusChip>
  );

  const payableHero = (
    <section className="hero" aria-live="polite" style={{ borderRadius: 28, padding: "20px 22px", boxShadow: "0 18px 36px rgba(31,79,216,.32)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="label">{editable ? "Payable so far" : "Payable"}</span>
          <span className="big num">{formatINR(editable ? preview.payable : claim.payable_paise)}</span>
        </div>
        <span style={{ fontSize: 12, color: "#DCE6FF", textAlign: "right", lineHeight: 1.4 }}>
          of {formatINR(editable ? preview.claimed : claim.total_paise)} claimed
          <br />
          {editable ? `${counts.clear + counts.flagged} of ${lines.length} lines count` : claim.claim_no}
        </span>
      </div>
      {editable ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill">{counts.clear} clear</span>
          <span className="pill">{counts.flagged} flagged</span>
          {counts.rejected ? (
            <span className="pill" style={{ background: "#fff", color: "#A5271B", fontWeight: 800 }}>
              {counts.rejected} will be rejected
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  const claimForm = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      {isResubmit ? <Alert type="warning" showIcon title="This claim was sent back to you" description="Make the changes your approver asked for, then resubmit. The approval chain starts again." /> : null}
      {claim?.rejection_reasons?.length ? <Alert type="error" showIcon title="Rejected" description={claim.rejection_reasons.join(" ")} /> : null}
      {editable ? (
        <label htmlFor="claim-title" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#5B6475" }}>
          Claim title
          <Input
            id="claim-title"
            value={title}
            placeholder="e.g. Client visit – Bengaluru, 19–21 Nov"
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            style={{ fontWeight: 600, fontSize: 15, border: 0, boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}
          />
        </label>
      ) : null}

      {lines.map((line, i) => (
        <LineCard
          key={line.key}
          index={i}
          line={line}
          result={preview.results[i]}
          cities={cities}
          editable={editable}
          uploading={uploadingKey === line.key}
          onChange={(p) => update(i, p)}
          onRemove={() => remove(i)}
          onReceipt={(file) => uploadReceipt(i, file)}
        />
      ))}

      {editable ? (
        <Button icon={<PlusOutlined />} onClick={add} block style={{ height: 50, border: "2px dashed #A9C2F5", background: "transparent", color: "#1D4ED8", fontWeight: 700 }}>
          Add line item
        </Button>
      ) : null}

      {claim && !editable ? <ApprovalSteps claim={claim} /> : null}
      {claim?.comments?.length ? (
        <section className="line-card" aria-label="Comments" style={{ gap: 10 }}>
          <b style={{ fontSize: 15 }}>Comments</b>
          {claim.comments.map((c) => (
            <div key={c.id}>
              <span style={{ fontSize: 12, color: "#5B6475" }}>
                <strong style={{ color: "#0E1424" }}>{c.author_name}</strong> · {formatDate(c.created_at, true)}
              </span>
              <p style={{ fontSize: 14 }}>{c.body}</p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );

  const submitActions = editable ? (
    <>
      <p style={{ fontSize: 13, color: "#5B6475" }}>
        The live check uses the active policy as you type. The approval route is decided by the server when you review.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <Button size="large" style={{ flex: 1, height: 50 }} loading={saving && !review} onClick={onSave} disabled={!dirty && !!claim}>
          Save draft
        </Button>
        <Button type="primary" size="large" style={{ flex: 1.5, height: 50 }} disabled={!lines.length || !title.trim()} loading={saving} onClick={onReview}>
          {isResubmit ? "Review and resubmit" : "Review and submit"}
        </Button>
      </div>
      <p style={{ fontSize: 12, color: "#5B6475", textAlign: "center" }}>You’ll see what gets rejected before anything is sent.</p>
    </>
  ) : (
    <>
      <p style={{ fontSize: 13, color: "#5B6475" }}>
        {claim.status === "DRAFT" ? "This draft can’t be edited." : `Submitted ${formatDate(claim.submitted_at)}. It can no longer be edited.`}
      </p>
      {canWithdraw ? (
        <Button danger block onClick={onWithdraw}>
          Withdraw claim
        </Button>
      ) : null}
    </>
  );

  const reviewModal = (
    <Modal
      open={!!review}
      title={isResubmit ? "Review before you resubmit" : "Review before you submit"}
      okText={isResubmit ? "Resubmit claim" : "Submit claim"}
      onOk={onSubmit}
      confirmLoading={submitting}
      onCancel={() => setReview(null)}
    >
      {review ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {review.lines.map((pl, i) => {
            const line = claim?.lines.find((l) => l.id === pl.line_id);
            const st = LINE_STATUS[pl.status] ?? { label: pl.status, tone: "neutral" };
            return (
              <div key={pl.line_id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <span>
                    {i + 1}. {CATEGORIES[line?.category]?.label ?? "Line"} · {line?.vendor}
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="num" style={{ fontWeight: 700 }}>
                      {formatINR(line?.amount_paise)}
                    </span>
                    <StatusChip tone={st.tone}>{st.label}</StatusChip>
                  </span>
                </div>
                {pl.findings.map((f) => (
                  <span key={f.rule_code} style={{ fontSize: 12, color: f.outcome === "REJECT" ? "#A5271B" : "#7A4200" }}>
                    {f.reason}
                  </span>
                ))}
              </div>
            );
          })}
          <div className="kv" style={{ borderTop: "1px solid #EEF0F5", fontWeight: 700 }}>
            <span>Payable</span>
            <span className="num">
              {formatINR(review.payable_paise)} of {formatINR(review.total_paise)}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#5B6475", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {review.outcome === "AUTO_APPROVED" ? (
              <StatusChip tone="ok">Approved automatically</StatusChip>
            ) : review.outcome === "REJECTED" ? (
              <StatusChip tone="bad">Every line is rejected</StatusChip>
            ) : (
              <>
                <span>Will route to</span>
                {review.required_levels.map((n) => (
                  <StatusChip key={n} tone="info">
                    {LEVEL_NAME[n] ?? `Level ${n}`}
                  </StatusChip>
                ))}
              </>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );

  if (isDesktop) {
    return (
      <>
        <TopBar
          left={
            <>
              <Link to="/employee/claims">My claims</Link>
              <span aria-hidden="true">/</span>
              <span style={{ color: "#0E1424", fontWeight: 700 }}>{claim ? claim.claim_no : "New claim"}</span>
            </>
          }
        />
        <div className="ef-page">
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h1 className="ef-display" style={{ fontSize: 36, fontWeight: 700 }}>
              {heading}
            </h1>
            {savedChip}
          </div>
          <div className="new-claim-grid">
            {claimForm}
            <aside className="new-claim-summary" aria-label="Claim summary">
              {payableHero}
              <div className="panel-alt" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 18 }}>
                {submitActions}
              </div>
            </aside>
          </div>
        </div>
        {reviewModal}
      </>
    );
  }

  // Phone layout (the "Employee · New claim, live policy check" artboard).
  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px 12px" }}>
        <Button className="round-btn" icon={<LeftOutlined />} aria-label="Back to my claims" onClick={() => navigate("/employee/claims")} />
        <h1 style={{ flex: 1, fontSize: 22, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{heading}</h1>
        {savedChip}
      </header>
      <div style={{ margin: "4px 20px 0" }}>{payableHero}</div>
      <div style={{ padding: "18px 20px 0" }}>{claimForm}</div>
      <footer style={{ marginTop: 14, background: "#fff", borderRadius: "28px 28px 0 0", boxShadow: "0 -12px 30px rgba(16,24,40,.10)", padding: "18px 20px 22px", display: "flex", flexDirection: "column", gap: 12, position: "sticky", bottom: 0 }}>
        {submitActions}
      </footer>
      {reviewModal}
    </>
  );
}

/** /employee/claims/new (blank) and /employee/claims/:id (edit a draft, or view a submitted claim). */
export default function ClaimEditorPage() {
  const { id } = useParams();
  const claimQuery = useQuery({ queryKey: ["claim", id], queryFn: () => claimsApi.getClaim(id), enabled: !!id });
  const policyQuery = useQuery({ queryKey: ["policy", "active"], queryFn: getActivePolicy, staleTime: 5 * 60_000 });
  const cities = useCities();
  const cityTier = useMemo(() => (cityId) => cities.byId[cityId]?.tier, [cities.byId]);

  if ((id && claimQuery.isPending) || policyQuery.isPending) return <Skeleton active style={{ padding: 24 }} paragraph={{ rows: 12 }} />;
  if (id && claimQuery.isError) {
    return (
      <Result
        status={claimQuery.error?.status === 404 ? "404" : "error"}
        title={claimQuery.error?.status === 404 ? "Claim not found" : "Could not load this claim"}
        subTitle={claimQuery.error?.message}
        extra={<Link to="/employee/claims">Back to my claims</Link>}
      />
    );
  }
  // Without the active policy the live check is skipped; the server still checks everything.
  const rules = policyQuery.data?.rules ?? [];
  return <ClaimEditor key={id ?? "new"} initialClaim={id ? claimQuery.data : null} rules={rules} cities={cities.list} cityTier={cityTier} />;
}
