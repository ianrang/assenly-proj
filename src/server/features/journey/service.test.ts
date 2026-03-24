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
