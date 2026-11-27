import { randomBytes } from 'node:crypto';
import { EnvConfig, Persona, ProvisionedRole, Role } from '../../config/environments';
import { getLogger } from '../core/logger';
import { ApprovalsService } from './approvals.service';
import { ClaimsService } from './claims.service';
import { DelegationsService } from './delegations.service';
import { HttpClient, mustOk } from './http-client';
import { OpsService } from './ops.service';
import { PayoutsService } from './payouts.service';
import { ReviewService } from './review.service';
import { Me } from './types';

const log = getLogger('session');

/** Everything one signed-in user can do through the API. */
export class Session {
  readonly claims: ClaimsService;
  readonly approvals: ApprovalsService;
  readonly review: ReviewService;
  readonly payouts: PayoutsService;
  readonly delegations: DelegationsService;
  readonly ops: OpsService;
  private meCache?: Me;

  constructor(
    readonly http: HttpClient,
    readonly persona: Persona,
  ) {
    this.claims = new ClaimsService(http);
    this.approvals = new ApprovalsService(http, this.claims);
    this.review = new ReviewService(http);
    this.payouts = new PayoutsService(http);
    this.delegations = new DelegationsService(http);
    this.ops = new OpsService(http);
  }

  async me(): Promise<Me> {
    this.meCache ??= await this.ops.me();
    return this.meCache;
  }
}

/** Two characters per role keep employee codes unique and within the 16-character limit. */
const CODE_SUFFIX: Record<ProvisionedRole, string> = { manager: 'M1', manager2: 'M2', delegate: 'DL', employee: 'E1', employee2: 'E2' };

const PROVISIONED: Array<{ role: ProvisionedRole; label: string; userRole: 'EMPLOYEE' | 'MANAGER'; reportsTo: 'head' | 'manager' | 'manager2' }> = [
  { role: 'manager', label: 'Manager', userRole: 'MANAGER', reportsTo: 'head' },
  { role: 'manager2', label: 'Manager Two', userRole: 'MANAGER', reportsTo: 'head' },
  { role: 'delegate', label: 'Delegate', userRole: 'MANAGER', reportsTo: 'head' },
  { role: 'employee', label: 'Employee', userRole: 'EMPLOYEE', reportsTo: 'manager' },
  { role: 'employee2', label: 'Employee Two', userRole: 'EMPLOYEE', reportsTo: 'manager2' },
];

/**
 * Logs each persona in once per worker and reuses the session. Personas without an explicit
 * override are created through the finance head's admin API the first time anyone asks for one:
 * manager, manager2 and delegate report to the head; employee reports to manager; employee2 to manager2.
 */
export class SessionPool {
  private readonly cache = new Map<Role, Promise<Session>>();
  private anonymousClient?: Promise<HttpClient>;
  private provisioning?: Promise<void>;

  constructor(private readonly env: EnvConfig) {}

  get(role: Role): Promise<Session> {
    let session = this.cache.get(role);
    if (!session) {
      session = this.open(role);
      this.cache.set(role, session);
    }
    return session;
  }

  private async open(role: Role): Promise<Session> {
    let persona = this.env.personas[role];
    if (!persona) {
      await this.provision();
      persona = this.env.personas[role];
    }
    if (!persona) throw new Error(`No persona for role "${role}"`);
    return new Session(await HttpClient.login(this.env, persona), persona);
  }

  /** Fallback when global-setup did not provision (it normally does, once per run, for all workers). */
  private provision(): Promise<void> {
    this.provisioning ??= provisionPersonas(this.env, await_head(this)).then(() => undefined);
    return this.provisioning;
  }

  anonymous(): Promise<HttpClient> {
    this.anonymousClient ??= HttpClient.anonymous(this.env);
    return this.anonymousClient;
  }

  async dispose(): Promise<void> {
    for (const pending of this.cache.values()) await (await pending).http.dispose().catch(() => undefined);
    if (this.anonymousClient) await (await this.anonymousClient).dispose().catch(() => undefined);
  }
}

const await_head = (pool: SessionPool): Promise<Session> => pool.get('head');

/**
 * Creates the QA users through the finance head's admin API and records them in env.personas
 * and in process.env.EF_PROVISIONED (global-setup runs this once, so every worker reuses them).
 */
export async function provisionPersonas(env: EnvConfig, headPromise?: Promise<Session>): Promise<Session> {
  const head =
    (await headPromise) ?? new Session(await HttpClient.login(env, env.personas.head!), env.personas.head!);
  const headMe = await head.me();
  const runId = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const password = env.provisionedPassword || `Qa!${randomBytes(9).toString('base64url')}`;
  const domain = headMe.email.split('@')[1] ?? 'expenseflow.test';
  const ids: Partial<Record<'head' | ProvisionedRole, string>> = { head: headMe.id };

  for (const spec of PROVISIONED) {
    if (env.personas[spec.role]) continue; // explicit override from env
    const email = `qa.${runId}.${spec.role}@${domain}`;
    const fullName = `QA ${spec.label} ${runId}`;
    const created = mustOk(
      await head.http.post<{ id: string }>('/api/v1/admin/users', {
        email,
        full_name: fullName,
        employee_code: `QA${runId}${CODE_SUFFIX[spec.role]}`.toUpperCase().slice(0, 16),
        role: spec.userRole,
        department_id: headMe.department_id,
        manager_id: ids[spec.reportsTo],
        password,
      }),
      `create ${spec.role}`,
    );
    ids[spec.role] = created.id;
    env.personas[spec.role] = { role: spec.role, email, password, name: fullName };
    log.info(`provisioned ${spec.role}`, { email, reportsTo: spec.reportsTo });
  }
  const mine = Object.fromEntries(PROVISIONED.map((p) => [p.role, env.personas[p.role]]));
  process.env.EF_PROVISIONED = JSON.stringify(mine);
  return head;
}
