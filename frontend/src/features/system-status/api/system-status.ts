import { apiClient, unwrap, type ApiClient } from "@/shared/api-client";

import type { Readiness, VersionInfo } from "../types";

/** GET /api/v1/health/ready (operationId `health_get_ready`). Throws ApiError (503) if DB is down. */
export function fetchReadiness(client: ApiClient = apiClient): Promise<Readiness> {
  return unwrap(client.GET("/api/v1/health/ready"));
}

/** GET /api/v1/version (operationId `health_get_version`). */
export function fetchVersion(client: ApiClient = apiClient): Promise<VersionInfo> {
  return unwrap(client.GET("/api/v1/version"));
}
