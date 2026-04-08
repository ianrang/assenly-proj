// ============================================================
// AI Constants — llm-resilience.md §2.3 + token-management.md §1.2
// L-13: 순수 상수만. 런타임 부작용 금지.
// L-0c: server-only, client-only import 금지.
// ============================================================

import type { TokenConfig } from '../types/ai';

/**
 * LLM 폴백 설정 (llm-resilience.md §2.3)
 * G-10: 매직 넘버 금지 — 명명된 상수로 선언
 */
export const LLM_CONFIG = {
  /** 이 HTTP 상태 코드에서 폴백 시도 */
  FALLBACK_TRIGGER_CODES: [408, 429, 500, 502, 503, 504] as const,

  /** 이 HTTP 상태 코드에서 폴백 안 함 (즉시 에러 반환) */
  NO_FALLBACK_CODES: [400, 401, 403, 404, 422] as const,

  /** 최대 시도 횟수 (주 1회 + 폴백 1회) */
  MAX_ATTEMPTS: 2,

  /** 폴백 전 대기 시간 (ms) */
  FALLBACK_DELAY_MS: 100,
} as const;

/**
 * 모델별 토큰 설정 (token-management.md §1.2)
 * MVP는 default만 사용. v0.2에서 모델별 설정 추가 가능.
 */
export const TOKEN_CONFIG: Record<string, TokenConfig> = {
  default: {
    maxOutputTokens: 1024,
    historyLimit: 20,
    temperature: 0.4,
  },
};
