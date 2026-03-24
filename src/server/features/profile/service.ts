import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// 프로필 서비스 — api-spec.md §2.3
// R-5: shared/ 타입만 import. core/ import 없음 (client 파라미터 주입).
// R-9: features/journey/ import 없음 (P-4 Composition Root에서 조합).
// G-9: export 3개 (upsertProfile, getProfile, updateProfile).
// L-14: ProfileData, ProfileRow export 안 함.
// ============================================================

/** 프로필 UPSERT 입력 (온보딩 4단계 중 UP 변수) */
interface ProfileData {
  skin_type: string;
  hair_type: string | null;
  hair_concerns: string[];
  country: string;
  language: string;
  age_range?: string;
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
