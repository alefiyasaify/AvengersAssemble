import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import { Badge, Button, Dropdown, Input, Tooltip } from "antd";
import { NavLink, useNavigate } from "react-router-dom";

import { ROLE_HOME, useRole } from "../../context/RoleContext";
import { BrandLogo } from "../common/BrandLogo";
import { InitialsAvatar } from "../common/InitialsAvatar";
import { KeyboardKey } from "../common/KeyboardKey";
import { SIDEBAR_LINKS } from "./sidebarLinks";

/**
 * Left navigation: logo, search, the role's links, and the user card with the role switcher.
 * collapsed = slim icon-only rail (labels move into tooltips).
 * onToggleCollapse is only passed on desktop; the mobile drawer has no collapse button.
 */
export function Sidebar({ collapsed = false, onToggleCollapse, onNavigate }) {
  const { role, user, setRole } = useRole();
  const navigate = useNavigate();

  const userMenu = {
    items: [
      { key: "who", label: `${user.name} · ${user.title}`, disabled: true },
      { type: "divider" },
      ...Object.keys(ROLE_HOME)
        .filter((r) => r !== role)
        .map((r) => ({ key: r, icon: <UserSwitchOutlined />, label: `Switch to ${r === "head" ? "finance head" : r}` })),
      { type: "divider" },
      { key: "logout", icon: <LogoutOutlined />, label: "Sign out", danger: true },
    ],
    onClick: ({ key }) => {
      if (key === "logout") {
        setRole(null);
        navigate("/");
        return;
      }
      setRole(key);
      navigate(ROLE_HOME[key]);
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

      {collapsed ? (
        <Tooltip title="Search (Ctrl K)" placement="right">
          <Button icon={<SearchOutlined />} aria-label="Search" style={{ alignSelf: "center", borderRadius: 14 }} />
        </Tooltip>
      ) : (
        <Input
          prefix={<SearchOutlined style={{ color: "#5B6475" }} />}
          suffix={<KeyboardKey>Ctrl K</KeyboardKey>}
          placeholder="Search"
          aria-label="Search"
          style={{ borderRadius: 14, borderColor: "#DDE2EE" }}
        />
      )}

      <nav aria-label="Main">
        {collapsed ? null : <div className="ef-nav-label">WORKSPACE</div>}
        <div className="ef-nav">
          {(SIDEBAR_LINKS[role] ?? []).map(({ to, label, icon: Icon, badge, end }) => {
            const link = (
              <NavLink key={to} to={to} end={end} onClick={onNavigate} aria-label={collapsed ? label : undefined}>
                <span className="tile">
                  {collapsed && badge ? (
                    <Badge dot color="#2563EB" offset={[2, -2]}>
                      <Icon />
                    </Badge>
                  ) : (
                    <Icon />
                  )}
                </span>
                {collapsed ? null : <span style={{ flex: 1 }}>{label}</span>}
                {!collapsed && badge ? <span className="count">{badge}</span> : null}
              </NavLink>
            );
            return collapsed ? (
              <Tooltip key={to} title={badge ? `${label} · ${badge}` : label} placement="right">
                {link}
              </Tooltip>
            ) : (
              link
            );
          })}
        </div>
      </nav>

      <Dropdown menu={userMenu} trigger={["click"]} placement="topLeft">
        <button type="button" className="ef-user" aria-label={`${user.name}, switch role`}>
          <InitialsAvatar text={user.initials} size={40} filled style={{ boxShadow: "0 0 0 3px #DCE6FF" }} />
          {collapsed ? null : (
            <>
              <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{user.name}</span>
                <span style={{ fontSize: 12, color: "#5B6475" }}>{user.title}</span>
              </span>
              <UserSwitchOutlined style={{ color: "#5B6475" }} />
            </>
          )}
        </button>
      </Dropdown>
    </div>
  );
}
