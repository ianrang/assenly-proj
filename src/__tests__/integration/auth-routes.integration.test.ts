import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerAuthRoutes } from '@/server/features/api/routes/auth';
import {
  createTestSession,
  cleanupTestUser,
  createVerifyClient,
  jsonRequest,
  type TestSession,
} from './helpers';

describe('POST /api/auth/anonymous (integration)', () => {
  const app = createApp();
  let session: TestSession;
  const userIds: string[] = [];

  beforeAll(async () => {
    registerAuthRoutes(app);
    session = await createTestSession();
    userIds.push(session.userId);
  });

  afterAll(async () => {
    for (const id of userIds) {
      await cleanupTestUser(id);
    }
  });

  it('정상 요청 → 201 + users/consent_records DB 생성 확인', async () => {
    const res = await app.request(
      '/api/auth/anonymous',
      jsonRequest('POST', session.token, { consent: { data_retention: true } }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.user_id).toBe(session.userId);
    expect(json.meta.timestamp).toBeDefined();

    const verify = createVerifyClient();

    const { data: userRow } = await verify
      .from('users')
      .select('id, auth_method')
      .eq('id', session.userId)
      .single();
    expect(userRow).not.toBeNull();
    expect(userRow!.auth_method).toBe('anonymous');

    const { data: consentRow } = await verify
      .from('consent_records')
      .select('user_id, data_retention')
      .eq('user_id', session.userId)
      .single();
    expect(consentRow).not.toBeNull();
    expect(consentRow!.data_retention).toBe(true);
  });

  it('멱등성 (Q-12) — 동일 요청 재전송 시 중복 미생성', async () => {
    const res = await app.request(
      '/api/auth/anonymous',
      jsonRequest('POST', session.token, { consent: { data_retention: true } }),
    );
    expect(res.status).toBe(201);

    const verify = createVerifyClient();
    const { data: rows } = await verify
      .from('users')
      .select('id')
      .eq('id', session.userId);
    expect(rows).toHaveLength(1);
  });

  it('미인증 요청 → 401 AUTH_REQUIRED', async () => {
    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: { data_retention: true } }),
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  // rate limit은 requireAuth 전에 실행되므로 동일 IP(127.0.0.1)로
  // 3회 초과 시 429. X-Forwarded-For로 IP를 분리하여 rate limit 격리.
  it('검증 실패 — consent 누락 → 400', async () => {
    const headers = {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
      'X-Forwarded-For': '10.0.0.4',
    };
    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('검증 실패 — data_retention=false → 400', async () => {
    const headers = {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
      'X-Forwarded-For': '10.0.0.5',
    };
    const res = await app.request('/api/auth/anonymous', {
      method: 'POST',
      headers,
      body: JSON.stringify({ consent: { data_retention: false } }),
    });
    expect(res.status).toBe(400);
  });
});
