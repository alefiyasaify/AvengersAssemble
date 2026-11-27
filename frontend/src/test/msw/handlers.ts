import { http, HttpResponse } from "msw/http";

import type { components } from "@/shared/api-client";

type Schemas = components["schemas"];

/** Mocks typed against the generated contract: a backend schema change breaks these at compile time. */
export const API_ORIGIN = "http://localhost:3000";

export const fixtures = {
  ready: { status: "ok", checks: { database: "ok" } } satisfies Schemas["ReadyRead"],
  version: { version: "0.1.0", commit: "abc1234" } satisfies Schemas["VersionRead"],
  dbUnavailable: {
    error: {
      code: "database_unavailable",
      message: "The database is not reachable.",
      details: [],
      request_id: "req-123",
    },
  } satisfies Schemas["ErrorResponse"],
};

export const handlers = [
  http.get(`${API_ORIGIN}/api/v1/health/ready`, () => HttpResponse.json(fixtures.ready)),
  http.get(`${API_ORIGIN}/api/v1/health/live`, () =>
    HttpResponse.json({ status: "ok" } satisfies Schemas["LiveRead"]),
  ),
  http.get(`${API_ORIGIN}/api/v1/version`, () => HttpResponse.json(fixtures.version)),
];
