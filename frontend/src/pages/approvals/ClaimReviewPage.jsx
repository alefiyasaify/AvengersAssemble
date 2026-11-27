import {
  FilePdfOutlined,
  FileSearchOutlined,
  LeftOutlined,
  RightOutlined,
  RotateRightOutlined,
  SwapOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Empty, Input, Modal, Result } from "antd";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { approveStep, getInbox, rejectStep, sendBackStep } from "../../api/approvalsApi";
import { addComment, getClaim } from "../../api/claimsApi";
import { receiptFileUrl } from "../../api/httpClient";
import { CATEGORIES, CategoryIcon } from "../../components/common/CategoryIcon";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { KeyboardKey } from "../../components/common/KeyboardKey";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useAuth } from "../../context/AuthContext";
import { useDepartments } from "../../hooks/useLookups";
import { formatINR } from "../../utils/formatMoney";
import { LINE_STATUS, OUTCOME_TONE, ROLE_NAME, STEP_STATUS, claimStatus, daysSince, formatDate } from "../../utils/statusLabels";

const BACK = {
  manager: { to: "/manager/inbox", label: "Approval inbox" },
  head: { to: "/head/approvals", label: "High-value approvals" },
  auditor: { to: "/auditor/queue", label: "Review queue" },
};

// Approval levels as configured in the ARD chain (ADR-0009).
const LEVEL_NAME = { 1: "manager", 2: "auditor", 3: "finance head" };

const initials = (name = "") =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

/** Worst finding outcome on a line → dot colour on its receipt thumbnail. */
function lineDot(line) {
  if (line.status === "AUTO_REJECTED" || line.findings.some((f) => f.outcome === "REJECT")) return "#E5483A";
  if (line.findings.length) return "#E59A12";
  return null;
}

function ReceiptViewer({ lines, index, setIndex }) {
  const [zoom, setZoom] = useState(100);
  const [rotate, setRotate] = useState(0);
  const line = lines[index];
  const receipt = line?.receipt;
  const url = receipt ? receiptFileUrl(receipt.id) : null;
  const isImage = receipt?.mime?.startsWith("image/");

  return (
    <section className="panel-alt" aria-label="Receipt viewer" style={{ flex: "55 1 430px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            Receipt · line {index + 1} of {lines.length}
          </span>
          <span style={{ fontSize: 12, color: "#5B6475", overflow: "hidden", textOverflow: "ellipsis" }}>{receipt ? receipt.original_name : "No receipt attached"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <KeyboardKey>J</KeyboardKey>
          <Button icon={<LeftOutlined />} aria-label="Previous line" disabled={index === 0} onClick={() => setIndex(index - 1)} />
          <Button icon={<RightOutlined />} aria-label="Next line" disabled={index >= lines.length - 1} onClick={() => setIndex(index + 1)} />
          <KeyboardKey>K</KeyboardKey>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: 4 }} role="group" aria-label="Receipts">
        {lines.map((l, i) => (
          <button key={l.id} type="button" className={`thumb ${i === index ? "selected" : ""}`} aria-label={`Line ${i + 1}, ${l.vendor}`} aria-pressed={i === index} onClick={() => setIndex(i)}>
            {[100, 70, 100, 50].map((w, k) => (
              <span key={k} className="l" style={{ width: `${w}%`, opacity: l.receipt ? 1 : 0.35 }} />
            ))}
            {lineDot(l) ? <span className="dot" style={{ background: lineDot(l) }} /> : null}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 360, overflow: "hidden", background: "#fff", borderRadius: 16 }}>
        {!receipt ? (
          <Empty image={<FileSearchOutlined style={{ fontSize: 48, color: "#B9C0D2" }} />} description="This line has no receipt" />
        ) : isImage ? (
          <img
            src={url}
            alt={`Receipt for ${line.vendor}`}
            style={{ maxWidth: "100%", maxHeight: 520, transform: `rotate(${rotate}deg) scale(${zoom / 100})`, transition: "transform .2s" }}
          />
        ) : (
          <object data={url} type={receipt.mime} aria-label={`Receipt for ${line.vendor}`} style={{ width: "100%", height: 520, border: 0 }}>
            <a href={url} target="_blank" rel="noreferrer">
              <FilePdfOutlined /> Open {receipt.original_name}
            </a>
          </object>
        )}
      </div>

      {receipt && isImage ? (
        <div style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 4, padding: 6, borderRadius: 14, background: "#fff", boxShadow: "0 8px 20px rgba(16,24,40,.10)" }}>
          <Button type="text" icon={<ZoomOutOutlined />} aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(50, z - 10))} />
          <span className="num" style={{ fontSize: 13, fontWeight: 700, minWidth: 48, textAlign: "center" }} aria-live="polite">
            {zoom}%
          </span>
          <Button type="text" icon={<ZoomInOutlined />} aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(200, z + 10))} />
          <Button type="text" icon={<RotateRightOutlined />} aria-label="Rotate" onClick={() => setRotate((d) => (d + 90) % 360)} />
        </div>
      ) : null}
      {receipt ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ alignSelf: "center", fontWeight: 600 }}>
          Open the file in a new tab
        </a>
      ) : null}
    </section>
  );
}

function ApprovalChain({ claim }) {
  const steps = claim.steps.filter((s) => s.round === claim.round).sort((a, b) => a.level_no - b.level_no);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-label="Approval chain">
      <div className="section-title">
        <b>Approval chain</b>
        <span>Fixed at submit, by payable total{claim.round > 1 ? ` · round ${claim.round}` : ""}</span>
      </div>
      {steps.length === 0 ? (
        <p style={{ color: "#5B6475" }}>{claim.auto_approved ? "Approved automatically by policy." : "No approval steps yet."}</p>
      ) : (
        <ol style={{ display: "flex", alignItems: "flex-start", listStyle: "none", padding: 0, margin: 0 }}>
          {steps.map((s, i) => {
            const isCurrent = claim.current_step?.id === s.id;
            const st = isCurrent ? { label: "Current step", tone: "info" } : STEP_STATUS[s.status] ?? { label: s.status, tone: "neutral" };
            const person = s.acted_by_name ?? s.assigned_to_name ?? "Unassigned";
            return (
              <li key={s.id} style={{ display: "contents" }}>
                <div style={{ width: 140, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
                  <div
                    className={isCurrent ? "ring-now" : ""}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      fontWeight: 800,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      ...(s.status === "APPROVED"
                        ? { background: "#2563EB", color: "#fff" }
                        : isCurrent
                          ? { background: "#fff", border: "3px solid #2563EB", color: "#1D4ED8" }
                          : { background: "#ECEFF5", color: "#4A5366" }),
                    }}
                  >
                    {s.status === "APPROVED" ? "✓" : s.level_no}
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 13 }}>{ROLE_NAME[s.role]}</span>
                  <span style={{ fontSize: 12, color: "#5B6475", lineHeight: 1.4 }}>
                    {person}
                    {s.on_behalf_of_name ? ` for ${s.on_behalf_of_name}` : ""}
                  </span>
                  <StatusChip tone={st.tone}>{st.label}</StatusChip>
                </div>
                {i < steps.length - 1 ? <div aria-hidden="true" style={{ flex: 1, height: 3, marginTop: 21, background: "#DCE1EE", borderRadius: 2 }} /> : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ClaimReviewBody({ claim, inbox }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const departments = useDepartments();
  const back = BACK[role] ?? BACK.manager;
  const firstFlagged = claim.lines.findIndex((l) => l.findings.length);
  const [lineIndex, setLineIndex] = useState(Math.max(0, firstFlagged));
  const [comments, setComments] = useState(claim.comments);
  const [draftComment, setDraftComment] = useState("");
  const [decision, setDecision] = useState(null); // REJECT | SEND_BACK
  const [decisionComment, setDecisionComment] = useState("");

  const pos = inbox.findIndex((i) => i.id === claim.id);
  const inboxItem = pos >= 0 ? inbox[pos] : null;
  const nextItem = pos >= 0 ? inbox[pos + 1] : null;
  const prevItem = pos > 0 ? inbox[pos - 1] : null;
  const stepId = claim.current_step?.id;
  const can = (action) => claim.allowed_actions.includes(action);

  const decide = useMutation({
    mutationFn: ({ kind, comment }) => {
      if (kind === "APPROVE") return approveStep(stepId, claim.version);
      if (kind === "REJECT") return rejectStep(stepId, claim.version, comment);
      return sendBackStep(stepId, claim.version, comment);
    },
    onSuccess: (updated, { kind }) => {
      const verb = { APPROVE: "approved", REJECT: "rejected", SEND_BACK: "sent back" }[kind];
      message.success(`${claim.claim_no} ${verb} · now ${claimStatus(updated.status).label.toLowerCase()}`);
      setDecision(null);
      setDecisionComment("");
      queryClient.setQueryData(["claim", claim.id], updated);
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      navigate(nextItem ? `/${role}/claims/${nextItem.id}` : back.to);
    },
    onError: (err) => {
      message.error(err.code === "CLAIM_VERSION_CONFLICT" ? "Someone else changed this claim. Reloaded the latest version." : err.message);
      queryClient.invalidateQueries({ queryKey: ["claim", claim.id] });
    },
  });

  const post = useMutation({
    mutationFn: (body) => addComment(claim.id, body, claim.lines[lineIndex]?.id),
    onSuccess: (c) => {
      setComments((cs) => [...cs, c]);
      setDraftComment("");
    },
    onError: (err) => message.error(err.message),
  });

  // Keyboard shortcuts from the design: J/K lines, A approve, R reject, S send back, C comment.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.ctrlKey || e.metaKey || e.altKey || decision) return;
      const k = e.key.toLowerCase();
      if (k === "j") setLineIndex((i) => Math.max(0, i - 1));
      else if (k === "k") setLineIndex((i) => Math.min(claim.lines.length - 1, i + 1));
      else if (k === "a" && can("approve") && !decide.isPending) decide.mutate({ kind: "APPROVE" });
      else if (k === "r" && can("reject")) setDecision("REJECT");
      else if (k === "s" && can("send_back")) setDecision("SEND_BACK");
      else if (k === "c") {
        e.preventDefault();
        document.getElementById("comment-input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const status = claimStatus(claim.status);
  const flagged = claim.lines.filter((l) => l.findings.length).length;
  const payablePct = claim.total_paise ? (claim.payable_paise / claim.total_paise) * 100 : 100;
  const rejectedPaise = claim.total_paise - claim.payable_paise;
  const waiting = daysSince(claim.current_step?.since ?? claim.submitted_at);
  const nextLevel = claim.required_levels.find((n) => n > (claim.current_level ?? 0));

  return (
    <>
      <TopBar
        left={
          <>
            <Link to={back.to}>{back.label}</Link>
            <span aria-hidden="true">/</span>
            <span style={{ color: "#0E1424", fontWeight: 700 }}>{claim.claim_no}</span>
            {pos >= 0 ? (
              <>
                <span style={{ marginLeft: 10, fontSize: 13 }}>
                  {pos + 1} of {inbox.length} in your inbox
                </span>
                <Button size="small" icon={<LeftOutlined />} aria-label="Previous claim" disabled={!prevItem} onClick={() => navigate(`/${role}/claims/${prevItem.id}`)} />
                <Button size="small" icon={<RightOutlined />} aria-label="Next claim" disabled={!nextItem} onClick={() => navigate(`/${role}/claims/${nextItem.id}`)} />
              </>
            ) : null}
          </>
        }
      />

      <div className="ef-page" style={{ paddingTop: 12 }}>
        {inboxItem?.delegated_from_name ? (
          <div className="banner banner-info">
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <SwapOutlined />
              <span>
                <strong>Acting for {inboxItem.delegated_from_name}.</strong> This step was delegated to you.
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
                {claim.current_step ? <StatusChip tone="neutral">Waiting {waiting === 0 ? "since today" : `${waiting} day${waiting > 1 ? "s" : ""}`}</StatusChip> : null}
                {claim.has_high_severity ? <StatusChip tone="bad">High-severity flag</StatusChip> : null}
                {claim.sample_audit_pending ? <StatusChip tone="info">Sample audit pending</StatusChip> : null}
              </div>
              <h1 style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 700 }}>{claim.title}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#5B6475" }}>
                <InitialsAvatar text={initials(claim.owner_name)} size={30} />
                <span>
                  {claim.owner_name}
                  {departments.byId[claim.department_id] ? ` · ${departments.byId[claim.department_id]}` : ""}
                  {claim.submitted_at ? ` · submitted ${formatDate(claim.submitted_at)}` : ""}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 13, color: "#5B6475", fontWeight: 600 }}>Payable total</span>
              <span className="num" style={{ fontSize: 50, lineHeight: 1, fontWeight: 800, letterSpacing: "-0.03em" }}>
                {formatINR(claim.payable_paise)}
              </span>
              <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "#E8EBF3" }} aria-hidden="true">
                <span style={{ width: `${payablePct}%`, background: "#2563EB" }} />
                <span style={{ width: `${100 - payablePct}%`, background: "#E5483A" }} />
              </div>
              <span style={{ fontSize: 12, color: "#5B6475" }}>
                Claimed {formatINR(claim.total_paise)}
                {rejectedPaise > 0 ? ` · ${formatINR(rejectedPaise)} rejected by policy and left out` : ""}
              </span>
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
                const rejected = l.status === "AUTO_REJECTED" || l.status === "REJECTED";
                const st = LINE_STATUS[l.status];
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
                      background: sel ? "#EEF3FF" : rejected ? "#FFF6F5" : "transparent",
                      boxShadow: sel ? "0 0 0 2px #2563EB" : "none",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                      <CategoryIcon category={l.category} size={40} />
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{l.vendor}</span>
                        <span style={{ fontSize: 12, color: "#5B6475" }}>
                          {CATEGORIES[l.category]?.label ?? l.category} · {formatDate(l.expense_date)}
                          {l.category === "HOTEL" ? ` · ${l.nights} night${l.nights > 1 ? "s" : ""}` : ""}
                          {l.description ? ` · ${l.description}` : ""}
                        </span>
                      </span>
                      <span className="num" style={{ fontWeight: 800, fontSize: 15, textDecoration: rejected ? "line-through" : "none" }}>
                        {formatINR(l.amount_paise)}
                      </span>
                    </span>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 52 }}>
                      {l.findings.length ? (
                        l.findings.map((f) => (
                          <StatusChip key={f.rule_code} tone={OUTCOME_TONE[f.outcome]}>
                            {f.reason}
                          </StatusChip>
                        ))
                      ) : (
                        <StatusChip tone="ok">No policy findings</StatusChip>
                      )}
                      {st && rejected ? <StatusChip tone={st.tone}>{st.label}</StatusChip> : null}
                    </span>
                  </button>
                );
              })}
            </section>

            <ApprovalChain claim={claim} />

            <section style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-label="Comments">
              <b style={{ fontSize: 16, fontWeight: 800 }}>Comments</b>
              {comments.length === 0 ? <p style={{ color: "#5B6475", fontSize: 14 }}>No comments yet.</p> : null}
              {comments.map((c) => {
                const lineNo = c.line_id ? claim.lines.findIndex((l) => l.id === c.line_id) + 1 : 0;
                return (
                  <div key={c.id} style={{ display: "flex", gap: 12 }}>
                    <InitialsAvatar text={initials(c.author_name)} size={34} />
                    <div style={{ background: "#F3F5FB", borderRadius: "4px 16px 16px 16px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 12, color: "#5B6475" }}>
                        <strong style={{ color: "#0E1424" }}>{c.author_name}</strong>
                        {lineNo > 0 ? ` · line ${lineNo}` : ""} · {formatDate(c.created_at, true)}
                      </span>
                      <p style={{ fontSize: 14, lineHeight: 1.5 }}>{c.body}</p>
                    </div>
                  </div>
                );
              })}
              {can("comment") ? (
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
                  <Input
                    id="comment-input"
                    value={draftComment}
                    onChange={(e) => setDraftComment(e.target.value)}
                    placeholder={`Comment on line ${lineIndex + 1} or ask ${claim.owner_name.split(" ")[0]} a question`}
                  />
                  <Button htmlType="submit" loading={post.isPending}>
                    Post <KeyboardKey>C</KeyboardKey>
                  </Button>
                </form>
              ) : null}
            </section>

            {can("approve") || can("reject") || can("send_back") ? (
              <div className="action-bar">
                <span style={{ fontSize: 13, color: "#C9D0E2", maxWidth: 230, lineHeight: 1.45 }}>
                  Approving sends this to {nextLevel ? `the ${LEVEL_NAME[nextLevel] ?? "next level"}` : "payout"}, then opens your next claim. Reject and send back need a comment.
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {can("reject") ? (
                    <Button className="btn-reject" onClick={() => setDecision("REJECT")}>
                      Reject <KeyboardKey>R</KeyboardKey>
                    </Button>
                  ) : null}
                  {can("send_back") ? (
                    <Button onClick={() => setDecision("SEND_BACK")}>
                      Send back <KeyboardKey>S</KeyboardKey>
                    </Button>
                  ) : null}
                  {can("approve") ? (
                    <Button type="primary" loading={decide.isPending && !decision} onClick={() => decide.mutate({ kind: "APPROVE" })}>
                      Approve <KeyboardKey>A</KeyboardKey>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="banner banner-info">
                <span>You can’t act on this claim right now. Only the assigned approver (or their delegate) can act on the lowest pending step.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={!!decision}
        title={decision === "REJECT" ? `Reject ${claim.claim_no}?` : `Send ${claim.claim_no} back to ${claim.owner_name}?`}
        okText={decision === "REJECT" ? "Reject claim" : "Send back"}
        okButtonProps={{ danger: decision === "REJECT", disabled: !decisionComment.trim() }}
        confirmLoading={decide.isPending}
        onOk={() => decide.mutate({ kind: decision, comment: decisionComment.trim() })}
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

/** GET /claims/{id} plus the inbox (for previous/next and delegation info). */
export default function ClaimReviewPage() {
  const { id } = useParams();
  const { role } = useAuth();
  const claim = useQuery({ queryKey: ["claim", id], queryFn: () => getClaim(id) });
  const inbox = useQuery({ queryKey: ["inbox"], queryFn: getInbox, enabled: role !== "auditor" });
  const back = BACK[role] ?? BACK.manager;

  if (claim.isError && claim.error?.status === 404) {
    return <Result status="404" title="Claim not found" subTitle="It may not exist, or it is not yours to see." extra={<Link to={back.to}>Back to {back.label.toLowerCase()}</Link>} />;
  }
  return (
    <LoadingOrError query={claim} rows={14}>
      {(data) => <ClaimReviewBody key={`${data.id}-${data.version}`} claim={data} inbox={inbox.data?.items ?? []} />}
    </LoadingOrError>
  );
}
