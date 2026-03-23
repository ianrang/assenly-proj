import 'client-only';
import { createBrowserClient } from '@supabase/ssr';
import { clientEnv } from './config';

// ============================================================
// Supabase 브라우저 클라이언트 — Auth 세션 관리 전용
// DB 직접 접근 없음. 데이터는 fetch('/api/*') 경유 (L-10).
// L-0b: client-only 경계 가드.
// G-9: export 1개만 (getSupabaseBrowserClient).
// ============================================================

/**
 * 브라우저용 Supabase Auth 클라이언트.
 * signInAnonymously, 세션 복구, 토큰 갱신에 사용.
 * @supabase/ssr createBrowserClient는 내부적으로 싱글턴 관리.
 */
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
