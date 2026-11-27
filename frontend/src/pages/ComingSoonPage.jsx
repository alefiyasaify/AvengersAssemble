import { Button, Result } from "antd";
import { useNavigate } from "react-router-dom";

/** Screens in the sidebar that the design canvas does not draw yet. */
export default function ComingSoonPage({ title, endpoint }) {
  const navigate = useNavigate();
  return (
    <Result
      status="info"
      title={title}
      subTitle={
        <span>
          This screen is not designed yet.
          {endpoint ? (
            <>
              {" "}
              It will use <code>{endpoint}</code>.
            </>
          ) : null}
        </span>
      }
      extra={<Button onClick={() => navigate(-1)}>Go back</Button>}
      style={{ padding: "80px 16px" }}
    />
  );
}
