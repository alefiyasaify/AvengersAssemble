import type { NextConfig } from "next";

import { parseServerEnv } from "./src/shared/config/env";

// Validated at build/start. NOTE: rewrite destinations are fixed when `next build` runs, so
// BACKEND_INTERNAL_URL must be set at BUILD time (Docker build arg) - see ADR-0004 / docs/08.
const { APP_ENV, BACKEND_INTERNAL_URL } = parseServerEnv({
  APP_ENV: process.env.APP_ENV,
  BACKEND_INTERNAL_URL: process.env.BACKEND_INTERNAL_URL,
});

const isDev = process.env.NODE_ENV === "development";
// HTTPS-only headers; never on plain-HTTP local/test stacks. Headers are also fixed at build time.
const isProd = APP_ENV === "staging" || APP_ENV === "production";

// CSP without nonces (keeps pages statically renderable). 'unsafe-inline' for scripts is needed
// by Next.js inline bootstrapping; tightening to nonces is tracked in ACTIONS.md (AI-007).
// connect-src 'self' works because the browser only ever calls its own origin (/api proxy).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    // Same-origin API proxy (ADR-0004): the browser calls /api/*, Next.js forwards to FastAPI.
    return [{ source: "/api/:path*", destination: `${BACKEND_INTERNAL_URL}/api/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
