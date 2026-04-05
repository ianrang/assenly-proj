# P2-64c: Junction 데이터 (product_stores + product_ingredients + clinic_treatments)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3개 junction 테이블에 관계 데이터를 적재하여 제품-매장, 제품-성분, 클리닉-시술 매핑을 완성한다.

**Architecture:** 기존 loadJunctions() 파이프라인 사용. product_stores는 _available_at 기반 규칙 자동 생성, product_ingredients는 LLM 자동 매핑 + D-7 검수, clinic_treatments는 규칙 기반 + LLM 미세 조정. 스크립트는 scripts/ 배치 (P-9).

**Tech Stack:** TypeScript, 기존 loader.ts loadJunctions(), LLM (enrich 패턴)

---

> 버전: 1.0
> 작성일: 2026-04-05
> 선행: P2-64a (products 201건), P2-60 (ingredients 105건), P2-61 (stores 337건), P2-62 (clinics 225건), P2-63 (treatments 53건)
> 정본: schema.dbml junction tables, data-collection.md §7 D-4

## 1. 현재 데이터 현황

| 엔티티 | DB 건수 | 비고 |
|--------|:------:|------|
| products | 201 | _available_at 필드 200건 보유 |
| stores | 337 | olive_young 45, chicor 12, daiso 84, department_store 46, brand_store 60, other 86, pharmacy 4 |
| ingredients | 105 | name.en, function, caution_skin_types 보유 |
| clinics | 225 | dermatology 180, plastic_surgery 45 |
| treatments | 53 | laser 15, injection 12, skin 10, facial 9, body 4, hair 3 |

## 2. 3개 Junction 설계

### 2.1 product_stores (규칙 기반 자동 생성)

**매핑 규칙 (data-collection.md D-4):**

| _available_at 값 | 매핑 대상 store_type | 방식 |
|------------------|---------------------|------|
| "olive_young" (171건) | olive_young (45 stores) | 유형 기반 일괄 |
| "chicor" (62건) | chicor (12 stores) | 유형 기반 일괄 |
| "daiso" (1건) | daiso (84 stores) | 유형 기반 일괄 |
| "department_store" (27건) | department_store (46 stores) | 유형 기반 일괄 |
| "brand_store"/"innisfree_store"/"laneige_store"/"etude_store" | brand_store 중 해당 브랜드 | 브랜드 매칭 |

**예상 건수:** ~12,000건 (171×45 + 62×12 + 27×46 + ...)
**LLM 불필요.** 순수 규칙 기반.

### 2.2 product_ingredients (LLM 자동 매핑)

**방식:** 제품명 + 카테고리 → LLM이 ingredients DB 105종 중 key/avoid 매핑

**프롬프트 설계:**
```
Given this K-beauty product:
- Name: {product.name.en}
- Category: {product.category}
- Skin types: {product.skin_types}

From this ingredient list, identify:
1. KEY ingredients (2-5): main active ingredients likely in this product
2. AVOID ingredients (0-2): ingredients that users with the product's target skin types should be cautious about

Available ingredients: [105종 name.en 목록]

Return JSON: { "key": ["ingredient_name", ...], "avoid": ["ingredient_name", ...] }
```

**예상 건수:** ~600-800건 (201제품 × 평균 3-4 성분)
**D-7 검수 필요:** export-review → 검수 → import-review 패턴

### 2.3 clinic_treatments (규칙 기반 + LLM 미세 조정)

**규칙 기반 매핑:**

| clinic_type | 기본 제공 treatment categories |
|-------------|------------------------------|
| dermatology | laser, skin, facial, injection (피부과 전문) |
| plastic_surgery | injection, body, facial (성형 전문) |

**LLM 미세 조정:** 클리닉 이름/설명에서 특화 시술 추가 식별

**예상 건수:** dermatology 180 × ~46시술 + plastic_surgery 45 × ~25시술 = ~9,000+ 건 (유형 기반 상한)
→ 실제로는 클리닉당 평균 5-10개 시술이 현실적 → **~1,500-2,000건**

## 3. 실행 순서

P2-64c를 3개 서브태스크로 분리:

| 서브태스크 | 방식 | LLM | 검수 |
|-----------|------|:---:|:----:|
| **P2-64c-1: product_stores** | 규칙 기반 자동 생성 스크립트 | ❌ | 건수 확인만 |
| **P2-64c-2: product_ingredients** | LLM 매핑 + D-7 검수 | ✅ | 전수 검수 |
| **P2-64c-3: clinic_treatments** | 규칙 기반 + LLM | ✅ | 의료 정확성 검수 |

### P2-64c-1: product_stores 스크립트

**파일:** `scripts/seed/generate-product-stores.ts` (CREATE)

```
1. products-validated.json 로드 → _available_at 추출
2. DB에서 stores 전체 조회 (store_type별 그룹)
3. 매핑 규칙 적용:
   - "olive_young" → olive_young store_type 전체
   - "chicor" → chicor store_type 전체
   - "daiso" → daiso store_type 전체
   - "department_store" → department_store store_type 전체
   - "brand_store"/"innisfree_store" 등 → 해당 브랜드 brand_store 매칭
4. Junction JSON 생성
5. loadJunctions() 적재
```

**의존성:** scripts/ → shared/ (P-9), DB 조회 (store 목록)
**코드 수정:** scripts/ 에만 신규 파일. src/ 수정 0건.

## 4. 아키텍처 검증

| 규칙 | 검증 |
|------|------|
| P-2 Core 불변 | ✅ core/ 수정 없음 |
| P-9 scripts/ 자격 | ✅ scripts/ → shared/, DB 접근 허용 |
| P-10 제거 안전성 | ✅ 스크립트 삭제해도 src/ 무영향 |
| P-7 단일 변경점 | ✅ 매핑 규칙 변경 = 스크립트 1파일 |
| Q-12 멱등성 | ✅ UPSERT ON CONFLICT 복합키 |
| Q-13 FK 순서 | ✅ parent 엔티티 모두 적재 완료 |
| G-5 기존 패턴 | ✅ loadJunctions() 기존 API 사용 |
