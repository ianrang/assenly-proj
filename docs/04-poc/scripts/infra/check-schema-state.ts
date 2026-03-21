/**
 * 현재 DB 상태 확인 — 마이그레이션 전 점검
 */
import { createServiceClient } from './helpers.js';

async function main() {
  const sb = createServiceClient();

  // 1. stores.brands_available 존재?
  const { data: s1, error: e1 } = await sb.from('stores').select('brands_available').limit(0);
  console.log('stores.brands_available:', e1 ? `NOT FOUND (${e1.code})` : 'EXISTS');

  // 2. treatments.price_range 존재?
  const { data: s2, error: e2 } = await sb.from('treatments').select('price_range').limit(0);
  console.log('treatments.price_range:', e2 ? `NOT FOUND (${e2.code})` : 'EXISTS');

  // 3. brands.status 존재?
  const { data: s3, error: e3 } = await sb.from('brands').select('status').limit(0);
  console.log('brands.status:', e3 ? `NOT FOUND (${e3.code})` : 'EXISTS');

  // 4. ingredients.status 존재?
  const { data: s4, error: e4 } = await sb.from('ingredients').select('status').limit(0);
  console.log('ingredients.status:', e4 ? `NOT FOUND (${e4.code})` : 'EXISTS');

  // 5. doctors.status 존재?
  const { data: s5, error: e5 } = await sb.from('doctors').select('status').limit(0);
  console.log('doctors.status:', e5 ? `NOT FOUND (${e5.code})` : 'EXISTS');

  // 6. admin_users 테이블?
  const { error: e6 } = await sb.from('admin_users').select('id').limit(0);
  console.log('admin_users table:', e6 ? `NOT FOUND (${e6.code})` : 'EXISTS');

  // 7. audit_logs 테이블?
  const { error: e7 } = await sb.from('audit_logs').select('id').limit(0);
  console.log('audit_logs table:', e7 ? `NOT FOUND (${e7.code})` : 'EXISTS');

  // 8. consent_records.analytics?
  const { error: e8 } = await sb.from('consent_records').select('analytics').limit(0);
  console.log('consent_records.analytics:', e8 ? `NOT FOUND` : 'EXISTS');
}

main().catch(console.error);
