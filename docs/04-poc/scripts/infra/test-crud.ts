/**
 * P0-24: Supabase 서버 클라이언트 CRUD 테스트
 *
 * service_role key 사용 (RLS 우회). 서버 사이드 패턴 검증.
 * 테스트 데이터는 생성 후 정리(삭제).
 *
 * 실행: npx tsx docs/04-poc/scripts/infra/test-crud.ts
 */
import { createServiceClient, printResult } from './helpers.js';

async function main() {
  console.log('=== P0-24: Server Client CRUD Test ===\n');

  const supabase = createServiceClient();
  let allPass = true;
  let testUserId: string | null = null;

  // --- CREATE ---
  console.log('--- 1. CREATE (Insert) ---');
  try {
    const { data, error } = await supabase
      .from('users')
      .insert({ auth_method: 'anonymous' })
      .select('id, auth_method, created_at')
      .single();

    if (error) throw new Error(`${error.message} (code: ${error.code}, details: ${error.details})`);


    testUserId = data.id;
    printResult('INSERT users', true, `id=${data.id}, method=${data.auth_method}`);
  } catch (err) {
    printResult('INSERT users', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // --- READ ---
  console.log('\n--- 2. READ (Select) ---');
  if (testUserId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, auth_method, created_at')
        .eq('id', testUserId)
        .single();

      if (error) throw new Error(`${error.message} (code: ${error.code}, details: ${error.details})`);

      printResult('SELECT users', true, `found id=${data.id}`);
    } catch (err) {
      printResult('SELECT users', false, err instanceof Error ? err.message : String(err));
      allPass = false;
    }
  }

  // --- UPDATE ---
  console.log('\n--- 3. UPDATE ---');
  if (testUserId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ last_active: new Date().toISOString() })
        .eq('id', testUserId)
        .select('id, last_active')
        .single();

      if (error) throw new Error(`${error.message} (code: ${error.code}, details: ${error.details})`);

      printResult('UPDATE users', true, `last_active=${data.last_active}`);
    } catch (err) {
      printResult('UPDATE users', false, err instanceof Error ? err.message : String(err));
      allPass = false;
    }
  }

  // --- 관계 테스트 (user_profiles) ---
  console.log('\n--- 4. Relation (user_profiles FK) ---');
  if (testUserId) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          user_id: testUserId,
          skin_type: 'oily',
          language: 'en',
          country: 'US',
        })
        .select('user_id, skin_type')
        .single();

      if (error) throw new Error(`${error.message} (code: ${error.code}, details: ${error.details})`);

      printResult('INSERT user_profiles (FK)', true, `skin_type=${data.skin_type}`);
    } catch (err) {
      printResult('INSERT user_profiles (FK)', false, err instanceof Error ? err.message : String(err));
      allPass = false;
    }
  }

  // --- 배열 필드 테스트 (journeys) ---
  console.log('\n--- 5. Array fields (journeys) ---');
  let testJourneyId: string | null = null;
  if (testUserId) {
    try {
      const { data, error } = await supabase
        .from('journeys')
        .insert({
          user_id: testUserId,
          country: 'KR',
          city: 'seoul',
          skin_concerns: ['acne', 'dryness', 'pores'],
          interest_activities: ['shopping', 'clinic'],
          stay_days: 5,
          budget_level: 'moderate',
        })
        .select('id, skin_concerns, stay_days')
        .single();

      if (error) throw new Error(`${error.message} (code: ${error.code}, details: ${error.details})`);

      testJourneyId = data.id;
      printResult('INSERT journeys (arrays)', true, `concerns=${JSON.stringify(data.skin_concerns)}, stay=${data.stay_days}`);
    } catch (err) {
      printResult('INSERT journeys (arrays)', false, err instanceof Error ? err.message : String(err));
      allPass = false;
    }
  }

  // --- JSONB 필드 테스트 (products) ---
  console.log('\n--- 6. JSONB fields (products) ---');
  let testProductId: string | null = null;
  try {
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: { en: 'Test Product', ko: '테스트 제품' },
        description: { en: 'A test product for PoC', ko: 'PoC용 테스트 제품' },
        category: 'serum',
        skin_types: ['oily', 'combination'],
        concerns: ['acne', 'pores'],
        price: 15000,
        status: 'active',
      })
      .select('id, name, price')
      .single();

    if (error) throw new Error(`${error.message} (code: ${error.code}, details: ${error.details})`);

    testProductId = data.id;
    printResult('INSERT products (JSONB)', true, `name.en=${(data.name as any)?.en}, price=${data.price}`);
  } catch (err) {
    printResult('INSERT products (JSONB)', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  // --- DELETE (정리) ---
  console.log('\n--- 7. DELETE (cleanup) ---');
  try {
    if (testProductId) {
      await supabase.from('products').delete().eq('id', testProductId);
      printResult('DELETE products', true);
    }
    if (testJourneyId) {
      await supabase.from('journeys').delete().eq('id', testJourneyId);
      printResult('DELETE journeys', true);
    }
    if (testUserId) {
      await supabase.from('user_profiles').delete().eq('user_id', testUserId);
      printResult('DELETE user_profiles', true);
      await supabase.from('users').delete().eq('id', testUserId);
      printResult('DELETE users', true);
    }
  } catch (err) {
    printResult('DELETE cleanup', false, err instanceof Error ? err.message : String(err));
    allPass = false;
  }

  console.log(`\n=== P0-24 Verdict: ${allPass ? 'PASS' : 'FAIL'} ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
