// ESLint flat config. Enforces docs/04: layering (app -> features -> shared), features only via
// index.ts, no backend imports, no hand-written fetch to the API, a11y, strict TypeScript.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";
import jsxA11y from "eslint-plugin-jsx-a11y";

const restrictedImports = {
  patterns: [
    {
      group: ["**/backend/**", "../backend*", "../../backend*"],
      message: "The frontend never imports backend code. Use the generated API client.",
    },
    {
      group: ["@/shared/api-client/generated/*"],
      message: "Import contract types from '@/shared/api-client', not the generated file.",
    },
  ],
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "src/shared/api-client/generated/**",
  ]),

  // Accessibility: the full recommended rule set (plugin already registered by next's config).
  { files: ["**/*.{ts,tsx}"], rules: jsxA11y.flatConfigs.recommended.rules },

  // Strict TypeScript (docs/04 "TypeScript rules"), type-aware.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-expect-error": "allow-with-description" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "react/no-danger": "error",
      "no-console": ["error", { allow: ["error", "warn"] }],
      "no-restricted-imports": ["error", restrictedImports],
    },
  },

  // Architecture boundaries.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": [
        { type: "app", pattern: "src/app" },
        { type: "feature", pattern: "src/features/*", capture: ["featureName"] },
        { type: "shared", pattern: "src/shared" },
        { type: "test-support", pattern: "src/test" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: { to: { element: { types: ["app", "shared"] } } },
            },
            {
              // Routes compose features through their public index.ts only.
              from: { element: { type: "app" } },
              allow: { to: { element: { type: "feature", internalPath: "index.ts" } } },
            },
            {
              from: { element: { type: "feature" } },
              allow: { to: { element: { type: "shared" } } },
            },
            {
              // A feature may use another feature only through that feature's index.ts.
              from: { element: { type: "feature" } },
              allow: { to: { element: { type: "feature", internalPath: "index.ts" } } },
            },
            {
              from: { element: { type: "shared" } },
              allow: { to: { element: { type: "shared" } } },
            },
            {
              // Test support (MSW handlers) may read shared contract types.
              from: { element: { type: "test-support" } },
              allow: { to: { element: { types: ["shared", "test-support"] } } },
            },
            {
              // Co-located tests may use test support.
              from: { file: { categories: "test" } },
              allow: { to: { element: { type: "test-support" } } },
            },
          ],
        },
      ],
    },
  },
  {
    settings: { "boundaries/files": [{ pattern: "**/*.test.{ts,tsx}", category: "test" }] },
  },

  // Only the shared API client may perform network calls to the backend.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/shared/api-client/**", "src/test/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "Use the generated API client (@/shared/api-client) and a feature hook.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='window'][callee.property.name='fetch']",
          message: "Use the generated API client (@/shared/api-client) and a feature hook.",
        },
      ],
    },
  },

  // Config files run in Node and are not part of the typed project.
  {
    files: ["*.{js,mjs,cjs,ts,mts}", "scripts/**"],
    languageOptions: { parserOptions: { projectService: false } },
    rules: { "@typescript-eslint/switch-exhaustiveness-check": "off" },
  },
]);
