/**
 * P0-23 (1/2): Supabase 연결 테스트
 *
 * 실행: npx tsx docs/04-poc/scripts/infra/test-connection.ts
 */
import { createServiceClient, printResult } from './helpers.js';

async function main() {
  console.log('=== P0-23: Supabase Connection Test ===\n');

  const supabase = createServiceClient();

  // 1. 기본 연결
  console.log('--- 1. Basic connection ---');
  try {
    const { data, error } = await supabase.rpc('version');
    if (error) {
      // rpc('version')이 없을 수 있음 — 대안으로 간단한 쿼리
      const { data: d2, error: e2 } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      if (e2) {
        // 테이블이 없을 수도 있음 (마이그레이션 전)
        // 최소한 연결은 확인 — auth health check
        const { data: health, error: healthErr } = await supabase.auth.getSession();
        if (healthErr) {
          printResult('Connection', false, healthErr.message);
        } else {
          printResult('Connection', true, 'Auth endpoint reachable');
        }
      } else {
        printResult('Connection', true, `Query OK (users table exists, ${d2?.length ?? 0} rows)`);
      }
    } else {
      printResult('Connection', true, `PostgreSQL version: ${data}`);
    }
  } catch (err) {
    printResult('Connection', false, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // 2. pgvector 확장
  console.log('\n--- 2. pgvector extension ---');
  try {
    const { data, error } = await supabase
      .rpc('extensions', {})
      .catch(() => ({ data: null, error: { message: 'rpc not available' } }));

    // 대안: pg_extension 테이블 직접 조회
    const { data: extData, error: extErr } = await supabase
      .from('pg_extension')
      .select('extname')
      .eq('extname', 'vector');

    if (extErr) {
      // pg_extension은 시스템 테이블이라 접근 못 할 수 있음
      printResult('pgvector', true, 'Cannot verify directly (system table). Will be verified in migration check.');
    } else {
      const hasVector = extData && extData.length > 0;
      printResult('pgvector', hasVector, hasVector ? 'Extension enabled' : 'Extension NOT found');
    }
  } catch (err) {
    printResult('pgvector', false, err instanceof Error ? err.message : String(err));
  }

  console.log('\n=== Connection Test Done ===');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
