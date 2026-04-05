# P2-64a 부속: Daiso 매장 데이터 수집

> **For agentic workers:** 코드 변경 0건. 기존 파이프라인 실행만으로 완결.

**Goal:** P2-64c(product_stores junction)에서 `available_at: daiso` 제품과 매장을 연결하기 위해, stores 테이블에 Daiso 매장 데이터를 추가한다.

**Architecture:** Phase A stores 수집(P2-61)과 100% 동일한 파이프라인. 카카오 로컬 API fetch → place-mapper(store 분류) → store-type-classifier(daiso 분류) → enrich(6언어 번역 + description 생성) → review export → 검수 → DB 적재.

**코드 변경:** 없음. 쿼리 파일(`daiso-queries.json`)은 이미 생성 완료.

---

## 사전 검증 결과 (2026-04-05)

| 항목 | 결과 |
|------|------|
| 카카오 API 연결 | ✅ 응답 확인 |
| 10개 쿼리 → 115건 raw → dedup 84건 | ✅ |
| place-mapper: 84건 모두 store | ✅ |
| store-type-classifier: daiso 정확 분류 | ✅ |
| enrich: store_type=daiso, district, 6언어, description | ✅ |

---

## 실행 순서

### Step 1: Fetch (카카오 API)

```bash
npx tsx --env-file=.env.local scripts/seed/fetch.ts \
  --targets=places \
  --place-queries=scripts/seed/data/daiso-queries.json \
  --output=scripts/seed/data/daiso-raw.json
```

Expected: ~84건 (dedup 후)

### Step 2: Enrich (AI 번역 + description 생성)

```bash
npx tsx --env-file=.env.local scripts/seed/enrich.ts \
  --input=scripts/seed/data/daiso-raw.json \
  --output=scripts/seed/data/daiso-enriched.json \
  --entity-types=store
```

### Step 3: Review Export

```bash
npx tsx --env-file=.env.local scripts/seed/export-review.ts \
  --input=scripts/seed/data/daiso-enriched.json \
  --entity-types=store
```

### Step 4: Auto-approve (초기 시딩)

english_support 기본값 "none" → 다이소는 "basic"이 적절하지만, 초기 시딩에서는 auto-approve 후 추후 보정.

### Step 5: DB 적재

```bash
npx tsx --env-file=.env.local scripts/seed/load.ts \
  --input=scripts/seed/data/daiso-validated.json \
  --entity-types=store
```

### Step 6: 검증

stores 테이블에서 store_type='daiso' 건수 확인.

---

## 규칙 준수

- P-9: scripts/ 내부 실행만. src/ 미수정
- Q-12: deterministic UUID + UPSERT → 멱등
- Q-13: stores는 독립 테이블 (FK 부모 없음)
- 코드 변경 0건 → V-1~V-26 해당 없음
