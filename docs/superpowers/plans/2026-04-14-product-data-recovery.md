# 제품 데이터 정합성 복구 + 가격 수집 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 201건 제품 데이터의 brand 복원, 올리브영 이미지/링크/가격 재매칭, DB 적재까지 완료

**Architecture:** Phase 1에서 enriched.json 기반 brand 복원 스크립트 실행, Phase 2에서 개선된 스크래퍼(브랜드 검증 게이트 + 가격 수집)로 올리브영 재매칭, Phase 3에서 검증 및 DB 적재

**Tech Stack:** TypeScript, Playwright, Vitest, Supabase

**Spec:** `docs/superpowers/specs/2026-04-14-product-data-recovery-design.md`

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `scripts/seed/recover-products.ts` | **신규** — Phase 1: enriched.json 기반 brand 복원 |
| `scripts/seed/recover-products.test.ts` | **신규** — 복원 순수 함수 테스트 |
| `scripts/seed/enrich-product-links.ts` | **수정** — 브랜드 검증 게이트 + 가격 수집 + 한국 OY fallback |
| `scripts/seed/enrich-product-links.test.ts` | **수정** — 브랜드 검증 + 가격 파싱 테스트 추가 |
| `scripts/seed/data/products-recovered.json` | **생성** — Phase 1 출력 |
| `scripts/seed/data/products-validated.json` | **갱신** — Phase 2+3 최종 출력 |
| `docs/audit/product-recovery-report.md` | **생성** — 매칭 결과 리포트 |

---

### Task 1: Phase 1 — 복원 스크립트 순수 함수 + 테스트

**Files:**
- Create: `scripts/seed/recover-products.ts`
- Create: `scripts/seed/recover-products.test.ts`

- [ ] **Step 1: 복원 순수 함수 테스트 작성**

`scripts/seed/recover-products.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { recoverBrand, isCorruptedProduct, buildRecoveredRecord } from './recover-products';

describe('recover-products 순수 함수', () => {
  describe('isCorruptedProduct', () => {
    it('enriched와 validated의 brand가 다르면 오염 판정', () => {
      const enriched = { brand: 'Sulwhasoo', name_en: 'Sulwhasoo Cream' };
      const validated = { brand: 'Kamill', name_en: 'Sulwhasoo Cream' };
      expect(isCorruptedProduct(enriched, validated)).toBe(true);
    });

    it('brand가 같으면 정상 판정', () => {
      const enriched = { brand: 'Innisfree', name_en: 'Innisfree Cream' };
      const validated = { brand: 'Innisfree', name_en: 'Innisfree Cream' };
      expect(isCorruptedProduct(enriched, validated)).toBe(false);
    });
  });

  describe('recoverBrand', () => {
    it('enriched에서 brand와 brand_id를 복원한다', () => {
      const enriched = { brand: 'Sulwhasoo', brand_id: 'uuid-123' };
      const result = recoverBrand(enriched);
      expect(result).toEqual({ brand: 'Sulwhasoo', brand_id: 'uuid-123' });
    });
  });

  describe('buildRecoveredRecord', () => {
    it('오염 제품의 brand 복원 + images/links/price 초기화', () => {
      const validated = {
        entityType: 'product',
        data: {
          id: 'abc',
          brand: 'Kamill',
          brand_id: 'wrong-id',
          name: { en: 'Sulwhasoo Cream', ko: '설화수 크림' },
          images: ['https://wrong.com/img.jpg'],
          purchase_links: [{ platform: 'OY', url: 'https://wrong.com' }],
          price: 99999,
          price_min: null,
          price_max: null,
        },
        isApproved: true,
      };
      const enriched = { brand: 'Sulwhasoo', brand_id: 'correct-id' };

      const result = buildRecoveredRecord(validated, enriched);

      expect(result.data.brand).toBe('Sulwhasoo');
      expect(result.data.brand_id).toBe('correct-id');
      expect(result.data.images).toEqual([]);
      expect(result.data.purchase_links).toBeNull();
      expect(result.data.price).toBeNull();
    });

    it('정상 제품은 기존 데이터 보존', () => {
      const validated = {
        entityType: 'product',
        data: {
          id: 'abc',
          brand: 'Innisfree',
          brand_id: 'inn-id',
          name: { en: 'Innisfree Cream', ko: '이니스프리 크림' },
          images: ['https://cdn.oliveyoung.com/img.jpg'],
          purchase_links: [{ platform: 'OY', url: 'https://global.oliveyoung.com/detail' }],
          price: 25000,
          price_min: null,
          price_max: null,
        },
        isApproved: true,
      };
      const enriched = { brand: 'Innisfree', brand_id: 'inn-id' };

      const result = buildRecoveredRecord(validated, enriched);

      expect(result.data.brand).toBe('Innisfree');
      expect(result.data.images).toEqual(['https://cdn.oliveyoung.com/img.jpg']);
      expect(result.data.purchase_links).toHaveLength(1);
      expect(result.data.price).toBe(25000);
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run scripts/seed/recover-products.test.ts`
Expected: FAIL — 모듈 미존재

- [ ] **Step 3: 순수 함수 구현**

`scripts/seed/recover-products.ts`:
```typescript
// ============================================================
// Phase 1: 제품 데이터 정본 복원
// enriched.json 기반 brand 복원 + 오염 데이터 초기화
// P-9: scripts/ → shared/ import만. server/ import 금지.
//
// 실행: npx tsx scripts/seed/recover-products.ts
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

const DATA_DIR = path.join(__dirname, "data");
const ENRICHED_PATH = path.join(DATA_DIR, "products-enriched.json");
const VALIDATED_PATH = path.join(DATA_DIR, "products-validated.json");
const RECOVERED_PATH = path.join(DATA_DIR, "products-recovered.json");

// ── 타입 ─────────────────────────────────────────────────────

interface EnrichedData {
  brand: string;
  brand_id: string;
  name_en: string;
  [key: string]: unknown;
}

interface ValidatedData {
  id: string;
  brand: string;
  brand_id: string;
  name: { en: string; ko: string; [key: string]: string };
  name_en?: string;
  name_ko?: string;
  images: string[];
  purchase_links: Array<{ platform: string; url: string }> | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  [key: string]: unknown;
}

interface ValidatedRecord {
  entityType: string;
  data: ValidatedData;
  isApproved: boolean;
  [key: string]: unknown;
}

interface EnrichedRecord {
  data: EnrichedData;
  [key: string]: unknown;
}

// ── 순수 함수 (테스트 가능) ─────────────────────────────────

/** 오염 여부 판정: enriched brand ≠ validated brand */
export function isCorruptedProduct(
  enriched: Pick<EnrichedData, 'brand' | 'name_en'>,
  validated: Pick<ValidatedData, 'brand' | 'name_en'>,
): boolean {
  return enriched.brand !== validated.brand;
}

/** enriched에서 brand/brand_id 추출 */
export function recoverBrand(
  enriched: Pick<EnrichedData, 'brand' | 'brand_id'>,
): { brand: string; brand_id: string } {
  return { brand: enriched.brand, brand_id: enriched.brand_id };
}

/** 복원된 레코드 생성 */
export function buildRecoveredRecord(
  validated: ValidatedRecord,
  enriched: Pick<EnrichedData, 'brand' | 'brand_id'>,
): ValidatedRecord {
  const isCorrupted = validated.data.brand !== enriched.brand;

  if (!isCorrupted) {
    return validated; // 정상 — 그대로 보존
  }

  // 오염 — brand 복원 + 이미지/링크/가격 초기화
  return {
    ...validated,
    data: {
      ...validated.data,
      brand: enriched.brand,
      brand_id: enriched.brand_id,
      images: [],
      purchase_links: null,
      price: null,
      price_min: null,
      price_max: null,
    },
  };
}

// ── 메인 ─────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(ENRICHED_PATH) || !fs.existsSync(VALIDATED_PATH)) {
    console.error("필수 파일 없음:", ENRICHED_PATH, VALIDATED_PATH);
    process.exit(1);
  }

  const enrichedRecords: EnrichedRecord[] = JSON.parse(fs.readFileSync(ENRICHED_PATH, "utf-8"));
  const validatedRecords: ValidatedRecord[] = JSON.parse(fs.readFileSync(VALIDATED_PATH, "utf-8"));

  // enriched ID → data 맵
  const enrichedMap = new Map<string, EnrichedData>();
  for (const r of enrichedRecords) {
    enrichedMap.set(r.data.id as string, r.data);
  }

  let restored = 0;
  let preserved = 0;
  let essenlyKept = 0;

  const recovered: ValidatedRecord[] = [];

  for (const v of validatedRecords) {
    if (v.entityType !== "product") {
      recovered.push(v);
      continue;
    }

    const enriched = enrichedMap.get(v.data.id);

    if (!enriched) {
      // enriched에 없는 제품 (Essenly 등) → 그대로 보존
      recovered.push(v);
      essenlyKept++;
      console.log(`보존 (enriched 미존재): ${v.data.name?.en ?? v.data.name_en ?? v.data.id}`);
      continue;
    }

    const result = buildRecoveredRecord(v, enriched);
    if (result !== v) {
      restored++;
      console.log(`복원: [${enriched.brand}] ${enriched.name_en}`);
    } else {
      preserved++;
    }
    recovered.push(result);
  }

  fs.writeFileSync(RECOVERED_PATH, JSON.stringify(recovered, null, 2), "utf-8");

  console.log(`\n=== 복원 결과 ===`);
  console.log(`복원: ${restored}건`);
  console.log(`보존: ${preserved}건`);
  console.log(`Essenly 등 특수: ${essenlyKept}건`);
  console.log(`총: ${recovered.length}건 → ${RECOVERED_PATH}`);
}

const isDirectRun = process.argv[1]?.endsWith("recover-products.ts");
if (isDirectRun) {
  main();
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npx vitest run scripts/seed/recover-products.test.ts`
Expected: PASS (전 케이스)

- [ ] **Step 5: 복원 스크립트 실행**

Run: `npx tsx scripts/seed/recover-products.ts`
Expected: 복원 71건, 보존 129건, Essenly 1건, 총 201건 → `products-recovered.json`

- [ ] **Step 6: 복원 결과 검증**

```bash
node -e "
const fs = require('fs');
const recovered = JSON.parse(fs.readFileSync('scripts/seed/data/products-recovered.json','utf8'));
const products = recovered.filter(r => r.entityType === 'product');
let brandNameMatch = 0, noImages = 0, withImages = 0;
products.forEach(p => {
  const d = p.data;
  const name = d.name?.en ?? d.name_en ?? '';
  const brand = d.brand ?? '';
  if (name.toLowerCase().includes(brand.toLowerCase().replace(/[^a-z0-9]/g,''))) brandNameMatch++;
  if (d.images && d.images.length > 0) withImages++;
  else noImages++;
});
console.log('Total:', products.length);
console.log('Brand-name consistent:', brandNameMatch);
console.log('With images:', withImages, '/ Without:', noImages);
"
```
Expected: Total 201, With images ~129, Without ~72

- [ ] **Step 7: 커밋**

```bash
git add scripts/seed/recover-products.ts scripts/seed/recover-products.test.ts scripts/seed/data/products-recovered.json
git commit -m "feat(NEW-40): Phase 1 — enriched.json 기반 brand 복원 + 오염 데이터 초기화"
```

---

### Task 2: 스크래퍼 개선 — 브랜드 검증 게이트 + 가격 수집 순수 함수

**Files:**
- Modify: `scripts/seed/enrich-product-links.ts`
- Modify: `scripts/seed/enrich-product-links.test.ts`

- [ ] **Step 1: 브랜드 검증 + 가격 파싱 테스트 추가**

`scripts/seed/enrich-product-links.test.ts`에 추가:
```typescript
import { brandMatches, parseKrwPrice, buildShortQuery } from './enrich-product-links';

describe('brandMatches', () => {
  it('정확히 일치하면 true', () => {
    expect(brandMatches('Innisfree', 'Innisfree')).toBe(true);
  });

  it('대소문자 무관 일치', () => {
    expect(brandMatches('COSRX', 'cosrx')).toBe(true);
  });

  it('완전히 다른 브랜드면 false', () => {
    expect(brandMatches('Sulwhasoo', 'Kamill')).toBe(false);
  });

  it('부분 포함 (페이지 브랜드가 DB 브랜드를 포함)', () => {
    expect(brandMatches('Dr.Jart+', 'Dr. Jart+')).toBe(true);
  });

  it('특수문자 무시 비교', () => {
    expect(brandMatches("dear, Klairs", "dear Klairs")).toBe(true);
  });
});

describe('parseKrwPrice', () => {
  it('₩ 기호 + 쉼표 구분 숫자 파싱', () => {
    expect(parseKrwPrice('₩25,000')).toBe(25000);
  });

  it('원 텍스트 파싱', () => {
    expect(parseKrwPrice('25,000원')).toBe(25000);
  });

  it('KRW 접두사', () => {
    expect(parseKrwPrice('KRW 12,500')).toBe(12500);
  });

  it('숫자만 있으면 그대로 반환', () => {
    expect(parseKrwPrice('35000')).toBe(35000);
  });

  it('파싱 불가 시 null', () => {
    expect(parseKrwPrice('Free')).toBeNull();
    expect(parseKrwPrice('')).toBeNull();
  });
});

describe('buildShortQuery', () => {
  it('브랜드 + 핵심 키워드 3개로 축약', () => {
    const result = buildShortQuery('Innisfree Green Tea Seed Hyaluronic Cream SPF50+', 'Innisfree');
    expect(result).toContain('Innisfree');
    expect(result.split(' ').length).toBeLessThanOrEqual(4);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run scripts/seed/enrich-product-links.test.ts`
Expected: FAIL — `brandMatches`, `parseKrwPrice` 미존재

- [ ] **Step 3: 순수 함수 구현**

`enrich-product-links.ts`에 추가:
```typescript
/** 브랜드 매칭: 특수문자 제거 후 대소문자 무시 비교 */
export function brandMatches(dbBrand: string, pageBrand: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalize(dbBrand) === normalize(pageBrand);
}

/** KRW 가격 문자열 파싱 → 정수 또는 null */
export function parseKrwPrice(text: string): number | null {
  if (!text || !text.trim()) return null;
  const cleaned = text.replace(/[₩원KRW,\s]/gi, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) || num <= 0 ? null : num;
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `npx vitest run scripts/seed/enrich-product-links.test.ts`
Expected: PASS (기존 + 신규 전부)

- [ ] **Step 5: 커밋**

```bash
git add scripts/seed/enrich-product-links.ts scripts/seed/enrich-product-links.test.ts
git commit -m "feat(NEW-40): 브랜드 검증 + 가격 파싱 순수 함수 추가"
```

---

### Task 3: 스크래퍼 메인 로직 개선 — 브랜드 검증 게이트 + 가격 추출

**Files:**
- Modify: `scripts/seed/enrich-product-links.ts`

- [ ] **Step 1: EnrichResult 타입에 가격 필드 추가**

```typescript
interface EnrichResult {
  status: "success" | "not_found" | "error";
  imageUrl?: string;
  productUrl?: string;
  price?: number | null;        // KRW 정가 또는 할인가
  priceOriginal?: number | null; // 할인 시 원래 정가
  error?: string;
}
```

- [ ] **Step 2: extractBestMatch에 브랜드 검증 게이트 추가**

`extractBestMatch` 함수 시그니처에 `expectedBrand` 파라미터 추가:
```typescript
async function extractBestMatch(
  page: Page,
  nameEn: string,
  expectedBrand: string,
): Promise<{ productUrl: string; imageUrl: string | null; price: number | null; priceOriginal: number | null } | null>
```

핵심 변경:
1. 매칭 후 제품 상세 페이지로 이동
2. 페이지 내 브랜드명 추출 → `brandMatches(expectedBrand, pageBrand)` 검증
3. 브랜드 불일치 시 `null` 반환 (reject)
4. 가격 추출: 정가/할인가 셀렉터로 KRW 가격 파싱

상세 페이지에서 추출할 요소:
- 브랜드: `.prd-brand a` 또는 `meta[property="product:brand"]`
- 정가: `.price-info .org-price` 또는 `.price`
- 할인가: `.price-info .sale-price` (있을 경우)
- 이미지: `meta[property="og:image"]` (기존 로직 유지)

- [ ] **Step 3: searchAndEnrich에 한국 OY fallback 추가**

```typescript
async function searchAndEnrich(
  page: Page, nameEn: string, brand: string
): Promise<EnrichResult> {
  // 1차: Global 전체 이름
  // 2차: Global 축약 검색
  // 3차 (NEW): 한국 OY (oliveyoung.co.kr) 전체 이름
  // 4차 (NEW): 한국 OY 축약 검색
  // 최종 실패 → not_found
}
```

한국 OY 검색 URL: `https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query={query}`

- [ ] **Step 4: main 함수 수정 — recovered.json 입력 + 가격 저장**

변경 사항:
- 입력 파일: `products-recovered.json` (Phase 1 출력)
- 이미 이미지가 있는 제품도 **가격이 없으면** 스크래핑 수행
- 스킵 조건: `images.length > 0 AND price != null`
- 결과 저장 시 가격 필드 매핑:
  ```typescript
  if (result.price) {
    product.data.price = result.price;
    product.data.price_min = result.price;
    product.data.price_max = result.priceOriginal ?? result.price;
    product.data.price_currency = 'KRW';
    product.data.price_source = 'real';
    product.data.range_source = 'real';
    product.data.price_source_url = result.productUrl;
    product.data.price_updated_at = new Date().toISOString();
  }
  ```
- 출력: `products-validated.json` 갱신 (기존 백업 후)

- [ ] **Step 5: tsc 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: 커밋**

```bash
git add scripts/seed/enrich-product-links.ts
git commit -m "feat(NEW-40): 스크래퍼 개선 — 브랜드 검증 게이트 + 가격 추출 + 한국 OY fallback"
```

---

### Task 4: Phase 2 실행 — 올리브영 스크래핑

**Files:**
- 없음 (스크립트 실행)

- [ ] **Step 1: 테스트 모드 실행 (5건)**

```bash
npx tsx scripts/seed/enrich-product-links.ts --test --input scripts/seed/data/products-recovered.json
```
Expected: 5건 처리, 브랜드 검증 통과 건만 매칭, 가격 수집 확인

- [ ] **Step 2: 결과 확인 — 브랜드 검증 작동 여부**

출력 로그에서:
- `✓ 이미지 + 링크 + 가격 확보` — 정상 매칭
- `✗ 브랜드 불일치 (expected: X, got: Y)` — 검증 게이트 작동
- `✗ 검색 결과 없음` — 올리브영 미입점

- [ ] **Step 3: 전체 실행 (201건)**

```bash
npx tsx scripts/seed/enrich-product-links.ts --input scripts/seed/data/products-recovered.json
```
Expected: ~30분 소요 (201건 × 5초 딜레이 + 상세 페이지). 실패 목록 `products-enrich-failures.json`에 저장.

- [ ] **Step 4: 결과 검증 스크립트 실행**

```bash
node -e "
const fs = require('fs');
const validated = JSON.parse(fs.readFileSync('scripts/seed/data/products-validated.json','utf8'));
const products = validated.filter(r => r.entityType === 'product');
let withImg = 0, withPrice = 0, withLinks = 0;
products.forEach(p => {
  const d = p.data;
  if (d.images?.length > 0) withImg++;
  if (d.price != null) withPrice++;
  if (d.purchase_links?.length > 0) withLinks++;
});
console.log('Total:', products.length);
console.log('Images:', withImg, '/', products.length);
console.log('Prices:', withPrice, '/', products.length);
console.log('Links:', withLinks, '/', products.length);
const failures = JSON.parse(fs.readFileSync('scripts/seed/data/products-enrich-failures.json','utf8'));
console.log('Failures:', failures.length);
"
```

- [ ] **Step 5: 실패 목록 리포트 작성**

`docs/audit/product-recovery-report.md` 생성:
- 매칭 성공/실패 건수
- 실패 제품 목록 (brand, name, 실패 사유)
- 가격 커버리지 (%)
- 소스별 (Global/한국) 건수

- [ ] **Step 6: 커밋**

```bash
git add scripts/seed/data/products-validated.json scripts/seed/data/products-enrich-failures.json docs/audit/product-recovery-report.md
git commit -m "data(NEW-40): Phase 2 — 올리브영 스크래핑 완료 + 매칭 리포트"
```

---

### Task 5: Phase 3 — 검증 + DB 적재

**Files:**
- 없음 (기존 스크립트 사용)

- [ ] **Step 1: zod 스키마 검증**

```bash
npx tsx scripts/seed/validate.ts --input scripts/seed/data/products-validated.json --entity-types product
```
Expected: 201 passed, 0 failed

- [ ] **Step 2: DB dry-run 적재**

```bash
npx tsx scripts/seed/load.ts --input scripts/seed/data/products-validated.json --entity-types product --dry-run
```
Expected: 201 records, 0 failed

- [ ] **Step 3: DB 실제 적재**

```bash
npx tsx scripts/seed/load.ts --input scripts/seed/data/products-validated.json --entity-types product
```
Expected: 201 inserted/updated, 0 failed

- [ ] **Step 4: DB 검증 — Supabase에서 확인**

Supabase SQL Editor:
```sql
SELECT
  COUNT(*) as total,
  COUNT(price) as with_price,
  COUNT(CASE WHEN images != '{}' THEN 1 END) as with_images,
  COUNT(CASE WHEN price_source = 'real' THEN 1 END) as real_price
FROM products;
```

- [ ] **Step 5: TODO 업데이트 + 최종 커밋**

```bash
# TODO.md에서 NEW-40 ✅ 처리
git add TODO.md
git commit -m "chore(NEW-40): 완료 — 제품 데이터 정합성 복구 + 가격 수집"
```

---

## 주의사항

1. **Phase 2 스크래핑은 외부 의존**: 올리브영 서버 상태에 따라 실패율 변동. 50% 이상 실패 시 Cloudflare 차단 의심 → 시간 간격 늘리거나 수동 처리 전환
2. **Essenly 제품**: `brand` 필드 없음 (`name.en`에서 추출 가능). 스크래핑 대상에서 제외 (이미 완전한 데이터)
3. **한국 OY 셀렉터**: Global과 DOM 구조가 다를 수 있음. Task 3에서 실제 페이지 확인 후 셀렉터 조정 필요
4. **가격 단위**: Global은 USD 표시 가능. `parseKrwPrice`가 USD도 처리하려면 환율 변환 추가 필요 — Task 3에서 판단
