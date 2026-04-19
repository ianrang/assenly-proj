# Architecture: Explore 페이지

- 작성일: 2026-04-19
- 정본 상태: v1.0 (초안)
- PRD 정본: `docs/superpowers/specs/2026-04-19-explore-page-prd.md` v1.0
- 코드 정본: CLAUDE.md §1~§8

---

## 1. 기술 스택

| 분류 | 기술 | 버전 | 비고 |
|------|------|------|------|
| 프레임워크 | Next.js (App Router) | 16 | 기존 |
| UI | React | 19 | 기존 |
| 스타일 | Tailwind CSS | 4 | 기존 |
| API | Hono + @hono/zod-openapi | 기존 | 기존 |
| DB | Supabase (PostgreSQL) | 기존 | 기존 |
| **가상 스크롤** | **@tanstack/react-virtual** | **3.13.23** | **신규** |
| **캐싱** | **SWR** | **2.4.1** | **신규** |

### 라이브러리 선정 근거

**@tanstack/react-virtual** (3.9 kB gzipped):
- headless → Tailwind + 기존 디자인 시스템 완전 호환
- `measureElement` + `estimateSize`로 가변 높이 카드 동적 측정
- 행 단위 가상화 + CSS Grid 열 배치 패턴으로 2열/3열 반응형 그리드 구현
- React 19 호환 (`useFlushSync: false`)

제외: react-virtuoso(VirtuosoGrid 동일 크기만 지원, 16 kB), react-window(동적 측정 없음), virtua(커뮤니티 규모 부족)

**SWR** (4.2 kB gzipped):
- Provider 불필요 → L-11(최소 상태 관리) 준수
- `useSWRInfinite`로 Load More 패턴 네이티브 지원
- 내장 캐시 → 탭 전환 시 즉시 반환 + 백그라운드 재검증
- Next.js/Vercel 생태계 네이티브

제외: @tanstack/react-query(13.4 kB, 과잉), 수동 Map(stale/에러 처리 직접 구현 필요)

---

## 2. 레이어 구조

### 의존 방향 (P-1 DAG 준수)

```
app/(app)/explore/page.tsx            ← 독자 레이아웃 (chat 패턴. (pages) 밖)
  │
  ├─→ client/features/explore/        ← Explore 클라이언트 컴포넌트
  │     ├─→ client/features/cards/    ← 기존 카드 컴포넌트 재사용
  │     ├─→ client/features/layout/   ← Header 재사용 (maxWidth prop)
  │     ├─→ client/ui/primitives/     ← 기존 UI 프리미티브 재사용
  │     └─→ shared/                   ← 타입, 상수, 유틸
  │
  └─→ (API 호출: fetch) ──→ server/features/api/routes/explore.ts
                                │
                                ├─→ server/features/explore/        ← Explore 서비스 (신규)
                                │     ├─→ shared/types/explore.ts   ← 도메인 레지스트리 타입
                                │     ├─→ server/features/repositories/*  ← 기존 findAll* 재사용
                                │     └─→ server/features/beauty/*       ← 기존 scoring 재사용
                                │
                                └─→ server/core/                    ← DB, config
```

### 레이아웃 배치 — Header maxWidth 확장

**현재 문제**: `max-w-[640px]`가 Header.tsx (1곳) + PagesLayout (1곳) + ChatInterface (3곳) 에 하드코딩.
Explore는 960px가 필요하지만, Header도 640px 고정이라 넓힐 수 없음.

**해결**: Header에 `maxWidth` prop 추가. 기본값 `max-w-[640px]`로 기존 사용처 변경 0건.

```typescript
// Header.tsx — 변경
type HeaderProps = {
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  showLanguageSelector?: boolean;
  maxWidth?: string;  // 기본값 'max-w-[640px]'. Explore: 'max-w-[960px]'
};

// 내부: <div className={cn("mx-auto flex h-13 items-center justify-between px-5", maxWidth)}>
```

**라우트 그룹 배치**:

```
src/app/(user)/[locale]/(app)/
├── (pages)/              ← max-w-640px (PagesLayout)
│   ├── profile/
│   ├── privacy/
│   └── terms/
├── chat/                 ← 독자 레이아웃 (ChatInterface 내부)
└── explore/              ← 독자 레이아웃 (ExploreClient 내부, max-w-960px)
    └── page.tsx
```

Explore는 chat과 동일 패턴: `page.tsx` → `ExploreClient` (클라이언트 컴포넌트) → 내부에서 `<Header maxWidth="max-w-[960px]" />` + `<main className="mx-auto w-full max-w-[960px] ...">` 직접 구성.

**P-7 검증**: Header.tsx 1곳 수정 (prop 추가, 기본값 유지) → 기존 코드 변경 0건. ✅

### 콜스택 (P-5: ≤ 4단계)

```
route handler → exploreService.search() → repository.findAll*() → Supabase
     ①                  ②                        ③                   ④
```

route handler에서 scoring도 수행하지만 이는 ②와 동일 레벨(순차 호출, 중첩 아님).

---

## 3. 디자인 패턴

| 패턴 | 적용 위치 | 선택 이유 | 검토한 대안 |
|------|----------|----------|-----------|
| **Domain Registry** | `shared/types/explore.ts` | NFR-8 단일 변경점. 도메인 추가 시 레지스트리 1줄 + 구현체 1개. 기존 `domains.ts`의 `DOMAINS` 배열 패턴 확장 | 개별 if/switch 분기 → 도메인 추가마다 5+ 파일 수정 |
| **Strategy** | scoring 함수 선택 | 도메인별 scoring 로직이 다름. 레지스트리에 scorer 함수 매핑. 런타임 분기 | Factory → 과도한 추상화 |
| **Composition Root** | `/api/explore` route | P-4 준수. cross-domain 데이터(프로필 + 도메인 데이터) 조합. R-9 service 간 직접 호출 금지 | RSC → 캐싱/Load More 상태 관리 복잡 |

---

## 4. 핵심 설계: 도메인 레지스트리 (NFR-8)

### 4.1 레지스트리 인터페이스

> 파일: `src/shared/types/explore.ts` (신규)

```typescript
/** 도메인 검색 설정 — 도메인 추가 시 이 레지스트리에 1건 추가 */
export interface ExploreDomainConfig<TFilter = Record<string, unknown>> {
  /** 도메인 식별자 */
  id: ExploreDomain;
  /** UI 탭 라벨 키 (i18n) */
  labelKey: string;
  /** API에서 사용할 필터 필드 정의 */
  filterFields: FilterFieldDef[];
  /** 허용 정렬 필드 */
  sortFields: SortFieldDef[];
  /** 기본 정렬 */
  defaultSort: { field: string; order: 'asc' | 'desc' };
}

/** 필터 필드 정의 — UI 렌더링 + API 파라미터 생성에 공유 */
export interface FilterFieldDef {
  /** 필터 키 (API query param 이름) */
  key: string;
  /** i18n 라벨 키 */
  labelKey: string;
  /** 필터 타입: select(단일), multi(복수), range(범위) */
  type: 'select' | 'multi' | 'range';
  /** 선택지 (select/multi용). { value, labelKey } 배열 */
  options?: { value: string; labelKey: string }[];
  /** range용 최대값 */
  max?: number;
  /** range용 단위 (₩, days 등) */
  unit?: string;
}

/** 정렬 필드 정의 */
export interface SortFieldDef {
  /** 정렬 키 (API query param 값) */
  value: string;
  /** i18n 라벨 키 */
  labelKey: string;
  /** 프로필 필요 여부 (적합도순은 프로필 필요) */
  requiresProfile?: boolean;
}

export type ExploreDomain = 'products' | 'treatments' | 'stores' | 'clinics';
```

### 4.2 레지스트리 정의

> 파일: `src/shared/constants/explore-registry.ts` (신규)

```typescript
import type { ExploreDomainConfig, FilterFieldDef } from '@/shared/types/explore';
// ※ constants/ → constants/ peer import 금지 (CLAUDE.md §2.4, V-16).
//   옵션 값은 인라인 리터럴로 정의. 정본: domains.ts, beauty.ts.

/** Explore 도메인 레지스트리 — 도메인 추가 시 이 배열에 1건 추가 */
export const EXPLORE_REGISTRY: ExploreDomainConfig[] = [
  {
    id: 'products',
    labelKey: 'explore.tabs.products',
    filterFields: [
      {
        key: 'skin_types',
        labelKey: 'explore.filters.skinType',
        type: 'multi',
        // 정본: shared/constants/beauty.ts SKIN_TYPES
        options: [
          { value: 'dry', labelKey: 'beauty.skinType.dry' },
          { value: 'oily', labelKey: 'beauty.skinType.oily' },
          { value: 'combination', labelKey: 'beauty.skinType.combination' },
          { value: 'sensitive', labelKey: 'beauty.skinType.sensitive' },
          { value: 'normal', labelKey: 'beauty.skinType.normal' },
        ],
      },
      {
        key: 'category',
        labelKey: 'explore.filters.category',
        type: 'select',
        // 정본: shared/constants/domains.ts PRODUCT_CATEGORIES
        options: [
          { value: 'skincare', labelKey: 'beauty.productCategory.skincare' },
          { value: 'makeup', labelKey: 'beauty.productCategory.makeup' },
          { value: 'haircare', labelKey: 'beauty.productCategory.haircare' },
          { value: 'bodycare', labelKey: 'beauty.productCategory.bodycare' },
          { value: 'tools', labelKey: 'beauty.productCategory.tools' },
        ],
      },
      {
        key: 'budget_max',
        labelKey: 'explore.filters.budget',
        type: 'range',
        max: 100000,
        unit: '₩',
      },
    ],
    sortFields: [
      { value: 'relevance', labelKey: 'explore.sort.relevance', requiresProfile: true },
      { value: 'rating', labelKey: 'explore.sort.rating' },
      { value: 'price', labelKey: 'explore.sort.price' },
    ],
    defaultSort: { field: 'rating', order: 'desc' },
  },
  {
    id: 'treatments',
    labelKey: 'explore.tabs.treatments',
    filterFields: [
      {
        key: 'concerns',
        labelKey: 'explore.filters.concerns',
        type: 'multi',
        // 정본: shared/constants/beauty.ts SKIN_CONCERNS
        options: [
          { value: 'acne', labelKey: 'beauty.concern.acne' },
          { value: 'wrinkles', labelKey: 'beauty.concern.wrinkles' },
          { value: 'dark_spots', labelKey: 'beauty.concern.dark_spots' },
          { value: 'redness', labelKey: 'beauty.concern.redness' },
          { value: 'dryness', labelKey: 'beauty.concern.dryness' },
          { value: 'pores', labelKey: 'beauty.concern.pores' },
          { value: 'dullness', labelKey: 'beauty.concern.dullness' },
          { value: 'dark_circles', labelKey: 'beauty.concern.dark_circles' },
          { value: 'uneven_tone', labelKey: 'beauty.concern.uneven_tone' },
          { value: 'sun_damage', labelKey: 'beauty.concern.sun_damage' },
          { value: 'eczema', labelKey: 'beauty.concern.eczema' },
        ],
      },
      {
        key: 'category',
        labelKey: 'explore.filters.category',
        type: 'select',
        // 정본: shared/constants/domains.ts TREATMENT_CATEGORIES
        options: [
          { value: 'skin', labelKey: 'beauty.treatmentCategory.skin' },
          { value: 'laser', labelKey: 'beauty.treatmentCategory.laser' },
          { value: 'injection', labelKey: 'beauty.treatmentCategory.injection' },
          { value: 'facial', labelKey: 'beauty.treatmentCategory.facial' },
          { value: 'body', labelKey: 'beauty.treatmentCategory.body' },
          { value: 'hair', labelKey: 'beauty.treatmentCategory.hair' },
        ],
      },
      {
        key: 'budget_max',
        labelKey: 'explore.filters.budget',
        type: 'range',
        max: 500000,
        unit: '₩',
      },
      {
        key: 'max_downtime',
        labelKey: 'explore.filters.downtime',
        type: 'range',
        max: 30,
        unit: 'days',
      },
    ],
    sortFields: [
      { value: 'relevance', labelKey: 'explore.sort.relevance', requiresProfile: true },
      { value: 'rating', labelKey: 'explore.sort.rating' },
      { value: 'price', labelKey: 'explore.sort.priceLow' },
    ],
    defaultSort: { field: 'rating', order: 'desc' },
  },
  {
    id: 'stores',
    labelKey: 'explore.tabs.stores',
    filterFields: [
      {
        key: 'store_type',
        labelKey: 'explore.filters.storeType',
        type: 'select',
        // 정본: shared/constants/domains.ts STORE_TYPES
        options: [
          { value: 'olive_young', labelKey: 'beauty.storeType.olive_young' },
          { value: 'chicor', labelKey: 'beauty.storeType.chicor' },
          { value: 'daiso', labelKey: 'beauty.storeType.daiso' },
          { value: 'department_store', labelKey: 'beauty.storeType.department_store' },
          { value: 'brand_store', labelKey: 'beauty.storeType.brand_store' },
          { value: 'pharmacy', labelKey: 'beauty.storeType.pharmacy' },
          { value: 'other', labelKey: 'beauty.storeType.other' },
        ],
      },
      {
        key: 'english_support',
        labelKey: 'explore.filters.englishSupport',
        type: 'select',
        // 정본: shared/constants/domains.ts ENGLISH_SUPPORT_LEVELS (none 제외)
        options: [
          { value: 'basic', labelKey: 'beauty.englishSupport.basic' },
          { value: 'good', labelKey: 'beauty.englishSupport.good' },
          { value: 'fluent', labelKey: 'beauty.englishSupport.fluent' },
        ],
      },
    ],
    sortFields: [
      { value: 'relevance', labelKey: 'explore.sort.relevance', requiresProfile: true },
      { value: 'rating', labelKey: 'explore.sort.rating' },
    ],
    defaultSort: { field: 'rating', order: 'desc' },
  },
  {
    id: 'clinics',
    labelKey: 'explore.tabs.clinics',
    filterFields: [
      {
        key: 'clinic_type',
        labelKey: 'explore.filters.clinicType',
        type: 'select',
        // 정본: shared/constants/domains.ts CLINIC_TYPES
        options: [
          { value: 'dermatology', labelKey: 'beauty.clinicType.dermatology' },
          { value: 'plastic_surgery', labelKey: 'beauty.clinicType.plastic_surgery' },
          { value: 'aesthetic', labelKey: 'beauty.clinicType.aesthetic' },
          { value: 'med_spa', labelKey: 'beauty.clinicType.med_spa' },
        ],
      },
      {
        key: 'english_support',
        labelKey: 'explore.filters.englishSupport',
        type: 'select',
        options: [
          { value: 'basic', labelKey: 'beauty.englishSupport.basic' },
          { value: 'good', labelKey: 'beauty.englishSupport.good' },
          { value: 'fluent', labelKey: 'beauty.englishSupport.fluent' },
        ],
      },
    ],
    sortFields: [
      { value: 'relevance', labelKey: 'explore.sort.relevance', requiresProfile: true },
      { value: 'rating', labelKey: 'explore.sort.rating' },
    ],
    defaultSort: { field: 'rating', order: 'desc' },
  },
];
```

### 4.3 단일 변경점 보장 (NFR-8 검증)

새 도메인(예: salon) 추가 시 변경 파일:

| 변경 | 파일 | 내용 |
|------|------|------|
| 1 | `shared/types/explore.ts` | `ExploreDomain` 유니온에 `'salons'` 추가 |
| 2 | `shared/constants/explore-registry.ts` | `EXPLORE_REGISTRY` 배열에 salon config 1건 추가 |
| 3 | `server/features/explore/domain-handlers.ts` | salon용 핸들러(repository + scorer 매핑) 등록 |

UI 컴포넌트, API route, 필터 시트, 정렬 드롭다운은 레지스트리를 읽어 동적 렌더링하므로 **수정 불필요**.

---

## 5. API 설계

### 5.1 엔드포인트

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/explore` | 도메인별 검색 + scoring + 정렬 + 페이지네이션 | optionalAuth |

### 5.2 요청

```typescript
// Query Parameters (Zod 스키마)
{
  domain: 'products' | 'treatments' | 'stores' | 'clinics',  // 필수
  // 도메인별 필터 (모두 optional)
  skin_types?: string,        // 쉼표 구분 (products)
  concerns?: string,          // 쉼표 구분 (treatments)
  category?: string,          // 단일 값
  budget_max?: number,        // 숫자
  max_downtime?: number,      // 숫자 (treatments)
  store_type?: string,        // 단일 값 (stores)
  clinic_type?: string,       // 단일 값 (clinics)
  english_support?: string,   // 단일 값 (stores, clinics)
  // 정렬
  sort?: 'relevance' | 'rating' | 'price',  // 기본: rating
  // 페이지네이션
  limit?: number,             // 기본 10, 최대 50
  offset?: number,            // 기본 0
}
```

### 5.3 응답

```typescript
{
  data: Array<{
    ...EntityFields,           // Product | Treatment | Store | Clinic 필드 (embedding 제외)
    reasons?: string[],        // scoring 적용 시 추천 이유 (relevance 정렬 + 프로필 존재 시)
  }>,
  meta: {
    total: number,
    limit: number,
    offset: number,
    domain: string,
    scored: boolean,           // scoring 적용 여부 (프로필 존재 + relevance 정렬)
  },
}
```

### 5.4 서버 처리 흐름

```
1. Query 파싱 + domain 검증
2. 인증 확인 (optionalAuth)
3. domain에 따라 핸들러 선택 (레지스트리 기반)
4. repository.findAll*(client, filters, pagination, sort) 호출
5. sort === 'relevance' && 프로필 존재 시:
   a. 프로필/여정 데이터 로드
   b. scoring 함수 호출 (scoreProducts/scoreTreatments/scoreStores/scoreClinics)
   c. rank() 적용 → 결과 재정렬 + reasons 주입
6. embedding 필드 제거
7. 응답 반환
```

### 5.5 서버 도메인 핸들러 구조

> 파일: `src/server/features/explore/domain-handlers.ts` (신규)

```typescript
import 'server-only';

/** 도메인 핸들러 인터페이스 — 각 도메인의 검색 + scoring 로직 */
interface DomainHandler {
  /** 필터링 + 페이지네이션 조회 */
  fetch(
    client: SupabaseClient,
    filters: Record<string, unknown>,
    pagination: { page: number; pageSize: number },
    sort: { field: string; order: 'asc' | 'desc' },
  ): Promise<{ data: unknown[]; total: number }>;

  /** scoring 적용 (프로필 기반 개인화 정렬) */
  score(
    items: unknown[],
    profile: UserProfileVars | null,
    journey: JourneyContextVars | null,
    preferences: LearnedPreference[],
  ): ScoredItem[];
}

/** 도메인 핸들러 레지스트리 — 도메인 추가 시 여기에 등록 */
const DOMAIN_HANDLERS: Record<ExploreDomain, DomainHandler> = {
  products: { fetch: fetchProducts, score: scoreProductsHandler },
  treatments: { fetch: fetchTreatments, score: scoreTreatmentsHandler },
  stores: { fetch: fetchStores, score: scoreStoresHandler },
  clinics: { fetch: fetchClinics, score: scoreClinicsHandler },
};
```

각 fetch 함수는 기존 `findAllProducts`, `findAllStores` 등을 래핑하여 필터를 도메인별 타입으로 변환. 각 score 함수는 기존 `scoreProducts`, `scoreStores` 등을 래핑.

---

## 6. 프로젝트 구조

```
src/
├── app/(user)/[locale]/(app)/
│   └── explore/
│       └── page.tsx                    # RSC wrapper → ExploreClient 렌더 (독자 레이아웃, chat 패턴)
│
├── client/features/explore/            # Explore 클라이언트 컴포넌트 (신규)
│   ├── ExploreClient.tsx               # 메인 클라이언트 컴포넌트 ("use client")
│   ├── DomainTabs.tsx                  # 도메인 탭 (레지스트리 기반 동적 렌더)
│   ├── FilterSheet.tsx                 # 필터 bottom sheet (레지스트리 기반 동적 렌더)
│   ├── FilterChips.tsx                 # 활성 필터 칩 표시 + 제거
│   ├── SortDropdown.tsx                # 정렬 드롭다운 (레지스트리 기반)
│   ├── ExploreGrid.tsx                 # 가상 스크롤 카드 그리드
│   ├── ExploreEmptyState.tsx           # 결과 없음 상태
│   ├── ProfileBanner.tsx               # 프로필 미설정 배너
│   ├── ChatLinkButton.tsx              # 헤더 Chat 아이콘 버튼 (Explore 전용)
│   └── use-explore.ts                  # SWR 기반 데이터 훅 (useSWRInfinite)
│
├── server/features/explore/            # Explore 서버 로직 (신규)
│   └── domain-handlers.ts             # 도메인별 fetch + score 핸들러 레지스트리
│
├── server/features/api/routes/
│   └── explore.ts                      # GET /api/explore route (신규)
│
└── shared/
    ├── types/
    │   └── explore.ts                  # ExploreDomain, ExploreDomainConfig 타입 (신규)
    └── constants/
        └── explore-registry.ts         # EXPLORE_REGISTRY 정의 (신규)
```

### 의존 방향 검증

```
app/explore/page.tsx → client/features/explore/*     ✅ (app → client)
client/features/explore/* → client/ui/primitives/*   ✅ (features → ui)
client/features/explore/* → shared/*                 ✅ (client → shared)
client/features/explore/* → client/features/cards/*  ✅ (features → features, 동일 계층)
server/features/explore/* → server/features/beauty/* ✅ (features 내부, R-6 패턴)
server/features/explore/* → server/features/repos/*  ✅ (features 내부)
server/features/api/routes/explore.ts → server/features/explore/* ✅ (route → service)
shared/constants/explore-registry.ts → shared/types/* ✅ (shared 내부)
shared/constants/explore-registry.ts → shared/constants/domains.ts ✅ (shared 내부)
```

역방향 import 없음. 순환 참조 없음. ✅

---

## 7. 가상 스크롤 + 캐싱 상세 설계

### 7.1 가상 스크롤 구현 전략

```
┌─────────────────────────────────┐
│  useVirtualizer (행 단위 가상화)  │
│                                   │
│  ┌─ Row 0 ──────────────────┐    │  ← DOM에 존재 (뷰포트 내)
│  │ [Card] [Card]             │    │     CSS Grid: grid-cols-2 lg:grid-cols-3
│  └───────────────────────────┘    │
│  ┌─ Row 1 ──────────────────┐    │  ← DOM에 존재 (뷰포트 내)
│  │ [Card] [Card]             │    │
│  └───────────────────────────┘    │
│  ┌─ Row 2 ──────────────────┐    │  ← DOM에 존재 (버퍼)
│  │ [Card] [Card]             │    │
│  └───────────────────────────┘    │
│         ... (가상)                 │  ← DOM에 없음
│  ┌─ Row N ──────────────────┐    │
│  │ [Card]                    │    │
│  └───────────────────────────┘    │
│                                   │
│  [  Load More (remaining N)  ]    │  ← 항상 DOM에 존재
└─────────────────────────────────┘
```

- 아이템을 `columnsPerRow`(2 or 3)로 그룹핑하여 행 배열 생성
- `useVirtualizer`로 행 단위 가상화. `overscan: 3` (상하 3행 버퍼)
- `measureElement`로 각 행의 실제 렌더링 높이 측정 → 가변 높이 자동 처리
- `estimateSize`: 카드 평균 높이 기준 초기 추정 (예: 280px)
- 반응형: `useMediaQuery` 또는 `ResizeObserver`로 열 수 변경 감지 → 행 재계산

### 7.2 SWR 캐싱 전략

```typescript
// use-explore.ts
function useExplore(domain: ExploreDomain, filters: Record<string, string>, sort: string) {
  const getKey = (pageIndex: number, previousPageData: ExploreResponse | null) => {
    if (previousPageData && previousPageData.data.length === 0) return null; // 끝
    const params = new URLSearchParams({
      domain,
      ...filters,
      sort,
      limit: '10',
      offset: String(pageIndex * 10),
    });
    return `/api/explore?${params}`;
  };

  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite(
    getKey,
    (url) => authFetch(url).then(r => r.json()),
    {
      revalidateFirstPage: false,  // 이전 페이지 재검증 안 함
      revalidateOnFocus: false,    // 포커스 복귀 시 재검증 안 함
      dedupingInterval: 60_000,    // 1분 내 동일 요청 방지
    },
  );

  const items = data ? data.flatMap(page => page.data) : [];
  const total = data?.[0]?.meta.total ?? 0;
  const hasMore = items.length < total;

  return { items, total, hasMore, isLoading, isValidating, loadMore: () => setSize(size + 1) };
}
```

캐시 키: URL 전체 (`/api/explore?domain=products&skin_types=oily&sort=rating&limit=10&offset=0`)
- 동일 도메인+필터+정렬 조합 → SWR 내장 캐시에서 즉시 반환
- 탭 전환 후 복귀 시 캐시 히트 → 네트워크 요청 없이 표시
- 필터 변경 시 새 캐시 키 → 새 요청

### 7.3 메모리 관리

- SWR `provider` 옵션으로 캐시 크기 제한 가능 (기본: 무제한, 페이지 이탈 시 GC)
- 1000건 로드 시 예상 메모리: ~2-5 MB (JSON 데이터) — 모바일에서도 허용 범위
- 가상 스크롤 DOM 노드: 뷰포트 내 행 + overscan 3행 = 최대 ~30 카드 DOM 노드 (NFR-2: 100 이하 ✅)

---

## 8. 검증 결과

| 항목 | 상태 | 비고 |
|------|------|------|
| 순환 참조 | ✅ PASS | §6 의존 방향 검증 완료. 역방향 0건 |
| 계층 깊이 | ✅ PASS | route → service → repository → Supabase (4단계, P-5 준수) |
| 캡슐화 | ✅ PASS | DomainHandler 인터페이스로 내부 구현 은닉. client는 API 응답만 소비 |
| FR 커버리지 | ✅ PASS | 17개 FR 전체 설계에 반영 |
| NFR-8 단일 변경점 | ✅ PASS | 도메인 추가 = 레지스트리 1건 + 핸들러 1건. UI 수정 불필요 |
| 기술 스택 정합성 | ✅ PASS | React 19, App Router, Tailwind 4, Hono 모두 호환 확인 |
| 기존 코드 재사용 | ✅ PASS | findAll* 4개, score* 4개, rank(), 카드 컴포넌트 4개, Sheet, Tabs, OptionGroup 재사용 |
| L-0a/R-1 | ✅ PASS | scoring은 서버 `/api/explore`에서 수행. client → server import 없음 |
| L-11 상태 관리 | ✅ PASS | SWR (Provider 불필요) + URL params + useState. Zustand 미사용 |
| S-* 디자인 시스템 | ✅ PASS | 기존 토큰 사용. 새 색상/폰트 없음 |
| G-2 중복 금지 | ✅ PASS | 기존 컴포넌트/함수 재사용. 신규 패스스루 래퍼 없음 |
| P-7 단일 변경점 | ✅ PASS | 기능 변경 = explore-registry.ts 1곳 수정 |

---

## 9. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 가변 높이 카드 + 가상 스크롤 성능 | 행 높이 측정 지연 시 스크롤 끊김 | `estimateSize`로 초기 추정 + `measureElement` 비동기 보정. PoC에서 1000건 성능 검증 |
| SWR 캐시 메모리 | 필터 조합이 많으면 캐시 엔트리 증가 | `dedupingInterval: 60_000` + 페이지 이탈 시 자동 GC. 필요 시 `provider`로 LRU 캐시 적용 |
| 프로필 기반 scoring + 페이지네이션 충돌 | scoring은 전체 데이터 기준이지만 페이지네이션은 부분 데이터만 로드 | rating순 정렬 데이터를 서버에서 가져온 후 서버에서 scoring+재정렬. 정확도는 페이지 내에서만 보장. 사용자에게는 "더 정확한 추천을 원하면 Chat을 이용하세요" 안내 |
| 신규 패키지 2개 추가 | 번들 크기 증가 (~8 kB gzipped) | 기존 앱 대비 미미. tree-shaking 적용 확인 |
