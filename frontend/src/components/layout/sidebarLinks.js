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
  WalletOutlined,
} from "@ant-design/icons";

// Sidebar entries per role ("Shared · Sidebar by role" artboard). badge = open item count.
// end: true = highlight only on that exact URL (not on its child pages).
export const SIDEBAR_LINKS = {
  employee: [
    { to: "/employee/claims", label: "My claims", icon: FileTextOutlined, end: true },
    { to: "/employee/claims/new", label: "New claim", icon: PlusCircleOutlined },
    { to: "/employee/spend", label: "My spend", icon: BarChartOutlined },
  ],
  manager: [
    { to: "/manager/inbox", label: "Approval inbox", icon: InboxOutlined, badge: 6 },
    { to: "/manager/team", label: "Team spend", icon: BarChartOutlined },
    { to: "/manager/delegation", label: "Delegation", icon: SwapOutlined },
  ],
  auditor: [
    { to: "/auditor/queue", label: "Review queue", icon: UnorderedListOutlined, badge: 38 },
    { to: "/auditor/sample", label: "Sample audit", icon: AuditOutlined, badge: 9 },
    { to: "/auditor/duplicates", label: "Duplicates", icon: CopyOutlined, badge: 6 },
  ],
  head: [
    { to: "/head/approvals", label: "High-value approvals", icon: SafetyOutlined, badge: 3 },
    { to: "/head/payouts", label: "Payout batches", icon: WalletOutlined },
    { to: "/head/dashboard", label: "Dashboard", icon: DashboardOutlined },
    { to: "/head/policy", label: "Policy rules", icon: SlidersOutlined },
    { to: "/head/audit", label: "Audit trail", icon: HistoryOutlined },
  ],
};
