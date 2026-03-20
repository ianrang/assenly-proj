/**
 * 인프라 PoC 공유 헬퍼 — Supabase 클라이언트 팩토리 + 환경변수 검증
 *
 * docs/04-poc/scripts/ 내부에서만 사용. src/ 코드와 무관.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env.local') });

// --- 환경변수 검증 ---

export function checkEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!url || url.includes('your-project')) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!anonKey || anonKey === 'your-anon-key') missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!serviceRoleKey || serviceRoleKey === 'your-service-role-key') missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    console.error('ERROR: Supabase 환경변수가 설정되지 않았습니다.');
    console.error(`  누락: ${missing.join(', ')}`);
    console.error('  .env.local 파일에 실제 Supabase 프로젝트 키를 입력해주세요.');
    process.exit(1);
  }

  return { url: url!, anonKey: anonKey!, serviceRoleKey: serviceRoleKey! };
}

// --- Supabase 클라이언트 생성 ---

/** 서버용 클라이언트 (service_role key — RLS 우회, 관리 작업용) */
export function createServiceClient(): SupabaseClient {
  const { url, serviceRoleKey } = checkEnv();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** 브라우저용 클라이언트 (anon key — RLS 적용, 공개 접근) */
export function createAnonClient(): SupabaseClient {
  const { url, anonKey } = checkEnv();
  return createClient(url, anonKey);
}

// --- 유틸 ---

export function printResult(label: string, pass: boolean, detail?: string) {
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`  ${icon}: ${label}${detail ? ` — ${detail}` : ''}`);
}
