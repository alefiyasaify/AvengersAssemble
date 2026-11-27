// All routes. Each role has its own URL prefix and layout; the layouts redirect anyone who
// is signed out or in the wrong role.
import { Navigate, Route, Routes } from "react-router-dom";

import { DesktopLayout } from "./components/layout/DesktopLayout";
import { EmployeeLayout } from "./components/layout/EmployeeLayout";
import { ROLE_HOME, useRole } from "./context/RoleContext";
import ComingSoonPage from "./pages/ComingSoonPage";
import NotFoundPage from "./pages/NotFoundPage";
import SignInPage from "./pages/SignInPage";
import ApprovalInboxPage from "./pages/approvals/ApprovalInboxPage";
import ClaimReviewPage from "./pages/approvals/ClaimReviewPage";
import ReviewQueuePage from "./pages/auditor/ReviewQueuePage";
import MyClaimsPage from "./pages/employee/MyClaimsPage";
import NewClaimPage from "./pages/employee/NewClaimPage";
import AuditTrailPage from "./pages/financeHead/AuditTrailPage";
import DashboardPage from "./pages/financeHead/DashboardPage";
import PayoutBatchPage from "./pages/financeHead/PayoutBatchPage";
import PolicyRulesPage from "./pages/financeHead/PolicyRulesPage";

function HomeRedirect() {
  const { role } = useRole();
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
        <Route path="/sign-in" element={<SignInPage />} />

        {/* Employee: sidebar layout on laptops, phone layout on small screens */}
        <Route path="/employee" element={<EmployeeLayout />}>
          <Route index element={<Navigate to="claims" replace />} />
          <Route path="claims" element={<MyClaimsPage />} />
          <Route path="claims/new" element={<NewClaimPage />} />
          <Route path="spend" element={<ComingSoonPage title="My spend" endpoint="GET /dashboard/summary" />} />
        </Route>

        {/* Line manager */}
        <Route path="/manager" element={<DesktopLayout allowedRoles={["manager"]} />}>
          <Route index element={<Navigate to="inbox" replace />} />
          <Route path="inbox" element={<ApprovalInboxPage />} />
          <Route path="claims/:id" element={<ClaimReviewPage />} />
          <Route path="team" element={<ComingSoonPage title="Team spend" endpoint="GET /dashboard/summary?department=" />} />
          <Route path="delegation" element={<ComingSoonPage title="Delegation" endpoint="GET, POST /delegations" />} />
        </Route>

        {/* Finance auditor */}
        <Route path="/auditor" element={<DesktopLayout allowedRoles={["auditor"]} />}>
          <Route index element={<Navigate to="queue" replace />} />
          <Route path="queue" element={<ReviewQueuePage key="all" />} />
          <Route path="sample" element={<ReviewQueuePage key="sample" initialFlag="SAMPLE_AUDIT" />} />
          <Route path="duplicates" element={<ReviewQueuePage key="dup" initialFlag="DUPLICATE" />} />
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
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
