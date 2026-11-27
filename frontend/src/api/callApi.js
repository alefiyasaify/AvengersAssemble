import { ENDPOINTS, buildPath } from "./apiEndpoints";
import { httpRequest } from "./httpClient";

// Mock mode is the default until the backend implements the ARD endpoints.
export const USE_MOCKS = process.env.REACT_APP_USE_MOCKS !== "false";

const MOCK_LATENCY_MS = process.env.NODE_ENV === "test" ? 0 : 250;

// Deep copy so callers can never mutate the in-memory mock store (mock data is plain JSON).
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Call an endpoint from ENDPOINTS. In mock mode `mock()` provides the response (same shape the
 * real endpoint returns); otherwise the request goes over HTTP.
 *
 * @param {keyof typeof ENDPOINTS} name
 * @param {{ params?: object, query?: object, body?: unknown, idempotencyKey?: string }} [req]
 * @param {() => unknown} [mock]
 */
export async function callApi(name, req = {}, mock) {
  const endpoint = ENDPOINTS[name];
  if (!endpoint) throw new Error(`Unknown endpoint "${name}"`);
  const path = buildPath(endpoint.path, req.params);

  if (USE_MOCKS && mock) {
    await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
    return clone(await mock());
  }
  return httpRequest(endpoint.method, path, req);
}

export function newIdempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  // Fallback for older test environments; keys only need to be unique per request.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
