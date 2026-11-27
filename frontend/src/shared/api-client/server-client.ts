import "server-only";

import { serverEnv } from "@/shared/config/server-env";

import { createApiClient } from "./client";

/**
 * API client for Server Components / Route Handlers. Relative URLs do not exist on the server,
 * so it calls the backend directly at BACKEND_INTERNAL_URL - same contract, same generated types.
 * Forward the user's cookies explicitly when auth exists (ADR-0006).
 */
export const serverApiClient = createApiClient(serverEnv.BACKEND_INTERNAL_URL);
