import 'server-only';
import type { Store } from '@/shared/types/domain';
import type { ScoredItem } from './judgment';
import {
  ENGLISH_SUPPORT_BONUS,
  ENGLISH_SUPPORT_LABEL,
  HIGH_RATING_THRESHOLD,
  RATING_BONUS,
} from './judgment';

// ============================================================
// 매장 도메인 로직 — search-engine.md §3.2 확장
// 외국인 여행객 접근성 기반 점수 + reasons 생성.
// §2.3: store.ts → judgment.ts (단방향).
// R-7: shared/ + beauty/judgment ONLY.
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 1개 (scoreStores).
// ============================================================

const BASE_SCORE = 0.5;
const LANGUAGE_MATCH_BONUS = 0.1;

const TOURIST_SERVICE_LABELS: Record<string, string> = {
  tax_refund: 'Tax refund available',
  beauty_consultation: 'Beauty consultation service',
  multilingual_staff: 'Multilingual staff',
  product_samples: 'Free product samples',
};

/**
 * Store[]에 여행객 접근성 기반 점수를 부여하여 ScoredItem[]로 변환한다.
 * search-handler에서 rank()와 함께 사용.
 * @param userLanguage 사용자 언어 (profile.language). null이면 언어 보너스 미적용.
 */
export function scoreStores(
  stores: Store[],
  userLanguage: string | null = null,
): ScoredItem[] {
  return stores.map((store) => {
    let score = BASE_SCORE;
    const reasons: string[] = [];

    const engBonus = ENGLISH_SUPPORT_BONUS[store.english_support] ?? 0;
    score += engBonus;
    const engLabel = ENGLISH_SUPPORT_LABEL[store.english_support];
    if (engLabel) reasons.push(engLabel);

    if (userLanguage && userLanguage !== 'ko') {
      const supportsUserLang =
        store.english_support === 'fluent' || store.english_support === 'good';
      if (supportsUserLang) {
        score += LANGUAGE_MATCH_BONUS;
        reasons.push('Supports your language');
      }
    }

    for (const svc of store.tourist_services) {
      const label = TOURIST_SERVICE_LABELS[svc];
      if (label) reasons.push(label);
    }

    if (store.rating != null && store.rating >= HIGH_RATING_THRESHOLD) {
      score += RATING_BONUS;
      reasons.push(`Highly rated (${store.rating})`);
    }

    return {
      id: store.id,
      score: Math.max(0, Math.min(1, score)),
      reasons,
      warnings: [],
      is_highlighted: store.is_highlighted,
    };
  });
}
