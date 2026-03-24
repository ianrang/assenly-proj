import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

/** Supabase 클라이언트 mock 팩토리 */
function createMockClient(data: unknown[] = [], error: unknown = null) {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }),
    insert: vi.fn().mockResolvedValue({ data: null, error }),
  };
  return { from: vi.fn(() => mockQuery), _query: mockQuery };
}

describe('loadRecentMessages', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('최근 N턴 메시지를 로드한다 (user 기준 카운트)', async () => {
    // DB는 created_at DESC로 반환 (최신 먼저)
    const messages = [
      { role: 'assistant', content: 'Here are some', card_data: { cards: [] }, tool_calls: null, created_at: '2026-03-24T10:01:01Z' },
      { role: 'user', content: 'Recommend serum', card_data: null, tool_calls: null, created_at: '2026-03-24T10:01:00Z' },
      { role: 'assistant', content: 'Hi!', card_data: null, tool_calls: null, created_at: '2026-03-24T10:00:01Z' },
      { role: 'user', content: 'Hello', card_data: null, tool_calls: null, created_at: '2026-03-24T10:00:00Z' },
      { role: 'assistant', content: 'Older reply', card_data: null, tool_calls: null, created_at: '2026-03-24T09:00:01Z' },
      { role: 'user', content: 'Older msg', card_data: null, tool_calls: null, created_at: '2026-03-24T09:00:00Z' },
    ];

    const client = createMockClient(messages);
    const { loadRecentMessages } = await import('@/server/core/memory');

    // limit=2턴 → 역순에서 user 2개(index1,3) 카운트 후 3번째 user(index5)에서 cut
    // slice(0,5) → 5개 (assistant,user,assistant,user,assistant) → reverse로 시간순
    const result = await loadRecentMessages(client as never, 'conv-1', 2);

    expect(client.from).toHaveBeenCalledWith('messages');
    // 2턴 = user 2개 + 사이의 모든 메시지 (assistant 포함)
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result.length).toBeLessThanOrEqual(5);
    // 시간순 정렬 확인 (reverse 적용됨) — 첫번째가 가장 오래됨
    expect(result[0].created_at <= result[result.length - 1].created_at).toBe(true);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].created_at >= result[i - 1].created_at).toBe(true);
    }
  });

  it('대화 없음 → 빈 배열', async () => {
    const client = createMockClient([]);
    const { loadRecentMessages } = await import('@/server/core/memory');

    const result = await loadRecentMessages(client as never, 'conv-1', 20);

    expect(result).toEqual([]);
  });

  it('conversationId 빈 문자열이면 에러', async () => {
    const client = createMockClient();
    const { loadRecentMessages } = await import('@/server/core/memory');

    await expect(loadRecentMessages(client as never, '', 20)).rejects.toThrow('conversationId is required');
  });

  it('DB 에러 시 throw (Q-7)', async () => {
    const client = createMockClient(null as never, { message: 'DB connection failed' });
    const { loadRecentMessages } = await import('@/server/core/memory');

    await expect(loadRecentMessages(client as never, 'conv-1', 20)).rejects.toThrow('DB connection failed');
  });
});

describe('saveMessages', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('메시지 배열을 저장한다', async () => {
    const client = createMockClient();
    const { saveMessages } = await import('@/server/core/memory');

    await saveMessages(client as never, 'conv-1', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
    ]);

    expect(client._query.insert).toHaveBeenCalledWith([
      { conversation_id: 'conv-1', role: 'user', content: 'Hello' },
      { conversation_id: 'conv-1', role: 'assistant', content: 'Hi!' },
    ]);
  });

  it('빈 배열 → 에러 없이 리턴', async () => {
    const client = createMockClient();
    const { saveMessages } = await import('@/server/core/memory');

    await saveMessages(client as never, 'conv-1', []);

    expect(client._query.insert).not.toHaveBeenCalled();
  });

  it('conversationId 빈 문자열이면 에러', async () => {
    const client = createMockClient();
    const { saveMessages } = await import('@/server/core/memory');

    await expect(saveMessages(client as never, '', [
      { role: 'user', content: 'Hello' },
    ])).rejects.toThrow('conversationId is required');
  });

  it('DB 에러 시 throw (Q-7)', async () => {
    const client = createMockClient(null as never, { message: 'Insert failed' });
    const { saveMessages } = await import('@/server/core/memory');

    await expect(saveMessages(client as never, 'conv-1', [
      { role: 'user', content: 'Hello' },
    ])).rejects.toThrow('Insert failed');
  });
});
