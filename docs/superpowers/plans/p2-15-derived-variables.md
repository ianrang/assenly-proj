# P2-15: DV 계산기 구현 계획

> 상태: 최종 확정
> 선행: P2-12 (judgment.ts) — 직접 의존 없으나 같은 beauty/ 모듈
> 근거: search-engine.md §3.2 derived.ts, PRD §4-A DV-1~3

---

## 목적

개인화 변수(UP/JC/BH)를 입력받아 **도출 변수 DV-1(선호 성분), DV-2(기피 성분), DV-3(세그먼트)**를 계산하는 순수 함수.
DV-1/2는 search-handler(P2-20)가 계산 후 shopping.ts scoreProducts()에 전달.
DV-3는 마케팅/분석용 (PRD: "추천에 직접 미사용").
DV-4(AI 뷰티 프로필)는 LLM 호출 필요 → derived.ts 범위 외.

---

## 범위

### 포함

| 파일 | 작업 | 비고 |
|------|------|------|
| `features/beauty/derived.ts` | skeleton → 구현 | 3개 함수 export |
| `features/beauty/derived.test.ts` | 신규 | 단위 테스트 (P2-27 부분) |

### 미포함

| 파일 | 이유 |
|------|------|
| `beauty/judgment.ts` | 수정 없음 |
| `beauty/shopping.ts` | 수정 없음 |
| `beauty/treatment.ts` | 수정 없음 |
| `shared/constants/beauty.ts` | 수정 없음 — 성분 매핑은 derived.ts 내부 상수 (L-14) |
| DV-4 (ai_beauty_profile) | LLM 호출 필요. 순수 함수 불가 (R-7) |

---

## 의존성

### 사용하는 기존 모듈 (수정 없음)

| 모듈 | 용도 | 수정 |
|------|------|------|
| `shared/types/domain.ts` | SkinType, SkinConcern 열거 타입 | 없음 |
| `shared/types/profile.ts` | LearnedPreference 타입 | 없음 |

### 의존 방향 검증

```
features/beauty/derived.ts
  → shared/types/domain.ts (type import: SkinType, SkinConcern)
  → shared/types/profile.ts (type import: LearnedPreference)
  X core/ import 없음
  X beauty/judgment.ts import 없음
  X beauty/shopping.ts import 없음
  X beauty/treatment.ts import 없음
  X DB/API 호출 없음 (L-7)
```

**§2.3 원문 대조:**
```
derived.ts → (없음)    독립 모듈. beauty/ 타 파일 import 금지.
```

순환 참조 불가.

---

## 설계 결정

### D-1. 함수 시그니처 (search-engine.md §3.2 원문)

```typescript
export function calculatePreferredIngredients(
  skinType: SkinType | null,
  concerns: SkinConcern[],
  learnedLikes: LearnedPreference[],
): string[]

export function calculateAvoidedIngredients(
  skinType: SkinType | null,
  learnedDislikes: LearnedPreference[],
): string[]

export function calculateSegment(
  ageRange: string | null,
  interests: string[],
  budgetLevel: string | null,
  travelStyle: string[],
): string | null
```

### D-2. 성분 매핑 상수 — derived.ts 내부 정의

PRD §4-A: "피부타입 + 고민 → 성분 매핑". DB `ingredients` 테이블에 `caution_skin_types`, `function` 필드 존재하나, derived.ts는 순수 함수(L-7)이므로 DB 조회 불가.

**MVP 전략:**
- 정적 매핑 상수를 derived.ts **내부에** 정의 (L-14: 내부 전용, export 안 함)
- v0.2에서 DB `ingredients` 기반으로 전환 시, search-handler가 DB 조회 후 파라미터로 전달하는 구조로 변경
- shared/constants/ 수정 불필요

```typescript
// derived.ts 내부 상수 (L-14: 미export)
const SKIN_TYPE_PREFERRED: Record<string, string[]> = {
  dry: ['hyaluronic_acid', 'ceramide', 'squalane', 'shea_butter'],
  oily: ['niacinamide', 'salicylic_acid', 'tea_tree', 'zinc'],
  combination: ['niacinamide', 'hyaluronic_acid', 'green_tea'],
  sensitive: ['centella_asiatica', 'aloe_vera', 'chamomile', 'oat'],
  normal: ['vitamin_c', 'hyaluronic_acid', 'peptide'],
};

const CONCERN_PREFERRED: Record<string, string[]> = {
  acne: ['salicylic_acid', 'tea_tree', 'benzoyl_peroxide', 'niacinamide'],
  wrinkles: ['retinol', 'peptide', 'vitamin_c', 'collagen'],
  dark_spots: ['vitamin_c', 'arbutin', 'tranexamic_acid', 'niacinamide'],
  // ... 전 SkinConcern 커버
};

const SKIN_TYPE_CAUTION: Record<string, string[]> = {
  dry: ['alcohol', 'witch_hazel', 'menthol'],
  oily: ['mineral_oil', 'coconut_oil', 'petrolatum'],
  sensitive: ['fragrance', 'alcohol', 'essential_oil', 'retinol'],
  // ...
};
```

### D-3. LearnedPreference 필터링

```typescript
// DV-1: category='ingredient' + direction='like' → preference 추출
const likedIngredients = learnedLikes
  .filter(p => p.category === 'ingredient' && p.direction === 'like')
  .map(p => p.preference);

// DV-2: category='ingredient' + direction='dislike' → preference 추출
const dislikedIngredients = learnedDislikes
  .filter(p => p.category === 'ingredient' && p.direction === 'dislike')
  .map(p => p.preference);
```

### D-4. VP-3 null-safe

| 입력 | 동작 |
|------|------|
| `skinType = null` | 피부타입 기반 매핑 스킵 → concerns + learned만 |
| `concerns = []` | 고민 기반 매핑 스킵 → skinType + learned만 |
| `learnedLikes = []` | 학습 데이터 없음 → skinType + concerns만 |
| 모두 null/빈 | 빈 배열 반환 (개인화 불가) |

### D-5. DV-3 세그먼트 규칙

PRD: "규칙 기반 분류. 마케팅·분석용 (추천에 직접 미사용)."

```
budget + interests 기반:
  luxury + clinic → "luxury_beauty_seeker"
  budget + shopping → "budget_beauty_explorer"
  interests에 clinic 포함 → "treatment_focused"
  interests에 shopping만 → "product_focused"
  기본 → "general_beauty_traveler"
```

VP-3: 모든 입력 null/빈 → null 반환.

### D-6. export 범위 (G-9)

| export | 소비자 |
|--------|--------|
| `calculatePreferredIngredients()` | search-handler (P2-20) |
| `calculateAvoidedIngredients()` | search-handler (P2-20) |
| `calculateSegment()` | profile/chat service |

3개 export. 매핑 상수 + 헬퍼는 내부 (L-14).

---

## 테스트

| 테스트 | 검증 |
|--------|------|
| preferred: skinType 매칭 | dry → hyaluronic_acid 등 포함 |
| preferred: concerns 매칭 | acne → salicylic_acid 등 포함 |
| preferred: learned likes 추가 | BH-4 like ingredient 포함 |
| preferred: 중복 제거 | skinType+concerns 겹침 시 unique |
| preferred: VP-3 모두 null/빈 → 빈 배열 | |
| avoided: skinType caution | sensitive → fragrance 등 포함 |
| avoided: learned dislikes 추가 | BH-4 dislike ingredient 포함 |
| avoided: VP-3 skinType null → learned만 | |
| segment: luxury + clinic → luxury_beauty_seeker | |
| segment: VP-3 모두 null/빈 → null | |

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: derived.ts → shared/types(type) ONLY
[ ] V-2  core/ 수정 없음
[ ] V-7  순수 함수: DB/API 없음
[ ] V-8  §2.3: derived.ts → beauty/ 타 파일 import 없음 (독립)
[ ] V-9  중복: DV 계산 프로젝트 전체에서 derived.ts에만
[ ] V-10 미사용 export 없음
[ ] V-17 제거 안전성: core/, shared/, beauty/ 타 파일 빌드 무영향
```

### 품질

```
[ ] Q-3  VP-3: null/빈 입력 → 안전 처리
[ ] G-2  중복 금지
[ ] G-8  any 없음
[ ] G-9  export 3개
[ ] G-10 매핑 상수: SKIN_TYPE_PREFERRED, CONCERN_PREFERRED, SKIN_TYPE_CAUTION 명명
[ ] L-14 매핑 상수 미export
```

### 테스트

```
[ ] derived.test.ts 10개
[ ] npx vitest run 전체 통과
```
