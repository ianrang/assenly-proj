import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('client-only', () => ({}));

vi.mock('@/client/core/config', () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  },
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    auth: {
      signInAnonymously: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  })),
}));

describe('getSupabaseBrowserClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('Supabase Auth 클라이언트를 반환한다', async () => {
    const { getSupabaseBrowserClient } = await import('@/client/core/supabase-browser');
    const client = getSupabaseBrowserClient();
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(typeof client.auth.signInAnonymously).toBe('function');
  });

  it('createBrowserClient에 올바른 인자를 전달한다', async () => {
    const { createBrowserClient } = await import('@supabase/ssr');
    const { getSupabaseBrowserClient } = await import('@/client/core/supabase-browser');

    getSupabaseBrowserClient();

    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
    );
  });
});
