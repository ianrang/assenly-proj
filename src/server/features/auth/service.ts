import 'server-only';
import { createServiceClient } from '@/server/core/db';

// ============================================================
// Anonymous 인증 서비스 — api-spec.md §2.1 + data-privacy.md §1.2
// G-9: export 1개만 (createAnonymousSession).
// L-14: ConsentInput, AnonymousSessionResult export 안 함.
// R-5: features -> core (createServiceClient) 허용.
// ============================================================

/** 동의 입력 */
interface ConsentInput {
  data_retention: boolean;
}

/** 세션 생성 결과 */
interface AnonymousSessionResult {
  user_id: string;
  session_token: string;
}

/**
 * 익명 세션을 생성하고 동의를 기록한다.
 * data-privacy.md §1.2: Landing -> 세션 생성 흐름.
 *
 * 1. data_retention 동의 필수 검증
 * 2. Supabase signInAnonymously() — auth.users 생성
 * 3. public.users INSERT (service_role — RLS chicken-and-egg)
 * 4. consent_records INSERT
 */
export async function createAnonymousSession(
  consent: ConsentInput,
): Promise<AnonymousSessionResult> {
  if (!consent.data_retention) {
    throw new Error('data_retention consent is required');
  }

  const client = createServiceClient();

  // Supabase Auth: 익명 사용자 생성
  const { data: authData, error: authError } =
    await client.auth.signInAnonymously();

  // Q-7: 에러 불삼킴. Supabase 내부 메시지 노출 금지 (보안).
  if (authError) {
    throw new Error('Anonymous sign-in failed');
  }
  if (!authData.user || !authData.session) {
    throw new Error('Anonymous sign-in failed');
  }

  const userId = authData.user.id;
  const sessionToken = authData.session.access_token;

  // 앱 users 테이블 INSERT (service_role)
  // schema.dbml: created_at, last_active는 default now().
  const { error: userError } = await client
    .from('users')
    .insert({ id: userId, auth_method: 'anonymous' });
  if (userError) {
    throw new Error('User record creation failed');
  }

  // consent_records INSERT
  // schema.dbml: consented_at, updated_at는 default now(). 나머지 boolean은 default false.
  const { error: consentError } = await client
    .from('consent_records')
    .insert({ user_id: userId, data_retention: true });
  if (consentError) {
    throw new Error('Consent record creation failed');
  }

  return { user_id: userId, session_token: sessionToken };
}
