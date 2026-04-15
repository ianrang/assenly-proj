import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

describe('journey/service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOrUpdateJourney', () => {
    const baseData = {
      skin_concerns: ['acne', 'pores'],
      interest_activities: ['shopping', 'clinic'],
      stay_days: 5,
      start_date: '2026-04-01',
      budget_level: 'moderate',
      travel_style: ['efficient'],
    };

    function createSelectThenInsertClient(
      selectResult: { data: unknown; error: unknown },
      insertResult: { data: unknown; error: unknown },
    ) {
      const mockSingle = vi.fn().mockResolvedValue(insertResult);
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });
      const mockMaybeSingle = vi.fn().mockResolvedValue(selectResult);
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      // eq chain: .eq('user_id', x).eq('status', 'active').limit(1).maybeSingle()
      const mockEq = vi.fn()
        .mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ limit: mockLimit }) });

      return {
        client: {
          from: vi.fn(() => ({
            select: vi.fn().mockReturnValue({ eq: mockEq }),
            insert: mockInsert,
          })),
        },
        mockInsert,
      };
    }

    function createSelectThenUpdateClient(
      selectResult: { data: unknown; error: unknown },
      updateResult: { error: unknown },
    ) {
      const mockUpdateEq = vi.fn().mockResolvedValue(updateResult);
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });
      const mockMaybeSingle = vi.fn().mockResolvedValue(selectResult);
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEq = vi.fn()
        .mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ limit: mockLimit }) });

      return {
        client: {
          from: vi.fn(() => ({
            select: vi.fn().mockReturnValue({ eq: mockEq }),
            update: mockUpdate,
          })),
        },
        mockUpdate,
      };
    }

    it('신규: 활성 여정 없음 -> INSERT + journeyId 반환', async () => {
      const { client, mockInsert } = createSelectThenInsertClient(
        { data: null, error: null },
        { data: { id: 'journey-new-123' }, error: null },
      );

      const { createOrUpdateJourney } = await import(
        '@/server/features/journey/service'
      );
      const result = await createOrUpdateJourney(
        client as never,
        'user-123',
        baseData,
      );

      expect(result).toEqual({ journeyId: 'journey-new-123' });
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          country: 'KR',
          city: 'seoul',
          skin_concerns: ['acne', 'pores'],
          end_date: '2026-04-06',
        }),
      );
    });

    it('기존: 활성 여정 있음 -> UPDATE + 기존 id 반환', async () => {
      const { client, mockUpdate } = createSelectThenUpdateClient(
        { data: { id: 'journey-existing-456' }, error: null },
        { error: null },
      );

      const { createOrUpdateJourney } = await import(
        '@/server/features/journey/service'
      );
      const result = await createOrUpdateJourney(
        client as never,
        'user-123',
        baseData,
      );

      expect(result).toEqual({ journeyId: 'journey-existing-456' });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          skin_concerns: ['acne', 'pores'],
          end_date: '2026-04-06',
        }),
      );
    });

    it('SELECT 실패 시 throw', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'select error' },
      });
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEq = vi.fn()
        .mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ limit: mockLimit }) });
      const client = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({ eq: mockEq }),
        })),
      };

      const { createOrUpdateJourney } = await import(
        '@/server/features/journey/service'
      );

      await expect(
        createOrUpdateJourney(client as never, 'user-123', baseData),
      ).rejects.toThrow('Journey lookup failed');
    });

    it('end_date 계산: start_date + stay_days (연도 넘김)', async () => {
      const { client, mockInsert } = createSelectThenInsertClient(
        { data: null, error: null },
        { data: { id: 'j-1' }, error: null },
      );

      const { createOrUpdateJourney } = await import(
        '@/server/features/journey/service'
      );
      await createOrUpdateJourney(client as never, 'user-123', {
        ...baseData,
        start_date: '2026-12-28',
        stay_days: 5,
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ end_date: '2027-01-02' }),
      );
    });

    it('start_date 없으면 end_date도 null', async () => {
      const { client, mockInsert } = createSelectThenInsertClient(
        { data: null, error: null },
        { data: { id: 'j-2' }, error: null },
      );

      const { createOrUpdateJourney } = await import(
        '@/server/features/journey/service'
      );
      await createOrUpdateJourney(client as never, 'user-123', {
        ...baseData,
        start_date: undefined,
      });

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ end_date: null, start_date: null }),
      );
    });

    // NEW-9b: unique_violation 경합 재시도 — ux_journeys_user_active 부분 유니크 인덱스
    it('경합(23505): 1차 SELECT=빈 + INSERT=23505 → 2차 SELECT=기존 + UPDATE 성공', async () => {
      // 2회 호출에 대한 상태 기반 mock — maybeSingle은 1차=null, 2차=기존 반환
      let selectCallCount = 0;
      const mockMaybeSingle = vi.fn().mockImplementation(() => {
        selectCallCount += 1;
        return Promise.resolve(
          selectCallCount === 1
            ? { data: null, error: null }
            : { data: { id: 'journey-raced-789' }, error: null },
        );
      });
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockStatusEq = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockUserEq = vi.fn().mockReturnValue({ eq: mockStatusEq });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockUserEq });

      // INSERT: 1차 호출에서 23505 반환
      const mockInsertSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      });
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockInsertSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

      // UPDATE: 재시도 시 성공
      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

      const client = {
        from: vi.fn(() => ({
          select: mockSelect,
          insert: mockInsert,
          update: mockUpdate,
        })),
      };

      const { createOrUpdateJourney } = await import(
        '@/server/features/journey/service'
      );
      const result = await createOrUpdateJourney(
        client as never,
        'user-123',
        baseData,
      );

      expect(result).toEqual({ journeyId: 'journey-raced-789' });
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(selectCallCount).toBe(2);
    });

    it('INSERT 에러가 23505가 아니면 즉시 create_failed throw (재시도 없음)', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEq = vi.fn()
        .mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ limit: mockLimit }) });
      const mockInsertSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23502', message: 'not null violation' },
      });
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockInsertSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

      const client = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnValue({ eq: mockEq }),
          insert: mockInsert,
        })),
      };

      const { createOrUpdateJourney } = await import(
        '@/server/features/journey/service'
      );
      await expect(
        createOrUpdateJourney(client as never, 'user-123', baseData),
      ).rejects.toThrow('Journey creation failed');
    });
  });

  describe('getActiveJourney', () => {
    it('존재: JourneyRow 반환', async () => {
      const journeyRow = {
        id: 'journey-123',
        user_id: 'user-123',
        country: 'KR',
        city: 'seoul',
        status: 'active',
      };
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: journeyRow, error: null });
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEq2 = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
      const client = { from: vi.fn(() => ({ select: mockSelect })) };

      const { getActiveJourney } = await import(
        '@/server/features/journey/service'
      );
      const result = await getActiveJourney(client as never, 'user-123');

      expect(result).toEqual(journeyRow);
    });

    it('미존재: null 반환', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEq2 = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
      const client = { from: vi.fn(() => ({ select: mockSelect })) };

      const { getActiveJourney } = await import(
        '@/server/features/journey/service'
      );
      const result = await getActiveJourney(client as never, 'user-123');

      expect(result).toBeNull();
    });
  });
});
