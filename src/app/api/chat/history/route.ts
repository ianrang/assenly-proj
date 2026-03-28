import 'server-only';
import { z } from 'zod';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
import { loadRecentMessages } from '@/server/core/memory';
import { TOKEN_CONFIG } from '@/shared/constants/ai';

// ============================================================
// GET /api/chat/history — api-spec.md §2.6
// L-1: thin route (인증 → 검증 → 조회 → 응답).
// core/memory loadRecentMessages 재사용.
// ============================================================

/** Q-1: 쿼리 파라미터 검증 */
const historyQuerySchema = z.object({
  conversation_id: z.string().uuid().optional(),
});

const RATE_LIMIT_CONFIG = { limit: 60, windowMs: 60 * 1000, window: 'minute' } as const;

export async function GET(req: Request) {
  // 1. 인증
  let user;
  try {
    user = await authenticateUser(req);
  } catch {
    return Response.json(
      { error: { code: 'AUTH_REQUIRED', message: 'Authentication is required', details: null } },
      { status: 401 },
    );
  }

  // 2. Rate limit — api-spec.md §4.1: 사용자 읽기 60/분
  const rateResult = checkRateLimit(user.id, 'public', RATE_LIMIT_CONFIG);
  if (!rateResult.allowed) {
    const retryAfter = Math.ceil((rateResult.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: `Too many requests. Try again in ${retryAfter}s.`, details: { retryAfter } } },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // 3. 쿼리 파라미터 추출 + 검증
  const url = new URL(req.url);
  const rawConversationId = url.searchParams.get('conversation_id') ?? undefined;
  const parsed = historyQuerySchema.safeParse({ conversation_id: rawConversationId });
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Invalid conversation_id format', details: null } },
      { status: 400 },
    );
  }

  // 4. DB 클라이언트 (RLS 적용)
  const client = createAuthenticatedClient(user.token);

  try {
    // 5. conversation_id 확인 (없으면 최신 대화 조회)
    let conversationId = parsed.data.conversation_id;

    if (!conversationId) {
      const { data: latest } = await client
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latest) {
        // 대화 없음 → 빈 배열 반환
        return Response.json(
          { data: { messages: [], conversation_id: null } },
          { status: 200 },
        );
      }
      conversationId = (latest as { id: string }).id;
    }

    // 6. 히스토리 로드 — core/memory 재사용
    const historyLimit = TOKEN_CONFIG.default.historyLimit;
    const rawMessages = await loadRecentMessages(client, conversationId, historyLimit);

    // api-spec.md §2.6: role, content, card_data, created_at만 반환. tool_calls 미포함.
    const messages = rawMessages.map(({ role, content, card_data, created_at }) => ({
      role, content, card_data, created_at,
    }));

    return Response.json(
      { data: { messages, conversation_id: conversationId } },
      { status: 200 },
    );
  } catch (error) {
    console.error('[chat/history] load failed', String(error));
    return Response.json(
      { error: { code: 'HISTORY_LOAD_FAILED', message: 'Failed to load chat history', details: null } },
      { status: 500 },
    );
  }
}
