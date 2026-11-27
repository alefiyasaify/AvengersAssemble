import { CheckCircleFilled, LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Select } from "antd";
import { useState } from "react";

import { register } from "../../api/authApi";
import { ApiError } from "../../api/httpClient";
import { listCities, listDepartments } from "../../api/lookupsApi";

const MIN_PASSWORD = 12; // RegisterRequest.password min_length in the backend

/**
 * Self-registration (POST /auth/register). Creates an INACTIVE employee account; the finance
 * head reviews it and activates it. The backend gives the same answer whether or not the email
 * is already registered, so the success message never confirms that an account exists.
 */
export function CreateAccountForm({ onBackToSignIn }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null); // the email that was registered

  // Reference data for the form. These are read before sign-in.
  const departments = useQuery({
    queryKey: ["public", "departments"],
    queryFn: listDepartments,
    retry: false,
    staleTime: Infinity,
  });
  const cities = useQuery({
    queryKey: ["public", "cities"],
    queryFn: listCities,
    retry: false,
    staleTime: Infinity,
  });
  const lookupsBlocked = departments.isError && departments.error?.status === 401;

  const onFinish = async (v) => {
    setSubmitting(true);
    setError(null);
    try {
      await register({
        full_name: v.fullName.trim(),
        email: v.email.trim(),
        password: v.password,
        department_id: v.departmentId,
        home_city_id: v.homeCityId ?? null,
      });
      setDone(v.email.trim());
    } catch (err) {
      if (!(err instanceof ApiError) || err.status === 0)
        setError("Could not reach the server. Is the backend running on port 8000?");
      else if (err.code === "REGISTRATION_DISABLED")
        setError("Self-registration is turned off. Ask the finance team to create your account.");
      else if (err.status === 429) setError("Too many attempts. Wait a few minutes and try again.");
      else setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <CheckCircleFilled style={{ fontSize: 40, color: "#16A34A" }} aria-hidden="true" />
        <h2 style={{ fontSize: 30, fontWeight: 700 }}>Request sent</h2>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "#3F4859" }}>
          If <strong>{done}</strong> isn’t registered yet, an account has been created for it. The
          finance team checks your department and manager and then activates it. You can sign in
          once it’s active.
        </p>
        <Button
          type="primary"
          size="large"
          onClick={onBackToSignIn}
          style={{ height: 52, borderRadius: 14, fontWeight: 700 }}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 28, fontWeight: 700 }}>Create your account</h2>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: "#5B6475" }}>
          The finance team activates new accounts before you can sign in.
        </p>
      </div>

      {lookupsBlocked ? (
        <Alert
          type="warning"
          showIcon
          title="Registration isn’t available yet"
          description="The department list can only be loaded after signing in, so the form can’t be completed. The backend needs to allow GET /departments without sign-in. Ask the finance team to create your account for now."
        />
      ) : null}
      {error ? (
        <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} />
      ) : null}

      <Form
        className="auth-form"
        layout="vertical"
        requiredMark={false}
        onFinish={onFinish}
        disabled={submitting || lookupsBlocked}
      >
        <div className="register-grid">
          <Form.Item
            label="Full name"
            name="fullName"
            rules={[
              { required: true, whitespace: true, message: "Enter your full name." },
              { max: 120 },
            ]}
          >
            <Input prefix={<UserOutlined style={{ color: "#5B6475" }} />} autoComplete="name" />
          </Form.Item>
          <Form.Item
            label="Work email"
            name="email"
            rules={[
              { required: true, message: "Enter your work email." },
              { type: "email", message: "Enter a valid email address." },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: "#5B6475" }} />}
              autoComplete="email"
              placeholder="you@company.com"
            />
          </Form.Item>
        </div>
        <div className="register-grid">
          <Form.Item
            label="Department"
            name="departmentId"
            rules={[{ required: true, message: "Pick your department." }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={departments.isPending ? "Loading…" : "Select"}
              loading={departments.isPending}
              options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item label="Home city (optional)" name="homeCityId">
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="Select"
              loading={cities.isPending}
              options={(cities.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
        </div>
        <div className="register-grid">
          <Form.Item
            label="Password"
            name="password"
            hasFeedback
            rules={[
              { required: true, message: "Choose a password." },
              { min: MIN_PASSWORD, message: `Use at least ${MIN_PASSWORD} characters.` },
              { max: 256 },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "#5B6475" }} />}
              autoComplete="new-password"
              placeholder={`${MIN_PASSWORD}+ characters`}
            />
          </Form.Item>
          <Form.Item
            label="Confirm password"
            name="confirm"
            dependencies={["password"]}
            hasFeedback
            rules={[
              { required: true, message: "Type the password again." },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue("password") === value
                    ? Promise.resolve()
                    : Promise.reject(new Error("The passwords don’t match.")),
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "#5B6475" }} />}
              autoComplete="new-password"
            />
          </Form.Item>
        </div>
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={submitting}
          style={{ height: 48, borderRadius: 14, fontWeight: 700, fontSize: 15, marginTop: 4 }}
        >
          Request account
        </Button>
      </Form>

      <p style={{ fontSize: 14, color: "#5B6475", textAlign: "center", margin: 0 }}>
        Already have an account?{" "}
        <Button
          type="link"
          onClick={onBackToSignIn}
          style={{ padding: 0, height: "auto", fontWeight: 700 }}
        >
          Sign in
        </Button>
      </p>
    </div>
  );
}
