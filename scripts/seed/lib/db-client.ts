// ============================================================
// Pipeline DB Client — ai-client.ts 패턴 동일.
// server/core/db.ts는 config.ts parse 부작용으로 import 불가.
// pipelineEnv 기반 독립 Supabase 클라이언트 팩토리.
// P-9: server/ import 금지. P-10: 삭제 시 빌드 에러 0건.
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pipelineEnv } from "../config";

/**
 * 파이프라인 전용 Supabase 서비스 클라이언트.
 * service_role 키로 RLS 우회 (시드 적재용).
 */
export function createPipelineClient(): SupabaseClient {
  return createClient(
    pipelineEnv.NEXT_PUBLIC_SUPABASE_URL,
    pipelineEnv.SUPABASE_SERVICE_ROLE_KEY,
  );
}
