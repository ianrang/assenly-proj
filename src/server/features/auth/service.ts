import 'server-only';
import { createServiceClient } from '@/server/core/db';

// ============================================================
// Anonymous 인증 서비스 — api-spec.md §2.1 + data-privacy.md §1.2
// P2-79: 클라이언트 SDK가 signInAnonymously() 수행. 서버는 동의 기록만.
// G-9: export 1개만 (registerAnonymousUser).
// L-14: ConsentInput, RegisterResult export 안 함.
// R-5: features -> core (createServiceClient) 허용.
// Q-12: UPSERT 멱등성 보장 — 동일 요청 재전송 시 중복 레코드 방지.
// ============================================================

/** 동의 입력 */
interface ConsentInput {
  data_retention: boolean;
}

/** 등록 결과 */
interface RegisterResult {
  user_id: string;
}

/**
 * 익명 사용자를 등록하고 동의를 기록한다.
 * P2-79: 클라이언트 SDK가 이미 signInAnonymously()로 세션 생성 완료.
 * 서버는 userId를 파라미터로 받아 users + consent_records UPSERT.
 *
 * 1. data_retention 동의 필수 검증
 * 2. public.users UPSERT (service_role — RLS chicken-and-egg)
 * 3. consent_records UPSERT
 */
export async function registerAnonymousUser(
  userId: string,
  consent: ConsentInput,
): Promise<RegisterResult> {
  if (!consent.data_retention) {
    throw new Error('data_retention consent is required');
  }

  const client = createServiceClient();

  // 앱 users 테이블 UPSERT (service_role)
  // Q-12: 멱등성 — 동일 userId 재요청 시 INSERT 대신 UPDATE.
  // schema.dbml: created_at, last_active는 default now().
  const { error: userError } = await client
    .from('users')
    .upsert({ id: userId, auth_method: 'anonymous' }, { onConflict: 'id' });
  if (userError) {
    throw new Error('User record creation failed');
  }

  // consent_records UPSERT
  // Q-12: 멱등성 — 동일 user_id 재요청 시 INSERT 대신 UPDATE.
  // schema.dbml: consented_at, updated_at는 default now(). 나머지 boolean은 default false.
  const { error: consentError } = await client
    .from('consent_records')
    .upsert({ user_id: userId, data_retention: true }, { onConflict: 'user_id' });
  if (consentError) {
    throw new Error('Consent record creation failed');
  }

  return { user_id: userId };
}
