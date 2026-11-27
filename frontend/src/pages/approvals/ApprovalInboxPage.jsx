import { SwapOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Table } from "antd";
import { Link, useNavigate } from "react-router-dom";

import { getInbox } from "../../api/approvalsApi";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useAuth } from "../../context/AuthContext";
import { useDepartments } from "../../hooks/useLookups";
import { formatINR } from "../../utils/formatMoney";
import { daysSince, ruleLabel, ruleTone } from "../../utils/statusLabels";

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

/** GET /approvals/inbox: steps assigned to me or delegated to me. */
export default function ApprovalInboxPage({ highValueOnly = false }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const departments = useDepartments();
  const query = useQuery({ queryKey: ["inbox"], queryFn: getInbox });
  const title = highValueOnly ? "High-value approvals" : "Approval inbox";
  const open = (item) => navigate(`/${role}/claims/${item.id}`);

  return (
    <>
      <TopBar left={<span style={{ color: "#0E1424", fontWeight: 700 }}>{title}</span>} />
      <div className="ef-page">
        <PageHeader
          title={title}
          description={
            highValueOnly
              ? "Claims that reached the finance head step. Only the lowest pending step can be acted on."
              : "Claims waiting on your step, including those delegated to you. Only the lowest pending step can be acted on."
          }
        />
        <LoadingOrError query={query}>
          {(data) => {
            const delegators = [...new Set(data.items.map((i) => i.delegated_from_name).filter(Boolean))];
            return (
              <>
                {delegators.length && role === "manager" ? (
                  <div className="banner banner-info">
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <SwapOutlined />
                      <span>
                        <strong>Acting for {delegators.join(", ")}.</strong> Their claims are in your inbox while they are away.
                      </span>
                    </span>
                    <Link to="/manager/delegation" style={{ fontWeight: 700 }}>
                      Manage delegation
                    </Link>
                  </div>
                ) : null}
                <Table
                  rowKey="step_id"
                  dataSource={data.items}
                  pagination={false}
                  scroll={{ x: 820 }}
                  locale={{ emptyText: "Inbox zero. Nothing is waiting on you." }}
                  onRow={(item) => ({
                    onClick: () => open(item),
                    onKeyDown: (e) => e.key === "Enter" && open(item),
                    tabIndex: 0,
                    style: { cursor: "pointer" },
                  })}
                  columns={[
                    {
                      title: "Claim",
                      dataIndex: "title",
                      render: (t, r) => (
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontWeight: 600 }}>{t}</span>
                          <span style={{ fontSize: 12, color: "#5B6475" }}>
                            {r.claim_no}
                            {r.delegated_from_name ? ` · for ${r.delegated_from_name}` : ""}
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
                          <span style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontWeight: 600 }}>{o}</span>
                            <span style={{ fontSize: 12, color: "#5B6475" }}>{departments.byId[r.department_id] ?? ""}</span>
                          </span>
                        </span>
                      ),
                    },
                    {
                      title: "Payable",
                      dataIndex: "payable_paise",
                      align: "right",
                      sorter: (a, b) => a.payable_paise - b.payable_paise,
                      render: (v) => (
                        <span className="num" style={{ fontWeight: 700 }}>
                          {formatINR(v)}
                        </span>
                      ),
                    },
                    {
                      title: "Flags",
                      dataIndex: "finding_codes",
                      render: (codes, r) => (
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                        return <StatusChip tone={d >= 5 ? "bad" : d >= 3 ? "warn" : "neutral"}>{d === 0 ? "Today" : `${d} day${d > 1 ? "s" : ""}`}</StatusChip>;
                      },
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
