import { SearchOutlined, UserAddOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Empty, Form, Input, Modal, Select, Spin, Table } from "antd";
import { useState } from "react";

import { listAdminUsers, updateAdminUser } from "../../api/adminUsersApi";
import { searchUsers } from "../../api/lookupsApi";
import { InitialsAvatar } from "../../components/common/InitialsAvatar";
import { LoadingOrError } from "../../components/common/LoadingOrError";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { TopBar } from "../../components/layout/TopBar";
import { useCities, useDepartments } from "../../hooks/useLookups";
import { ROLE_NAME } from "../../utils/statusLabels";

const ROLE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "MANAGER", label: "Line manager" },
  { value: "AUDITOR", label: "Finance auditor" },
  { value: "FINANCE_HEAD", label: "Finance head" },
];
const APPROVER_ROLES = new Set(["MANAGER", "AUDITOR", "FINANCE_HEAD"]);

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

/** Search active approvers (GET /users?q=) to pick as the new person's manager. */
function ManagerPicker({ value, onChange, excludeId }) {
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["users", "approvers", q], queryFn: () => searchUsers(q || undefined), staleTime: 60_000 });
  const options = (query.data?.items ?? [])
    .filter((u) => u.id !== excludeId && APPROVER_ROLES.has(u.role))
    .map((u) => ({ value: u.id, label: `${u.full_name} · ${ROLE_NAME[u.role]} · ${u.employee_code}` }));
  return (
    <Select
      showSearch
      allowClear
      value={value}
      onChange={onChange}
      onSearch={setQ}
      filterOption={false}
      placeholder="Search by name or employee code"
      notFoundContent={query.isFetching ? <Spin size="small" /> : "No matching approver"}
      options={options}
      aria-label="Manager"
    />
  );
}

/** Review the sign-up, fill in department, manager and role, then activate. */
function ActivateModal({ user, onClose }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const departments = useDepartments();
  const [form] = Form.useForm();
  const role = Form.useWatch("role", form) ?? user.role;
  const [serverError, setServerError] = useState(null);

  const activate = useMutation({
    mutationFn: (v) => updateAdminUser(user.id, { is_active: true, department_id: v.departmentId, manager_id: v.managerId ?? null, role: v.role }),
    onSuccess: (u) => {
      message.success(`${u.full_name} is active and can sign in now.`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      onClose();
    },
    onError: (err) => setServerError(err.message),
  });

  return (
    <Modal open title={`Activate ${user.full_name}`} okText="Activate account" confirmLoading={activate.isPending} onOk={() => form.submit()} onCancel={onClose} destroyOnHidden>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, background: "#F3F5FB" }}>
          <InitialsAvatar text={initials(user.full_name)} size={40} />
          <span style={{ display: "flex", flexDirection: "column" }}>
            <strong>{user.full_name}</strong>
            <span style={{ fontSize: 13, color: "#5B6475" }}>
              {user.email} · {user.employee_code}
            </span>
          </span>
        </div>
        {serverError ? <Alert type="error" showIcon title={serverError} closable onClose={() => setServerError(null)} /> : null}
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          preserve={false}
          initialValues={{ departmentId: user.department_id, managerId: user.manager_id ?? undefined, role: user.role }}
          onValuesChange={() => setServerError(null)}
          onFinish={(v) => activate.mutate(v)}
        >
          <Form.Item label="Department" name="departmentId" rules={[{ required: true, message: "Pick a department." }]} extra="Chosen by the person when they signed up. Change it if it’s wrong.">
            <Select showSearch optionFilterProp="label" options={departments.list.map((d) => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <Form.Item label="Role" name="role" rules={[{ required: true }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item
            label="Manager"
            name="managerId"
            rules={[{ required: role === "EMPLOYEE", message: "Employees need a manager: their claims go to this person first." }]}
            extra="Their claims go to this person first. Must be an active line manager, auditor or finance head."
          >
            <ManagerPicker excludeId={user.id} />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
}

/** /head/users: self-registered accounts waiting for the finance head to activate them. */
export default function NewSignupsPage() {
  const departments = useDepartments();
  const cities = useCities();
  const [q, setQ] = useState("");
  const [reviewing, setReviewing] = useState(null);
  const query = useQuery({ queryKey: ["admin-users", "pending", q], queryFn: () => listAdminUsers({ pending: true, q: q.trim() || undefined }) });

  return (
    <>
      <TopBar
        left={
          <span>
            Admin <span aria-hidden="true">/</span> <span style={{ color: "#0E1424", fontWeight: 700 }}>New sign-ups</span>
          </span>
        }
      />
      <div className="ef-page">
        <PageHeader
          title="New sign-ups"
          description="People who created an account from the sign-in page. They can’t sign in until you check their details, assign a manager and activate them."
          extra={<Input prefix={<SearchOutlined />} placeholder="Search name or email" aria-label="Search sign-ups" allowClear value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280 }} />}
        />
        <LoadingOrError query={query}>
          {(data) => (
            <>
              <Table
                rowKey="id"
                dataSource={data.items}
                pagination={data.items.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
                scroll={{ x: 860 }}
                locale={{
                  emptyText: <Empty image={<UserAddOutlined style={{ fontSize: 40, color: "#B9C0D2" }} />} description={q ? "No pending sign-up matches that search" : "No one is waiting for activation."} />,
                }}
                columns={[
                  {
                    title: "Person",
                    dataIndex: "full_name",
                    render: (name, u) => (
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <InitialsAvatar text={initials(name)} />
                        <span style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600 }}>{name}</span>
                          <span style={{ fontSize: 12, color: "#5B6475" }}>{u.email}</span>
                        </span>
                      </span>
                    ),
                  },
                  { title: "Employee code", dataIndex: "employee_code", render: (v) => <span className="mono">{v}</span> },
                  { title: "Department", dataIndex: "department_id", render: (id) => departments.byId[id] ?? "–" },
                  { title: "Home city", dataIndex: "home_city_id", render: (id) => cities.byId[id]?.name ?? <span style={{ color: "#9AA3B5" }}>–</span> },
                  { title: "Manager", dataIndex: "manager_id", render: (id) => (id ? <StatusChip tone="info">Chosen</StatusChip> : <StatusChip tone="warn">Not set</StatusChip>) },
                  { title: "Status", key: "status", render: () => <StatusChip tone="neutral">Waiting</StatusChip> },
                  {
                    title: "",
                    key: "action",
                    align: "right",
                    render: (_, u) => (
                      <Button type="primary" onClick={() => setReviewing(u)}>
                        Review &amp; activate
                      </Button>
                    ),
                  },
                ]}
              />
              {data.next_cursor ? <p style={{ fontSize: 13, color: "#5B6475" }}>Showing the first {data.items.length} of {data.total_estimate}. Search to narrow the list.</p> : null}
            </>
          )}
        </LoadingOrError>
      </div>
      {reviewing ? <ActivateModal user={reviewing} onClose={() => setReviewing(null)} /> : null}
    </>
  );
}
