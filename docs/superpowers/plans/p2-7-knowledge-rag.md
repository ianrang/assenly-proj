# P2-7: Knowledge 검색 (RAG) 모듈 구현 계획

**Goal:** 텍스트→벡터 변환 인프라. `embedQuery`(검색)와 `embedDocument`(인덱싱)를 core/에 구현.

**Architecture:** config.ts에 `getEmbeddingModel()` 팩토리 추가 + knowledge.ts에 `embedQuery`/`embedDocument` 구현. 비즈니스 무관 인프라.

---

## 설계 근거

- search-engine.md §4.2: `core/knowledge.ts` 인터페이스 (embedQuery, embedDocument)
- search-engine.md §1.3: core/ 배치 (L-5: 비즈니스 무관)
- embedding-strategy.md §1.2: EMBEDDING_PROVIDER/DIMENSION 환경변수 (config.ts에 이미 정의)
- CLAUDE.md: L-0a(server-only), L-5(비즈니스 금지), P-2(core, L-4 승인), P-7(단일 변경점)

## 파일 구조

```
src/server/core/
  ├── config.ts           ← MODIFY: getEmbeddingModel() 팩토리 추가 (L-4 승인)
  ├── config.test.ts      ← MODIFY: getEmbeddingModel 테스트 추가
  ├── knowledge.ts        ← MODIFY: embedQuery + embedDocument 구현
  └── knowledge.test.ts   ← CREATE: 임베딩 함수 테스트
```

## 의존성 방향

```
core/config.ts (getEmbeddingModel) → @ai-sdk/google (외부 SDK)
core/knowledge.ts → core/config.ts (env, getEmbeddingModel)
core/knowledge.ts → ai (Vercel AI SDK embed 함수)

역방향 없음:
config.ts → knowledge.ts  ✗
shared/ → knowledge.ts     ✗ (R-4)
features/ → knowledge.ts   ✓ (R-5 허용: search-handler에서 향후 import)
```

## 범위 한정

| 포함 | 제외 |
|------|------|
| `getEmbeddingModel()` 팩토리 (config.ts) | RPC 함수 호출 (repository 책임) |
| `embedQuery(text)` → 벡터 반환 | 검색 핸들러 (search-handler.ts = P2-20) |
| `embedDocument(text)` → 벡터 반환 | 임베딩 생성 파이프라인 (P2-56a+) |
| | EMBEDDING_CONFIG 상수 (별도 작업) |

---

### Task 1: config.ts — getEmbeddingModel() 팩토리 추가

> ⚠️ L-4: core/ 파일 수정이므로 사용자 승인 필요.
> L-5: K-뷰티 비즈니스 용어 없음. 프로바이더/모델 팩토리만.

- [ ] **Step 1:** config.test.ts에 getEmbeddingModel 테스트 추가
- [ ] **Step 2:** 테스트 실패 확인
- [ ] **Step 3:** config.ts에 getEmbeddingModel 구현

```typescript
// config.ts 추가 (getModel과 대칭 패턴)
type EmbeddingProvider = 'google' | 'voyage' | 'openai';

export async function getEmbeddingModel() {
  const provider = env.EMBEDDING_PROVIDER as EmbeddingProvider;
  switch (provider) {
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      return google.textEmbeddingModel('gemini-embedding-001');
    }
    case 'voyage': {
      const { voyage } = await import('@ai-sdk/voyage');  // MVP 미설치
      return voyage.textEmbeddingModel('voyage-3-large');
    }
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');  // MVP 미설치
      return openai.textEmbeddingModel('text-embedding-3-small');
    }
    default:
      throw new Error(`Unsupported embedding provider: ${provider}`);
  }
}
```

- [ ] **Step 4:** 테스트 통과 확인

### Task 2: knowledge.ts — embedQuery + embedDocument

- [ ] **Step 5:** knowledge.test.ts 작성
- [ ] **Step 6:** 테스트 실패 확인
- [ ] **Step 7:** knowledge.ts 구현

```typescript
// core/knowledge.ts
import 'server-only';
import { embed } from 'ai';
import { getEmbeddingModel } from './config';

export async function embedQuery(text: string): Promise<number[]> {
  const model = await getEmbeddingModel();
  const { embedding } = await embed({ model, value: text });
  return embedding;
}

export async function embedDocument(text: string): Promise<number[]> {
  const model = await getEmbeddingModel();
  const { embedding } = await embed({ model, value: text });
  return embedding;
}
```

> MVP에서 embedQuery와 embedDocument는 동일 로직. 프로바이더가 task_type을 지원하면 v0.2에서 분리 (RETRIEVAL_QUERY vs RETRIEVAL_DOCUMENT).

- [ ] **Step 8:** 테스트 통과 확인
- [ ] **Step 9:** 전체 테스트 확인
- [ ] **Step 10:** 커밋

---

## 완료 후 검증 체크리스트

```
□ L-0a   import 'server-only' 첫 줄
□ L-4    core/ 수정 승인 표시 (getEmbeddingModel)
□ L-5    K-뷰티 비즈니스 용어 없음 (config.ts, knowledge.ts)
□ P-2    Core 불변 원칙: 비즈니스 무관 팩토리/유틸만
□ P-7    프로바이더 변경 = config.ts 1파일 (.env만으로도 가능)
□ P-8    순환 없음: knowledge → config 단방향
□ G-8    any 타입 없음
□ G-9    knowledge.ts export 2개만 (embedQuery, embedDocument)
□ Q-8    env는 config.ts 경유
□ R-3    core/ → features/ import 없음
```
