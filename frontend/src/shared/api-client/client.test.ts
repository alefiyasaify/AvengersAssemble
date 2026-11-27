import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";

import { API_ORIGIN, fixtures } from "@/test/msw/handlers";
import { server } from "@/test/msw/server";

import { ApiError } from "./api-error";
import { apiClient, createApiClient, unwrap } from "./client";

describe("unwrap", () => {
  it("returns typed data when the response is 2xx", async () => {
    await expect(unwrap(apiClient.GET("/api/v1/health/ready"))).resolves.toEqual(fixtures.ready);
  });

  it("throws an ApiError mapped from the error envelope when the response is non-2xx", async () => {
    server.use(
      http.get(`${API_ORIGIN}/api/v1/health/ready`, () =>
        HttpResponse.json(fixtures.dbUnavailable, { status: 503 }),
      ),
    );
    const error = await unwrap(apiClient.GET("/api/v1/health/ready")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 503,
      code: "database_unavailable",
      requestId: "req-123",
    });
  });

  it("throws a generic upstream ApiError when the proxy returns a non-envelope 5xx", async () => {
    server.use(
      http.get(`${API_ORIGIN}/api/v1/version`, () =>
        HttpResponse.text("Internal Server Error", {
          status: 500,
          headers: { "X-Request-ID": "hdr-1" },
        }),
      ),
    );
    const error = await unwrap(apiClient.GET("/api/v1/version")).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 500, code: "upstream_unavailable", requestId: "hdr-1" });
  });

  it("throws a network ApiError when the request never reaches the server", async () => {
    server.use(http.get(`${API_ORIGIN}/api/v1/version`, () => HttpResponse.error()));
    const error = await unwrap(apiClient.GET("/api/v1/version")).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: "network_error" });
  });

  it("sends requests to the configured origin when a base URL is given", async () => {
    server.use(
      http.get("http://backend.test/api/v1/version", () => HttpResponse.json(fixtures.version)),
    );
    const client = createApiClient("http://backend.test");
    await expect(unwrap(client.GET("/api/v1/version"))).resolves.toEqual(fixtures.version);
  });
});
