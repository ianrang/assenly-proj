import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { Treatment } from '@/shared/types/domain';

function createTreatment(
  overrides: Partial<Treatment> & { id: string },
): Treatment {
  return {
    name: { en: 'Test Treatment' },
    description: null,
    category: null,
    subcategory: null,
    target_concerns: [],
    suitable_skin_types: [],
    downtime_days: null,
    price: null,
    price_min: null,
    price_max: null,
    price_currency: 'KRW',
    price_source: null,
    range_source: null,
    price_updated_at: null,
    price_source_url: null,
    duration_minutes: null,
    session_count: null,
    precautions: null,
    aftercare: null,
    is_highlighted: false,
    highlight_badge: null,
    rating: null,
    review_count: 0,
    images: [],
    tags: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const TODAY = new Date('2026-04-01');

describe('treatment/scoreTreatments', () => {
  it('safe: 다운타임 < 잔여일 → 기본 점수', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    const treatments = [
      createTreatment({ id: 't1', downtime_days: 2 }),
    ];
    // endDate 2026-04-11 → remaining 10일, downtime 2 < 10 → safe
    const result = scoreTreatments(treatments, '2026-04-11', null, TODAY);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.5);
    expect(result[0].warnings).toEqual([]);
  });

  it('excluded: 다운타임 > 잔여일 → 제외 (PRD §4-A)', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    const treatments = [
      createTreatment({ id: 't1', downtime_days: 8 }),
    ];
    // remaining 5일, downtime 8 > 5 → excluded
    const result = scoreTreatments(treatments, '2026-04-06', null, TODAY);

    expect(result).toHaveLength(0);
  });

  it('warning: 다운타임 >= 50% 잔여일 → 경고 + 점수 감산', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    const treatments = [
      createTreatment({ id: 't1', downtime_days: 3 }),
    ];
    // remaining 6일, downtime 3 >= 6*0.5=3 → warning
    const result = scoreTreatments(treatments, '2026-04-07', null, TODAY);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.4);
    expect(result[0].warnings).toHaveLength(1);
    expect(result[0].warnings[0]).toContain('3d');
  });

  it('경계값: downtime === remaining → excluded가 아닌 warning', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    const treatments = [
      createTreatment({ id: 't1', downtime_days: 5 }),
    ];
    // remaining 5일, downtime 5 > 5 = false → not excluded
    // downtime 5 >= 5*0.5=2.5 → warning
    const result = scoreTreatments(treatments, '2026-04-06', null, TODAY);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.4);
  });

  it('VP-3: downtime_days null → safe (다운타임 정보 없음)', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    const treatments = [
      createTreatment({ id: 't1', downtime_days: null }),
    ];

    const result = scoreTreatments(treatments, '2026-04-06', null, TODAY);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.5);
  });

  it('VP-3: endDate/stayDays 모두 null → 전체 포함', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    const treatments = [
      createTreatment({ id: 't1', downtime_days: 10 }),
      createTreatment({ id: 't2', downtime_days: 1 }),
    ];
    // remainingDays = null → checkDowntimeSafety returns "unknown" → 포함
    const result = scoreTreatments(treatments, null, null, TODAY);

    expect(result).toHaveLength(2);
  });

  it('VP-1: is_highlighted 그대로 전달', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    const treatments = [
      createTreatment({ id: 't1', is_highlighted: true }),
      createTreatment({ id: 't2', is_highlighted: false }),
    ];

    const result = scoreTreatments(treatments, null, 7, TODAY);

    expect(result[0].is_highlighted).toBe(true);
    expect(result[1].is_highlighted).toBe(false);
  });

  it('빈 배열 → 빈 배열', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    const result = scoreTreatments([], '2026-04-06', null, TODAY);
    expect(result).toEqual([]);
  });

  it('calculateRemainingDays: endDate 기반 계산', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    // endDate 2026-04-04, today 2026-04-01 → 3일
    // downtime 4 > 3 → excluded
    const treatments = [
      createTreatment({ id: 't1', downtime_days: 4 }),
    ];
    const result = scoreTreatments(treatments, '2026-04-04', null, TODAY);
    expect(result).toHaveLength(0);
  });

  it('calculateRemainingDays: stayDays 폴백', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    // endDate null, stayDays 3 → remaining 3
    // downtime 4 > 3 → excluded
    const treatments = [
      createTreatment({ id: 't1', downtime_days: 4 }),
    ];
    const result = scoreTreatments(treatments, null, 3, TODAY);
    expect(result).toHaveLength(0);
  });

  it('calculateRemainingDays: 둘 다 null → unknown → 전체 포함', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    const treatments = [
      createTreatment({ id: 't1', downtime_days: 100 }),
    ];
    const result = scoreTreatments(treatments, null, null, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(0.5);
  });

  it('calculateRemainingDays: endDate가 stayDays보다 우선', async () => {
    const { scoreTreatments } = await import(
      '@/server/features/beauty/treatment'
    );

    // endDate 2026-04-04 → 3일 남음. stayDays 10 (무시됨).
    // downtime 4 > 3 → excluded (endDate 우선이면 excluded, stayDays 우선이면 safe)
    const treatments = [
      createTreatment({ id: 't1', downtime_days: 4 }),
    ];
    const result = scoreTreatments(treatments, '2026-04-04', 10, TODAY);
    expect(result).toHaveLength(0); // endDate 기준으로 excluded
  });
});
