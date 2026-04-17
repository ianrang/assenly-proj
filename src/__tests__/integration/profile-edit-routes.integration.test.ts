import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  authHeaders,
  type TestSession,
} from './helpers';

const BASE_URL = 'http://localhost:3000';

describe('PUT /api/profile/edit (integration)', () => {
  let userA: TestSession;
  const admin = createVerifyClient();

  beforeAll(async () => {
    userA = await createRegisteredTestUser();
    // 편집 테스트 전 user_profiles row 생성 (Start 경로 시뮬레이션)
    await admin.from('user_profiles').upsert({
      user_id: userA.userId,
      language: 'en',
      skin_types: ['oily'],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  });

  afterAll(async () => {
    await cleanupTestUser(userA.userId);
  });

  // T18: zod .strict() — unknown key 거부
  describe('T18: zod strict — unknown key', () => {
    it('rejects profile.language (NOT NULL field not editable)', async () => {
      const res = await fetch(`${BASE_URL}/api/profile/edit`, {
        method: 'PUT',
        headers: authHeaders(userA.token),
        body: JSON.stringify({
          profile: { language: 'ko' },
          journey: {},
        }),
      });
      expect(res.status).toBe(400);
    });

    it('rejects profile.unknown_key', async () => {
      const res = await fetch(`${BASE_URL}/api/profile/edit`, {
        method: 'PUT',
        headers: authHeaders(userA.token),
        body: JSON.stringify({
          profile: { unknown_field: 'x' },
          journey: {},
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  // T22: zod .refine() — empty payload 거부
  describe('T22: zod refine — empty payload', () => {
    it('rejects {profile: {}, journey: {}}', async () => {
      const res = await fetch(`${BASE_URL}/api/profile/edit`, {
        method: 'PUT',
        headers: authHeaders(userA.token),
        body: JSON.stringify({ profile: {}, journey: {} }),
      });
      expect(res.status).toBe(400);
    });
  });

  // T23: error code mapping — 404 vs 500
  describe('T23: error code 매핑', () => {
    it('returns 404 PROFILE_NOT_FOUND when user_profiles row missing', async () => {
      // Setup: userA 의 user_profiles row 만 임시 삭제 (users row 는 유지)
      await admin.from('user_profiles').delete().eq('user_id', userA.userId);

      try {
        const res = await fetch(`${BASE_URL}/api/profile/edit`, {
          method: 'PUT',
          headers: authHeaders(userA.token),
          body: JSON.stringify({
            profile: { hair_type: 'curly' },
            journey: {},
          }),
        });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error.code).toBe('PROFILE_NOT_FOUND');
      } finally {
        // Cleanup: 복구 (다음 테스트 영향 방지)
        await admin.from('user_profiles').insert({
          user_id: userA.userId,
          language: 'en',
        });
      }
    });
  });

  // Smoke test — 정상 편집 1개 필드 (T24 E2E 의 API 레이어 축약)
  describe('Smoke: 정상 편집 → 200 + applied_profile', () => {
    it('profile.skin_types REPLACE → 200', async () => {
      const res = await fetch(`${BASE_URL}/api/profile/edit`, {
        method: 'PUT',
        headers: authHeaders(userA.token),
        body: JSON.stringify({
          profile: { skin_types: ['dry'] },
          journey: {},
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.applied_profile).toContain('skin_types');
    });
  });
});
