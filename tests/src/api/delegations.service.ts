import { ApiResult, HttpClient, itemsOf, mustOk } from './http-client';
import { Delegation } from './types';

export class DelegationsService {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<Delegation[]> {
    return itemsOf<Delegation>(mustOk(await this.http.get('/api/v1/delegations'), 'list delegations'));
  }

  /** Revokes every active delegation of this user (keeps tests independent). */
  async clear(): Promise<void> {
    for (const d of await this.list()) {
      if (d.is_active) await this.http.delete(`/api/v1/delegations/${d.id}`);
    }
  }

  createRaw(delegateId: string, levelNo: number, startsAt: Date, endsAt: Date): Promise<ApiResult<Delegation>> {
    return this.http.post('/api/v1/delegations', {
      delegate_id: delegateId,
      level_no: levelNo,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    });
  }

  /** Delegation that started a minute ago and lasts `hours` hours. */
  async create(delegateId: string, levelNo: number, hours = 24): Promise<Delegation> {
    const now = Date.now();
    return mustOk(await this.createRaw(delegateId, levelNo, new Date(now - 60_000), new Date(now + hours * 3_600_000)), 'create delegation');
  }

  async remove(id: string): Promise<void> {
    await this.http.delete(`/api/v1/delegations/${id}`);
  }
}
