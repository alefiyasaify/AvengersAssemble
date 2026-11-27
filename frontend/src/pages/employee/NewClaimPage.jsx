import {
  CameraOutlined,
  CheckOutlined,
  DeleteOutlined,
  LeftOutlined,
  PlusOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, DatePicker, Input, InputNumber, Modal, Select, Skeleton, Upload } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getActivePolicy, getNewClaimDraft, saveDraft, submitClaim } from "../../api/expenseApi";
import { CATEGORIES, CategoryIcon } from "../../components/common/CategoryIcon";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { TODAY } from "../../mockData/mockClaims";
import { formatINR, rupeesToPaise } from "../../utils/formatMoney";
import { evaluateClaim } from "../../utils/policyCheck";

const CHAIN_LABEL = { MANAGER: "Manager", AUDITOR: "Auditor", FINANCE_HEAD: "Finance head", AUTO_APPROVE: "Auto-approve" };

function routeExplanation(chain, payable, policy) {
  const { auto_approve_up_to_paise: auto, auditor_above_paise: aud, finance_head_above_paise: head } = policy.levels;
  if (chain[0] === "AUTO_APPROVE") return `Clean and ${formatINR(auto)} or less, so it is approved automatically.`;
  const parts = [];
  parts.push(payable > auto ? `Above ${formatINR(auto)} so no auto-approve` : "Has flags so no auto-approve");
  parts.push(payable > aud ? `above ${formatINR(aud)} so the auditor checks it` : `${formatINR(aud)} or below so no auditor`);
  if (payable > head) parts.push(`above ${formatINR(head)} so the finance head signs off`);
  return `${parts.join("; ")}.`;
}

function FindingBox({ finding }) {
  const kind = finding.tone === "bad" ? "bad" : finding.tone === "warn" ? "warn" : "ok";
  const dot = { bad: "#E5483A", warn: "#E59A12", ok: "#16A34A" }[kind];
  const title = {
    RECEIPT_MISSING: "This line will be rejected",
    OVER_LIMIT: "This line will be rejected",
    STALE: "This line will be rejected",
    WEEKEND: "Weekend spend",
    DUPLICATE: "Possible duplicate",
  }[finding.code];
  if (!title) return null;
  return (
    <div className={`finding finding-${kind}`} role={kind === "bad" ? "alert" : undefined}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`dot ${kind === "bad" ? "pulse-red" : ""}`} style={{ background: dot }} />
        <span style={{ fontWeight: 800, fontSize: 14 }}>{title}</span>
      </span>
      <p>
        {finding.detail}
        {kind === "bad" ? " It is left out of the payable total; the rest of the claim carries on." : ""}
      </p>
    </div>
  );
}

function LineCard({ index, line, result, onChange, onRemove }) {
  const meta = CATEGORIES[line.category];
  const okChip = result.findings.find((f) => f.code === "WITHIN_LIMIT");
  const id = (s) => `l${index}-${s}`;
  // Keep the file in the form; returning false stops antd uploading it (POST /receipts in live mode).
  const attachReceipt = (file) => {
    onChange({ receipt_id: `r-${Date.now()}`, receipt_name: file.name });
    return false;
  };

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
        <label htmlFor={id("cat")} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#5B6475" }}>
          Category
          <Select
            id={id("cat")}
            className="light-input"
            value={line.category}
            onChange={(category) => onChange({ category })}
            options={Object.entries(CATEGORIES).map(([value, m]) => ({ value, label: m.label }))}
          />
        </label>
        <label htmlFor={id("date")} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#5B6475" }}>
          Date
          <DatePicker
            id={id("date")}
            className="light-input"
            value={line.expense_date ? dayjs(line.expense_date) : null}
            onChange={(d) => onChange({ expense_date: d ? d.format("YYYY-MM-DD") : null })}
            format="D MMM YYYY"
            allowClear={false}
            disabledDate={(d) => d.isAfter(dayjs(TODAY))}
          />
        </label>
        <label htmlFor={id("amt")} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#5B6475" }}>
          Amount (₹)
          <Input
            id={id("amt")}
            className="light-input num"
            inputMode="decimal"
            value={line.amount_text ?? (line.amount_paise ? (line.amount_paise / 100).toLocaleString("en-IN") : "")}
            onChange={(e) => onChange({ amount_text: e.target.value, amount_paise: rupeesToPaise(e.target.value) ?? 0 })}
          />
        </label>
        <label htmlFor={id("ven")} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#5B6475" }}>
          Vendor
          <Input id={id("ven")} className="light-input" value={line.vendor} onChange={(e) => onChange({ vendor: e.target.value })} />
        </label>
        {line.category === "HOTEL" ? (
          <>
            <label htmlFor={id("tier")} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#5B6475" }}>
              City tier
              <Select
                id={id("tier")}
                className="light-input"
                value={line.city_tier ?? 2}
                onChange={(city_tier) => onChange({ city_tier })}
                options={[
                  { value: 1, label: "Tier 1" },
                  { value: 2, label: "Other" },
                ]}
              />
            </label>
            <label htmlFor={id("nights")} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#5B6475" }}>
              Nights
              <InputNumber id={id("nights")} className="light-input" min={1} max={60} value={line.nights ?? 1} onChange={(nights) => onChange({ nights: nights ?? 1 })} style={{ width: "100%" }} />
            </label>
          </>
        ) : null}
      </div>

      {line.receipt_id ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, background: "#F3F5FB", borderRadius: 16 }}>
          <div aria-hidden="true" style={{ width: 44, height: 56, flex: "none", borderRadius: 8, background: "#fff", display: "flex", flexDirection: "column", gap: 4, padding: "9px 7px" }}>
            {[100, 70, 100, 50].map((w, i) => (
              <div key={i} style={{ height: 3, background: "#B9C0D2", borderRadius: 2, width: `${w}%` }} />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{line.receipt_name}</span>
            <span>
              <StatusChip tone="info">Read from receipt</StatusChip>
            </span>
          </div>
          <Upload accept=".pdf,.jpg,.jpeg,.png" showUploadList={false} beforeUpload={attachReceipt}>
            <Button type="link" style={{ fontWeight: 700 }}>
              Replace
            </Button>
          </Upload>
        </div>
      ) : (
        <>
          <Upload.Dragger
            accept=".pdf,.jpg,.jpeg,.png"
            showUploadList={false}
            beforeUpload={(file) => {
              // POST /receipts (multipart) in live mode; max 5 MB, PDF/JPG/PNG.
              if (file.size > 5 * 1024 * 1024) return Upload.LIST_IGNORE;
              onChange({ receipt_id: `r-${Date.now()}`, receipt_name: file.name });
              return false;
            }}
            style={{ background: "#F3F5FB", borderRadius: 16, border: "2px dashed #A9C2F5" }}
          >
            <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontWeight: 700, padding: "18px 0" }}>
              <CameraOutlined style={{ fontSize: 22 }} /> Scan or drop a receipt
            </p>
          </Upload.Dragger>
          <div style={{ display: "flex", gap: 10 }}>
            <Upload accept="image/*" capture="environment" showUploadList={false} beforeUpload={attachReceipt}>
              <Button icon={<CameraOutlined />} style={{ flex: 1, height: 46 }}>
                Take photo
              </Button>
            </Upload>
            <Upload accept=".pdf,.jpg,.jpeg,.png" showUploadList={false} beforeUpload={attachReceipt}>
              <Button icon={<UploadOutlined />} style={{ flex: 1, height: 46 }}>
                Upload
              </Button>
            </Upload>
          </div>
        </>
      )}

      {okChip && result.outcome === "OK" ? (
        <span>
          <StatusChip tone="ok">{okChip.label} · {okChip.detail.replace("Inside the ", "").replace(".", "")}</StatusChip>
        </span>
      ) : null}
      {result.findings.map((f) => (
        <FindingBox key={f.code} finding={f} />
      ))}
    </section>
  );
}

let lineSeq = 100;

function NewClaimForm({ draft, policy }) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [title, setTitle] = useState(draft.title);
  const [lines, setLines] = useState(draft.lines);
  const [version, setVersion] = useState(draft.version);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [savedAt, setSavedAt] = useState("Saved");

  const preview = useMemo(() => evaluateClaim(lines, policy, { today: TODAY }), [lines, policy]);

  const save = useMutation({
    mutationFn: () => saveDraft(draft.id, { title, lines, version }),
    onSuccess: (res) => {
      setVersion(res.version);
      setSavedAt("Saved");
      message.success("Draft saved");
    },
  });
  const submit = useMutation({
    mutationFn: () => submitClaim(draft.id, version),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      message.success(`${res.claim_no} submitted. It is with your manager now.`);
      navigate("/employee/claims");
    },
    onError: (err) => message.error(err.message),
  });

  const update = (i, patch) => {
    setSavedAt("Unsaved");
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };
  const remove = (i) => {
    setSavedAt("Unsaved");
    setLines((ls) => ls.filter((_, j) => j !== i));
  };
  const add = () => {
    setSavedAt("Unsaved");
    setLines((ls) => [...ls, { key: `n${lineSeq++}`, category: "MEALS", vendor: "", amount_paise: 0, expense_date: TODAY, receipt_id: null, receipt_name: null }]);
  };

  const { counts } = preview;

  const savedChip = (
    <StatusChip tone={savedAt === "Saved" ? "ok" : "neutral"} icon={savedAt === "Saved" ? <CheckOutlined /> : null}>
      {savedAt}
    </StatusChip>
  );

  const payableHero = (
    <section className="hero" aria-live="polite" style={{ borderRadius: 28, padding: "20px 22px", boxShadow: "0 18px 36px rgba(31,79,216,.32)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="label">Payable so far</span>
            <span className="big num">{formatINR(preview.payable)}</span>
          </div>
          <span style={{ fontSize: 12, color: "#DCE6FF", textAlign: "right", lineHeight: 1.4 }}>
            of {formatINR(preview.claimed)} claimed
            <br />
            {counts.clear + counts.flagged} of {lines.length} lines count
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill">{counts.clear} clear</span>
          <span className="pill">{counts.flagged} flagged</span>
          {counts.rejected ? (
            <span className="pill" style={{ background: "#fff", color: "#A5271B", fontWeight: 800 }}>
              {counts.rejected} will be rejected
            </span>
          ) : null}
        </div>
      </section>
  );

  const claimForm = (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <label htmlFor="claim-title" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#5B6475" }}>
          Claim title
          <Input
            id="claim-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSavedAt("Unsaved");
            }}
            style={{ fontWeight: 600, fontSize: 15, border: 0, boxShadow: "0 1px 3px rgba(16,24,40,.06)" }}
          />
        </label>

        {preview.results.map((r, i) => (
          <LineCard key={r.line.key} index={i} line={r.line} result={r} onChange={(p) => update(i, p)} onRemove={() => remove(i)} />
        ))}

        <Button icon={<PlusOutlined />} onClick={add} block style={{ height: 50, border: "2px dashed #A9C2F5", background: "transparent", color: "#1D4ED8", fontWeight: 700 }}>
          Add line item
        </Button>
      </div>
  );

  const submitActions = (
      <>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: "#5B6475" }}>
          <span>Will route to</span>
          {preview.chain.map((c) => (
            <StatusChip key={c} tone={c === "AUTO_APPROVE" ? "ok" : "info"}>
              {CHAIN_LABEL[c]}
            </StatusChip>
          ))}
          <span>{routeExplanation(preview.chain, preview.payable, policy)}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button size="large" style={{ flex: 1, height: 50 }} loading={save.isPending} onClick={() => save.mutate()}>
            Save draft
          </Button>
          <Button type="primary" size="large" style={{ flex: 1.5, height: 50 }} disabled={!lines.length || !title.trim()} onClick={() => setReviewOpen(true)}>
            Review and submit
          </Button>
        </div>
        <p style={{ fontSize: 12, color: "#5B6475", textAlign: "center" }}>You’ll see what gets rejected before anything is sent.</p>
      </>
  );

  const reviewModal = (
      <Modal
        open={reviewOpen}
        title="Review before you submit"
        okText="Submit claim"
        onOk={() => submit.mutate()}
        confirmLoading={submit.isPending}
        onCancel={() => setReviewOpen(false)}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {preview.results.map((r, i) => (
            <div key={r.line.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <span>
                {i + 1}. {CATEGORIES[r.line.category].label} · {r.line.vendor || "No vendor"}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="num" style={{ fontWeight: 700 }}>
                  {formatINR(r.line.amount_paise)}
                </span>
                <StatusChip tone={r.outcome === "REJECT" ? "bad" : r.outcome === "FLAG" ? "warn" : "ok"}>
                  {r.outcome === "REJECT" ? "Rejected" : r.outcome === "FLAG" ? "Flagged" : "Clear"}
                </StatusChip>
              </span>
            </div>
          ))}
          <div className="kv" style={{ borderTop: "1px solid #EEF0F5", fontWeight: 700 }}>
            <span>Payable</span>
            <span className="num">{formatINR(preview.payable)}</span>
          </div>
        </div>
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
              <span style={{ color: "#0E1424", fontWeight: 700 }}>New claim</span>
            </>
          }
        />
        <div className="ef-page">
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <h1 className="ef-display" style={{ fontSize: 36, fontWeight: 700 }}>
              New claim
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
        <h1 style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>New claim</h1>
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

export default function NewClaimPage() {
  const draft = useQuery({ queryKey: ["claims", "draft"], queryFn: getNewClaimDraft });
  const policy = useQuery({ queryKey: ["policy", "active"], queryFn: getActivePolicy });
  if (draft.isPending || policy.isPending) return <Skeleton active style={{ padding: 20 }} paragraph={{ rows: 12 }} />;
  if (draft.isError || policy.isError) return <p style={{ padding: 20 }}>Could not load the draft. Try again.</p>;
  return <NewClaimForm draft={draft.data} policy={policy.data} />;
}
