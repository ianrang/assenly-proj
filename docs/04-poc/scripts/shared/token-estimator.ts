/**
 * 토큰 추정 유틸 — 문자 수 기반 근사치
 *
 * Gemini가 usage를 반환하지 않으므로 문자 수 기반 추정 사용.
 * 정밀도: ±20% (PoC 비용 추정에 충분)
 */

// 언어별 문자/토큰 비율 (근사치)
const CHARS_PER_TOKEN: Record<string, number> = {
  en: 4.0,
  es: 4.0,
  fr: 4.0,
  ja: 1.5,
  zh: 1.5,
  ko: 2.0,
  default: 3.5,
};

// 모델별 가격 (USD per 1M tokens)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'claude-sonnet-4': { input: 3.00, output: 15.00 },
  'claude-haiku-3.5': { input: 0.80, output: 4.00 },
  'gpt-4o': { input: 2.50, output: 10.00 },
};

/**
 * 텍스트에서 토큰 수 추정
 */
export function estimateTokens(text: string, lang: string = 'en'): number {
  const ratio = CHARS_PER_TOKEN[lang] ?? CHARS_PER_TOKEN.default;
  return Math.ceil(text.length / ratio);
}

/**
 * 토큰 수 기반 비용 계산
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string = 'gemini-2.0-flash',
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gemini-2.0-flash'];
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

/**
 * 여러 모델에 대한 비용 비교 테이블 생성
 */
export function costComparisonTable(
  inputTokens: number,
  outputTokens: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
    result[model] = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  }
  return result;
}
