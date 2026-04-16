import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createRegisteredTestUser,
  cleanupTestUser,
  createVerifyClient,
  type TestSession,
} from './helpers';
import { createClient } from '@supabase/supabase-js';
import {
  PROFILE_FIELD_SPEC,
  JOURNEY_FIELD_SPEC,
} from '@/shared/constants/profile-field-spec';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe('RPC Hardening (integration)', () => {
  let userA: TestSession;
  let userB: TestSession;
  let userC: TestSession;
  let userD: TestSession;
  const admin = createVerifyClient();

  beforeAll(async () => {
    userA = await createRegisteredTestUser();
    userB = await createRegisteredTestUser();
    userC = await createRegisteredTestUser();
    userD = await createRegisteredTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser(userA.userId);
    await cleanupTestUser(userB.userId);
    await cleanupTestUser(userC.userId);
    await cleanupTestUser(userD.userId);
  });

  // ── T1: Spec drift guard ──────────────────────────────────
  describe('T1: Spec drift guard', () => {
    it('get_profile_field_spec() matches TS PROFILE_FIELD_SPEC', async () => {
      const { data, error } = await admin.rpc('get_profile_field_spec');
      expect(error).toBeNull();

      // toEqual은 키 순서에 무관한 deep equality — jsonb/TS 양쪽의 내부 키 순서 차이 허용
      expect(data).toEqual(PROFILE_FIELD_SPEC);
    });

    it('get_journey_field_spec() matches TS JOURNEY_FIELD_SPEC', async () => {
      const { data, error } = await admin.rpc('get_journey_field_spec');
      expect(error).toBeNull();

      expect(data).toEqual(JOURNEY_FIELD_SPEC);
    });
  });

  // ── T2: M1 사용자값 불변 (profile) ────────────────────────
  describe('T2: M1 사용자값 불변 (profile)', () => {
    it('AI patch는 기존 사용자값을 덮어쓰지 않고 배열은 union', async () => {
      // Setup: 온보딩으로 프로필 생성
      await admin.from('user_profiles').upsert({
        user_id: userA.userId,
        skin_types: ['dry'],
        country: 'US',
        language: 'en',
        age_range: '25-29',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // Action: AI가 모든 aiWritable 필드에 다른 값을 제안
      const { data, error } = await admin.rpc('apply_ai_profile_patch', {
        p_user_id: userA.userId,
        p_patch: {
          skin_types: ['oily'],
          country: 'KR',       // aiWritable=false → 무시됨
          age_range: '30-34',  // 이미 값 있음 → M1 보존
        },
      });

      expect(error).toBeNull();
      const applied = data as string[];
      expect(applied).toEqual(['skin_types']);

      // Assert: DB 확인
      const { data: row } = await admin
        .from('user_profiles')
        .select('skin_types, country, age_range')
        .eq('user_id', userA.userId)
        .single();

      expect(row!.skin_types).toEqual(['dry', 'oily']); // union
      expect(row!.country).toBe('US');                   // 불변
      expect(row!.age_range).toBe('25-29');              // 불변
    });
  });

  // ── T3: skin_types cap 절단 금지 ──────────────────────────
  describe('T3: skin_types cap 절단 금지 (M1 + CR-1)', () => {
    it('cap=3 도달 시 AI 추가값 무시', async () => {
      // Setup: cap 도달
      await admin.from('user_profiles').update({
        skin_types: ['dry', 'oily', 'combination'],
      }).eq('user_id', userA.userId);

      // Action
      const { data, error } = await admin.rpc('apply_ai_profile_patch', {
        p_user_id: userA.userId,
        p_patch: { skin_types: ['sensitive', 'normal'] },
      });

      expect(error).toBeNull();
      const applied = data as string[];
      expect(applied).toEqual([]); // IS DISTINCT FROM 가드 → 변경 없음

      const { data: row } = await admin
        .from('user_profiles')
        .select('skin_types')
        .eq('user_id', userA.userId)
        .single();

      expect(row!.skin_types).toEqual(['dry', 'oily', 'combination']);
    });
  });

  // ── T4: Lazy-create journey (SG-3) ────────────────────────
  describe('T4: Lazy-create journey (SG-3)', () => {
    it('journey 레코드 없는 사용자에게 AI patch → 자동 생성', async () => {
      // Setup: userB는 journey 없음 (createRegisteredTestUser는 journey 미생성)

      const { data, error } = await admin.rpc('apply_ai_journey_patch', {
        p_user_id: userB.userId,
        p_patch: { skin_concerns: ['acne'] },
      });

      expect(error).toBeNull();
      const applied = data as string[];
      expect(applied).toContain('skin_concerns');

      // Assert: journey 레코드 확인
      const { data: journey } = await admin
        .from('journeys')
        .select('status, country, city, skin_concerns')
        .eq('user_id', userB.userId)
        .eq('status', 'active')
        .single();

      expect(journey).not.toBeNull();
      expect(journey!.status).toBe('active');
      expect(journey!.country).toBe('KR');    // schema.dbml DEFAULT
      expect(journey!.city).toBe('seoul');     // schema.dbml DEFAULT
      expect(journey!.skin_concerns).toEqual(['acne']);
    });
  });

  // ── T5: REVOKE 검증 — 4개 함수 전수 ──────────────────────
  describe('T5: REVOKE 검증 (authenticated 거부)', () => {
    function createAuthClient(token: string) {
      return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
    }

    it('apply_ai_profile_patch → 거부', async () => {
      const client = createAuthClient(userA.token);
      const { error, status } = await client.rpc('apply_ai_profile_patch', {
        p_user_id: userA.userId,
        p_patch: { skin_types: ['dry'] },
      });
      expect(error).not.toBeNull();
      expect(
        error!.code === '42501' || error!.code === 'PGRST202' || error!.code === 'PGRST301',
      ).toBe(true);
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('apply_ai_journey_patch → 거부', async () => {
      const client = createAuthClient(userA.token);
      const { error, status } = await client.rpc('apply_ai_journey_patch', {
        p_user_id: userA.userId,
        p_patch: { skin_concerns: ['acne'] },
      });
      expect(error).not.toBeNull();
      expect(
        error!.code === '42501' || error!.code === 'PGRST202' || error!.code === 'PGRST301',
      ).toBe(true);
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('get_profile_field_spec → 거부', async () => {
      const client = createAuthClient(userA.token);
      const { error, status } = await client.rpc('get_profile_field_spec');
      expect(error).not.toBeNull();
      expect(
        error!.code === '42501' || error!.code === 'PGRST202' || error!.code === 'PGRST301',
      ).toBe(true);
      expect(status).toBeGreaterThanOrEqual(400);
    });

    it('get_journey_field_spec → 거부', async () => {
      const client = createAuthClient(userA.token);
      const { error, status } = await client.rpc('get_journey_field_spec');
      expect(error).not.toBeNull();
      expect(
        error!.code === '42501' || error!.code === 'PGRST202' || error!.code === 'PGRST301',
      ).toBe(true);
      expect(status).toBeGreaterThanOrEqual(400);
    });
  });

  // ── T6: CHECK 제약 방어 ───────────────────────────────────
  describe('T6: CHECK 제약 방어', () => {
    it('잘못된 skin_types → 23514', async () => {
      const { error } = await admin
        .from('user_profiles')
        .update({ skin_types: ['EXPLOIT'] })
        .eq('user_id', userA.userId);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514');
    });

    it('잘못된 age_range → 23514', async () => {
      const { error } = await admin
        .from('user_profiles')
        .update({ age_range: 'invalid' })
        .eq('user_id', userA.userId);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514');
    });

    it('잘못된 budget_level → 23514', async () => {
      // userB에 journey가 T4에서 생성되었으므로 사용
      const { error } = await admin
        .from('journeys')
        .update({ budget_level: 'bogus' })
        .eq('user_id', userB.userId);

      expect(error).not.toBeNull();
      expect(error!.code).toBe('23514');
    });
  });

  // ── T7: journey M1 대칭 케이스 ────────────────────────────
  describe('T7: journey M1 대칭 (array union + aiWritable=false 무시)', () => {
    it('기존 skin_concerns에 AI 추가 + aiWritable=false 필드 무시', async () => {
      // Setup: userD에 journey + skin_concerns=['acne','pores'] 시드 (spec §5.2 T7)
      const seed = await admin.rpc('apply_ai_journey_patch', {
        p_user_id: userD.userId,
        p_patch: { skin_concerns: ['acne', 'pores'] },
      });
      expect(seed.error).toBeNull();

      // Action: 추가 patch
      const { data, error } = await admin.rpc('apply_ai_journey_patch', {
        p_user_id: userD.userId,
        p_patch: {
          skin_concerns: ['dryness'],
          interest_activities: ['shopping'],  // aiWritable=false
          travel_style: ['efficient'],        // aiWritable=false
        },
      });

      expect(error).toBeNull();
      const applied = data as string[];
      expect(applied).toEqual(['skin_concerns']);

      const { data: journey } = await admin
        .from('journeys')
        .select('skin_concerns, interest_activities, travel_style')
        .eq('user_id', userD.userId)
        .eq('status', 'active')
        .single();

      expect(journey!.skin_concerns).toEqual(['acne', 'pores', 'dryness']);
      expect(journey!.interest_activities).toBeNull(); // 미변경
      expect(journey!.travel_style).toBeNull();        // 미변경
    });
  });

  // ── T8: scalar NULL → AI set (M3) ─────────────────────────
  describe('T8: scalar NULL → AI set (M3)', () => {
    it('age_range NULL → AI가 set 가능 → 이후 덮어쓰기 불가', async () => {
      // Setup: userC 프로필 생성 (age_range=NULL)
      await admin.from('user_profiles').upsert({
        user_id: userC.userId,
        language: 'en',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // Action 1: AI가 age_range 설정
      const { data: d1, error: e1 } = await admin.rpc('apply_ai_profile_patch', {
        p_user_id: userC.userId,
        p_patch: { age_range: '25-29' },
      });

      expect(e1).toBeNull();
      expect(d1 as string[]).toContain('age_range');

      const { data: row1 } = await admin
        .from('user_profiles')
        .select('age_range')
        .eq('user_id', userC.userId)
        .single();
      expect(row1!.age_range).toBe('25-29');

      // Action 2: AI가 다시 덮어쓰기 시도 → M1 보존
      const { data: d2, error: e2 } = await admin.rpc('apply_ai_profile_patch', {
        p_user_id: userC.userId,
        p_patch: { age_range: '30-34' },
      });

      expect(e2).toBeNull();
      expect(d2 as string[]).not.toContain('age_range');

      const { data: row2 } = await admin
        .from('user_profiles')
        .select('age_range')
        .eq('user_id', userC.userId)
        .single();
      expect(row2!.age_range).toBe('25-29'); // 불변
    });
  });
});
