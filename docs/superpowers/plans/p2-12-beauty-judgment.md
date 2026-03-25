# P2-12: 뷰티 판단 엔진 구현 계획

> 상태: 검토 완료
> 선행: P2-10 (프로필/여정 서비스) 완료
> 근거: search-engine.md §3.1~§3.2, CLAUDE.md §2.3 beauty/ 단방향 규칙

---

## 목적

SQL 하드 필터(1~2단계, Repository 담당) 이후 결과를 입력받아 **제약 조건 필터 → 개인화 정렬 → 하이라이트 배지**를 순수 함수로 처리하는 공통 랭킹 엔진.
P2-13(shopping), P2-14(treatment)의 기반 모듈이며, P2-20(search tool)에서 최종 호출.

---

## 범위

### 포함

| 파일 | 작업 | 비고 |
|------|------|------|
| `features/beauty/judgment.ts` | skeleton -> 구현 | rank() + 공통 헬퍼 |
| `features/beauty/judgment.test.ts` | 신규 | 단위 테스트 (P2-27 부분) |

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

| 모듈 | 용도 | 수정 |
|------|------|------|
| `shared/types/domain.ts` | Product, Treatment 등 엔티티 타입 | 없음 |

### 의존 방향 검증

```
features/beauty/judgment.ts
  -> shared/types/domain.ts (type import)
  X core/ import 없음
  X features/ 타 모듈 import 없음
  X beauty/ 타 파일 import 없음 (judgment.ts는 기반 모듈)
  X DB/API 호출 없음 (L-7, R-7)
```

**§2.3 beauty/ 내부 단방향 규칙:**
```
judgment.ts -> (없음)        -- 기반 모듈, import 없음
shopping.ts -> judgment.ts   -- P2-13에서 import
treatment.ts -> judgment.ts  -- P2-14에서 import
derived.ts -> (없음)         -- 독립, import 없음
```

순환 참조 없음.

---

## 설계 결정

### D-1. 5단계 판단 — judgment.ts vs 도메인별 beauty/ 파일 책임 분담

search-engine.md §3.2 원문 대조:

| 단계 | 구현 위치 | 함수 | 태스크 |
|------|----------|------|--------|
| 1. 적합성 필터 (SQL) | Repository | findByFilters WHERE | P2-16/17 |
| 2. 고민 매칭 (SQL) | Repository | findByFilters WHERE | P2-16/17 |
| 3. 다운타임 체크 | **treatment.ts** | `checkDowntime()`, `calculateRemainingDays()` | **P2-14** |
| 4. 성분 점수 (쇼핑) | **shopping.ts** | `scoreProduct()` | **P2-13** |
| 4. 개인화 정렬 (공통) | **judgment.ts** | `rank()` — 도메인별 점수를 받아 최종 정렬 | **P2-12** |
| 5. 하이라이트 배지 | **judgment.ts** | `rank()` 내 — 순위 미영향 (VP-1) | **P2-12** |

**핵심**: judgment.ts는 **도메인별 점수가 이미 계산된** 항목을 받아 **최종 정렬 + 하이라이트만** 담당. 다운타임/성분 점수 계산은 각 도메인 파일 책임.

### D-2. rank() 시그니처

search-engine.md §3.2 원문:
```typescript
function rank(items, profile, journey, preferences): RankedEntity[]
```

원문 분석:
- `profile` (UP-1~4): skin_type은 1단계 SQL에서 이미 처리. judgment.ts에서 재사용할 필드 없음
- `journey` (JC-1~5): remainingDays만 3단계에서 사용 → 그런데 3단계는 treatment.ts 책임
- `preferences` (BH-4): DV-1/2 계산은 derived.ts 책임. judgment.ts에서 DV 계산하면 G-2(중복)/§2.3 위반

**MVP 조정 (원문 의도 준수 + 아키텍처 규칙 준수):**

```typescript
/** 공통 랭킹 — 도메인별 전처리 완료 후 최종 정렬 */
export function rank<T extends ScoredItem>(
  items: T[],
): RankedResult<T>[]

/** 도메인별 전처리가 완료된 항목 — shopping.ts/treatment.ts가 생성 */
export interface ScoredItem {
  id: string;
  score: number;              // 도메인별 함수가 계산한 점수
  reasons: string[];          // 추천 근거
  warnings: string[];         // 경고 (다운타임 등)
  is_highlighted: boolean;    // 원본 엔티티의 값
}

/** 최종 결과 */
export interface RankedResult<T> {
  item: T;
  rank: number;               // 1-based 순위
  is_highlighted: boolean;    // VP-1: 순위 미영향, 표시만
}
```

**설계 근거:**
- judgment.ts는 **점수가 이미 계산된** ScoredItem[]을 받아 정렬만 수행
- 다운타임 체크, 성분 매칭은 caller(shopping.ts, treatment.ts)가 처리
- DV-1/2는 caller(search-handler)가 derived.ts를 호출하여 미리 계산
- judgment.ts → derived.ts import 불필요 → §2.3 단방향 유지
- profile, journey, preferences를 judgment.ts에 전달할 필요 없음 → 단일 책임

### D-3. 추가 유틸 함수 (P2-13/14에서 사용)

judgment.ts가 공통으로 제공할 헬퍼:

```typescript
/** 하이라이트 배지 부착 — VP-1: 순위 미영향 */
export function attachHighlight<T extends { is_highlighted: boolean }>(
  item: T,
): { is_highlighted: boolean; highlight_badge: string | null }
// score/정렬에 절대 참여하지 않음 (Q-2, V-11)

/** VP-3 null-safe: null이면 필터 비활성 */
export function isConstraintActive(value: unknown): boolean
// null/undefined → false (필터 스킵)
```

### D-4. 정렬 기준

```
1차: score 내림차순 (높은 점수 우선)
2차: score 동점 시 원래 순서 유지 (stable sort)
VP-1: is_highlighted는 정렬 기준에 포함하지 않음
```

### D-5. export 범위 (G-9)

| export | 용도 | 소비자 |
|--------|------|--------|
| `rank()` | 최종 정렬 진입점 | shopping.ts, treatment.ts, search-handler |
| `ScoredItem` | 도메인별 점수 결과 인터페이스 | shopping.ts, treatment.ts |
| `RankedResult` | 최종 결과 타입 | search-handler |
| `isConstraintActive` | VP-3 null-safe 공통 가드 | shopping.ts, treatment.ts |

4개 export. 내부 헬퍼(attachHighlight)는 rank() 내부에서만 사용 시 비공개.

---

## 구현 순서

### Step 1: 인터페이스 정의

- `ScoredItem` (export): 도메인별 전처리 결과의 공통 계약
- `RankedResult` (export): 최종 결과
- judgment.ts 내부 전용 타입은 export 안 함 (L-14)

### Step 2: isConstraintActive 유틸

- VP-3: null/undefined → false 반환
- 0, 빈 문자열, 빈 배열 → 별도 판단 (0은 유효값)

### Step 3: rank() 구현

```typescript
export function rank<T extends ScoredItem>(items: T[]): RankedResult<T>[] {
  // 1. score 내림차순 stable sort
  const sorted = [...items].sort((a, b) => b.score - a.score);

  // 2. 순위 부여 + 하이라이트 복사 (VP-1: 순위 미영향)
  return sorted.map((item, index) => ({
    item,
    rank: index + 1,
    is_highlighted: item.is_highlighted,
  }));
}
```

### Step 4: 테스트 작성

| 테스트 | 검증 |
|--------|------|
| rank: 점수 기반 정렬 | 높은 score 상위 |
| rank: 동점 시 stable sort | 입력 순서 유지 |
| rank: VP-1 하이라이트 순위 미영향 | is_highlighted=true 항목이 정렬에 영향 없음 |
| rank: 하이라이트 값 전달 | is_highlighted가 결과에 그대로 복사 |
| rank: 빈 배열 입력 | 빈 배열 반환 |
| rank: 순위 번호 1-based | rank 필드가 1부터 시작 |
| isConstraintActive: null -> false | VP-3 null-safe |
| isConstraintActive: undefined -> false | VP-3 |
| isConstraintActive: 0 -> true | 0은 유효값 |
| isConstraintActive: 비어있지 않은 값 -> true | 일반 값 |

---

## 검증 체크리스트

### 아키텍처 (P-*, R-*)

```
[ ] V-1  import 방향: beauty/ -> shared/ ONLY (R-7)
[ ] V-2  core/ 수정 없음
[ ] V-7  beauty/ 순수 함수: DB/API 호출 없음 (L-7)
[ ] V-8  beauty/ 단방향: judgment.ts -> (없음). 다른 beauty/ import 없음
[ ] V-9  중복: shopping.ts의 scoreProduct, treatment.ts의 checkDowntime과 중복 없음
[ ] V-10 미사용 export 없음
[ ] V-17 judgment.ts 삭제해도 core/, shared/ 빌드 에러 없음
```

### 품질 (Q-*, G-*)

```
[ ] Q-2  VP-1: is_highlighted가 score/정렬/필터에 사용되지 않음 (V-11)
[ ] Q-3  VP-3: isConstraintActive — null/undefined 시 비활성
[ ] G-2  중복 금지: 다운타임/성분점수 로직은 도메인별 파일에만 존재
[ ] G-4  미사용 코드 없음
[ ] G-8  any 타입 없음
[ ] G-9  export 4개만
[ ] G-10 매직 넘버 없음
```

### 비즈니스 검증

```
[ ] VP-1: is_highlighted → 결과에 복사만, 정렬 기준에 미참여
[ ] VP-3: null 값 가드 유틸 제공
[ ] 정렬: score 내림차순, stable sort
[ ] 책임 분리: 다운타임=treatment.ts, 성분점수=shopping.ts, 정렬=judgment.ts
```

### 테스트

```
[ ] judgment.test.ts 테스트 10개
[ ] npx vitest run 전체 통과
[ ] V-11 grep: is_highlighted가 score 산출/sort 비교 로직에 미참조
```
