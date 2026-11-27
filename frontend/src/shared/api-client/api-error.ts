import type { components } from "./generated/schema";

export type ErrorResponse = components["schemas"]["ErrorResponse"];
export type ErrorDetail = components["schemas"]["ErrorDetail"];

/**
 * The single typed error for every failed backend call. Maps the backend error envelope
 * (docs/02 "Error envelope") and also covers proxy/network failures that carry no envelope.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetail[];
  readonly requestId: string | null;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: ErrorDetail[];
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? [];
    this.requestId = init.requestId ?? null;
  }

  /** Field-level messages keyed by field name, for forms (react-hook-form `setError`). */
  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const detail of this.details) {
      if (detail.field) {
        result[detail.field.replace(/^(body|query|path)\./, "")] = detail.issue;
      }
    }
    return result;
  }
}

export function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error: unknown = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

/** Build an ApiError from a non-2xx response body (envelope, plain text or nothing). */
export function toApiError(status: number, body: unknown, headers?: Headers): ApiError {
  if (isErrorResponse(body)) {
    return new ApiError({
      status,
      code: body.error.code,
      message: body.error.message,
      details: body.error.details ?? [],
      requestId: body.error.request_id ?? headers?.get("x-request-id") ?? null,
    });
  }
  return new ApiError({
    status,
    code: status >= 500 ? "upstream_unavailable" : "http_error",
    message:
      status >= 500
        ? "The service is temporarily unavailable. Please try again."
        : "The request could not be completed.",
    requestId: headers?.get("x-request-id") ?? null,
  });
}

/** A fetch that never reached the server (offline, DNS, CORS, aborted). */
export function networkError(cause: unknown): ApiError {
  const error = new ApiError({
    status: 0,
    code: "network_error",
    message: "Could not reach the server. Check your connection and try again.",
  });
  error.cause = cause;
  return error;
}
