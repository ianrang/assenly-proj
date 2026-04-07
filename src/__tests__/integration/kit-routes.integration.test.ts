import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerKitRoutes } from '@/server/features/api/routes/kit';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  jsonRequest,
  type TestSession,
} from './helpers';

// kit_subscribers 테이블 존재 확인 (migration 008 미적용 시 전체 스킵)
async function checkKitTable(): Promise<boolean> {
  const client = createVerifyClient();
  const { error } = await client.from('kit_subscribers').select('*').limit(0);
  return !error;
}

// beforeAll보다 먼저 실행해야 하므로 top-level await 대신 플래그 사용
let kitTableExists: boolean | null = null;

describe('POST /api/kit/claim (integration)', () => {
  const app = createApp();
  let session: TestSession;
  const testEmail = `test-${Date.now()}@integration-test.example.com`;

  beforeAll(async () => {
    kitTableExists = await checkKitTable();
    if (!kitTableExists) return;

    registerKitRoutes(app);
    session = await createRegisteredTestUser();
  });

  afterAll(async () => {
    if (!kitTableExists || !session) return;
    await cleanupTestUser(session.userId);
  });

  it('정상 → 201 + kit_subscribers DB 생성', async () => {
    if (!kitTableExists) {
      console.log('⏭️  kit_subscribers 테이블 미존재 — 스킵');
      return;
    }

    const res = await app.request(
      '/api/kit/claim',
      jsonRequest('POST', session.token, {
        email: testEmail,
        marketing_consent: true,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.status).toBe('claimed');

    const verify = createVerifyClient();
    const { data: row } = await verify
      .from('kit_subscribers')
      .select('user_id, email_encrypted, email_hash, marketing_consent')
      .eq('user_id', session.userId)
      .single();
    expect(row).not.toBeNull();
    expect(row!.email_encrypted).toBeTruthy();
    expect(row!.email_hash).toBeTruthy();
    expect(row!.marketing_consent).toBe(true);
  });

  it('멱등성 (Q-12) — 동일 이메일 재전송 → 409 KIT_ALREADY_CLAIMED', async () => {
    if (!kitTableExists) {
      console.log('⏭️  kit_subscribers 테이블 미존재 — 스킵');
      return;
    }

    const res = await app.request(
      '/api/kit/claim',
      jsonRequest('POST', session.token, {
        email: testEmail,
        marketing_consent: false,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe('KIT_ALREADY_CLAIMED');
  });

  it('검증 실패 — 이메일 형식 → 400', async () => {
    if (!kitTableExists) {
      console.log('⏭️  kit_subscribers 테이블 미존재 — 스킵');
      return;
    }

    const res = await app.request(
      '/api/kit/claim',
      jsonRequest('POST', session.token, {
        email: 'not-an-email',
        marketing_consent: false,
      }),
    );
    expect(res.status).toBe(400);
  });
});
