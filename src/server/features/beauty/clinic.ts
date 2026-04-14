import 'server-only';
import type { Clinic } from '@/shared/types/domain';
import type { ScoredItem } from './judgment';
import {
  ENGLISH_SUPPORT_BONUS,
  ENGLISH_SUPPORT_LABEL,
  HIGH_RATING_THRESHOLD,
  RATING_BONUS,
} from './judgment';

// ============================================================
// 클리닉 도메인 로직 — search-engine.md §3.2 확장
// 외국인 접근성 + 신뢰도 기반 점수 + reasons 생성.
// §2.3: clinic.ts → judgment.ts (단방향).
// R-7: shared/ + beauty/judgment ONLY.
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 1개 (scoreClinics).
// ============================================================

const BASE_SCORE = 0.5;
const LICENSE_BONUS = 0.1;
const BOOKING_BONUS = 0.05;
const FOREIGNER_INTERPRETER_BONUS = 0.1;
const LANGUAGE_MATCH_BONUS = 0.1;

/**
 * Clinic[]에 외국인 접근성 + 신뢰도 기반 점수를 부여하여 ScoredItem[]로 변환한다.
 * search-handler에서 rank()와 함께 사용.
 * @param userLanguage 사용자 언어 (profile.language). null이면 언어 보너스 미적용.
 */
export function scoreClinics(
  clinics: Clinic[],
  userLanguage: string | null = null,
): ScoredItem[] {
  return clinics.map((clinic) => {
    let score = BASE_SCORE;
    const reasons: string[] = [];

    const engBonus = ENGLISH_SUPPORT_BONUS[clinic.english_support] ?? 0;
    score += engBonus;
    const engLabel = ENGLISH_SUPPORT_LABEL[clinic.english_support];
    if (engLabel) reasons.push(engLabel);

    if (userLanguage && userLanguage !== 'ko') {
      const supportsUserLang =
        clinic.english_support === 'fluent' || clinic.english_support === 'good';
      if (supportsUserLang) {
        score += LANGUAGE_MATCH_BONUS;
        reasons.push('Supports your language');
      }
    }

    if (clinic.license_verified) {
      score += LICENSE_BONUS;
      reasons.push('Licensed and verified clinic');
    }

    if (clinic.foreigner_friendly) {
      const ff = clinic.foreigner_friendly;
      if (ff.interpreter_available) {
        score += FOREIGNER_INTERPRETER_BONUS;
        reasons.push('Interpreter service available');
      }
      if (ff.consultation_languages && ff.consultation_languages.length > 1) {
        reasons.push(`Supports ${ff.consultation_languages.length} languages`);
      }
    }

    if (clinic.booking_url) {
      score += BOOKING_BONUS;
      reasons.push('Online booking available');
    }

    if (clinic.rating != null && clinic.rating >= HIGH_RATING_THRESHOLD) {
      score += RATING_BONUS;
      reasons.push(`Highly rated (${clinic.rating})`);
    }

    return {
      id: clinic.id,
      score: Math.max(0, Math.min(1, score)),
      reasons,
      warnings: [],
      is_highlighted: clinic.is_highlighted,
    };
  });
}
