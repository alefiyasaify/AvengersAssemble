import { ApiResult, itemsOf, mustOk } from './http-client';
import { Session } from './session';

export interface PolicyRule {
  code: string;
  type: string;
  outcome: string;
  active?: boolean;
  category?: string | null;
  force_level?: number | null;
  severity?: string;
  message_template: string;
  params: Record<string, any>;
}
export interface PolicyVersion {
  id: string;
  version_no: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  rules: PolicyRule[];
}
export interface AppConfig {
  auto_approve_max_total_paise: number;
  sample_audit_rate: number;
  timezone: string;
  imps_max_paise: number;
  delegation_max_days: number;
}
export interface Level {
  level_no: number;
  role: string;
  min_amount_paise_exclusive: number;
  active?: boolean;
}

/**
 * Policy, configuration and approval-level administration as the finance head.
 * Every `with*` helper restores the original value afterwards (even when the test fails), because
 * these settings are global and other tests rely on the seeded defaults.
 */
export class ConfigAdmin {
  constructor(private readonly head: Session) {}

  async active(): Promise<PolicyVersion> {
    return mustOk(await this.head.http.get<PolicyVersion>('/api/v1/policy/active'), 'active policy');
  }

  async versions(): Promise<PolicyVersion[]> {
    return itemsOf<PolicyVersion>(mustOk(await this.head.http.get('/api/v1/admin/policy/versions'), 'policy versions'));
  }

  createDraftRaw(rules?: PolicyRule[], notes?: string): Promise<ApiResult<PolicyVersion>> {
    return this.head.http.post('/api/v1/admin/policy/versions', { rules, notes });
  }

  publishRaw(id: string): Promise<ApiResult<PolicyVersion>> {
    return this.head.http.post(`/api/v1/admin/policy/versions/${id}/publish`);
  }

  /** Creates a draft with these rules and publishes it. */
  async publish(rules: PolicyRule[], notes = 'QA automated change'): Promise<PolicyVersion> {
    const draft = mustOk(await this.createDraftRaw(rules, notes), 'create policy draft');
    return mustOk(await this.publishRaw(draft.id), 'publish policy');
  }

  /** Publishes a modified copy of the active rules while `fn` runs, then republishes the original rules. */
  async withPolicy<T>(mutate: (rules: PolicyRule[]) => PolicyRule[], fn: (version: PolicyVersion) => Promise<T>): Promise<T> {
    const original = await this.active();
    const changed = await this.publish(mutate(structuredClone(original.rules)), 'QA automated change');
    try {
      return await fn(changed);
    } finally {
      await this.publish(original.rules, 'QA restore');
    }
  }

  config(): Promise<ApiResult<AppConfig>> {
    return this.head.http.get('/api/v1/admin/config');
  }

  async withConfig<T>(change: Partial<AppConfig>, fn: () => Promise<T>): Promise<T> {
    const before = mustOk(await this.config(), 'read config');
    mustOk(await this.head.http.put('/api/v1/admin/config', change), 'change config');
    try {
      return await fn();
    } finally {
      await this.head.http.put('/api/v1/admin/config', before);
    }
  }

  levels(): Promise<ApiResult<Level[]>> {
    return this.head.http.get('/api/v1/admin/approval-levels');
  }

  async withLevels<T>(mutate: (levels: Level[]) => Level[], fn: () => Promise<T>): Promise<T> {
    const before = mustOk(await this.levels(), 'read levels');
    mustOk(await this.head.http.put('/api/v1/admin/approval-levels', { levels: mutate(structuredClone(before)) }), 'change levels');
    try {
      return await fn();
    } finally {
      await this.head.http.put('/api/v1/admin/approval-levels', { levels: before });
    }
  }
}
