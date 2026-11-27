import {
  BulbOutlined,
  LeftOutlined,
  RightOutlined,
  RotateRightOutlined,
  SearchOutlined,
  SwapOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Input, Modal, Result } from "antd";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { addComment, decideStep, getClaim, getInbox } from "../../api/expenseApi";
import { TopBar } from "../../components/layout/TopBar";
import { CategoryIcon } from "../../components/common/CategoryIcon";
import { StatusChip } from "../../components/common/StatusChip";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { KeyboardKey } from "../../components/common/KeyboardKey";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { useRole } from "../../context/RoleContext";
import { formatINR } from "../../utils/formatMoney";
import { claimStatus } from "../../utils/statusLabels";

const RISK = { LOW: ["ok", "Low risk", "#16A34A"], MEDIUM: ["warn", "Medium risk", "#E59A12"], HIGH: ["bad", "High risk", "#E5483A"] };
const DOT = { WARN: "#E59A12", BAD: "#E5483A" };

function ReceiptViewer({ lines, index, setIndex }) {
  const [zoom, setZoom] = useState(100);
  const [rotate, setRotate] = useState(0);
  const line = lines[index];
  const r = line.receipt ?? {};

  return (
    <section className="panel-alt" aria-label="Receipt viewer" style={{ flex: "55 1 430px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            Receipt · line {index + 1} of {lines.length}
          </span>
          <span style={{ fontSize: 12, color: "#5B6475" }}>
            {r.file_name} · {r.hash_unique ? "file hash unique" : "file hash seen before"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <KeyboardKey>J</KeyboardKey>
          <Button icon={<LeftOutlined />} aria-label="Previous line" disabled={index === 0} onClick={() => setIndex(index - 1)} />
          <Button icon={<RightOutlined />} aria-label="Next line" disabled={index === lines.length - 1} onClick={() => setIndex(index + 1)} />
          <KeyboardKey>K</KeyboardKey>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: 4 }} role="group" aria-label="Receipts">
        {lines.map((l, i) => (
          <button key={l.id} type="button" className={`thumb ${i === index ? "selected" : ""}`} aria-label={`Line ${i + 1}, ${l.vendor}`} aria-pressed={i === index} onClick={() => setIndex(i)}>
            {[100, 70, 100, 50].map((w, k) => (
              <span key={k} className="l" style={{ width: `${w}%` }} />
            ))}
            {DOT[l.receipt?.status] ? <span className="dot" style={{ background: DOT[l.receipt.status] }} /> : null}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 6px", overflow: "hidden" }}>
        <div className="receipt-paper" style={{ transform: `rotate(${rotate - 1}deg) scale(${zoom / 100})` }}>
          <div className="hl" style={{ marginBottom: 6 }}>
            <i />
            <b>Vendor</b>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 15, letterSpacing: ".08em" }}>{r.merchant ?? line.vendor.toUpperCase()}</div>
          </div>
          <div style={{ textAlign: "center", marginBottom: 12 }}>{r.address ?? "Tax invoice"}</div>
          <div className={`hl ${line.findings.some((f) => f.tone === "warn") ? "warn" : ""}`}>
            <i />
            <b>{line.findings.some((f) => f.label.includes("Weekend")) ? "Sat · weekend" : "Date"}</b>
            <div className="row">
              <span>{r.date_text ?? line.date_label}</span>
              <span>{r.time_text ?? ""}</span>
            </div>
          </div>
          <hr />
          {(r.items ?? [[line.vendor, (line.amount_paise / 100).toFixed(2)]]).map(([k, v]) => (
            <div key={k} className="row">
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <hr />
          <div className="hl">
            <i />
            <b>Amount</b>
            <div className="row" style={{ fontWeight: 700, fontSize: 14 }}>
              <span>TOTAL</span>
              <span>{r.total_text ?? (line.amount_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 16 }}>Thank you, visit again</div>
        </div>
      </div>

      <div style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 4, padding: 6, borderRadius: 14, background: "#fff", boxShadow: "0 8px 20px rgba(16,24,40,.10)" }}>
        <Button type="text" icon={<ZoomOutOutlined />} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(60, z - 10))} />
        <span className="num" style={{ fontSize: 13, fontWeight: 700, minWidth: 48, textAlign: "center" }} aria-live="polite">
          {zoom}%
        </span>
        <Button type="text" icon={<ZoomInOutlined />} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(160, z + 10))} />
        <Button type="text" icon={<RotateRightOutlined />} aria-label="Rotate" onClick={() => setRotate((d) => (d + 90) % 360)} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {r.status === "BAD" && !r.hash_unique ? (
          <StatusChip tone="bad">Receipt file seen on another claim</StatusChip>
        ) : (
          <>
            <StatusChip tone="ok">Vendor matches</StatusChip>
            <StatusChip tone="ok">Amount {formatINR(line.amount_paise)} matches</StatusChip>
            <StatusChip tone="ok">Date matches</StatusChip>
          </>
        )}
      </div>
    </section>
  );
}

function ApprovalChain({ steps }) {
  const tone = { CURRENT: ["info", "Your turn"], WAITING: ["neutral", "Waiting"], SKIPPED: ["neutral", "Skipped"], DONE: ["ok", "Approved"] };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-label="Approval chain">
      <div className="section-title">
        <b>Approval chain</b>
        <span>Fixed at submit, by payable total</span>
      </div>
      <ol style={{ display: "flex", alignItems: "flex-start", listStyle: "none", padding: 0, margin: 0 }}>
        {steps.map((s, i) => (
          <li key={s.level} style={{ display: "contents" }}>
            <div style={{ width: 130, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
              <div
                className={s.state === "CURRENT" ? "ring-now" : ""}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  fontWeight: 800,
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...(s.state === "CURRENT"
                    ? { background: "#2563EB", color: "#fff" }
                    : s.state === "WAITING"
                      ? { background: "#fff", border: "3px solid #2563EB", color: "#1D4ED8" }
                      : { background: "#ECEFF5", color: "#4A5366" }),
                }}
              >
                {s.initials}
              </div>
              <span style={{ fontWeight: 800, fontSize: 13 }}>{s.role}</span>
              <span style={{ fontSize: 12, color: "#5B6475", lineHeight: 1.4 }}>{s.note}</span>
              <StatusChip tone={tone[s.state][0]}>{tone[s.state][1]}</StatusChip>
            </div>
            {i < steps.length - 1 ? <div aria-hidden="true" style={{ flex: 1, height: 3, marginTop: 21, background: "#DCE1EE", borderRadius: 2 }} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ClaimReviewBody({ claim, inbox }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useRole();
  const base = role === "head" ? "/head" : "/manager";
  const [lineIndex, setLineIndex] = useState(() => Math.max(0, claim.lines.findIndex((l) => l.receipt?.status === "WARN")));
  const [comments, setComments] = useState(claim.comments);
  const [draftComment, setDraftComment] = useState("");
  const [decision, setDecision] = useState(null); // REJECT | SEND_BACK
  const [decisionComment, setDecisionComment] = useState("");

  const pos = inbox.findIndex((i) => i.claim_id === claim.id);
  const nextItem = pos >= 0 ? inbox[pos + 1] : null;
  const prevItem = pos > 0 ? inbox[pos - 1] : null;

  const decide = useMutation({
    mutationFn: ({ kind, comment }) => decideStep(kind, claim.current_step_id, { comment, expectedVersion: claim.version }),
    onSuccess: (_, { kind }) => {
      const verb = { APPROVE: "approved", REJECT: "rejected", SEND_BACK: "sent back" }[kind];
      message.success(`${claim.claim_no} ${verb}.`);
      setDecision(null);
      setDecisionComment("");
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      navigate(nextItem ? `${base}/claims/${nextItem.claim_id}` : `${base === "/head" ? "/head/approvals" : "/manager/inbox"}`);
    },
    onError: (err) => message.error(err.message),
  });

  const post = useMutation({
    mutationFn: (body) => addComment(claim.id, body),
    onSuccess: (c) => {
      setComments((cs) => [...cs, c]);
      setDraftComment("");
    },
  });

  // Keyboard shortcuts from the design: J/K lines, A approve, R reject, S send back, C comment.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey || decision) return;
      const k = e.key.toLowerCase();
      if (k === "j") setLineIndex((i) => Math.max(0, i - 1));
      else if (k === "k") setLineIndex((i) => Math.min(claim.lines.length - 1, i + 1));
      else if (k === "a") decide.mutate({ kind: "APPROVE" });
      else if (k === "r") setDecision("REJECT");
      else if (k === "s") setDecision("SEND_BACK");
      else if (k === "c") {
        e.preventDefault();
        document.getElementById("comment-input")?.focus();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [claim.lines.length, decide, decision]);

  const status = claimStatus(claim.status);
  const risk = RISK[claim.risk.band];
  const flagged = claim.lines.filter((l) => l.findings.some((f) => f.tone === "warn" || f.tone === "bad")).length;
  const payablePct = (claim.payable_total_paise / claim.claimed_total_paise) * 100;
  const needsAuditor = claim.steps.some((s) => s.role === "Auditor" && s.state === "WAITING");

  return (
    <>
      <TopBar
        left={
          <>
            <Link to={base === "/head" ? "/head/approvals" : "/manager/inbox"}>{base === "/head" ? "High-value approvals" : "Approval inbox"}</Link>
            <span aria-hidden="true">/</span>
            <span style={{ color: "#0E1424", fontWeight: 700 }}>{claim.claim_no}</span>
            {pos >= 0 ? (
              <>
                <span style={{ marginLeft: 10, fontSize: 13 }}>
                  {pos + 1} of {inbox.length} in your inbox
                </span>
                <Button size="small" icon={<LeftOutlined />} aria-label="Previous claim" disabled={!prevItem} onClick={() => navigate(`${base}/claims/${prevItem.claim_id}`)} />
                <Button size="small" icon={<RightOutlined />} aria-label="Next claim" disabled={!nextItem} onClick={() => navigate(`${base}/claims/${nextItem.claim_id}`)} />
              </>
            ) : null}
          </>
        }
        right={<Input prefix={<SearchOutlined />} suffix={<KeyboardKey>Ctrl K</KeyboardKey>} placeholder="Search" aria-label="Search claims" style={{ width: 200, background: "#F2F4FA", border: 0 }} />}
      />

      <div className="ef-page" style={{ paddingTop: 12 }}>
        {claim.delegation ? (
          <div className="banner banner-info">
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <SwapOutlined />
              <span>
                <strong>Acting for {claim.delegation.acting_for}</strong> until {claim.delegation.until_label}. His team’s claims are in your inbox while he is on leave.
              </span>
            </span>
            <Link to="/manager/delegation" style={{ fontWeight: 700 }}>
              Manage delegation
            </Link>
          </div>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "flex-start" }}>
          <ReceiptViewer lines={claim.lines} index={lineIndex} setIndex={setLineIndex} />

          <div style={{ flex: "45 1 440px", minWidth: 0, display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <StatusChip tone={status.tone}>{status.label}</StatusChip>
                <StatusChip tone="neutral">Waiting {claim.waiting_days} days</StatusChip>
              </div>
              <h1 style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 700 }}>{claim.title}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#5B6475" }}>
                <InitialsAvatar text={claim.owner.initials} size={30} />
                <span>
                  {claim.owner.name} · {claim.owner.department} · submitted {claim.submitted_label}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 13, color: "#5B6475", fontWeight: 600 }}>Payable total</span>
                <span className="num" style={{ fontSize: 50, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.03em" }}>
                  {formatINR(claim.payable_total_paise)}
                </span>
                <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "#E8EBF3" }} aria-hidden="true">
                  <span style={{ width: `${payablePct}%`, background: "#2563EB" }} />
                  <span style={{ width: `${100 - payablePct}%`, background: "#E5483A" }} />
                </div>
                <span style={{ fontSize: 12, color: "#5B6475" }}>
                  Claimed {formatINR(claim.claimed_total_paise)}
                  {claim.rejected_total_paise ? ` · ${formatINR(claim.rejected_total_paise)} rejected by policy and left out` : ""}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div role="img" aria-label={`Risk score ${claim.risk.score} of 100`} style={{ position: "relative", width: 104, height: 104 }}>
                  <div style={{ width: 104, height: 104, borderRadius: "50%", background: `conic-gradient(${risk[2]} 0 ${claim.risk.score}%, #E8EBF3 ${claim.risk.score}% 100%)` }} />
                  <div style={{ position: "absolute", left: 12, top: 12, width: 80, height: 80, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span className="num" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
                      {claim.risk.score}
                    </span>
                    <span style={{ fontSize: 10, color: "#5B6475", fontWeight: 600 }}>of 100</span>
                  </div>
                </div>
                <StatusChip tone={risk[0]}>{risk[1]}</StatusChip>
              </div>
            </div>

            <div style={{ background: "#F1F5FF", borderRadius: 18, padding: "16px 18px", display: "flex", gap: 12 }}>
              <BulbOutlined style={{ color: "#2563EB", fontSize: 20, marginTop: 2 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>Summary by Claude</span>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: "#2B3040" }}>{claim.ai_summary}</p>
              </div>
            </div>

            <section style={{ display: "flex", flexDirection: "column", gap: 6 }} aria-label="Line items">
              <div className="section-title" style={{ paddingBottom: 8 }}>
                <b>Line items</b>
                <span>
                  {flagged} of {claim.lines.length} lines flagged
                </span>
              </div>
              {claim.lines.map((l, i) => {
                const sel = i === lineIndex;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLineIndex(i)}
                    aria-pressed={sel}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: 12,
                      borderRadius: 16,
                      border: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      font: "inherit",
                      color: "inherit",
                      background: sel ? "#EEF3FF" : l.rejected ? "#FFF6F5" : "transparent",
                      boxShadow: sel ? "0 0 0 2px #2563EB" : "none",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                      <CategoryIcon category={l.category} size={40} />
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{l.vendor}</span>
                        <span style={{ fontSize: 12, color: "#5B6475" }}>{l.date_label}</span>
                      </span>
                      <span className="num" style={{ fontWeight: 800, fontSize: 15, textDecoration: l.rejected ? "line-through" : "none" }}>
                        {formatINR(l.amount_paise)}
                      </span>
                    </span>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 52 }}>
                      {l.findings.map((f) => (
                        <StatusChip key={f.label} tone={f.tone}>
                          {f.label}
                        </StatusChip>
                      ))}
                    </span>
                  </button>
                );
              })}
            </section>

            <ApprovalChain steps={claim.steps} />

            <section style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-label="Comments">
              <b style={{ fontSize: 16, fontWeight: 800 }}>Comments</b>
              {comments.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 12 }}>
                  <InitialsAvatar text={c.initials} size={34} />
                  <div style={{ background: "#F3F5FB", borderRadius: "4px 16px 16px 16px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 12, color: "#5B6475" }}>
                      <strong style={{ color: "#0E1424" }}>{c.author}</strong> · {c.context}
                    </span>
                    <p style={{ fontSize: 14, lineHeight: 1.5 }}>{c.body}</p>
                  </div>
                </div>
              ))}
              <form
                style={{ display: "flex", gap: 10 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draftComment.trim()) post.mutate(draftComment.trim());
                }}
              >
                <label htmlFor="comment-input" className="sr-only">
                  Add a comment
                </label>
                <Input id="comment-input" value={draftComment} onChange={(e) => setDraftComment(e.target.value)} placeholder={`Add a comment or ask ${claim.owner.name.split(" ")[0]} a question`} />
                <Button htmlType="submit" loading={post.isPending}>
                  Post <KeyboardKey>C</KeyboardKey>
                </Button>
              </form>
            </section>

            {claim.allowed_actions.includes("APPROVE") ? (
              <div className="action-bar">
                <span style={{ fontSize: 13, color: "#C9D0E2", maxWidth: 230, lineHeight: 1.45 }}>
                  Approving sends this to {needsAuditor ? "the auditor" : "payout"}, then opens your next claim. Reject and send back need a comment.
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Button className="btn-reject" onClick={() => setDecision("REJECT")}>
                    Reject <KeyboardKey>R</KeyboardKey>
                  </Button>
                  <Button onClick={() => setDecision("SEND_BACK")}>
                    Send back <KeyboardKey>S</KeyboardKey>
                  </Button>
                  <Button onClick={() => navigate("/manager/delegation")}>Delegate</Button>
                  <Button type="primary" loading={decide.isPending && !decision} onClick={() => decide.mutate({ kind: "APPROVE" })}>
                    Approve <KeyboardKey>A</KeyboardKey>
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Modal
        open={!!decision}
        title={decision === "REJECT" ? `Reject ${claim.claim_no}?` : `Send ${claim.claim_no} back to ${claim.owner.name}?`}
        okText={decision === "REJECT" ? "Reject claim" : "Send back"}
        okButtonProps={{ danger: decision === "REJECT", disabled: !decisionComment.trim() }}
        confirmLoading={decide.isPending}
        onOk={() => decide.mutate({ kind: decision, comment: decisionComment })}
        onCancel={() => setDecision(null)}
      >
        <p style={{ color: "#5B6475", marginBottom: 12 }}>
          {decision === "REJECT"
            ? "The whole claim is rejected and the employee is told why. This is written to the audit trail."
            : "The employee can fix the claim and resubmit; the approval chain restarts."}
        </p>
        <label htmlFor="decision-comment" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
          Comment (required)
        </label>
        <Input.TextArea id="decision-comment" rows={4} value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} />
      </Modal>
    </>
  );
}

export default function ClaimReviewPage() {
  const { id } = useParams();
  const claim = useQuery({ queryKey: ["claim", id], queryFn: () => getClaim(id) });
  const inbox = useQuery({ queryKey: ["inbox"], queryFn: getInbox });

  if (claim.isError && claim.error?.status === 404) {
    return <Result status="404" title="Claim not found" subTitle="It may not exist, or it is not yours to see." extra={<Link to="/manager/inbox">Back to inbox</Link>} />;
  }
  return (
    <LoadingOrError query={claim} rows={14}>
      {(data) => <ClaimReviewBody key={data.id} claim={data} inbox={inbox.data?.items ?? []} />}
    </LoadingOrError>
  );
}
