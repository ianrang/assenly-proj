# P2-16a: Store 리포지토리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store 엔티티의 DB 접근 계층 구현. 3개 메서드 (matchByVector 없음).

**Architecture:** product-repository.ts/treatment-repository.ts와 동일 패턴. query-utils.ts 재사용, client 파라미터 주입 (core/ import 없음). matchByVector 없음 (match_stores RPC 미설계, search-engine.md §2.1에 미명시). findById에 JOIN 관계 없음 (search-engine.md §2.1 line 144: store JOIN 미정의).

**Tech Stack:** TypeScript, Supabase PostgREST, Vitest

---

## 선행 확인 (모두 완료)

- [x] query-utils.ts 8개 유틸 구현 (P2-16)
- [x] product-repository.ts 4개 메서드 구현 (P2-16)
- [x] treatment-repository.ts 4개 메서드 구현 (P2-17)
- [x] shared/types/domain.ts Store 인터페이스 정의

## 설계 근거

| 결정 | 근거 | 원문 위치 |
|------|------|----------|
| 3개 메서드 (findByFilters, findById, findAll) | matchByVector 없음: match_stores RPC 미설계 | search-engine.md §2.1 line 131 (match_products, match_treatments만 명시) |
| 필터: district, english_support, store_type, search | Stores 필터 매핑 | search-engine.md §2.3 line 252-257 |
| 정렬 허용: created_at, updated_at, rating, district | §2.3 = §6.2 일치 (4개) | search-engine.md §2.3 line 259, §6.2 line 544 |
| findById JOIN 없음 | store JOIN 관계 미정의 | search-engine.md §2.1 line 144 (product→brand, treatment→clinics만) |
| client 파라미터 주입 (core/db import 없음) | 기존 repository 패턴 | R-8, product-repository.ts |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `src/server/features/repositories/store-repository.ts` | 신규 | 3개 메서드 — DB CRUD만 (L-8) |
| `src/server/features/repositories/store-repository.test.ts` | 신규 | 단위 테스트 8개 |

## 미포함

| 항목 | 이유 | 태스크 |
|------|------|--------|
| matchStoresByVector | match_stores RPC 미설계 (search-engine.md §2.1) | 미예정 |
| clinic-repository.ts | 별도 도메인 | P2-17a |
| query-utils.ts | 이미 완성, 수정 없음 | P2-16 (완료) |

## 의존성 방향 검증

```
store-repository.ts
  → query-utils.ts (같은 폴더)         ✓ search-engine.md §1.3 허용
  ✗ core/ import 없음 (client 파라미터 주입)
  ✗ beauty/ import 없음
  ✗ shared/ import 없음 (Store 타입은 Supabase 추론)
  ✗ features/ 타 도메인 import 없음
  순환 참조 없음
```

---

## Task 1: store-repository.ts 전체 구현 + 테스트

**Files:**
- Create: `src/server/features/repositories/store-repository.ts`
- Create: `src/server/features/repositories/store-repository.test.ts`

**설계:**
- product/treatment-repository 패턴 동일
- 필터 4개 (search-engine.md §2.3 Stores):
  - `district` → 컬럼 `district` → `applyExact`
  - `english_support` → 컬럼 `english_support` → `applyExact`
  - `store_type` → 컬럼 `store_type` → `applyExact`
  - `search` → 컬럼 `name` → `applyTextSearch`
- 정렬 4개: created_at, updated_at, rating, district
- findById: 단순 select, JOIN 없음, status 필터 없음 (관리자도 사용)

- [ ] **Step 1: 테스트 파일 작성**

`store-repository.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

function createMockClient(resolvedValue: { data: unknown; error: unknown; count?: number }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
  };
  const thenableChain = new Proxy(chain, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolvedValue);
      }
      return target[prop as keyof typeof target];
    },
  });

  return {
    from: vi.fn(() => thenableChain),
  };
}

describe('store-repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findStoresByFilters', () => {
    it('필터 적용 + limit', async () => {
      const stores = [{ id: 's1', name: { en: 'Olive Young' } }];
      const client = createMockClient({ data: stores, error: null });

      const { findStoresByFilters } = await import(
        '@/server/features/repositories/store-repository'
      );
      const result = await findStoresByFilters(
        client as never,
        { district: 'gangnam', store_type: 'drugstore' },
        5,
      );

      expect(result).toEqual(stores);
      expect(client.from).toHaveBeenCalledWith('stores');
    });

    it('빈 필터 → status=active만', async () => {
      const client = createMockClient({ data: [], error: null });

      const { findStoresByFilters } = await import(
        '@/server/features/repositories/store-repository'
      );
      await findStoresByFilters(client as never, {});

      expect(client.from).toHaveBeenCalledWith('stores');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
      });

      const { findStoresByFilters } = await import(
        '@/server/features/repositories/store-repository'
      );

      await expect(
        findStoresByFilters(client as never, {}),
      ).rejects.toThrow('Store search failed');
    });
  });

  describe('findStoreById', () => {
    it('정상 → Store', async () => {
      const store = { id: 's1', name: { en: 'Olive Young' } };
      const client = createMockClient({ data: store, error: null });

      const { findStoreById } = await import(
        '@/server/features/repositories/store-repository'
      );
      const result = await findStoreById(client as never, 's1');

      expect(result).toEqual(store);
    });

    it('미존재 → null', async () => {
      const client = createMockClient({ data: null, error: null });

      const { findStoreById } = await import(
        '@/server/features/repositories/store-repository'
      );
      const result = await findStoreById(client as never, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllStores', () => {
    it('pagination + sort + count', async () => {
      const stores = [{ id: 's1' }];
      const client = createMockClient({
        data: stores,
        error: null,
        count: 25,
      });

      const { findAllStores } = await import(
        '@/server/features/repositories/store-repository'
      );
      const result = await findAllStores(
        client as never,
        {},
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(result.data).toEqual(stores);
      expect(result.total).toBe(25);
    });

    it('status=all → 필터 생략', async () => {
      const client = createMockClient({ data: [], error: null, count: 0 });

      const { findAllStores } = await import(
        '@/server/features/repositories/store-repository'
      );
      await findAllStores(
        client as never,
        { status: 'all' },
        { page: 1, pageSize: 20 },
        { field: 'created_at', order: 'desc' },
      );

      expect(client.from).toHaveBeenCalledWith('stores');
    });

    it('DB 에러 → throw', async () => {
      const client = createMockClient({
        data: null,
        error: { message: 'DB error' },
        count: null,
      });

      const { findAllStores } = await import(
        '@/server/features/repositories/store-repository'
      );

      await expect(
        findAllStores(
          client as never,
          {},
          { page: 1, pageSize: 20 },
          { field: 'created_at', order: 'desc' },
        ),
      ).rejects.toThrow('Store list retrieval failed');
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/server/features/repositories/store-repository.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: store-repository.ts 구현**

```typescript
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyExact,
  applyTextSearch,
  applyLimit,
  applyPagination,
  applySort,
} from './query-utils';

// ============================================================
// Store 리포지토리 — search-engine.md §2.1, §2.3 Stores
// R-8: core/db(client 파라미터) + query-utils ONLY.
// L-8: DB CRUD만. 비즈니스 로직 없음.
// G-9: export 3개 (findByFilters, findById, findAll).
// matchByVector 없음: match_stores RPC 미설계 (§2.1).
// ============================================================

/** AI tool 검색 필터 — search-engine.md §2.3 Stores */
interface StoreFilters {
  district?: string;
  english_support?: string;
  store_type?: string;
  search?: string;
}

/** 관리자 목록 필터 */
interface AdminStoreFilters extends StoreFilters {
  status?: string; // 'all' | 'active' | 'inactive'. 기본 'active'
}

/** 관리자 허용 정렬 필드 — search-engine.md §2.3 */
const ALLOWED_SORT_FIELDS = [
  'created_at',
  'updated_at',
  'rating',
  'district',
];

/**
 * AI tool용 필터 검색.
 * search-engine.md §2.1 findByFilters: 페이지네이션 없음, 정렬 없음 (beauty.rank() 담당).
 */
export async function findStoresByFilters(
  client: SupabaseClient,
  filters: StoreFilters,
  limit: number = 5,
) {
  let query = client.from('stores').select('*').eq('status', 'active');

  query = applyExact(query, 'district', filters.district);
  query = applyExact(query, 'english_support', filters.english_support);
  query = applyExact(query, 'store_type', filters.store_type);
  query = applyTextSearch(query, 'name', filters.search);
  query = applyLimit(query, limit);

  const { data, error } = await query;

  if (error) {
    throw new Error('Store search failed');
  }

  return data ?? [];
}

/**
 * 카드 상세 — 단일 Store.
 * search-engine.md §2.1 findById. JOIN 관계 없음 (§2.1: store JOIN 미정의).
 */
export async function findStoreById(
  client: SupabaseClient,
  id: string,
) {
  const { data, error } = await client
    .from('stores')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Store retrieval failed');
  }

  return data;
}

/**
 * 관리자 목록 — 페이지네이션 + 정렬 + 총 건수.
 * search-engine.md §2.1 findAll.
 */
export async function findAllStores(
  client: SupabaseClient,
  filters: AdminStoreFilters,
  pagination: { page: number; pageSize: number },
  sort: { field: string; order: 'asc' | 'desc' },
) {
  let query = client
    .from('stores')
    .select('*', { count: 'exact', head: false });

  // status 필터: 'all'이면 생략, 기본 'active'
  const status = filters.status ?? 'active';
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  query = applyExact(query, 'district', filters.district);
  query = applyExact(query, 'english_support', filters.english_support);
  query = applyExact(query, 'store_type', filters.store_type);
  query = applyTextSearch(query, 'name', filters.search);
  query = applySort(query, sort.field, sort.order, ALLOWED_SORT_FIELDS);
  query = applyPagination(query, pagination.page, pagination.pageSize);

  const { data, error, count } = await query;

  if (error) {
    throw new Error('Store list retrieval failed');
  }

  return { data: data ?? [], total: count ?? 0 };
}
```

- [ ] **Step 4: 테스트 실행 → 전체 통과 확인**

Run: `npx vitest run src/server/features/repositories/store-repository.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 테스트 + store-repository 8개 모두 PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/features/repositories/store-repository.ts src/server/features/repositories/store-repository.test.ts
git commit -m "feat(P2-16a): store-repository — 3개 메서드 구현 + 테스트 8개

findStoresByFilters (4필터: district, english_support, store_type, search),
findStoreById (단순 select, JOIN 없음), findAllStores (4정렬필드).
matchByVector 없음 (match_stores RPC 미설계).
search-engine.md §2.1/§2.3 Stores 준수. query-utils 재사용.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: store-repository → query-utils(같은 폴더) ONLY
[ ] V-2  core/ 수정 없음
[ ] V-8  beauty/ import 없음. features/ 타 모듈 import 없음
[ ] V-9  중복: findStoresByFilters 등 프로젝트 전체 미존재
[ ] V-10 미사용 export 없음 — 3개 export, 소비자 명확 (P2-20, P2-26b, P2-46a)
[ ] V-17 제거 안전성: store-repository.ts 삭제 시 core/, shared/, beauty/ 빌드 무영향
```

### 품질

```
[ ] L-8  repositories DB CRUD만: 비즈니스 로직 없음
[ ] R-8  core/db + shared/ ONLY (client 파라미터 주입 → core import 불필요)
[ ] Q-3  VP-3: null 필터 → WHERE 생략 (query-utils가 보장)
[ ] G-8  any 없음
[ ] G-9  store-repository 3개 export. Filters 인터페이스는 내부 (L-14)
[ ] G-10 허용 정렬 필드: ALLOWED_SORT_FIELDS 상수
[ ] Q-14 필터 매핑이 search-engine.md §2.3 + DB 스키마(001+004)와 일치
```

---

## export 범위 (G-9)

| export | 소비자 | 태스크 |
|--------|--------|--------|
| `findStoresByFilters()` | search-handler (P2-20) | ⬜ |
| `findStoreById()` | GET /api/stores/:id (P2-26b) | ⬜ |
| `findAllStores()` | GET /api/admin/stores (P2-46a) | ⬜ |

3개 export. StoreFilters/AdminStoreFilters/ALLOWED_SORT_FIELDS는 내부 (L-14).

## product/treatment와의 차이 (정당한 이유)

| 차이 | 이유 |
|------|------|
| matchByVector 없음 (3 vs 4 export) | match_stores RPC 미설계. search-engine.md §2.1 line 131 |
| findById JOIN 없음 | store JOIN 관계 미정의. search-engine.md §2.1 line 144 |
| applyArrayOverlap/applyMax 미사용 | stores 필터에 배열/범위 필터 없음. §2.3 |
| import에서 사용하지 않는 유틸 미포함 | G-4 미사용 코드 금지 |
| rpc 없음 → mock에 rpc 프로퍼티 없음 | 테스트에서 미사용 mock 생성 금지 |
