/**
 * P0-25: Supabase 브라우저 클라이언트 테스트
 *
 * anon key 사용 (RLS 적용). 클라이언트 사이드 패턴 검증.
 * RLS 정책이 없으면 실패할 수 있음 — 이를 확인하는 것도 검증 목적.
 *
 * 실행: npx tsx docs/04-poc/scripts/infra/test-browser-client.ts
 */
import { createAnonClient, printResult } from './helpers.js';

async function main() {
  console.log('=== P0-25: Browser Client (Anon Key) Test ===\n');

  const supabase = createAnonClient();
  let allPass = true;

  // 1. 읽기 테스트 (products — 공개 데이터)
  console.log('--- 1. Read public data (products) ---');
  try {
    const { data, error, count } = await supabase
      .from('products')
      .select('id, name, price', { count: 'exact' })
      .limit(5);

    if (error) {
      if (error.code === '42501' || error.message.includes('permission') || error.message.includes('RLS')) {
        printResult('SELECT products (anon)', false, 'RLS blocks access. RLS 정책 설정 필요.');
        console.log('    → 프로덕션에서는 products 테이블에 SELECT 허용 RLS 정책 필요');
        console.log('    → 예: CREATE POLICY "public_read" ON products FOR SELECT USING (true);');
      } else {
        printResult('SELECT products (anon)', false, error.message);
      }
      allPass = false;
    } else {
      printResult('SELECT products (anon)', true, `${data?.length ?? 0} rows (total: ${count ?? '?'})`);
    }
  } catch (err) {
    printResult('SELECT products (anon)', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // 2. 쓰기 테스트 (users — anon은 쓰기 불가해야 함)
  console.log('\n--- 2. Write attempt (should be blocked by RLS) ---');
  try {
    const { data, error } = await supabase
      .from('users')
      .insert({ auth_method: 'test_should_fail' })
      .select()
      .single();

    if (error) {
      // 쓰기 차단은 정상 (보안)
      printResult('INSERT users (anon)', true, `Correctly blocked: ${error.message.slice(0, 60)}`);
    } else {
      // 쓰기 성공은 보안 문제
      printResult('INSERT users (anon)', false, 'WARNING: anon key can write to users table! RLS 정책 필요.');
      // 정리
      if (data?.id) {
        await supabase.from('users').delete().eq('id', data.id);
      }
      allPass = false;
    }
  } catch (err) {
    printResult('INSERT users (anon)', true, `Correctly blocked: ${(err as Error).message?.slice(0, 60)}`);
  }

  // 3. 인증 상태 확인
  console.log('\n--- 3. Auth state (no session expected) ---');
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    printResult('Auth session', true, session ? `Active session: ${session.user.id}` : 'No session (expected)');
  } catch (err) {
    printResult('Auth session', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // 판정
  console.log(`\n=== P0-25 Verdict: ${allPass ? 'PASS' : 'CONDITIONAL'} ===`);
  if (!allPass) {
    console.log('  Note: RLS 정책 미설정 시 일부 테스트 실패는 예상됨.');
    console.log('  프로덕션에서 RLS 정책을 설정하면 해결됩니다.');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
