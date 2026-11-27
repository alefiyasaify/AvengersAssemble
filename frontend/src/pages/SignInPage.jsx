import { ArrowRightOutlined, CheckOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert, Button, Form, Input } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/httpClient";
import { CreateAccountForm } from "../components/auth/CreateAccountForm";
import { BrandLogo } from "../components/common/BrandLogo";
import { StatusChip } from "../components/common/StatusChip";
import { useAuth } from "../context/AuthContext";

// The left panel's "policy check" card is an illustration of the product, not live data.

function PolicyPreviewCard() {
  const rows = [
    {
      cls: "rise-1",
      pop: "pop-1",
      title: "Hotel · 1 night",
      sub: "₹5,400 · limit ₹6,000",
      chip: ["ok", "Within limit"],
    },
    {
      cls: "rise-2",
      pop: "pop-2",
      title: "Meals · Saturday",
      sub: "₹1,350 · within ₹1,500 daily limit",
      chip: ["warn", "Weekend · flagged"],
    },
    {
      cls: "rise-3",
      pop: "pop-3",
      title: "Local cab",
      sub: "₹640 · no receipt, above ₹500",
      chip: ["bad", "Line rejected"],
    },
  ];
  return (
    <div style={{ position: "relative", maxWidth: "min(100%, 580px)" }}>
      <div
        className="float"
        style={{
          background: "#fff",
          color: "#0E1424",
          borderRadius: 22,
          padding: "clamp(12px, 2.2vh, 22px) 22px",
          boxShadow: "0 30px 60px rgba(8,20,70,.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: 14,
            borderBottom: "1px solid #E7EAF2",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 15 }}>Policy check · 3 lines</span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#5B6475",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16A34A" }} />
            Live as you type
          </span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.title}
            className={r.cls}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: i === 2 ? "clamp(8px, 1.4vh, 14px) 0 4px" : "clamp(8px, 1.4vh, 14px) 0",
              borderBottom: i === 2 ? 0 : "1px solid #EEF0F5",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.title}</span>
              <span style={{ fontSize: 12, color: "#5B6475" }}>{r.sub}</span>
            </div>
            <span className={r.pop}>
              <StatusChip tone={r.chip[0]}>{r.chip[1]}</StatusChip>
            </span>
          </div>
        ))}
      </div>
      <div
        className="toast-in"
        style={{
          position: "absolute",
          right: -24,
          bottom: -34,
          background: "#0E1424",
          color: "#fff",
          borderRadius: 14,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 16px 32px rgba(8,20,70,.4)",
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "#16A34A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckOutlined style={{ fontSize: 13 }} />
        </span>
        Payable ₹6,750 · goes to manager
      </div>
    </div>
  );
}

export default function SignInPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("signin"); // signin | register

  // POST /auth/login. The backend sets the HttpOnly session cookies; we only get MeRead back.
  const onFinish = async ({ email, password }) => {
    setSubmitting(true);
    setError(null);
    try {
      const home = await login(email.trim(), password);
      navigate(home, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status !== 0
          ? err.message
          : "Could not reach the server. Is the backend running on port 8000?",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main id="main" className="signin">
      <section className="signin-hero" aria-label="About ExpenseFlow">
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -140,
            bottom: -160,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "rgba(255,255,255,.07)",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 30,
            bottom: 30,
            width: 240,
            height: 240,
            borderRadius: "50%",
            background: "rgba(255,255,255,.07)",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -90,
            top: 120,
            width: 260,
            height: 260,
            borderRadius: "50%",
            background: "rgba(255,255,255,.05)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          <BrandLogo size={40} inverted />
          <span className="ef-display" style={{ fontSize: 24, fontWeight: 700 }}>
            ExpenseFlow
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "clamp(18px, 3.6vh, 34px)",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(8px, 1.8vh, 18px)" }}>
            <h1
              style={{
                fontSize: "clamp(32px, min(6.2vh, 4.2vw), 68px)",
                lineHeight: 1.04,
                fontWeight: 700,
                maxWidth: "min(100%, 720px)",
              }}
            >
              Every rupee approved with a reason.
            </h1>
            <p
              style={{
                fontSize: "clamp(14px, 2.1vh, 18px)",
                lineHeight: 1.5,
                color: "#DCE6FF",
                maxWidth: "min(100%, 620px)",
              }}
            >
              Claims are checked against company policy line by line, routed by amount, and logged
              in a trail nobody can edit.
            </p>
          </div>
          <PolicyPreviewCard />
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px 32px",
            fontSize: 14,
            color: "#DCE6FF",
            position: "relative",
          }}
        >
          <span>Manager → Auditor → Finance head</span>
          <span>Duplicate receipt detection</span>
          <span>Hash-verified audit trail</span>
        </div>
      </section>

      <section
        className="signin-form"
        aria-labelledby={mode === "register" ? undefined : "welcome"}
        aria-label={mode === "register" ? "Create account" : undefined}
      >
        {mode === "register" ? (
          <div style={{ width: "100%", maxWidth: 520 }}>
            <CreateAccountForm onBackToSignIn={() => setMode("signin")} />
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 id="welcome" style={{ fontSize: 32, fontWeight: 700 }}>
                Welcome back
              </h2>
              <p style={{ fontSize: 14, lineHeight: 1.5, color: "#5B6475" }}>
                Sign in with your work email to see the screens for your role.
              </p>
            </div>

            {error ? <Alert type="error" showIcon title={error} /> : null}

            <Form
              className="auth-form"
              layout="vertical"
              requiredMark={false}
              onFinish={onFinish}
              disabled={submitting}
              size="large"
            >
              <Form.Item
                label="Work email"
                name="email"
                rules={[
                  { required: true, message: "Enter your email." },
                  { type: "email", message: "Enter a valid email address." },
                ]}
              >
                <Input
                  prefix={<MailOutlined style={{ color: "#5B6475" }} />}
                  autoComplete="username"
                  placeholder="you@company.com"
                />
              </Form.Item>
              <Form.Item
                label="Password"
                name="password"
                rules={[{ required: true, message: "Enter your password." }]}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: "#5B6475" }} />}
                  autoComplete="current-password"
                />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={submitting}
                style={{ height: 52, borderRadius: 14, fontWeight: 700, fontSize: 15 }}
              >
                Sign in <ArrowRightOutlined />
              </Button>
            </Form>
            <p style={{ fontSize: 14, color: "#5B6475", textAlign: "center" }}>
              New here?{" "}
              <Button
                type="link"
                onClick={() => setMode("register")}
                style={{ padding: 0, height: "auto", fontWeight: 700 }}
              >
                Create an account
              </Button>
            </p>
            <p style={{ fontSize: 13, color: "#5B6475", textAlign: "center" }}>
              After 5 wrong passwords the account is locked for a while.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
