import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerEventRoutes } from '@/server/features/api/routes/events';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  jsonRequest,
  type TestSession,
} from './helpers';

describe('POST /api/events (integration)', () => {
  const app = createApp();
  let session: TestSession;

  beforeAll(async () => {
    registerEventRoutes(app);
    session = await createRegisteredTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser(session.userId);
  });

  it('정상 이벤트 → 200 + behavior_logs DB 생성', async () => {
    const conversationId = '10000000-0000-4000-8000-000000000001';
    const body = {
      events: [
        {
          event_type: 'card_click',
          target_id: conversationId,
          target_type: 'card',
          metadata: {
            card_id: 'test-card-1',
            domain: 'shopping',
            conversation_id: conversationId,
          },
        },
      ],
    };

    const res = await app.request(
      '/api/events',
      jsonRequest('POST', session.token, body),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(1);

    const verify = createVerifyClient();
    const { data: logs } = await verify
      .from('behavior_logs')
      .select('event_type, user_id, metadata')
      .eq('user_id', session.userId)
      .eq('event_type', 'card_click');
    expect(logs).not.toBeNull();
    expect(logs!.length).toBeGreaterThanOrEqual(1);
    expect(logs![0].metadata).toMatchObject({ card_id: 'test-card-1' });
  });

  it('잘못된 metadata → 스킵, recorded=0', async () => {
    const body = {
      events: [
        {
          event_type: 'card_click',
          metadata: { wrong_field: true },
        },
      ],
    };

    const res = await app.request(
      '/api/events',
      jsonRequest('POST', session.token, body),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.recorded).toBe(0);
  });

  it('미인증 → 401', async () => {
    const res = await app.request('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ event_type: 'card_click', metadata: {} }] }),
    });
    expect(res.status).toBe(401);
  });
});
