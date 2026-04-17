import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfileVars, JourneyContextVars } from '@/shared/types/profile';

// ============================================================
// 프로필 서비스 — api-spec.md §2.3
// R-5: shared/ 타입만 import. core/ import 없음 (client 파라미터 주입).
// R-9: features/journey/ import 없음 (P-4 Composition Root에서 조합).
// G-9: export 5개 (upsertProfile, getProfile, updateProfile, createMinimalProfile, markOnboardingCompleted).
// L-14: ProfileData, ProfileRow export 안 함.
// ============================================================

/**
 * 프로필 UPSERT 입력 (온보딩 UP 변수).
 *
 * DB user_profiles 컬럼 상태 (schema.dbml, migration 015 이후):
 *   skin_types text[] nullable · hair_type nullable · country nullable · age_range nullable
 *   language NOT NULL
 *
 * NEW-17: Start 경로는 skin_types 배열(min 1, max 3) 전달(필수).
 *          Skip 경로는 createMinimalProfile 사용 (upsertProfile 미호출).
 */
interface ProfileData {
  skin_types: string[]; // NEW-17: 단일 → 배열
  hair_type: string | null;
  hair_concerns: string[];
  country: string | null;
  language: string;
  age_range?: string | null;
}

/**
 * Raw DB row shape from Supabase (nullable arrays for text[] columns).
 * M1: ProfileRow 타입 정확화 — DB 실제 반환 타입 반영.
 */
interface ProfileRowRaw {
  user_id: string;
  skin_types: string[] | null;
  hair_type: string | null;
  hair_concerns: string[] | null;
  country: string | null;
  language: string;
  age_range: string | null;
  beauty_summary: string | null;
  onboarding_completed_at: string | null;
  updated_at: string;
}

/** 정규화된 return 타입 (배열은 [] 보장 — SG-6 / CQ-2) */
interface ProfileRow {
  user_id: string;
  skin_types: string[];
  hair_type: string | null;
  hair_concerns: string[];
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
        skin_types: data.skin_types,
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
 * M1: 제네릭 maybeSingle<ProfileRowRaw>로 타입 정확화.
 */
export async function getProfile(
  client: SupabaseClient,
  userId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<ProfileRowRaw>();

  if (error) {
    throw new Error('Profile retrieval failed');
  }

  if (!data) return null;
  return {
    ...data,
    skin_types: data.skin_types ?? [],
    hair_concerns: data.hair_concerns ?? [],
  };
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
  // NEW-9b adversarial review C3 정합:
  // Supabase update().eq()는 0-row 일치 시에도 error 없이 빈 결과를 반환한다.
  // 이 함수가 조용히 no-op가 되면 handler가 201 "onboarding_completed:true"를 반환하는데
  // 실제로는 user_profiles row가 없을 수 있어 사용자가 영구 잠금됨.
  // 따라서 .select()로 실제 영향 받은 행을 확인한다.
  //
  // 정상 no-op 케이스 (matched=1 but rows=0 because WHERE IS NULL):
  //   이미 완료된 사용자 재호출 → 에러 아님, 멱등 통과. 이를 구분하기 위해
  //   "matched row 유무"는 user_profiles 존재 유무로 확인 — updated rows 배열이
  //   비어 있어도 row 자체는 있을 수 있다(이미 NOT NULL). 따라서 별도 확인 필요.
  const { data: existingBefore, error: selectError } = await client
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError) {
    throw new Error('Onboarding completion precheck failed');
  }
  if (!existingBefore) {
    // persistOnboarding 의 upsertProfile/createMinimalProfile 이 선행되었음에도
    // row가 없으면 DB/RLS 이상. 명시적 에러로 상위에 500 유도.
    throw new Error('Onboarding completion mark failed: profile row missing');
  }

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

/**
 * NEW-17: AI 추출 결과를 RPC apply_ai_profile_patch로 원자 적용.
 * M1/M2/M3/M5 DB 레벨 강제 (spec §2.1).
 * merge.ts의 computeProfilePatch와 의미론 동일 (RPC/TS sync test T9).
 */
export async function applyAiExtraction(
  client: SupabaseClient,
  userId: string,
  patch: Partial<UserProfileVars>,
): Promise<{ applied: string[] }> {
  const { data, error } = await client.rpc('apply_ai_profile_patch', {
    p_user_id: userId,
    p_patch: patch,
  });
  if (error) {
    // M3: error logging (Q-7 관측성)
    console.error('[applyAiExtraction] rpc error', {
      userId,
      code: error.code,
      message: error.message,
    });
    throw new Error('AI profile patch failed');
  }
  return { applied: (data as string[]) ?? [] };
}

/**
 * NEW-17: journey AI 추출. active journey lazy-create 포함.
 */
export async function applyAiExtractionToJourney(
  client: SupabaseClient,
  userId: string,
  patch: Partial<JourneyContextVars>,
): Promise<{ applied: string[] }> {
  const { data, error } = await client.rpc('apply_ai_journey_patch', {
    p_user_id: userId,
    p_patch: patch,
  });
  if (error) {
    // M3: error logging (Q-7 관측성)
    console.error('[applyAiExtractionToJourney] rpc error', {
      userId,
      code: error.code,
      message: error.message,
    });
    throw new Error('AI journey patch failed');
  }
  return { applied: (data as string[]) ?? [] };
}

/**
 * NEW-17d: 사용자 명시 편집 (REPLACE semantic, atomic profile + journey).
 * authenticated client 로 호출. RLS 가 auth.uid() = user_id 강제.
 * M3: error logging (Q-7 관측성).
 *
 * v1.1 CQ1: RPC 'not found' EXCEPTION 을 PROFILE_NOT_FOUND 코드로 재전파하여
 *           route handler 가 404 로 매핑 가능하도록.
 */
export async function applyUserExplicitEdit(
  client: SupabaseClient,
  userId: string,
  profilePatch: Record<string, unknown>,
  journeyPatch: Record<string, unknown>,
): Promise<{ applied_profile: string[]; applied_journey: string[] }> {
  const { data, error } = await client.rpc('apply_user_explicit_edit', {
    p_user_id: userId,
    p_profile_patch: profilePatch,
    p_journey_patch: journeyPatch,
  });
  if (error) {
    console.error('[applyUserExplicitEdit] rpc error', {
      userId,
      code: error.code,
      message: error.message,
    });
    // v1.1 RT-2: Use SQLSTATE P0002 (no_data_found) instead of message regex.
    // Regex matching on 'not found' is fragile — migration 019c sets
    // USING ERRCODE = 'P0002' on the RAISE EXCEPTION for PROFILE_NOT_FOUND case.
    if (error.code === 'P0002') {
      const err = new Error('PROFILE_NOT_FOUND');
      (err as Error & { code?: string }).code = 'PROFILE_NOT_FOUND';
      throw err;
    }
    throw new Error('Profile edit failed');
  }
  return data as { applied_profile: string[]; applied_journey: string[] };
}
