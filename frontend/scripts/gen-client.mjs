// Generates TypeScript types for the API from the backend contract (docs/02 "Spec lifecycle").
//
//   pnpm gen:client          write src/shared/api-client/generated/schema.ts
//   pnpm gen:client --check  exit 1 if the committed file differs (CI drift check)
//
// The output is deterministic: same openapi.json -> byte-identical file.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = resolve(root, "../backend/openapi.json");
const outPath = resolve(root, "src/shared/api-client/generated/schema.ts");

const HEADER = `/**
 * GENERATED - DO NOT EDIT.
 * Source: backend/openapi.json (regenerate with \`pnpm gen:client\` or \`make gen-client\`).
 * Hand edits are overwritten and fail the CI drift check.
 */

`;

async function generate() {
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  const ast = await openapiTS(spec, { alphabetize: true, exportType: true });
  return HEADER + astToString(ast).replace(/\r\n/g, "\n");
}

const check = process.argv.includes("--check");
const content = await generate();

if (check) {
  const current = await readFile(outPath, "utf8").catch(() => "");
  if (current !== content) {
    console.error(
      `${outPath} is out of date with backend/openapi.json.\nRun \`pnpm gen:client\` (or \`make gen-client\`) and commit the result.`,
    );
    process.exit(1);
  }
  console.log("Generated API client is in sync with backend/openapi.json.");
} else {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, content, "utf8");
  console.log(`Wrote ${outPath}`);
}
