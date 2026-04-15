import 'server-only';
import { z } from 'zod';

// ============================================================
// extract_user_profile Tool Handler — tool-spec.md §3
// 동기 tool (P1-33 확정). LLM이 대화에서 프로필 정보를 추출.
// execute: 추출 결과 반환. DB 저장 없음 (P2-19 chatService onFinish에서 처리).
// tool-spec.md §4.2: 실패 → extraction_skipped. 대화 중단 없음.
// ============================================================

/** tool-spec.md §3 출력 스키마 — PoC p0-17 계승 (93% 정확도 검증) */
export const extractUserProfileSchema = z.object({
  skin_types: z.array(
    z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal']),
  ).nullable()
    .describe('Skin types if mentioned. Can be multiple (e.g., combination+sensitive). null if not mentioned.'),

  skin_concerns: z.array(
    z.enum([
      'acne', 'wrinkles', 'dark_spots', 'redness', 'dryness',
      'pores', 'dullness', 'dark_circles', 'uneven_tone', 'sun_damage', 'eczema',
    ])
  ).nullable()
    .describe('Skin concerns if mentioned (e.g. "breakouts"→acne, "aging"→wrinkles). null if not mentioned.'),

  stay_days: z.number()
    .nullable()
    .describe('Number of days staying in Korea, if mentioned. null if not.'),

  budget_level: z.enum(['budget', 'moderate', 'premium', 'luxury'])
    .nullable()
    .describe('Budget level. <30K KRW=budget, 30-80K=moderate, 80-200K=premium, >200K=luxury. null if not mentioned.'),

  age_range: z.enum(['18-24', '25-29', '30-34', '35-39', '40-49', '50+'])
    .nullable()
    .describe('Age range if mentioned or clearly inferable. null if not.'),

  // NEW-17: learned_preferences 제거 (NEW-17c에서 재검토)
});

/** 추출 성공 결과 */
export type ExtractionResult = z.infer<typeof extractUserProfileSchema>;

/** 추출 실패 결과 (tool-spec.md §4.2) */
interface ExtractionSkipped {
  status: 'extraction_skipped';
  reason: string;
}

/**
 * extract_user_profile tool execute 함수.
 * tool-spec.md §3: LLM이 추출한 프로필 데이터를 tool-result로 반환.
 * DB 저장 없음 — chatService(P2-19) onFinish에서 조건부 저장.
 * tool-spec.md §4.2: 실패 → extraction_skipped. 대화 중단 없음.
 */
export async function executeExtractUserProfile(
  args: unknown,
): Promise<ExtractionResult | ExtractionSkipped> {
  try {
    const parsed = extractUserProfileSchema.parse(args);
    return parsed;
  } catch (error) {
    // tool-spec.md §4.2: graceful degradation + 서버 로그 (Q-7). 대화 중단 없음.
    console.error('[extract_user_profile] parse failed', String(error));
    return { status: 'extraction_skipped', reason: 'parse_error' };
  }
}
