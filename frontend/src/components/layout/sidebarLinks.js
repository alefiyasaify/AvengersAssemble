import {
  AuditOutlined,
  BarChartOutlined,
  CopyOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  PlusCircleOutlined,
  SafetyOutlined,
  SlidersOutlined,
  SwapOutlined,
  UnorderedListOutlined,
  UserAddOutlined,
  WalletOutlined,
} from "@ant-design/icons";

// Sidebar entries per role ("Shared · Sidebar by role" artboard).
// end: true = highlight only on that exact URL (not on its child pages).
const MY_CLAIMS = [
  { to: "/employee/claims", label: "My claims", icon: FileTextOutlined, end: true },
  { to: "/employee/claims/new", label: "New claim", icon: PlusCircleOutlined },
];

export const SIDEBAR_LINKS = {
  employee: [...MY_CLAIMS, { to: "/employee/spend", label: "My spend", icon: BarChartOutlined }],
  manager: [
    { to: "/manager/inbox", label: "Approval inbox", icon: InboxOutlined },
    { to: "/manager/team", label: "Team spend", icon: BarChartOutlined },
    { to: "/manager/delegation", label: "Delegation", icon: SwapOutlined },
  ],
  auditor: [
    { to: "/auditor/queue", label: "Review queue", icon: UnorderedListOutlined },
    { to: "/auditor/sample", label: "Sample audit", icon: AuditOutlined },
    { to: "/auditor/duplicates", label: "Duplicates", icon: CopyOutlined },
    { to: "/auditor/payouts", label: "Payout batches", icon: WalletOutlined },
    { to: "/auditor/delegation", label: "Delegation", icon: SwapOutlined },
  ],
  head: [
    { to: "/head/approvals", label: "High-value approvals", icon: SafetyOutlined },
    { to: "/head/payouts", label: "Payout batches", icon: WalletOutlined },
    { to: "/head/dashboard", label: "Dashboard", icon: DashboardOutlined },
    { to: "/head/policy", label: "Policy rules", icon: SlidersOutlined },
    { to: "/head/audit", label: "Audit trail", icon: HistoryOutlined },
    { to: "/head/users", label: "New sign-ups", icon: UserAddOutlined },
    { to: "/head/delegation", label: "Delegation", icon: SwapOutlined },
  ],
};

/** Second sidebar group for approvers: their own expense claims. */
export const MY_EXPENSE_LINKS = MY_CLAIMS;
