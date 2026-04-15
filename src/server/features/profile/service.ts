import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// 프로필 서비스 — api-spec.md §2.3
// R-5: shared/ 타입만 import. core/ import 없음 (client 파라미터 주입).
// R-9: features/journey/ import 없음 (P-4 Composition Root에서 조합).
// G-9: export 5개 (upsertProfile, getProfile, updateProfile, createMinimalProfile, markOnboardingCompleted).
// L-14: ProfileData, ProfileRow export 안 함.
// ============================================================

/**
 * 프로필 UPSERT 입력 (온보딩 UP 변수).
 * v1.2 (NEW-9): OnboardingChips 인라인 온보딩은 skin_type만 필수.
 * country, age_range는 optional (DB user_profiles NULLABLE).
 */
interface ProfileData {
  skin_type: string;
  hair_type: string | null;
  hair_concerns: string[];
  country: string | null;
  language: string;
  age_range?: string | null;
}

/** DB 조회 결과 */
interface ProfileRow {
  user_id: string;
  skin_type: string | null;
  hair_type: string | null;
  hair_concerns: string[] | null;
  country: string | null;
  language: string;
  age_range: string | null;
  beauty_summary: string | null;
  onboarding_completed_at: string | null;
  updated_at: string;
}

/**
 * 프로필 생성 또는 갱신 (UPSERT).
 * user_profiles PK = user_id → 재시도 시 덮어쓰기 (Q-12 멱등).
 */
export async function upsertProfile(
  client: SupabaseClient,
  userId: string,
  data: ProfileData,
): Promise<void> {
  const { error } = await client
    .from('user_profiles')
    .upsert(
      {
        user_id: userId,
        skin_type: data.skin_type,
        hair_type: data.hair_type,
        hair_concerns: data.hair_concerns,
        country: data.country,
        language: data.language,
        age_range: data.age_range ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    throw new Error('Profile creation failed');
  }
}

/**
 * 최소 프로필 생성 (채팅 내 온보딩용).
 * user_profiles 레코드가 없는 신규 사용자에게 extract_user_profile 결과 저장 전 호출.
 * 필수 필드 language만 설정, 나머지는 DB default null.
 * PK 충돌 시 에러 throw → 호출자(afterWork)에서 catch.
 */
export async function createMinimalProfile(
  client: SupabaseClient,
  userId: string,
  language: string,
): Promise<void> {
  const { error } = await client
    .from('user_profiles')
    .insert({
      user_id: userId,
      language,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Minimal profile creation failed: ${error.message}`);
  }
}

/**
 * 본인 프로필 조회. 미존재 시 null.
 * RLS: auth.uid() = user_id (createAuthenticatedClient 사용).
 */
export async function getProfile(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error('Profile retrieval failed');
  }

  return data;
}

/**
 * 프로필 부분 업데이트.
 * 변경 필드만 전송 (PUT partial update).
 */
export async function updateProfile(
  client: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { error } = await client
    .from('user_profiles')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) {
    throw new Error('Profile update failed');
  }
}

/**
 * NEW-9b: 온보딩 완료 게이트 원샷 설정.
 *
 * 불변량 I4 (one-shot semantics):
 *   onboarding_completed_at 은 단조 증가 — 한 번 NOT NULL이 되면 덮어쓰지 않는다.
 *   `WHERE onboarding_completed_at IS NULL` 조건부 UPDATE로 강제.
 *
 * 재호출 시 동작:
 *   - 이미 완료된 상태면 matched rows=0, no-op (에러 아님)
 *   - 멱등(Q-12) + 자기 치유(I7): 부분 실패 재시도에서 타임스탬프 drift 없음
 *
 * 3단계 handler invariant (반드시 마지막 단계):
 *   1. upsertProfile
 *   2. createOrUpdateJourney (optional — skipped 경로에서는 실행 안 함)
 *   3. markOnboardingCompleted  ← 이 함수
 *
 * 순서 역전 시 I7 (자기 치유) 보장이 깨진다. 순서를 변경하지 말 것.
 */
export async function markOnboardingCompleted(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await client
    .from('user_profiles')
    .update({
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .is('onboarding_completed_at', null);

  if (error) {
    throw new Error('Onboarding completion mark failed');
  }
}
