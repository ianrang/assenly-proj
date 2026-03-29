import { z } from 'zod';

/** 공통 에러 응답 스키마 — details는 null 또는 객체 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any(),
  }),
});

/** 공통 페이지네이션 메타 스키마 */
export const paginationMetaSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
