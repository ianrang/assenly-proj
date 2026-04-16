import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// 여정 서비스 — api-spec.md §2.3, §2.4
// R-5: shared/ 타입만 import. core/ import 없음 (client 파라미터 주입).
// R-9: features/profile/ import 없음 (P-4 Composition Root에서 조합).
// G-9: export 2개 (createOrUpdateJourney, getActiveJourney).
// L-14: JourneyData, JourneyRow export 안 함.
// ============================================================

/**
 * 여정 생성/갱신 입력 (온보딩 JC 변수).
 * v1.2 (NEW-9): OnboardingChips 인라인 온보딩은 skin_concerns만 수집.
 * stay_days, budget_level은 optional (DB journeys NULLABLE).
 */
interface JourneyData {
  skin_concerns: string[];
  interest_activities: string[];
  stay_days: number | null;
  start_date?: string | null;
  budget_level: string | null;
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
  startDate: string | null | undefined,
  stayDays: number | null,
): string | null {
  if (!startDate || stayDays === null) return null;
  const date = new Date(startDate);
  date.setDate(date.getDate() + stayDays);
  return date.toISOString().split('T')[0];
}

/**
 * 활성 여정 생성 또는 갱신.
 *
 * Q-12 멱등성: SELECT 확인 → 존재 시 UPDATE, 없으면 INSERT.
 * 재시도 시 중복 journey 미생성, 기존 journey_id 보존.
 *
 * NEW-9b 경합 방어 (S8):
 *   DB에 부분 유니크 인덱스 ux_journeys_user_active (WHERE status='active') 존재.
 *   동시성 경합으로 두 요청이 모두 SELECT 시 빈 결과를 보면 두 요청 모두 INSERT를 시도한다.
 *   두 번째 INSERT는 unique_violation(Postgres 23505)으로 실패 → catch 후 재조회+UPDATE 1회 재시도.
 *   재시도도 실패하면 throw (상위 handler가 500 응답 → 클라이언트 자기 치유 재전송).
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

  // 1차 시도: SELECT → UPDATE or INSERT
  const firstAttempt = await selectUpdateOrInsert(
    client,
    userId,
    journeyFields,
  );
  if (firstAttempt.ok) return { journeyId: firstAttempt.journeyId };

  // INSERT 경합(23505) 재시도: 다른 요청이 방금 INSERT를 성공시켰을 가능성
  // 재조회 후 UPDATE 경로로 재진입
  if (firstAttempt.reason === 'unique_violation') {
    const retry = await selectUpdateOrInsert(client, userId, journeyFields);
    if (retry.ok) return { journeyId: retry.journeyId };
    throw new Error('Journey creation failed');
  }

  throw new Error(mapReasonToMessage(firstAttempt.reason));
}

function mapReasonToMessage(reason: string): string {
  switch (reason) {
    case 'lookup_failed':
      return 'Journey lookup failed';
    case 'update_failed':
      return 'Journey update failed';
    case 'create_failed':
      return 'Journey creation failed';
    default:
      return 'Journey persistence failed';
  }
}

/**
 * Private helper: SELECT → UPDATE 분기 또는 INSERT 시도.
 * unique_violation을 구분하여 reason으로 반환.
 */
async function selectUpdateOrInsert(
  client: SupabaseClient,
  userId: string,
  journeyFields: Omit<JourneyData, 'start_date'> & {
    start_date: string | null;
    end_date: string | null;
  },
): Promise<
  | { ok: true; journeyId: string }
  | { ok: false; reason: 'lookup_failed' | 'update_failed' | 'unique_violation' | 'create_failed' }
> {
  // Q-12: 기존 활성 여정 확인
  const { data: existing, error: selectError } = await client
    .from('journeys')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (selectError) return { ok: false, reason: 'lookup_failed' };

  if (existing) {
    const { error: updateError } = await client
      .from('journeys')
      .update(journeyFields)
      .eq('id', existing.id);

    if (updateError) return { ok: false, reason: 'update_failed' };
    return { ok: true, journeyId: existing.id };
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

  if (insertError) {
    // Postgres 23505 unique_violation (ux_journeys_user_active)
    // Supabase는 error.code를 제공하지만 문자열로 안전 체크
    const code = (insertError as { code?: string }).code;
    if (code === '23505') {
      return { ok: false, reason: 'unique_violation' };
    }
    return { ok: false, reason: 'create_failed' };
  }

  if (!inserted) return { ok: false, reason: 'create_failed' };
  return { ok: true, journeyId: inserted.id };
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
