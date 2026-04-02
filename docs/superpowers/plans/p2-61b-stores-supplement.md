# P2-61b: Stores 수동 보완 전수 입력 계획서

## Context

P2-61에서 278건 stores를 카카오 API로 수집 → AI 번역 → DB 적재 완료.
그러나 `operating_hours`, `english_support`, `tourist_services`, `payment_methods` 4개 필드가 전수 미입력(0/278).
본 태스크는 체인별 공통값 일괄 적용 + other 선별 보완 + 비매장 레코드 삭제를 수행한다.

---

## 의사결정 (확정)

| 항목 | 결정 |
|------|------|
| 작업 방식 | A 방식 (파이프라인 — validated JSON 수정 → load.ts UPSERT) |
| 영업시간 | 체인 대표값 일괄 적용 (개별 매장 차이 무시) |
| payment_methods | 체인별 공통값 포함 |
| other 111건 | 선별 보완 (관광객 가치 기준) + 비매장 6건 DB 삭제 |

---

## 영향 분석

### 수정 대상 파일

| 파일 | 변경 내용 | 계층 |
|------|----------|------|
| `scripts/seed/data/stores-validated.json` | 278건 데이터 필드 보완 (operating_hours, english_support, tourist_services, payment_methods) | scripts/ (P-9 조합 루트) |
| 신규: `scripts/seed/supplement-stores.ts` | 보완 스크립트 (validated JSON 읽기 → 체인별 공통값 적용 → 저장) | scripts/ (P-9 조합 루트) |

### 수정하지 않는 파일 (불변)

- `src/shared/` — 타입/스키마/상수 변경 없음 (기존 스키마가 이미 4개 필드 지원)
- `src/server/` — 비즈니스/core 코드 변경 없음
- `src/client/` — UI 변경 없음
- `scripts/seed/lib/` — 기존 파이프라인 코드 변경 없음 (loader.ts, enricher.ts 등)

### 아키텍처 규칙 검증

| 규칙 | 준수 | 근거 |
|------|------|------|
| P-9 scripts/ 조합 루트 | ✅ | scripts/ → shared/ (validation import만). 역방향 없음 |
| P-10 제거 안전성 | ✅ | supplement-stores.ts 삭제해도 빌드 에러 0건 |
| R-1~R-4 계층 의존 | ✅ | server/, client/ 코드 무수정 |
| G-6 core 수정 금지 | ✅ | core/ 무수정 |
| L-0c shared/ 순수성 | ✅ | shared/ 무수정 |
| V-22 스키마 정합성 | ✅ | english_support enum, operating_hours jsonb, tourist_services text[], payment_methods text[] — 기존 스키마와 일치 |

---

## 데이터 소스: 체인별 공통값

### olive_young (45건)

```json
{
  "operating_hours": {
    "weekday": "10:00-22:00",
    "saturday": "10:00-22:00",
    "sunday": "11:00-22:00",
    "holiday": "11:00-21:00"
  },
  "english_support": "good",
  "tourist_services": ["tax_refund", "multilingual_staff", "sample_bar", "beauty_consultation"],
  "payment_methods": ["cash", "credit_card", "debit_card", "mobile_pay", "wechat_pay", "alipay", "union_pay"]
}
```

### chicor (12건)

```json
{
  "operating_hours": {
    "weekday": "10:30-20:00",
    "saturday": "10:30-20:30",
    "sunday": "10:30-20:00",
    "holiday": "10:30-20:00"
  },
  "english_support": "good",
  "tourist_services": ["tax_refund", "multilingual_staff", "beauty_consultation", "sample_bar", "gift_wrapping"],
  "payment_methods": ["cash", "credit_card", "debit_card", "mobile_pay", "wechat_pay", "alipay", "union_pay"]
}
```

### department_store (46건)

```json
{
  "operating_hours": {
    "weekday": "10:30-20:00",
    "saturday": "10:30-20:30",
    "sunday": "10:30-20:00",
    "holiday": "10:30-20:00"
  },
  "english_support": "good",
  "tourist_services": ["tax_refund", "multilingual_staff", "beauty_consultation", "gift_wrapping", "tourist_discount", "wifi"],
  "payment_methods": ["cash", "credit_card", "debit_card", "mobile_pay", "wechat_pay", "alipay", "union_pay"]
}
```

### pharmacy (4건)

```json
{
  "operating_hours": {
    "weekday": "09:00-19:00",
    "saturday": "09:00-15:00",
    "sunday": null,
    "holiday": null
  },
  "english_support": "basic",
  "tourist_services": ["tax_refund", "beauty_consultation"],
  "payment_methods": ["cash", "credit_card", "debit_card"]
}
```

### brand_store (60건)

```json
{
  "operating_hours": {
    "weekday": "10:00-22:00",
    "saturday": "10:00-22:00",
    "sunday": "10:00-22:00",
    "holiday": "11:00-21:00"
  },
  "english_support": "basic",
  "tourist_services": ["tax_refund", "multilingual_staff", "sample_bar", "beauty_consultation"],
  "payment_methods": ["cash", "credit_card", "debit_card", "mobile_pay"]
}
```

### other — 선별 보완 대상 (나머지 other)

체인 공통값이 없으므로 일반 K-뷰티 소매점 기본값 적용:

```json
{
  "operating_hours": {
    "weekday": "10:00-21:00",
    "saturday": "10:00-21:00",
    "sunday": "11:00-20:00",
    "holiday": "11:00-20:00"
  },
  "english_support": "basic",
  "tourist_services": ["tax_refund"],
  "payment_methods": ["cash", "credit_card", "debit_card", "mobile_pay"]
}
```

---

## 삭제 대상: 비매장 6건

| # | name.ko | name.en | ID | 사유 |
|---|---------|---------|-----|------|
| 1 | 이창글로벌 HQ | Leechang Global HQ | `21ca08ad-c869-52fa-92bb-373ab377c1e7` | 기업 사옥 |
| 2 | 에스디생명공학 사옥 | SD Life Science HQ | `14c6d095-3efa-549d-b65d-687a93eff093` | 기업 사옥 |
| 3 | 더연 서울사무소 | The Yeon Seoul Office | `fc7980c2-0c7a-599c-a81e-a969f27a2ccd` | 사무소 |
| 4 | 홍대 웯우드스튜디오 향수공방 | Wewood Studio Perfume Workshop | `d0e3dfca-1ffe-5cb6-80a2-f2f68cf3c922` | 서비스(공방) |
| 5 | 깍쟁이네일 | Kkakjaengi Nail | `ef1dd990-86c1-5dba-97aa-8c79e6fb1437` | 네일 살롱 |
| 6 | P1P닥터에스테 | P1P Dr. Esthe | `f33c5563-ca38-5798-ada4-f37d368623b8` | 에스테틱 |

삭제 방식: DB에서 직접 DELETE (ID 지정). 6건은 junction 테이블(product_stores) 미연결 상태 → FK 제약 없음.

---

## 실행 단계

### Step 1: 보완 스크립트 작성

`scripts/seed/supplement-stores.ts` — 독립 실행 스크립트

```
입력: scripts/seed/data/stores-validated.json (278건)
처리:
  1. 비매장 6건 ID 제거 → 272건
  2. store_type별 공통값 매핑 적용
  3. 전체 레코드에 operating_hours, english_support, tourist_services, payment_methods 설정
출력: scripts/seed/data/stores-validated.json (272건, 덮어쓰기)
```

의존성: `fs`, `path` (Node.js 내장) + 공통값 JSON (스크립트 내 상수). shared/ import 없음.

### Step 2: 스크립트 실행 → validated JSON 갱신

```bash
npx tsx scripts/seed/supplement-stores.ts
```

### Step 3: DB 적재 (기존 load.ts UPSERT)

```bash
npx tsx scripts/seed/load.ts --input scripts/seed/data/stores-validated.json
```

272건 UPSERT → 기존 레코드의 4개 필드 업데이트.

### Step 4: 비매장 6건 DB 삭제

```bash
# Supabase SQL 또는 스크립트로 6건 DELETE
```

### Step 5: 검증

- DB 조회로 272건 필드 채움 확인
- 6건 삭제 확인
- 빈 필드 0건 확인 (operating_hours, english_support, tourist_services, payment_methods)

---

## 검증 체크리스트

```
□ V-1  의존성 방향: supplement-stores.ts는 Node.js 내장 모듈만 사용. shared/ import 없음
□ V-2  core 불변: core/ 무수정
□ V-4  features 독립: features/ 무수정
□ V-17 제거 안전성: supplement-stores.ts 삭제해도 빌드 에러 0건
□ V-18 scripts/ 의존 방향: scripts/ → (없음). 역방향 없음
□ V-22 스키마 정합성: 4개 필드 타입이 DB 스키마와 일치
□ V-19 복합 쓰기: UPSERT + DELETE 분리 실행. 원자성 불필요 (독립 작업)
```
