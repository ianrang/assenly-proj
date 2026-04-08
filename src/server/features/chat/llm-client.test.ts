import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));

const mockGetModel = vi.fn();
vi.mock('@/server/core/config', () => ({
  env: {
    AI_PROVIDER: 'anthropic',
    AI_FALLBACK_PROVIDER: 'google',
    LLM_TIMEOUT_MS: 30000,
  },
  getModel: (...args: unknown[]) => mockGetModel(...args),
}));

vi.mock('@/shared/constants/ai', () => ({
  LLM_CONFIG: {
    FALLBACK_TRIGGER_CODES: [408, 429, 500, 502, 503, 504] as const,
    NO_FALLBACK_CODES: [400, 401, 403, 404, 422] as const,
    MAX_ATTEMPTS: 2,
    FALLBACK_DELAY_MS: 0, // 테스트에서 대기 없음
  },
  TOKEN_CONFIG: {
    default: {
      maxOutputTokens: 1024,
      historyLimit: 20,
      temperature: 0.4,
    },
  },
}));

describe('callWithFallback', () => {
  beforeEach(() => {
    vi.resetModules();
    mockStreamText.mockReset();
    mockGetModel.mockReset();
  });

  it('주 모델 성공 시 결과를 반환한다', async () => {
    const mockResult = { text: 'hello' };
    mockGetModel.mockResolvedValue('anthropic-model');
    mockStreamText.mockResolvedValue(mockResult);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    const result = await callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    });

    expect(result).toBe(mockResult);
    expect(mockGetModel).toHaveBeenCalledWith('anthropic');
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it('주 모델 500 실패 → 폴백 모델 호출', async () => {
    const primaryError = Object.assign(new Error('Internal Server Error'), { status: 500 });
    const fallbackResult = { text: 'fallback' };

    mockGetModel
      .mockResolvedValueOnce('anthropic-model')
      .mockResolvedValueOnce('google-model');
    mockStreamText
      .mockRejectedValueOnce(primaryError)
      .mockResolvedValueOnce(fallbackResult);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    const result = await callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    });

    expect(result).toBe(fallbackResult);
    expect(mockGetModel).toHaveBeenCalledTimes(2);
    expect(mockGetModel).toHaveBeenNthCalledWith(2, 'google');
  });

  it('주 모델 400 실패 → 폴백 없이 즉시 throw', async () => {
    const clientError = Object.assign(new Error('Bad Request'), { status: 400 });
    mockGetModel.mockResolvedValue('anthropic-model');
    mockStreamText.mockRejectedValue(clientError);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    await expect(callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    })).rejects.toThrow('Bad Request');

    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it('타임아웃(AbortError) → 폴백 시도', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const fallbackResult = { text: 'fallback' };

    mockGetModel
      .mockResolvedValueOnce('anthropic-model')
      .mockResolvedValueOnce('google-model');
    mockStreamText
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(fallbackResult);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    const result = await callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    });

    expect(result).toBe(fallbackResult);
  });

  it('양쪽 모두 실패 시 폴백 에러를 throw', async () => {
    const primaryError = Object.assign(new Error('Primary fail'), { status: 500 });
    const fallbackError = new Error('Fallback fail');

    mockGetModel
      .mockResolvedValueOnce('anthropic-model')
      .mockResolvedValueOnce('google-model');
    mockStreamText
      .mockRejectedValueOnce(primaryError)
      .mockRejectedValueOnce(fallbackError);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    await expect(callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    })).rejects.toThrow('Fallback fail');
  });

  it('fallbackProvider 미설정 시 폴백 없이 즉시 throw', async () => {
    vi.doMock('@/server/core/config', () => ({
      env: {
        AI_PROVIDER: 'anthropic',
        AI_FALLBACK_PROVIDER: undefined,
        LLM_TIMEOUT_MS: 30000,
      },
      getModel: (...args: unknown[]) => mockGetModel(...args),
    }));

    const serverError = Object.assign(new Error('Server Error'), { status: 500 });
    mockGetModel.mockResolvedValue('anthropic-model');
    mockStreamText.mockRejectedValue(serverError);

    const { callWithFallback } = await import('@/server/features/chat/llm-client');
    await expect(callWithFallback({
      messages: [],
      system: 'test',
      tools: {},
    })).rejects.toThrow('Server Error');

    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });
});
