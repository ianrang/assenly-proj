import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('client-only', () => ({}));

// ── Supabase browser client mock ─────────────────────────────
const mockGetSession = vi.fn();
vi.mock('./supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: mockGetSession },
  }),
}));

// ── global fetch mock ────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { getAccessToken, authFetch } from './auth-fetch';

describe('getAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('세션 있음 → access_token 반환', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-abc' } },
    });

    const token = await getAccessToken();
    expect(token).toBe('token-abc');
  });

  it('세션 없음 → null', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const token = await getAccessToken();
    expect(token).toBeNull();
  });
});

describe('authFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(new Response('ok'));
  });

  it('토큰 있음 → Authorization Bearer 헤더 포함', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-xyz' } },
    });

    await authFetch('/api/test', { method: 'POST' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/test');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-xyz');
    expect(init.method).toBe('POST');
  });

  it('토큰 없음 → Authorization 헤더 없이 요청', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    await authFetch('/api/test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('기존 init.headers 보존', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-xyz' } },
    });

    await authFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer token-xyz');
  });
});
