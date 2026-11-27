import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Three log files, all under `logs/` (override with LOG_DIR):
 *
 *   app-YYYY-MM-DD.log  every line written that day, across every run (a new file each day)
 *   execution.log       only the latest run; emptied by global-setup.ts when a run starts
 *   error.log           every failure, from every run, kept until you delete it
 *
 * "Failure" means an error-level line: a failed test or BDD step, an HTTP 5xx, a page error,
 * a setup problem. Warnings go to the app and execution logs only.
 */
export const LOG_DIR = path.resolve(process.env.LOG_DIR ?? path.join(__dirname, '..', '..', 'logs'));
export const APP_LOG_PATTERN = 'app-%DATE%.log';
export const EXECUTION_LOG = path.join(LOG_DIR, 'execution.log');
export const ERROR_LOG = path.join(LOG_DIR, 'error.log');

/** Keys whose values are never written to logs or reports. */
const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|csrf|account_?no|ifsc/i;

export function redact(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Buffer.isBuffer(value)) return `<Buffer ${value.length} bytes>`;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE.test(k) ? '***' : redact(v, depth + 1),
      ]),
    );
  }
  return value;
}

const RESERVED = new Set(['level', 'message', 'timestamp', 'label']);

const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (RESERVED.has(key)) continue;
    (info as Record<string, unknown>)[key] = SENSITIVE.test(key) ? '***' : redact(info[key]);
  }
  return info;
});

const envName = process.env.TEST_ENV ?? 'local';
const worker = process.env.TEST_WORKER_INDEX ?? 'main';
fs.mkdirSync(LOG_DIR, { recursive: true });

const lineFormat = winston.format.printf((info) => {
  const { timestamp, level, message, label, ...meta } = info as winston.Logform.TransformableInfo &
    Record<string, unknown>;
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const tag = label ? `[${String(label)}] ` : '';
  return `${String(timestamp)} [${envName}/w${worker}] ${String(level).toUpperCase().padEnd(5)} ${tag}${String(message)}${extra}`;
});

const level = process.env.LOG_LEVEL ?? 'info';

/** Root logger: console plus the three files described above. */
export const rootLogger = winston.createLogger({
  level,
  format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), redactFormat()),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), lineFormat),
      silent: process.env.LOG_CONSOLE === 'false',
    }),
    // 1. App log: one file per day, appended to by every run that day.
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: APP_LOG_PATTERN,
      datePattern: 'YYYY-MM-DD',
      maxFiles: process.env.LOG_RETENTION ?? '30d',
      format: lineFormat,
    }),
    // 2. Execution log: appended during a run, emptied once at the start of the next (global-setup.ts).
    new winston.transports.File({ filename: EXECUTION_LOG, options: { flags: 'a' }, format: lineFormat }),
    // 3. Error log: failures only, never reset; rolls over at 10 MB and keeps 10 files.
    new winston.transports.File({
      filename: ERROR_LOG,
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
      options: { flags: 'a' },
      format: lineFormat,
    }),
  ],
});

/** A logger tagged with a module name, e.g. getLogger('http'). */
export const getLogger = (label: string): winston.Logger => rootLogger.child({ label });

/** Called once per run (global-setup) so execution.log only ever holds the latest run. */
export function resetExecutionLog(): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(EXECUTION_LOG, '');
}

/** Collects every log line written during one test so it can be attached to the report. */
export class TestLogCapture {
  private readonly lines: string[] = [];
  private readonly transport: winston.transport;

  constructor() {
    const sink = new Writable({
      write: (chunk, _encoding, done) => {
        this.lines.push(String(chunk).trimEnd());
        done();
      },
    });
    this.transport = new winston.transports.Stream({ stream: sink, format: lineFormat });
    rootLogger.add(this.transport);
  }

  text(): string {
    return this.lines.join('\n');
  }

  stop(): void {
    rootLogger.remove(this.transport);
  }
}
