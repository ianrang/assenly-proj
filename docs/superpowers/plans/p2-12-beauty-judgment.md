# P2-12: 뷰티 판단 엔진 구현 계획

> 상태: 최종 확정
> 선행: P2-10 (프로필/여정 서비스) 완료
> 근거: search-engine.md §3.1~§3.2, CLAUDE.md §2.3 beauty/ 단방향 규칙

---

## 목적

SQL 하드 필터(1~2단계) 이후, 도메인별(shopping/treatment) 점수가 계산된 항목을 입력받아
**최종 정렬 + 하이라이트 배지**를 순수 함수로 처리하는 공통 랭킹 엔진.
P2-13(shopping), P2-14(treatment)의 기반 모듈이며, P2-20(search tool)에서 최종 호출.

---

## 범위

### 포함

| 파일 | 작업 | 비고 |
|------|------|------|
| `features/beauty/judgment.ts` | skeleton -> 구현 | rank() + ScoredItem + RankedResult |
| `features/beauty/judgment.test.ts` | 신규 | 단위 테스트 6개 (P2-27 부분) |

### 미포함

| 파일 | 이유 | 태스크 |
|------|------|--------|
| `beauty/shopping.ts` | scoreProduct — 쇼핑 도메인 전용 (원문 §3.2) | P2-13 |
| `beauty/treatment.ts` | checkDowntime, calculateRemainingDays — 시술 전용 (원문 §3.2) | P2-14 |
| `beauty/derived.ts` | DV-1~3 계산 (독립) | P2-15 |
| `features/repositories/*` | 1~2단계 SQL 필터 | P2-16/17 |

---

## 의존성

### 사용하는 기존 모듈 (수정 없음)

없음. judgment.ts는 shared/types만 type import.

### 의존 방향 검증

```
features/beauty/judgment.ts
  X core/ import 없음
  X features/ 타 모듈 import 없음
  X beauty/ 타 파일 import 없음 (기반 모듈)
  X DB/API 호출 없음 (L-7, R-7)
```

**§2.3 beauty/ 내부 단방향 규칙:**
```
judgment.ts  -> (없음)        기반 모듈
shopping.ts  -> judgment.ts   P2-13에서 ScoredItem, rank import
treatment.ts -> judgment.ts   P2-14에서 ScoredItem, rank import
derived.ts   -> (없음)        독립
```

순환 참조 없음.

---

## 설계 결정

### D-1. 5단계 판단 — 책임 분담

search-engine.md §3.2 원문 대조:

| 단계 | 구현 위치 | 함수 | 태스크 |
|------|----------|------|--------|
| 1. 적합성 필터 (SQL) | Repository | findByFilters WHERE | P2-16/17 |
| 2. 고민 매칭 (SQL) | Repository | findByFilters WHERE | P2-16/17 |
| 3. 다운타임 체크 | treatment.ts | checkDowntime() | P2-14 |
| 4. 성분 점수 (쇼핑) | shopping.ts | scoreProduct() | P2-13 |
| 4/5. 최종 정렬 + 하이라이트 | **judgment.ts** | rank() | **P2-12** |

judgment.ts = 도메인별 점수가 이미 계산된 ScoredItem[]을 받아 **정렬 + 하이라이트만** 담당.

### D-2. 원문 시그니처 조정 근거

원문: `rank(items, profile, journey, preferences)`
수정: `rank<T extends ScoredItem>(items: T[])`

| 원문 파라미터 | 원문에서의 용도 | 조정 근거 |
|-------------|-------------|----------|
| `profile` | skin_type → 1단계 SQL에서 처리 완료 | judgment.ts에서 사용할 필드 없음 |
| `journey` | remainingDays → 3단계 다운타임 | 3단계는 treatment.ts 책임 (§3.2) |
| `preferences` | DV-1/2 계산 → 4단계 성분 점수 | DV 계산은 derived.ts 책임. judgment.ts에서 하면 G-2(중복) 또는 §2.3(judgment→derived 위반) |

→ caller(shopping.ts, treatment.ts)가 도메인별 점수를 계산하여 ScoredItem으로 전달. judgment.ts는 단일 책임(정렬).

### D-3. 인터페이스

```typescript
/** 도메인별 전처리 결과의 공통 계약 */
export interface ScoredItem {
  id: string;
  score: number;              // 0~1, 도메인별 함수가 계산
  reasons: string[];          // 추천 근거
  warnings: string[];         // 경고 (다운타임 등)
  is_highlighted: boolean;    // 원본 엔티티의 값
}

/** 최종 결과 */
export interface RankedResult<T> {
  item: T;
  rank: number;               // 1-based
  is_highlighted: boolean;    // VP-1: 순위 미영향, 표시만
}
```

### D-4. 제거한 항목 + 근거

| 제거 항목 | 근거 |
|----------|------|
| `attachHighlight()` | rank() 내에서 1줄로 복사. 별도 함수 = G-3(패스스루 래퍼) |
| `isConstraintActive()` | `value != null` JS 관용구와 동일. G-3 위반. caller에서 인라인 사용 |

### D-5. 정렬 기준

```
1차: score 내림차순
2차: 동점 시 원래 순서 유지 (stable sort)
VP-1: is_highlighted는 정렬 기준에 미포함 (Q-2)
```

### D-6. export 범위 (G-9)

| export | 용도 | 소비자 |
|--------|------|--------|
| `rank()` | 최종 정렬 진입점 | shopping.ts, treatment.ts, search-handler |
| `ScoredItem` | 도메인별 점수 결과 인터페이스 | shopping.ts, treatment.ts |
| `RankedResult` | 최종 결과 타입 | search-handler |

3개 export. 내부 전용 타입 없음.

---

## 구현

### judgment.ts

```typescript
import 'server-only';

// ============================================================
// 뷰티 판단 엔진 — search-engine.md §3.1~§3.2
// 5단계 중 최종 정렬(4단계) + 하이라이트(5단계) 담당.
// 1~2단계 = Repository SQL. 3~4단계 점수 = shopping.ts, treatment.ts.
// R-7: shared/ ONLY. beauty/ 타 파일 import 없음 (기반 모듈).
// L-7: 순수 함수. DB/API 호출 없음.
// G-9: export 3개 (rank, ScoredItem, RankedResult).
// ============================================================

/** 도메인별 전처리 결과의 공통 계약 — shopping.ts/treatment.ts가 생성 */
export interface ScoredItem {
  id: string;
  score: number;
  reasons: string[];
  warnings: string[];
  is_highlighted: boolean;
}

/** 최종 랭킹 결과 */
export interface RankedResult<T> {
  item: T;
  rank: number;
  is_highlighted: boolean;
}

/**
 * 도메인별 점수가 계산된 항목을 최종 정렬한다.
 * score 내림차순 stable sort + 하이라이트 배지 복사 (VP-1: 순위 미영향).
 */
export function rank<T extends ScoredItem>(
  items: T[],
): RankedResult<T>[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);

  return sorted.map((item, index) => ({
    item,
    rank: index + 1,
    is_highlighted: item.is_highlighted,
  }));
}
```

### judgment.test.ts

| 테스트 | 검증 |
|--------|------|
| rank: 점수 기반 정렬 | 높은 score 상위 |
| rank: 동점 시 stable sort | 입력 순서 유지 |
| rank: VP-1 하이라이트 순위 미영향 | is_highlighted=true여도 정렬에 영향 없음 |
| rank: 하이라이트 값 전달 | is_highlighted 결과에 그대로 복사 |
| rank: 빈 배열 입력 | 빈 배열 반환 |
| rank: 순위 번호 1-based | rank = 1, 2, 3... |

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: beauty/ -> (없음). shared/ type import만 가능
[ ] V-2  core/ 수정 없음
[ ] V-7  순수 함수: DB/API 호출 없음
[ ] V-8  단방향: judgment.ts -> 다른 beauty/ import 없음
[ ] V-9  중복 없음: 다운타임=treatment.ts, 성분=shopping.ts
[ ] V-10 미사용 export 없음
[ ] V-17 제거 안전성: core/, shared/ 빌드 무영향
```

### 품질

```
[ ] Q-2  VP-1: is_highlighted가 sort 비교/score 산출에 미참조
[ ] G-2  중복 금지
[ ] G-3  패스스루 래퍼 없음 (isConstraintActive, attachHighlight 제거)
[ ] G-8  any 없음
[ ] G-9  export 3개
[ ] G-10 매직 넘버 없음
```

### 테스트

```
[ ] judgment.test.ts 6개
[ ] npx vitest run 전체 통과
[ ] grep: is_highlighted가 sort/score 로직에 미참조
```
