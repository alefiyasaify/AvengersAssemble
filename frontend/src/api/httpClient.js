// The one HTTP client for the browser. Calls go to same-origin /api/v1 and are proxied to the
// backend (src/setupProxy.js, ADR-0004).
//
// Auth (ADR-0006): the session lives in HttpOnly cookies set by POST /auth/login. JavaScript never
// sees the tokens. The only readable cookie is `ef_csrf`, which must be echoed in the
// X-CSRF-Token header on every state-changing request.

export const API_BASE = "/api/v1";
const CSRF_COOKIE = "ef_csrf";
const CSRF_HEADER = "X-CSRF-Token";

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

// Called when the session has expired and could not be refreshed (set by AuthContext).
let onSessionExpired = () => {};
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function newIdempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function toQuery(query) {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

async function send(method, path, { query, body } = {}) {
  const headers = { Accept: "application/json" };
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
    if (method === "POST") headers["Idempotency-Key"] = newIdempotencyKey();
  }
  try {
    return await fetch(`${API_BASE}${path}${toQuery(query)}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (cause) {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Could not reach the server. Check that the backend is running and try again.",
      details: { cause: String(cause) },
    });
  }
}

async function toError(response) {
  const payload = await response.json().catch(() => null);
  const err = payload?.error ?? {};
  return new ApiError({
    status: response.status,
    code: err.code ?? (response.status === 401 ? "UNAUTHENTICATED" : "INTERNAL_ERROR"),
    message: err.message ?? "Something went wrong.",
    details: err.details,
    requestId: err.request_id ?? response.headers.get("X-Request-ID"),
  });
}

/**
 * Make a request and return the parsed body.
 * @param {"GET"|"POST"|"PUT"|"PATCH"|"DELETE"} method
 * @param {string} path  relative to /api/v1, e.g. "/claims"
 * @param {{ query?: object, body?: unknown, as?: "json"|"text"|"blob" }} [options]
 */
export async function httpRequest(method, path, options = {}) {
  const isAuthCall = path.startsWith("/auth/");
  let response = await send(method, path, options);

  // Access token expired: refresh the session once, then retry the original request.
  if (response.status === 401 && !isAuthCall) {
    const refreshed = await send("POST", "/auth/refresh");
    if (refreshed.ok) response = await send(method, path, options);
    if (response.status === 401) onSessionExpired();
  }

  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined;
  if (options.as === "text") return response.text();
  if (options.as === "blob") return response.blob();
  return response.json();
}

export const api = {
  get: (path, query, options) => httpRequest("GET", path, { ...options, query }),
  post: (path, body, options) => httpRequest("POST", path, { ...options, body }),
  put: (path, body) => httpRequest("PUT", path, { body }),
  patch: (path, body) => httpRequest("PATCH", path, { body }),
  delete: (path, query) => httpRequest("DELETE", path, { query }),
};

/** URL of a receipt file, for <img src> / links (the cookie session authorises it). */
export const receiptFileUrl = (receiptId) => `${API_BASE}/receipts/${encodeURIComponent(receiptId)}/file`;
