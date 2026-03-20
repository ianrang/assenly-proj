/**
 * P0-26: Supabase Anonymous Auth 테스트
 *
 * 익명 세션 생성 → UUID 획득 → 데이터 연결 → 재인증 → 데이터 재접근
 *
 * 사전 요구: Supabase Dashboard > Auth > Settings > "Enable anonymous sign-ins" 활성화
 *
 * 실행: npx tsx docs/04-poc/scripts/infra/test-anon-auth.ts
 */
import { createAnonClient, createServiceClient, printResult } from './helpers.js';

async function main() {
  console.log('=== P0-26: Anonymous Auth Test ===\n');

  const anonClient = createAnonClient();
  const serviceClient = createServiceClient();
  let allPass = true;
  let anonUserId: string | null = null;

  // 1. 익명 로그인
  console.log('--- 1. signInAnonymously ---');
  try {
    const { data, error } = await anonClient.auth.signInAnonymously();

    if (error) {
      if (error.message.includes('Anonymous sign-ins are disabled')) {
        printResult('signInAnonymously', false, 'Anonymous sign-ins 비활성화.');
        console.log('    → Supabase Dashboard > Auth > Settings > "Enable anonymous sign-ins" 활성화 필요');
        process.exit(1);
      }
      throw error;
    }

    anonUserId = data.user?.id ?? null;
    printResult('signInAnonymously', !!anonUserId, `userId=${anonUserId}`);

    if (!anonUserId) {
      allPass = false;
    }
  } catch (err) {
    printResult('signInAnonymously', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // 2. 세션 확인
  console.log('\n--- 2. Session verification ---');
  try {
    const { data: { session }, error } = await anonClient.auth.getSession();
    if (error) throw error;

    const hasSession = !!session;
    const matchesUser = session?.user?.id === anonUserId;
    printResult('Session exists', hasSession);
    printResult('Session matches user', matchesUser, `session.user.id=${session?.user?.id}`);

    if (!hasSession || !matchesUser) allPass = false;
  } catch (err) {
    printResult('Session', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // 3. 데이터 연결 (service_role로 users 레코드 생성 + user_profiles 연결)
  console.log('\n--- 3. Data linking via service_role ---');
  if (anonUserId) {
    try {
      // users 테이블에 레코드 생성 (서비스 역할로)
      const { error: userErr } = await serviceClient
        .from('users')
        .insert({ id: anonUserId, auth_method: 'anonymous' });

      if (userErr && !userErr.message.includes('duplicate')) {
        throw userErr;
      }
      printResult('INSERT users (with anon UUID)', true);

      // user_profiles 연결
      const { error: profileErr } = await serviceClient
        .from('user_profiles')
        .insert({
          user_id: anonUserId,
          skin_type: 'combination',
          language: 'en',
        });

      if (profileErr && !profileErr.message.includes('duplicate')) {
        throw profileErr;
      }
      printResult('INSERT user_profiles (linked)', true);
    } catch (err) {
      printResult('Data linking', false, err instanceof Error ? err.message : String(err));
      allPass = false;
    }
  }

  // 4. 데이터 재접근 확인 (service_role로 조회)
  console.log('\n--- 4. Data retrieval ---');
  if (anonUserId) {
    try {
      const { data, error } = await serviceClient
        .from('user_profiles')
        .select('user_id, skin_type, language')
        .eq('user_id', anonUserId)
        .single();

      if (error) throw error;
      printResult('SELECT user_profiles', true, `skin_type=${data.skin_type}, lang=${data.language}`);
    } catch (err) {
      printResult('SELECT user_profiles', false, err instanceof Error ? err.message : String(err));
      allPass = false;
    }
  }

  // 5. 로그아웃
  console.log('\n--- 5. Sign out ---');
  try {
    const { error } = await anonClient.auth.signOut();
    if (error) throw error;
    printResult('signOut', true);
  } catch (err) {
    printResult('signOut', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // 6. 정리 (service_role로 삭제)
  console.log('\n--- 6. Cleanup ---');
  if (anonUserId) {
    try {
      await serviceClient.from('user_profiles').delete().eq('user_id', anonUserId);
      await serviceClient.from('users').delete().eq('id', anonUserId);
      printResult('Cleanup', true);
    } catch (err) {
      printResult('Cleanup', false, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(`\n=== P0-26 Verdict: ${allPass ? 'PASS' : 'FAIL'} ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
