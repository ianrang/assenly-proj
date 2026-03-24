import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('첫 요청은 허용된다', async () => {
    const { checkRateLimit } = await import('@/server/core/rate-limit');
    const result = checkRateLimit('user-1', 'chat', { limit: 5, windowMs: 60_000, window: 'min' });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('limit 초과 시 차단된다', async () => {
    const { checkRateLimit } = await import('@/server/core/rate-limit');
    for (let i = 0; i < 3; i++) {
      checkRateLimit('user-2', 'chat', { limit: 3, windowMs: 60_000, window: 'min' });
    }
    const result = checkRateLimit('user-2', 'chat', { limit: 3, windowMs: 60_000, window: 'min' });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('다른 identifier는 독립적이다', async () => {
    const { checkRateLimit } = await import('@/server/core/rate-limit');
    for (let i = 0; i < 3; i++) {
      checkRateLimit('user-3', 'chat', { limit: 3, windowMs: 60_000, window: 'min' });
    }
    const result = checkRateLimit('user-4', 'chat', { limit: 3, windowMs: 60_000, window: 'min' });
    expect(result.allowed).toBe(true);
  });

  it('다른 endpoint는 독립적이다', async () => {
    const { checkRateLimit } = await import('@/server/core/rate-limit');
    for (let i = 0; i < 3; i++) {
      checkRateLimit('user-5', 'chat', { limit: 3, windowMs: 60_000, window: 'min' });
    }
    const result = checkRateLimit('user-5', 'public', { limit: 3, windowMs: 60_000, window: 'min' });
    expect(result.allowed).toBe(true);
  });

  it('같은 endpoint에서 다른 window는 독립적이다 (분당+일일 이중 제한)', async () => {
    const { checkRateLimit } = await import('@/server/core/rate-limit');
    // 분당 제한 소진
    for (let i = 0; i < 3; i++) {
      checkRateLimit('user-8', 'chat', { limit: 3, windowMs: 60_000, window: 'min' });
    }
    const minResult = checkRateLimit('user-8', 'chat', { limit: 3, windowMs: 60_000, window: 'min' });
    expect(minResult.allowed).toBe(false);

    // 일일 제한은 독립적으로 허용
    const dayResult = checkRateLimit('user-8', 'chat', { limit: 100, windowMs: 86_400_000, window: 'day' });
    expect(dayResult.allowed).toBe(true);
  });

  it('윈도우 만료 후 카운트가 리셋된다', async () => {
    const { checkRateLimit } = await import('@/server/core/rate-limit');
    for (let i = 0; i < 3; i++) {
      checkRateLimit('user-6', 'chat', { limit: 3, windowMs: 100, window: 'min' });
    }
    await new Promise((r) => setTimeout(r, 150));
    const result = checkRateLimit('user-6', 'chat', { limit: 3, windowMs: 100, window: 'min' });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('resetAt을 반환한다', async () => {
    const { checkRateLimit } = await import('@/server/core/rate-limit');
    const before = Date.now();
    const result = checkRateLimit('user-7', 'chat', { limit: 5, windowMs: 60_000, window: 'min' });
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60_000);
  });
});
