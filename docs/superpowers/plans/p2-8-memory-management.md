# P2-8: 대화 메모리 관리 모듈 구현 계획

**Goal:** 대화 히스토리 로드/저장 인프라. Chat API 플로우 step 4(로드) + step 9(저장) 담당.

**Architecture:** `server/core/memory.ts` 단일 파일. 비즈니스 무관 (L-5). SupabaseClient를 파라미터로 받음 (P-4: Composition Root에서 주입).

---

## 설계 근거

- token-management.md §1.3: 히스토리 로드 규칙 — 턴(user 메시지) 기준, historyLimit=20
- api-spec.md §3.4: step 4(히스토리 로드), step 9(비동기 저장)
- TDD §3.4: 단기 메모리 = Supabase DB (messages 테이블)
- schema.dbml: messages(id, conversation_id, role, content, card_data, tool_calls, created_at)
- CLAUDE.md: L-0a(server-only), L-4(core 수정 승인), L-5(비즈니스 금지), P-4(Composition Root), P-7(단일 변경점), G-9(export 최소)

## 파일 구조

```
src/server/core/
  ├── memory.ts        ← MODIFY: 스켈레톤 → 구현 (L-4 승인)
  └── memory.test.ts   ← CREATE: 로드/저장 테스트
```

## 의존성 방향

```
core/memory.ts → @supabase/supabase-js (type-only: SupabaseClient)

역방향 없음:
config.ts  → memory.ts  ✗
db.ts      → memory.ts  ✗
knowledge.ts → memory.ts ✗
shared/    → memory.ts  ✗ (R-4)
features/  → memory.ts  ✓ (R-5 허용: chatService에서 향후 import)
```

**핵심**: memory.ts는 db.ts를 import하지 않음. SupabaseClient를 **파라미터로 받음** (P-4). 호출자(route handler)가 createAuthenticatedClient로 클라이언트를 생성하여 전달.

## 범위 한정

| 포함 | 제외 |
|------|------|
| `loadRecentMessages()` — 최근 N턴 로드 | 히스토리 요약 (v0.2 P2-71) |
| `saveMessages()` — 메시지 배열 저장 | 대화 생성/조회 (P2-19 chatService 책임) |
| 턴 기반 카운트 (user 메시지 기준) | 토큰 기반 로드 (v0.2 P2-75) |

## MVP 메시지 타입

```typescript
// memory.ts 내부 타입 (L-14: export 안 함)
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  card_data?: unknown;
  tool_calls?: unknown;
}

// 저장용 (DB INSERT)
interface MessageInsert {
  conversation_id: string;
  role: string;
  content: string;
  card_data?: unknown;
  tool_calls?: unknown;
}
```

> card_data, tool_calls는 JSONB 컬럼. 구조는 P2-19(chatService)에서 확정. memory.ts는 제네릭하게 unknown으로 처리.

---

### Task 1: 테스트 작성

- [ ] **Step 1:** memory.test.ts 작성

테스트 케이스:
1. **loadRecentMessages**: 최근 N턴 메시지 로드 (user 기준 카운트)
2. **loadRecentMessages**: 대화 없음 → 빈 배열
3. **loadRecentMessages**: conversationId 필수
4. **saveMessages**: 메시지 배열 저장
5. **saveMessages**: 빈 배열 → 에러 없이 리턴
6. **saveMessages**: conversationId 필수

### Task 2: 구현

- [ ] **Step 2:** 테스트 실패 확인
- [ ] **Step 3:** memory.ts 구현

```typescript
// core/memory.ts 구조
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadRecentMessages(
  client: SupabaseClient,
  conversationId: string,
  limit: number,
): Promise<Message[]>
// 1. messages 테이블에서 conversation_id로 조회
// 2. created_at DESC 정렬
// 3. user 메시지 기준 limit 턴 카운트 (충분한 행 조회 후 코드에서 잘라냄)
// 4. 시간순 정렬 후 반환

export async function saveMessages(
  client: SupabaseClient,
  conversationId: string,
  messages: MessageInsert[],
): Promise<void>
// 1. messages 배열을 DB INSERT
// 2. 빈 배열이면 즉시 리턴
```

- [ ] **Step 4:** 테스트 통과 확인
- [ ] **Step 5:** 전체 테스트 확인
- [ ] **Step 6:** 커밋

---

## 완료 후 검증 체크리스트

```
□ L-0a   import 'server-only' 첫 줄
□ L-4    core/ 수정 승인 표시
□ L-5    K-뷰티 비즈니스 용어 없음 (role, content, conversation_id만)
□ P-2    Core 불변: 비즈니스 무관 CRUD 유틸
□ P-4    SupabaseClient를 파라미터로 받음 (Composition Root)
□ P-7    히스토리 로드/저장 변경 = memory.ts 1파일
□ P-8    순환 없음: db.ts, config.ts import 없음
□ G-8    any 타입 없음 (card_data/tool_calls는 unknown)
□ G-9    export 2개만 (loadRecentMessages, saveMessages)
□ L-14   Message, MessageInsert 타입 export 안 함
□ Q-7    에러 불삼킴: DB 에러 시 throw
□ R-3    core → features import 없음
```
