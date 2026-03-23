// src/server/core/config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

/** 유효한 환경변수 기본값. 개별 테스트에서 overrides로 변경. */
function stubValidEnv(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    AI_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    ADMIN_JWT_SECRET: 'a'.repeat(32),
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
    CRON_SECRET: 'test-cron-secret',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

describe('envSchema', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('유효한 환경변수로 파싱 성공', async () => {
    stubValidEnv();
    const { env } = await import('@/server/core/config');
    expect(env.AI_PROVIDER).toBe('anthropic');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co');
    expect(env.LLM_TIMEOUT_MS).toBe(30000);
    expect(env.EMBEDDING_PROVIDER).toBe('google');
    expect(env.EMBEDDING_DIMENSION).toBe(1024);
  });

  it('AI_PROVIDER가 없으면 파싱 실패', async () => {
    stubValidEnv();
    vi.stubEnv('AI_PROVIDER', '');
    await expect(import('@/server/core/config')).rejects.toThrow();
  });

  it('ADMIN_JWT_SECRET가 32자 미만이면 파싱 실패', async () => {
    stubValidEnv({ ADMIN_JWT_SECRET: 'short' });
    await expect(import('@/server/core/config')).rejects.toThrow();
  });

  it('LLM_TIMEOUT_MS 문자열이 숫자로 변환됨', async () => {
    stubValidEnv({ LLM_TIMEOUT_MS: '60000' });
    const { env } = await import('@/server/core/config');
    expect(env.LLM_TIMEOUT_MS).toBe(60000);
    expect(typeof env.LLM_TIMEOUT_MS).toBe('number');
  });

  it('AI_PROVIDER=anthropic인데 ANTHROPIC_API_KEY 없으면 실패', async () => {
    stubValidEnv();
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(import('@/server/core/config')).rejects.toThrow();
  });

  it('AI_PROVIDER=google인데 GOOGLE_GENERATIVE_AI_API_KEY 없으면 실패', async () => {
    stubValidEnv({
      AI_PROVIDER: 'google',
      GOOGLE_GENERATIVE_AI_API_KEY: '',
    });
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(import('@/server/core/config')).rejects.toThrow();
  });

  it('Rate limit 기본값 적용', async () => {
    stubValidEnv();
    const { env } = await import('@/server/core/config');
    expect(env.RATE_LIMIT_CHAT_PER_MIN).toBe(5);
    expect(env.RATE_LIMIT_CHAT_PER_DAY).toBe(100);
    expect(env.RATE_LIMIT_PUBLIC_PER_MIN).toBe(60);
    expect(env.RATE_LIMIT_ANON_CREATE_PER_MIN).toBe(3);
    expect(env.RATE_LIMIT_ADMIN_PER_MIN).toBe(60);
  });

  it('AI_FALLBACK_PROVIDER=google인데 GOOGLE_GENERATIVE_AI_API_KEY 없으면 실패', async () => {
    stubValidEnv({ AI_FALLBACK_PROVIDER: 'google' });
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', '');
    await expect(import('@/server/core/config')).rejects.toThrow();
  });
});

describe('getModel', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('anthropic 프로바이더로 모델 반환', async () => {
    stubValidEnv();
    const { getModel } = await import('@/server/core/config');
    const model = await getModel('anthropic');
    expect(model).toBeDefined();
    expect(model.modelId).toContain('claude');
  });

  it('google 프로바이더로 모델 반환', async () => {
    stubValidEnv({
      AI_PROVIDER: 'google',
      GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key',
    });
    const { getModel } = await import('@/server/core/config');
    const model = await getModel('google');
    expect(model).toBeDefined();
    expect(model.modelId).toContain('gemini');
  });

  it('모델명 오버라이드 적용', async () => {
    stubValidEnv();
    const { getModel } = await import('@/server/core/config');
    const model = await getModel('anthropic', 'claude-haiku-3-5-20241022');
    expect(model).toBeDefined();
    expect(model.modelId).toContain('haiku');
  });

  it('provider 생략 시 env.AI_PROVIDER 사용', async () => {
    stubValidEnv();
    const { getModel } = await import('@/server/core/config');
    const model = await getModel();
    expect(model).toBeDefined();
    expect(model.modelId).toContain('claude');
  });

  it('지원하지 않는 프로바이더에 에러', async () => {
    stubValidEnv();
    const { getModel } = await import('@/server/core/config');
    await expect(getModel('mistral' as any)).rejects.toThrow('Unsupported AI provider');
  });
});
