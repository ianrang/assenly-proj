import 'client-only';
import { getSupabaseBrowserClient } from './supabase-browser';

// ============================================================
// auth-fetch — 인증 fetch 유틸리티
// auth-matrix.md §1.3: fetch('/api/*', { Authorization: Bearer <token> })
// L-0b: client-only guard. L-5: K-뷰티 비즈니스 용어 없음.
// G-9: export 2개만 (getAccessToken, authFetch).
// ============================================================

/**
 * 현재 Supabase 세션의 access_token을 반환.
 * 세션 없으면 null. SDK가 토큰 갱신 자동 처리 (auth-matrix.md §5.3).
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Authorization Bearer 헤더가 포함된 fetch.
 * auth-matrix.md §1.3: fetch('/api/*', { Authorization: Bearer <token> })
 *
 * 세션 없으면 헤더 없이 요청 (optionalAuth 엔드포인트 대응).
 */
export async function authFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}
