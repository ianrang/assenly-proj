# 에센리 K-뷰티 AI 에이전트 — DB 스키마

> 버전: 1.1
> 최종 갱신: 2026-03-17
> 상위 문서: TDD v1.3 §4 (데이터 모델 개요)
> 용도: SQL DDL 상세 정의. Supabase Migration 파일의 원본.

---

## 설계 규칙

- 다국어 텍스트: LocalizedText → JSONB 단일 컬럼 (6개 언어). `entity.name->>'en'` 패턴
- 국가 독립: PlaceEntity에 country/city 컬럼 (VP-2)
- 벡터 확장: embedding vector(1024) 컬럼 유지, MVP 인덱스 미생성 (v0.2+)
- 비개입적 판단: is_highlighted는 배지 표시용. 검색/정렬 로직에 미사용 (VP-1)

---

## SQL DDL

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

-- 벡터 검색 인덱스: MVP 미생성. embedding 컬럼은 v0.2+ 확장용 유지.
```

---

> Salon(DOM-3), Restaurant(DOM-4), Experience(DOM-5) 테이블은 v0.2~v0.3에서 추가. 논리 모델은 확정.
