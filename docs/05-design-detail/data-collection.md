# MVP 데이터 수집 설계서

> 버전: 1.3
> 작성일: 2026-03-23
> 성격: MVP(v0.1) 도메인 데이터 수집의 종합 설계 — 소스, 법적 검토, 큐레이션, 파이프라인, 리스크
> 정본 참조: schema.dbml (DB), PRD.md (요구사항), data-strategy.md (PoC 결정), data-pipeline.md (ETL)
> 범위: DOM-1 쇼핑 + DOM-2 시술 (7 엔티티 + 3 junction)
> 법적 범위: 본 문서는 **도메인 데이터 소스의 법적 리스크**만 다룬다. 사용자 개인정보보호법(PIPA)/위치정보법은 별도 문서 소관.
>
> **기존 결정과의 관계**: 본 문서는 data-strategy.md(U-6, U-8)의 "카카오 API + 수동 보완 혼합" 결정을 **확장**한다. S2(네이버 쇼핑 API), S3~S5(식약처 3종), S6(EU CosIng)를 신규 보조 소스로 추가하며, 기존 결정의 핵심(카카오 API 주 소스 + 수동 검수 원칙)은 유지한다. data-pipeline.md §3.1 소스 매핑 테이블은 본 문서 확정 후 동기화 필요.

---

## 목차

1. [서비스 목표와 데이터 수집의 연결](#1-서비스-목표와-데이터-수집의-연결)
2. [비즈니스 모델 검증](#2-비즈니스-모델-검증)
3. [데이터 소스 기술 명세 (6개)](#3-데이터-소스-기술-명세)
4. [법적 리스크 매트릭스](#4-법적-리스크-매트릭스)
5. [큐레이션 전략 — "무엇을 수집하는가"](#5-큐레이션-전략)
6. [엔티티별 수집 상세 (7 + 3 junction)](#6-엔티티별-수집-상세)
7. [파이프라인 아키텍처 (5단계)](#7-파이프라인-아키텍처)
8. [미검증 항목 및 리스크](#8-미검증-항목-및-리스크)
9. [타임라인](#9-타임라인)
10. [설계 결정 요약](#10-설계-결정-요약)

---

# 1. 서비스 목표와 데이터 수집의 연결

## 1.1 에센리의 핵심 목표

한국 방문 외국인 여성 여행객(2040)이 K-뷰티 선택(제품, 시술)을 **AI 대화를 통해 개인화된 추천**으로 쉽고 정확하게 내릴 수 있도록 안내한다.

## 1.2 데이터 수집의 4대 원칙

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
| S2 | 네이버 쇼핑 API | 제품 후보 수집 (products) | 공식 API. **상업적 이용 약관 확인 필요 (U-5)** | 무료 (일 25,000건) |
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

### 법적 리스크 — **높음**

네이버 오픈 API 이용약관 제10조: "검색 결과를 그대로 보여주는 서비스"에만 허용. 가공하여 별도 서비스 구축은 위반 소지.

**대응**: S2는 "제품 후보 리스트 생성 보조 도구"로만 사용. 최종 DB 데이터는 수동 입력/검수를 거쳐 적재. S2 없이도 수동 입력으로 MVP 운영 가능 (폴백).

## 3.4 S3: 식약처 화장품 원료성분정보 API

> 대상: ingredients 기본 레코드 | 공공데이터포털 data.go.kr/data/15111774

**엔드포인트**: `GET http://apis.data.go.kr/1471000/CsmtcsIngdInfoService/getCsmtcsIngdInfo` (미확인 — Phase 2 PoC에서 Swagger UI 검증 필요)
**인증**: `serviceKey` 쿼리 파라미터

### 필드 매핑

| API 필드 | DB 컬럼 | 변환 |
|---------|---------|------|
| 표준명 | name -> {ko: ...} | 직접 매핑 |
| 영문명 | name -> {en: ...} | 직접 매핑 |
| CAS번호 | (매핑 없음) | S4/S6 크로스 매칭 키 |
| 배합목적 | function[] 초안 | 기술 용어 → 뷰티 용어 변환 필요 |

### 수집 불가 필드

inci_name (S6에서 보강), function[] 세분화 (AI+전문가), caution_skin_types[] (S4+AI+전문가), common_in[] (수동/AI)

### Rate Limit

개발 1,000건/일, 운영 10,000건/일. 전체 원료 수천 건 → 운영 계정 필요 가능.

## 3.5 S4: 식약처 화장품 사용제한 원료정보 API

> 대상: ingredients 안전성 보강 | data.go.kr/data/15111772

S3 레코드에 대한 LEFT JOIN enrichment. 단독 레코드 생성하지 않음.

### 핵심 활용

"제한사항" 텍스트를 LLM에 입력 → dry/oily/combination/sensitive/normal 중 주의 필요 피부타입 추론 → **전문가 검수 필수**.

### Rate Limit

개발 1,000건/일. 사용제한 원료 수백 건 → 개발 계정 충분.

## 3.6 S5: 식약처 기능성화장품 보고품목 API

> 대상: products 교차 검증 | data.go.kr/data/15095680

### 활용 방식 (생성이 아닌 검증)

1. S2/수동으로 products 생성
2. "{brand} {product.name.ko}"로 S5 검색
3. 매칭 시: tags에 "functional:{유형}" 추가 + 인증 확인 로그
4. 미매칭 = 비기능성 제품 (정상)

### 주의

- 기능성화장품(미백/주름개선/자외선차단)만 대상. 일반 화장품 조회 불가
- 품목명 ≠ 시장 판매명 → 퍼지 매칭 필요
- 업체명 ≠ 소비자 브랜드명 (OEM 가능)

**MVP 결정: 사전 배치 검증만. "동적 보강"(대화 중 실시간 검색)은 v0.2로 연기.**

## 3.7 S6: EU CosIng DB (CSV)

> 대상: ingredients INCI 표준화 + function 보강

**접근**: CSV 1회 다운로드. ~30,000 INCI 항목.
**라이선스**: EU Open Data — 상업적 사용 가능.

### 매핑

| CosIng 컬럼 | DB 컬럼 | 변환 |
|-------------|---------|------|
| INCI name | inci_name | 직접 매핑 (핵심 목적) |
| CAS No | (매핑 없음) | S3 크로스 매칭 키 |
| Function | function[] 보강 | MOISTURISING → moisturizing 등 |

### ingredients 3원 소스 결합 순서

```
S3 원료성분 → 기본 레코드 (name.ko, name.en, CAS번호)
  ↓ CAS번호 JOIN
S6 CosIng → inci_name + function 보강
  ↓ CAS번호 JOIN
S4 사용제한 → 안전성 플래그 + caution_skin_types 도출
  ↓
LLM 번역 + 분류 → 다국어 + function 뷰티 용어 변환
  ↓
전문가 검수 → function, caution_skin_types 최종 확정
```

---

# 4. 법적 리스크 매트릭스

| 소스 | 리스크 등급 | 핵심 이슈 | 권장 조치 |
|------|-----------|---------|---------|
| S1 카카오 API | **중** | 데이터 영구 저장 시 "DB 구축 행위" 해당 가능 | API 데이터는 검증 도구로만 사용. 최종 데이터는 수동 입력으로 처리. "Powered by Kakao" 표시 |
| S2 네이버 쇼핑 API | **높** | 가공하여 별도 서비스 구축은 약관 위반 소지. 이미지 사용 불가 | 후보 리스트 보조 도구로만 사용. 최종 데이터는 수동 적재. **Phase 2 전 약관 정독 필수** |
| S3 식약처 원료성분 | **낮** | 공공데이터법 적용. 공공누리 유형 확인 | 출처 표시: "출처: 식품의약품안전처" |
| S4 식약처 사용제한 | **낮** | 동일 | 동일 |
| S5 식약처 보고품목 | **낮** | 동일 | 동일 |
| S6 EU CosIng | **극히 낮** | EU 공개 데이터 | 출처 표시 권장. EU/한국 규정 차이 고지 |

### 어필리에이트 고지 의무

추천·보증 등에 관한 표시·광고 심사지침(공정거래위원회 심사지침) 제5조:
- 외부 링크에 "이 링크를 통한 구매 시 에센리가 수수료를 받을 수 있습니다" 표시 필수
- 링크 근처에 명확히 표시

### 시술 추천 면책 (의료법 제27조)

모든 시술 관련 응답에 필수:
> "This information is for general reference only and does not constitute medical advice. Please consult with a qualified dermatologist or physician before undergoing any procedure."

### 이미지 저작권 정책

| 소스 | 사용 가능? | 근거 |
|------|----------|------|
| 브랜드 공식 프레스킷 | **가능** | 묵시적 프로모션 라이선스. 출처 표시 권장 |
| 네이버 쇼핑 이미지 | **불가** | 판매자 저작물. 네이버 이용약관 제17조 |
| 자체 촬영 | **가능** | 완전 소유 |
| AI 생성 이미지 | **부적합** | 실제 제품 묘사 시 오인 유발 가능 |

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
| products | name.ko, price(참조), category, brand(매칭), purchase_links | 번역, skin_types, concerns (**→ 전수 검수 D-7**), description, review_summary | 매장 정가, volume, english_label, images, key_ingredients | ~35% |
| brands | name.ko (S2에서 추출) | 번역 | origin, tier, specialties | ~30% |
| ingredients | name.ko, name.en, CAS (S3) + inci_name (S6) + 제한 여부 (S4) | function 변환, caution 추론, 번역 | caution_skin_types 검수, common_in | ~50% |
| treatments | — | 번역, target_concerns, suitable_skin_types, description | 전 필드 수동 입력 (의학 정보) | ~25% |
| doctors | — | 번역 | 전 필드 수동 입력 | ~5% |

---

# 7. 파이프라인 아키텍처

## 7.0 에러 격리 정책

| 범위 | 정책 | 구현 |
|------|------|------|
| **프로바이더 간** | S1 실패해도 S2 독립 실행 | `Promise.allSettled` 사용. 실패 프로바이더 로그 + 스킵 |
| **AI enrichment 건별** | 200건 중 1건 실패 시 해당 건만 스킵 | 건별 try-catch. 실패 건 `enrichment_status: 'failed'` 마킹 → 수동 보완 |
| **Stage 간 임계치** | 이전 Stage 최소 성공률 50% 미달 시 중단 | Stage 2에서 100건 시도 → 50건 미만 성공 시 원인 조사 후 재실행 |
| **DB 적재** | 엔티티 타입별 독립 트랜잭션, 100건 단위 청크 | 청크 실패 시 해당 청크만 롤백 (data-pipeline.md §3.4.2 계승) |

## 7.1 5단계 흐름

```
Stage 1: 큐레이션       → YAML manifest (수집 대상 리스트)
Stage 2: 자동 수집      → RawRecord[] (6개 API/CSV)
Stage 3: AI 보강       → EnrichedRecord[] (번역, 분류, 생성)
Stage 4: 수동 보완+검수  → ValidatedRecord[] (관리자 검수 완료)
Stage 5: 적재+임베딩    → DB rows + embedding vectors
```

## 7.2 코드 아키텍처 — 2단계 전략

### scripts/의 DAG 내 위치

CLAUDE.md 4계층 DAG에서 `scripts/`는 **DAG 외부의 보조 Composition Root**이다. `app/`과 동일한 조합 루트 자격:

- `scripts/ → server/core/, shared/` : 허용 (app/과 동일 방향)
- `server/ → scripts/` : **금지** (역방향)
- `client/ → scripts/` : **금지** (역방향)

> 향후 CLAUDE.md 반영 권장: P-4a로 `scripts/`를 보조 Composition Root로 명시.

### `server-only` guard 정책

`server/core/` 파일은 L-0a에 따라 `import 'server-only'`가 있다. CLI(`npx tsx`) 실행 시 `server-only`는 Node.js 환경에서 noop으로 동작하므로 에러 없음. 이는 패키지의 설계 의도(브라우저 번들 방지)와 일치하며, CLI는 브라우저가 아니므로 정상 동작이다.

### 파이프라인 전용 환경변수

| 변수 유형 | 위치 | 근거 |
|----------|------|------|
| 파이프라인 전용 (KAKAO_API_KEY, NAVER_CLIENT_ID, MFDS_SERVICE_KEY) | `scripts/seed/config.ts` | 런타임 서비스에서 미사용. core 범위 확장 방지 (P-2) |
| 공통 (SUPABASE_URL, LLM_API_KEY) | `server/core/config.ts` 참조 | 런타임 + 파이프라인 양쪽 사용 |

### Phase 2 초반: CLI 전용

```
scripts/seed/                          ← CLI 진입점 (thin: manifest 읽기 → 서비스 호출)
  ├── manifests/*.yaml                 ← Stage 1 수집 대상
  ├── fetch.ts                         ← Stage 2 CLI
  ├── enrich.ts                        ← Stage 3 CLI
  ├── validate.ts                      ← Stage 4 CLI
  ├── load.ts                          ← Stage 5 CLI
  └── run-all.ts                       ← 전체 파이프라인

scripts/seed/lib/                      ← 수집 파이프라인 로직 (CLI 전용 + 관리자 앱 공유)
  ├── providers/
  │   ├── kakao-local.ts               ← S1 (P0-33 PoC 계승)
  │   ├── naver-shopping.ts            ← S2
  │   ├── mfds-ingredient.ts           ← S3
  │   ├── mfds-restricted.ts           ← S4
  │   ├── mfds-functional.ts           ← S5
  │   ├── cosing-csv.ts                ← S6
  │   └── csv-loader.ts               ← 수동 CSV
  ├── enrichment/
  │   ├── translator.ts                ← LLM 번역
  │   ├── classifier.ts                ← AI 분류 (skin_types, concerns)
  │   └── description-generator.ts     ← AI 생성
  ├── fetch-service.ts                 ← Stage 2 오케스트레이션
  ├── enrich-service.ts                ← Stage 3 오케스트레이션
  ├── loader.ts                        ← Stage 5 DB 적재
  └── types.ts                         ← RawRecord, EnrichedRecord 등

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
Phase B (A 완료 후): products(S2+수동), doctors
  ※ U-5 결과 S2 사용 불가 시: products 전량 수동+CSV 입력 (폴백 경로)
Phase C (B 완료 후): product_stores, product_ingredients, clinic_treatments
Phase D (C 완료 후): 임베딩 배치 생성
Phase E (B 완료 후, Phase C와 병렬 실행 가능): S5 교차 검증
```

---

# 8. 미검증 항목 및 리스크

| ID | 항목 | 리스크 | 잘못되면 영향 | 검증 시점 | 검증 방법 |
|----|------|--------|------------|---------|---------|
| **U-1** | AI 분류 정확도 (skin_types, concerns) | **높** | 부적합 추천 → 신뢰 상실 | M1 | 10개 제품 AI 분류 → 전문가 대조. 80% 미달 시 수동 전환 |
| **U-2** | 식약처 API 실제 응답 형식 | **중** | API 필드명/형식 불일치 시 코드 수정 | **Phase 2 전** (M1 이전) | API 키 발급 → Swagger UI 테스트. 1회 호출로 응답 형식 확인 |
| **U-3** | EU CosIng K-뷰티 성분 커버리지 | **중** | 커버율 낮으면 inci_name 수동 입력 | M2 | 목표 100성분 중 CosIng 매칭률 측정 |
| **U-4** | 네이버 쇼핑 API 중복 제거 복잡도 | **중** | 정규화 실패 시 중복 제품 | M2 | 20개 제품 실제 검색 → 정규화 테스트 |
| **U-5** | **네이버 쇼핑 API 상업적 이용 약관** | ~~높~~ **확정** | — | **검증 완료 (2026-03-23)** | **판정: S2 MVP 사용 보류.** 네이버 개발자센터 직접 접근 차단으로 약관 원문 미확인. 공식 가이드에서 API는 "네이버 검색의 쇼핑 검색 결과를 반환"하는 것으로 제품 마스터 데이터가 아님. 약관 미확인 상태에서의 상업적 통합은 G-12(외부 소스 사전 검증) 위반. **→ products는 수동+CSV 폴백 경로 채택.** 추후 네이버 개발자센터 로그인 후 약관 원문 확인 시 재평가 가능 |
| **U-6** | 브랜드 이미지 사용 허가 | **높** | 저작권 분쟁 시 서비스 중단 | M1 | 5개 브랜드 공식 이미지 정책 확인. 불가 시 placeholder |
| **U-7** | 시술 가격 범위 현실성 | **중** | 50%+ 불일치 시 사용자 불만 | M2 | 5개 클리닉 실제 가격 대조 |
| **U-8** | 네이버 쇼핑 이미지 저작권 | 확정 | — | — | **사용 안 함으로 확정** |

### 리스크 대응 우선순위

```
즉시 확정:    U-8 (네이버 이미지 사용 안 함), U-5 (네이버 쇼핑 API MVP 사용 보류 → 수동 폴백)
완료:         U-5 (2026-03-23 검증 완료)
M1 시점:      U-1 (AI 분류 PoC), U-2 (식약처 API 테스트), U-6 (이미지 정책)
M2 시점:      U-3 (CosIng 커버리지), U-4 (중복 제거), U-7 (가격 현실성)
```

---

# 9. 타임라인

## M1: 스켈레톤 (Phase 2 시작 시) — 각 엔티티 5~10건

| 필요 사항 | 상세 |
|----------|------|
| 수집 로직 | 불필요 — 수동 YAML/JSON 입력 (50건 미만) |
| 검증 | zod 스키마 구현 (shared/validation/) |
| 적재 | scripts/seed/load.ts 기본 구현 |
| 검증 사항 | FK 관계 정상, 임베딩 생성 확인, U-1 AI 분류 시범 10건, U-2 식약처 API 테스트 |

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
| products (수동 보완) | ~15분 | 200 | ~50시간 | API 후보 + AI 보강 후 검수·보완 |
| stores (수동 보완) | ~10분 | 50 | ~8시간 | API 골격 후 영업시간·영어지원 보완 |
| clinics (수동 보완) | ~15분 | 30 | ~8시간 | foreigner_friendly 상세 확인 필요 |
| treatments (전부 수동) | ~20분 | 50 | ~17시간 | 의학 정보 조사 포함 |
| ingredients (수동 검수) | ~10분 | 100 | ~17시간 | API 데이터 + AI 분류 전수 검수 |
| brands (수동) | ~5분 | 50 | ~4시간 | 간단한 필드 |
| doctors (수동) | ~5분 | 30 | ~3시간 | 클리닉 종속 |
| junction (수동 매핑) | ~2분 | ~500 (수동 대상만) | ~17시간 | 유형 기반 매핑 ~2,200건은 자동 스크립트. 수동은 product_ingredients ~400 + 개별 매장 ~100건 |
| **합계** | | | **~124시간** | **1인 풀타임(8h/일) 약 16일** |

> 주의: 이 공수는 코딩과 별도. Phase 2에서 코딩(~5-7주)과 데이터 입력(~3주)을 병행해야 함. M1→M2→M3 단계적 진행으로 부하 분산.

---

# 10. 설계 결정 요약

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| D-1 | 데이터 소스 구성 | 6개 (S1~S6) | 기술적·법적 검증 완료. 모든 소스 무료 |
| D-2 | 수집 파이프라인 실행 환경 | 단계적 (CLI → 관리자 앱) | 동일 로직 공유, Phase 2 일정 대응 |
| D-3 | price 필드 정의 | 참조 가격 + 면책 표시 | 정확한 매장가 자동 수집 불가. Wirecutter/화해와 동일 방식 |
| D-4 | product_stores 관계 | 혼합 매핑 (유형 기반 + 개별) | 실시간 재고 불가. 유형 기반이 현실적 |
| D-5 | 네이버 쇼핑 이미지 | 사용 안 함 | 저작권 리스크. 브랜드 공식 이미지 우선 |
| D-6 | S5 보고품목 역할 | 사전 배치 검증만 (동적 보강 v0.2 연기) | MVP 복잡도 최소화 |
| D-7 | AI 분류 검수 | 개인화 핵심 필드 전수 검수 | skin_types, concerns, product_ingredients.type 오분류 시 서비스 가치 훼손 |
| D-8 | 큐레이션 방법 | 수동 + 네이버 트렌드 참조 | 크롤링 없이 인기도 파악. NOL World와 동일 검증된 방식 |
| D-9 | 비즈니스 모델 | K-뷰티 Wirecutter (정보제공 + 어필리에이트) | 판매자 등록 불필요. 통신판매업 등록 불필요 (MVP) |
| D-10 | 어필리에이트 고지 | 카드/링크 근처 경제적 이해관계 명시 | 추천·보증 표시·광고 심사지침 제5조 준수 |
| D-11 | 시술 면책 | 모든 시술 응답에 의료 면책 문구 | 의료법 제27조 대응 |

---

> 크로스 참조: data-strategy.md (PoC 결정), data-pipeline.md (ETL 상세), seed-data-plan.md (시드 계획), schema.dbml (DB 정본), PRD.md (요구사항), MASTER-PLAN.md (로드맵)
