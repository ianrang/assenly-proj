# P2-64a2: Essenly 자사 브랜드 + 제품 등록

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Essenly 자사 브랜드(is_essenly: true) + 케라틴 헤어팩 제품(is_highlighted: true) DB 등록. Kit CTA 자동 연결.

**Architecture:** 기존 데이터 파이프라인(validated JSON → loader.ts UPSERT) 그대로 사용. 코드 수정 0건. 데이터 추가만.

**Tech Stack:** JSON 데이터 + 기존 loader 파이프라인

---

> 버전: 1.0
> 작성일: 2026-04-05
> 선행: P2-64a (products 200건 완료), P2-60 (brands 73건 완료)
> 근거: PRD §2.3 수익 모델 ("에센리 키트 판매"), schema.dbml brands.is_essenly

## 1. 작업 범위

| 항목 | 내용 | 코드 수정 |
|------|------|:--------:|
| brands-validated.json에 Essenly 브랜드 추가 | is_essenly: true, 6언어 번역 | 없음 |
| products-validated.json에 헤어팩 추가 | is_highlighted: true, highlight_badge, purchase_links | 없음 |
| DB 적재 (loader.ts) | 기존 파이프라인 UPSERT | 없음 |
| Kit CTA 연결 | card-mapper.ts L147: is_highlighted → 자동 삽입 | 없음 |

**코드 수정 0건. 데이터 파일 2개 수정만.**

## 2. 아키텍처 검증

- P-7: 데이터 추가 = JSON 파일 수정만
- Q-12: deterministic UUID → 재적재 멱등성
- Q-13: FK 순서 → loader.ts Phase A(brand) → Phase B(product) 자동 보장
- Q-14: highlight_badge.en 필수 → shared/validation/highlight.ts refine 검증

## 3. Kit CTA 연결 자동 동작 확인

```
search_beauty_data 결과에 is_highlighted=true 상품 포함
  → card-mapper.ts:147 mapProductCard()
  → is_highlighted && highlight_badge !== null 조건 충족
  → { type: "kit-cta-card", productName, highlightBadge } 파트 삽입
  → MessageList:96 KitCtaCard 렌더링
  → KitCtaSheet (이메일 수집)
```

코드 수정 불필요. 기존 파이프라인이 자동 처리.

---

### Task 1: UUID 생성

- [ ] **Step 1: Essenly 브랜드 UUID 생성**

```bash
node -e "const { v5 } = require('uuid'); console.log(v5('manual:essenly', '3ba541df-e0f7-442f-b9a5-f4e8e6c6c95f'))"
```

- [ ] **Step 2: 헤어팩 제품 UUID 생성**

```bash
node -e "const { v5 } = require('uuid'); console.log(v5('manual:essenly-keratin-hair-mask', 'a2f8c5d1-9e4b-4a7c-b3f6-e1d9a2c8b5f7'))"
```

---

### Task 2: brands-validated.json에 Essenly 브랜드 추가

- [ ] **Step 1: 브랜드 엔트리 추가**

brands-validated.json 끝에 추가:

```json
{
  "entityType": "brand",
  "data": {
    "id": "[Task 1 Step 1에서 생성한 UUID]",
    "name": {
      "ko": "에센리",
      "en": "Essenly",
      "ja": "エッセンリー",
      "zh": "艾森利",
      "es": "Essenly",
      "fr": "Essenly"
    },
    "origin": "KR",
    "tier": "moderate",
    "is_essenly": true,
    "specialties": ["haircare", "keratin treatment"],
    "status": "active"
  },
  "isApproved": true,
  "reviewedBy": "manual-entry"
}
```

- [ ] **Step 2: 검증 실행**

```bash
npx tsx scripts/seed/validate.ts --input scripts/seed/data/brands-validated.json --entity-types brand
```

Expected: 전체 PASS

---

### Task 3: products-validated.json에 헤어팩 추가

- [ ] **Step 1: 제품 엔트리 추가**

products-validated.json 끝에 추가:

```json
{
  "entityType": "product",
  "data": {
    "id": "[Task 1 Step 2에서 생성한 UUID]",
    "name": {
      "ko": "에센리 케라틴 집중케어 벨벳 헤어팩",
      "en": "Essenly Keratin Hair Mask - Frizz-Taming Mask",
      "ja": "エッセンリー ケラチン ヘアマスク",
      "zh": "艾森利角蛋白护发膜",
      "es": "Essenly Mascarilla Capilar de Queratina",
      "fr": "Essenly Masque Capillaire à la Kératine"
    },
    "description": {
      "ko": "케라틴과 콜라겐, 시어버터가 손상된 모발을 집중 케어하는 벨벳 제형 헤어팩. 곱슬머리 컨트롤과 광택, 수분 공급. 앰버 바닐라 시그니처 향.",
      "en": "Velvet-textured hair mask with keratin, collagen, and shea butter for intensive repair. Controls frizz, adds shine and hydration. Signature amber vanilla scent.",
      "ja": "ケラチン、コラーゲン、シアバター配合のベルベットテクスチャーヘアマスク。くせ毛をコントロールし、ツヤと潤いを与えます。アンバーバニラの香り。",
      "zh": "含角蛋白、胶原蛋白和乳木果油的丝绒质地发膜。控制毛躁，增添光泽和水分。琥珀香草香味。",
      "es": "Mascarilla capilar con textura aterciopelada con queratina, colágeno y manteca de karité. Controla el frizz, añade brillo e hidratación. Aroma de ámbar y vainilla.",
      "fr": "Masque capillaire texture velours à la kératine, collagène et beurre de karité. Contrôle les frisottis, apporte brillance et hydratation. Parfum ambre vanille."
    },
    "brand_id": "[Task 1 Step 1에서 생성한 브랜드 UUID]",
    "category": "haircare",
    "subcategory": null,
    "skin_types": [],
    "hair_types": ["straight", "wavy", "curly", "coily"],
    "concerns": [],
    "key_ingredients": ["keratin", "collagen", "shea butter", "sweet almond oil"],
    "price": 24000,
    "volume": "190ml",
    "purchase_links": [
      {
        "platform": "coupang",
        "url": "https://www.coupang.com/vp/products/9341625048"
      },
      {
        "platform": "amazon",
        "url": "https://www.amazon.com/dp/B0FT27QPGP"
      }
    ],
    "english_label": true,
    "tourist_popular": true,
    "is_highlighted": true,
    "highlight_badge": {
      "ko": "에센리 추천",
      "en": "Essenly Pick",
      "ja": "エッセンリーおすすめ",
      "zh": "艾森利推荐",
      "es": "Selección Essenly",
      "fr": "Choix Essenly"
    },
    "rating": 4.8,
    "review_count": 23,
    "review_summary": {
      "ko": "곱슬머리 컨트롤과 윤기에 효과적. 앰버 바닐라 잔향이 하루 종일 지속. 극손상모에도 살롱 케어급 결과.",
      "en": "Effective for frizz control and adding shine. Amber vanilla scent lasts all day. Salon-quality results even for severely damaged hair."
    },
    "images": [],
    "tags": ["essenly-exclusive", "frizz-control", "keratin", "amber-vanilla"],
    "status": "active"
  },
  "isApproved": true,
  "reviewedBy": "manual-entry"
}
```

- [ ] **Step 2: 검증 실행**

```bash
npx tsx scripts/seed/validate.ts --input scripts/seed/data/products-validated.json --entity-types product
```

Expected: 전체 PASS (highlight_badge.en 필수 검증 통과)

---

### Task 4: DB 적재

- [ ] **Step 1: 브랜드 적재**

```bash
npx tsx scripts/seed/load.ts --input scripts/seed/data/brands-validated.json --entity-types brand
```

Expected: `brand: 74 inserted, 0 failed` (기존 73 + Essenly 1)

- [ ] **Step 2: 제품 적재**

```bash
npx tsx scripts/seed/load.ts --input scripts/seed/data/products-validated.json --entity-types product
```

Expected: `product: 201 inserted, 0 failed` (기존 200 + 헤어팩 1)

- [ ] **Step 3: 커밋**

```bash
git add scripts/seed/data/brands-validated.json scripts/seed/data/products-validated.json TODO.md docs/superpowers/plans/p2-64a2-essenly-brand-product.md
git commit -m "feat(P2-64a2): Essenly 자사 브랜드 + 케라틴 헤어팩 등록

- brands: Essenly 브랜드 (is_essenly: true) 등록
- products: 케라틴 헤어팩 (is_highlighted: true, haircare, 24000원, 190ml)
- purchase_links: 쿠팡 + Amazon
- Kit CTA 자동 연결 (card-mapper.ts 기존 로직)"
```

---

## 검증 체크리스트

```
□ is_essenly: true (브랜드)
□ is_highlighted: true (제품)
□ highlight_badge.en 존재 (Kit CTA 필수 조건)
□ brand_id FK 정합성 (브랜드 UUID → 제품 brand_id)
□ purchase_links 구조 (platform + url)
□ deterministic UUID v5 (재적재 멱등성)
□ zod 검증 통과
□ DB 적재 에러 0건
□ 코드 수정 0건
```
