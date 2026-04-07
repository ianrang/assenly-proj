/**
 * P2-71 통합 테스트 헬퍼.
 * production 코드 import 없음 — @supabase/supabase-js 직접 사용.
 * 테스트 파일에서만 import. server/client/shared에서 import 금지 (역참조 0건).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// env는 vitest.integration.config.ts의 loadEnv → test.env로 주입됨
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.test.example to .env.test and fill in real keys.',
  );
}

/** 테스트 세션 — signInAnonymously()로 생성된 Supabase auth 세션 */
export interface TestSession {
  userId: string;
  token: string;
}

/**
 * Supabase anonymous 세션 생성.
 * Supabase Auth에 유저가 생성되지만, 앱 users 테이블에는 미등록 상태.
 */
export async function createTestSession(): Promise<TestSession> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(`signInAnonymously failed: ${error?.message ?? 'no session'}`);
  }
  return {
    userId: data.session.user.id,
    token: data.session.access_token,
  };
}

/**
 * 앱 users 테이블에 등록된 테스트 유저 생성.
 * signInAnonymously() + users UPSERT + consent_records UPSERT.
 * profile/events/kit/chat-history 테스트의 beforeAll에서 사용.
 *
 * service_role로 직접 DB INSERT (API 우회) — 테스트 대상이 아닌 설정 단계이므로
 * auth API 장애가 다른 테스트에 전파되지 않도록 격리.
 */
export async function createRegisteredTestUser(): Promise<TestSession> {
  const session = await createTestSession();
  const admin = createVerifyClient();

  const { error: userErr } = await admin
    .from('users')
    .upsert({ id: session.userId, auth_method: 'anonymous' }, { onConflict: 'id' });
  if (userErr) throw new Error(`users upsert failed: ${userErr.message}`);

  const { error: consentErr } = await admin
    .from('consent_records')
    .upsert({ user_id: session.userId, data_retention: true }, { onConflict: 'user_id' });
  if (consentErr) throw new Error(`consent upsert failed: ${consentErr.message}`);

  return session;
}

/**
 * 테스트 유저 데이터 완전 삭제.
 * 1. kit_subscribers 명시 삭제 (FK CASCADE 미확인 테이블 안전 처리)
 * 2. users 삭제 → FK CASCADE로 user_profiles, journeys, conversations,
 *    messages, behavior_logs, consent_records 자동 삭제
 * 3. Supabase Auth에서 유저 삭제
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  const admin = createVerifyClient();

  // kit_subscribers는 후발 migration(008) — CASCADE 여부 불확실. 명시 삭제.
  await admin.from('kit_subscribers').delete().eq('user_id', userId);
  // users CASCADE → 나머지 테이블 자동 삭제
  await admin.from('users').delete().eq('id', userId);
  // Supabase Auth 삭제
  await admin.auth.admin.deleteUser(userId);
}

/**
 * service_role 클라이언트 — DB 검증 조회 + 테스트 데이터 setup/cleanup 용.
 * RLS 우회. production의 createServiceClient와 동일하지만 독립 생성.
 */
export function createVerifyClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** 인증 헤더 생성 — app.request()에 전달용 */
export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** JSON body + 인증 헤더로 app.request 옵션 생성 */
export function jsonRequest(
  method: string,
  token: string,
  body?: unknown,
): RequestInit {
  const init: RequestInit = {
    method,
    headers: authHeaders(token),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return init;
}
