import { ApiResult, HttpClient, itemsOf, mustOk } from './http-client';
import { BulkResult, Claim } from './types';

interface SampleAudit {
  id: string;
  claim_id: string;
  status: string;
}

export class ReviewService {
  constructor(private readonly http: HttpClient) {}

  queueRaw(query?: Record<string, string | number | boolean>): Promise<ApiResult<{ items: Claim[] }>> {
    return this.http.get('/api/v1/review-queue', query);
  }

  /** Items carry the version each claim was read at (optimistic locking). */
  bulkApproveRaw(items: Array<{ claim_id: string; expected_version: number }>, comment?: string): Promise<ApiResult<BulkResult>> {
    return this.http.post('/api/v1/review-queue/bulk-approve', { items, comment });
  }

  sampleAuditsRaw(status?: string): Promise<ApiResult<{ items: SampleAudit[] }>> {
    return this.http.get('/api/v1/sample-audits', { limit: 100, ...(status ? { status } : {}) });
  }

  async sampleAudits(status?: string): Promise<SampleAudit[]> {
    return itemsOf<SampleAudit>(mustOk(await this.sampleAuditsRaw(status), 'sample audits'));
  }

  resolveSampleRaw(sampleId: string, result: 'PASSED' | 'FAILED', note?: string): Promise<ApiResult<unknown>> {
    return this.http.post(`/api/v1/sample-audits/${sampleId}/resolve`, { result, note });
  }
}
