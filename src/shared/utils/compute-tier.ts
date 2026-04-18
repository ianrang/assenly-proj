// ============================================================
// 가격 티어 계산 — NEW-35
// L-13: 순수 유틸 함수. 부작용 없음.
// §2.4: constants/ import 없음. thresholds를 파라미터로 주입.
// ============================================================

import type { TierLevel } from '../types/domain';

export type { TierLevel };

/**
 * 가격으로 티어를 계산한다.
 *
 * 우선순위: price → rangeMin(price_min) → null
 * - price가 있으면 price 기준
 * - price=null이면 rangeMin(price_min) fallback
 * - 둘 다 없으면 null (티어 판정 불가)
 *
 * @param thresholds - { low, high }. $ < low, low ≤ $$ ≤ high, $$$ > high
 * @param price - 실가격 (nullable)
 * @param rangeMin - price_min fallback (optional, nullable)
 */
export function computeTier(
  thresholds: { low: number; high: number },
  price: number | null,
  rangeMin?: number | null,
): TierLevel | null {
  const effective = price ?? rangeMin ?? null;

  if (effective === null || effective < 0) return null;

  if (effective < thresholds.low) return '$';
  if (effective <= thresholds.high) return '$$';
  return '$$$';
}
