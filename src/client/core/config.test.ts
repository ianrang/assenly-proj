import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('client-only', () => ({}));

describe('clientEnv', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('NEXT_PUBLIC 환경변수가 있으면 파싱 성공', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

    const { clientEnv } = await import('@/client/core/config');
    expect(clientEnv.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co');
    expect(clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('test-anon-key');
  });

  it('NEXT_PUBLIC_SUPABASE_URL이 없으면 에러', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

    await expect(import('@/client/core/config')).rejects.toThrow();
  });

  it('NEXT_PUBLIC_SUPABASE_ANON_KEY가 없으면 에러', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    await expect(import('@/client/core/config')).rejects.toThrow();
  });
});
