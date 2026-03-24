import 'server-only';

// ============================================================
// Rate Limiter — api-spec.md §4
// MVP: 메모리 Map. v0.2: Upstash Redis (V2-3).
// L-5: K-뷰티 비즈니스 용어 없음.
// G-9: export 1개만 (checkRateLimit).
// ============================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  /** 윈도우 내 최대 요청 수 */
  limit: number;
  /** 윈도우 크기 (ms) */
  windowMs: number;
  /** 윈도우 식별자 (같은 endpoint에 분당+일일 이중 제한 구분). api-spec.md §4.1 */
  window: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/** key = `${identifier}:${endpoint}:${window}` */
const store = new Map<string, RateLimitEntry>();

/**
 * 요청 허용 여부를 확인하고 카운트를 증가시킨다.
 * api-spec.md §4.2: 메모리 Map 기반.
 * @param identifier - user_id, admin_id, 또는 IP
 * @param endpoint - 엔드포인트 그룹 (chat, public, anon_create, admin)
 * @param config - 제한값 + 윈도우 크기
 */
export function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig,
): RateLimitResult {
  const key = `${identifier}:${endpoint}:${config.window}`;
  const now = Date.now();
  const entry = store.get(key);

  // 윈도우 만료 또는 첫 요청
  if (!entry || now - entry.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: now + config.windowMs,
    };
  }

  // 윈도우 내
  if (entry.count < config.limit) {
    entry.count++;
    return {
      allowed: true,
      remaining: config.limit - entry.count,
      resetAt: entry.windowStart + config.windowMs,
    };
  }

  // 초과
  return {
    allowed: false,
    remaining: 0,
    resetAt: entry.windowStart + config.windowMs,
  };
}
