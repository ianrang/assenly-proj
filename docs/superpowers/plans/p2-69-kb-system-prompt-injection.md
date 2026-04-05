# P2-69: KB 시스템 프롬프트 주입 (Tool 기반 파일 조회)

> 버전: 1.0
> 작성일: 2026-04-05
> 정본: embedding-strategy.md §2.4 ("MVP는 시스템 프롬프트 인라인 또는 파일 기반")
> 상위: TDD §3.2 ("Knowledge Base = 제품 DB + 장소 DB + 뷰티 지식 KB")
> 선행: P2-57 (KB 37종 작성 완료), P2-7 (core/knowledge.ts embedQuery/embedDocument 완료)

---

## 1. 목적

LLM이 대화 중 성분/시술 지식 질문 시 `docs/knowledge-base/` 37종 문서를 조회하여 답변에 활용할 수 있도록 한다.

## 2. 방식 결정 — Tool 기반 파일 조회

| 방식 | 토큰 비용 | 구현 난이도 | 채택 |
|------|----------|-----------|:----:|
| 전수 인라인 (37개 전부 시스템 프롬프트) | ❌ 매번 +18,000 | 낮음 | ✗ |
| **Tool 기반 파일 조회 (필요 시 1~2개)** | **✅ +500~1,000** | **낮음** | **✓** |
| RAG 벡터 검색 (DB 테이블 + 임베딩) | ✅ +500~1,000 | 높음 | ✗ (v0.2) |

**근거**: embedding-strategy.md §2.4 "MVP는 시스템 프롬프트 인라인 또는 **파일 기반**". 파일 기반 = Tool로 파일 읽기.

## 3. 아키텍처 검증

### 3.1 계층 배치

```
src/server/features/chat/tools/knowledge-handler.ts  ← NEW
```

- features/chat/tools/ 배치 (기존 3개 handler와 동일 위치)
- K-뷰티 성분/시술 용어 참조 → core/ 부적합 (L-5), features/ 적합
- tool handler = R-6 허용: 파일 읽기 직접 수행

### 3.2 의존성 방향

```
knowledge-handler.ts
  ├──→ node:fs/promises (readFile)    — 외부 표준 라이브러리
  ├──→ node:path (join)               — 외부 표준 라이브러리
  └──→ (없음)                          — shared/, core/ import 불필요

역방향 없음:
  core/ → knowledge-handler.ts          ✗ (R-3 준수)
  shared/ → knowledge-handler.ts        ✗ (R-4 준수)
  다른 features/ → knowledge-handler.ts  ✗ (R-9 준수)
  search-handler → knowledge-handler    ✗ (peer 간 의존 없음)
```

### 3.3 의존 규칙 검증

| 규칙 | 검증 결과 |
|------|----------|
| P-1 (4계층 DAG) | ✅ app/ → server/features/ 단방향 |
| P-2 (Core 불변) | ✅ core/ 수정 없음 |
| P-3 (Last Leaf) | ✅ knowledge-handler 제거 시 다른 features/ 무영향 |
| P-4 (Composition Root) | ✅ service.ts가 tool 등록 (조합 루트) |
| P-5 (콜 스택 ≤ 4) | ✅ route → service → tool handler (3단계) |
| P-6 (바인딩 ≤ 4) | ✅ service → knowledge-handler (1단계) |
| P-7 (단일 변경점) | ✅ KB 파일 추가 = 파일만 추가 + TOPICS 상수 1줄 |
| P-8 (순환 의존 금지) | ✅ 단방향만 |
| P-10 (제거 안전성) | ✅ knowledge-handler 삭제 → service.ts에서 tool 제거만 하면 빌드 정상 |
| R-6 (tool handler) | ✅ 파일 시스템 직접 접근 (DB 아님, 허용) |
| R-10 (tool→service 역호출 금지) | ✅ service import 없음 |
| L-0a (server-only) | ✅ 첫 줄 import 'server-only' |

## 4. 파일 변경 목록

| 파일 | 변경 | 이유 |
|------|------|------|
| `features/chat/tools/knowledge-handler.ts` | **CREATE** | KB 파일 읽기 handler |
| `features/chat/tools/knowledge-handler.test.ts` | **CREATE** | handler 테스트 |
| `features/chat/service.ts` | **MODIFY** | 4번째 tool 등록 (import + buildTools에 추가) |
| `features/chat/prompts.ts` | **MODIFY** | §6 TOOLS_SECTION에 lookup_beauty_knowledge 설명 추가 |

**수정하지 않는 파일:**
- core/ 파일 전부 (P-2)
- shared/ 파일 전부
- 다른 features/ 파일 전부
- search-handler, links-handler, extraction-handler (기존 tool 무영향)

## 5. 상세 설계

### 5.1 knowledge-handler.ts

```typescript
// src/server/features/chat/tools/knowledge-handler.ts
import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ============================================================
// lookup_beauty_knowledge Tool Handler
// R-6: tool handler. 파일 시스템에서 KB 문서 조회.
// R-10: service 역호출 금지.
// P-3: 제거 시 다른 features/ 무영향.
// ============================================================

/** 유효 topic 목록. KB 파일 추가 시 여기만 수정 (P-7). */
const INGREDIENT_TOPICS = [
  'adenosine', 'arbutin', 'ascorbic-acid', 'azelaic-acid',
  'centella-asiatica-extract', 'ceramide-np', 'ginseng-extract',
  'glycolic-acid', 'green-tea-extract', 'hyaluronic-acid',
  'mugwort-extract', 'niacinamide', 'panthenol', 'propolis-extract',
  'retinol', 'rice-extract', 'salicylic-acid',
  'snail-secretion-filtrate', 'squalane', 'tocopherol',
] as const;

const TREATMENT_TOPICS = [
  'aqua-peel', 'body-contouring', 'botox', 'chemical-peel',
  'co2-laser', 'filler', 'fractional-laser', 'hydrafacial',
  'ipl', 'laser-toning', 'led-therapy', 'microneedling',
  'pico-laser', 'scalp-treatment', 'skin-booster',
  'thread-lift', 'vitamin-drip',
] as const;

type IngredientTopic = typeof INGREDIENT_TOPICS[number];
type TreatmentTopic = typeof TREATMENT_TOPICS[number];
type KnowledgeTopic = IngredientTopic | TreatmentTopic;

/** LLM tool description용 topic 목록 export */
export const VALID_TOPICS = [...INGREDIENT_TOPICS, ...TREATMENT_TOPICS] as const;

const KB_BASE_DIR = join(process.cwd(), 'docs', 'knowledge-base');

interface KnowledgeArgs {
  topic: string;
}

interface KnowledgeResult {
  found: boolean;
  topic: string;
  category: 'ingredient' | 'treatment' | null;
  content: string | null;
}

/**
 * lookup_beauty_knowledge tool execute 함수.
 * topic → KB 파일 경로 매핑 → 파일 읽기 → 내용 반환.
 * 미존재 topic → { found: false }.
 */
export async function executeLookupBeautyKnowledge(
  args: KnowledgeArgs,
): Promise<KnowledgeResult> {
  const { topic } = args;
  const normalized = topic.toLowerCase().trim();

  // category 판별
  let category: 'ingredient' | 'treatment' | null = null;
  if ((INGREDIENT_TOPICS as readonly string[]).includes(normalized)) {
    category = 'ingredient';
  } else if ((TREATMENT_TOPICS as readonly string[]).includes(normalized)) {
    category = 'treatment';
  }

  if (!category) {
    return { found: false, topic: normalized, category: null, content: null };
  }

  const subDir = category === 'ingredient' ? 'ingredients' : 'treatments';
  const filePath = join(KB_BASE_DIR, subDir, `${normalized}.md`);

  try {
    const content = await readFile(filePath, 'utf-8');
    return { found: true, topic: normalized, category, content };
  } catch {
    return { found: false, topic: normalized, category, content: null };
  }
}
```

### 5.2 service.ts 변경 (최소)

```diff
+ import { executeLookupBeautyKnowledge } from './tools/knowledge-handler';

  // lookupBeautyKnowledgeSchema (service.ts 내 정의)
+ const lookupBeautyKnowledgeSchema = z.object({
+   topic: z.string().describe('Topic to look up (e.g. "retinol", "botox", "hyaluronic-acid")'),
+ });

  // buildTools 내 추가
+ lookup_beauty_knowledge: tool({
+   description: 'Look up detailed K-beauty knowledge about a specific ingredient or treatment.',
+   inputSchema: lookupBeautyKnowledgeSchema,
+   execute: async (args) => executeLookupBeautyKnowledge(args),
+ }),
```

### 5.3 prompts.ts 변경 (TOOLS_SECTION에 추가)

```
### lookup_beauty_knowledge
Look up detailed knowledge about a specific K-beauty ingredient or treatment.
Returns expert-level information including skin type suitability, precautions, and tips.

**When to call:**
- User asks about a specific ingredient ("What is retinol?", "Is niacinamide good for oily skin?")
- User asks about a specific treatment ("Tell me about botox", "What's the downtime for microneedling?")
- User asks about ingredient interactions or precautions
- You need expert context to give accurate advice about an ingredient or treatment

**When NOT to call:**
- User asks for product/treatment recommendations (use search_beauty_data instead)
- You already looked up the same topic earlier in this conversation
- General skincare questions you can answer without specific ingredient/treatment data

**Available topics:**
Ingredients: adenosine, arbutin, ascorbic-acid, azelaic-acid, centella-asiatica-extract, ceramide-np, ginseng-extract, glycolic-acid, green-tea-extract, hyaluronic-acid, mugwort-extract, niacinamide, panthenol, propolis-extract, retinol, rice-extract, salicylic-acid, snail-secretion-filtrate, squalane, tocopherol
Treatments: aqua-peel, body-contouring, botox, chemical-peel, co2-laser, filler, fractional-laser, hydrafacial, ipl, laser-toning, led-therapy, microneedling, pico-laser, scalp-treatment, skin-booster, thread-lift, vitamin-drip
```

## 6. 검증 체크리스트

```
□ V-1  의존성 방향: knowledge-handler → node:fs, node:path만. 역방향 없음
□ V-2  core 불변: core/ 파일 수정 없음
□ V-3  Composition Root: service.ts가 tool 등록 (P-4)
□ V-4  features 독립: knowledge-handler ↔ search-handler 간 import 없음
□ V-5  콜 스택 ≤ 4: route → service → knowledge-handler (3단계)
□ V-9  중복: 기존 handler와 동일 기능 없음
□ V-10 불필요 코드: VALID_TOPICS export만 (prompts.ts에서 참조 가능하나 현재 미사용 = 제거 검토)
□ V-17 제거 안전성: knowledge-handler 삭제 → service.ts tool 제거만
□ G-1  기존 코드 분석: links-handler, search-handler 패턴 확인 완료
□ G-4  미사용 코드: VALID_TOPICS는 향후 확장용이나 현재 미사용 → 제거하고 필요 시 추가
□ G-5  기존 패턴: 3개 기존 tool handler와 동일 구조
□ G-8  any 타입 없음
□ Q-7  에러 불삼킴: readFile 실패 → { found: false } 반환 (LLM이 판단)
□ L-0a server-only 첫 줄
□ N-2  파일명 kebab-case: knowledge-handler.ts
□ N-4  함수명 camelCase: executeLookupBeautyKnowledge
□ S-10 (해당 없음: 서버 코드)
```

## 7. VALID_TOPICS export 판단

G-4 (미사용 코드 금지) vs 향후 확장성:
- 현재 `VALID_TOPICS`는 prompts.ts TOOLS_SECTION에서 하드코딩된 문자열로 중복 존재
- **결정: VALID_TOPICS는 export하되, prompts.ts에서 import하여 단일 진실 공급원으로 사용**
- 이렇게 하면 KB 파일 추가 시 knowledge-handler.ts 1곳만 수정 (P-7 강화)

## 8. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| LLM이 tool을 호출하지 않음 | KB 미활용 | 프롬프트 §6에 명확한 호출 조건 기술 |
| 잘못된 topic 전달 | { found: false } 반환 | LLM이 available topics 목록 참조 |
| 파일 읽기 실패 (배포 환경) | KB 미제공 | process.cwd() 기반 경로. Vercel 배포 시 docs/ 포함 여부 확인 필요 |
| 프로덕션에서 docs/ 미포함 | KB 전체 작동 안 함 | **논의 필요: docs/ 대신 public/ 또는 src/server/features/chat/knowledge/ 에 KB 배치** |

## 9. 논의 필요 사항

**KB 파일 배치 위치:**
- 현재: `docs/knowledge-base/` (문서 디렉토리)
- 문제: Vercel 배포 시 `docs/`가 번들에 포함되지 않을 수 있음
- 대안 A: `src/server/features/chat/knowledge/` (서버 코드와 함께 번들)
- 대안 B: KB 내용을 TypeScript 상수로 변환 (빌드 시 포함 보장)
- 대안 C: `docs/` 유지 + next.config에서 포함 설정

→ **배포 환경에서 파일 접근 가능 여부 확인 후 결정**
