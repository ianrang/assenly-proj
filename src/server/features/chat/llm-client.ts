import 'server-only';
import type { ModelMessage, ToolSet } from 'ai';
import { streamText } from 'ai';
import { env, getModel } from '@/server/core/config';
import { LLM_CONFIG, TOKEN_CONFIG } from '@/shared/constants/ai';

// ============================================================
// LLM 폴백 클라이언트 — llm-resilience.md §2.2
// P-3: 교체 가능 leaf. core/ 무영향.
// G-9: export 1개만 (callWithFallback).
// ============================================================

interface CallOptions {
  messages: ModelMessage[];
  system: string;
  tools: ToolSet;
  stopWhen?: Parameters<typeof streamText>[0]['stopWhen'];
}

/**
 * 주 모델 호출 → 실패 시 폴백 모델 1회 시도.
 * llm-resilience.md §2.1: 서버 재시도 없음. 폴백 = 다른 프로바이더 전환.
 */
export async function callWithFallback(options: CallOptions) {
  const primaryProvider = env.AI_PROVIDER;
  const fallbackProvider = env.AI_FALLBACK_PROVIDER;

  try {
    const model = await getModel(primaryProvider);
    return await streamText({
      model,
      ...options,
      toolChoice: 'auto',
      temperature: env.LLM_TEMPERATURE,
      maxOutputTokens: TOKEN_CONFIG.default.maxOutputTokens,
      abortSignal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
    });
  } catch (primaryError) {
    if (!fallbackProvider || !shouldFallback(primaryError)) {
      throw primaryError;
    }

    console.warn('[LLM_FALLBACK]', {
      primary: primaryProvider,
      fallback: fallbackProvider,
      reason: (primaryError as Error).message,
    });

    // v1.1: FALLBACK_DELAY_MS 적용 (llm-resilience.md §2.2, chat-quality-improvements.md §5.2)
    // 폴백 프로바이더 전환 전 짧은 대기. 즉시 재시도로 인한 연쇄 실패 방지.
    await new Promise((resolve) => setTimeout(resolve, LLM_CONFIG.FALLBACK_DELAY_MS));

    try {
      const fallbackModel = await getModel(fallbackProvider);
      return await streamText({
        model: fallbackModel,
        ...options,
        toolChoice: 'auto',
        temperature: env.LLM_TEMPERATURE,
        maxOutputTokens: TOKEN_CONFIG.default.maxOutputTokens,
        abortSignal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
      });
    } catch (fallbackError) {
      console.error('[LLM_ALL_FAILED]', {
        primary: { provider: primaryProvider, error: (primaryError as Error).message },
        fallback: { provider: fallbackProvider, error: (fallbackError as Error).message },
      });
      throw fallbackError;
    }
  }
}

/** 에러 유형에 따라 폴백 시도 여부 결정. llm-resilience.md §2.3 */
function shouldFallback(error: unknown): boolean {
  if (error instanceof Error) {
    const status = (error as { status?: number }).status;
    if (status && (LLM_CONFIG.NO_FALLBACK_CODES as readonly number[]).includes(status)) {
      return false;
    }
    if (status && (LLM_CONFIG.FALLBACK_TRIGGER_CODES as readonly number[]).includes(status)) {
      return true;
    }
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return true;
    }
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      return true;
    }
  }
  return false;
}
