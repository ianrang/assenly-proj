import 'server-only';
import { z } from 'zod';

// ============================================================
// 환경변수 Zod 검증 — security-infra.md §1.3
// Q-8: process.env 직접 접근은 이 파일에서만.
// L-5: K-뷰티 비즈니스 용어 없음.
// L-14: AIProvider 타입은 이 모듈 내부에서만 사용.
// ============================================================

/** MVP 지원 프로바이더 (TDD §2.4: anthropic + google만 설치) */
type AIProvider = 'anthropic' | 'google';

const envSchema = z.object({
  // DB
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // AI
  AI_PROVIDER: z.enum(['anthropic', 'google']),
  AI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  // 임베딩은 LLM과 별도 — openai 임베딩은 REST API 직접 호출 가능 (embedding-strategy.md)
  EMBEDDING_PROVIDER: z.enum(['google', 'voyage', 'openai']).default('google'),
  EMBEDDING_DIMENSION: z.coerce.number().default(1024),

  // Admin Auth
  ADMIN_JWT_SECRET: z.string().min(32),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),

  // LLM Resilience (llm-resilience.md §1.2)
  AI_FALLBACK_PROVIDER: z.enum(['anthropic', 'google']).optional(),
  AI_FALLBACK_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(30000),

  // Rate Limit
  RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().default(5),
  RATE_LIMIT_CHAT_PER_DAY: z.coerce.number().default(100),
  RATE_LIMIT_PUBLIC_PER_MIN: z.coerce.number().default(60),
  RATE_LIMIT_ANON_CREATE_PER_MIN: z.coerce.number().default(3),
  RATE_LIMIT_ADMIN_PER_MIN: z.coerce.number().default(60),

  // Cron
  CRON_SECRET: z.string().min(1),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
}).superRefine((data, ctx) => {
  // AI_PROVIDER별 API 키 조건부 필수 (security-infra.md §1.3)
  if (data.AI_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ANTHROPIC_API_KEY is required when AI_PROVIDER is anthropic',
      path: ['ANTHROPIC_API_KEY'],
    });
  }
  if (data.AI_PROVIDER === 'google' && !data.GOOGLE_GENERATIVE_AI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'GOOGLE_GENERATIVE_AI_API_KEY is required when AI_PROVIDER is google',
      path: ['GOOGLE_GENERATIVE_AI_API_KEY'],
    });
  }
  // 폴백 프로바이더 API 키 검증 — 설정됐으면 해당 키도 필수
  if (data.AI_FALLBACK_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ANTHROPIC_API_KEY is required when AI_FALLBACK_PROVIDER is anthropic',
      path: ['ANTHROPIC_API_KEY'],
    });
  }
  if (data.AI_FALLBACK_PROVIDER === 'google' && !data.GOOGLE_GENERATIVE_AI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'GOOGLE_GENERATIVE_AI_API_KEY is required when AI_FALLBACK_PROVIDER is google',
      path: ['GOOGLE_GENERATIVE_AI_API_KEY'],
    });
  }
});

/** 검증된 환경변수. 다른 파일은 이 객체만 import (Q-8). */
export const env = envSchema.parse(process.env);

// ============================================================
// LLM 모델 팩토리 — llm-resilience.md §1.1
// P-2: 비즈니스 무관 팩토리. 프로바이더 추가 = case 1줄 추가.
// ============================================================

/** 프로바이더별 기본 모델명 */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  google: 'gemini-2.0-flash',
};

/**
 * LLM 모델 인스턴스 반환.
 * @param provider - 프로바이더. 생략 시 env.AI_PROVIDER
 * @param model - 모델명 오버라이드. 생략 시 프로바이더별 기본값 또는 env.AI_MODEL(주 프로바이더)
 */
export async function getModel(provider?: AIProvider, model?: string) {
  const p = provider ?? env.AI_PROVIDER;
  const isDefault = !provider || provider === env.AI_PROVIDER;
  const modelName = model
    ?? (isDefault ? env.AI_MODEL : env.AI_FALLBACK_MODEL)
    ?? DEFAULT_MODELS[p];

  switch (p) {
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic(modelName);
    }
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      return google(modelName);
    }
    default:
      throw new Error(`Unsupported AI provider: ${p}`);
  }
}

// ============================================================
// 임베딩 모델 팩토리 — search-engine.md §4.2
// ⚠️ L-4: core/ 수정. 비즈니스 무관 팩토리 (L-5 준수).
// P-7: 프로바이더 변경 = .env만.
// ============================================================

/** 임베딩 모델 인스턴스 반환. 프로바이더는 env.EMBEDDING_PROVIDER. */
export async function getEmbeddingModel() {
  const provider = env.EMBEDDING_PROVIDER;
  switch (provider) {
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      return google.textEmbeddingModel('gemini-embedding-001');
    }
    default:
      throw new Error(`Unsupported embedding provider: ${provider}`);
  }
}
