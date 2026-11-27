import createClient from "openapi-fetch";

import { networkError, toApiError } from "./api-error";
import type { paths } from "./generated/schema";

/**
 * The ONE configured API client for browser code. Paths are typed from backend/openapi.json.
 *
 * Calls go to the frontend's own origin (`/api/v1/...`); Next.js rewrites proxy them to the
 * backend (ADR-0004). Never hard-code the backend host or port.
 * In the browser `baseUrl` is the current origin (same as a relative URL); outside a browser
 * (tests under jsdom) it is the jsdom origin. Server components use `server-client.ts` instead.
 */
export function createApiClient(
  baseUrl = typeof window === "undefined" ? "" : window.location.origin,
) {
  // Resolve fetch per call (not at import), so instrumentation/mocks installed later still apply.
  return createClient<paths>({ baseUrl, fetch: (request) => globalThis.fetch(request) });
}

export const apiClient = createApiClient();

export type ApiClient = ReturnType<typeof createApiClient>;

/** Shape shared by every openapi-fetch result (success and error branches). */
type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Await an openapi-fetch call and return its data, or throw a typed `ApiError`.
 *
 * @example const ready = await unwrap(apiClient.GET("/api/v1/health/ready"));
 */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await request;
  } catch (cause) {
    throw networkError(cause);
  }
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.response.status, result.error, result.response.headers);
  }
  // openapi-fetch leaves `data` undefined only for bodiless responses (e.g. 204), typed as such.
  return result.data as T;
}
