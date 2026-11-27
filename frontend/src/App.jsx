// All routes. Each role has its own URL prefix and layout; the layouts redirect anyone who is
// signed out or in the wrong role. The backend enforces every permission as well.
import { Spin } from "antd";
import { Navigate, Route, Routes } from "react-router-dom";

import { DesktopLayout } from "./components/layout/DesktopLayout";
import { EmployeeLayout } from "./components/layout/EmployeeLayout";
import { ROLE_HOME, useAuth } from "./context/AuthContext";
import NotFoundPage from "./pages/NotFoundPage";
import SignInPage from "./pages/SignInPage";
import ApprovalInboxPage from "./pages/approvals/ApprovalInboxPage";
import ClaimReviewPage from "./pages/approvals/ClaimReviewPage";
import DelegationPage from "./pages/approvals/DelegationPage";
import ReviewQueuePage from "./pages/auditor/ReviewQueuePage";
import SampleAuditPage from "./pages/auditor/SampleAuditPage";
import ClaimEditorPage from "./pages/employee/ClaimEditorPage";
import TeamSpendPage from "./pages/manager/TeamSpendPage";
import MyClaimsPage from "./pages/employee/MyClaimsPage";
import MySpendPage from "./pages/employee/MySpendPage";
import AuditTrailPage from "./pages/financeHead/AuditTrailPage";
import DashboardPage from "./pages/financeHead/DashboardPage";
import NewSignupsPage from "./pages/financeHead/NewSignupsPage";
import PayoutBatchPage from "./pages/financeHead/PayoutBatchPage";
import PolicyRulesPage from "./pages/financeHead/PolicyRulesPage";

/** "/" shows sign-in, or sends a signed-in user to their role's home. */
function HomeRedirect() {
  const { status, role } = useAuth();
  if (status === "loading") return <Spin fullscreen />;
  return role ? <Navigate to={ROLE_HOME[role]} replace /> : <SignInPage />;
}

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />

        {/* My claims: every role files its own expenses */}
        <Route path="/employee" element={<EmployeeLayout />}>
          <Route index element={<Navigate to="claims" replace />} />
          <Route path="claims" element={<MyClaimsPage />} />
          <Route path="claims/new" element={<ClaimEditorPage />} />
          <Route path="claims/:id" element={<ClaimEditorPage />} />
          <Route path="spend" element={<MySpendPage />} />
        </Route>

        {/* Line manager */}
        <Route path="/manager" element={<DesktopLayout allowedRoles={["manager"]} />}>
          <Route index element={<Navigate to="inbox" replace />} />
          <Route path="inbox" element={<ApprovalInboxPage />} />
          <Route path="claims/:id" element={<ClaimReviewPage />} />
          <Route path="team" element={<TeamSpendPage />} />
          <Route path="delegation" element={<DelegationPage />} />
        </Route>

        {/* Finance auditor */}
        <Route path="/auditor" element={<DesktopLayout allowedRoles={["auditor"]} />}>
          <Route index element={<Navigate to="queue" replace />} />
          <Route path="queue" element={<ReviewQueuePage key="all" />} />
          <Route path="duplicates" element={<ReviewQueuePage key="dup" initialFlag="DUPLICATE_LINE" />} />
          <Route path="sample" element={<SampleAuditPage />} />
          <Route path="claims/:id" element={<ClaimReviewPage />} />
          <Route path="payouts" element={<PayoutBatchPage />} />
          <Route path="delegation" element={<DelegationPage />} />
        </Route>

        {/* Finance head */}
        <Route path="/head" element={<DesktopLayout allowedRoles={["head"]} />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="approvals" element={<ApprovalInboxPage highValueOnly />} />
          <Route path="claims/:id" element={<ClaimReviewPage />} />
          <Route path="payouts" element={<PayoutBatchPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="policy" element={<PolicyRulesPage />} />
          <Route path="audit" element={<AuditTrailPage />} />
          <Route path="users" element={<NewSignupsPage />} />
          <Route path="delegation" element={<DelegationPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
