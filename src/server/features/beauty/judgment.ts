import 'server-only';

// ============================================================
// 뷰티 판단 엔진 — search-engine.md §3.1~§3.2
// 5단계 중 최종 정렬(4단계) + 하이라이트(5단계) 담당.
// 1~2단계 = Repository SQL. 3~4단계 점수 = shopping.ts, treatment.ts.
// R-7: shared/ ONLY. beauty/ 타 파일 import 없음 (기반 모듈).
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 7개 (rank, ScoredItem, RankedResult, ENGLISH_SUPPORT_BONUS, ENGLISH_SUPPORT_LABEL, HIGH_RATING_THRESHOLD, RATING_BONUS).
// ============================================================

/** 도메인별 전처리 결과의 공통 계약 — shopping.ts/treatment.ts가 생성 */
export interface ScoredItem {
  id: string;
  score: number;
  reasons: string[];
  warnings: string[];
  is_highlighted: boolean;
}

/** 최종 랭킹 결과 */
export interface RankedResult<T> {
  item: T;
  rank: number;
  is_highlighted: boolean;
}

// --- 공통 scoring 상수 — store.ts/clinic.ts에서 import ---
// DB english_support enum 기반. 단일 진실 공급원 (DRY).
// 이 상수를 수정하면 store/clinic 모두 반영됨.

/** english_support 등급별 점수 보너스 */
export const ENGLISH_SUPPORT_BONUS: Record<string, number> = {
  fluent: 0.2,
  good: 0.15,
  basic: 0.05,
  none: 0,
};

/** english_support 등급별 reasons 라벨 */
export const ENGLISH_SUPPORT_LABEL: Record<string, string> = {
  fluent: 'Fluent English support',
  good: 'Good English support',
  basic: 'Basic English available',
};

/** 높은 평점 기준 */
export const HIGH_RATING_THRESHOLD = 4.0;

/** 평점 보너스 점수 */
export const RATING_BONUS = 0.1;

/**
 * 도메인별 점수가 계산된 항목을 최종 정렬한다.
 * score 내림차순 stable sort + 하이라이트 배지 복사 (VP-1: 순위 미영향).
 */
export function rank<T extends ScoredItem>(
  items: T[],
): RankedResult<T>[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);

  return sorted.map((item, index) => ({
    item,
    rank: index + 1,
    is_highlighted: item.is_highlighted,
  }));
}
