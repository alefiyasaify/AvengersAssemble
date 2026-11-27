import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:3000" } },
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/features/_template/**", "node_modules/**"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/features/**", "src/shared/**"],
      exclude: [
        "src/features/_template/**",
        "src/shared/api-client/generated/**",
        "**/index.ts",
        "**/*.test.{ts,tsx}",
        // server-only modules are exercised by the build and E2E, not jsdom.
        "src/shared/config/server-env.ts",
        "src/shared/api-client/server-client.ts",
      ],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
      reporter: ["text", "html", "lcov"],
    },
  },
});
