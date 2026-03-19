# 에센리 K-뷰티 AI 에이전트 — 기술 설계 문서 (TDD)

> 버전: 1.1
> 최종 갱신: 2026-03-17
> 원칙: 이 문서는 기술 구현(HOW)만을 다룬다. 제품 요구사항(WHAT)은 PRD.md에 정의.

---

## 목차

1. [구현 개요](#1-구현-개요)
2. [기술 스택](#2-기술-스택)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [API 설계](#4-api-설계)
5. [DB 스키마](#5-db-스키마)
6. [프로젝트 구조](#6-프로젝트-구조)
7. [개발 마일스톤](#7-개발-마일스톤)
8. [기술 리스크 + 완화](#8-기술-리스크--완화)
9. [부록: 기술 결정 로그](#9-부록-기술-결정-로그)

---

# 1. 구현 개요

에센리 K-뷰티 AI 에이전트의 기술 구현 설계. 5개 도메인 서비스(쇼핑, 시술, 살롱, 맛집, 체험), 15개 개인화 변수, 5개 카드 타입(ProductCard, TreatmentCard, SalonCard, DiningCard, ExperienceCard)을 AI 대화형 웹 앱으로 구현한다.

4계층 아키텍처(Client → API → Backend Services → Data)를 채택하며, LLM 기반 대화 엔진 + RAG 벡터 검색 + 개인화 판단 엔진을 핵심으로 한다.

---

# 2. 기술 스택

## 2.1 프론트엔드

| 기술 | 선정 이유 |
|---|---|
| Next.js 15 (App Router) | SSR/SSG 혼합, API Routes, Server Actions, 스트리밍 UI |
| React 19 | 서버 컴포넌트, Suspense, 스트리밍 |
| Tailwind CSS | UX 프로토타입 디자인 시스템과 빠른 매칭 |
| next-intl | 6개 언어 i18n (URL 기반 라우팅) |
| Vercel AI SDK | LLM 스트리밍 응답 UI, 도구 호출 통합 |

## 2.2 백엔드

| 기술 | 선정 이유 |
|---|---|
| Next.js API Routes | 프론트엔드와 동일 코드베이스, 서버리스 배포 |
| Claude API (Anthropic) | 다국어 대화 + 도구 사용 + 긴 컨텍스트 |
| Supabase (PostgreSQL) | 인증, DB, 실시간 기능, pgvector 내장 |
| pgvector | 벡터 검색 (RAG용) — Supabase에 포함 |

## 2.3 인프라

| 기술 | 선정 이유 |
|---|---|
| Vercel | Next.js 네이티브 배포, Edge Functions, 글로벌 CDN |
| Supabase Cloud | 관리형 PostgreSQL + Auth + Storage |

## 2.4 주요 라이브러리

| 라이브러리 | 용도 |
|---|---|
| `@anthropic-ai/sdk` | Claude API 호출 |
| `ai` (Vercel AI SDK) | 스트리밍 UI + 도구 호출 |
| `@supabase/supabase-js` | Supabase 클라이언트 |
| `next-intl` | 다국어 지원 |
| `zod` | 스키마 검증 |
| `react-hook-form` | 폼 상태 관리 |

---

# 3. 시스템 아키텍처

## 3.1 4계층 개요

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Web App)                      │
│  Next.js (App Router) + React + Tailwind CSS            │
│  [Landing] [Onboarding] [Results+Chat] [Conversion]     │
│  [i18n: 6 Languages] [Streaming UI] [Geolocation API]  │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    API LAYER                             │
│  Next.js API Routes + Server Actions                    │
│  [Auth] [Profile] [Chat] [Journey] [Conversion]         │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│              BACKEND SERVICES                            │
│                                                          │
│  L1: Base Layer ─── LLM Engine (Claude) + RAG (pgvector)│
│  L2: Agent Logic ── Intent + Judgment + DV Calculator   │
│  L3: Memory ─────── Short-term (DB) + Long-term (DB)   │
│  L4: Action ─────── Stage 1~3 기능                      │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────┐
│                    DATA LAYER                            │
│  PostgreSQL (Supabase) + pgvector                       │
│  사용자/프로필/여정/히스토리/도메인 데이터               │
└─────────────────────────────────────────────────────────┘
```

## 3.2 L1: Base Layer — LLM 엔진 + RAG

### LLM 엔진

- 모델: claude-sonnet-4-5-20250929 (비용/성능 균형. 필요 시 opus 전환)
- 모드: tool_use (도구 호출)
- 입력: 사용자 메시지(다국어) + AI Beauty Profile(피부/헤어/스타일 종합 프로필) + 대화 히스토리 + RAG 결과 + 시스템 프롬프트
- 출력: 자연어 응답(사용자 언어) + 구조화 데이터(카드용: ProductCard, TreatmentCard 등) + 도구 호출 요청

### 시스템 프롬프트 구조

```
[시스템 프롬프트]
├── 역할 정의: K-뷰티 AI 에이전트 (비개입적 판단 원칙)
├── 도메인 지식: 5영역 가이드라인 (shopping, clinic, salon, dining, experience)
├── 개인화 컨텍스트: {AI Beauty Profile 주입}
├── 대화 규칙: 다국어 응답, 카드 형식(ProductCard/TreatmentCard 등), 추천 이유 필수
├── 도구 목록: 검색, 필터, 코스 생성, 외부 링크 등
└── 제약: 의료 조언 금지, 비개입적 원칙 준수
```

### RAG 엔진

Knowledge Base 구성:
1. 제품 DB (shopping) — 제품 정보 + 성분 + 리뷰 요약
2. 장소 DB (clinic/salon/dining/experience) — 장소 정보 + 리뷰 요약 + 메타
3. 뷰티 지식 KB — 피부타입별 성분 가이드, 시술 주의사항, K-뷰티 트렌드, 지역 가이드

검색 전략: 사용자 쿼리 → 임베딩 → 벡터 검색 + 메타데이터 필터(피부타입, 지역 등) → Top-K 결과 → LLM 컨텍스트 주입

### 임베딩 전략

| 대상 | 임베딩 모델 | 벡터 차원 | 갱신 주기 |
|---|---|---|---|
| 제품/장소 정보 | Voyage-3-large | 1024 | 데이터 변경 시 |
| 뷰티 지식 | Voyage-3-large | 1024 | 월 1회 |
| 리뷰 요약 | Voyage-3-large | 1024 | 주 1회 |

## 3.3 L2: Agent Logic Layer

### 의도 분류기 (Intent Classifier)

Claude의 tool_use를 활용한 의도 분류.

```
[도메인 의도]
- shopping_product: 제품 추천/검색
- shopping_store: 매장 추천/검색
- treatment_info: 시술 정보/추천
- treatment_clinic: 클리닉 추천/검색
- salon_service: 살롱 서비스 추천
- dining: 맛집 추천
- experience: 체험 추천
- course_plan: 일정/코스 생성

[시스템 의도]
- profile_update: 프로필 정보 변경
- general_chat: 일반 대화
- clarification_needed: 추가 정보 필요
- out_of_scope: 서비스 범위 외
```

### 뷰티 판단 엔진 (Beauty Judgment Engine)

```
입력: 의도 + 개인화 변수(15개) + 도메인 데이터(5영역)
  ↓
[판단 로직]
  1. 적합성 필터: skin_type(dry/oily/combination/sensitive/normal), hair_type(straight/wavy/curly/coily) 기반
  2. 고민 매칭: skin_concerns → 대응 제품/시술 매핑
  3. 제약 조건 체크:
     - downtime_days < remaining_days
       * remaining_days = end_date - today (날짜 있을 때), stay_days (없을 때 폴백으로 사용, 과대평가 가능성 있음)
       * 50%+ 겹침 시 경고 표시
     - budget 범위 내 (budget/moderate/premium/luxury)
     - 영업 중 (현재 시간)
     - 언어 지원 (foreigner_friendly)
  4. 개인화 정렬:
     - 선호 성분(DV-1) 포함 제품 우선
     - 기피 성분(DV-2) 포함 제품 제외
     - 학습된 선호도(BH-4) 반영
  5. 하이라이트 적용 (비개입적 판단):
     - is_highlighted == true인 항목에 배지 추가
     - 순위/선정에는 미영향
  ↓
출력: 정렬된 추천 리스트 + 각 항목의 why_recommended
```

### 도출 변수 계산기 (Derived Variable Calculator)

15개 수집 변수를 기반으로 4개 도출 변수를 실시간 계산 (캐시 가능):

| 도출 변수 | 입력 | 로직 |
|---|---|---|
| DV-1: preferred_ingredients (선호 성분) | skin_type, skin_concerns, learned_preferences | 피부타입 + 고민 → 도메인 지식 기반 성분 매핑 + 학습 선호 가중치 |
| DV-2: avoided_ingredients (기피 성분) | skin_type, learned_preferences(dislike) | 피부타입 → 주의 성분 + 명시적 dislike |
| DV-3: user_segment (사용자 세그먼트) | age_range, interest_activities, budget, travel_style | 규칙 기반 분류 (마케팅/분석용, 추천 미사용) |
| DV-4: ai_beauty_profile (AI 뷰티 프로필) | 모든 수집 변수 + DV-1~3 | LLM 기반 종합 프로필 생성 (자연어 요약 + 구조화 데이터) |

## 3.4 L3: Memory Layer

### 단기 메모리 (Short-term: Conversation)

| 항목 | 구현 |
|---|---|
| 저장 | Supabase DB (messages 테이블) |
| 내용 | 현재 대화의 메시지 히스토리 |
| 크기 제한 | 최근 20턴 (초과 시 요약 + 최신 유지) |
| 수명 | 세션 종료 시 비활성 (30분 비활동 타임아웃) |
| 용도 | LLM 컨텍스트 윈도우에 주입 |

> Redis 대신 Supabase DB 사용. 추가 인프라 없이 운영. Redis는 성능 이슈 발생 시 v0.2+ 도입.

### 장기 메모리 (Long-term: User Profile)

| 항목 | 구현 |
|---|---|
| 저장 | Supabase DB |
| 내용 | User Profile (UP-1~4), Beauty History (BH-1~4), Journey records (JC-1~5) |
| 수명 | 영구 (사용자 삭제 전까지). 단, anonymous 사용자는 비활동 90일 자동 만료 적용 (PRD §4-C) |
| 접근 | 대화 시작 시 로드 → 시스템 프롬프트 주입 |
| 갱신 | 대화 중 새 정보 감지 시 실시간 업데이트 |

### 행동 학습 (Behavior Log)

| 항목 | 구현 |
|---|---|
| 저장 | Supabase DB (behavior_logs 테이블) |
| 내용 | 클릭, 카드 조회, 외부 링크 클릭, 대화 패턴 |
| 처리 | 비동기 배치 처리 → 학습된 선호도 갱신 |
| 스키마 | `{ user_id, event_type, target_id, target_type, metadata, timestamp }` |

> BH-4 갱신 규칙 (PRD §4-A): 새 데이터가 기존과 충돌 시 최신 데이터 우선 + confidence 조정.
> 구체적 confidence 조정 알고리즘(감쇠 함수, 임계값 등)은 M4(대화 + 추천) 구현 시 상세 설계.

## 3.5 L4: Action Layer 구현

3단계 Action Layer(Stage 1~3)를 기술적으로 구현.

### Stage 1 (기반) — MVP 포함

F1: 장소/제품 정보 제공

```
[Claude Tool Definition]
tool: search_beauty_data
parameters:
  domain: enum (shopping / clinic / salon / dining / experience)
  query: string
  filters:
    skin_types?: enum[]    # dry/oily/combination/sensitive/normal
    hair_types?: enum[]    # straight/wavy/curly/coily
    concerns?: string[]    # acne/wrinkles/dark_spots/redness/dryness/pores/dullness 등
    district?: string
    price_range?: PriceRange
    english_support?: boolean
  limit: int (default: 5)
```

F2: 외부 링크 연결

```
[Claude Tool Definition]
tool: get_external_links
parameters:
  entity_id: UUID
  entity_type: enum (product / store / clinic / treatment / salon / restaurant / experience)
  link_types?: enum[]  # naver_map / kakao_map / website / instagram / naver_booking / coupang / amazon / other
```

### Stage 2 (차별화) — MVP 이후

F3: 뷰티 여정 코스 생성

```
[Claude Tool Definition]
tool: generate_beauty_course
parameters:
  days: int             # 체류 일수
  interests: string[]   # shopping/clinic/salon/dining/cultural
  district_preference?: string
  budget_level?: enum   # budget/moderate/premium/luxury
  include_dining: boolean
  include_culture: boolean
```

F7: 자동 팔로업

```
[Claude Tool Definition]
tool: generate_followup
parameters:
  context: enum (post_treatment / post_purchase / post_visit / next_day)
  reference_id: UUID
```

### Stage 3 (외부 연동) — 파트너십 후

- F4: 실시간 예약 API — 클리닉/살롱 예약 시스템 연동
- F5: 알림 — 예약 확인, 리마인더
- F6: 리뷰 — 방문 후 리뷰 요청 및 수집

> Stage 3은 외부 파트너십 확보 후 설계 상세화.

---

# 4. API 설계

## 4.1 핵심 API 엔드포인트

```
Auth (MVP는 anonymous만)
  POST   /api/auth/anonymous       # 익명 세션 생성

Profile (15개 개인화 변수)
  GET    /api/profile              # 프로필 조회
  PUT    /api/profile              # 프로필 업데이트
  POST   /api/profile/onboarding   # 온보딩 데이터 저장
  GET    /api/profile/beauty       # AI 뷰티 프로필 (DV-4)

Chat
  POST   /api/chat                 # 대화 (스트리밍 응답)
  GET    /api/chat/history         # 대화 히스토리

Journey (여정 데이터)
  POST   /api/journey              # 새 여정 생성
  GET    /api/journey/active       # 현재 활성 여정
  PUT    /api/journey/:id          # 여정 업데이트

Search (내부 — Chat API에서 Tool로 호출)
  POST   /api/search/products
  POST   /api/search/places
  POST   /api/search/treatments

Conversion
  POST   /api/kit/claim            # Kit CTA 전환
```

> MVP에서 signup/login API 제외. anonymous만 제공.

## 4.2 Chat API 플로우 (핵심)

```
Client → POST /api/chat { message, session_id }
  │
  ├─ 1. 대화 히스토리 로드 (Supabase: messages 테이블)
  ├─ 2. 프로필 로드 (Supabase: user_profiles + journeys)
  ├─ 3. 시스템 프롬프트 구성 (§3.2 구조)
  ├─ 4. Claude API 호출 (스트리밍 + tool_use)
  │     ├─ tool_use: search_beauty_data → RAG 검색 → 결과 반환
  │     ├─ tool_use: get_external_links → 링크 조회 → 결과 반환
  │     └─ 최종 응답 생성 (텍스트 + 카드 데이터)
  │
  ├─ 5. 대화 히스토리 저장 (Supabase: messages)
  ├─ 6. 행동 로그 기록 (비동기)
  ├─ 7. 개인화 변수 추출/갱신 (비동기)
  │
  └─ Response: SSE 스트리밍
       { type: "text", content: "..." }
       { type: "card", data: ProductCard }
       { type: "card", data: TreatmentCard }
       { type: "done" }
```

---

# 5. DB 스키마

> 도메인 엔티티(Product, Store, Clinic, Treatment 등)와 개인화 변수(UP-1~4, JC-1~5, BH-1~4)를 SQL로 구현.
> LocalizedText는 JSONB 단일 컬럼 (6개 언어). `entity.name->>'en'` 패턴.

```sql
-- ============================================================
-- 사용자 데이터
-- ============================================================

-- 사용자
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_method TEXT NOT NULL DEFAULT 'anonymous',  -- MVP anonymous만
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now()
);

-- 사용자 프로필 (skin_type, hair, country, language, age_range)
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  skin_type TEXT,                    -- 5개: dry/oily/combination/sensitive/normal
  hair_type TEXT,                    -- straight/wavy/curly/coily
  hair_concerns TEXT[],              -- damage/thinning/oily_scalp 등
  country TEXT,                      -- ISO 3166-1 alpha-2
  language TEXT NOT NULL DEFAULT 'en', -- 6개 지원 언어
  age_range TEXT,                    -- 18-24/25-29/30-34/35-39/40-49/50+
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 여정 (skin_concerns, interest_activities, stay_days, budget, travel_style)
CREATE TABLE journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  country TEXT NOT NULL DEFAULT 'KR',        -- 국가 독립적 설계
  city TEXT NOT NULL DEFAULT 'seoul',
  skin_concerns TEXT[],                      -- 최대 5개
  interest_activities TEXT[],                -- shopping/clinic/salon/dining/cultural
  stay_days INT,                             -- 체류 일수
  start_date DATE,
  end_date DATE,
  budget_level TEXT,                         -- budget/moderate/premium/luxury
  travel_style TEXT[],                       -- efficient/relaxed/adventurous 등
  status TEXT NOT NULL DEFAULT 'active', -- 여정 상태. 종료 조건은 추후 정의 (PRD A-13)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 뷰티 히스토리 (시술/구매/방문 이력)
CREATE TABLE beauty_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL,          -- treatment / purchase / visit
  entity_id UUID,
  entity_type TEXT,
  date DATE,
  satisfaction INT,            -- 1-5
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 학습된 선호도
CREATE TABLE learned_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  category TEXT NOT NULL,      -- e.g. "ingredient"
  preference TEXT NOT NULL,    -- e.g. "retinol"
  direction TEXT NOT NULL,     -- like / dislike
  confidence FLOAT DEFAULT 0.5,
  source TEXT,                 -- e.g. "conversation"
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 대화
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID REFERENCES journeys(id),
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 메시지 (단기 메모리 — Supabase DB 사용)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  role TEXT NOT NULL,           -- user / assistant / system
  content TEXT NOT NULL,
  card_data JSONB,             -- 추천 카드 데이터 (ProductCard 등)
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 행동 로그
CREATE TABLE behavior_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  target_id UUID,
  target_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 동의
CREATE TABLE consent_records (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  location_tracking BOOLEAN DEFAULT false,
  behavior_logging BOOLEAN DEFAULT false,
  data_retention BOOLEAN DEFAULT false,
  marketing BOOLEAN DEFAULT false,
  consented_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 도메인 데이터
-- LocalizedText → JSONB 단일 컬럼 (6개 언어)
-- ============================================================

-- 제품 (shopping 도메인 — Product, BaseEntity 상속)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,                   -- LocalizedText (JSONB 6언어)
  description JSONB,                     -- LocalizedText
  brand_id UUID REFERENCES brands(id),
  category TEXT,
  subcategory TEXT,
  skin_types TEXT[],                     -- dry/oily/combination/sensitive/normal
  hair_types TEXT[],
  concerns TEXT[],
  key_ingredients JSONB,                 -- 표시용 간이 목록. 개인화 필터링은 product_ingredients 관계 테이블 사용
  price INT,
  volume TEXT,
  purchase_links JSONB,                  -- PurchaseLink[]: { platform, url, affiliate_code? }
  english_label BOOLEAN DEFAULT false,
  tourist_popular BOOLEAN DEFAULT false,
  is_highlighted BOOLEAN DEFAULT false,  -- BaseEntity 상속
  highlight_badge JSONB,                 -- LocalizedText
  rating FLOAT,
  review_count INT DEFAULT 0,
  review_summary JSONB,                  -- LocalizedText
  images TEXT[],
  tags TEXT[],
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'temporarily_closed')),
  embedding vector(1024),               -- RAG 벡터 검색용
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 매장 (shopping 도메인 — Store, PlaceEntity 상속)
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,                   -- LocalizedText
  description JSONB,
  country TEXT DEFAULT 'KR',
  city TEXT DEFAULT 'seoul',
  district TEXT,
  location GEOGRAPHY(POINT, 4326),
  address JSONB,                         -- LocalizedText
  operating_hours JSONB,
  english_support TEXT DEFAULT 'none',
  store_type TEXT,
  brands_available UUID[],
  tourist_services TEXT[],
  payment_methods TEXT[],
  nearby_landmarks TEXT[],
  external_links JSONB,                  -- ExternalLink[]
  is_highlighted BOOLEAN DEFAULT false,
  highlight_badge JSONB,
  rating FLOAT,
  review_count INT DEFAULT 0,
  images TEXT[],
  tags TEXT[],
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'temporarily_closed')),
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 브랜드 (shopping 도메인)
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  origin TEXT,
  tier TEXT,
  is_essenly BOOLEAN DEFAULT false,
  specialties TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 성분 (shopping 도메인)
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  inci_name TEXT,
  function TEXT[],
  caution_skin_types TEXT[],
  common_in TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 클리닉 (clinic 도메인 — PlaceEntity 상속)
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  description JSONB,
  country TEXT DEFAULT 'KR',
  city TEXT DEFAULT 'seoul',
  district TEXT,
  location GEOGRAPHY(POINT, 4326),
  address JSONB,
  operating_hours JSONB,
  english_support TEXT DEFAULT 'none',
  clinic_type TEXT,
  license_verified BOOLEAN DEFAULT false,
  consultation_type TEXT[],
  foreigner_friendly JSONB,              -- ForeignerSupport
  booking_url TEXT,
  external_links JSONB,                  -- ExternalLink[]
  is_highlighted BOOLEAN DEFAULT false,
  highlight_badge JSONB,
  rating FLOAT,
  review_count INT DEFAULT 0,
  images TEXT[],
  tags TEXT[],
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'temporarily_closed')),
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 시술 (clinic 도메인 — BaseEntity 상속)
CREATE TABLE treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL,
  description JSONB,
  category TEXT,
  subcategory TEXT,
  target_concerns TEXT[],
  suitable_skin_types TEXT[],
  price_range JSONB,                     -- PriceRange: { min: number, max: number, currency: string (default 'KRW') }
  duration_minutes INT,
  downtime_days INT,                     -- 0 = 당일 가능
  session_count TEXT,
  precautions JSONB,                     -- LocalizedText
  aftercare JSONB,                       -- LocalizedText
  is_highlighted BOOLEAN DEFAULT false,
  highlight_badge JSONB,
  rating FLOAT,
  review_count INT DEFAULT 0,
  images TEXT[],
  tags TEXT[],
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'temporarily_closed')),
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 의사 (clinic 도메인)
CREATE TABLE doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES clinics(id),
  name JSONB NOT NULL,
  specialties TEXT[],
  languages TEXT[],
  certifications TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 클리닉-시술 관계
CREATE TABLE clinic_treatments (
  clinic_id UUID REFERENCES clinics(id),
  treatment_id UUID REFERENCES treatments(id),
  PRIMARY KEY (clinic_id, treatment_id)
);

-- 제품-매장 관계
CREATE TABLE product_stores (
  product_id UUID REFERENCES products(id),
  store_id UUID REFERENCES stores(id),
  PRIMARY KEY (product_id, store_id)
);

-- 제품-성분 관계
CREATE TABLE product_ingredients (
  product_id UUID REFERENCES products(id),
  ingredient_id UUID REFERENCES ingredients(id),
  type TEXT NOT NULL,           -- key / avoid
  PRIMARY KEY (product_id, ingredient_id)
);

-- 벡터 검색 인덱스: MVP 미생성. 데이터 규모가 작아 순차 스캔으로 충분.
-- ivfflat 인덱스는 v0.2+ 데이터 증가 시 생성 (DB-SCHEMA.md 참조).
```

> Salon(DOM-3), Restaurant(DOM-4), Experience(DOM-5) 테이블은 v0.2~v0.3에서 추가. 논리 모델은 확정.

---

# 6. 프로젝트 구조

```
essenly-kbeauty-agent/
├── src/
│   ├── app/                          # Composition Root (조합 루트)
│   │   ├── layout.tsx                # Root layout (메타데이터, pass-through)
│   │   ├── page.tsx                  # Root redirect → /[defaultLocale]
│   │   ├── globals.css               # 글로벌 스타일
│   │   ├── [locale]/                 # i18n 라우팅
│   │   │   ├── layout.tsx            # Locale layout (html/body, NextIntlClientProvider)
│   │   │   ├── page.tsx              # Landing
│   │   │   ├── onboarding/
│   │   │   │   └── page.tsx          # Onboarding (4단계)
│   │   │   ├── chat/
│   │   │   │   └── page.tsx          # Results + Chat
│   │   │   └── profile/
│   │   │       └── page.tsx          # Profile View/Edit
│   │   └── api/                      # API Routes (§4.1)
│   │       ├── auth/
│   │       │   └── anonymous/
│   │       │       └── route.ts      # POST — 익명 세션 생성
│   │       ├── profile/
│   │       │   ├── route.ts          # GET/PUT — 프로필 CRUD
│   │       │   ├── onboarding/
│   │       │   │   └── route.ts      # POST — 온보딩 데이터 저장
│   │       │   └── beauty/
│   │       │       └── route.ts      # GET — AI 뷰티 프로필 (DV-4)
│   │       ├── chat/
│   │       │   ├── route.ts          # POST — 스트리밍 대화 (§4.2)
│   │       │   └── history/
│   │       │       └── route.ts      # GET — 대화 히스토리
│   │       ├── journey/
│   │       │   └── route.ts          # POST — 여정 생성
│   │       └── kit/
│   │           └── route.ts          # POST — Kit CTA 전환
│   │
│   ├── server/                       # 서버 전용 (import 'server-only')
│   │   ├── core/                     # 시스템 인프라 — 비즈니스 무관, 수정 시 승인 필수
│   │   │   ├── ai-engine.ts          # LLM Engine (§3.2)
│   │   │   ├── knowledge.ts          # RAG search (§3.2)
│   │   │   ├── db.ts                 # Supabase server client
│   │   │   ├── config.ts             # Environment config
│   │   │   └── memory.ts             # Conversation memory (§3.4)
│   │   └── features/                 # 비즈니스 코드 — 교체 가능 (Last Leaf)
│   │       ├── chat/
│   │       │   ├── service.ts        # Chat orchestrator
│   │       │   ├── prompts.ts        # K-뷰티 시스템 프롬프트 (비즈니스)
│   │       │   └── tools/            # LLM tool handlers (§3.5)
│   │       ├── profile/
│   │       │   └── service.ts        # Profile orchestrator (DV-4 생성 포함)
│   │       ├── auth/
│   │       │   └── service.ts        # 익명 인증 (§4.1)
│   │       ├── journey/
│   │       │   └── service.ts        # 여정 관리 (§4.1)
│   │       ├── behavior/
│   │       │   └── service.ts        # 행동 로그 + 학습 선호도 (§3.4)
│   │       ├── beauty/               # 순수 함수 — DB/API 호출 금지
│   │       │   ├── judgment.ts       # 공통 판단 엔진 (§3.3, base)
│   │       │   ├── shopping.ts       # Shopping 도메인 로직 → judgment.ts
│   │       │   ├── treatment.ts      # Treatment 도메인 로직 → judgment.ts
│   │       │   └── derived.ts        # DV-1~3 계산 (순수, DV-4는 profile/service)
│   │       └── repositories/         # 데이터 접근 only — 비즈니스 로직 금지
│   │           ├── product-repository.ts
│   │           ├── treatment-repository.ts
│   │           └── knowledge-repository.ts  # RAG 검색 래핑 (core/knowledge 경유)
│   │
│   ├── client/                       # 클라이언트 전용 (import 'client-only')
│   │   ├── core/                     # 재사용 가능 UI 인프라
│   │   │   └── supabase-browser.ts   # Supabase browser client
│   │   └── features/                 # 비즈니스 UI — 교체 가능
│   │       ├── chat/
│   │       │   ├── ChatInterface.tsx
│   │       │   ├── MessageBubble.tsx
│   │       │   └── InputBar.tsx
│   │       ├── cards/                # 카드 컴포넌트
│   │       │   ├── ProductCard.tsx
│   │       │   ├── TreatmentCard.tsx
│   │       │   ├── SalonCard.tsx     # v0.2
│   │       │   ├── DiningCard.tsx    # v0.2
│   │       │   ├── ExperienceCard.tsx # v0.3
│   │       │   └── HighlightBadge.tsx
│   │       ├── onboarding/
│   │       │   ├── StepSkinHair.tsx
│   │       │   ├── StepConcerns.tsx
│   │       │   ├── StepTravel.tsx
│   │       │   ├── StepInterests.tsx
│   │       │   └── ProfileTransition.tsx
│   │       ├── profile/
│   │       │   ├── ProfileCard.tsx
│   │       │   └── ProfileConfirm.tsx
│   │       ├── layout/
│   │       │   ├── Header.tsx
│   │       │   ├── TabBar.tsx
│   │       │   └── LanguageSelector.tsx
│   │       ├── contexts/             # React Context providers
│   │       └── hooks/                # 커스텀 훅
│   │
│   ├── shared/                       # 순수 타입/상수/유틸 — 런타임 부작용 금지
│   │   ├── types/
│   │   │   ├── index.ts              # 배럴 export
│   │   │   ├── domain.ts             # 5영역 엔티티 타입
│   │   │   ├── profile.ts            # 개인화 변수 타입
│   │   │   └── api.ts                # API 요청/응답 타입
│   │   ├── constants/
│   │   │   ├── index.ts
│   │   │   ├── beauty.ts             # 뷰티 속성 상수
│   │   │   └── domains.ts            # 도메인 설정 상수
│   │   └── utils/
│   │       └── date.ts               # 날짜/다운타임 유틸
│   │
│   ├── i18n/                         # next-intl 설정
│   │   ├── routing.ts                # 라우팅 설정
│   │   └── request.ts                # 서버 설정
│   │
│   └── middleware.ts                 # Next.js 미들웨어 (i18n)
│
├── messages/                         # i18n 번역 파일
│   └── en.json                       # MVP: 영어 (v0.2에서 6개 언어 추가)
│
├── scripts/                          # 오프라인 도구 (런타임과 분리)
│   └── seed/                         # 시드 데이터 파이프라인
│
├── e2e/                              # Playwright E2E 테스트
│
├── supabase/
│   └── migrations/                   # DB migrations (§5)
│
└── public/
    └── images/
```

> **경계 가드 (런타임 강제)**:
> - `server/` 파일: 첫 줄에 `import 'server-only'` — 클라이언트 번들에 포함 시 빌드 에러
> - `client/` 파일: 첫 줄에 `import 'client-only'` — 서버 번들에 포함 시 빌드 에러
> - `shared/` 파일: 양쪽 import 금지 — 어디서든 안전하게 사용 가능해야 함
>
> **테스트**: 원본 파일과 같은 디렉토리에 colocated 배치 (예: `beauty/judgment.test.ts`, `utils/date.test.ts`)
>
> **MVP 구조 참고**: beauty/, repositories/는 기능별 중앙화 구조. v0.2(5개 도메인)에서 도메인별 폴더 구조로 재검토.

---

# 7. 개발 마일스톤

## 7.1 M0: 프로젝트 셋업 (1주)
- Next.js 프로젝트 초기화 (App Router + TypeScript)
- Tailwind CSS + 디자인 토큰 설정
- Supabase 프로젝트 생성 + 스키마 마이그레이션 (§5)
- Claude API 연동 확인
- Vercel 배포 파이프라인 설정
- 기본 프로젝트 구조 구축 (§6)

## 7.2 M1: Landing + 온보딩 (2주)
- Landing 페이지 구현 (2가지 경로 분기)
- 온보딩 4단계 UI 구현
- 프로필 데이터 수집 → Supabase DB 저장
- 프로필 확인 화면 구현
- 모바일 반응형 UI

## 7.3 M2: AI 엔진 코어 (2주)
- Claude API 통합 — 스트리밍 + tool_use (§3.2)
- 시스템 프롬프트 설계 + 테스트 (§3.2)
- Tool 정의 — search_beauty_data, get_external_links (§3.5)
- RAG 파이프라인 구축 — pgvector + 임베딩 (§3.2)
- 도출 변수 계산 로직 구현 — DV-1~4 (§3.3)

## 7.4 M3: 시드 데이터 구축 (2주, M2와 병렬)
- 제품 데이터 200건 수집/입력
- 매장 데이터 50건 수집/입력
- 클리닉 데이터 30건 수집/입력
- 시술 데이터 50건 수집/입력
- 성분/브랜드 기초 데이터 구축
- 뷰티 지식 KB 텍스트 작성
- 임베딩 생성 + 벡터 DB 적재

## 7.5 M4: 대화 + 추천 (2주)
- 대화 인터페이스 UI — 스트리밍
- 5영역 탭 UI — MVP: shopping/clinic만 활성
- ProductCard / TreatmentCard 컴포넌트
- HighlightBadge 구현 (비개입적 판단)
- 개인화 추천 로직 — Beauty Judgment Engine (§3.3)
- 외부 링크 연결 — 네이버 지도, 카카오맵, 웹사이트 (§3.5 F2)
- 경로B (즉시 대화) 플로우 구현

## 7.6 M5: 전환 + 통합 (1주)
- Kit CTA 페이지 구현
- 이메일 수집 기능
- 전체 플로우 통합 테스트
- 에지 케이스 처리
- 성능 최적화 (LLM 응답 속도, 로딩 상태)

## 7.7 M6: QA + 런칭 (1주)
- 다국어 대화 테스트 (영어 + 주요 2개 언어)
- 모바일 기기 테스트
- 보안 검토 (API 키 관리, 입력 검증)
- 분석 도구 설정 (사용량 추적)
- 프로덕션 배포
- 소프트 런칭 (제한 사용자)

## 7.8 의존성 맵

```
M0 (셋업)
 │
 ├──> M1 (Landing + 온보딩)
 │     │
 │     └──> M4 (대화 + 추천) ──> M5 (전환 + 통합) ──> M6 (QA)
 │           ↑
 ├──> M2 (AI 엔진) ─────────────┘
 │
 └──> M3 (시드 데이터) ─────────┘
```

- M2와 M3은 병렬 진행 가능
- M4는 M1 + M2 + M3 모두 필요
- 총 예상: 8~10주 (1인 또는 소규모 팀)

---

# 8. 기술 리스크 + 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| LLM 응답 지연 | UX 저하 | 스트리밍 UI + 로딩 인디케이터 + 응답 캐시 |
| LLM 비용 초과 | 운영비 | Sonnet 모델 기본, 토큰 모니터링, 사용량 제한 |
| 시드 데이터 품질 | 추천 정확도 | 핵심 200개 제품 집중, 수동 검수 |
| 부정확한 추천 | 신뢰도 | why_recommended 투명 설명, 피드백 루프 |
| 다국어 번역 품질 | UX | Claude 네이티브 다국어 + UI 텍스트 전문 번역 |
| Supabase 성능 한계 | 대규모 트래픽 시 | 쿼리 최적화, 인덱싱, 필요 시 Redis 캐시 도입 (v0.2+) |
| pgvector 검색 정확도 | 추천 품질 | 임베딩 모델 선택 검증, 메타데이터 필터 병행 |

---

# 9. 부록: 기술 결정 로그

PRD에서 확정된 비즈니스 결정에 따른 기술 구현 결정 기록.

| # | 비즈니스 결정 | 기술 구현 결정 |
|---|---|---|
| C-3 | MVP부터 프로필은 서버에 영구 저장. 클라이언트는 식별자 캐시만. | Supabase PostgreSQL 사용. localStorage에 anonymous UUID만 저장. |
| C-4 | MVP 인증은 익명만. 계정 생성은 v0.2. | Supabase anonymous auth 네이티브 지원 활용. |
| C-5 | 대화 히스토리는 서버 DB에 저장. Day 1 분석 가능. | Supabase DB messages 테이블. Redis는 v0.2+ 성능 이슈 시 도입. |
| C-6 | 다국어 텍스트는 6개 언어를 단일 객체로 관리. 언어 추가 시 엔티티 구조 변경 없음. | JSONB 단일 컬럼. `entity.name->>'en'` 패턴. |
| C-7 | budget은 level만 사용. amount/currency는 v0.2. | TEXT 타입 단일 컬럼. 드롭다운 UI와 일치. |
| A-14 | Anonymous 사용자 비활동 90일 자동 만료 + 이메일 수동 삭제 요청. | Supabase cron job 또는 Edge Function 스케줄러로 비활동 90일 데이터 자동 삭제. 삭제 대상: users, user_profiles, journeys, conversations, messages, beauty_history, learned_preferences, behavior_logs, consent_records. |
| A-15 | MVP 쿠키 기반 간이 재방문. 크로스 기기는 v0.2. | localStorage에 anonymous UUID 저장. 재방문 시 UUID로 서버 프로필 조회. 쿠키 소실 시 신규 사용자 처리. |
| M-6 | 동의 수집: Landing 배너(보관) + Kit CTA(마케팅). | consent_records 테이블 사용. Landing 최초 진입 시 배너 UI → data_retention 동의. Kit CTA 시 marketing 동의. |
