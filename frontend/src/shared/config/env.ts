import { z } from "zod";

/**
 * Environment contract (docs/08 "Env var contract"). Validated with zod; invalid config fails fast.
 *
 * - Server variables: never sent to the browser. Read them via `server-env.ts` (server-only).
 * - Public variables: `NEXT_PUBLIC_*`, inlined into the client bundle at BUILD time. Never secrets.
 */

export const serverEnvSchema = z.object({
  /** Deployment environment. staging/production enable HSTS and upgrade-insecure-requests. */
  APP_ENV: z.enum(["local", "test", "ci", "staging", "production"]).default("local"),
  /** Where Next.js forwards `/api/*` (rewrites) and where server code calls the backend. */
  BACKEND_INTERNAL_URL: z
    .url({ protocol: /^https?$/ })
    .default("http://localhost:8000")
    .transform((url) => url.replace(/\/+$/, "")),
});

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).default("Avengers Assemble"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

function format(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid server environment: ${format(result.error)}`);
  }
  return result.data;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid public environment: ${format(result.error)}`);
  }
  return result.data;
}

/**
 * Public config. `process.env.NEXT_PUBLIC_*` must be referenced literally so Next.js can inline it.
 */
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
});
