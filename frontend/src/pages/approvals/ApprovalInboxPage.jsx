import { SwapOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Table } from "antd";
import { useNavigate } from "react-router-dom";

import { getInbox } from "../../api/expenseApi";
import { TopBar } from "../../components/layout/TopBar";
import { StatusChip } from "../../components/common/StatusChip";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { PageHeader } from "../../components/common/PageHeader";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { useRole } from "../../context/RoleContext";
import { formatINR } from "../../utils/formatMoney";

const FLAG_CHIP = {
  DUPLICATE: ["bad", "Duplicate"],
  OVER_LIMIT: ["bad", "Line rejected"],
  WEEKEND: ["warn", "Weekend"],
  SPLIT_SUSPECT: ["bad", "Split suspect"],
};

/** GET /approvals/inbox. Finance head sees the high-value slice (payable above ₹1,00,000). */
export default function ApprovalInboxPage({ highValueOnly = false }) {
  const navigate = useNavigate();
  const { role } = useRole();
  const query = useQuery({ queryKey: ["inbox"], queryFn: getInbox });
  const base = role === "head" ? "/head/claims" : "/manager/claims";

  return (
    <>
      <TopBar left={<span style={{ color: "#0E1424", fontWeight: 700 }}>{highValueOnly ? "High-value approvals" : "Approval inbox"}</span>} />
      <div className="ef-page">
        <PageHeader
          title={highValueOnly ? "High-value approvals" : "Approval inbox"}
          description={
            highValueOnly
              ? "Claims with a payable total above ₹1,00,000 that reached the finance head step."
              : "Claims waiting on your step, including those delegated to you. Only the lowest pending step can be acted on."
          }
        />
        {!highValueOnly ? (
          <div className="banner banner-info">
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <SwapOutlined />
              <span>
                <strong>Acting for Ravi Menon</strong> until 30 Nov. His team’s claims are in your inbox while he is on leave.
              </span>
            </span>
            <a href="#delegation" onClick={(e) => {
              e.preventDefault();
              navigate("/manager/delegation");
            }} style={{ fontWeight: 700 }}>
              Manage delegation
            </a>
          </div>
        ) : null}
        <LoadingOrError query={query}>
          {(data) => {
            const items = highValueOnly ? data.items.filter((i) => i.payable_paise > 10000000) : data.items;
            return (
              <Table
                rowKey="step_id"
                dataSource={items}
                pagination={false}
                scroll={{ x: 820 }}
                locale={{ emptyText: highValueOnly ? "No high-value claims are waiting for you." : "Inbox zero. Nothing is waiting on you." }}
                onRow={(r) => ({
                  onClick: () => navigate(`${base}/${r.claim_id}`),
                  onKeyDown: (e) => e.key === "Enter" && navigate(`${base}/${r.claim_id}`),
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
                          {r.delegated_from ? ` · for ${r.delegated_from}` : ""}
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
                        <span style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600 }}>{o}</span>
                          <span style={{ fontSize: 12, color: "#5B6475" }}>{r.department}</span>
                        </span>
                      </span>
                    ),
                  },
                  { title: "Payable", dataIndex: "payable_paise", align: "right", render: (v) => <span className="num" style={{ fontWeight: 700 }}>{formatINR(v)}</span> },
                  {
                    title: "Flags",
                    dataIndex: "flags",
                    render: (flags) => (
                      <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {flags.length ? flags.map((f) => <StatusChip key={f} tone={FLAG_CHIP[f]?.[0]}>{FLAG_CHIP[f]?.[1] ?? f}</StatusChip>) : <StatusChip tone="ok">Clean</StatusChip>}
                      </span>
                    ),
                  },
                  {
                    title: "Waiting",
                    dataIndex: "waiting_days",
                    render: (d) => <StatusChip tone={d >= 5 ? "bad" : d >= 3 ? "warn" : "neutral"}>{d === 0 ? "Today" : `${d} day${d > 1 ? "s" : ""}`}</StatusChip>,
                  },
                ]}
              />
            );
          }}
        </LoadingOrError>
      </div>
    </>
  );
}
