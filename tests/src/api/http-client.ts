import { APIRequestContext, request } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { EnvConfig, Persona } from '../../config/environments';
import { getLogger, redact } from '../core/logger';

const log = getLogger('http');

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiResult<T = any> {
  status: number;
  ok: boolean;
  body: T;
  text: string;
  ms: number;
  headers: Record<string, string>;
}

export interface RequestOptions {
  data?: unknown;
  multipart?: Record<string, string | number | boolean | { name: string; mimeType: string; buffer: Buffer }>;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

/** Throws with the response text when a call that must succeed does not. */
export function mustOk<T>(result: ApiResult<T>, what: string): T {
  if (!result.ok) throw new Error(`${what} failed: HTTP ${result.status} ${result.text.slice(0, 400)}`);
  return result.body;
}

/** Cookie-authenticated client. Adds CSRF + Idempotency-Key on writes, refreshes the session on 401, logs every call. */
export class HttpClient {
  private constructor(
    private readonly ctx: APIRequestContext,
    private readonly env: EnvConfig,
    readonly persona?: Persona,
  ) {}

  static async anonymous(env: EnvConfig): Promise<HttpClient> {
    return new HttpClient(await request.newContext({ baseURL: env.apiUrl }), env);
  }

  static async login(env: EnvConfig, persona: Persona): Promise<HttpClient> {
    if (!persona.password) {
      throw new Error(`No password for ${persona.role}. Set EF_${persona.role.toUpperCase()}_PASSWORD or EF_DEMO_PASSWORD.`);
    }
    const client = new HttpClient(await request.newContext({ baseURL: env.apiUrl }), env, persona);
    // Sign-in is rate limited per client (30 a minute): wait out a 429 instead of failing the run.
    let res = await client.request('POST', '/api/v1/auth/login', { data: { email: persona.email, password: persona.password } });
    for (let attempt = 0; res.status === 429 && attempt < 3; attempt++) {
      log.warn('sign-in rate limited, waiting 20 s', { role: persona.role, attempt: attempt + 1 });
      await new Promise((r) => setTimeout(r, 20_000));
      res = await client.request('POST', '/api/v1/auth/login', { data: { email: persona.email, password: persona.password } });
    }
    if (!res.ok) {
      log.error(`login failed for ${persona.role}`, { email: persona.email, status: res.status, response: res.text.slice(0, 200) });
      throw new Error(`login failed for ${persona.email}: HTTP ${res.status} ${res.text.slice(0, 200)}`);
    }
    log.info(`logged in as ${persona.role}`, { email: persona.email });
    return client;
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  /** Browser storage (cookies) of this session, to start a signed-in browser context. */
  storageState() {
    return this.ctx.storageState();
  }

  private async csrfValue(): Promise<string | undefined> {
    const state = await this.ctx.storageState();
    return state.cookies.find((c) => c.name === this.env.csrfCookie)?.value;
  }

  private async send(method: Method, url: string, opts: RequestOptions) {
    const headers: Record<string, string> = { ...opts.headers };
    if (method !== 'GET') {
      headers['Idempotency-Key'] = opts.idempotencyKey ?? randomUUID();
      const csrf = await this.csrfValue();
      if (csrf) headers[this.env.csrfHeader] = csrf;
    }
    return this.ctx.fetch(url, {
      method,
      headers,
      data: opts.data as Record<string, unknown> | undefined,
      multipart: opts.multipart,
      params: opts.query,
    });
  }

  async request<T = any>(method: Method, url: string, opts: RequestOptions = {}): Promise<ApiResult<T>> {
    const started = Date.now();
    let res = await this.send(method, url, opts);
    // The access cookie lives 15 minutes; refresh once and retry (like the frontend client does).
    if (res.status() === 401 && this.persona && !url.includes('/auth/')) {
      const refreshed = await this.send('POST', '/api/v1/auth/refresh', {});
      if (refreshed.ok()) res = await this.send(method, url, opts);
      else log.warn('session refresh failed', { role: this.persona.role, status: refreshed.status() });
    }
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body such as CSV or Prometheus text */
    }
    const ms = Date.now() - started;
    const line = `${this.persona?.role ?? 'anonymous'} ${method} ${url} -> ${res.status()} (${ms} ms)`;
    if (res.status() >= 500) log.error(line, { response: text.slice(0, 500), requestId: res.headers()['x-request-id'] });
    else log.info(line);
    log.debug('exchange', { request: redact(opts.data), response: redact(body) });
    return { status: res.status(), ok: res.ok(), body: body as T, text, ms, headers: res.headers() };
  }

  get<T = any>(url: string, query?: RequestOptions['query']): Promise<ApiResult<T>> {
    return this.request<T>('GET', url, { query });
  }
  post<T = any>(url: string, data?: unknown, extra: RequestOptions = {}): Promise<ApiResult<T>> {
    return this.request<T>('POST', url, { ...extra, data });
  }
  patch<T = any>(url: string, data?: unknown): Promise<ApiResult<T>> {
    return this.request<T>('PATCH', url, { data });
  }
  put<T = any>(url: string, data?: unknown): Promise<ApiResult<T>> {
    return this.request<T>('PUT', url, { data });
  }
  delete<T = any>(url: string): Promise<ApiResult<T>> {
    return this.request<T>('DELETE', url);
  }
}

/** Accepts either a bare array or the {items, next_cursor} envelope. */
export const itemsOf = <T>(body: unknown): T[] =>
  Array.isArray(body) ? (body as T[]) : (((body as { items?: T[] } | null)?.items ?? []) as T[]);
