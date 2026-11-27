import { InboxOutlined, InfoCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Empty, Input, Segmented, Switch, Table, Tabs } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listAllClaims } from "../../api/claimsApi";
import { getDashboardSummary } from "../../api/dashboardApi";
import { HorizontalBarList } from "../../components/charts/HorizontalBarList";
import { MonthlyStackedBars, monthsBetween } from "../../components/charts/MonthlyStackedBars";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { SectionTitle } from "../../components/common/SectionTitle";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useAuth } from "../../context/AuthContext";
import { useCategories, useDepartments } from "../../hooks/useLookups";
import { formatCompactINR, formatINR } from "../../utils/formatMoney";
import { OUTCOME_TONE, claimStatus, formatDate, isPending, ruleLabel, ruleTone } from "../../utils/statusLabels";

// Data:
// - GET /dashboard/summary (scope "team" for a manager): totals and charts for the period.
// - GET /claims?scope=team, all pages, all time: the team roster and per-person figures.
//   The API has no "my reports" endpoint, so the roster is everyone who has ever filed a claim.

const PERIODS = {
  MONTH: { word: "month", label: "Month", start: (d) => d.startOf("month") },
  QUARTER: { word: "quarter", label: "Quarter", start: (d) => d.month(Math.floor(d.month() / 3) * 3).startOf("month") },
  YEAR: { word: "year", label: "Year", start: (d) => d.startOf("year") },
};
const ymd = (d) => d.format("YYYY-MM-DD");
const COUNTS_TOWARD_SPEND = new Set(["APPROVED", "PAID"]);

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

function hoursText(h) {
  if (h === null || h === undefined) return "–";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

const inPeriod = (claim, from) => claim.submitted_at && !dayjs(claim.submitted_at).isBefore(dayjs(from).startOf("day"));

/** All team claims → one entry per person, with period and all-time figures. */
function buildRoster(claims, from, myId) {
  const people = new Map();
  for (const c of claims) {
    if (c.owner_id === myId) continue;
    const p =
      people.get(c.owner_id) ??
      { id: c.owner_id, name: c.owner_name, departmentId: c.department_id, all: [], period: [], periodSpend: 0, periodFlagged: 0, allSpend: 0, waiting: 0, waitingPaise: 0, lastClaimAt: null };
    p.all.push(c);
    if (COUNTS_TOWARD_SPEND.has(c.status)) p.allSpend += c.payable_paise;
    if (isPending(c.status)) {
      p.waiting += 1;
      p.waitingPaise += c.payable_paise;
    }
    if (c.submitted_at && (!p.lastClaimAt || c.submitted_at > p.lastClaimAt)) p.lastClaimAt = c.submitted_at;
    if (inPeriod(c, from)) {
      p.period.push(c);
      if (COUNTS_TOWARD_SPEND.has(c.status)) p.periodSpend += c.payable_paise;
      if (c.finding_codes.length) p.periodFlagged += 1;
    }
    people.set(c.owner_id, p);
  }
  return [...people.values()].map((p) => ({ ...p, all: p.all.sort((a, b) => (b.submitted_at ?? b.created_at).localeCompare(a.submitted_at ?? a.created_at)) }));
}

function StatTile({ value, label, hint }) {
  return (
    <div className="stat-tile">
      <span className="num" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, color: "#0E1424", fontWeight: 600 }}>{label}</span>
        {hint ? <span style={{ fontSize: 12, color: "#5B6475" }}>{hint}</span> : null}
      </span>
    </div>
  );
}

/** One person's claims (newest first); claims in the selected period are marked. */
function MemberClaims({ person, from }) {
  return (
    <Table
      rowKey="id"
      size="small"
      dataSource={person.all}
      pagination={person.all.length > 10 ? { pageSize: 10, showSizeChanger: false, size: "small" } : false}
      columns={[
        {
          title: "Claim",
          dataIndex: "claim_no",
          render: (no, c) => (
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Link to={`/manager/claims/${c.id}`}>{no}</Link>
              {inPeriod(c, from) ? <StatusChip tone="info">this period</StatusChip> : null}
            </span>
          ),
        },
        { title: "Title", dataIndex: "title" },
        { title: "Submitted", dataIndex: "submitted_at", render: (v) => (v ? formatDate(v) : "Not submitted") },
        { title: "Status", dataIndex: "status", render: (s) => <StatusChip tone={claimStatus(s).tone}>{claimStatus(s).label}</StatusChip> },
        {
          title: "Flags",
          dataIndex: "finding_codes",
          render: (codes) => (
            <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {codes.map((code) => (
                <StatusChip key={code} tone={ruleTone(code)}>
                  {ruleLabel(code)}
                </StatusChip>
              ))}
            </span>
          ),
        },
        { title: "Payable", dataIndex: "payable_paise", align: "right", render: (v) => <span className="num">{formatINR(v)}</span> },
      ]}
    />
  );
}

/** "Team members" tab: every member, searchable, with period and all-time figures. */
function TeamMembersTab({ roster, word, from, truncated, total }) {
  const departments = useDepartments();
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const rows = roster
    .filter((p) => !onlyActive || p.period.length)
    .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <Input prefix={<SearchOutlined />} placeholder="Search team members" aria-label="Search team members" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <label htmlFor="only-active" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <Switch id="only-active" checked={onlyActive} onChange={setOnlyActive} size="small" />
          Only people who claimed this {word}
        </label>
      </div>
      {truncated ? <Alert type="info" showIcon title={`Showing figures from the newest ${roster.reduce((s, p) => s + p.all.length, 0)} of ${total} team claims.`} /> : null}
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
        scroll={{ x: 980 }}
        locale={{ emptyText: <Empty description={q ? "No team member matches that search" : `No one on your team claimed this ${word}`} /> }}
        expandable={{ expandRowByClick: true, expandedRowRender: (p) => <MemberClaims person={p} from={from} /> }}
        columns={[
          {
            title: "Team member",
            dataIndex: "name",
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name, p) => (
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <InitialsAvatar text={initials(name)} />
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600 }}>{name}</span>
                  <span style={{ fontSize: 12, color: "#5B6475" }}>{departments.byId[p.departmentId] ?? ""}</span>
                </span>
              </span>
            ),
          },
          {
            title: `Claims this ${word}`,
            key: "periodCount",
            align: "right",
            sorter: (a, b) => a.period.length - b.period.length,
            render: (_, p) => p.period.length || <span style={{ color: "#9AA3B5" }}>0</span>,
          },
          {
            title: `Approved this ${word}`,
            dataIndex: "periodSpend",
            align: "right",
            defaultSortOrder: "descend",
            sorter: (a, b) => a.periodSpend - b.periodSpend,
            render: (v) => (
              <span className="num" style={{ fontWeight: 700 }}>
                {formatINR(v)}
              </span>
            ),
          },
          {
            title: "Waiting now",
            dataIndex: "waiting",
            align: "right",
            sorter: (a, b) => a.waiting - b.waiting,
            render: (n, p) => (n ? <StatusChip tone="info">{`${n} · ${formatCompactINR(p.waitingPaise)}`}</StatusChip> : <span style={{ color: "#9AA3B5" }}>–</span>),
          },
          {
            title: `Flagged this ${word}`,
            dataIndex: "periodFlagged",
            align: "right",
            sorter: (a, b) => a.periodFlagged - b.periodFlagged,
            render: (n, p) =>
              !p.period.length ? (
                <span style={{ color: "#9AA3B5" }}>–</span>
              ) : n ? (
                <StatusChip tone={n / p.period.length > 0.3 ? "bad" : "warn"}>{`${n} of ${p.period.length}`}</StatusChip>
              ) : (
                <StatusChip tone="ok">None</StatusChip>
              ),
          },
          {
            title: "All time",
            key: "allTime",
            align: "right",
            sorter: (a, b) => a.allSpend - b.allSpend,
            render: (_, p) => (
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <span className="num">{formatINR(p.allSpend)}</span>
                <span style={{ fontSize: 12, color: "#5B6475" }}>{p.all.length} claims</span>
              </span>
            ),
          },
          { title: "Last claim", dataIndex: "lastClaimAt", sorter: (a, b) => (a.lastClaimAt ?? "").localeCompare(b.lastClaimAt ?? ""), render: (v) => (v ? formatDate(v) : "–") },
        ]}
      />
      <p style={{ fontSize: 12, color: "#5B6475", display: "flex", gap: 6 }}>
        <InfoCircleOutlined style={{ marginTop: 2 }} />
        Everyone on your team (direct and indirect reports) who has filed a claim. Approved counts approved and paid claims. Click a person to see their claims.
      </p>
    </div>
  );
}

function OverviewTab({ summary, trend, word, waiting }) {
  const categories = useCategories();
  const categoryName = (code) => categories.byCode[code] ?? code;
  const at = summary.approval_time;
  const v = summary.violations;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
      {waiting.length ? (
        <div className="banner banner-info">
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <InboxOutlined />
            <span>
              <strong>
                {waiting.length} team claim{waiting.length > 1 ? "s are" : " is"} still in approval
              </strong>{" "}
              ({formatINR(waiting.reduce((s, c) => s + c.payable_paise, 0))}).
            </span>
          </span>
          <Link to="/manager/inbox" style={{ fontWeight: 700 }}>
            Open my inbox
          </Link>
        </div>
      ) : null}

      <div className="band" style={{ borderTop: 0, paddingTop: 0 }}>
        <div className="col" style={{ flex: "1.4 1 440px" }}>
          <SectionTitle title="Team spend by month" hint="last six months, stacked by category" />
          {trend ? <MonthlyStackedBars rows={trend.spend_by_month} months={monthsBetween(trend.date_from, trend.date_to)} categoryName={categoryName} format={formatCompactINR} height={240} /> : <Empty />}
        </div>
        <div className="col" style={{ flex: "1 1 320px" }}>
          <SectionTitle title="Spend by category" hint={`this ${word}`} />
          {summary.spend_by_category.length ? (
            <HorizontalBarList rows={[...summary.spend_by_category].sort((a, b) => b.amount_paise - a.amount_paise).map((c) => [categoryName(c.category), c.amount_paise])} format={formatCompactINR} />
          ) : (
            <Empty description="Nothing spent yet" />
          )}
        </div>
      </div>

      <div className="band">
        <div className="col" style={{ flex: "1 1 380px" }}>
          <SectionTitle title="Policy flags" hint={`${v.submitted_lines} lines this ${word}`} />
          {v.by_rule.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...v.by_rule]
                .sort((a, b) => b.count - a.count)
                .map((r) => (
                  <div key={r.rule_code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderRadius: 14, background: "#F3F5FB" }}>
                    <span style={{ fontWeight: 600 }}>{ruleLabel(r.rule_code)}</span>
                    <StatusChip tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>
                      {r.count} line{r.count === 1 ? "" : "s"}
                    </StatusChip>
                  </div>
                ))}
            </div>
          ) : (
            <Empty description="No policy flags on the team’s lines" />
          )}
        </div>
        <div className="col" style={{ flex: "1 1 380px" }}>
          <SectionTitle title="Approval time" hint="claims that went through approvers" />
          {at.chain_count ? (
            <HorizontalBarList
              rows={[
                ["Mean", (at.mean_hours ?? 0) / 24],
                ["Median", (at.median_hours ?? 0) / 24],
                ["p90", (at.p90_hours ?? 0) / 24],
              ]}
              unit="days"
            />
          ) : (
            <Empty description="No claims through approvers yet" />
          )}
          <p style={{ fontSize: 12, color: "#5B6475" }}>In days. Time spent in Sent back is not counted.</p>
        </div>
      </div>
    </div>
  );
}

/** /manager/team: spend of the manager's team, with a full team member list. */
export default function TeamSpendPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("MONTH");
  const [tab, setTab] = useState("overview");
  const today = dayjs();
  const range = { from: ymd(PERIODS[period].start(today)), to: ymd(today) };
  const word = PERIODS[period].word;

  const summary = useQuery({ queryKey: ["dashboard", "team", range], queryFn: () => getDashboardSummary(range) });
  const trendRange = { from: ymd(today.subtract(5, "month").startOf("month")), to: ymd(today) };
  const trend = useQuery({ queryKey: ["dashboard", "team", trendRange], queryFn: () => getDashboardSummary(trendRange) });
  // All team claims, all time (up to 10 pages of 100). Period figures are worked out from these.
  const teamClaims = useQuery({ queryKey: ["claims", "team", "all"], queryFn: () => listAllClaims({ scope: "team" }), staleTime: 60_000 });

  const roster = useMemo(() => (teamClaims.data ? buildRoster(teamClaims.data.items, range.from, user.id) : []), [teamClaims.data, range.from, user.id]);
  const periodClaims = roster.flatMap((p) => p.period);
  const activeMembers = roster.filter((p) => p.period.length).length;
  const waiting = roster.flatMap((p) => p.all.filter((c) => isPending(c.status)));

  return (
    <>
      <TopBar left={<span style={{ color: "#0E1424", fontWeight: 700 }}>Team spend</span>} />
      <div className="ef-page">
        <PageHeader
          title="Team spend"
          description="What your team has claimed, who claimed it, and where policy flagged lines."
          extra={<Segmented aria-label="Period" value={period} onChange={setPeriod} options={Object.entries(PERIODS).map(([value, p]) => ({ value, label: p.label }))} style={{ border: "1px solid #D5D9E3", padding: 2 }} />}
        />
        <LoadingOrError query={summary} rows={12}>
          {(data) => {
            const total = data.spend_by_category.reduce((s, c) => s + c.amount_paise, 0);
            const at = data.approval_time;
            const department = data.spend_by_department.map((d) => d.department_name).join(", ");
            return (
              <>
                <div className="claims-summary-row">
                  <section className="hero" style={{ borderRadius: 28, padding: 22, gap: 16, boxShadow: "0 18px 36px rgba(31,79,216,.35)" }} aria-label={`Team spend this ${word}`}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span className="label">Team spend this {word}</span>
                      <span className="big num">{formatINR(total)}</span>
                      <span style={{ fontSize: 13, color: "#DCE6FF" }}>
                        {department ? `${department} · ` : ""}
                        {dayjs(data.date_from).format("D MMM")} to {dayjs(data.date_to).format("D MMM YYYY")}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <span className="pill">{data.violations.submitted_lines} lines submitted</span>
                      <span className="pill">{(data.violations.violation_rate * 100).toFixed(1)}% of lines flagged</span>
                    </div>
                  </section>
                  <div className="claims-stats">
                    <StatTile value={teamClaims.isPending ? "…" : roster.length} label="Team members" hint={teamClaims.isPending ? "" : `${activeMembers} claimed this ${word}`} />
                    <StatTile value={teamClaims.isPending ? "…" : periodClaims.length} label="Claims submitted" hint={`this ${word}`} />
                    <StatTile value={hoursText(at.mean_hours)} label="Average approval time" hint={`${at.auto_approved_count} auto-approved`} />
                  </div>
                </div>

                <Tabs
                  activeKey={tab}
                  onChange={setTab}
                  items={[
                    { key: "overview", label: "Overview", children: <OverviewTab summary={data} trend={trend.data} word={word} waiting={waiting} /> },
                    {
                      key: "members",
                      label: `Team members${teamClaims.data ? ` · ${roster.length}` : ""}`,
                      children: (
                        <LoadingOrError query={teamClaims} rows={8}>
                          {(tc) => <TeamMembersTab roster={roster} word={word} from={range.from} truncated={tc.truncated} total={tc.total} />}
                        </LoadingOrError>
                      ),
                    },
                  ]}
                />
              </>
            );
          }}
        </LoadingOrError>
      </div>
    </>
  );
}
