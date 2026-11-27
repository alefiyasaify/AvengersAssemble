import { PlusOutlined, SwapOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, DatePicker, Empty, Form, Popconfirm, Select, Spin, Table } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";

import { createDelegation, listDelegations, revokeDelegation } from "../../api/approvalsApi";
import { searchUsers } from "../../api/lookupsApi";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useAuth } from "../../context/AuthContext";
import { ROLE_NAME, formatDate } from "../../utils/statusLabels";

// Approval levels of the ARD chain (ADR-0009) and who may hold or cover them.
const LEVEL_ROLE = { 1: "MANAGER", 2: "AUDITOR", 3: "FINANCE_HEAD" };
const RANK = { EMPLOYEE: 0, MANAGER: 1, AUDITOR: 2, FINANCE_HEAD: 3 };

/** Mirrors the backend's delegate_may_cover: same or higher role; the head level may go to an auditor. */
function mayCover(delegateRole, levelNo) {
  const levelRole = LEVEL_ROLE[levelNo];
  if (levelRole === "FINANCE_HEAD") return delegateRole === "FINANCE_HEAD" || delegateRole === "AUDITOR";
  return RANK[delegateRole] >= RANK[levelRole];
}

function delegationState(d) {
  if (d.revoked_at) return { label: "Revoked", tone: "neutral" };
  const now = dayjs();
  if (dayjs(d.ends_at).isBefore(now)) return { label: "Ended", tone: "neutral" };
  if (dayjs(d.starts_at).isAfter(now)) return { label: "Upcoming", tone: "info" };
  return { label: "Active now", tone: "ok" };
}

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

/** Search colleagues (GET /users?q=) and keep only those allowed to cover the chosen level. */
function DelegatePicker({ value, onChange, levelNo, myId }) {
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["users", q], queryFn: () => searchUsers(q || undefined), staleTime: 60_000 });
  const options = (query.data?.items ?? [])
    .filter((u) => u.id !== myId && mayCover(u.role, levelNo))
    .map((u) => ({ value: u.id, label: `${u.full_name} · ${ROLE_NAME[u.role] ?? u.role} · ${u.employee_code}` }));
  return (
    <Select
      showSearch
      value={value}
      onChange={onChange}
      onSearch={setQ}
      filterOption={false}
      placeholder="Search by name or employee code"
      notFoundContent={query.isFetching ? <Spin size="small" /> : "No one who can cover this level"}
      options={options}
      aria-label="Delegate"
    />
  );
}

function NewDelegationForm({ levels, myId, onDone }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const levelNo = Form.useWatch("levelNo", form) ?? levels[0];
  const [serverError, setServerError] = useState(null);

  const create = useMutation({
    mutationFn: ({ delegateId, levelNo: level, range }) =>
      createDelegation({
        delegateId,
        levelNo: level,
        startsAt: range[0].startOf("day").toISOString(),
        endsAt: range[1].endOf("day").toISOString(),
      }),
    onSuccess: (d) => {
      message.success(`${d.delegate_name} covers level ${d.level_no} from ${formatDate(d.starts_at)} to ${formatDate(d.ends_at)}.`);
      queryClient.invalidateQueries({ queryKey: ["delegations"] });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      form.resetFields();
      onDone();
    },
    onError: (err) => setServerError(err.message),
  });

  return (
    <section className="line-card" aria-label="New delegation" style={{ maxWidth: 720 }}>
      <b style={{ fontSize: 16 }}>Cover me while I’m away</b>
      <p style={{ fontSize: 13, color: "#5B6475" }}>Claims waiting on your step go to this person’s inbox during the dates you pick. You can revoke it at any time.</p>
      {serverError ? <Alert type="error" showIcon title={serverError} closable onClose={() => setServerError(null)} /> : null}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ levelNo: levels[0], range: [dayjs(), dayjs().add(6, "day")] }}
        onValuesChange={(changed) => {
          setServerError(null);
          if ("levelNo" in changed) form.setFieldValue("delegateId", undefined);
        }}
        onFinish={(values) => create.mutate(values)}
      >
        <div className="line-fields" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Form.Item label="Approval level" name="levelNo" rules={[{ required: true }]}>
            <Select options={levels.map((n) => ({ value: n, label: `Level ${n} · ${ROLE_NAME[LEVEL_ROLE[n]]}` }))} disabled={levels.length === 1} />
          </Form.Item>
          <Form.Item label="Delegate" name="delegateId" rules={[{ required: true, message: "Pick who covers for you." }]}>
            <DelegatePicker levelNo={levelNo} myId={myId} />
          </Form.Item>
          <Form.Item
            label="Dates"
            name="range"
            rules={[
              { required: true, message: "Pick the start and end dates." },
              {
                validator: (_, v) => (v && v[1].endOf("day").isAfter(dayjs()) ? Promise.resolve() : Promise.reject(new Error("The end must be in the future."))),
              },
            ]}
          >
            <DatePicker.RangePicker format="D MMM YYYY" disabledDate={(d) => d.isBefore(dayjs(), "day")} allowClear={false} style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button onClick={onDone}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={create.isPending}>
            Create delegation
          </Button>
        </div>
      </Form>
    </section>
  );
}

function DelegationTable({ rows, mine, onRevoke, revokingId }) {
  return (
    <Table
      rowKey="id"
      dataSource={rows}
      pagination={false}
      scroll={{ x: 720 }}
      locale={{ emptyText: <Empty description={mine ? "You haven’t delegated any approvals." : "No one has delegated their approvals to you."} /> }}
      columns={[
        {
          title: mine ? "Delegate" : "Covering for",
          key: "person",
          render: (_, d) => {
            const name = mine ? d.delegate_name : d.delegator_name;
            return (
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <InitialsAvatar text={initials(name)} />
                <span style={{ fontWeight: 600 }}>{name}</span>
              </span>
            );
          },
        },
        { title: "Level", dataIndex: "level_no", render: (n) => `Level ${n} · ${ROLE_NAME[LEVEL_ROLE[n]] ?? ""}` },
        { title: "From", dataIndex: "starts_at", render: (v) => formatDate(v, true) },
        { title: "Until", dataIndex: "ends_at", render: (v) => formatDate(v, true) },
        {
          title: "Status",
          key: "status",
          render: (_, d) => {
            const st = delegationState(d);
            return <StatusChip tone={st.tone}>{st.label}</StatusChip>;
          },
        },
        ...(mine
          ? [
              {
                title: "",
                key: "actions",
                render: (_, d) =>
                  !d.revoked_at && dayjs(d.ends_at).isAfter(dayjs()) ? (
                    <Popconfirm title="Revoke this delegation?" description="Claims go back to your own inbox straight away." okText="Revoke" okButtonProps={{ danger: true }} onConfirm={() => onRevoke(d.id)}>
                      <Button size="small" danger loading={revokingId === d.id}>
                        Revoke
                      </Button>
                    </Popconfirm>
                  ) : null,
              },
            ]
          : []),
      ]}
    />
  );
}

/** /manager|auditor|head/delegation: leave cover for approval steps (GET, POST, DELETE /delegations). */
export default function DelegationPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const me = user.me;
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ["delegations"], queryFn: listDelegations });
  // Levels this person approves at (the backend refuses any other).
  const levels = useMemo(() => Object.keys(LEVEL_ROLE).map(Number).filter((n) => RANK[me.role] >= RANK[LEVEL_ROLE[n]]), [me.role]);

  const revoke = useMutation({
    mutationFn: revokeDelegation,
    onSuccess: () => {
      message.success("Delegation revoked");
      queryClient.invalidateQueries({ queryKey: ["delegations"] });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (err) => message.error(err.message),
  });

  return (
    <>
      <TopBar left={<span style={{ color: "#0E1424", fontWeight: 700 }}>Delegation</span>} />
      <div className="ef-page">
        <PageHeader
          title="Delegation"
          description="Going on leave? Hand your approval step to a colleague for a set period. Every approval they make is recorded as on your behalf."
          extra={
            !creating ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                New delegation
              </Button>
            ) : null
          }
        />
        {creating ? <NewDelegationForm levels={levels} myId={me.id} onDone={() => setCreating(false)} /> : null}

        <LoadingOrError query={query}>
          {(rows) => {
            const mine = rows.filter((d) => d.delegator_id === me.id);
            const toMe = rows.filter((d) => d.delegate_id === me.id);
            const activeToMe = toMe.filter((d) => delegationState(d).label === "Active now");
            return (
              <>
                {activeToMe.length ? (
                  <div className="banner banner-info">
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <SwapOutlined />
                      <span>
                        <strong>You are covering for {activeToMe.map((d) => d.delegator_name).join(", ")}.</strong> Their claims appear in your approval inbox.
                      </span>
                    </span>
                  </div>
                ) : null}
                <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <b style={{ fontSize: 16 }}>My delegations</b>
                  <DelegationTable rows={mine} mine onRevoke={(id) => revoke.mutate(id)} revokingId={revoke.isPending ? revoke.variables : null} />
                </section>
                <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <b style={{ fontSize: 16 }}>Covering for others</b>
                  <DelegationTable rows={toMe} />
                </section>
              </>
            );
          }}
        </LoadingOrError>
      </div>
    </>
  );
}
