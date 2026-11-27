import { describe, expect, it } from "vitest";

import { ApiError, isErrorResponse, networkError, toApiError } from "./api-error";

describe("toApiError", () => {
  it("maps the envelope including field details", () => {
    const error = toApiError(422, {
      error: {
        code: "validation_failed",
        message: "The request is invalid.",
        details: [
          { field: "body.name", issue: "must not be empty" },
          { field: null, issue: "general problem" },
        ],
        request_id: "r-1",
      },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("validation_failed");
    expect(error.fieldErrors()).toEqual({ name: "must not be empty" });
    expect(error.requestId).toBe("r-1");
  });

  it("falls back to the X-Request-ID header when the envelope has no request id", () => {
    const error = toApiError(
      404,
      { error: { code: "not_found", message: "Missing" } },
      new Headers({ "X-Request-ID": "from-header" }),
    );
    expect(error.requestId).toBe("from-header");
    expect(error.details).toEqual([]);
  });

  it("returns a generic client error when a 4xx body is not an envelope", () => {
    const error = toApiError(400, "nope");
    expect(error).toMatchObject({ status: 400, code: "http_error", requestId: null });
  });
});

describe("isErrorResponse", () => {
  it.each([null, "text", {}, { error: null }, { error: { code: 1, message: "x" } }])(
    "rejects %j",
    (value) => {
      expect(isErrorResponse(value)).toBe(false);
    },
  );
});

describe("networkError", () => {
  it("keeps the original cause", () => {
    const cause = new TypeError("Failed to fetch");
    expect(networkError(cause).cause).toBe(cause);
  });
});
