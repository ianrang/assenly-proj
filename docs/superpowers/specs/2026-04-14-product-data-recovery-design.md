# 제품 데이터 정합성 복구 + 가격 수집 설계

> 2026-04-14 · NEW-40 · 선행: NEW-37(스키마) ✅

## 1. 문제 정의

`collect-replacement-products.ts` 실행으로 201건 중 71건의 `brand` 필드가 다른 제품의 브랜드로 교체됨. 해당 71건의 `images`, `purchase_links`, `price`도 엉뚱한 제품의 데이터.

### 현재 데이터 상태

| 구분 | 건수 | 상태 |
|------|------|------|
| 정상 제품 (brand/name/images/links 일치) | 129 | ✅ |
| 오염 제품 (brand 교체 + 이미지/링크/가격 불일치) | 71 | ❌ |
| Essenly 자체 브랜드 제품 (수동 입력, 데이터 완전) | 1 | ✅ 보존 |
| 가격 있음 (정상) | 2 | - |
| 가격 있음 (오염) | 70 | 다른 제품의 가격 |
| 가격 없음 | 129 | - |

### 오염 원인

```
products-enriched.json (200건, 정상 brand/name)
  ↓ enrich-product-links.ts → 128 성공, 73 실패
  ↓ collect-replacement-products.ts → 실패 73건에 대해
    다른 제품의 brand/images/links/price를 덮어씀 (name_en은 원본 유지)
products-validated.json (201건 = 200 + Essenly 1건, 71건 오염)
```

## 2. 목표

- 201건 전체 제품의 brand/name/images/purchase_links/price 정합성 확보
- 올리브영에서 찾을 수 없는 제품은 리스트업 (사용자 판단용)
- NEW-37 스키마 필드 완전 채움
- Essenly 자체 브랜드 제품(1건) 보존

## 3. 파이프라인 설계

### Phase 1: 데이터 정본 복원 (스크립트, 즉시)

1. `products-enriched.json` (200건)에서 원본 `brand`, `brand_id` 복원
2. Essenly 제품(ID `55265963`, 수동 입력)은 그대로 보존
3. 71건의 오염된 `images`, `purchase_links`, `price` 초기화
4. 정상 129건의 기존 이미지/링크 데이터 보존
5. 출력: `products-recovered.json` (201건, 정본 brand/name + 정상 데이터 유지)

### Phase 2: 올리브영 스크래핑 (Playwright)

대상: 200건 (Essenly 1건 제외 — 이미 완전한 데이터)

#### 스크래핑 소스 우선순위

```
1차: 올리브영 Global (global.oliveyoung.com)
     → 영어 UI, 이미지, 구매 링크, KRW 가격
     (Global 페이지의 KRW 표시가 없으면 USD → KRW 환율 변환)

2차: 올리브영 한국 (oliveyoung.co.kr)  [Global 실패 시]
     → 한국어 UI, 이미지, 구매 링크, KRW 가격
```

#### 수집 필드 (방안 B: min/max 중심)

| 필드 | 규칙 | 저장 |
|------|------|------|
| `images[]` | 제품 페이지 대표 이미지 | `string[]` |
| `purchase_links[]` | 제품 페이지 URL | `{platform, url}[]` |
| `price` | `price_min`과 동일값 (현재 판매가) | `int` (KRW) |
| `price_min` | 할인가 or 정가 (현재 최저 판매가) | `int` (KRW) |
| `price_max` | 정가 (원래 가격) | `int` (KRW) |
| `price_currency` | 고정 | `'KRW'` |
| `price_source` | 고정 | `'real'` |
| `range_source` | 고정 | `'real'` |
| `price_source_url` | 제품 페이지 URL | `string` |
| `price_updated_at` | 스크래핑 시점 | `timestamptz` |

**가격 규칙:**
- 할인 있음: `price_min` = 할인가, `price_max` = 정가, `price` = `price_min`
- 할인 없음: `price_min` = `price_max` = 정가, `price` = 정가
- 가격 못 찾음: 모두 null

#### 환율 변환 (USD 소스일 경우)

- `Math.round(usdPrice * exchangeRate)` → KRW 저장
- 환율: 스크립트 실행 시 공개 API 1회 조회 또는 고정 상수
- `price_source_url`에 원본 URL 기록 → USD 가격 역추적 가능

#### 검색 + 매칭 로직 (이전 실패 방지)

```
1. 검색어: "{brand} {product_name_en}" → 올리브영 검색
2. 결과 목록에서 제품 선택:
   a. 이름 유사도 (word overlap ≥ 50%)
   b. 브랜드 검증: 페이지 내 브랜드명이 원본 brand와 일치
   c. 둘 다 통과해야 매칭 성공
3. 1차 실패 시 → 검색어 축약: "{brand} {핵심 키워드 2-3개}"
4. 2차 실패 시 → 올리브영 한국 사이트에서 동일 로직
5. 최종 실패 → images=[], purchase_links=[], price=null → 리스트업
```

**핵심 개선: 브랜드 검증 게이트**
- 이전 스크래퍼는 이름 유사도만 확인 → 다른 브랜드 제품 매칭
- 개선: 제품 상세 페이지의 브랜드와 DB brand 비교 → 불일치 시 reject

### Phase 3: 검증 + 적재

1. 전수 정합성 검증:
   - brand ↔ name_en 내 브랜드명 일치
   - images URL 유효성 (HTTPS, CDN 도메인)
   - purchase_links URL 유효성
   - price_min ≤ price_max (있을 경우)
2. 리포트 생성: `docs/audit/product-recovery-report.md`
   - 매칭 성공/실패 목록 (실패 = 사용자 판단 필요)
   - 소스별 (Global/한국) 건수
   - 가격 커버리지
3. `products-validated.json` 갱신
4. `load.ts`로 DB 적재

## 4. 산출물

| 파일 | 내용 |
|------|------|
| `scripts/seed/recover-products.ts` | Phase 1: 정본 복원 스크립트 |
| `scripts/seed/enrich-product-links.ts` | Phase 2: 개선된 스크래퍼 (브랜드 검증 + 가격 수집) |
| `scripts/seed/data/products-recovered.json` | Phase 1 출력 (정본 데이터) |
| `scripts/seed/data/products-validated.json` | Phase 3 최종 출력 |
| `docs/audit/product-recovery-report.md` | 매칭 결과 리포트 + 실패 목록 |

## 5. 스키마 정합성 (NEW-37)

- `price_currency`: CHECK (`'KRW','USD','JPY','CNY','EUR'`) → KRW 통일 ✅
- `price_source`: CHECK (`'real'` 등) → `'real'` 사용 ✅
- `price_min ≤ price_max`: CHECK → 할인가 ≤ 정가 ✅

## 6. NEW-35/36 영향

- **NEW-35 (가격 티어)**: KRW 통일, `price_min` 기준으로 티어 계산 가능
- **NEW-36 (가격 파이프라인)**: Phase 2에서 `price_source='real'`로 채운 제품은 36-a 완료 상태. 실패 제품만 36-b/c/d fallback 대상
- **NEW-34R (가격 감사)**: Phase 3 리포트가 NEW-34R 입력 역할

## 7. v0.2 예고: 멀티 통화

현재 KRW 단일 통화로 저장. v0.2에서:
- `price_usd` 필드 추가 (또는 `prices` JSONB로 통화별 저장)
- 로컬 가격(KRW, 한국 매장) vs 해외 가격(USD, Global) 분리
- 사용자 locale에 따라 표시 통화 전환

## 8. 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 올리브영 스크래핑 차단/rate limit | 매칭 실패 증가 | 요청 간 지연(2-3초), User-Agent 설정 |
| 19개 브랜드 올리브영 미입점 | ~30건 이미지/링크 부재 | 리스트업 후 사용자 판단 |
| 환율 변동 (USD 소스 시) | KRW 가격 부정확 | `price_updated_at` 기록, 정기 갱신 가능 |
| G-12 외부 소스 검증 | 법적 리스크 | NEW-27에서 동일 소스 사용 전례 |
