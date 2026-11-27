import { MenuOutlined } from "@ant-design/icons";
import { Button, Drawer, Layout } from "antd";
import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { ROLE_HOME, useRole } from "../../context/RoleContext";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { Sidebar } from "./Sidebar";

/**
 * Sidebar shell: used by manager, auditor and finance head, and by employees on laptops.
 * Sends people without a role to sign-in, and people with another role to their own home.
 * On small screens the sidebar becomes a slide-out drawer.
 */
const COLLAPSED_KEY = "ef.sidebarCollapsed";

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function DesktopLayout({ allowedRoles }) {
  const { role } = useRole();
  const isDesktop = useIsDesktop();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, String(!c));
      } catch {
        // Storage may be blocked; the toggle still works for this visit.
      }
      return !c;
    });
  };

  if (!role) return <Navigate to="/" replace />;
  if (!allowedRoles.includes(role)) return <Navigate to={ROLE_HOME[role]} replace />;

  return (
    <Layout className="ef-shell" hasSider={isDesktop}>
      {isDesktop ? (
        <Layout.Sider
          width={248}
          collapsedWidth={84}
          collapsed={collapsed}
          trigger={null}
          theme="light"
          className="ef-sider-pinned"
          style={{ background: "#EEF1F8" }}
        >
          <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </Layout.Sider>
      ) : (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          size={280}
          styles={{ body: { padding: 0, background: "#EEF1F8" }, header: { display: "none" } }}
        >
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </Drawer>
      )}
      <Layout.Content style={{ minWidth: 0 }}>
        <main id="main" className="ef-main">
          {!isDesktop ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 0" }}>
              <Button icon={<MenuOutlined />} aria-label="Open navigation" onClick={() => setDrawerOpen(true)} />
              <span className="ef-display" style={{ fontWeight: 700, fontSize: 18 }}>
                ExpenseFlow
              </span>
            </div>
          ) : null}
          <Outlet />
        </main>
      </Layout.Content>
    </Layout>
  );
}
