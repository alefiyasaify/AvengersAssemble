import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { Button, Dropdown, Tooltip } from "antd";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { BrandLogo } from "../common/BrandLogo";
import { InitialsAvatar } from "../common/InitialsAvatar";
import { MY_EXPENSE_LINKS, SIDEBAR_LINKS } from "./sidebarLinks";

function NavGroup({ title, links, collapsed, onNavigate }) {
  return (
    <div>
      {collapsed ? null : <div className="ef-nav-label">{title}</div>}
      <div className="ef-nav">
        {links.map(({ to, label, icon: Icon, end }) => {
          const link = (
            <NavLink key={to} to={to} end={end} onClick={onNavigate} aria-label={collapsed ? label : undefined}>
              <span className="tile">
                <Icon />
              </span>
              {collapsed ? null : <span style={{ flex: 1 }}>{label}</span>}
            </NavLink>
          );
          return collapsed ? (
            <Tooltip key={to} title={label} placement="right">
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </div>
    </div>
  );
}

/**
 * Left navigation: logo, the role's links, and the signed-in user card (sign out).
 * collapsed = slim icon-only rail (labels move into tooltips).
 * onToggleCollapse is only passed on desktop; the mobile drawer has no collapse button.
 */
export function Sidebar({ collapsed = false, onToggleCollapse, onNavigate }) {
  const { role, user, logout } = useAuth();
  const navigate = useNavigate();

  const userMenu = {
    items: [
      { key: "who", label: `${user.name} · ${user.email}`, disabled: true },
      { type: "divider" },
      { key: "logout", icon: <LogoutOutlined />, label: "Sign out", danger: true },
    ],
    onClick: async ({ key }) => {
      if (key === "logout") {
        await logout();
        navigate("/");
      }
    },
  };

  const collapseButton = onToggleCollapse ? (
    <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right">
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        onClick={onToggleCollapse}
        style={{ color: "#4A5366" }}
      />
    </Tooltip>
  ) : null;

  return (
    <div className={`ef-sider ${collapsed ? "is-collapsed" : ""}`}>
      <div className="ef-brand">
        <BrandLogo />
        {collapsed ? null : <span style={{ flex: 1 }}>ExpenseFlow</span>}
        {collapsed ? null : collapseButton}
      </div>
      {collapsed ? <div style={{ display: "flex", justifyContent: "center" }}>{collapseButton}</div> : null}

      <nav aria-label="Main" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <NavGroup title="WORKSPACE" links={SIDEBAR_LINKS[role] ?? []} collapsed={collapsed} onNavigate={onNavigate} />
        {role !== "employee" ? <NavGroup title="MY EXPENSES" links={MY_EXPENSE_LINKS} collapsed={collapsed} onNavigate={onNavigate} /> : null}
      </nav>

      <Dropdown menu={userMenu} trigger={["click"]} placement="topLeft">
        <button type="button" className="ef-user" aria-label={`${user.name}, account menu`}>
          <InitialsAvatar text={user.initials} size={40} filled style={{ boxShadow: "0 0 0 3px #DCE6FF" }} />
          {collapsed ? null : (
            <>
              <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</span>
                <span style={{ fontSize: 12, color: "#5B6475" }}>{user.title}</span>
              </span>
              <LogoutOutlined style={{ color: "#5B6475" }} />
            </>
          )}
        </button>
      </Dropdown>
    </div>
  );
}
