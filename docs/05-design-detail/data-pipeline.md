# 데이터 파이프라인 + LLM 캐싱 설계

> 버전: 0.1
> 최종 갱신: 2026-03-22
> 대상 태스크: P1-59 (초기 적재) + P1-60 (주기적 갱신) + P1-57 (LLM 응답 캐싱)
> 상위 문서: data-strategy.md (PoC 결정), schema.dbml (DB 정본), 7.2-ADMIN-REQUIREMENTS.md (관리자 앱)

---

## 목차

1. [§1 목적 + 범위](#1-목적--범위)
2. [§2 데이터 흐름 전체도](#2-데이터-흐름-전체도)
3. [§3 초기 적재 파이프라인 (P1-59)](#3-초기-적재-파이프라인-p1-59)
4. [§4 주기적 갱신 파이프라인 (P1-60)](#4-주기적-갱신-파이프라인-p1-60)
5. [§5 LLM 응답 캐싱 결정 (P1-57)](#5-llm-응답-캐싱-결정-p1-57)
6. [§6 크로스 참조](#6-크로스-참조)

---

# §1 목적 + 범위

## 1.1 목적

외부 데이터 소스로부터 도메인 엔티티를 **수집 → 변환 → 검증 → DB 적재**하는 파이프라인과, 적재 후 **주기적 갱신** 전략, 그리고 LLM 응답의 **캐싱 여부 결정**을 하나의 문서에서 설계한다.

## 1.2 범위

| 항목 | 포함 | 제외 |
|------|------|------|
| 초기 적재 (P1-59) | ETL 아키텍처, 변환 규칙, 검증, 에러 처리 | 실제 코드 구현 (Phase 2) |
| 주기적 갱신 (P1-60) | 갱신 트리거, 변경 감지, 폐업 처리, 충돌 해결 | 스케줄러 구현 (v0.2) |
| LLM 캐싱 (P1-57) | 옵션 분석, 비용/다양성 트레이드오프, MVP 결정 | 인프라 캐싱 = P1-48 소관 |

## 1.3 전제 조건 (PoC 확정 사항)

data-strategy.md에서 확정된 결정:

| 결정 | 내용 | 참조 |
|------|------|------|
| U-6 | 데이터 소스: 카카오 API + 수동 보완 혼합 | data-strategy.md P0-29 |
| U-7 | 갱신: 관리자 앱에서 동기화 트리거/스케줄 | data-strategy.md P0-32 |
| U-8 | 시드 수집: 카카오 API + AI 번역/보강 | data-strategy.md P0-32 |
| U-14 | 리뷰: AI 생성 요약 (면책 표시) | data-strategy.md P0-36 |
| U-5 | 이미지: Supabase Storage | data-strategy.md P0-35 |

---

# §2 데이터 흐름 전체도

```
                        ┌──────────────────────────────────────────────────────────────┐
                        │                     데이터 생명주기                              │
                        └──────────────────────────────────────────────────────────────┘

  [외부 소스]              [ETL 파이프라인]           [DB]              [서빙 레이어]
  ┌───────────┐         ┌─────────────────┐      ┌──────────┐      ┌──────────────────┐
  │ 카카오 API │───┐     │  §3 초기 적재     │      │          │      │                  │
  │ 네이버 API │───┼────▶│  Fetch → Transform│────▶│ Supabase │─────▶│ 검색 엔진         │
  │ 수동 입력   │───┤     │  → Validate → Load│     │ Postgres │      │ (search-engine.md)│
  │ AI 보강    │───┘     └─────────────────┘      │          │      └────────┬─────────┘
                         ┌─────────────────┐      │          │               │
                         │  §4 주기적 갱신    │      │          │               ▼
  [관리자 앱]────────────▶│  Diff → Merge    │─────▶│          │      ┌──────────────────┐
  (수동 트리거)            │  → Validate      │      │          │      │ LLM              │
                         └─────────────────┘      └──────────┘      │ (§5 캐싱 결정)     │
                                                                     └──────────────────┘
                                                                              │
                         ┌─────────────────┐                                  ▼
                         │  P1-39           │                        ┌──────────────────┐
                         │  임베딩 파이프라인  │◀── 변경 감지 ──────────│ 사용자 응답        │
                         │  (별도 설계)      │                        └──────────────────┘
                         └─────────────────┘
```

**캐싱 포인트 (소관 구분)**:
- DB 쿼리 캐시, DV 캐시, 이미지 CDN → **P1-48** (인프라 캐싱)
- LLM 응답 캐시 → **§5** (본 문서)
- 임베딩 캐시 → **P1-39** (임베딩 파이프라인)

---

# §3 초기 적재 파이프라인 (P1-59)

## 3.1 ETL 아키텍처

P0-33 PoC에서 검증한 **멀티 프로바이더 플러그인 구조**를 계승한다.

```
PlaceProvider interface (P0-33 검증 완료)
├── KakaoLocalProvider    ← MVP 1순위 (장소: stores, clinics)
├── NaverSearchProvider   ← 보조 (중복 보강)
├── GooglePlacesProvider  ← 영어 데이터 보강
├── MockProvider          ← 개발/테스트용
└── ManualProvider (신규) ← 관리자 수동 입력 + CSV 일괄 업로드
```

### Provider 인터페이스 (P0-33 `pipeline/types.ts` 계승)

```typescript
interface PlaceProvider {
  name: string;
  isAvailable(): boolean;
  search(query: string, options?: SearchOptions): Promise<RawPlace[]>;
}
```

### 엔티티별 소스 매핑

| 엔티티 | 1순위 소스 | 보조 소스 | 수동 보완 필드 |
|--------|-----------|----------|---------------|
| stores | 카카오 로컬 API | 네이버 검색 | 영업시간, english_support, tourist_services |
| clinics | 카카오 로컬 API | Google Places | english_support, license_verified, foreigner_friendly |
| products | 수동 입력 + AI 보강 | 브랜드 공식 사이트 | 전 필드 (API 소스 없음) |
| treatments | 수동 입력 + AI 보강 | - | 전 필드 |
| brands | 수동 입력 | - | 전 필드 |
| ingredients | 수동 입력 + AI 보강 | Open Beauty Facts | inci_name, function, caution_skin_types |
| doctors | 수동 입력 | - | 전 필드 (클리닉 종속) |

## 3.2 변환 규칙

### 3.2.1 API 응답 → RawPlace → DB Row 매핑

카카오 로컬 API 기준 (data-strategy.md P0-30 확정):

| 카카오 필드 | RawPlace 필드 | DB 필드 | 변환 |
|------------|--------------|---------|------|
| place_name | name | name.ko | 직접 매핑 |
| - | nameEn | name.en | LLM 번역 (P0-14 검증) |
| road_address_name | address | address.ko | 직접 매핑 |
| x, y | lng, lat | location | `POINT(lng lat)` PostGIS 변환 |
| category_name | category | store_type / clinic_type | 카테고리 분류 함수 (P0-33 `classifyPlace`) |
| phone | phone | external_links | `{type: 'phone', url: 'tel:...'}` |
| place_url | placeUrl | external_links | `{type: 'kakao_map', url: ...}` |

### 3.2.2 다국어 번역 단계

data-strategy.md P0-34 결정: **LLM 번역 (Gemini/Claude)**.

| 단계 | 입력 | 출력 | 비용 |
|------|------|------|------|
| 1. 한국어 원본 확보 | API 응답 / 수동 입력 | name.ko, description.ko | - |
| 2. LLM 번역 (ko → en) | name.ko, description.ko | name.en, description.en | 필수 |
| 3. LLM 번역 (ko → ja, zh, es, fr) | name.ko, description.ko | 4개 언어 | 선택 (일괄 실행) |

- 번역 품질: P0-14에서 Gemini 6개 언어 4.6/5.0 검증 완료
- 비용: 200제품 x 6언어 ~ $0.50 (cost-estimate.md §5)
- 번역 단위: 엔티티 단위 (name + description을 하나의 프롬프트로)

### 3.2.3 district 도출

stores/clinics의 `district` 필드: 주소에서 서울 구(區) 추출.

```
"서울특별시 강남구 역삼동 123" → district: "gangnam"
```

매핑 테이블: 25개 서울 자치구 → 영문 slug. `shared/constants/`에 정의.

## 3.3 검증 규칙

### 3.3.1 필수 필드 검증 (schema.dbml 기반)

| 엔티티 | 필수 필드 (NOT NULL) | 검증 |
|--------|---------------------|------|
| products | name, status | name.ko + name.en 존재 확인 |
| stores | name, country, city, english_support, status | name.ko + name.en, country = 'KR' |
| clinics | name, country, city, english_support, status | name.ko + name.en, country = 'KR' |
| treatments | name, status | name.ko + name.en |
| brands | name, status | name.ko + name.en |
| ingredients | name, status | name.ko + name.en |
| doctors | clinic_id, name, status | FK 존재 확인 |

### 3.3.2 값 범위 검증

> 정본: schema.dbml CHECK 제약 + PRD §4-A. ETL 파이프라인 자기 완결성을 위해 의도적으로 재서술.
> 변경 시 D-6 교차 검증 필수: schema.dbml, 7.2-ADMIN §7.2.6과 동기화.

| 필드 | 타입 | 제약 | 근거 |
|------|------|------|------|
| status | text | `active` / `inactive` / `temporarily_closed` | schema.dbml CHECK |
| english_support | text | `none` / `basic` / `good` / `fluent` | schema.dbml CHECK |
| store_type | text | `olive_young` / `chicor` / `department_store` / `brand_store` / `pharmacy` / `other` | schema.dbml |
| clinic_type | text | `dermatology` / `plastic_surgery` / `aesthetic` / `med_spa` | schema.dbml |
| rating | float | 0.0 ~ 5.0 | schema.dbml |
| price (products) | int | >= 0 (KRW) | schema.dbml |
| price_min/max (treatments) | int | min <= max, >= 0 | schema.dbml |
| downtime_days | int | >= 0 | schema.dbml |
| skin_types[] | text[] | `dry` / `oily` / `combination` / `sensitive` / `normal` | PRD §4-A |
| concerns[] | text[] | 11-pool (acne, wrinkles, ..., eczema) | PRD §4-A |

### 3.3.3 구현 방식

- zod 스키마로 런타임 검증 (Q-1 준수)
- 검증 스키마는 `shared/` 에 정의하여 파이프라인과 API 입력 검증에서 재사용
- 검증 실패 시 해당 레코드 건너뛰기 + 에러 로그 기록

## 3.4 에러 처리 + 롤백

### 3.4.1 에러 분류

| 단계 | 에러 유형 | 처리 |
|------|----------|------|
| Fetch | API 타임아웃, 429 Rate Limit | 지수 백오프 재시도 (최대 3회) |
| Fetch | API 키 무효, 403 | 해당 프로바이더 스킵, 다음 프로바이더로 폴백 |
| Transform | 필수 필드 누락 | 해당 레코드 스킵, 에러 로그 |
| Transform | 번역 실패 | name.en = name.ko 폴백 (추후 수동 보완) |
| Validate | 값 범위 초과 | 해당 레코드 스킵, 에러 로그 |
| Load | DB 연결 실패 | 전체 배치 중단, 재시도 |
| Load | 중복 키 (UNIQUE 위반) | UPSERT (ON CONFLICT UPDATE) |

### 3.4.2 트랜잭션 전략

- **초기 적재**: 엔티티 타입별 배치 트랜잭션. stores 실패해도 clinics는 독립 실행.
- **단일 엔티티 내**: 100건 단위 청크. 청크 실패 시 해당 청크만 롤백, 이전 청크는 커밋 유지.
- **적재 로그**: 각 실행의 결과를 JSON 파일로 기록 (성공/실패/스킵 건수, 에러 상세).

### 3.4.3 재시도 정책

```
재시도 대상: Fetch 네트워크 에러, DB 일시 장애
최대 재시도: 3회
백오프: 1s → 2s → 4s (지수)
재시도 비대상: 검증 실패, 비즈니스 로직 에러
```

---

# §4 주기적 갱신 파이프라인 (P1-60)

## 4.1 갱신 트리거

data-strategy.md P0-32 결정: **MVP는 관리자 수동 입력 (옵션 b)**.

| 버전 | 트리거 | 설명 |
|------|--------|------|
| **MVP (v0.1)** | 관리자 수동 트리거 | 관리자 앱 "데이터 동기화" 버튼 (7.2-ADMIN-REQUIREMENTS.md U-7) |
| v0.2 | 관리자 수동 + 주기 스케줄 | 동기화 주기 설정 (일/주/월) + cron 자동 실행 |

> **구현 시점**: 동기화 흐름의 설계는 본 문서에서 확정한다. API 엔드포인트(`POST /api/admin/sync`)는 api-spec.md에서 V2-2로 분류되어 있으며, Phase 2 데이터 준비 태스크에서 구현한다. auth-matrix.md §2.4에 권한(super_admin 전용)은 선 정의되어 있다.

### MVP 동기화 흐름

```
관리자 → "동기화 실행" 클릭
  → POST /api/admin/sync (super_admin 전용, auth-matrix.md §2)
  → 카카오 API Fetch (stores/clinics만)
  → 변경 감지 (§4.2)
  → Merge + Validate (§3.3 검증 규칙 재사용)
  → DB 업데이트
  → 결과 로그 반환 (성공/실패/변경 건수)
```

## 4.2 변경 감지

### 4.2.1 감지 방법

API에서 가져온 데이터와 DB 기존 데이터를 비교하여 신규/수정/삭제를 분류한다.

| 매칭 키 | 엔티티 | 비교 방법 |
|---------|--------|----------|
| 카카오 place_url | stores, clinics | external_links에서 kakao_map URL 매칭 |
| name.ko + address.ko | stores, clinics | place_url 없는 경우 폴백 |

### 4.2.2 분류 로직

```
API 결과 vs DB 기존:
├── API에만 존재 → "신규" → 검증 후 INSERT
├── 양쪽 존재 + 내용 변경 → "수정" → §4.4 충돌 해결 후 UPDATE
├── DB에만 존재 (API에 없음) → "잠재적 폐업" → §4.3 폐업 처리
└── 양쪽 동일 → SKIP
```

**변경 판단**: name, address, phone, category 필드의 해시 비교. operating_hours, rating 등 빈번 변경 필드는 해시에서 제외 (노이즈 방지).

**엣지 케이스 — 장소 이전**: place_url이 유지된 상태에서 주소/이름이 모두 변경되는 경우 (이전), place_url 기준으로 매칭되어 "수정"으로 분류된다. 주소/이름 변경분은 §4.4 충돌 해결 규칙(API 원본 필드 우선)에 따라 자동 반영.

## 4.3 폐업 처리

7.2-ADMIN-REQUIREMENTS.md 정책: **영구 삭제 없음, 비활성화만**.

| 조건 | 처리 | 근거 |
|------|------|------|
| API 2회 연속 미반환 | status → `temporarily_closed` + 관리자 알림 | 일시적 API 누락 대응 |
| 관리자 확인 후 폐업 확정 | status → `inactive` | 관리자 앱에서 수동 전환 |
| 재등장 (API에 다시 반환) | status → `active` 복원 | 자동 재활성화 |

### cascade 비활성화

- stores/clinics 비활성화 시 → 사용자 앱 검색에서 제외 (7.2-ADMIN-REQUIREMENTS.md §비활성화 정책)
- 연관 junction (product_stores, clinic_treatments) → 유지하되 사용자 앱 미노출
- doctors → clinic 비활성 시 사용자 앱 미노출 (7.2-ADMIN-REQUIREMENTS.md 정책 4)

## 4.4 충돌 해결

관리자 수동 편집 vs API 동기화 데이터가 다를 때:

| 필드 유형 | 우선순위 | 이유 |
|----------|---------|------|
| 관리자 직접 편집 필드 (description, english_support, tourist_services 등) | **관리자 우선** | 수동 보완된 고품질 데이터 보호 |
| API 원본 필드 (name.ko, address.ko, phone, location) | **API 우선** | 최신 기본 정보 반영 |
| 이미지 | **관리자 우선** | 직접 업로드된 이미지 보호 |

### 충돌 판단 기준

- `updated_at` 타임스탬프 비교: 관리자가 마지막으로 수정한 이후 API 데이터가 다르면 충돌
- 충돌 발생 시: API 원본 필드만 업데이트, 관리자 보완 필드는 유지
- 동기화 로그에 충돌 건수 + 상세 기록

---

# §5 LLM 응답 캐싱 결정 (P1-57)

## 5.1 범위 한정

- 본 섹션은 **LLM 생성 응답의 캐싱** 여부만 결정한다
- DB 쿼리 캐시, 검색 결과 캐시, DV 캐시, 이미지 CDN → **P1-48** 소관
- 임베딩 벡터 캐시 → **P1-39** 소관

## 5.2 옵션 분석

### 옵션 (a): 캐싱 안 함 — 항상 실시간 LLM 호출

| 항목 | 평가 |
|------|------|
| 응답 다양성 | 최고 — 동일 질문에도 매번 다른 표현 |
| 개인화 정합성 | 최고 — 항상 최신 프로필 반영 |
| 비용 | 절감 없음 |
| 구현 복잡도 | 없음 |
| 데이터 신선도 | 최고 — DB 변경 즉시 반영 |

### 옵션 (b): LLM 응답 캐싱 — 동일 쿼리+컨텍스트 → 캐시 히트

| 항목 | 평가 |
|------|------|
| 응답 다양성 | 낮음 — 캐시 히트 시 동일 응답 반복 |
| 개인화 정합성 | 캐시 키에 개인화 변수 포함 필요 |
| 비용 | 10~20% 절감 (cost-estimate.md §1) |
| 구현 복잡도 | 높음 (캐시 키 설계, 무효화, TTL) |
| 데이터 신선도 | 낮음 — DB 변경 후 캐시 무효화 필요 |

## 5.3 캐시 키 폭발 문제 분석

LLM 응답 캐싱의 핵심 문제: 캐시 키의 조합 수.

```
캐시 키 = 사용자 쿼리 + 개인화 변수(15개) + 도출 변수(4개) + 대화 히스토리

개인화 변수 조합:
- skin_type: 5종
- concerns: 11종 중 복수 선택 → 2^11 = 2,048 조합
- budget_range: 연속값
- stay_days: 연속값
- ... (15개 변수)

이론적 조합 수: 사실상 무한 → 캐시 히트율 극히 낮음
```

## 5.4 MVP 결정: **(a) 캐싱 안 함**

| 결정 근거 | 설명 |
|----------|------|
| 캐시 히트율 | 개인화 변수 조합으로 인해 극히 낮음 (< 5% 추정) |
| 비용 절감 효과 | 10~20% 절감이지만, 히트율 감안 시 실질 1~2% |
| 구현 비용 | 캐시 키 설계 + 무효화 로직 개발 비용 > 절감 비용 |
| MVP 규모 | 일 100 세션 기준 $9~$300/월 — 캐싱 없이도 예산 범위 |
| UX 우선 | 매번 신선한 개인화 응답이 K-뷰티 AI 에이전트의 핵심 가치 |

### v0.2 재검토 조건

- 일 1,000+ 세션 도달 시 비용 재분석
- 비개인화 질문 (일반 K-뷰티 상식) 빈도가 높으면 부분 캐싱 검토
- 검색 결과 캐싱 (P1-48)이 충분한 비용 절감을 제공하는지 확인 후 판단

---

# §6 크로스 참조

| 참조 대상 | 문서 | 참조 내용 |
|----------|------|----------|
| PoC 결정 (소스, 매핑, 법적) | `docs/04-poc/data-strategy.md` | U-6~U-14 확정 사항 |
| PoC 파이프라인 코드 | `docs/04-poc/scripts/p0-33-pipeline.ts` | PlaceProvider 구조, ETL 흐름 |
| PoC 파이프라인 타입 | `docs/04-poc/scripts/pipeline/types.ts` | RawPlace, StoreRow, ClinicRow, PlaceProvider |
| DB 스키마 | `docs/03-design/schema.dbml` | 7 엔티티 테이블 필드, 제약조건, 타입 |
| 관리자 앱 요구사항 | `docs/03-design/7.2-ADMIN-REQUIREMENTS.md` | 동기화 UI, 비활성화 정책, 데이터 CRUD |
| 관리자 동기화 API | `docs/05-design-detail/api-spec.md` | POST/GET /api/admin/sync |
| 관리자 인증 | `docs/05-design-detail/auth-matrix.md` §2 | sync = super_admin 전용 |
| 비용 추정 | `docs/04-poc/cost-estimate.md` §1 | LLM 비용, 캐싱 절감 추정 |
| 인프라 캐싱 (DV/검색/CDN) | `docs/05-design-detail/performance-caching.md` | MVP: 이미지 CDN + SSG만. DV/검색 캐시 안 함 |
| 임베딩 파이프라인 | `docs/05-design-detail/embedding-strategy.md` | 텍스트 조합(§2) + 비동기 재생성(§3) + 초기 적재 연동(§3.5) |
| 시드 데이터 수집 계획 | `docs/05-design-detail/seed-data-plan.md` | 수집 대상, 수량, 품질 기준 |
