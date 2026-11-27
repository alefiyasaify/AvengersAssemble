import { BellOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";

/** Row at the top of each desktop page: breadcrumb (left), actions and notifications (right). */
export function TopBar({ left, right }) {
  return (
    <div className="ef-topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#5B6475", flexWrap: "wrap" }}>{left}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {right}
        {/* The API has no notifications endpoint yet, so no unread dot. */}
        <Tooltip title="No notifications">
          <Button icon={<BellOutlined />} aria-label="Notifications" />
        </Tooltip>
      </div>
    </div>
  );
}
