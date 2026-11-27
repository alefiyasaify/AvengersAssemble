import { apiClient, unwrap, type ApiClient } from "@/shared/api-client";

import type { Example } from "../types";

// Replace the path with the feature's endpoint. Paths and bodies are type-checked against the spec.
export function fetchExample(client: ApiClient = apiClient): Promise<Example> {
  return unwrap(client.GET("/api/v1/version"));
}
