// The one HTTP client for the browser. Same-origin /api/v1 (proxied to the backend, ADR-0004).
// Cookies carry the session (ADR-0006); nothing auth-related is stored in JS.

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details ?? {};
    this.requestId = requestId ?? null;
  }

  /** `{ "lines.0.amount_paise": "must be > 0" }` from a VALIDATION_FAILED envelope. */
  fieldErrors() {
    const fields = this.details?.fields ?? [];
    return Object.fromEntries(fields.map((f) => [f.field, f.issue]));
  }
}

function toQuery(query) {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function httpRequest(method, path, { query, body, idempotencyKey } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}${toQuery(query)}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Could not reach the server. Check your connection and try again.",
      details: { cause: String(cause) },
    });
  }

  if (response.status === 204) return undefined;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const err = payload?.error ?? {};
    throw new ApiError({
      status: response.status,
      code: err.code ?? "INTERNAL_ERROR",
      message: err.message ?? "Something went wrong.",
      details: err.details,
      requestId: err.request_id ?? response.headers.get("X-Request-ID"),
    });
  }
  return payload;
}
