import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@/server/features/api/app';
import { registerProfileRoutes } from '@/server/features/api/routes/profile';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  jsonRequest,
  type TestSession,
} from './helpers';

describe('Profile routes (integration)', () => {
  const app = createApp();
  let userA: TestSession;
  let userB: TestSession;

  beforeAll(async () => {
    registerProfileRoutes(app);
    userA = await createRegisteredTestUser();
    userB = await createRegisteredTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser(userA.userId);
    await cleanupTestUser(userB.userId);
  });

  describe('POST /api/profile/onboarding', () => {
    it('정상 요청 → 201 + user_profiles + journeys DB 생성', async () => {
      const body = {
        skin_type: 'combination',
        hair_type: 'wavy',
        hair_concerns: ['damage'],
        country: 'US',
        language: 'en',
        age_range: '25-29',
        skin_concerns: ['acne', 'pores'],
        interest_activities: ['shopping', 'clinic'],
        stay_days: 5,
        budget_level: 'moderate',
        travel_style: ['relaxed'],
      };

      const res = await app.request(
        '/api/profile/onboarding',
        jsonRequest('POST', userA.token, body),
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.data.profile_id).toBe(userA.userId);
      expect(json.data.journey_id).toBeDefined();

      const verify = createVerifyClient();

      const { data: profile } = await verify
        .from('user_profiles')
        .select('skin_type, hair_type, country, language')
        .eq('user_id', userA.userId)
        .single();
      expect(profile).not.toBeNull();
      expect(profile!.skin_type).toBe('combination');
      expect(profile!.hair_type).toBe('wavy');
      expect(profile!.country).toBe('US');

      const { data: journey } = await verify
        .from('journeys')
        .select('skin_concerns, interest_activities, stay_days, budget_level, status')
        .eq('id', json.data.journey_id)
        .single();
      expect(journey).not.toBeNull();
      expect(journey!.skin_concerns).toEqual(['acne', 'pores']);
      expect(journey!.stay_days).toBe(5);
      expect(journey!.status).toBe('active');
    });

    it('멱등성 (Q-12) — 재전송 시 기존 journey 갱신, 중복 미생성', async () => {
      const body = {
        skin_type: 'oily',
        country: 'US',
        language: 'en',
        hair_concerns: [],
        skin_concerns: ['wrinkles'],
        interest_activities: ['shopping'],
        stay_days: 3,
        budget_level: 'premium',
      };

      const res = await app.request(
        '/api/profile/onboarding',
        jsonRequest('POST', userA.token, body),
      );
      expect(res.status).toBe(201);

      const verify = createVerifyClient();
      const { data: journeys } = await verify
        .from('journeys')
        .select('id')
        .eq('user_id', userA.userId)
        .eq('status', 'active');
      expect(journeys).toHaveLength(1);
    });
  });

  describe('GET /api/profile', () => {
    it('정상 조회 → 200 + profile + active_journey', async () => {
      const res = await app.request('/api/profile', {
        headers: { Authorization: `Bearer ${userA.token}` },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.profile).not.toBeNull();
      expect(json.data.profile.skin_type).toBe('oily');
      expect(json.data.active_journey).not.toBeNull();
      expect(json.data.active_journey.status).toBe('active');
    });

    it('RLS 격리 — User B는 자신의 프로필만 조회 (User A 미접근)', async () => {
      const res = await app.request('/api/profile', {
        headers: { Authorization: `Bearer ${userB.token}` },
      });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error.code).toBe('PROFILE_NOT_FOUND');
    });

    it('미인증 → 401', async () => {
      const res = await app.request('/api/profile');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/profile', () => {
    it('부분 업데이트 → 200 + DB 반영 확인', async () => {
      const res = await app.request(
        '/api/profile',
        jsonRequest('PUT', userA.token, { language: 'ja', age_range: '30-34' }),
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.updated).toBe(true);

      const verify = createVerifyClient();
      const { data: profile } = await verify
        .from('user_profiles')
        .select('language, age_range, skin_type')
        .eq('user_id', userA.userId)
        .single();
      expect(profile!.language).toBe('ja');
      expect(profile!.age_range).toBe('30-34');
      expect(profile!.skin_type).toBe('oily');
    });

    it('빈 body → 400 (최소 1필드 필수)', async () => {
      const res = await app.request(
        '/api/profile',
        jsonRequest('PUT', userA.token, {}),
      );
      expect(res.status).toBe(400);
    });
  });
});
