import { BarChartOutlined, FileTextOutlined, PlusOutlined } from "@ant-design/icons";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";

import { ROLE_HOME, useRole } from "../../context/RoleContext";

/** Phone-first shell for the employee role, with the floating bottom tab bar from the design. */
export function MobileLayout() {
  const { role } = useRole();
  const location = useLocation();

  if (!role) return <Navigate to="/" replace />;
  if (role !== "employee") return <Navigate to={ROLE_HOME[role]} replace />;

  const onNewClaim = location.pathname.endsWith("/new");

  return (
    <div className="mobile-wrap">
      <main id="main" className="mobile">
        <Outlet />
        {!onNewClaim ? (
          <nav className="tabbar" aria-label="Main">
            <NavLink to="/employee/claims" end>
              <FileTextOutlined />
              Claims
            </NavLink>
            <NavLink to="/employee/claims/new" className="fab" aria-label="New claim">
              <PlusOutlined style={{ fontSize: 22 }} />
            </NavLink>
            <NavLink to="/employee/spend">
              <BarChartOutlined />
              Spend
            </NavLink>
          </nav>
        ) : null}
      </main>
    </div>
  );
}
