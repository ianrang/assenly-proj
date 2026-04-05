# Tool 스키마 Co-location 리팩토링 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tool handler 3개의 스키마 위치를 통일하여 일관성·타입 안전성을 확보하고, `as unknown as` 캐스팅을 제거한다.

**Architecture:** extraction-handler가 이미 구현한 패턴(스키마 + execute 함수 co-location)으로 search-handler, links-handler를 통일. service.ts는 각 handler에서 스키마를 import하여 tool() 등록만 수행 (P-4 Composition Root). 동작 변경 0건.

**Tech Stack:** TypeScript, Zod, Vercel AI SDK 6.x

---

## 파일 구조

```
src/server/features/chat/
├── service.ts                          ← MODIFY: 스키마 정의 삭제, handler에서 import, as unknown as 제거
├── prompts.ts                          ← 변경 없음
├── llm-client.ts                       ← 변경 없음
└── tools/
    ├── search-handler.ts               ← MODIFY: 스키마 export 추가, SearchArgs를 zod infer로 변경
    ├── search-handler.test.ts          ← 변경 없음 (service.ts 스키마 미참조 확인 완료)
    ├── links-handler.ts                ← MODIFY: 스키마 export 추가, LinksArgs를 zod infer로 변경
    ├── links-handler.test.ts           ← 변경 없음 (service.ts 스키마 미참조 확인 완료)
    ├── extraction-handler.ts           ← 변경 없음 (이미 올바른 패턴)
    └── extraction-handler.test.ts      ← 변경 없음
```

---

### Task 1: search-handler 스키마 co-location

**Files:**
- Modify: `src/server/features/chat/tools/search-handler.ts:1-40`

- [ ] **Step 1: zod import 추가 + 스키마 정의 추가 + SearchArgs를 zod infer로 변경**

`search-handler.ts` 상단에 zod import 추가, 스키마를 export로 정의, 기존 수동 `SearchArgs` 인터페이스를 zod infer 타입으로 교체:

```typescript
import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfileVars, JourneyContextVars, LearnedPreference } from '@/shared/types/profile';
import type { SkinConcern } from '@/shared/types/domain';
import { embedQuery } from '@/server/core/knowledge';
import { findProductsByFilters, matchProductsByVector } from '@/server/features/repositories/product-repository';
import { findTreatmentsByFilters, matchTreatmentsByVector } from '@/server/features/repositories/treatment-repository';
import { scoreProducts } from '@/server/features/beauty/shopping';
import { scoreTreatments } from '@/server/features/beauty/treatment';
import { rank } from '@/server/features/beauty/judgment';
import { calculatePreferredIngredients, calculateAvoidedIngredients } from '@/server/features/beauty/derived';

// ============================================================
// search_beauty_data Tool Handler — tool-spec.md §1
// R-6: repositories/ + beauty/ + core/ 직접 import 허용 (tool handler 유일한 예외).
// R-10: service 역호출 금지.
// search-engine.md §1.1 경로1, §5.2 벡터/SQL 분기.
// ============================================================

/** tool-spec.md §1 입력 스키마 — service.ts에서 tool() inputSchema로 사용 */
export const searchBeautyDataSchema = z.object({
  query: z.string().describe('Search query in natural language'),
  domain: z.enum(['shopping', 'treatment']).describe('shopping = products+stores, treatment = procedures+clinics'),
  filters: z.object({
    skin_types: z.array(z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal'])).optional(),
    concerns: z.array(z.string()).optional(),
    category: z.string().optional(),
    budget_max_krw: z.number().optional(),
    max_downtime: z.number().optional(),
    english_support: z.enum(['none', 'basic', 'good', 'fluent']).optional(),
  }).optional(),
  limit: z.number().optional().default(3),
});

/** 스키마에서 추론된 입력 타입 */
type SearchArgs = z.infer<typeof searchBeautyDataSchema>;

/** tool execute에 전달되는 context (P-4: chatService가 구성) */
export interface SearchToolContext {
  client: SupabaseClient;
  profile: UserProfileVars | null;
  journey: JourneyContextVars | null;
  preferences: LearnedPreference[];
}
```

나머지 코드(executeSearchBeautyData 함수 및 하위 함수들)는 **변경 없음**. SearchArgs 타입은 이름과 구조가 동일하므로 함수 시그니처 호환.

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run src/server/features/chat/tools/search-handler.test.ts`
Expected: 전체 PASS (스키마 위치만 변경, 테스트는 execute 함수만 검증)

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

---

### Task 2: links-handler 스키마 co-location

**Files:**
- Modify: `src/server/features/chat/tools/links-handler.ts:1-20`

- [ ] **Step 1: zod import 추가 + 스키마 정의 추가 + LinksArgs를 zod infer로 변경**

`links-handler.ts` 상단:

```typescript
import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExternalLink, LinkType } from '@/shared/types/domain';

// ============================================================
// get_external_links Tool Handler — tool-spec.md §2
// R-6: tool handler. Supabase client 직접 조회 (단순 select).
// R-10: service 역호출 금지.
// tool-spec.md §4.2: 링크 조회 실패 → 빈 배열 반환.
// ============================================================

/** tool-spec.md §2 입력 스키마 — service.ts에서 tool() inputSchema로 사용 */
export const getExternalLinksSchema = z.object({
  entity_id: z.string().describe('ID of the entity'),
  entity_type: z.enum(['product', 'store', 'clinic', 'treatment']).describe('Type of entity'),
});

/** 스키마에서 추론된 입력 타입 */
type LinksArgs = z.infer<typeof getExternalLinksSchema>;

/** tool execute에 전달되는 context */
export interface LinksToolContext {
  client: SupabaseClient;
}
```

나머지 코드(executeGetExternalLinks 함수 및 하위 함수들)는 **변경 없음**.

- [ ] **Step 2: 테스트 실행**

Run: `npx vitest run src/server/features/chat/tools/links-handler.test.ts`
Expected: 전체 PASS

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

---

### Task 3: service.ts 정리 — 스키마 삭제 + handler import + 캐스팅 제거

**Files:**
- Modify: `src/server/features/chat/service.ts:1-212`

- [ ] **Step 1: import 변경 — handler에서 스키마 import**

```typescript
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile, Journey, LearnedPreference, DerivedVariables } from '@/shared/types/profile';
import type { ModelMessage } from 'ai';
import { tool, stepCountIs } from 'ai';
import { callWithFallback } from './llm-client';
import { buildSystemPrompt } from './prompts';
import { executeSearchBeautyData, searchBeautyDataSchema, type SearchToolContext } from './tools/search-handler';
import { executeGetExternalLinks, getExternalLinksSchema, type LinksToolContext } from './tools/links-handler';
import {
  executeExtractUserProfile,
  extractUserProfileSchema,
  type ExtractionResult,
} from './tools/extraction-handler';
```

변경: `searchBeautyDataSchema`, `getExternalLinksSchema` import 추가. `z` import 및 `zod` 의존 **삭제**.

- [ ] **Step 2: 스키마 정의 삭제**

`service.ts:154-173`의 `searchBeautyDataSchema`, `getExternalLinksSchema` 정의 **전체 삭제** (handler로 이동 완료).

- [ ] **Step 3: buildTools에서 as unknown as 캐스팅 제거**

```typescript
/** tool 등록. AI SDK tool() 헬퍼 패턴. P-4: 조합 루트. */
function buildTools(
  searchContext: SearchToolContext,
  linksContext: LinksToolContext,
  extractionResults: ExtractionResult[],
) {
  return {
    search_beauty_data: tool({
      description: 'Search K-beauty products or treatments matching user criteria. Returns recommendation cards.',
      inputSchema: searchBeautyDataSchema,
      execute: async (args) => executeSearchBeautyData(args, searchContext),
    }),
    get_external_links: tool({
      description: 'Get purchase, booking, or map links for a product, store, clinic, or treatment.',
      inputSchema: getExternalLinksSchema,
      execute: async (args) => executeGetExternalLinks(args, linksContext),
    }),
    extract_user_profile: tool({
      description: 'Extract beauty profile info mentioned by user. Call when user mentions skin type, concerns, budget, travel plans.',
      inputSchema: extractUserProfileSchema,
      execute: async (args) => {
        const result = await executeExtractUserProfile(args);
        if (!('status' in result)) {
          extractionResults.push(result);
        }
        return result;
      },
    }),
  };
}
```

변경점:
- `args as unknown as Parameters<typeof ...>[0]` → `args` (3곳 모두 제거)
- `import { z } from 'zod'` 삭제 (service.ts에서 더 이상 zod 직접 사용 안 함)

- [ ] **Step 4: 전체 테스트 실행**

Run: `npx vitest run src/server/features/chat/`
Expected: 전체 PASS

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/server/features/chat/tools/search-handler.ts src/server/features/chat/tools/links-handler.ts src/server/features/chat/service.ts
git commit -m "refactor(chat): tool 스키마 handler co-location + as unknown as 캐스팅 제거

- search/links 스키마를 각 handler로 이동 (extraction-handler 패턴 통일)
- service.ts에서 zod 직접 의존 제거, handler에서 import
- 3개 tool의 as unknown as 타입 캐스팅 제거 (AI SDK 제네릭 활용)
- 동작 변경 0건. 테스트 전체 통과"
```

---

## 리팩토링 후 상태 검증

### 스키마 위치 일관성

| Tool | 스키마 위치 | Before | After |
|------|-----------|:------:|:-----:|
| search_beauty_data | search-handler.ts | ✗ (service.ts) | ✅ |
| get_external_links | links-handler.ts | ✗ (service.ts) | ✅ |
| extract_user_profile | extraction-handler.ts | ✅ | ✅ |

### 의존성 방향 (After)

```
service.ts (Composition Root)
  ├──→ prompts.ts (buildSystemPrompt)
  ├──→ llm-client.ts (callWithFallback)
  ├──→ search-handler.ts (schema + execute + context type)
  ├──→ links-handler.ts (schema + execute + context type)
  └──→ extraction-handler.ts (schema + execute + result type)

역방향: 0건
순환 참조: 0건
handler 간 교차 참조: 0건
```

### 새 tool 추가 플로우 (After)

```
1. tools/new-handler.ts CREATE — 스키마 + execute + context type (자기 완결)
2. service.ts MODIFY — import 1줄 + buildTools에 tool() 1블록 추가
3. prompts.ts MODIFY — §6 TOOLS_SECTION에 상세 사용 지침 추가
```

CREATE 1 + MODIFY 2 = P-7 준수 (CREATE는 "수정"이 아님)

### 규칙 체크리스트

```
[x] P-1  4계층 DAG: features/ 내부 이동만
[x] P-2  Core 불변: core/ 수정 없음
[x] P-3  Last Leaf: 각 handler 독립성 유지
[x] P-4  Composition Root: service.ts가 tool 등록
[x] P-7  단일 변경점: 새 tool = CREATE 1 + MODIFY 2
[x] P-8  순환 의존 금지: 단방향만
[x] R-6  tool handler 범위: import 변경 없음
[x] R-10 tool→service 역호출 금지: 역방향 0건
[x] G-2  중복 금지: 스키마 단일 위치
[x] G-5  기존 패턴: extraction-handler 패턴 통일
[x] G-8  any 타입 금지: as unknown as 제거
[x] G-9  export 최소화: 스키마 + execute + context type만
```
