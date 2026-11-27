import { ApiResult, HttpClient, itemsOf, mustOk } from './http-client';
import { Batch, EligibleClaim } from './types';

export class PayoutsService {
  constructor(private readonly http: HttpClient) {}

  eligibleRaw(): Promise<ApiResult<EligibleClaim[]>> {
    return this.http.get('/api/v1/payouts/eligible');
  }

  async eligible(): Promise<EligibleClaim[]> {
    return itemsOf<EligibleClaim>(mustOk(await this.eligibleRaw(), 'eligible payouts'));
  }

  async isEligible(claimId: string): Promise<boolean> {
    return (await this.eligible()).some((c) => c.claim_id === claimId);
  }

  createBatchRaw(claimIds: string[]): Promise<ApiResult<Batch>> {
    return this.http.post('/api/v1/payouts/batches', { claim_ids: claimIds });
  }
  async createBatch(claimIds: string[]): Promise<Batch> {
    return mustOk(await this.createBatchRaw(claimIds), 'create batch');
  }

  getRaw(batchId: string): Promise<ApiResult<Batch>> {
    return this.http.get(`/api/v1/payouts/batches/${batchId}`);
  }

  verifyRaw(batchId: string): Promise<ApiResult<Batch>> {
    return this.http.post(`/api/v1/payouts/batches/${batchId}/verify`);
  }
  async verify(batchId: string): Promise<Batch> {
    return mustOk(await this.verifyRaw(batchId), 'verify batch');
  }

  exportRaw(batchId: string): Promise<ApiResult<Batch>> {
    return this.http.post(`/api/v1/payouts/batches/${batchId}/export`);
  }
  async export(batchId: string): Promise<Batch> {
    return mustOk(await this.exportRaw(batchId), 'export batch');
  }

  async file(batchId: string): Promise<string> {
    const res = await this.http.get<string>(`/api/v1/payouts/batches/${batchId}/file`);
    mustOk(res, 'batch file');
    return res.text;
  }

  markPaidRaw(batchId: string): Promise<ApiResult<Batch>> {
    return this.http.post(`/api/v1/payouts/batches/${batchId}/mark-paid`);
  }
  async markPaid(batchId: string): Promise<Batch> {
    return mustOk(await this.markPaidRaw(batchId), 'mark paid');
  }

  cancelRaw(batchId: string): Promise<ApiResult<Batch>> {
    return this.http.post(`/api/v1/payouts/batches/${batchId}/cancel`);
  }
}
