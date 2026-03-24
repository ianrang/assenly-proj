import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// 여정 서비스 — api-spec.md §2.3, §2.4
// R-5: shared/ 타입만 import. core/ import 없음 (client 파라미터 주입).
// R-9: features/profile/ import 없음 (P-4 Composition Root에서 조합).
// G-9: export 2개 (createOrUpdateJourney, getActiveJourney).
// L-14: JourneyData, JourneyRow export 안 함.
// ============================================================

/** 여정 생성/갱신 입력 (온보딩 4단계 중 JC 변수) */
interface JourneyData {
  skin_concerns: string[];
  interest_activities: string[];
  stay_days: number;
  start_date?: string;
  budget_level: string;
  travel_style: string[];
}

/** DB 조회 결과 */
interface JourneyRow {
  id: string;
  user_id: string;
  country: string;
  city: string;
  skin_concerns: string[] | null;
  interest_activities: string[] | null;
  stay_days: number | null;
  start_date: string | null;
  end_date: string | null;
  budget_level: string | null;
  travel_style: string[] | null;
  status: string;
  created_at: string;
}

/**
 * end_date = start_date + stay_days (api-spec B.4).
 * 클라이언트 전송 불필요 — 서버에서 자동 계산.
 */
function calculateEndDate(
  startDate: string | undefined,
  stayDays: number,
): string | null {
  if (!startDate) return null;
  const date = new Date(startDate);
  date.setDate(date.getDate() + stayDays);
  return date.toISOString().split('T')[0];
}

/**
 * 활성 여정 생성 또는 갱신.
 * Q-12 멱등성: SELECT 확인 → 존재 시 UPDATE, 없으면 INSERT.
 * 재시도 시 중복 journey 미생성, 기존 journey_id 보존.
 */
export async function createOrUpdateJourney(
  client: SupabaseClient,
  userId: string,
  data: JourneyData,
): Promise<{ journeyId: string }> {
  const endDate = calculateEndDate(data.start_date, data.stay_days);

  const journeyFields = {
    skin_concerns: data.skin_concerns,
    interest_activities: data.interest_activities,
    stay_days: data.stay_days,
    start_date: data.start_date ?? null,
    end_date: endDate,
    budget_level: data.budget_level,
    travel_style: data.travel_style,
  };

  // Q-12: 기존 활성 여정 확인
  const { data: existing, error: selectError } = await client
    .from('journeys')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error('Journey lookup failed');
  }

  if (existing) {
    // UPDATE 기존 활성 여정
    const { error: updateError } = await client
      .from('journeys')
      .update(journeyFields)
      .eq('id', existing.id);

    if (updateError) {
      throw new Error('Journey update failed');
    }

    return { journeyId: existing.id };
  }

  // INSERT 새 여정 (Q-13: user_profiles 이후 실행)
  const { data: inserted, error: insertError } = await client
    .from('journeys')
    .insert({
      user_id: userId,
      country: 'KR',
      city: 'seoul',
      ...journeyFields,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error('Journey creation failed');
  }

  return { journeyId: inserted.id };
}

/**
 * 활성 여정 조회. 미존재 시 null.
 * GET /api/profile route에서 프로필과 합성 (P-4, L-1).
 */
export async function getActiveJourney(
  client: SupabaseClient,
  userId: string,
): Promise<JourneyRow | null> {
  const { data, error } = await client
    .from('journeys')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error('Journey retrieval failed');
  }

  return data;
}
