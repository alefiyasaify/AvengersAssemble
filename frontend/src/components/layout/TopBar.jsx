import { BellOutlined } from "@ant-design/icons";
import { Badge, Button } from "antd";

/** Row at the top of each desktop page: breadcrumb (left), actions and notifications (right). */
export function TopBar({ left, right }) {
  return (
    <div className="ef-topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#5B6475", flexWrap: "wrap" }}>{left}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {right}
        <Badge dot color="#E0551B" offset={[-8, 8]}>
          <Button icon={<BellOutlined />} aria-label="Notifications" />
        </Badge>
      </div>
    </div>
  );
}
