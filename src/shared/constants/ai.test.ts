import { describe, it, expect } from 'vitest';
import { LLM_CONFIG, TOKEN_CONFIG } from '@/shared/constants/ai';

describe('LLM_CONFIG', () => {
  it('FALLBACK_TRIGGER_CODES에 서버 에러 코드 포함', () => {
    expect(LLM_CONFIG.FALLBACK_TRIGGER_CODES).toContain(500);
    expect(LLM_CONFIG.FALLBACK_TRIGGER_CODES).toContain(429);
    expect(LLM_CONFIG.FALLBACK_TRIGGER_CODES).toContain(503);
  });

  it('NO_FALLBACK_CODES에 클라이언트 에러 코드 포함', () => {
    expect(LLM_CONFIG.NO_FALLBACK_CODES).toContain(400);
    expect(LLM_CONFIG.NO_FALLBACK_CODES).toContain(401);
    expect(LLM_CONFIG.NO_FALLBACK_CODES).toContain(422);
  });

  it('FALLBACK_TRIGGER_CODES와 NO_FALLBACK_CODES 겹치지 않음', () => {
    const overlap = LLM_CONFIG.FALLBACK_TRIGGER_CODES.filter(
      (code) => (LLM_CONFIG.NO_FALLBACK_CODES as readonly number[]).includes(code)
    );
    expect(overlap).toHaveLength(0);
  });

  it('MAX_ATTEMPTS는 2 (주 1회 + 폴백 1회)', () => {
    expect(LLM_CONFIG.MAX_ATTEMPTS).toBe(2);
  });

  it('FALLBACK_DELAY_MS는 양수', () => {
    expect(LLM_CONFIG.FALLBACK_DELAY_MS).toBeGreaterThan(0);
  });
});

describe('TOKEN_CONFIG', () => {
  it('default 설정이 존재', () => {
    expect(TOKEN_CONFIG['default']).toBeDefined();
  });

  it('default.maxTokens는 1024', () => {
    expect(TOKEN_CONFIG['default'].maxTokens).toBe(1024);
  });

  it('default.historyLimit는 20', () => {
    expect(TOKEN_CONFIG['default'].historyLimit).toBe(20);
  });

  it('모든 설정의 maxTokens가 양수', () => {
    for (const config of Object.values(TOKEN_CONFIG)) {
      expect(config.maxTokens).toBeGreaterThan(0);
    }
  });

  it('모든 설정의 historyLimit가 양수', () => {
    for (const config of Object.values(TOKEN_CONFIG)) {
      expect(config.historyLimit).toBeGreaterThan(0);
    }
  });
});
