import {
  API_VERSION_PREFIX,
  apiErrorResponseSchema,
  LingoLiveError,
  type AppendSegmentRequest,
  type ApiErrorCode,
  type AuthTokenResponse,
  type BusinessJoinRequest,
  type BusinessJoinResponse,
  type BusinessSessionPreview,
  type ConfigResponse,
  type CreateSessionRequest,
  type DeleteMeResponse,
  type HistoryResponse,
  type MeResponse,
  type RegisterDeviceRequest,
  type SaveSessionRequest,
  type SegmentsResponse,
  type SessionResponse,
  type TranscriptionTokenRequest,
  type TranscriptionTokenResponse,
  type UpdateMeRequest,
  type UsageResponse,
} from '@lingolive/contracts';

/**
 * @lingolive/api-client — one typed client used by the web app, the mobile app
 * and the integration tests.
 *
 * It is built on `fetch` (available natively in Node 22, modern browsers and
 * React Native) with no HTTP library, so it adds nothing to the mobile bundle.
 */

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current access token, or null for an unauthenticated call. */
  getToken?: () => string | null | Promise<string | null>;
  /** Called once when the server rejects the token, so the app can re-auth. */
  onUnauthorized?: () => void;
  fetchFn?: typeof fetch;
  defaultTimeoutMs?: number;
  /** Extra headers, e.g. the admin token in the operator console. */
  headers?: Record<string, string>;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Skip attaching the auth token (used by public endpoints). */
  anonymous?: boolean;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  // --- generic ------------------------------------------------------------

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${API_VERSION_PREFIX}${path}`;
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...this.options.headers,
      ...options.headers,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';

    if (!options.anonymous && this.options.getToken) {
      const token = await this.options.getToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }

    const timeoutMs = options.timeoutMs ?? this.options.defaultTimeoutMs ?? 15_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // Honour a caller-supplied signal in addition to the timeout.
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await this.fetchFn(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 204) return undefined as T;

      const text = await response.text();
      const payload: unknown = text ? safeJsonParse(text) : null;

      if (!response.ok) {
        if (response.status === 401) this.options.onUnauthorized?.();
        throw toLingoLiveError(payload, response.status);
      }

      return payload as T;
    } catch (error) {
      if (error instanceof LingoLiveError) throw error;
      if (isAbortError(error)) {
        throw new LingoLiveError('UPSTREAM_TIMEOUT', 'The request timed out', { status: 504 });
      }
      // The request never got an answer: DNS, TLS, CORS or a wrong base URL.
      // Reporting this as SERVICE_UNAVAILABLE blamed a server that may be
      // perfectly healthy, and sent whoever was debugging to the wrong place.
      throw new LingoLiveError('NETWORK_UNAVAILABLE', 'Could not reach the LingoLive API', {
        status: 503,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }
  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  // --- identity -----------------------------------------------------------

  registerDevice(body: RegisterDeviceRequest): Promise<AuthTokenResponse> {
    return this.post<AuthTokenResponse>('/auth/guest', body, { anonymous: true });
  }

  me(): Promise<MeResponse> {
    return this.get<MeResponse>('/me');
  }

  updateMe(body: UpdateMeRequest): Promise<MeResponse> {
    return this.patch<MeResponse>('/me', body);
  }

  deleteMe(): Promise<DeleteMeResponse> {
    return this.delete<DeleteMeResponse>('/me');
  }

  // --- sessions -----------------------------------------------------------

  createSession(body: CreateSessionRequest): Promise<SessionResponse> {
    return this.post<SessionResponse>('/sessions', body);
  }

  getSession(id: string): Promise<SessionResponse> {
    return this.get<SessionResponse>(`/sessions/${encodeURIComponent(id)}`);
  }

  endSession(id: string, reportedAudioSeconds?: number): Promise<SessionResponse> {
    return this.post<SessionResponse>(`/sessions/${encodeURIComponent(id)}/end`, {
      reportedAudioSeconds,
    });
  }

  saveSession(id: string, body: SaveSessionRequest): Promise<SessionResponse> {
    return this.post<SessionResponse>(`/sessions/${encodeURIComponent(id)}/save`, body);
  }

  deleteSession(id: string): Promise<void> {
    return this.delete<void>(`/sessions/${encodeURIComponent(id)}`);
  }

  renameSession(id: string, title: string): Promise<SessionResponse> {
    return this.patch<SessionResponse>(`/sessions/${encodeURIComponent(id)}`, { title });
  }

  appendSegment(id: string, body: AppendSegmentRequest) {
    return this.post(`/sessions/${encodeURIComponent(id)}/segments`, body);
  }

  getSegments(
    id: string,
    query: { afterSequence?: number; limit?: number; language?: string } = {},
  ): Promise<SegmentsResponse> {
    const search = new URLSearchParams();
    if (query.afterSequence !== undefined) search.set('afterSequence', String(query.afterSequence));
    if (query.limit !== undefined) search.set('limit', String(query.limit));
    if (query.language) search.set('language', query.language);
    const qs = search.toString();
    return this.get<SegmentsResponse>(
      `/sessions/${encodeURIComponent(id)}/segments${qs ? `?${qs}` : ''}`,
    );
  }

  // --- realtime -----------------------------------------------------------

  requestTranscriptionToken(body: TranscriptionTokenRequest): Promise<TranscriptionTokenResponse> {
    return this.post<TranscriptionTokenResponse>('/realtime/transcription-token', body);
  }

  // --- LingoBusiness participant -----------------------------------------

  previewBusinessSession(code: string): Promise<{ session: BusinessSessionPreview }> {
    return this.get<{ session: BusinessSessionPreview }>(
      `/business/sessions/${encodeURIComponent(code)}`,
      { anonymous: true },
    );
  }

  joinBusinessSession(body: BusinessJoinRequest): Promise<BusinessJoinResponse> {
    return this.post<BusinessJoinResponse>('/business/join', body, { anonymous: true });
  }

  setViewerLanguage(sessionId: string, participantId: string, targetLanguage: string) {
    return this.post(`/business/sessions/${encodeURIComponent(sessionId)}/language`, {
      participantId,
      targetLanguage,
    });
  }

  // --- history / usage ----------------------------------------------------

  history(
    query: { cursor?: string; limit?: number; search?: string } = {},
  ): Promise<HistoryResponse> {
    const search = new URLSearchParams();
    if (query.cursor) search.set('cursor', query.cursor);
    if (query.limit !== undefined) search.set('limit', String(query.limit));
    if (query.search) search.set('search', query.search);
    const qs = search.toString();
    return this.get<HistoryResponse>(`/history${qs ? `?${qs}` : ''}`);
  }

  usage(): Promise<UsageResponse> {
    return this.get<UsageResponse>('/usage');
  }

  config(): Promise<ConfigResponse> {
    return this.get<ConfigResponse>('/config', { anonymous: true });
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  );
}

const STATUS_FALLBACK: Record<number, ApiErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  402: 'QUOTA_EXCEEDED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
  504: 'UPSTREAM_TIMEOUT',
};

/**
 * Turns any error payload into a typed `LingoLiveError`, so callers always
 * have a stable `code` to map to localised copy — even if a proxy returned
 * HTML instead of the API's JSON envelope.
 */
export function toLingoLiveError(payload: unknown, status: number): LingoLiveError {
  const parsed = apiErrorResponseSchema.safeParse(payload);
  if (parsed.success) {
    return new LingoLiveError(parsed.data.error.code, parsed.data.error.message, {
      status,
      details: { ...parsed.data.error.details, requestId: parsed.data.error.requestId },
    });
  }
  const code = STATUS_FALLBACK[status] ?? 'INTERNAL_ERROR';
  return new LingoLiveError(code, `Request failed with status ${status}`, { status });
}

export { LingoLiveError };
export type { ApiErrorCode };
