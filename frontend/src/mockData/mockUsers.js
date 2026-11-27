// Demo personas (ARD personas). Shape of GET /me.
export const USERS = {
  employee: {
    id: "0193a1b0-0000-7000-8000-000000000001",
    name: "Aarav Mehta",
    initials: "AM",
    role: "EMPLOYEE",
    title: "Software Engineer",
    department: "Engineering",
    permissions: ["claims:create", "claims:read:own"],
  },
  manager: {
    id: "0193a1b0-0000-7000-8000-000000000002",
    name: "Priya Nair",
    initials: "PN",
    role: "MANAGER",
    title: "Engineering Manager",
    department: "Engineering",
    permissions: ["claims:create", "approvals:act", "delegations:manage"],
  },
  auditor: {
    id: "0193a1b0-0000-7000-8000-000000000003",
    name: "Karan Shah",
    initials: "KS",
    role: "AUDITOR",
    title: "Finance Auditor",
    department: "Finance",
    permissions: ["review-queue:act", "sample-audits:resolve", "payouts:verify", "audit:read"],
  },
  head: {
    id: "0193a1b0-0000-7000-8000-000000000004",
    name: "Meera Iyer",
    initials: "MI",
    role: "FINANCE_HEAD",
    title: "Finance Head",
    department: "Finance",
    permissions: ["approvals:act", "payouts:manage", "policy:manage", "audit:read", "dashboard:read"],
  },
};
