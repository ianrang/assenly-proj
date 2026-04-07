import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerChatRoutes } from '@/server/features/api/routes/chat';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  type TestSession,
} from './helpers';

// conversations.ui_messages 컬럼 존재 확인 (migration 009 미적용 시 스킵)
async function checkUiMessagesColumn(): Promise<boolean> {
  const client = createVerifyClient();
  const { error } = await client.from('conversations').select('ui_messages').limit(0);
  return !error;
}

describe('GET /api/chat/history (integration)', () => {
  const app = createApp();
  let session: TestSession;
  let testConversationId: string;
  let columnExists = true;

  beforeAll(async () => {
    columnExists = await checkUiMessagesColumn();
    if (!columnExists) return;

    registerChatRoutes(app);
    session = await createRegisteredTestUser();

    // 테스트 대화 데이터 직접 삽입 (service_role)
    const verify = createVerifyClient();
    const testMessages = [
      { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
      { id: 'msg-2', role: 'assistant', parts: [{ type: 'text', text: 'Hi there!' }] },
    ];

    const { data: conv, error } = await verify
      .from('conversations')
      .insert({
        user_id: session.userId,
        ui_messages: testMessages,
        locale: 'en',
      })
      .select('id')
      .single();
    if (error || !conv) throw new Error(`conversation insert failed: ${error?.message}`);
    testConversationId = conv.id;
  });

  afterAll(async () => {
    if (!columnExists || !session) return;
    await cleanupTestUser(session.userId);
  });

  it('conversation_id 지정 → 200 + 저장된 ui_messages 반환', async () => {
    if (!columnExists) {
      console.log('⏭️  conversations.ui_messages 미존재 (migration 009) — 스킵');
      return;
    }

    const res = await app.request(
      `/api/chat/history?conversation_id=${testConversationId}`,
      { headers: { Authorization: `Bearer ${session.token}` } },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.conversation_id).toBe(testConversationId);
    expect(json.data.messages).toHaveLength(2);
    expect(json.data.messages[0].role).toBe('user');
    expect(json.data.messages[1].role).toBe('assistant');
  });

  it('conversation_id 미지정 → 200 + 최신 대화 반환', async () => {
    if (!columnExists) {
      console.log('⏭️  conversations.ui_messages 미존재 (migration 009) — 스킵');
      return;
    }

    const res = await app.request('/api/chat/history', {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.conversation_id).toBe(testConversationId);
    expect(json.data.messages).toHaveLength(2);
  });

  it('대화 없는 유저 → 200 + 빈 messages', async () => {
    if (!columnExists) {
      console.log('⏭️  conversations.ui_messages 미존재 (migration 009) — 스킵');
      return;
    }

    const userB = await createRegisteredTestUser();

    const res = await app.request('/api/chat/history', {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.messages).toEqual([]);
    expect(json.data.conversation_id).toBeNull();

    await cleanupTestUser(userB.userId);
  });

  it('미인증 → 401', async () => {
    if (!columnExists) {
      console.log('⏭️  conversations.ui_messages 미존재 (migration 009) — 스킵');
      return;
    }

    const res = await app.request('/api/chat/history');
    expect(res.status).toBe(401);
  });
});
