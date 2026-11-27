import "server-only";

import { parseServerEnv, type ServerEnv } from "./env";

/** Server-only configuration. Importing this from a client component fails the build. */
export const serverEnv: ServerEnv = parseServerEnv({
  APP_ENV: process.env.APP_ENV,
  BACKEND_INTERNAL_URL: process.env.BACKEND_INTERNAL_URL,
});
