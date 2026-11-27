import { ApiResult, HttpClient, itemsOf, mustOk } from './http-client';
import { Claim, LineInput } from './types';

let cityIds: Promise<Map<string, string>> | undefined;

export class ClaimsService {
  constructor(private readonly http: HttpClient) {}

  /** City name -> id (cities are reference data, so one lookup per worker is enough). */
  async cityId(name: string): Promise<string> {
    cityIds ??= this.http.get('/api/v1/cities').then((r) => {
      const cities = itemsOf<{ id: string; name: string }>(mustOk(r, 'GET /cities'));
      return new Map(cities.map((c) => [c.name.toLowerCase(), c.id]));
    });
    const id = (await cityIds).get(name.toLowerCase());
    if (!id) throw new Error(`City "${name}" is not in the seeded cities (GET /cities). Set EF_CITY_TIER1 / EF_CITY_OTHER.`);
    return id;
  }

  async uploadReceipt(buffer: Buffer, name = 'receipt.png'): Promise<{ id: string; sha256: string }> {
    return mustOk(await this.uploadReceiptRaw(buffer, name, 'image/png'), 'upload receipt');
  }

  uploadReceiptRaw(buffer: Buffer, name: string, mimeType: string): Promise<ApiResult<{ id: string; sha256: string }>> {
    return this.http.request('POST', '/api/v1/receipts', { multipart: { file: { name, mimeType, buffer } } });
  }

  receiptFileRaw(receiptId: string): Promise<ApiResult<string>> {
    return this.http.get(`/api/v1/receipts/${receiptId}/file`);
  }

  async get(id: string): Promise<Claim> {
    return mustOk(await this.getRaw(id), `get claim ${id}`);
  }

  getRaw(id: string): Promise<ApiResult<Claim>> {
    return this.http.get(`/api/v1/claims/${id}`);
  }

  /** LineInput -> the LineCreate body (uploads the receipt first when there is one). */
  async lineBody(line: LineInput): Promise<Record<string, unknown>> {
    const receipt = line.receipt ? await this.uploadReceipt(line.receipt) : undefined;
    return {
      category: line.category,
      description: line.description,
      vendor: line.vendor,
      amount_paise: line.amountPaise,
      expense_date: line.date,
      city_id: line.city ? await this.cityId(line.city) : undefined,
      nights: line.nights ?? 1,
      receipt_id: receipt?.id,
    };
  }

  async createDraft(title: string, lines: LineInput[] = []): Promise<Claim> {
    const body = { title, lines: await Promise.all(lines.map((l) => this.lineBody(l))) };
    return mustOk(await this.http.post<Claim>('/api/v1/claims', body), 'create claim');
  }

  async addLine(claimId: string, line: LineInput): Promise<Claim> {
    const claim = await this.get(claimId);
    const body = { ...(await this.lineBody(line)), expected_version: claim.version };
    return mustOk(await this.http.post<Claim>(`/api/v1/claims/${claimId}/lines`, body), 'add line');
  }

  patchLineRaw(claimId: string, lineId: string, expectedVersion: number, data: Record<string, unknown>): Promise<ApiResult<Claim>> {
    return this.http.patch(`/api/v1/claims/${claimId}/lines/${lineId}`, { ...data, expected_version: expectedVersion });
  }

  async editLineAmount(claimId: string, lineId: string, amountPaise: number): Promise<Claim> {
    const claim = await this.get(claimId);
    return mustOk(await this.patchLineRaw(claimId, lineId, claim.version, { amount_paise: amountPaise }), 'edit line');
  }

  async submit(claimId: string): Promise<Claim> {
    const claim = await this.get(claimId);
    return mustOk(await this.submitRaw(claimId, claim.version), 'submit claim');
  }

  submitRaw(claimId: string, expectedVersion: number): Promise<ApiResult<Claim>> {
    return this.http.post(`/api/v1/claims/${claimId}/submit`, { expected_version: expectedVersion });
  }

  async createAndSubmit(title: string, lines: LineInput[]): Promise<Claim> {
    const draft = await this.createDraft(title, lines);
    return mustOk(await this.submitRaw(draft.id, draft.version), 'submit claim');
  }

  async resubmit(claimId: string): Promise<Claim> {
    const claim = await this.get(claimId);
    return mustOk(await this.http.post<Claim>(`/api/v1/claims/${claimId}/resubmit`, { expected_version: claim.version }), 'resubmit');
  }

  async withdraw(claimId: string): Promise<Claim> {
    const claim = await this.get(claimId);
    return mustOk(await this.http.post<Claim>(`/api/v1/claims/${claimId}/withdraw`, { expected_version: claim.version }), 'withdraw');
  }

  previewRaw(claimId: string): Promise<ApiResult<{ outcome: string; payable_paise: number }>> {
    return this.http.post(`/api/v1/claims/${claimId}/policy-preview`);
  }

  async timeline(claimId: string): Promise<Array<{ action: string; actor_name: string; on_behalf_of_name: string | null }>> {
    return itemsOf(mustOk(await this.http.get(`/api/v1/claims/${claimId}/timeline`), 'timeline'));
  }

  list(query?: Record<string, string | number | boolean>): Promise<ApiResult<{ items: Claim[] }>> {
    return this.http.get('/api/v1/claims', query);
  }
}
