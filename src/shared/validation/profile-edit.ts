import { z } from 'zod';
import {
  SKIN_TYPES, SKIN_CONCERNS, HAIR_TYPES, HAIR_CONCERNS,
  BUDGET_LEVELS, AGE_RANGES,
} from '@/shared/constants/beauty';

/**
 * NEW-17d 프로필 편집 zod 스키마.
 * L-13 shared/validation: 런타임 검증만. DB/API 호출 금지.
 *
 * Semantic (v1.1 EC-3):
 *   undefined = "no change"
 *   null = "clear field" (nullable scalar 만)
 *   array [] = 삭제 시도 (skin_types 는 .min(1) 금지, 나머지는 허용)
 */
export const profileEditSchema = z
  .object({
    profile: z
      .object({
        skin_types: z.array(z.enum(SKIN_TYPES)).min(1).max(3).optional(),
        hair_type: z.enum(HAIR_TYPES).nullable().optional(),
        hair_concerns: z.array(z.enum(HAIR_CONCERNS)).max(6).optional(),
        age_range: z.enum(AGE_RANGES).nullable().optional(),
      })
      .strict(),
    journey: z
      .object({
        skin_concerns: z.array(z.enum(SKIN_CONCERNS)).max(5).optional(),
        budget_level: z.enum(BUDGET_LEVELS).nullable().optional(),
      })
      .strict(),
  })
  .refine(
    (v) => Object.keys(v.profile).length > 0 || Object.keys(v.journey).length > 0,
    { message: 'At least one field required' },
  );

export type ProfileEditInput = z.infer<typeof profileEditSchema>;
