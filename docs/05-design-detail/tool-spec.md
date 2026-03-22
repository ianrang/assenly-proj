# Tool 상세 설계 — P1-31 + P1-32

> 버전: 1.0
> 작성일: 2026-03-22
> 근거: PoC tools.ts + p0-17-extraction.ts, search-engine.md §2.3, user-screens.md §1.3~1.4, api-spec.md §3.2
> 원칙: 이 문서는 LLM ↔ tool handler 사이의 인터페이스 계약(입력 스키마 + 출력 구조)만 정의한다.

---

## 0. 범위 선언

### 이 문서가 다루는 것

- 3개 tool의 입력 JSON Schema (LLM이 호출 시 전달하는 파라미터)
- 3개 tool의 출력 JSON 구조 (tool handler가 LLM에 반환하는 데이터)
- PoC 스키마 대비 프로덕션 변경점

### 이 문서가 다루지 않는 것

- tool 사용 가이드 (when to call 등) → system-prompt-spec.md §6
- 호출 흐름 (chatService → tool → repository → beauty.rank) → search-engine.md §1
- repository 필터 매핑 (SQL 컬럼, WHERE 절) → search-engine.md §2.3
- tool-result → UI 컴포넌트 매핑 → user-screens.md §1.3~1.4
- tool 에러 처리 상세 → 이 문서 §4 (P1-34 완료)
- SSE 이벤트 구조 (tool-call, tool-result) → api-spec.md §3.2

### PoC 기반

| PoC | 프로덕션 변경 |
|-----|-------------|
| `docs/04-poc/scripts/shared/tools.ts` | search_beauty_data filters 확장 (+category, +max_downtime). get_external_links 유지 |
| `docs/04-poc/scripts/p0-17-extraction.ts` | extract_user_profile 스키마 계승. 93% 정확도 검증 완료 |

---

## 1. search_beauty_data

### 입력 스키마

```typescript
const searchBeautyDataSchema = z.object({
  query: z.string()
    .describe('Search query in natural language'),

  domain: z.enum(['shopping', 'treatment'])
    .describe('shopping = products + stores, treatment = procedures + clinics'),

  filters: z.object({
    skin_types: z.array(z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal']))
      .optional()
      .describe('Filter by suitable skin types'),

    concerns: z.array(z.string())
      .optional()
      .describe('Filter by target concerns (e.g. acne, wrinkles, dark_spots)'),

    category: z.string()
      .optional()
      .describe('Product: skincare, makeup, haircare, bodycare, tools. Treatment: skin, laser, injection, facial, body, hair'),

    budget_max_krw: z.number()
      .optional()
      .describe('Maximum budget in KRW'),

    max_downtime: z.number()
      .optional()
      .describe('Maximum recovery days (treatment only). Filters out treatments with longer downtime'),

    english_support: z.boolean()
      .optional()
      .describe('Requires English-speaking staff (store/clinic)'),
  }).optional()
    .describe('Optional filters to narrow results'),

  limit: z.number()
    .optional()
    .default(3)
    .describe('Max results to return (default 3, max 5)'),
});
```

### PoC 대비 변경점

| 필드 | PoC | 프로덕션 | 이유 |
|------|-----|---------|------|
| `filters.category` | 없음 | 추가 | search-engine.md §2.3: Products/Treatments 모두 category 필터 지원 |
| `filters.max_downtime` | 없음 | 추가 | search-engine.md §2.3: Treatments 다운타임 필터. PRD §4-A 시술 추천 규칙 |
| `limit` 최대값 | 무제한 | max 5 | system-prompt-spec.md §7 "Never present more than 5 results" |

### 출력 구조 — domain: shopping

```json
{
  "cards": [
    {
      "id": "uuid",
      "name": { "en": "COSRX Snail Mucin Essence", "ko": "코스알엑스 스네일 무신 에센스" },
      "brand": {
        "id": "uuid",
        "name": { "en": "COSRX", "ko": "코스알엑스" }
      },
      "category": "skincare",
      "price": 18000,
      "images": ["https://storage.example.com/img1.webp"],
      "english_label": true,
      "is_highlighted": false,
      "highlight_badge": null,
      "reasons": ["Contains snail mucin for hydration", "Suitable for combination skin"],
      "stores": [
        {
          "id": "uuid",
          "name": { "en": "Olive Young Myeongdong", "ko": "올리브영 명동" },
          "district": "Jung-gu",
          "map_url": "https://map.kakao.com/...",
          "english_support": "fluent"
        }
      ],
      "purchase_links": [
        { "platform": "olive_young", "url": "https://oliveyoung.co.kr/..." }
      ]
    }
  ],
  "total": 42
}
```

### 출력 필드 ↔ user-screens.md §1.3 대응 검증

| tool-spec 출력 필드 | user-screens.md 필드 | UI 영역 |
|--------------------|--------------------|---------|
| `name.[locale]` | `name.[locale]` | 헤더 제목 |
| `brand.name.[locale]` | `brand.name.[locale]` | 헤더 부제목 |
| `price` | `price` | 헤더 가격 |
| `images[0]` | `images[0]` | 이미지 |
| `reasons` | → LLM이 `why_recommended` 생성 (§7) | 바디 |
| `is_highlighted` | `is_highlighted` | HighlightBadge visible |
| `highlight_badge` | `highlight_badge` | HighlightBadge 텍스트 |
| `english_label` | `english_label` | 푸터 배지 |
| `stores[0]` | `store` (AI가 1개 선택, §7) | 푸터 지도 링크 |
| `purchase_links[0]` | `purchase_links` | 푸터 구매 링크 |

> `why_recommended`는 tool-result에 포함되지 않는다. `reasons[]`를 LLM이 자연어로 가공한다 (system-prompt-spec.md §7).
> `stores`는 배열로 반환. LLM이 §7 "Store selection" 규칙에 따라 1개를 선택한다.

### 출력 구조 — domain: treatment

```json
{
  "cards": [
    {
      "id": "uuid",
      "name": { "en": "Aqua Peel", "ko": "아쿠아 필" },
      "category": "facial",
      "price_min": 80000,
      "price_max": 150000,
      "duration_minutes": 45,
      "downtime_days": 1,
      "is_highlighted": false,
      "highlight_badge": null,
      "reasons": ["Targets pore concerns", "Minimal downtime fits 5-day stay"],
      "clinics": [
        {
          "id": "uuid",
          "name": { "en": "Gangnam Derma Clinic", "ko": "강남피부과" },
          "district": "Gangnam-gu",
          "map_url": "https://map.kakao.com/...",
          "booking_url": "https://booking.example.com/...",
          "english_support": "fluent"
        }
      ]
    }
  ],
  "total": 15
}
```

### 출력 필드 ↔ user-screens.md §1.4 대응 검증

| tool-spec 출력 필드 | user-screens.md 필드 | UI 영역 |
|--------------------|--------------------|---------|
| `name.[locale]` | `name.[locale]` | 헤더 제목 |
| `category` | `category` | 헤더 카테고리 배지 |
| `price_min`, `price_max` | `price_min`, `price_max` | 헤더 가격대 |
| `duration_minutes` | `duration_minutes` | 바디 소요 시간 |
| `downtime_days` | `downtime_days` | 바디 회복 기간 |
| `reasons` | → LLM이 `why_recommended` 생성 (§7) | 바디 |
| `is_highlighted` | `is_highlighted` | HighlightBadge visible |
| `highlight_badge` | `highlight_badge` | HighlightBadge 텍스트 |
| `clinics[0]` | `clinic` (AI가 1개 선택, §7) | 푸터 클리닉 정보 |
| `clinics[0].name.[locale]` | `clinic.name.[locale]` | 푸터 클리닉명 |
| `clinics[0].booking_url` | `clinic.booking_url` | 푸터 예약 링크 |

---

## 2. get_external_links

### 입력 스키마

```typescript
const getExternalLinksSchema = z.object({
  entity_id: z.string()
    .describe('ID of the entity'),

  entity_type: z.enum(['product', 'store', 'clinic', 'treatment'])
    .describe('Type of entity'),
});
```

PoC 대비 변경 없음.

### 출력 구조

```json
{
  "links": [
    {
      "type": "map",
      "url": "https://map.kakao.com/...",
      "label": "View on Kakao Map"
    },
    {
      "type": "purchase",
      "url": "https://oliveyoung.co.kr/...",
      "label": "Buy at Olive Young"
    },
    {
      "type": "booking",
      "url": "https://booking.example.com/...",
      "label": "Book appointment"
    },
    {
      "type": "website",
      "url": "https://clinic.example.com",
      "label": "Official website"
    }
  ]
}
```

### 링크 타입

| type | 용도 | 엔티티 |
|------|------|--------|
| `map` | 카카오맵/네이버맵 위치 | store, clinic |
| `purchase` | 온라인 구매 링크 | product |
| `booking` | 예약 링크 | clinic, treatment |
| `website` | 공식 웹사이트 | store, clinic |
| `instagram` | 인스타그램 | store, clinic |

---

## 3. extract_user_profile

### 동작 방식

api-spec.md §3.4 7b단계: LLM이 대화 중 **동기 tool_use**로 호출. 추출 결과는 tool-result로 반환되고, 11단계에서 **비동기**로 DB에 저장.

### 입력

없음. LLM이 현재 대화 컨텍스트에서 자동으로 추출하여 출력 스키마에 맞게 반환.

### 출력 스키마

```typescript
const extractUserProfileSchema = z.object({
  skin_type: z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal'])
    .nullable()
    .describe('Skin type if explicitly mentioned. null if not mentioned.'),

  skin_concerns: z.array(
    z.enum([
      'acne', 'wrinkles', 'dark_spots', 'redness', 'dryness',
      'pores', 'dullness', 'dark_circles', 'uneven_tone', 'sun_damage', 'eczema',
    ])
  ).nullable()
    .describe('Skin concerns if mentioned. Map synonyms: breakouts→acne, pigmentation→dark_spots, fine lines→wrinkles. null if not mentioned.'),

  stay_days: z.number()
    .nullable()
    .describe('Number of days staying in Korea, if mentioned. null if not.'),

  budget_level: z.enum(['budget', 'mid', 'premium', 'luxury'])
    .nullable()
    .describe('Budget level inferred from amounts: <30K KRW=budget, 30-80K=mid, 80-200K=premium, >200K=luxury. null if not mentioned.'),

  age_range: z.enum(['18-24', '25-29', '30-34', '35-39', '40-49', '50+'])
    .nullable()
    .describe('Age range if mentioned or clearly inferable. null if not.'),

  learned_preferences: z.array(
    z.object({
      item: z.string().describe('Ingredient or product type'),
      direction: z.enum(['prefer', 'avoid']),
    })
  ).nullable()
    .describe('Explicit ingredient/product preferences. null if not mentioned.'),
});
```

### PoC 대비 변경점

없음. P0-17 스키마를 그대로 계승 (93% 정확도 검증 완료).

### 변수 매핑

| 스키마 필드 | PRD 변수 | system-prompt-spec.md §9.2 티어 |
|-----------|---------|-------------------------------|
| `skin_type` | UP-1 | Tier 1 (저장 트리거) |
| `skin_concerns` | JC-1 | Tier 1 (저장 트리거) |
| `stay_days` | JC-3 | Tier 2 (추천 품질) |
| `budget_level` | JC-4 | Tier 2 (추천 품질) |
| `age_range` | UP-4 | Tier 3 (보조) |
| `learned_preferences` | BH-4 | Tier 3 (보조) |

---

## 4. Tool 에러 처리 (P1-34)

### 4.1 에러 전달 원칙

tool handler의 execute 함수 내부에서 에러 발생 시, **에러 정보를 tool-result로 LLM에 정상 반환**한다. LLM은 system-prompt-spec.md §6 "Tool error" 규칙에 따라 사용자에게 사과 메시지를 생성한다.

#### P1-34 vs P1-40 경계

| 에러 발생 위치 | 담당 문서 | 처리 방식 |
|---------------|----------|----------|
| tool execute 함수 내부 (DB 실패, 임베딩 실패 등) | **이 문서 §4** (P1-34) | 에러 결과를 LLM에 정상 반환 → LLM이 사용자에게 사과 |
| LLM ↔ tool 왕복 중 SDK 연결 끊김 | llm-resilience.md §2.4 (P1-40) | 전체 턴 폴백 |
| LLM API 호출 자체 실패 (타임아웃, 429, 500) | llm-resilience.md §2 (P1-40) | callWithFallback 폴백 모델 전환 |

### 4.2 tool별 에러 유형 + 행동

#### search_beauty_data

| 에러 유형 | 행동 | 반환 |
|----------|------|------|
| DB 타임아웃 / 접속 실패 | 에러 결과 반환. LLM이 사과 + 재시도 제안 | `{ "cards": [], "total": 0, "error": "DB_UNAVAILABLE" }` |
| embedQuery 실패 (임베딩 API 장애) | SQL 필터 검색으로 폴백 (벡터 없이 필터만 적용) | 정상 cards 반환 (quality degradation이지만 결과 0건보다 나음) |
| 부분 JOIN 실패 (brand/store/clinic 누락) | 핵심 데이터(product/treatment) 반환. 관계 필드는 빈 배열/null | `{ "cards": [{ ... "stores": [] }], "total": N }` |

#### get_external_links

| 에러 유형 | 행동 | 반환 |
|----------|------|------|
| 링크 조회 실패 | 빈 배열 반환 | `{ "links": [] }` |
| 특정 링크 타입 누락 | 있는 링크만 반환 | `{ "links": [사용 가능한 것만] }` |

#### extract_user_profile

| 에러 유형 | 행동 | 반환 |
|----------|------|------|
| 추출 실패 (파싱 에러 등) | graceful degradation. 서버 로그 기록 (Q-7 준수). 대화 중단 없음 | `{ "status": "extraction_skipped", "reason": "parse_error" }` |
| 추출 결과 전부 null | 정상 동작 (VP-3). 대화에서 관련 정보 미언급 상태 | `{ "skin_type": null, "skin_concerns": null, ... }` |

> extract_user_profile 실패는 사용자에게 알리지 않는다. 이 tool은 부수적(side-effect)이며 실패해도 추천 대화에 영향 없음.

### 4.3 재시도 정책

**handler 내부 재시도: 없음.**

근거:
- LLM이 tool-result에서 에러를 인지하면, `stopWhen: stepCountIs(N)` 범위 내에서 파라미터를 조정하여 재호출할 수 있다
- handler 내부 재시도는 TTFT를 증가시키고 stepCountIs 예산을 낭비한다
- DB 영구 장애에는 재시도가 무의미하다
- llm-resilience.md §2.1의 "서버 자동 재시도 없음" 철학과 일관
