import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from './config';

// ============================================================
// 인증 미들웨어 — auth-matrix.md §3.2
// L-4: core/ 새 파일 (승인됨).
// L-5: K-뷰티 비즈니스 용어 없음.
// G-9: export 2개만 (authenticateUser, optionalAuthenticateUser).
// L-14: AuthenticatedUser export 안 함.
// Q-8: env는 config.ts 경유.
// ============================================================

/** auth-matrix.md §3.2: 인증된 사용자 정보 */
interface AuthenticatedUser {
  id: string;
  token: string;
}

/**
 * Bearer 토큰을 추출하고 검증한다.
 * 실패 시 throw (route에서 401 변환).
 */
export async function authenticateUser(
  req: Request,
): Promise<AuthenticatedUser> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Authorization header is required');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Bearer token is required');
  }

  const token = authHeader.slice(7);
  if (!token) {
    throw new Error('Bearer token is required');
  }

  // 토큰 검증 전용 클라이언트. db.ts의 createServiceClient/createAuthenticatedClient와 다른 용도:
  // - createAuthenticatedClient: 토큰이 이미 유효하다고 가정하고 DB 접근용 클라이언트 생성
  // - 여기서는 토큰 유효성 자체를 검증 (auth.getUser). DB 접근 안 함.
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const { data, error } = await client.auth.getUser(token);

  // Supabase 내부 메시지 노출 금지
  if (error || !data.user) {
    throw new Error('Invalid or expired token');
  }

  return { id: data.user.id, token };
}

/**
 * 인증 선택적 — 토큰 없으면 null, 있으면 검증.
 * auth-matrix.md §3.2: 도메인 데이터 공개 읽기용.
 */
export async function optionalAuthenticateUser(
  req: Request,
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  return authenticateUser(req);
}
