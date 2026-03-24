import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// 대화 메모리 관리 — token-management.md §1.3 + api-spec.md §3.4
// 비즈니스 무관 (L-5). SupabaseClient를 파라미터로 받음 (P-4).
// ⚠️ L-4: core/ 파일 수정. 비즈니스 용어 없음.
// G-9: export 2개만 (loadRecentMessages, saveMessages).
// ============================================================

/** DB에서 조회된 메시지 행 */
interface MessageRow {
  role: string;
  content: string;
  card_data: unknown;
  tool_calls: unknown;
  created_at: string;
}

/** 저장할 메시지 입력 */
interface MessageInsert {
  role: string;
  content: string;
  card_data?: unknown;
  tool_calls?: unknown;
}

/** 충분한 행을 조회하기 위한 배수 (턴당 최대 6행: user + tool_call×2 + tool_result×2 + assistant) */
const ROWS_PER_TURN_MAX = 6;

/**
 * 최근 N턴 메시지를 로드한다. 턴 = user 메시지 1개 + 관련 응답.
 * token-management.md §1.3: user 메시지 기준으로 턴 카운트.
 * @param client - RLS 적용된 SupabaseClient (P-4: Composition Root에서 주입)
 * @param conversationId - 대화 ID
 * @param limit - 최대 턴 수 (TOKEN_CONFIG.historyLimit)
 */
export async function loadRecentMessages(
  client: SupabaseClient,
  conversationId: string,
  limit: number,
): Promise<MessageRow[]> {
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  // 충분한 행 조회 (턴당 최대 6행 × limit 턴)
  const maxRows = limit * ROWS_PER_TURN_MAX;

  const { data, error } = await client
    .from('messages')
    .select('role, content, card_data, tool_calls, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(maxRows);

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // user 메시지 기준 턴 카운트 후 잘라냄
  const rows = data as MessageRow[];
  let userCount = 0;
  let cutIndex = rows.length;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].role === 'user') {
      userCount++;
      if (userCount > limit) {
        cutIndex = i;
        break;
      }
    }
  }

  // 최근 N턴만 선택 후 시간순 정렬
  return rows.slice(0, cutIndex).reverse();
}

/**
 * 메시지 배열을 DB에 저장한다.
 * api-spec.md §3.4 step 9: 비동기 대화 히스토리 저장.
 * @param client - SupabaseClient (P-4)
 * @param conversationId - 대화 ID
 * @param messages - 저장할 메시지 배열
 */
export async function saveMessages(
  client: SupabaseClient,
  conversationId: string,
  messages: MessageInsert[],
): Promise<void> {
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  if (messages.length === 0) {
    return;
  }

  const rows = messages.map((msg) => ({
    conversation_id: conversationId,
    ...msg,
  }));

  const { error } = await client.from('messages').insert(rows);

  if (error) {
    throw new Error(error.message);
  }
}
