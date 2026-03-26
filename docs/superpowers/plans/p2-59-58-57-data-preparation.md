# P2-59/58/57 데이터 준비 통합 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MVP 서비스 구동에 필요한 3종 데이터를 준비한다: (1) 큐레이션 대상 선정, (2) 개발용 스켈레톤 시드 데이터, (3) LLM 컨텍스트용 뷰티 지식 KB.

**Architecture:** 코드 구현이 아닌 데이터/문서 작성 작업. `src/` 수정 없음. 산출물은 YAML 데이터 파일(`scripts/seed/`) + Markdown KB 문서(`docs/knowledge-base/`). 다른 세션(P2-9~28)과 파일 충돌 0건.

**Tech Stack:** YAML (시드 데이터), Markdown (KB 문서), WebSearch/WebFetch (조사)

**설계 정본:**
- `docs/05-design-detail/data-collection.md` §5 큐레이션 전략
- `docs/05-design-detail/seed-data-plan.md` §2 엔티티 시드 데이터, §3 뷰티 지식 KB
- `src/shared/types/domain.ts` (엔티티 타입 정의)
- `src/shared/constants/beauty.ts` (열거값)

**규칙 준수:**
- G-12: 외부 소스 사전 검증 (이미 V2/V4/V7에서 완료)
- D-4: 데이터 모델 호환 검증 (schema.dbml + domain.ts 필드 준수)
- D-9: 누락 검증 (커버리지 요구사항 충족 확인)
- P-9: scripts/ → server/core/, shared/ 허용. 역방향 금지
- L-7: beauty/ 모듈은 순수 함수만 (데이터 작업이므로 해당 없음)
- src/ 수정 없음 — P2-9~28 다른 세션과 충돌 0건

**실행 순서:** P2-59 → P2-58 → P2-57 (P2-59 결과가 P2-58/57 대상 선정에 활용됨)

---

## 스키마 구분: Manifest vs Seed Data

**Manifest** (`scripts/seed/manifests/*.yaml`): 큐레이션 선정용 간소화 스키마. 사람이 읽고 편집하는 리스트. domain.ts와 1:1 대응 아님.

**Seed Data** (`scripts/seed/data/*.yaml`): DB 적재용 스키마. `src/shared/types/domain.ts` 인터페이스의 **모든 non-nullable 필드**를 포함해야 함.

### Manifest → Domain 필드 매핑

| Manifest 필드 | Domain 필드 | 비고 |
|--------------|-----------|------|
| `name_ko`, `name_en` | `name: { ko, en }` | LocalizedText 변환 |
| `brand` (문자열) | `brand_id` (UUID FK) | manifest에서는 이름, seed에서는 FK |
| `budget_level` | (Product에 없음) | 큐레이션 배분 검증용. 실제 Product에는 `price` 필드로 대응 |
| `expected_skin_types` | `skin_types` / `suitable_skin_types` | manifest=선정 기준, seed=실제 값 |
| `expected_concerns` | `concerns` / `target_concerns` | 동일 |
| `available_at` | (Product에 없음) | 큐레이션 접근성 검증용 |
| `kakao_query` | (Store/Clinic에 없음) | 카카오 API 검색용 힌트 |
| `price_range_krw: [min, max]` | `price_min`, `price_max` | manifest=배열, seed=개별 필드 |

---

## 파일 구조

| 파일 | 역할 | 변경 유형 |
|------|------|---------|
| `scripts/seed/manifests/products.yaml` | 200개 제품 큐레이션 리스트 | 생성 |
| `scripts/seed/manifests/stores.yaml` | 50개 매장 큐레이션 리스트 | 생성 |
| `scripts/seed/manifests/clinics.yaml` | 30개 클리닉 큐레이션 리스트 | 생성 |
| `scripts/seed/manifests/treatments.yaml` | 50개 시술 큐레이션 리스트 | 생성 |
| `scripts/seed/data/m1-skeleton.yaml` | M1 스켈레톤 시드 데이터 (~50건) | 생성 |
| `docs/knowledge-base/ingredients/*.md` | 성분 가이드 20종 | 생성 |
| `docs/knowledge-base/treatments/*.md` | 시술 가이드 15종 | 생성 |
| `TODO.md` | P2-59/58/57 상태 갱신 | 수정 |
| `src/` | **수정 없음** | — |

---

## Task 1: P2-59 큐레이션 리스트 확정 — 제품 200개 선정

**Files:**
- Create: `scripts/seed/manifests/products.yaml`

**선정 기준** (data-collection.md §5.1):
- 카테고리: Skincare 110 / Makeup 40 / Haircare 20 / Bodycare 20 / Tools 10
- 가격대: budget 60 / moderate 70 / premium 50 / luxury 20
- 커버리지: skin_type 5종 각 40+, concerns 11종 각 5+, 관광객 접근(올리브영/시코르) 70%+
- 브랜드: 50+ 유니크, K-뷰티 90%+, 브랜드당 최대 8개

**인기도 시그널 소스** (크롤링 없이 수동 참조, data-collection.md §5.1):
- 올리브영 공식 랭킹 (웹사이트 수동 확인)
- 화해/글로우픽 앱 내 랭킹 (수동 확인)
- YouTube/TikTok "best K-beauty for tourists" (수동)
- Reddit r/AsianBeauty 상위 게시물 (수동)
- 에센리 도메인 전문가 직접 큐레이션

- [ ] **Step 1: Skincare 110개 선정**

WebSearch로 K-뷰티 인기 스킨케어 제품 조사. 카테고리별 세분화:
- Moisturizer/Cream: 25개
- Serum/Essence/Ampoule: 25개
- Cleanser/Toner: 20개
- Sunscreen: 15개
- Mask/Pack: 15개
- Eye Care: 10개

각 제품: `name_ko`, `name_en`, `brand`, `category: skincare`, `subcategory`, `budget_level`, `expected_skin_types[]`, `expected_concerns[]`, `available_at` (올리브영/시코르/브랜드샵)

YAML 형식:
```yaml
# scripts/seed/manifests/products.yaml
products:
  - name_ko: "이니스프리 그린티 씨드 히알루로닉 세럼"
    name_en: "Innisfree Green Tea Seed Hyaluronic Serum"
    brand: "Innisfree"
    category: "skincare"
    subcategory: "serum"
    budget_level: "moderate"
    expected_skin_types: ["dry", "combination", "normal"]
    expected_concerns: ["dryness", "dullness"]
    available_at: ["olive_young", "innisfree_store"]
```

- [ ] **Step 2: Makeup 40개 선정**

K-뷰티 시그니처: 립틴트/립스틱 15, 쿠션/파운데이션 10, 아이섀도/마스카라 10, 기타(프라이머/세팅) 5

- [ ] **Step 3: Haircare 20 + Bodycare 20 + Tools 10 선정**

- [ ] **Step 4: 커버리지 검증 (D-9)**

선정된 200개에 대해 검증:
```
□ skin_type 5종 × skincare: 각 40+ 적합? (sensitive 최소 30)
□ concerns 11종: 각 5+? (1순위 7개는 15+?)
□ 관광객 접근성: 올리브영/시코르 구매 가능 140+?
□ 유니크 브랜드 50+?
□ 브랜드당 최대 8개 미초과?
□ budget/moderate/premium/luxury 비율 30/35/25/10?
```

미달 항목 있으면 제품 교체하여 충족.

- [ ] **Step 5: 커밋**

```bash
mkdir -p scripts/seed/manifests
git add scripts/seed/manifests/products.yaml
git commit -m "P2-59: products 200개 큐레이션 리스트 확정"
```

---

## Task 2: P2-59 큐레이션 리스트 — 매장/클리닉/시술 선정

**Files:**
- Create: `scripts/seed/manifests/stores.yaml`
- Create: `scripts/seed/manifests/clinics.yaml`
- Create: `scripts/seed/manifests/treatments.yaml`

- [ ] **Step 1: Stores 50개 선정**

data-collection.md §5.2 기준:
- 지역 배분: 명동 10, 강남 8, 홍대 7, 이태원 5, 잠실 4, 성수 4, 여의도 3, 동대문 3, 압구정 3, 기타 3
- 유형 배분: olive_young 20, brand_store 12, department_store 8, chicor 5, pharmacy 2, other 3

YAML 형식:
```yaml
# scripts/seed/manifests/stores.yaml
stores:
  - name_ko: "올리브영 강남역점"
    name_en: "Olive Young Gangnam Station"
    district: "gangnam"
    store_type: "olive_young"
    kakao_query: "올리브영 강남역"  # 카카오 API 검색용
```

- [ ] **Step 2: Clinics 30개 선정**

data-collection.md §5.3 기준:
- 지역: 강남 12, 압구정/청담 8, 명동 4, 신사 3, 기타 3
- 유형: dermatology 12, aesthetic 8, plastic_surgery 6, med_spa 4
- 필수: english_support >= basic, foreigner_friendly.international_cards = true

```yaml
# scripts/seed/manifests/clinics.yaml
clinics:
  - name_ko: "연세스타피부과"
    name_en: "Yonsei Star Dermatology"
    district: "gangnam"
    clinic_type: "dermatology"
    english_support: "fluent"
    kakao_query: "연세스타피부과 강남"
```

- [ ] **Step 3: Treatments 50개 선정**

data-collection.md §5.4 기준:
- 카테고리: laser 15, skin 10, injection 10, facial 8, body 4, hair 3
- downtime: 0일 20+, 1~3일 15+, 4일+ 10+

```yaml
# scripts/seed/manifests/treatments.yaml
treatments:
  - name_ko: "레이저 토닝"
    name_en: "Laser Toning"
    category: "laser"
    expected_concerns: ["dark_spots", "uneven_tone"]
    expected_skin_types: ["oily", "combination", "normal"]
    downtime_days: 1
    price_range_krw: [50000, 150000]
```

- [ ] **Step 4: 커밋**

```bash
git add scripts/seed/manifests/stores.yaml scripts/seed/manifests/clinics.yaml scripts/seed/manifests/treatments.yaml
git commit -m "P2-59: stores 50 + clinics 30 + treatments 50 큐레이션 리스트 확정"
```

- [ ] **Step 5: TODO.md P2-59 완료 갱신**

P2-59 상태 ⬜ → ✅ 변경. 진행률 갱신.

---

## Task 3: P2-58 M1 스켈레톤 데이터 작성

**Files:**
- Create: `scripts/seed/data/m1-skeleton.yaml`

**대상** (seed-data-plan.md §2.4 M1):
- brands 5건, products 10건, ingredients 10건, stores 5건, clinics 5건, treatments 10건, doctors 5건
- P2-59에서 선정된 리스트의 상위 항목에서 추출

**필드 규칙:**
- `src/shared/types/domain.ts` 인터페이스의 **모든 non-nullable 필드** 포함 필수
- `src/shared/constants/beauty.ts` 열거값만 사용 (skin_types, concerns 등)
- FK 관계 정합성: products.brand_id → brands.id, doctors.clinic_id → clinics.id
- images: `[]` (D-14 placeholder 전략)
- status: `"active"`
- id: 개발 편의를 위한 읽기 쉬운 slug 형식 (`"b001-innisfree"` 등). 실제 DB 적재 시 loader가 UUID v4로 변환
- `tier`, `specialties`, `function`, `common_in` 등 beauty.ts에 열거값이 없는 string/string[] 필드는 자유 문자열 허용 (도메인 특성상 고정 열거 불가)

### 엔티티별 전체 필드 + 기본값

**Brand**: id(slug), name, origin, tier(`BUDGET_LEVELS`에서 선택 권장), is_essenly(`false`), specialties(`[]`), status(`"active"`), created_at/updated_at(loader 자동)

**Product**: id(slug), name, description(`null`), brand_id(FK), category, subcategory, skin_types(`[]`), hair_types(`[]`), concerns(`[]`), key_ingredients(`null`), price(`null`), volume(`null`), purchase_links(`null`), english_label(`false`), tourist_popular(`false`), is_highlighted(`false`), highlight_badge(`null`), rating(`null`), review_count(`0`), review_summary(`null`), images(`[]`), tags(`[]`), status(`"active"`)

**Ingredient**: name, inci_name(`null`), function(`[]` — CosIng 기반 자유 문자열), caution_skin_types(`[]`), common_in(`[]` — 자유 문자열), status(`"active"`)

**Store**: name, description(`null`), country(`"KR"`), city(`"Seoul"`), district(`null`), location(`null`), address(`null`), operating_hours(`null`), english_support(`"none"`), store_type(`null`), tourist_services(`[]`), payment_methods(`[]`), nearby_landmarks(`[]`), external_links(`[]`), is_highlighted(`false`), highlight_badge(`null`), rating(`null`), review_count(`0`), images(`[]`), tags(`[]`), status(`"active"`)

**Clinic**: name, description(`null`), country(`"KR"`), city(`"Seoul"`), district(`null`), location(`null`), address(`null`), operating_hours(`null`), english_support(`"basic"`), clinic_type(`null`), license_verified(`false`), consultation_type(`[]`), foreigner_friendly(`null` — `ForeignerSupport` 객체 또는 null), booking_url(`null`), external_links(`[]`), is_highlighted(`false`), highlight_badge(`null`), rating(`null`), review_count(`0`), images(`[]`), tags(`[]`), status(`"active"`)

**Treatment**: name, description(`null`), category, subcategory(`null`), target_concerns(`[]`), suitable_skin_types(`[]`), price_min(`null`), price_max(`null`), price_currency(`"KRW"`), duration_minutes(`null`), downtime_days(`null`), session_count(`null`), precautions(`null`), aftercare(`null`), is_highlighted(`false`), highlight_badge(`null`), rating(`null`), review_count(`0`), images(`[]`), tags(`[]`), status(`"active"`)

**Doctor**: id(slug), name, clinic_id(FK), specialties(`[]`), certifications(`[]`), languages(`[]`), status(`"active"`), created_at/updated_at(loader 자동). ※ Doctor는 domain.ts에 is_highlighted/rating/review_count/images/tags 없음 — 다른 엔티티와 다름

- [ ] **Step 1: brands 5건 작성**

P2-59에서 선정된 5개 대표 브랜드 (이니스프리, 라네즈, 설화수, 코스알엑스, 미샤).

```yaml
brands:
  - id: "b001-innisfree"
    name: { ko: "이니스프리", en: "Innisfree" }
    origin: "Korea"
    tier: "moderate"  # BUDGET_LEVELS 중 선택
    is_essenly: false
    specialties: ["green_tea", "jeju_ingredients"]  # 자유 문자열
    status: "active"
```

- [ ] **Step 2: ingredients 10건 작성**

V4-A에서 검증된 대표 성분에서 선정:
Niacinamide, Hyaluronic Acid, Retinol, Salicylic Acid, Centella Asiatica Extract, Ceramide NP, Adenosine, Panthenol, Snail Secretion Filtrate, Arbutin

```yaml
ingredients:
  - id: "i001-niacinamide"
    name: { ko: "나이아신아마이드", en: "Niacinamide" }
    inci_name: "Niacinamide"
    function: ["skin_conditioning", "smoothing"]  # CosIng V4-A 검증
    caution_skin_types: []
    common_in: ["serum", "essence", "moisturizer"]
    status: "active"
```

- [ ] **Step 3: stores 5건 + clinics 5건 작성**

P2-59 리스트에서 상위 5개씩.

stores 필수 필드: name, country("KR"), city("Seoul"), district, store_type, english_support, status
clinics 필수 필드: name, country("KR"), city("Seoul"), district, clinic_type, english_support, license_verified, foreigner_friendly, status

location(lat/lng)은 M2에서 카카오 API로 확보. M1에서는 null.

- [ ] **Step 4: products 10건 작성**

brands에서 브랜드당 2개. FK: brand_id → brands[].id

products 필수 필드: name, brand_id, category, subcategory, skin_types[], concerns[], price, status, images(`[]`), english_label, tourist_popular

skin_types/concerns 값은 `src/shared/constants/beauty.ts`의 SKIN_TYPES, SKIN_CONCERNS에서만 선택:
- skin_types: "dry" | "oily" | "combination" | "sensitive" | "normal"
- concerns: "acne" | "wrinkles" | "dark_spots" | "redness" | "dryness" | "pores" | "dullness" | "dark_circles" | "uneven_tone" | "sun_damage" | "eczema"

- [ ] **Step 5: treatments 10건 + doctors 5건 작성**

treatments: P2-59 리스트에서 카테고리별 대표 선정 (laser 3, skin 2, injection 2, facial 2, body 1)
doctors: clinics 5건에 1명씩. FK: clinic_id → clinics[].id

treatments 필수 필드: name, category, target_concerns[], suitable_skin_types[], price_min, price_max, price_currency("KRW"), downtime_days, status
doctors 필수 필드: name, clinic_id, specialties[], languages(["ko","en"]), status

- [ ] **Step 6: FK 정합성 검증**

수동 확인:
```
□ products[].brand_id → brands[].id 존재?
□ doctors[].clinic_id → clinics[].id 존재?
□ 모든 skin_types/suitable_skin_types 값이 SKIN_TYPES에 포함? (dry/oily/combination/sensitive/normal)
□ 모든 concerns/target_concerns 값이 SKIN_CONCERNS에 포함? (11개)
□ 모든 hair_types 값이 HAIR_TYPES에 포함? (straight/wavy/curly/coily)
□ 모든 status = "active"?
□ 모든 images = [] (D-14)?
□ 모든 is_highlighted = false, review_count = 0?
□ 모든 엔티티에 domain.ts 필수 필드 누락 없음?
□ foreigner_friendly가 ForeignerSupport 객체 또는 null 형식?
```

- [ ] **Step 7: 커밋**

```bash
mkdir -p scripts/seed/data
git add scripts/seed/data/m1-skeleton.yaml
git commit -m "P2-58: M1 스켈레톤 데이터 7엔티티 50건 작성"
```

- [ ] **Step 8: TODO.md P2-58 완료 갱신**

---

## Task 4: P2-57 뷰티 지식 KB — 성분 가이드 20종

**Files:**
- Create: `docs/knowledge-base/ingredients/niacinamide.md` (외 19개)

**포맷** (seed-data-plan.md §3.3.2):

```markdown
# [한글명] ([영문명])

> 이 정보는 일반 참고용이며 의료 조언이 아닙니다. 피부 상태에 따라 전문의와 상담하세요.

## 기본 정보
- INCI: [INCI name]
- 별명: [통용 별명, 예: 비타민 B3]
- 기능: [function 요약]
- K-뷰티에서: [K-뷰티 제품에서의 활용]

## 피부타입별 적합도
- 건성(dry): [적합/보통/주의 + 이유]
- 지성(oily): [적합/보통/주의 + 이유]
- 복합성(combination): [적합/보통/주의 + 이유]
- 민감성(sensitive): [적합/보통/주의 + 이유]
- 보통(normal): [적합/보통/주의 + 이유]

## 시너지 성분
- [성분명]: [시너지 효과]

## 주의사항
- [주의 사항 1]
- [주의 사항 2]
```

**대상 20종** (V4-A 검증된 성분 + K-뷰티 대표):
1. Niacinamide, 2. Hyaluronic Acid, 3. Retinol, 4. Salicylic Acid, 5. Ascorbic Acid (Vitamin C),
6. Centella Asiatica Extract, 7. Snail Secretion Filtrate, 8. Ceramide NP, 9. Adenosine, 10. Panthenol,
11. Arbutin, 12. Propolis Extract, 13. Green Tea (Camellia Sinensis), 14. Mugwort (Artemisia),
15. Rice Extract (Oryza Sativa), 16. Ginseng (Panax Ginseng), 17. Tocopherol (Vitamin E),
18. Glycolic Acid, 19. Azelaic Acid, 20. Squalane

**품질 기준** (seed-data-plan.md §3.4):
- 200~2000자/문서
- ko 원본 (LLM이 사용자 언어로 실시간 응답)
- 의학적 정확성 → 전문가 검수 필요 (MVP 출시 전)

- [ ] **Step 1: AI 초안 — 성분 1~10 작성**

각 성분 Markdown 파일 생성. WebSearch로 최신 정보 확인 후 작성.
파일명 규칙: `{inci-name-kebab-case}.md`

- [ ] **Step 2: AI 초안 — 성분 11~20 작성**

- [ ] **Step 3: 품질 검증**

각 파일에 대해:
```
□ 필수 섹션 존재? (기본 정보, 피부타입별 적합도, 시너지, 주의사항)
□ 200~2000자 범위?
□ skin_type 값이 SKIN_TYPES와 일치? (dry/oily/combination/sensitive/normal)
□ 의학적으로 명백히 틀린 내용 없음?
```

- [ ] **Step 4: 커밋**

```bash
mkdir -p docs/knowledge-base/ingredients
git add docs/knowledge-base/ingredients/
git commit -m "P2-57: 성분 가이드 KB 20종 AI 초안 작성"
```

---

## Task 5: P2-57 뷰티 지식 KB — 시술 가이드 15종

**Files:**
- Create: `docs/knowledge-base/treatments/laser-toning.md` (외 14개)

**포맷**:

```markdown
# [한글명] ([영문명])

> 이 정보는 일반 참고용이며 의료 조언이 아닙니다. 시술 전 반드시 전문의와 상담하세요.

## 기본 정보
- 카테고리: [laser/skin/injection/facial/body/hair]
- 시술 원리: [간략 설명]
- 소요 시간: [분]
- 다운타임: [일]

## 적합 피부타입
- 건성(dry): [적합/보통/비추천 + 이유]
- 지성(oily): [적합/보통/비추천 + 이유]
- 복합성(combination): [적합/보통/비추천 + 이유]
- 민감성(sensitive): [적합/보통/비추천 + 이유]
- 보통(normal): [적합/보통/비추천 + 이유]

## 적합 피부 고민
- [concern]: [효과 설명]

## 시술 횟수 및 비용
- 권장 횟수: [N회]
- 가격 범위: [₩min ~ ₩max]

## 시술 전 주의사항
- [주의 1]

## 시술 후 관리
- [관리 1]
```

**대상 15종** (data-collection.md §5.4에서 선정):
- laser (5): Laser Toning, Pico Laser, IPL, Fractional Laser, CO2 Laser
- skin (3): Chemical Peel, Microneedling, Aqua Peel
- injection (3): Botox, Filler (Hyaluronic Acid), Skin Booster
- facial (2): Hydrafacial, LED Therapy
- body (1): Body Contouring
- hair (1): Scalp Treatment

- [ ] **Step 1: AI 초안 — 시술 1~8 작성**

- [ ] **Step 2: AI 초안 — 시술 9~15 작성**

- [ ] **Step 3: 품질 검증**

```
□ 필수 섹션 존재?
□ 200~2000자 범위?
□ 카테고리가 schema.dbml treatment.category 값과 일치?
□ target_concerns 값이 SKIN_CONCERNS와 일치?
□ 가격 범위가 현실적? (한국 기준 KRW)
□ 의료법 면책: 각 문서 상단에 "일반 참고 정보이며 의료 조언이 아닙니다" 포함?
```

- [ ] **Step 4: 커밋**

```bash
mkdir -p docs/knowledge-base/treatments
git add docs/knowledge-base/treatments/
git commit -m "P2-57: 시술 가이드 KB 15종 AI 초안 작성"
```

- [ ] **Step 5: TODO.md P2-57 완료 갱신 + 최종 진행률 갱신**

P2-57, P2-58, P2-59 모두 ✅. 진행률 갱신.

---

## 제약 사항

- **src/ 수정 없음** — 다른 세션(P2-9~28)과 충돌 방지
- **core/ 수정 없음** (L-4, P-2)
- **열거값은 constants/beauty.ts 준수** — skin_types, concerns 등 자의적 값 생성 금지
- **FK 정합성** — products.brand_id, doctors.clinic_id 등 참조 무결성
- **images = []** — D-14 placeholder 전략. 실제 이미지 URL 삽입 금지
- **KB 문서는 ko 원본** — LLM이 사용자 언어로 실시간 응답 (seed-data-plan §3.4)
- **KB 의학적 정확성** — AI 초안은 전문가 검수 전까지 "초안" 상태. MVP 출시 전 검수 필수
- **추론 금지** — 제품/매장/클리닉 정보는 실제 존재하는 것만 기재. 가상 데이터 생성 금지 (스켈레톤도 실제 브랜드/제품 사용)
