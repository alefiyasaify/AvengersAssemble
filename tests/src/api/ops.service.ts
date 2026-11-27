import { ApiResult, HttpClient, mustOk } from './http-client';
import { Me } from './types';

export class OpsService {
  constructor(private readonly http: HttpClient) {}

  health(): Promise<ApiResult<unknown>> {
    return this.http.get('/healthz');
  }
  ready(): Promise<ApiResult<{ status: string; checks: Record<string, string> }>> {
    return this.http.get('/readyz');
  }
  version(): Promise<ApiResult<unknown>> {
    return this.http.get('/api/v1/version');
  }
  async me(): Promise<Me> {
    return mustOk(await this.http.get<Me>('/api/v1/me'), 'GET /me');
  }
  dashboardRaw(): Promise<ApiResult<{ scope: string }>> {
    return this.http.get('/api/v1/dashboard/summary');
  }
  policyRaw(): Promise<ApiResult<unknown>> {
    return this.http.get('/api/v1/policy/active');
  }
}
