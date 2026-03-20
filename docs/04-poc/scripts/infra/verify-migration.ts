/**
 * P0-23 (2/2): 마이그레이션 검증 — 15개 테이블 존재 확인
 *
 * 실행: npx tsx docs/04-poc/scripts/infra/verify-migration.ts
 */
import { createServiceClient, printResult } from './helpers.js';

// DB-SCHEMA.md 기반 15개 테이블
const EXPECTED_TABLES = [
  'users',
  'user_profiles',
  'journeys',
  'beauty_history',
  'learned_preferences',
  'conversations',
  'messages',
  'behavior_logs',
  'consent_records',
  'products',
  'stores',
  'brands',
  'ingredients',
  'clinics',
  'treatments',
  'doctors',
  'clinic_treatments',
  'product_stores',
  'product_ingredients',
];

async function main() {
  console.log('=== P0-23: Migration Verification ===\n');

  const supabase = createServiceClient();

  // 각 테이블 존재 확인 (select count)
  console.log('--- Checking tables ---');
  let found = 0;
  let missing = 0;

  for (const table of EXPECTED_TABLES) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        // 42P01 = relation does not exist
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          printResult(table, false, 'Table not found');
          missing++;
        } else {
          // 테이블은 있지만 권한 등 다른 에러
          printResult(table, true, `Exists (access issue: ${error.message})`);
          found++;
        }
      } else {
        printResult(table, true, `OK (${count ?? 0} rows)`);
        found++;
      }
    } catch (err) {
      printResult(table, false, err instanceof Error ? err.message : String(err));
      missing++;
    }
  }

  // 결과 요약
  console.log(`\n--- Summary ---`);
  console.log(`  Found: ${found}/${EXPECTED_TABLES.length}`);
  console.log(`  Missing: ${missing}`);

  const allFound = missing === 0;
  console.log(`\n=== P0-23 Migration Verdict: ${allFound ? 'PASS' : 'FAIL'} ===`);

  if (!allFound) {
    console.log('\n  마이그레이션을 실행해주세요:');
    console.log('  Option A: supabase db push');
    console.log('  Option B: Supabase Dashboard > SQL Editor > 001_initial_schema.sql 실행');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
