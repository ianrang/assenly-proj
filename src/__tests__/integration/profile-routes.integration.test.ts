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

  // ============================================================
  // NEW-21 WS1: 온보딩 → 프로필 저장 통합 테스트 (3건)
  // OnboardingChips가 보내는 최소 body (skin_type + skin_concerns)
  // ============================================================

  describe('POST /api/profile/onboarding — minimal (NEW-9 OnboardingChips)', () => {
    let minimalUser: TestSession;

    beforeAll(async () => {
      minimalUser = await createRegisteredTestUser();
    });

    afterAll(async () => {
      await cleanupTestUser(minimalUser.userId);
    });

    it('skin_type + skin_concerns만 전송 → 201 + DB 프로필/여정 생성', async () => {
      const body = { skin_type: 'dry', skin_concerns: ['acne', 'wrinkles'] };

      const res = await app.request(
        '/api/profile/onboarding',
        jsonRequest('POST', minimalUser.token, body),
      );
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.data.profile_id).toBe(minimalUser.userId);
      expect(json.data.journey_id).toBeDefined();

      // DB 검증 — optional 필드가 null/기본값으로 저장
      const verify = createVerifyClient();

      const { data: profile } = await verify
        .from('user_profiles')
        .select('skin_type, hair_type, country, language, age_range')
        .eq('user_id', minimalUser.userId)
        .single();
      expect(profile).not.toBeNull();
      expect(profile!.skin_type).toBe('dry');
      expect(profile!.hair_type).toBeNull();
      expect(profile!.country).toBeNull();
      expect(profile!.language).toBe('en'); // default
      expect(profile!.age_range).toBeNull();

      const { data: journey } = await verify
        .from('journeys')
        .select('skin_concerns, interest_activities, stay_days, budget_level, status')
        .eq('id', json.data.journey_id)
        .single();
      expect(journey).not.toBeNull();
      expect(journey!.skin_concerns).toEqual(['acne', 'wrinkles']);
      expect(journey!.interest_activities).toEqual(['shopping']); // default
      expect(journey!.stay_days).toBeNull();
      expect(journey!.budget_level).toBeNull();
      expect(journey!.status).toBe('active');
    });

    it('최소 온보딩 후 GET /api/profile → 저장된 프로필 + 활성 여정 반환', async () => {
      const res = await app.request('/api/profile', {
        headers: { Authorization: `Bearer ${minimalUser.token}` },
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.profile.skin_type).toBe('dry');
      expect(json.data.profile.hair_type).toBeNull();
      expect(json.data.active_journey).not.toBeNull();
      expect(json.data.active_journey.skin_concerns).toEqual(['acne', 'wrinkles']);
    });

    it('skin_concerns 빈 배열 → 201 (concerns 없이 온보딩 가능)', async () => {
      const emptyUser = await createRegisteredTestUser();
      try {
        const body = { skin_type: 'oily', skin_concerns: [] };
        const res = await app.request(
          '/api/profile/onboarding',
          jsonRequest('POST', emptyUser.token, body),
        );
        expect(res.status).toBe(201);

        const verify = createVerifyClient();
        const { data: journey } = await verify
          .from('journeys')
          .select('skin_concerns')
          .eq('user_id', emptyUser.userId)
          .eq('status', 'active')
          .single();
        expect(journey!.skin_concerns).toEqual([]);
      } finally {
        await cleanupTestUser(emptyUser.userId);
      }
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
