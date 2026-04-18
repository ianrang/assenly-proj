// ============================================================
// 가격 축약 표시 — NEW-35
// L-13: 순수 유틸 함수. 부작용 없음.
// ============================================================

const MILLION = 1_000_000;
const THOUSAND = 1_000;

/**
 * KRW 가격을 축약 문자열로 변환.
 * - ≥1M: ~₩1.5M
 * - ≥1k: ~₩40k (천 단위 반올림)
 * - <1k: ₩999 (그대로)
 * - 0: ₩0
 * - null/음수: null
 */
export function formatPriceShort(price: number | null): string | null {
  if (price === null || price < 0) return null;
  if (price === 0) return '₩0';

  if (price >= MILLION) {
    const m = price / MILLION;
    const rounded = Math.round(m * 10) / 10;
    const display = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return `~₩${display}M`;
  }

  if (price >= THOUSAND) {
    const k = Math.round(price / THOUSAND);
    return `~₩${k}k`;
  }

  return `₩${price}`;
}
