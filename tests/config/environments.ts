/**
 * One place for everything that changes between environments.
 * Select with TEST_ENV=local|qa|staging|demo (default: local).
 * Values come from env/<name>.env (copy the .example file) or real environment variables.
 *
 * Personas
 *  - `auditor` and `head` are seeded users: set their password (EF_DEMO_PASSWORD or EF_<ROLE>_PASSWORD).
 *  - `employee`, `employee2`, `manager`, `manager2`, `delegate` are PROVISIONED at the start of a run
 *    through the finance head's admin API, so the reporting lines the tests need are guaranteed
 *    (the seed does not link its demo employee to its demo manager). Set EF_<ROLE>_EMAIL AND a
 *    password to use an existing account instead.
 */
export type EnvName = 'local' | 'qa' | 'staging' | 'demo';
export type SeededRole = 'auditor' | 'head';
export type ProvisionedRole = 'employee' | 'employee2' | 'manager' | 'manager2' | 'delegate';
export type Role = SeededRole | ProvisionedRole;

export interface Persona {
  role: Role;
  email: string;
  password: string;
  /** Display name, used to check audit entries. */
  name: string;
}

export interface EnvConfig {
  name: EnvName;
  baseUrl: string;
  apiUrl: string;
  /** Backend origin for the root probes /healthz and /readyz (the frontend origin serves its own page there). Empty = skip those probes. */
  backendUrl: string;
  /** When true only tests tagged @readonly run (for prod-like environments). */
  readOnly: boolean;
  csrfCookie: string;
  csrfHeader: string;
  /** City names must exist in the seeded city table (GET /cities). */
  cities: { tier1: string; other: string };
  /** Test dates start this many days back, older than the seeded history window. */
  isolationBaseDays: number;
  /** Seeded personas, plus explicit overrides for provisioned ones. */
  personas: Partial<Record<Role, Persona>>;
  /** Password given to provisioned users (random per run when empty). */
  provisionedPassword: string;
}

const ENV_NAMES: EnvName[] = ['local', 'qa', 'staging', 'demo'];

const DEFAULT_URL: Record<EnvName, string> = {
  local: 'http://localhost:3000',
  qa: 'https://qa.expenseflow.example.com',
  staging: 'https://staging.expenseflow.example.com',
  demo: 'http://localhost:3000',
};

const bool = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(v.toLowerCase());

const persona = (role: Role, fallbackEmail: string | undefined, fallbackName: string): Persona | undefined => {
  const key = role.toUpperCase();
  const email = process.env[`EF_${key}_EMAIL`] ?? fallbackEmail;
  if (!email) return undefined;
  return {
    role,
    email,
    password: process.env[`EF_${key}_PASSWORD`] ?? process.env.EF_DEMO_PASSWORD ?? '',
    name: process.env[`EF_${key}_NAME`] ?? fallbackName,
  };
};

let cached: EnvConfig | undefined;

export function getEnv(): EnvConfig {
  if (cached) return cached;
  const raw = (process.env.TEST_ENV ?? 'local').toLowerCase();
  if (!ENV_NAMES.includes(raw as EnvName)) {
    throw new Error(`Unknown TEST_ENV "${raw}". Use one of: ${ENV_NAMES.join(', ')}`);
  }
  const name = raw as EnvName;
  const baseUrl = process.env.EF_BASE_URL ?? DEFAULT_URL[name];
  const personas: Partial<Record<Role, Persona>> = {};
  const add = (p: Persona | undefined): void => {
    if (p) personas[p.role] = p;
  };
  add(persona('auditor', 'auditor@expenseflow.test', 'Seeded Auditor'));
  add(persona('head', 'head@expenseflow.test', 'Seeded Finance Head'));
  // Overrides only: no fallback email, so these are provisioned unless EF_<ROLE>_EMAIL is set.
  for (const role of ['employee', 'employee2', 'manager', 'manager2', 'delegate'] as ProvisionedRole[]) {
    add(persona(role, undefined, role));
  }
  // Users created once per run by global-setup (see provisionPersonas) are shared with every worker.
  if (process.env.EF_PROVISIONED) {
    const made = JSON.parse(process.env.EF_PROVISIONED) as Partial<Record<Role, Persona>>;
    for (const [role, p] of Object.entries(made)) if (p && !personas[role as Role]) personas[role as Role] = p;
  }
  cached = {
    name,
    baseUrl,
    apiUrl: process.env.EF_API_URL ?? baseUrl,
    backendUrl: process.env.EF_BACKEND_URL ?? (name === 'local' ? 'http://localhost:8000' : ''),
    readOnly: bool(process.env.EF_READ_ONLY, false),
    csrfCookie: process.env.EF_CSRF_COOKIE ?? 'ef_csrf',
    csrfHeader: process.env.EF_CSRF_HEADER ?? 'X-CSRF-Token',
    cities: {
      tier1: process.env.EF_CITY_TIER1 ?? 'Bengaluru',
      other: process.env.EF_CITY_OTHER ?? 'Ahmedabad',
    },
    isolationBaseDays: Number(process.env.EF_ISOLATION_BASE_DAYS ?? 400),
    personas,
    provisionedPassword: process.env.EF_PROVISIONED_PASSWORD ?? '',
  };
  return cached;
}

/** Claim, line and step statuses exactly as the API returns them (backend/openapi.json). */
export const STATUS = {
  draft: 'DRAFT',
  pendingManager: 'PENDING_MANAGER',
  pendingAuditor: 'PENDING_AUDITOR',
  pendingHead: 'PENDING_HEAD',
  sentBack: 'SENT_BACK',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  withdrawn: 'WITHDRAWN',
  paid: 'PAID',
  lineAutoApproved: 'AUTO_APPROVED',
  lineNeedsApproval: 'NEEDS_APPROVAL',
  lineAutoRejected: 'AUTO_REJECTED',
} as const;

/** What the UI shows for a claim status (frontend/src/utils/statusLabels.js). */
export const STATUS_LABEL = {
  DRAFT: 'Draft',
  PENDING_MANAGER: 'With manager',
  PENDING_AUDITOR: 'With auditor',
  PENDING_HEAD: 'With finance head',
  SENT_BACK: 'Sent back',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  PAID: 'Paid',
} as const;
