// src/shared/types/ai.ts
// ============================================================
// AI Configuration Types — token-management.md §1.2
// L-0c: server-only, client-only import 금지
// ============================================================

/** 임베딩 프로바이더 식별자 */
export type EmbeddingProvider = 'google' | 'voyage' | 'openai';

/** 모델별 토큰 설정 (token-management.md §1.2) */
export interface TokenConfig {
  /** LLM 응답 최대 토큰. streamText({ maxOutputTokens }) 에 사용 (AI SDK 6.x) */
  maxOutputTokens: number;
  /** 히스토리 로드 최대 턴 수 (1턴 = user 메시지 기준, token-management.md §1.3) */
  historyLimit: number;
  /** LLM 응답 temperature. 추천 서비스 일관성 0.3~0.5 (벤치마킹) */
  temperature: number;
}
