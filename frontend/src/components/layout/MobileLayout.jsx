import { BarChartOutlined, FileTextOutlined, PlusOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

/** Phone layout for the "my claims" screens (any signed-in role), with the floating bottom tab bar. */
export function MobileLayout() {
  const { status, role } = useAuth();
  const location = useLocation();

  if (status === "loading") return <Spin fullscreen />;
  if (!role) return <Navigate to="/" replace />;

  // Hide the tab bar inside a claim (it has its own sticky submit bar).
  const inClaimEditor = /^\/employee\/claims\/.+/.test(location.pathname);

  return (
    <div className="mobile-wrap">
      <main id="main" className="mobile">
        <Outlet />
        {!inClaimEditor ? (
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
