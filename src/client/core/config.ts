import 'client-only';
import { z } from 'zod';

// ============================================================
// 클라이언트 환경변수 검증 — Q-8 일관성 (server/core/config.ts 대칭)
// NEXT_PUBLIC_* 변수는 빌드 타임에 인라인되지만, zod로 검증하여
// 빌드 누락 시 즉시 에러를 발생시킨다.
// L-0b: client-only 경계 가드.
// ============================================================

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** 검증된 클라이언트 환경변수. 다른 client/ 파일은 이 객체만 import. */
export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
