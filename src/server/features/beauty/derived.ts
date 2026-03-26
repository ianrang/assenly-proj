import 'server-only';
import type { SkinType, SkinConcern } from '@/shared/types/domain';
import type { LearnedPreference } from '@/shared/types/profile';

// ============================================================
// 도출 변수 계산기 — search-engine.md §3.2, PRD §4-A DV-1~3
// 독립 모듈: beauty/ 타 파일 import 없음 (§2.3).
// R-7: shared/types ONLY.
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 3개 (calculatePreferredIngredients, calculateAvoidedIngredients, calculateSegment).
// L-14: 매핑 상수 미export.
// DV-4(AI 뷰티 프로필)는 LLM 호출 필요 → derived.ts 범위 외.
// ============================================================

// --- 내부 매핑 상수 (L-14: 미export) ---
// MVP: 정적 매핑. v0.2: DB ingredients 테이블 기반으로 전환.

const SKIN_TYPE_PREFERRED: Record<string, string[]> = {
  dry: ['hyaluronic_acid', 'ceramide', 'squalane', 'shea_butter'],
  oily: ['niacinamide', 'salicylic_acid', 'tea_tree', 'zinc'],
  combination: ['niacinamide', 'hyaluronic_acid', 'green_tea'],
  sensitive: ['centella_asiatica', 'aloe_vera', 'chamomile', 'oat'],
  normal: ['vitamin_c', 'hyaluronic_acid', 'peptide'],
};

const CONCERN_PREFERRED: Record<string, string[]> = {
  acne: ['salicylic_acid', 'tea_tree', 'benzoyl_peroxide', 'niacinamide'],
  wrinkles: ['retinol', 'peptide', 'vitamin_c', 'collagen'],
  dark_spots: ['vitamin_c', 'arbutin', 'tranexamic_acid', 'niacinamide'],
  redness: ['centella_asiatica', 'aloe_vera', 'green_tea', 'chamomile'],
  dryness: ['hyaluronic_acid', 'ceramide', 'squalane', 'glycerin'],
  pores: ['niacinamide', 'salicylic_acid', 'retinol', 'clay'],
  dullness: ['vitamin_c', 'aha', 'niacinamide', 'turmeric'],
  dark_circles: ['vitamin_k', 'caffeine', 'retinol', 'peptide'],
  uneven_tone: ['vitamin_c', 'arbutin', 'aha', 'niacinamide'],
  sun_damage: ['vitamin_c', 'retinol', 'niacinamide', 'centella_asiatica'],
  eczema: ['ceramide', 'colloidal_oatmeal', 'aloe_vera', 'shea_butter'],
};

const SKIN_TYPE_CAUTION: Record<string, string[]> = {
  dry: ['alcohol', 'witch_hazel', 'menthol'],
  oily: ['mineral_oil', 'coconut_oil', 'petrolatum'],
  combination: ['heavy_oil', 'alcohol'],
  sensitive: ['fragrance', 'alcohol', 'essential_oil', 'retinol'],
  normal: [],
};

/**
 * DV-1: 선호 성분 계산.
 * PRD §4-A: skin_type + concerns → 성분 매핑 + 학습 가중치(BH-4 likes).
 */
export function calculatePreferredIngredients(
  skinType: SkinType | null,
  concerns: SkinConcern[],
  learnedLikes: LearnedPreference[],
): string[] {
  const ingredients = new Set<string>();

  if (skinType) {
    for (const ing of SKIN_TYPE_PREFERRED[skinType] ?? []) {
      ingredients.add(ing);
    }
  }

  for (const concern of concerns) {
    for (const ing of CONCERN_PREFERRED[concern] ?? []) {
      ingredients.add(ing);
    }
  }

  for (const pref of learnedLikes) {
    if (pref.category === 'ingredient' && pref.direction === 'like') {
      ingredients.add(pref.preference);
    }
  }

  return [...ingredients];
}

/**
 * DV-2: 기피 성분 계산.
 * PRD §4-A: skin_type → 주의 성분 + 명시적 비선호(BH-4 dislikes).
 */
export function calculateAvoidedIngredients(
  skinType: SkinType | null,
  learnedDislikes: LearnedPreference[],
): string[] {
  const ingredients = new Set<string>();

  if (skinType) {
    for (const ing of SKIN_TYPE_CAUTION[skinType] ?? []) {
      ingredients.add(ing);
    }
  }

  for (const pref of learnedDislikes) {
    if (pref.category === 'ingredient' && pref.direction === 'dislike') {
      ingredients.add(pref.preference);
    }
  }

  return [...ingredients];
}

/**
 * DV-3: 사용자 세그먼트 계산.
 * PRD §4-A: 규칙 기반 분류. 마케팅·분석용 (추천에 직접 미사용).
 */
export function calculateSegment(
  ageRange: string | null,
  interests: string[],
  budgetLevel: string | null,
  travelStyle: string[],
): string | null {
  if (!budgetLevel && interests.length === 0) return null;

  const hasClinic = interests.includes('clinic');
  const hasShopping = interests.includes('shopping');
  const isLuxury = budgetLevel === 'luxury' || budgetLevel === 'premium';
  const isBudget = budgetLevel === 'budget';

  if (isLuxury && hasClinic) return 'luxury_beauty_seeker';
  if (isBudget && hasShopping) return 'budget_beauty_explorer';
  if (hasClinic) return 'treatment_focused';
  if (hasShopping && !hasClinic) return 'product_focused';

  return 'general_beauty_traveler';
}
