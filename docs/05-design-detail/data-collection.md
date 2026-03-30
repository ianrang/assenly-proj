# MVP 데이터 수집 설계서

> 버전: 2.0
> 작성일: 2026-03-24
> 성격: MVP(v0.1) 도메인 데이터 수집의 종합 설계 — 소스, 법적 검토, 큐레이션, 파이프라인, 리스크
> 정본 참조: schema.dbml (DB), PRD.md (요구사항), data-strategy.md (PoC 결정), data-pipeline.md (ETL)
> 범위: DOM-1 쇼핑 + DOM-2 시술 (7 엔티티 + 3 junction)
> 법적 범위: 본 문서는 **도메인 데이터 소스의 법적 리스크**만 다룬다. 사용자 개인정보보호법(PIPA)/위치정보법은 별도 문서 소관.
>
> **기존 결정과의 관계**: 본 문서는 data-strategy.md(U-6, U-8)의 "카카오 API + 수동 보완 혼합" 결정을 **확장**한다. S3~S7(식약처 3종, EU CosIng, 쿠팡 파트너스)를 신규 소스로 추가. S2(네이버 쇼핑 API)는 약관 7.3③에 의해 확정 제거. 기존 결정의 핵심(카카오 API 주 소스 + 수동 검수 원칙)은 유지.

---

## 목차

1. [서비스 목표와 데이터 수집의 연결](#1-서비스-목표와-데이터-수집의-연결)
2. [비즈니스 모델 검증](#2-비즈니스-모델-검증)
3. [데이터 소스 기술 명세 (6개)](#3-데이터-소스-기술-명세)
4. [법적 리스크 매트릭스](#4-법적-리스크-매트릭스)
5. [큐레이션 전략 — "무엇을 수집하는가"](#5-큐레이션-전략)
6. [엔티티별 수집 상세 (7 + 3 junction)](#6-엔티티별-수집-상세)
7. [파이프라인 아키텍처 (4단계)](#7-파이프라인-아키텍처)
8. [미검증 항목 및 리스크](#8-미검증-항목-및-리스크)
9. [타임라인](#9-타임라인)
10. [설계 결정 요약](#10-설계-결정-요약)

---

# 1. 서비스 목표와 데이터 수집의 연결

## 1.1 에센리의 핵심 목표

한국 방문 외국인 여성 여행객(2040)이 K-뷰티 선택(제품, 시술)을 **AI 대화를 통해 개인화된 추천**으로 쉽고 정확하게 내릴 수 있도록 안내한다.

## 1.2 데이터 확보 단계별 전략 — 3단계 로드맵

### Stage 1 (MVP v0.1): 3채널 수집 + AI 분류 + 전수 검수

**수집 워크플로우**:

```
[Stage 1] 데이터 수집 — 3채널 병렬
  Channel A: 자동 수집
    A-1: 식약처 API (S3/S4/S5) → ingredients 자동
    A-2: 카카오 API (S1) → stores/clinics 자동
    A-3: 시드 크롤링 (Playwright) → products 기본 정보 자동
         1순위: 브랜드 공식 사이트 (cosrx.com, laneige.com, innisfree.com 등)
         2순위: 올리브영 글로벌 (보조 — 약관 리스크 중, 수동검수 경유)
  Channel B: CSV/엑셀 임포트 (구글시트 수동 작성) → 반자동
  Channel C: 관리자 앱 CRUD → 수동
  → RawRecord[] (통합, source 채널 추적)

[Stage 2] AI 처리
  번역(6언어) → 분류(skin_types, concerns + confidence 점수) → 설명 생성
  → EnrichedRecord[] + confidence scores

[Stage 3] 전수 검수 (D-7 준수)
  AI 결과를 CSV export → 구글시트에서 전수 검수
  confidence 점수는 검수 우선순위 참고용 (자동 승인 없음)
  검수 완료 → CSV import → ValidatedRecord[]

[Stage 4] 검증 + 적재 + 임베딩
  zod 검증 → DB UPSERT (FK 순서) → 임베딩 생성
```

**엔티티별 수집 채널**:

| 항목 | Channel A (자동) | Channel B (CSV) | Channel C (수동) |
|------|----------------|----------------|----------------|
| **products** | A-3 시드 크롤링: 브랜드 공식 사이트(1순위) + 올리브영 글로벌(2순위 보조). name_en, brand, price, category, image 수집 | 크롤링 미대상 제품 — 브라우저 참조 → 구글시트 | 개별 보완 |
| **stores/clinics** | A-2 카카오 API(S1) 자동 | — | 수동 보완 |
| **ingredients** | A-1 식약처 API(S3) + CosIng(S6) 자동 | — | AI 보강 + 수동 검수 |
| **treatments/doctors** | — | 구글시트 일괄 | 개별 입력 |
| **purchase_links** | — | 올리브영/쿠팡 링크 (수동) | — |
| **목표** | | 200제품, 50매장, 30클리닉 — 개인화 정확도 우선 | |

> **쿠팡 파트너스 API(S7)**: MVP에서 활성화 불가 (판매 실적 15만원 미달, U-12). **보류 — 수익 발생 후 재검토.** 대체: A-3 시드 크롤링 + Channel B CSV.
> **올리브영 한국(co.kr) 크롤링 불가**: 403 접근 차단. **올리브영 글로벌(global.oliveyoung.com)은 robots.txt /product Allow** — 단, 약관 제14조② 상업적 목적 금지 (U-13). 브랜드 사이트 1순위, 올리브영 글로벌 2순위(보조+수동검수 경유)로 운용.
> **브랜드 공식 사이트**: cosrx.com, laneige.com, innisfree.com 등 robots.txt 크롤링 허용 확인 (P2-V7). 마케팅 목적 사이트로 리스크 낮음.

### AI 처리 상세

| 처리 | 입력 | 출력 | 비용 (200건) |
|------|------|------|------------|
| 번역 (ko→en+4언어) | name_ko, description_ko | 6언어 LocalizedText | ~$1 |
| 분류 (skin_types, concerns) | name + category + brand | 배열 + confidence 0.0~1.0 | ~$2 |
| 설명 생성 | name + brand + category | description_ko/en | ~$2 |
| 리뷰 요약 | 제품 특성 | review_summary ("AI 생성" 면책) | ~$1 |
| **합계** | | | **~$6** |

> confidence 점수는 검수자가 "AI가 얼마나 확신하는가"를 참고하여 검수 우선순위를 정하는 용도. **자동 승인에 사용하지 않음** (D-7: 개인화 핵심 필드 전수 검수).

### 검수 워크플로우

```
AI 처리 완료 → CSV export (enriched-products.csv)
  → 구글시트에서 열기
  → 컬럼: name_ko | brand | skin_types (AI) | confidence | concerns (AI) | confidence | ...
  → 검수자가 AI 결과 확인/수정 (confidence 낮은 건 우선)
  → 검수 완료 시트 → CSV 내보내기 → import → DB 적재
```

**CLI-only 검수 대안**: `scripts/seed/review.ts`로 터미널에서 건별 확인도 가능하나, 200건은 구글시트가 더 효율적.

### MVP = 수익 검증 단계

MVP의 목표는 수익 자체가 아닌 **수익 모델의 검증**이다:
- 에센리 키트: 이메일 수집 → 전환 의향 측정 (실제 판매는 키트 제조 체계 구축 후)
- 제휴 수수료: 어필리에이트 링크 클릭 → 구매 전환율 측정 (트래픽 소량이므로 수익 미미)
- 하이라이트/B2B: v0.2 이후

### Stage 2 (v0.2): 브랜드/업체 셀프 등록

| 항목 | 방법 | 도구 |
|------|------|------|
| **products 확장** | 브랜드사가 제품 등록 양식(엑셀) 작성 → 제출 → 운영팀 검수 → DB 적재 | 제휴업체 앱 (MASTER-PLAN §2.2) |
| **clinics/salons** | 클리닉/살롱이 직접 등록 | 제휴업체 앱 |
| **어필리에이트 피드** | 올리브영/CJ 어필리에이트 약관에서 제품 피드 제공 확인 시 연동 검토 (U-10, U-11) | 확인 후 결정 |
| **목표** | 제품 500+, DOM-3/DOM-4 추가 | |

**Stage 2 전환 조건** (최소 2개 충족):
1. MAU 1,000+ 달성 (브랜드 참여 인센티브로서 트래픽)
2. 수동 입력 공수가 월 40시간 초과 (자동화 필요성)
3. 브랜드/클리닉으로부터 등록 인바운드 문의 발생

**브랜드 유인 전략** (화해는 10M+ 리뷰라는 네트워크 효과가 있지만 에센리 MVP는 트래픽 0):
- "외국인 관광객 대상 노출" — 한국 내 다른 플랫폼에 없는 타깃
- 무료 외국인 소비 트렌드 리포트 제공 (B2B 리포트의 사전 버전)
- 하이라이트 배지 무료 체험 기간

### Stage 3 (v0.3+): 피드 자동화 + 사용자 기여

| 항목 | 방법 |
|------|------|
| **제품 피드** | 어필리에이트 약관에서 제품 피드 제공이 확인된 경우에만 API 연동 (U-10, U-11 결과 의존) |
| **사용자 기여 (UGC)** | 사용자가 제품 리뷰 작성 시 신규 제품 등록 제안 → 운영팀 검수 |
| **가격 갱신** | 어필리에이트 피드 또는 수동 분기 갱신 |
| **목표** | 제품 1000+, 수동 의존도 감소 |

**Stage 3 전환 조건**:
1. MAU 10,000+ 달성
2. 어필리에이트 제품 피드 확보 확인 (U-10, U-11)
3. 브랜드 셀프 등록 10건+ 달성

### 어필리에이트 프로그램과 제품 데이터

어필리에이트 프로그램은 **구매 트래킹 링크 + 커미션**을 제공하는 것이 핵심이며, 제품 마스터 데이터(이름, 가격, 성분, 이미지) 사용 허가가 자동으로 포함되는 것은 **아닐 수 있다**. 프로그램별로 제공 범위가 다르므로 개별 확인 필요.

| 어필리에이트 | 확인된 제공 범위 | 제품 데이터 제공? | 상태 |
|------------|---------------|----------------|------|
| **쿠팡 파트너스** | **Search API** (제품명, 가격, 이미지, 카테고리, 구매링크), 딥링크 API, 베스트 카테고리 API | **제공 (공식 API)** | **MVP 적용 (U-12 활성화 조건 확인)** |
| 올리브영 글로벌 (Involve Asia) | 배너, 트래킹 링크, 리포팅 도구 | **미확인 (U-11)** — 약관 원문에서 제품 정보 사용 범위 확인 필요 | 가입 후 확인 |
| CJ 네트워크 | 제품 피드 API (제품명, 가격, 이미지URL, 설명, 카테고리) | **가능 (CJ 가맹사에 한함)** — 올리브영이 CJ 가맹사인지 미확인 (U-10) | 미확인 |

> **주의**: "어필리에이트 가입 = 제품 데이터 자유 사용"이라는 전제는 과대 해석 가능. 어필리에이트는 **구매 링크 제공이 핵심**이며, 제품 데이터는 별도 약관/라이선스일 수 있음.

> **MVP 액션**: (1) 올리브영 글로벌 어필리에이트 가입 (소셜미디어 계정 필요) → 승인 후 약관에서 제품 정보 사용 범위 확인 (U-11). (2) purchase_links에 트래킹 코드 포함. (3) **제품 데이터 자체는 수동 큐레이션이 주 경로**. 어필리에이트 데이터는 보조.

### 네이버 쇼핑 API — 확정 판정 (약관 원문 확인 완료 2026-03-24)

**네이버 API 서비스 이용약관 (2018.07.18 개정, 2020.03.05 시행) 원문 확인 결과:**

제7.3조③: "API서비스를 이용하여 취득한 정보를 무단으로 복제, 저장(캐시 포함), 가공, 배포 등 이용" 금지. 예시에 **"네이버 지역정보를 수집하여 별도 데이터베이스로 관리하며 이용하는 행위"** 명시.
제8조: "결과 데이터의 저작권 등 제반 권리는 회사 또는 원저작자에게" 귀속.
나.2조: "검색결과를 독립적으로 노출. 다른 내용 삽입·왜곡 금지."

| 사용 방식 | 허용? | 근거 |
|----------|------|------|
| API 결과를 자체 DB에 적재 (자동/수동 불문) | **불가** | 7.3③ "별도 데이터베이스로 관리" 명시 금지 |
| API로 검색 → 관리자가 CSV에 전사 | **불가** | 동일. 수동 전사도 "API 취득 정보의 저장" |
| API 결과를 사용자에게 실시간 표시 | **제한적** | 나.2 "독립 노출" + 7.3④ "광고 금지" |
| **브라우저에서 네이버 쇼핑 웹사이트 수동 검색 → 참조** | **허용** | API 이용 아님. 약관 적용 범위 외 |

**→ S2(네이버 쇼핑 API) 파이프라인 프로바이더 확정 제거. products는 브라우저 수동 참조 + CSV 입력 + AI 보강.**

## 1.3 데이터 수집의 4대 원칙

| 원칙 | 설명 | 근거 |
|------|------|------|
| **개인화 정확도 > 데이터 양** | 부정확한 1000개보다 정확한 200개가 서비스 가치에 직결 | PRD VP-3 |
| **관광객 접근 가능한 데이터** | 서울 오프라인 매장에서 살 수 있는 제품, 외국인 서비스 가능 클리닉 우선 | PRD §1.4 |
| **수익 모델 직결 데이터 우선** | purchase_links(제휴 수수료), 키트 구성 데이터(skin_types × ingredients) | PRD §2.3 |
| **안전성 = 신뢰 = 브랜드** | 식약처 검증 + 사용제한 원료 체크 → 서비스 신뢰도 차별화 | MASTER-PLAN R-13 |

## 1.3 수익 모델별 필수 데이터

| 수익 모델 | 핵심 데이터 | 품질 중요도 |
|----------|-----------|-----------|
| **에센리 키트 판매** | products.skin_types, concerns, key_ingredients, product_ingredients | 최상 — 키트 구성의 근거 |
| **제휴 수수료** | products.purchase_links (유효한 외부 링크) | 최상 — 수익 발생 지점 |
| **하이라이트 배지** | *.is_highlighted, *.highlight_badge | 관리자 수동 설정 |
| **B2B 리포트** | behavior_logs, DV-3 세그먼트 | 서비스 운영 후 축적 |

---

# 2. 비즈니스 모델 검증

## 2.1 에센리의 포지션: "K-뷰티 Wirecutter + AI"

에센리는 제품을 직접 판매하지 않고, **에디토리얼 추천 + 외부 구매 링크(어필리에이트)** 모델이다.

| 서비스 | 모델 | 판매자 등록? | 수익 |
|--------|------|-----------|------|
| Wirecutter (NYT) | 에디토리얼 추천 + 어필리에이트 | 없음 | CPA 수수료 |
| 화해 (Hwahae) | 리뷰/성분 분석 + 구매 링크 | 없음 | 광고 + 어필리에이트 |
| 강남언니 (UNNI) | 클리닉 검색/예약 | 클리닉 B2B 등록 | 중개 수수료 |
| **에센리** | AI 개인화 추천 + 외부 링크 | **없음** | 키트 + 어필리에이트 + 배지 |

## 2.2 경쟁 서비스와의 차별화

```
                AI 대화형  개인화  제품+시술+장소  외국인 관광객  한국 현지
화해               x        △       제품만          x            o
강남언니            x        x       시술만          o            o
Picky              x        x       제품만          o            x
아모레 AIBC        o        o       자사 제품만      x            x
NOL World          x        o       제품+매장       o            o (오프라인)
SkincareLens       x        o       제품만          o            x
에센리             o        o       5도메인 통합     o            o
```

**에센리의 유일한 포지션**: AI 대화 x 개인화 x 5도메인 통합 x 외국인 관광객 x 한국 현지 — 이 조합을 만족하는 서비스 없음.

> 범례: o = 지원, x = 미지원, △ = 제한적 지원 (예: 화해의 "개인화"는 피부타입 필터링만 제공하며 AI 대화 기반 동적 개인화는 아님)

## 2.3 법적 분류

| MVP 행위 | 법적 분류 | 등록 필요? |
|---------|---------|----------|
| AI 대화로 제품 정보 제공 | 정보제공 서비스 | 통신판매업 불필요 |
| 외부 쇼핑몰 링크 제공 (F2) | 어필리에이트/중개 | 어필리에이트 고지 필요 |
| 시술 정보 제공 | 정보제공 (의료 조언 아님) | 면책 문구 필수 |
| 웹 서비스 운영 | 부가통신사업 | **부가통신사업자 신고 필요** (전기통신사업법 제22조) |
| 에센리 키트 직접 판매 (후기) | 통신판매 | 키트 판매 시작 시 통신판매업 신고 필요 |

---

# 3. 데이터 소스 기술 명세

## 3.1 소스 전체 구성

| # | 소스 | 역할 | 법적 상태 | 비용 |
|---|------|------|---------|------|
| S1 | 카카오 로컬 API | 장소 주 소스 (stores, clinics) | 공식 API. 상업적 이용 조건부 허용 | 무료 (일 30만건) |
| ~~S2~~ | ~~네이버 쇼핑 API~~ | ~~제품 후보 수집~~ | **약관 7.3③에 의해 DB 구축 목적 사용 불가 (U-5 확정)** | ~~제거~~ |
| **S7** | **쿠팡 파트너스 API** | **제품 자동 수집 (products)** | 어필리에이트 계약. 제품 데이터 제공이 API의 본래 목적 | 무료 (Search 1시간 10회) |
| S3 | 식약처 원료성분정보 API | 성분 주 소스 (ingredients) | 공공데이터. 상업적 이용 가능 | 무료 |
| S4 | 식약처 사용제한 원료정보 API | 성분 안전성 검증 | 공공데이터. 상업적 이용 가능 | 무료 |
| S5 | 식약처 기능성화장품 보고품목 API | 제품 등록 검증 | 공공데이터. 상업적 이용 가능 | 무료 |
| S6 | EU CosIng DB (CSV) | 성분 INCI 표준화 + function 보강 | EU 공개 데이터. 상업적 이용 가능 | 무료 |

## 3.2 S1: 카카오 로컬 API

> 대상: stores, clinics | PoC: P0-33 검증 완료

**엔드포인트**: `GET https://dapi.kakao.com/v2/local/search/keyword.json`
**인증**: 헤더 `Authorization: KakaoAK {REST_API_KEY}`

### 필드 매핑

| 카카오 필드 | DB 컬럼 | 변환 |
|------------|---------|------|
| place_name | name -> {ko: ...} | name.en = LLM 번역 |
| road_address_name | address -> {ko: ...} | address.en = LLM 번역 |
| x, y | location | `POINT(x y)` PostGIS. parseFloat 필수 |
| category_name | store_type / clinic_type | 분류 함수 (P0-33 classifyPlace 계승) |
| phone | external_links[] | {type: 'phone', url: 'tel:...'} |
| place_url | external_links[] | {type: 'kakao_map', url: ...} |

### 수집 불가 필드 (수동/AI 보완)

operating_hours, english_support, tourist_services, foreigner_friendly, description, images, rating, review_count, nearby_landmarks, payment_methods

### Rate Limit

일 300,000건. MVP 예상 ~274건 (일일 한도의 0.1%).

### 데이터 품질 우려

- 카테고리 모호성: "가정,생활 > 화장품"이 매장/도매상 미구분 → place_name 보조 분류
- 폐업 미반영 지연: 1~4주 → 2회 연속 미반환시 temporarily_closed
- 좌표 string 타입: parseFloat() 변환 필수
- 중복: "올리브영 강남점" vs "OLIVE YOUNG 강남" → 좌표 근접도(50m) 기반 감지

### 중복 제거

1차 카카오 id → 2차 place_url → 3차 name.ko + 좌표 50m → 4차 name.ko + address.ko 정규화

### 법적 주의

카카오 API 이용약관 제6조: "카카오 서비스와 경쟁·대체하는 서비스" 금지. 에센리는 지도 서비스가 아닌 뷰티 추천이므로 해당하지 않으나, **좌표/주소를 대량 저장하여 자체 지도처럼 제공하면 위반 소지**. 최종 데이터는 수동 입력/검수를 거쳐 적재하는 것이 안전.

## 3.3 S2: 네이버 쇼핑 API

> 대상: products, brands (보조) | **핵심 주의: 쇼핑 리스팅 반환, 제품 마스터 데이터 아님**

**엔드포인트**: `GET https://openapi.naver.com/v1/search/shop.json`
**인증**: 헤더 `X-Naver-Client-Id` + `X-Naver-Client-Secret`

### 필드 매핑

| 네이버 필드 | DB 컬럼 | 변환 |
|------------|---------|------|
| title | name -> {ko: ...} | **HTML 태그 제거 필수** (`<b>` 등) |
| lprice | price (참조값) | parseInt. **매장 정가로 교체 필요** |
| brand | brands.name -> {ko: ...} | 브랜드 매칭/정규화 |
| category2/3 | category / subcategory | 매핑 테이블 |
| link | purchase_links[] | {platform: mallName, url: link} |
| image | 참조용만 | **DB 적재 금지 — 저작권 이슈** |

### 수집 불가 필드 (전부 수동/AI)

skin_types[], hair_types[], concerns[], key_ingredients, volume, description, english_label, tourist_popular, rating, review_count, review_summary, images (브랜드 공식), product_ingredients, product_stores

### Rate Limit

일 25,000건. MVP 예상 ~4,500건 (일일 한도의 18%).

### 중복 제거 (핵심)

동일 제품이 판매자별 N건 반환됨:
1. productType=2(가격비교)/3(카탈로그) 우선
2. brand + title 정규화 → 제품 고유 키
3. 동일 키 → lprice 최저가 + 첫 이미지 참조
4. 판매자 링크는 purchase_links[]에 복수 수집

### 법적 리스크 — **높음 → MVP 사용 보류 (P2-V1 판정)**

네이버 오픈 API 이용약관의 상업적 이용 조항이 확인되지 않았다 (개발자센터 로그인 필요, 약관 원문 미확인). 가공하여 별도 서비스 구축이 허용되는지 불명확.

**확정 판정: S2 제거.** 약관 7.3③ "별도 데이터베이스로 관리" 명시 금지 (2026-03-24 원문 확인). S7(쿠팡 파트너스) + CSV 수동이 대체 경로.

## 3.4 S3: 식약처 화장품 원료성분정보 API

> 대상: ingredients 기본 레코드 | 공공데이터포털 data.go.kr/data/15111774

**엔드포인트**: `GET https://apis.data.go.kr/1471000/CsmtcsIngdCpntInfoService01/getCsmtcsIngdCpntInfoService01` **(P2-V2 실제 호출 검증 완료 2026-03-25)**
**인증**: `serviceKey` 쿼리 파라미터 (URL 인코딩)
**검색**: `INGR_KOR_NAME` 파라미터만 지원. **INGR_ENG_NAME 파라미터는 필터 미작동 (전체 반환)**.
**일일 한도**: 개발 10,000건/일 (자동승인). 전체 레코드: ~21,696건.
**수집 전략**: 전체 풀 다운로드(~22K건, 페이지네이션) → 로컬 검색이 실용적.

### 필드 매핑 (P2-V2 실제 호출 검증 완료)

| API 필드 (확정) | DB 컬럼 | 변환 |
|---------------|---------|------|
| **INGR_KOR_NAME** | name -> {ko: ...} | 직접 매핑 |
| **INGR_ENG_NAME** | name -> {en: ...} | 직접 매핑. **S6 CosIng INCI name과 동일** → 텍스트 매칭 JOIN 키 |
| **CAS_NO** | (매핑 없음) | **대부분 NULL** (나이아신아마이드, 레티놀 등 주요 성분 모두 null). S6 JOIN 보조키로만 사용 |
| **ORIGIN_MAJOR_KOR_NAME** | (매핑 없음) | 기원/정의 — KB 참고자료로 활용 |
| **INGR_SYNONYM** | (매핑 없음) | 검색 동의어용 |

> **P2-V2 발견 (2026-03-25 실제 호출)**:
> 1. "배합목적" 필드는 이 API에 존재하지 않음. function[] 소스는 S6(CosIng)만.
> 2. **CAS_NO가 대부분 NULL** — 나이아신아마이드(null), 레티놀(null), 하이알루론산(검색결과 0건). 천연추출물 일부만 CAS 보유. → **S6 JOIN 키를 INGR_ENG_NAME ↔ INCI name 텍스트 매칭(1차)으로 변경, CAS_NO는 보조.**
> 3. S3→CosIng 교차 매칭 5/5 성공 (Niacinamide, Retinol, Allantoin, Panthenol, Adenosine).

### 수집 불가 필드

inci_name (S6에서 보강), **function[] 전체 (S6 CosIng + AI)**, caution_skin_types[] (S4+AI+전문가), common_in[] (수동/AI)

### Rate Limit (P2-V2 명세 확인. M1에서 호출 검증)

개발 10,000건/일 (자동승인). 전체 원료 수천 건이나 MVP 100건 타깃 → 개발 계정 충분.

## 3.5 S4: 식약처 화장품 사용제한 원료정보 API

> 대상: ingredients 안전성 보강 | data.go.kr/data/15111772

**엔드포인트 (P2-V2 검증 완료)**:
- 기본 조회: `GET https://apis.data.go.kr/1471000/CsmtcsUseRstrcInfoService/getCsmtcsUseRstrcInfoService`
- 배합금지국가 조회: `GET https://apis.data.go.kr/1471000/CsmtcsUseRstrcInfoService/getCsmtcsUseRstrcNatnInfoService`

S3 레코드에 대한 LEFT JOIN enrichment. 단독 레코드 생성하지 않음.

### 실제 응답 필드 (P2-V2 실제 호출 검증 완료 2026-03-25)

| 필드명 (확정) | 설명 | 활용 |
|-------------|------|------|
| **REGULATE_TYPE** | 구분 (금지/제한). **API 파라미터 필터 미작동** — 전체 다운로드 후 클라이언트 필터링 필요 | 분류 참고 |
| **INGR_STD_NAME** | 표준명 | S3 INGR_KOR_NAME과 JOIN 키 |
| **INGR_ENG_NAME** | 영문명 | S3 INGR_ENG_NAME과 매칭 (S3 CAS_NO NULL 대응) |
| **CAS_NO** | CASNo | S3/S6 매칭 보조 (S4에는 CAS 존재) |
| **COUNTRY_NAME** | 배합제한국가 | 외국인 대상 참고 정보 |
| **NOTICE_INGR_NAME** | 고시원료명 | |
| **PROVIS_ATRCL** | 단서조항 | |
| **LIMIT_COND** | 제한사항 | **LLM → caution_skin_types 추론 입력** |

### 핵심 활용

**LIMIT_COND**(제한사항) 텍스트를 LLM에 입력 → dry/oily/combination/sensitive/normal 중 주의 필요 피부타입 추론 → **전문가 검수 필수**.

### Rate Limit + 수집 전략

개발 10,000건/일 (S3과 동일). **전체 31,191건** — 국가별 중복 포함 (동일 원료 × 국가별 규정). 유니크 원료 수백~수천 건 수준. **수집 전략: 전체 다운로드(페이지네이션) → 클라이언트에서 REGULATE_TYPE 필터링 + 한국/EU 우선.**

## 3.6 S5: 식약처 기능성화장품 보고품목 API

> 대상: products 교차 검증 | data.go.kr/data/15095680

**엔드포인트 (P2-V2 검증 완료)**: `GET http://apis.data.go.kr/1471000/FtnltCosmRptPrdlstInfoService/getRptPrdlstInq`
**검색 파라미터**: `item_name`(품목명), `item_seq`(품목일련번호), `cosmetic_report_seq`(보고일련번호)

### 실제 응답 필드 (P2-V2 명세 확인. M1에서 호출 검증)

| 필드명 (확정) | 설명 | 설계서 추정과 차이 |
|-------------|------|-----------------|
| **ITEM_NAME** | 품목명 | 추정 PRDUCT_NM → **실제 ITEM_NAME** |
| **ENTP_NAME** | 업소명 | 추정 ENTRPS_NM → **실제 ENTP_NAME** |
| **MANUF_NAME** | 제조원 | 설계서 미예측 — 추가 정보 |
| **REPORT_DATE** | 보고일자 | ✓ 일치 |
| **COSMETIC_REPORT_SEQ** | 보고일련번호 | ✓ 일치 |
| **EFFECT_YN1~3** | 효능효과 Y/N 플래그 | 추정 FNLT_TP_NM(텍스트) → **실제 Y/N 플래그** |
| **SPF, PA** | 자외선차단지수 | 설계서 미예측 — 자외선차단 제품 추가 정보 |

### 활용 방식 (생성이 아닌 검증)

1. 수동으로 products 생성
2. `item_name` 파라미터로 S5 검색 (퍼지 매칭)
3. 매칭 시: EFFECT_YN1~3 확인 → tags에 "functional:미백/주름개선/자외선차단" 추가
4. SPF/PA 값이 있으면 제품 메타데이터 보강
5. 미매칭 = 비기능성 제품 (정상)

### 주의

- 기능성화장품(미백/주름개선/자외선차단)만 대상. 일반 화장품 조회 불가
- ITEM_NAME ≠ 시장 판매명 → 퍼지 매칭 필요
- ENTP_NAME ≠ 소비자 브랜드명 (OEM 가능)

**MVP 결정: 사전 배치 검증만. "동적 보강"(대화 중 실시간 검색)은 v0.2로 연기.**

## 3.7 S6: EU CosIng DB (CSV)

> 대상: ingredients INCI 표준화 + function 보강

**접근**: CSV 1회 다운로드. 28,705 INCI 항목 (Wayback Machine 2020-12-30 버전 확보 완료, P2-V4). 컬럼: COSING Ref No, INCI name, INN name, Ph. Eur. Name, CAS No, EC No, Chem/IUPAC Name / Description, **Restriction**, **Function**, Update Date.
**라이선스**: EU Open Data — 상업적 사용 가능.

### 매핑 (P2-V4 검증 완료 2026-03-25)

| CosIng 컬럼 | DB 컬럼 | 변환 |
|-------------|---------|------|
| **INCI name** | inci_name | 직접 매핑. **S3 INGR_ENG_NAME과 텍스트 매칭 (1차 JOIN 키)** |
| CAS No | (매핑 없음) | S3 매칭 보조 (S3 CAS_NO가 대부분 NULL이므로 2차) |
| **Function** | function[] 보강 | MOISTURISING → moisturizing 등. 30/30 성분 보유 확인 |
| **Restriction** | (참조) | 사용제한 규정 참조 (7/30 주의 성분에 존재) |

> **P2-V4 검증 결과 (2026-03-25)**: K-뷰티 대표 30개 성분 INCI 매칭률 **100%** (30/30). Function 필드 30/30 보유. 다만 "SKIN CONDITIONING"이 22/30으로 포괄적 — AI 보강으로 구체화 필요.

### ingredients 3원 소스 결합 순서 (JOIN 키 변경 반영)

```
S3 원료성분 → 기본 레코드 (name.ko, name.en)
  ↓ INGR_ENG_NAME ↔ INCI name 텍스트 매칭 (1차) + CAS_NO (보조, 있을 때만)
S6 CosIng → inci_name + function + restriction 보강
  ↓ INGR_ENG_NAME/CAS_NO 매칭
S4 사용제한 → 안전성 플래그 + caution_skin_types 도출
  ↓
LLM 번역 + 분류 → 다국어 + function 뷰티 용어 변환 (SKIN CONDITIONING 구체화)
  ↓
전문가 검수 → function, caution_skin_types 최종 확정
```

---

# 4. 법적 리스크 매트릭스

| 소스 | 리스크 등급 | 핵심 이슈 | 권장 조치 |
|------|-----------|---------|---------|
| S1 카카오 API | **중** | 데이터 영구 저장 시 "DB 구축 행위" 해당 가능 | API 데이터는 검증 도구로만 사용. 최종 데이터는 수동 입력으로 처리. "Powered by Kakao" 표시 |
| ~~S2 네이버 쇼핑 API~~ | **확정 제거** | 약관 7.3③ "별도 데이터베이스로 관리" 명시 금지 (U-5) | **사용 안 함** |
| S3 식약처 원료성분 | **낮** | 공공데이터법 적용. 공공누리 유형 확인 | 출처 표시: "출처: 식품의약품안전처" |
| S4 식약처 사용제한 | **낮** | 동일 | 동일 |
| S5 식약처 보고품목 | **낮** | 동일 | 동일 |
| S6 EU CosIng | **극히 낮** | EU 공개 데이터 | 출처 표시 권장. EU/한국 규정 차이 고지 |
| ~~S7 쿠팡 파트너스~~ | **보류** | 판매 실적 15만원 미달 → API 비활성 (U-12) | **MVP 보류. 수익 발생 후 재검토** |
| **A-3 브랜드 공식 사이트** | **낮** | 마케팅 목적 사이트. robots.txt 허용. 결제 자동화만 금지 (cosrx.com) | Crawl-delay 준수, User-Agent 명시, 출처 표시 |
| **A-3 올리브영 글로벌** | **중** | robots.txt /product Allow. 단, 약관 제14조② "상업적 목적 데이터 사용 금지" (U-13) | **2순위 보조. 크롤링 결과 직접 DB 적재 안 함 → Stage 3 수동검수 경유. 출처+링크 표시** |

### 어필리에이트 고지 의무

추천·보증 등에 관한 표시·광고 심사지침(공정거래위원회 심사지침) 제5조:
- 외부 링크에 "이 링크를 통한 구매 시 에센리가 수수료를 받을 수 있습니다" 표시 필수
- 링크 근처에 명확히 표시

### 시술 추천 면책 (의료법 제27조)

모든 시술 관련 응답에 필수:
> "This information is for general reference only and does not constitute medical advice. Please consult with a qualified dermatologist or physician before undergoing any procedure."

### 이미지 저작권 정책 (P2-V3 검증 완료 2026-03-26)

| 소스 | 사용 가능? | 근거 |
|------|----------|------|
| 아모레퍼시픽 3사 (이니스프리/라네즈/설화수) | **서면 승인 필요** | 약관: "personal, non-commercial use" 전용. 복제/배포는 "prior written or electronic approval" 필수 (AMOREPACIFIC US, Inc.) |
| 코스알엑스 (COSRX) | **불명확** | 약관 JS 렌더링으로 원문 추출 불가. Pressat 프레스 포털 존재 (cosrx.pressat.co.uk). PR 문의 필요 |
| 미샤 (MISSHA) | **서면 승인 필요** | 약관: "may not be used ... without prior written permission" (MISSHA US, Inc.) |
| ~~브랜드 공식 프레스킷~~ | ~~가능~~ | ~~묵시적 프로모션 라이선스~~ → **P2-V3에서 부정**: 5개 브랜드 중 셀프서비스 프레스킷 0개. "묵시적 허용" 근거 없음 |
| 네이버 쇼핑 이미지 | **불가** | 판매자 저작물. 네이버 이용약관 제17조 |
| 자체 촬영 | **가능** | 완전 소유 |
| AI 생성 이미지 | **부적합** | 실제 제품 묘사 시 오인 유발 가능 |
| **placeholder (브랜드 색상+텍스트)** | **가능** | 저작권 무관. MVP 기본 전략 |

> **P2-V3 결론**: 5개 브랜드 중 4개가 약관에서 상업적 사용 금지 명시, 1개 불명확. 업계 관행은 "브랜드 직접 제출" 모델 (화해, Picky). **MVP는 placeholder 전략. 브랜드 서면 승인 획득 시 순차 전환.**

---

# 5. 큐레이션 전략

## 5.1 Products (200+) 선정 기준

### 카테고리 배분

| 카테고리 | 비율 | 수량 | 근거 |
|----------|------|------|------|
| Skincare | 55% | 110개 | K-뷰티 핵심. concerns 11개 + skin_type 5개 커버 |
| Makeup | 20% | 40개 | 립틴트/쿠션 등 K-뷰티 시그니처 |
| Haircare | 10% | 20개 | UP-2 대응. DOM-3 준비 |
| Bodycare | 10% | 20개 | 선크림 등 여행 필수 |
| Tools | 5% | 10개 | 기념품 성격 |

### 가격대 배분 (JC-4 매핑)

| budget_level | KRW 기준 | 비율 | 수량 |
|-------------|---------|------|------|
| budget | <₩30,000 | 30% | 60개 |
| moderate | ₩30,000~80,000 | 35% | 70개 |
| premium | ₩80,000~200,000 | 25% | 50개 |
| luxury | >₩200,000 | 10% | 20개 |

### 커버리지 요구사항

- **skin_type**: 모든 5개 타입에 skincare 40개+ 적합 제품. 단, sensitive는 전용 제품 수가 적으므로 **최소 30개** 허용 (예외). normal은 대부분 제품이 해당하므로 100개+ 예상. 110개 skincare × 평균 ~1.8 타입/제품 = ~200 쌍으로 5타입 커버 검증 필요.
- **concerns**: 11개 풀 각각에 최소 5개+ 제품 (1순위 7개는 15개+)
- **관광객 접근성**: 올리브영/시코르 구매 가능 70%+ (140개+)
- **브랜드**: 50+ 유니크 브랜드, K-뷰티 90%+, 브랜드당 최대 8개

### 인기도 시그널 소스 (크롤링 없이)

- 올리브영 공식 랭킹 (웹사이트 수동 확인)
- 화해/글로우픽 앱 내 랭킹 (수동 확인)
- YouTube/TikTok "best K-beauty for tourists" 검색 (수동)
- Reddit r/AsianBeauty 상위 게시물 (수동)
- 에센리 도메인 전문가 직접 큐레이션

## 5.2 Stores (50+) 선정 기준

| 지역 | 수량 | 매장 유형 | 수량 |
|------|------|---------|------|
| 명동 | 10 | olive_young | 20 |
| 강남 | 8 | brand_store | 12 |
| 홍대 | 7 | department_store | 8 |
| 이태원 | 5 | chicor | 5 |
| 잠실 | 4 | pharmacy | 2 |
| 성수 | 4 | other | 3 |
| 여의도 | 3 | | |
| 동대문 | 3 | | |
| 압구정 | 3 | | |
| 기타 | 3 | | |

## 5.3 Clinics (30+) 선정 기준

| 지역 | 수량 | 클리닉 유형 | 수량 |
|------|------|-----------|------|
| 강남 | 12 | dermatology | 12 |
| 압구정/청담 | 8 | aesthetic | 8 |
| 명동 | 4 | plastic_surgery | 6 |
| 신사 | 3 | med_spa | 4 |
| 기타 | 3 | | |

**필수 조건**: english_support >= basic 100%, overseas_card = true 100%

## 5.4 Treatments (50+)

| category | 수량 | 선택 기준 |
|---------|------|---------|
| laser | 15 | K-뷰티 핵심 시술 |
| skin | 10 | 기본 피부 관리 |
| injection | 10 | 외국인 인기 |
| facial | 8 | 관광 체험형 |
| body | 4 | 소수 |
| hair | 3 | 두피 케어 |

downtime_days 다양성: 0일 20개+, 1~3일 15개+, 4일+ 10개+

## 5.5 Ingredients (100+), Brands (50+), Doctors (30+)

- **Ingredients**: 시드 제품 200개의 핵심 활성 성분 50개 + KB 교육 성분 30개 + 주의 성분 20개+
- **Brands**: budget 15+, moderate 15+, premium 10+, luxury 5+, indie 5+
- **Doctors**: 클리닉당 최소 1명, languages에 영어 포함 100%

## 5.6 카카오 API 검색 쿼리 전략

### Stores (80회 검색)

- "{지역} 올리브영" x 10개 지역 = 10회
- "{지역} 시코르" x 5 = 5회
- "{지역} 화장품" x 10 = 10회
- "올리브영 {구체 지역}" x 7 (강남역, 명동, 홍대 등) = 7회
- 브랜드 플래그십/백화점 특정 검색 = 20회
- 기타 = 28회

### Clinics (57회 검색)

- "{지역} 피부과" x 8 = 8회
- "{지역} 에스테틱/클리닉" x 5 = 5회
- "{지역} 성형외과" x 3 = 3회
- "외국인 진료 피부과 서울" 등 특정 = 15회
- 기타 = 26회

**총 API 호출**: ~274회 (일일 한도 300,000의 0.1%)

---

# 6. 엔티티별 수집 상세

## 6.1 price 필드 정의

### 문제

동일 제품이 올리브영 매장(₩34,000), 올리브영 온라인(₩28,000), 네이버 쇼핑 최저가(₩25,500)로 가격이 다름. 어떤 API로도 "매장 정가"를 자동 수집할 수 없음.

### 결정: "참조 가격(approximate retail price)"

- **의미**: 주요 오프라인 매장(올리브영/시코르)의 정상 판매가 기준
- **소스**: 네이버 쇼핑 lprice를 참고 → 관리자가 매장 정가로 조정
- **UI 표시**: "약 ₩28,000" 또는 가격 옆 "Approx." 표시
- **면책**: "가격은 참고용이며 매장에 따라 다를 수 있습니다" (카드 레벨)
- **갱신**: 분기 1회. 20% 이상 변동 시 즉시 업데이트

## 6.2 product_stores 관계 재정의

### 문제

"특정 매장에 재고 있음"은 보장 불가. 올리브영 앱에서만 매장별 재고 확인 가능하며, 외부 API 없음.

### 결정: 혼합 매핑 (유형 기반 + 개별)

| 매장 유형 | 매핑 방식 | 이유 |
|----------|----------|------|
| olive_young, chicor | **유형 기반** (모든 해당 매장에 일괄 연결) | 재고 표준화 높음 |
| department_store, brand_store | **개별 매장** 기반 | 입점 브랜드가 지점별 상이 |
| pharmacy, other | **개별 매장** 기반 | 소수이므로 수동 관리 |

**사용자 표시**: "Available at Olive Young stores" (유형 기반) 또는 "Available at Lotte Department Store Myeongdong" (개별)

**예상 레코드**: ~2,700건 (유형 기반 일괄 매핑 포함)

> **교차 문서 갱신 필요**: seed-data-plan.md §2.1의 product_stores ~500건 추정은 개별 매핑 기준. 본 문서의 혼합 매핑(유형 기반 + 개별) 채택 시 ~2,700건으로 증가. seed-data-plan.md를 본 문서 확정 후 동기화 필요. 정본: **본 문서 §6.2**.

## 6.3 엔티티별 자동/수동 비율 요약

| 엔티티 | 자동 수집 (API) | AI 보강 | 수동 보완 | 자동화율 |
|--------|---------------|---------|---------|---------|
| stores | name, address, location, district, links, type | 번역(6언어), description | operating_hours, english_support, tourist_services, images, rating | ~50% |
| clinics | name, address, location, district, links, type | 번역, description | foreigner_friendly, license_verified, images, rating | ~45% |
| products | **A-3 시드 크롤링**: name_en, brand, price_reference, category, image. 브랜드 사이트(1순위)+올리브영 글로벌(2순위 보조) | 번역, skin_types, concerns (**→ 전수 검수 D-7**), description, review_summary | name_ko, 매장 정가 보정, volume, english_label, key_ingredients | ~35% |
| brands | name (A-3 또는 CSV에서 추출) | 번역 | origin, tier, specialties | ~30% |
| ingredients | name.ko, name.en, CAS (S3) + inci_name (S6) + 제한 여부 (S4) | function 변환, caution 추론, 번역 | caution_skin_types 검수, common_in | ~50% |
| treatments | — | 번역, target_concerns, suitable_skin_types, description | 전 필드 수동 입력 (의학 정보) | ~25% |
| doctors | — | 번역 | 전 필드 수동 입력 | ~5% |

---

# 7. 파이프라인 아키텍처

## 7.0 에러 격리 정책

| 범위 | 정책 | 구현 |
|------|------|------|
| **프로바이더 간** | S1 실패해도 S7 독립 실행 | `Promise.allSettled` 사용. 실패 프로바이더 로그 + 스킵 |
| **AI enrichment 건별** | 200건 중 1건 실패 시 해당 건만 스킵 | 건별 try-catch. 실패 건 `enrichment_status: 'failed'` 마킹 → 수동 보완 |
| **Stage 간 임계치** | 이전 Stage 최소 성공률 50% 미달 시 중단 | Stage 2에서 100건 시도 → 50건 미만 성공 시 원인 조사 후 재실행 |
| **DB 적재** | 엔티티 타입별 독립 트랜잭션, 100건 단위 청크 | 청크 실패 시 해당 청크만 롤백 (data-pipeline.md §3.4.2 계승) |

## 7.1 4단계 워크플로우

```
Stage 1: 데이터 수집     → RawRecord[] (3채널: A-1~3 자동 / CSV 임포트 / 관리자 수동)
Stage 2: AI 처리        → EnrichedRecord[] (번역, 분류+confidence, 설명 생성)
Stage 3: 전수 검수       → ValidatedRecord[] (CSV export → 구글시트 검수 → CSV import)
Stage 4: 검증+적재+임베딩 → DB rows + embedding vectors

[M3 이후] 품질 검증 도구: 커버리지 갭 분석 (skin_type × concern × budget 교차)
```

## 7.2 코드 아키텍처 — 2단계 전략

### scripts/의 DAG 내 위치

CLAUDE.md 4계층 DAG에서 `scripts/`는 **DAG 외부의 보조 Composition Root**이다. `app/`과 동일한 조합 루트 자격:

- `scripts/ → server/core/, shared/` : 허용 (app/과 동일 방향)
- `server/ → scripts/` : **금지** (역방향)
- `client/ → scripts/` : **금지** (역방향)

> CLAUDE.md P-9에 이미 정의됨.

### `server-only` guard 정책

`server/core/` 파일은 L-0a에 따라 `import 'server-only'`가 있다. CLI(`npx tsx`) 실행 시 `server-only`는 Node.js 환경에서 noop으로 동작하므로 에러 없음. 이는 패키지의 설계 의도(브라우저 번들 방지)와 일치하며, CLI는 브라우저가 아니므로 정상 동작이다.

### 파이프라인 전용 환경변수

| 변수 유형 | 위치 | 근거 |
|----------|------|------|
| 파이프라인 전용 (KAKAO_API_KEY, NAVER_CLIENT_ID, MFDS_SERVICE_KEY) | `scripts/seed/config.ts` | 런타임 서비스에서 미사용. core 범위 확장 방지 (P-2) |
| 공통 (SUPABASE_URL, LLM_API_KEY) | `server/core/config.ts` 참조 | 런타임 + 파이프라인 양쪽 사용 |

### Phase 2 초반: CLI 전용

```
scripts/seed/                          ← CLI 진입점 (보조 Composition Root, P-9)
  ├── config.ts                        ← 파이프라인 전용 env (KAKAO_KEY, MFDS_KEY)
  ├── fetch.ts                         ← Stage 1 CLI (Channel A: API 프로바이더 호출)
  ├── import-csv.ts                    ← Stage 1 CLI (Channel B: CSV/엑셀 임포트)
  ├── enrich.ts                        ← Stage 2 CLI (AI 처리)
  ├── export-review.ts                 ← Stage 3 CLI (AI 결과 → 검수용 CSV export)
  ├── import-review.ts                 ← Stage 3 CLI (검수 완료 CSV → ValidatedRecord)
  ├── validate.ts                      ← Stage 4 CLI (zod 검증)
  ├── load.ts                          ← Stage 4 CLI (DB 적재)
  ├── run-all.ts                       ← 전체 파이프라인
  ├── manifests/                       ← 수집 대상 YAML (큐레이션 리스트)
  └── templates/                       ← CSV 템플릿 (드롭다운 값 정의)
      ├── products-template.csv
      └── treatments-template.csv

scripts/seed/lib/                      ← 파이프라인 비즈니스 로직
  ├── providers/                       ← Stage 1: 데이터 소스별 어댑터
  │   ├── kakao-local.ts               ← S1 (stores/clinics)
  │   ├── web-scraper.ts              ← A-3 (products — Playwright 헤드리스 브라우저)
  │   ├── mfds-ingredient.ts           ← S3 (ingredients — 전체 풀 다운로드)
  │   ├── mfds-restricted.ts           ← S4 (ingredients 안전성)
  │   ├── mfds-functional.ts           ← S5 (products 검증)
  │   ├── cosing-csv.ts                ← S6 (ingredients INCI)
  │   └── csv-loader.ts               ← Channel B (CSV/엑셀 → RawRecord)
  ├── enrichment/                      ← Stage 2: AI 처리
  │   ├── translator.ts                ← 번역 (ko→en+4언어)
  │   ├── classifier.ts                ← 분류 (skin_types, concerns + confidence)
  │   └── description-generator.ts     ← 설명 + 리뷰 요약 생성
  ├── fetch-service.ts                 ← Stage 1 오케스트레이션 (프로바이더 호출, Promise.allSettled)
  ├── enrich-service.ts                ← Stage 2 오케스트레이션 (건별 try-catch)
  ├── review-exporter.ts               ← Stage 3 검수용 CSV 생성 (confidence 포함)
  ├── loader.ts                        ← Stage 4 DB 적재 (FK 순서, 청크 트랜잭션)
  └── types.ts                         ← RawRecord, EnrichedRecord, ValidatedRecord, ClassificationResult

shared/validation/                     ← zod 스키마 (파이프라인 + API 입력 검증 공유)
  ├── product-schema.ts
  ├── store-schema.ts
  └── ...
```

> **A-3 시드 크롤링 포함**: web-scraper.ts(Playwright). 브랜드 공식 사이트(1순위, 리스크 낮음) + 올리브영 글로벌(2순위 보조, 리스크 중 — 수동검수 경유). Crawl-delay 5초 준수. 200건 1회성. 올리브영 한국(co.kr)은 403 차단으로 사용 불가.
> **S2(네이버 쇼핑 API) 확정 제거**: 약관 7.3③ "별도 데이터베이스로 관리" 명시 금지.
> **S7(쿠팡 파트너스) MVP 보류**: 판매 실적 15만원 미달 → API 비활성. 수익 발생 후 coupang-partners.ts 구현 예정.
> **AI 큐레이션(gap-analyzer)**: M3 이후 품질 검증 도구로 별도 구현. MVP 파이프라인에 미포함.

shared/validation/                     ← zod 스키마 (파이프라인 + API 입력 검증 공유)
  ├── product-schema.ts
  ├── store-schema.ts
  └── ...

### Phase 2 중반: 관리자 앱 통합 시 (로직 이동)

관리자 앱 동기화 기능 구현 시, `scripts/seed/lib/` 로직을 `server/features/pipeline/`으로 **이동**:

```
server/features/pipeline/              ← import 'server-only' 추가. L-0a 준수.
  ├── providers/, enrichment/, services, loader, types
  └── config.ts                        ← 파이프라인 전용 env (core/config.ts와 분리)

scripts/seed/                          ← thin CLI (server/features/pipeline/ 호출만)
app/api/admin/sync/route.ts            ← 동일 server/features/pipeline/ 호출
```

이 시점에서 `scripts/seed/lib/`는 삭제. 양쪽(CLI + 관리자 API)이 동일 로직을 사용.

### Import 규칙 (Phase 2 초반 기준)

| 소스 | 허용 import | 금지 import |
|------|-----------|-----------|
| `scripts/seed/*.ts` (CLI) | `scripts/seed/lib/*`, `server/core/*`, `shared/*` | `server/features/*`, `client/*` |
| `scripts/seed/lib/providers/*` | `lib/types.ts`, `shared/types/*`, HTTP API | `server/core/*`, `server/features/*` |
| `scripts/seed/lib/enrichment/*` | `lib/types.ts`, `server/core/ai-engine.ts`, `shared/*` | `server/features/*` |
| `scripts/seed/lib/loader.ts` | `lib/types.ts`, `server/core/db.ts`, `shared/*` | `server/features/*` |
| `scripts/seed/lib/types.ts` | `shared/types/*` | 그 외 전부 |
```

## 7.3 실행 환경 (단계적 전환)

| 시점 | 환경 | 진입점 | 로직 위치 |
|------|------|--------|----------|
| Phase 2 초반 | CLI | `npx tsx scripts/seed/run-all.ts --milestone=M1` | `scripts/seed/lib/` |
| Phase 2 중반 | CLI + 관리자 앱 | CLI 동일 + `POST /api/admin/sync` | `server/features/pipeline/` (이동 후) |

## 7.4 수집 순서 (FK 의존성)

```
Phase A (병렬): brands, ingredients(S3→S6→S4), stores(S1), clinics(S1), treatments
Phase B (A 완료 후): products(S7 쿠팡 파트너스 + 수동), doctors
  ※ S7 미활성 시: products 전량 수동+CSV (폴백)
Phase C (B 완료 후): product_stores, product_ingredients, clinic_treatments
Phase D (C 완료 후): 임베딩 배치 생성
Phase E (B 완료 후, Phase C와 병렬 실행 가능): S5 교차 검증
```

---

# 8. 미검증 항목 및 리스크

| ID | 항목 | 리스크 | 잘못되면 영향 | 검증 시점 | 검증 방법 |
|----|------|--------|------------|---------|---------|
| **U-1** | AI 분류 정확도 (skin_types, concerns) | **높** | 부적합 추천 → 신뢰 상실 | M1 | 10개 제품 AI 분류 → 전문가 대조. 80% 미달 시 수동 전환 |
| **U-2** | 식약처 API 실제 응답 형식 | **확정** | — | **실제 호출 검증 완료 (2026-03-25)** | **P2-V2 완료.** S3/S4/S5 각 1회 실제 호출. 발견: (1) S3 CAS_NO 대부분 NULL → S6 JOIN 키를 INGR_ENG_NAME↔INCI name으로 변경 (2) S3 INGR_ENG_NAME 검색 파라미터 미작동 → 전체 풀 다운로드 방식 (3) S4 REGULATE_TYPE 필터 미작동 → 전체 다운로드+클라이언트 필터 (4) S5 "설화수" 293건 정상 반환, EFFECT_YN1~3 + SPF/PA 확인 (5) 제조업자 API 엔드포인트 미발견 → MVP 불필요 |
| **U-3** | EU CosIng K-뷰티 성분 커버리지 | **확정** | — | **CSV 직접 검증 완료 (2026-03-25)** | **P2-V4 완료.** Wayback Machine에서 공식 CSV 28,705건 다운로드. K-뷰티 대표 30개 성분(핵심활성15+K뷰티특화8+주의7) INCI 매칭률 **100%** (30/30). Function 필드 30/30 보유 (SKIN CONDITIONING 22건으로 포괄적 — AI 보강 필요). Restriction 7/30 보유. S3 INGR_ENG_NAME ↔ CosIng INCI name 교차매칭 5/5 성공. **판정: S6 유효. JOIN 키 변경(CAS→INGR_ENG_NAME 1차)만 반영** |
| **U-4** | ~~네이버 쇼핑 API 중복 제거~~ → **쿠팡 파트너스 API 데이터 품질** | **중** | 제품명 정규화/중복 | M2 | S7(쿠팡) 검색 결과에서 K-뷰티 제품 커버리지 + 중복 패턴 확인. 20개 제품 테스트 |
| **U-5** | **네이버 쇼핑 API 이용 범위** | **확정** | — | **약관 원문 확인 완료 (2026-03-24)** | 약관 7.3③ "별도 데이터베이스로 관리" 명시 금지. **S2 프로바이더 확정 제거.** 제품 데이터는 브라우저 수동 참조 + CSV + AI 보강. API의 정당한 용도(사용자 실시간 검색 표시)는 나.2 조건 내에서 가능하나 MVP 범위 외 |
| **U-6** | 브랜드 이미지 사용 허가 | **확정 — placeholder 전략** | 서면 승인 없이 사용 시 저작권 분쟁 | **P2-V3 완료 (2026-03-26)** | 5개 브랜드 약관 + 업계 관행 조사 완료. **결과**: 4/5 브랜드 상업적 사용 금지 명시 (아모레3사+미샤), 1/5 불명확(COSRX). 업계 표준은 "브랜드 직접 제출" 모델(화해, Picky). "출처 표시 후 사용" 관행 미확인. **확정 전략**: (1) MVP는 placeholder (브랜드 색상+텍스트 카드) (2) A-3 크롤링 시 image_url 수집+DB 저장은 하되 UI 미표시 (3) 아모레퍼시픽 PR팀 서면 승인 요청 (3사 일괄) (4) COSRX Pressat/PR 문의 (5) 승인 획득 시 순차 이미지 전환. v0.2에서 브랜드 셀프 등록 시스템으로 확대 |
| **U-7** | 시술 가격 범위 현실성 | **중** | 50%+ 불일치 시 사용자 불만 | M2 | 5개 클리닉 실제 가격 대조 |
| **U-8** | 네이버 쇼핑 이미지 저작권 | 확정 | — | — | **사용 안 함으로 확정** |
| **U-9** | 올리브영 어필리에이트 승인 소요 시간 + 거부 가능성 | **중** | 승인 지연/거부 시 purchase_links 트래킹 코드 미확보 | **M1 즉시 가입 신청** | Involve Asia에서 올리브영 어필리에이트 가입 신청. 승인 소요 1~4주 예상. 거부 시 올리브영 직접 어필리에이트(global.oliveyoung.com) 재신청 |
| **U-10** | CJ Affiliate Product Feed에 올리브영 제품 포함 여부 | **중** | 미포함 시 Stage 2~3 제품 피드 자동화 전략 무효 | **M1** | CJ Affiliate 네트워크에서 올리브영(CJ 올리브네트웍스) 가맹 여부 확인. CJ Affiliate ≠ CJ 올리브네트웍스 (별도 법인) — 관계 확인 필요 |
| **U-11** | Involve Asia 어필리에이트 약관에서 제품 정보 사용 범위 | **높** | 범위 초과 사용 시 계약 위반 | **어필리에이트 승인 후 즉시** | 약관에서 "제품명, 가격, 이미지" 사용 허가 범위 확인. 배너/링크만 허가될 경우 제품 데이터는 수동 큐레이션이 유일 경로 |
| **U-12** | 쿠팡 파트너스 API 활성화 조건 | **보류** | 판매 실적 15만원 미달 → API 비활성 | **MVP 보류 (2026-03-25)** | 가입 완료. 15만원 실적 미달로 API 비활성 확정. **CSV 폴백 + A-3 시드 크롤링으로 대체.** 수익 발생 후 재검토 |
| **U-13** | 올리브영 글로벌 이용약관 | **확정** | 약관 제14조② 상업적 목적 금지 | **약관 확인 완료 (2026-03-25)** | **P2-V7 완료.** robots.txt /product Allow이나 약관 제14조② 상업적 목적 데이터 사용 금지. 판정: 브랜드 공식 사이트 1순위(리스크 낮음), 올리브영 글로벌 2순위(보조 — 수동검수 경유로 리스크 완화). cosrx/laneige/innisfree robots.txt 크롤링 허용 확인 |

### 리스크 대응 우선순위

```
확정 완료:    U-1 (AI 분류 PoC — 80% PASS, 자동 분류 확정), U-2 (식약처 실제 호출 검증), U-3 (CosIng CSV 직접 검증), U-5 (네이버 약관 확정), U-6 (이미지 — placeholder 확정, D-14), U-8 (네이버 이미지 안 함), U-12 (쿠팡 보류), U-13 (올리브영 글로벌 약관)
M1 보완 필수: U-9 (올리브영 어필리에이트 가입)
M1 후순위:   U-10 (CJ-올리브영), U-11 (올리브영 약관 제품정보) — 수익 발생 후
M2 시점:     U-4 (쿠팡 API 데이터 품질 — 보류), U-7 (가격 현실성)
```

---

# 9. 타임라인

## M1: 스켈레톤 (Phase 2 시작 시) — 각 엔티티 5~10건

| 필요 사항 | 상세 |
|----------|------|
| 수집 로직 | 불필요 — 수동 YAML/JSON 입력 (50건 미만) |
| 검증 | zod 스키마 구현 (shared/validation/) |
| 적재 | scripts/seed/load.ts 기본 구현 |
| 검증 사항 | FK 관계 정상, 임베딩 생성 확인, U-1 AI 분류 시범 10건. ~~U-2 식약처 API 테스트~~ ✅ 완료 |

## M2: 최소 운영 (AI 통합 테스트) — products/stores 50건

| 필요 사항 | 상세 |
|----------|------|
| 자동 수집 | 카카오 API 프로바이더 동작 |
| AI 보강 | 번역 + 분류 + description 전체 파이프라인 |
| 검증 사항 | 검색 쿼리 "moisturizer for dry skin" → 관련 제품 반환. AI 대화 테스트 정상 |

## M3: MVP 출시 (Gate 2 전) — 전체 목표 수량

| 필요 사항 | 상세 |
|----------|------|
| 전체 수량 | products 200+, stores 50+, clinics 30+, treatments 50+, ingredients 100+, brands 50+, doctors 30+ |
| 품질 게이트 | A등급(필수 필드) 100% + B등급(권장 필드) 90% |
| 커버리지 | 모든 skin_type에 skincare 40+ (sensitive 최소 30), 모든 concern에 제품 5+ |
| 다국어 | en 전수 검수 완료, ja/zh/es/fr 10% 샘플 |
| **sensitive 커버리지 별도 점검** | skincare 제품 중 sensitive 적합 제품이 30개 미만이면 추가 큐레이션 실행 |

## 수동 입력 공수 추정

| 엔티티 | 건당 소요 | 건수 | 총 공수 | 비고 |
|--------|---------|------|--------|------|
| products (3채널 + AI + 전수 검수) | ~10분 | 200 | ~35시간 | **A-3 시드 크롤링**: 브랜드 사이트+올리브영 글로벌에서 기본 정보 자동 ~120건(~17분) + CSV 수동 ~80건 + AI 분류 자동 + 전수 검수(구글시트). 크롤링 미대상 제품은 CSV 폴백 |
| stores (수동 보완) | ~10분 | 50 | ~8시간 | API 골격 후 영업시간·영어지원 보완 |
| clinics (수동 보완) | ~15분 | 30 | ~8시간 | foreigner_friendly 상세 확인 필요 |
| treatments (전부 수동) | ~20분 | 50 | ~17시간 | 의학 정보 조사 포함 |
| ingredients (수동 검수) | ~10분 | 100 | ~17시간 | API 데이터 + AI 분류 전수 검수 |
| brands (수동) | ~5분 | 50 | ~4시간 | 간단한 필드 |
| doctors (수동) | ~5분 | 30 | ~3시간 | 클리닉 종속 |
| junction (수동 매핑) | ~2분 | ~500 (수동 대상만) | ~17시간 | 유형 기반 매핑 ~2,200건은 자동 스크립트. 수동은 product_ingredients ~400 + 개별 매장 ~100건 |
| **합계** | | | **~109시간** | **1인 풀타임(8h/일) 약 14일** |

> 3채널 수집(A-3 시드 크롤링 + CSV + 수동) + AI 분류 + 전수 검수(구글시트) 워크플로우. 코딩(~5-7주)과 데이터 입력(~3주)을 병행. M1→M2→M3 단계적 진행. AI 처리 비용 ~$6 (200건 기준).

---

# 10. 설계 결정 요약

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| D-1 | 데이터 소스 구성 | **5개 API(S1,S3~S6) + A-3 시드 크롤링** — S2(네이버) 확정 제거. S7(쿠팡) MVP 보류. 브랜드 사이트 크롤링 추가 | 약관 원문 기반 확정. 모든 소스 무료 |
| D-2 | 수집 파이프라인 실행 환경 | 단계적 (CLI → 관리자 앱) | 동일 로직 공유, Phase 2 일정 대응 |
| D-3 | price 필드 정의 | 참조 가격 + 면책 표시 | 정확한 매장가 자동 수집 불가. Wirecutter/화해와 동일 방식 |
| D-4 | product_stores 관계 | 혼합 매핑 (유형 기반 + 개별) | 실시간 재고 불가. 유형 기반이 현실적 |
| D-5 | 네이버 쇼핑 이미지 | 사용 안 함 | 저작권 리스크. MVP placeholder (D-14) |
| D-6 | S5 보고품목 역할 | 사전 배치 검증만 (동적 보강 v0.2 연기) | MVP 복잡도 최소화 |
| D-7 | AI 분류 검수 | 개인화 핵심 필드 전수 검수 | skin_types, concerns, product_ingredients.type 오분류 시 서비스 가치 훼손 |
| D-8 | 큐레이션 방법 | 수동 + 네이버 트렌드 참조 + A-3 시드 크롤링 | 브랜드 사이트 크롤링으로 기본 정보 자동, 인기도는 수동 참조 |
| D-9 | 비즈니스 모델 | K-뷰티 Wirecutter (정보제공 + 어필리에이트) | 판매자 등록 불필요. 통신판매업 등록 불필요 (MVP) |
| D-10 | 어필리에이트 고지 | 카드/링크 근처 경제적 이해관계 명시 | 추천·보증 표시·광고 심사지침 제5조 준수 |
| D-11 | 시술 면책 | 모든 시술 응답에 의료 면책 문구 | 의료법 제27조 대응 |
| D-12 | S3↔S6 JOIN 키 | **INGR_ENG_NAME ↔ INCI name 텍스트 매칭 (1차)** + CAS_NO (보조) | P2-V2에서 S3 CAS_NO 대부분 NULL 확인. P2-V4에서 교차매칭 5/5 성공 |
| D-13 | 제품 시드 크롤링 | 브랜드 공식 사이트 1순위 + 올리브영 글로벌 2순위(보조) | P2-V7 약관 검토. 브랜드 사이트 리스크 낮음, 올리브영 글로벌 리스크 중 |
| D-14 | MVP 이미지 전략 | **placeholder (브랜드 색상+텍스트 카드)** — image_url 수집은 하되 UI 미표시. 브랜드 서면 승인 후 순차 전환 | P2-V3: 4/5 브랜드 상업적 사용 금지 명시. 업계 표준은 브랜드 직접 제출 모델 |

---

> 크로스 참조: data-strategy.md (PoC 결정), data-pipeline.md (ETL 상세), seed-data-plan.md (시드 계획), schema.dbml (DB 정본), PRD.md (요구사항), MASTER-PLAN.md (로드맵)
