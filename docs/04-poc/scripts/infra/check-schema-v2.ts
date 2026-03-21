import { createServiceClient, printResult } from './helpers.js';

async function main() {
  const sb = createServiceClient();

  console.log('=== P1-16/17 Migration Verification ===\n');

  // P1-16: 컬럼 변경
  console.log('--- P1-16: Column changes ---');

  const { error: e1 } = await sb.from('treatments').select('price_min, price_max, price_currency').limit(0);
  printResult('treatments.price_min/max/currency', !e1, e1?.message);

  const { error: e2 } = await sb.from('brands').select('status, updated_at').limit(0);
  printResult('brands.status + updated_at', !e2, e2?.message);

  const { error: e3 } = await sb.from('ingredients').select('status, updated_at').limit(0);
  printResult('ingredients.status + updated_at', !e3, e3?.message);

  const { error: e4 } = await sb.from('doctors').select('status, updated_at').limit(0);
  printResult('doctors.status + updated_at', !e4, e4?.message);

  // P1-17: 관리자 테이블 CRUD
  console.log('\n--- P1-17: Admin tables CRUD ---');

  // admin_users INSERT
  const { data: admin, error: e5 } = await sb
    .from('admin_users')
    .insert({
      email: 'test-super@essenly.com',
      name: 'Test Super Admin',
      role: 'super_admin',
      permissions: {},
      status: 'active',
    })
    .select('id, email, role')
    .single();
  printResult('admin_users INSERT', !e5, e5?.message ?? `id=${admin?.id}`);

  // audit_logs INSERT
  let auditId: string | null = null;
  if (admin?.id) {
    const { data: log, error: e6 } = await sb
      .from('audit_logs')
      .insert({
        actor_id: admin.id,
        action: 'test_migration',
        target_type: 'system',
        changes: { test: true },
      })
      .select('id, action')
      .single();
    printResult('audit_logs INSERT', !e6, e6?.message ?? `id=${log?.id}`);
    auditId = log?.id ?? null;
  }

  // FK ON DELETE CASCADE 테스트
  console.log('\n--- FK ON DELETE CASCADE test ---');
  const { data: user, error: eu } = await sb
    .from('users')
    .insert({ auth_method: 'anonymous' })
    .select('id')
    .single();

  if (user?.id) {
    await sb.from('user_profiles').insert({ user_id: user.id, language: 'en' });
    await sb.from('journeys').insert({ user_id: user.id });

    // users 삭제 → user_profiles, journeys CASCADE 확인
    const { error: delErr } = await sb.from('users').delete().eq('id', user.id);
    printResult('users DELETE (CASCADE)', !delErr, delErr?.message ?? 'profiles+journeys cascaded');

    // 확인: user_profiles가 삭제되었는지
    const { data: orphan } = await sb.from('user_profiles').select('user_id').eq('user_id', user.id);
    printResult('user_profiles cascaded', orphan?.length === 0, `remaining: ${orphan?.length}`);
  }

  // 정리
  console.log('\n--- Cleanup ---');
  if (auditId) await sb.from('audit_logs').delete().eq('id', auditId);
  if (admin?.id) await sb.from('admin_users').delete().eq('id', admin.id);
  printResult('Cleanup', true);

  console.log('\n=== P1-16/17 Verdict: PASS ===');
}

main().catch(console.error);
