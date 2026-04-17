#!/usr/bin/env node
/**
 * NEW-17d — manual QA scenario automation helper.
 *
 * 용도:
 *   - /profile 관련 시나리오별 DB 상태 조작 + 복원 자동화.
 *   - Playwright MCP 또는 수동 브라우저 테스트와 결합하여 온보딩 전/후, RT-1, RT-2 검증.
 *   - Rate-limit 우려 없이 service_role 로 직접 RPC 호출.
 *
 * 전제:
 *   - .env.local 에 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - USER_ID 환경변수 또는 argv 에 전달 (브라우저 쿠키 JWT 의 sub 필드)
 *
 * 사용법:
 *   USER_ID=<uuid> node scripts/qa/new17d-scenarios.mjs read
 *   USER_ID=<uuid> node scripts/qa/new17d-scenarios.mjs hide-onboarding
 *   USER_ID=<uuid> node scripts/qa/new17d-scenarios.mjs restore-onboarding "<iso-timestamp>"
 *   USER_ID=<uuid> node scripts/qa/new17d-scenarios.mjs test-stay-days   # RT-1 검증
 *   USER_ID=<uuid> node scripts/qa/new17d-scenarios.mjs restore-stay-days
 *   USER_ID=<uuid> ACCESS_TOKEN=<jwt> node scripts/qa/new17d-scenarios.mjs test-rt2-via-auth
 *
 * USER_ID 획득: 브라우저 DevTools 에서
 *   document.cookie.split('; ').find(c=>c.includes('sb-')&&c.includes('auth-token')).split('=').slice(1).join('=')
 *   → base64 decode → JSON parse → .user.id (또는 access_token 의 JWT sub)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USER_ID = process.env.USER_ID || process.argv[3];
const cmd = process.argv[2];

if (!USER_ID && cmd !== 'help') {
  console.error('Missing USER_ID. Set USER_ID env var or pass as 3rd argv.');
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

switch (cmd) {
  case 'read': {
    const { data: p } = await admin
      .from('user_profiles')
      .select(
        'user_id, onboarding_completed_at, skin_types, hair_type, skin_types_user_updated_at, age_range_user_updated_at, beauty_summary',
      )
      .eq('user_id', USER_ID)
      .single();
    const { data: j } = await admin
      .from('journeys')
      .select(
        'id, stay_days, stay_days_user_updated_at, skin_concerns, skin_concerns_user_updated_at, budget_level, budget_level_user_updated_at',
      )
      .eq('user_id', USER_ID)
      .eq('status', 'active')
      .maybeSingle();
    console.log(JSON.stringify({ profile: p, journey: j }, null, 2));
    break;
  }

  case 'hide-onboarding': {
    // Scenario A 시뮬레이션 — 온보딩 전 상태.
    const { data: before } = await admin
      .from('user_profiles')
      .select('onboarding_completed_at')
      .eq('user_id', USER_ID)
      .single();
    console.log('BEFORE onboarding_completed_at:', before?.onboarding_completed_at);
    await admin
      .from('user_profiles')
      .update({ onboarding_completed_at: null })
      .eq('user_id', USER_ID);
    console.log('SET onboarding_completed_at = NULL');
    console.log('→ Chat Header 에서 Profile 아이콘 숨김 확인 후');
    console.log(
      `→ 복원: node ${process.argv[1]} restore-onboarding "${before?.onboarding_completed_at}"`,
    );
    break;
  }

  case 'restore-onboarding': {
    const iso = process.argv[3] || process.env.RESTORE_ISO;
    if (!iso) {
      console.error('Missing ISO timestamp. Pass as 3rd argv or RESTORE_ISO env.');
      process.exit(1);
    }
    await admin
      .from('user_profiles')
      .update({ onboarding_completed_at: iso })
      .eq('user_id', USER_ID);
    console.log('RESTORED onboarding_completed_at =', iso);
    break;
  }

  case 'test-stay-days': {
    // RT-1 검증 — stay_days AI patch 가 019c 이후 성공해야 함.
    const { data, error } = await admin.rpc('apply_ai_journey_patch', {
      p_user_id: USER_ID,
      p_patch: { stay_days: 7 },
    });
    if (error) {
      console.error('RT-1 FAILED:', error);
      console.error('→ 019c migration 적용 안 됨? stay_days_user_updated_at 컬럼 부재 가능.');
      process.exit(1);
    }
    console.log('RT-1 PASS: applied =', data);
    const { data: j } = await admin
      .from('journeys')
      .select('stay_days, stay_days_user_updated_at')
      .eq('user_id', USER_ID)
      .eq('status', 'active')
      .single();
    console.log('journey.stay_days =', j?.stay_days, '(expected: 7)');
    console.log('stay_days_user_updated_at =', j?.stay_days_user_updated_at, '(expected: null — AI patch 은 stamp 안 함)');
    break;
  }

  case 'restore-stay-days': {
    await admin
      .from('journeys')
      .update({ stay_days: null })
      .eq('user_id', USER_ID)
      .eq('status', 'active');
    console.log('RESTORED journey.stay_days = NULL');
    break;
  }

  case 'test-rt2-via-auth': {
    // RT-2 검증 — user_profiles 삭제 후 PUT 호출 시 404 PROFILE_NOT_FOUND 반환 확인.
    const token = process.env.ACCESS_TOKEN || process.argv[3];
    if (!token) {
      console.error('Missing ACCESS_TOKEN (browser JWT). Set env or pass as 3rd argv.');
      process.exit(1);
    }
    const { data: before } = await admin
      .from('user_profiles')
      .select('*')
      .eq('user_id', USER_ID)
      .single();
    if (!before) {
      console.error('user_profiles row not found (already missing?)');
      process.exit(1);
    }
    console.log('Deleting user_profiles row (temporary)...');
    await admin.from('user_profiles').delete().eq('user_id', USER_ID);

    const res = await fetch(`${BASE_URL}/api/profile/edit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        profile: { hair_type: 'curly' },
        journey: {},
      }),
    });
    const body = await res.json();
    console.log('RT-2 HTTP status =', res.status, '(expected: 404)');
    console.log('RT-2 response =', JSON.stringify(body));

    console.log('Restoring user_profiles row...');
    await admin.from('user_profiles').insert(before);
    console.log('DONE');

    if (res.status !== 404 || body?.error?.code !== 'PROFILE_NOT_FOUND') {
      console.error('RT-2 FAILED');
      process.exit(1);
    }
    console.log('RT-2 PASS');
    break;
  }

  case 'help':
  default:
    console.log(`Usage:
  USER_ID=<uuid> node scripts/qa/new17d-scenarios.mjs <command>

Commands:
  read                  — Current profile + journey state
  hide-onboarding       — Set onboarding_completed_at=NULL (Scenario A simulation)
  restore-onboarding <iso>  — Restore onboarding_completed_at
  test-stay-days        — RT-1: verify stay_days AI patch succeeds (019c)
  restore-stay-days     — Reset journey.stay_days = NULL
  test-rt2-via-auth     — RT-2: verify 404 PROFILE_NOT_FOUND mapping (requires ACCESS_TOKEN)

Env vars:
  USER_ID         — target user (required)
  ACCESS_TOKEN    — browser JWT for test-rt2-via-auth
  BASE_URL        — dev server (default: http://localhost:3000)
`);
    break;
}
