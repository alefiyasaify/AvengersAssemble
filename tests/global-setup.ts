import { getEnv } from './config/environments';
import { provisionPersonas } from './src/api/session';
import { resetExecutionLog, rootLogger } from './src/core/logger';

/** Runs once, before any worker starts. */
export default async function globalSetup(): Promise<void> {
  resetExecutionLog(); // execution.log keeps only the latest run
  const env = getEnv();
  rootLogger.info('=== Execution started ===', {
    environment: env.name,
    baseUrl: env.baseUrl,
    apiUrl: env.apiUrl,
    readOnly: env.readOnly,
    node: process.version,
  });
  // Create the QA employees and managers once; workers inherit them through process.env.
  // Read-only environments and runs without credentials skip this (only @readonly tests run there).
  if (!env.readOnly && env.personas.head?.password) {
    try {
      const head = await provisionPersonas(env);
      await head.http.dispose();
    } catch (e) {
      rootLogger.error('global setup could not provision the QA users', { error: String(e) });
      throw e;
    }
  }
}
