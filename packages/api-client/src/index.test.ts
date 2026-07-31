import { describe, expect, it, vi } from 'vitest';
import { LingoLiveError } from '@lingolive/contracts';
import { ApiClient, toLingoLiveError } from './index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ApiClient', () => {
  it('prefixes every call with the API version', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ ok: true }));
    const client = new ApiClient({ baseUrl: 'https://api.test/', fetchFn: fetchFn as never });
    await client.get('/me');
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.test/api/v1/me');
  });

  it('attaches the bearer token when one is available', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({}));
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      fetchFn: fetchFn as never,
      getToken: () => 'token-123',
    });
    await client.me();
    const init = fetchFn.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-123');
  });

  it('never attaches a token to a public endpoint', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({}));
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      fetchFn: fetchFn as never,
      getToken: () => 'token-123',
    });
    await client.joinBusinessSession({ code: '728416', targetLanguage: 'fr' });
    const init = fetchFn.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('maps the API error envelope to a typed error', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(
        {
          error: {
            code: 'INVALID_ACCESS_CODE',
            message: 'No such session',
            requestId: 'req_abc',
          },
        },
        404,
      ),
    );
    const client = new ApiClient({ baseUrl: 'https://api.test', fetchFn: fetchFn as never });

    await expect(client.previewBusinessSession('000000')).rejects.toMatchObject({
      code: 'INVALID_ACCESS_CODE',
    });

    try {
      await client.previewBusinessSession('000000');
    } catch (error) {
      expect(error).toBeInstanceOf(LingoLiveError);
      expect((error as LingoLiveError).details?.requestId).toBe('req_abc');
    }
  });

  it('falls back to a status-derived code when the body is not our envelope', async () => {
    const fetchFn = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response('<html>502</html>', { status: 502 }),
    );
    const client = new ApiClient({ baseUrl: 'https://api.test', fetchFn: fetchFn as never });
    await expect(client.me()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('notifies the app once when the token is rejected', async () => {
    const onUnauthorized = vi.fn();
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({}, 401));
    const client = new ApiClient({
      baseUrl: 'https://api.test',
      fetchFn: fetchFn as never,
      onUnauthorized,
    });
    await expect(client.me()).rejects.toBeInstanceOf(LingoLiveError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('turns a network failure into SERVICE_UNAVAILABLE rather than an opaque throw', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => {
      throw new TypeError('Failed to fetch');
    });
    const client = new ApiClient({ baseUrl: 'https://api.test', fetchFn: fetchFn as never });
    await expect(client.me()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('turns an abort into UPSTREAM_TIMEOUT', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    const client = new ApiClient({ baseUrl: 'https://api.test', fetchFn: fetchFn as never });
    await expect(client.me()).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
  });

  it('handles a 204 with no body', async () => {
    const fetchFn = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    const client = new ApiClient({ baseUrl: 'https://api.test', fetchFn: fetchFn as never });
    await expect(client.deleteSession('ses_1')).resolves.toBeUndefined();
  });

  it('encodes path parameters', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({}));
    const client = new ApiClient({ baseUrl: 'https://api.test', fetchFn: fetchFn as never });
    await client.getSession('ses/../admin');
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.test/api/v1/sessions/ses%2F..%2Fadmin');
  });

  it('builds segment queries for reconnection', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ segments: [], lastSequence: 0, hasMore: false }),
    );
    const client = new ApiClient({ baseUrl: 'https://api.test', fetchFn: fetchFn as never });
    await client.getSegments('ses_1', { afterSequence: 12, language: 'ar' });
    expect(fetchFn.mock.calls[0]![0]).toBe(
      'https://api.test/api/v1/sessions/ses_1/segments?afterSequence=12&language=ar',
    );
  });
});

describe('toLingoLiveError', () => {
  it('maps common statuses', () => {
    expect(toLingoLiveError(null, 429).code).toBe('RATE_LIMITED');
    expect(toLingoLiveError(null, 404).code).toBe('NOT_FOUND');
    expect(toLingoLiveError(null, 402).code).toBe('QUOTA_EXCEEDED');
    expect(toLingoLiveError(null, 418).code).toBe('INTERNAL_ERROR');
  });
});
