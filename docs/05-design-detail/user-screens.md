# P1-9: 사용자 앱 화면 상세

> Date: 2026-03-22
> Status: Confirmed
> Scope: 4개 페이지 (Landing, Onboarding, Profile, Chat) + 재사용 컴포넌트 + 공통 패턴

---

## 0. 범위 선언

**본 문서의 역할**: PRD §3(WHAT — 화면 요구사항)을 Phase 2 구현 가능한 명세(HOW — 컴포넌트 분해, 상태, 데이터 매핑, 인터랙션)로 변환한다.

**본 문서가 하지 않는 것**:
- 와이어프레임 재기술 → PRD §3.2~3.6 참조
- 흐름 전환 조건 재기술 → PRD §3.7 참조
- API 응답 스키마 재정의 → api-spec.md 참조
- ARIA/키보드/포커스 규칙 재기술 → accessibility.md 참조
- 개인화 변수 선택지/제약 재기술 → PRD §4-A 참조

**계층 규칙**: 모든 컴포넌트는 `client/features/` 또는 `client/ui/primitives/`에 위치. `server/`, `core/` 수정 없음.

---

## 1. 재사용 컴포넌트

> 여러 페이지에서 참조되는 컴포넌트. 각 항목에 계층 위치를 명시한다.

### 1.1 컴포넌트 간 의존성 방향

```
cards/         독립 (다른 features/ 폴더를 import하지 않음)
chat/       → cards/     (카드를 대화에 삽입)
onboarding/ → (없음)     (독립)
profile/    → (없음)     (독립)
layout/     → (없음)     (독립)

역방향 금지: cards/ → chat/ ✗, layout/ → cards/ ✗
```

모든 features/ 컴포넌트는 `ui/primitives/` (shadcn) + `shared/` import만 허용.

### 1.2 카드 데이터 출처

카드 데이터는 **Chat SSE `tool-result` 이벤트**에서 제공된다. tool handler(`search_beauty_data`)가 상세 API 응답을 조합하여 카드에 필요한 전체 필드를 반환한다. REST API 목록 응답(`GET /api/products` 등)과 필드 구성이 다를 수 있다. tool-result payload 스키마는 P1-31 (Tool 상세 설계)에서 정의.

### 1.3 ProductCard

**위치**: `client/features/cards/ProductCard.tsx`

**영역 구조**:

| 영역 | 내용 |
|------|------|
| 헤더 | 제품명 + 브랜드명 + 가격(₩) |
| 이미지 | 대표 이미지 1장 (첫번째) |
| 바디 | AI 추천 이유 (why_recommended) |
| 푸터 | 영문 라벨 배지 · 지도 링크 · 구매 링크 |
| 오버레이 | HighlightBadge (조건부) |

**tool-result → UI 매핑** (데이터 출처: Chat SSE tool-result. 필드 정의: P1-31):

| 필드 | UI 영역 | 비고 |
|------|---------|------|
| `name.[locale]` | 헤더 제목 | 현재 대화 언어 기준 |
| `brand.name.[locale]` | 헤더 부제목 | tool handler가 JOIN하여 제공 |
| `price` | 헤더 가격 | ₩ 포맷 |
| `images[0]` | 이미지 | 첫번째 = 대표 |
| `why_recommended` | 바디 | AI 생성 추천 이유. tool-result의 `reasons[]`를 LLM이 자연어로 가공 (tool-spec.md §1, system-prompt-spec.md §7). LLM 텍스트 응답에서 추출 |
| `is_highlighted` | HighlightBadge visible | VP-1: 렌더링만. 정렬/필터 미영향 (Q-2) |
| `highlight_badge` | HighlightBadge 텍스트 | null이면 비표시 |
| `english_label` | 푸터 배지 | true → "English Label" 배지 |
| `store` | 푸터 지도 링크 | AI가 맥락에 따라 1개 매장 선택 (PRD §3.5) |
| `purchase_links` | 푸터 구매 링크 | 다수 시 첫번째만 표시. 외부 링크 (새 탭) |

**상태**:

| 상태 | 표현 |
|------|------|
| 스켈레톤 | 이미지 + 3줄 텍스트 placeholder. tool-result 수신 전 |
| 정상 | 전체 영역 표시 |
| 하이라이트 | 정상 + HighlightBadge 오버레이 + 테두리 강조 (`border-primary`) |
| 이미지 에러 | 폴백 placeholder 이미지 |

### 1.4 TreatmentCard

**위치**: `client/features/cards/TreatmentCard.tsx`

**영역 구조**:

| 영역 | 내용 |
|------|------|
| 헤더 | 시술명 + 카테고리 + 가격대(₩ min~max) |
| 바디 | AI 추천 이유 + 소요 시간 + 회복 기간 |
| 경고 | 회복 기간 ≥ 잔여 체류일 50% → 경고 표시 (PRD §4-A 시술 추천 규칙) |
| 푸터 | 클리닉명 · 지도 링크 · 예약 링크 |
| 오버레이 | HighlightBadge (조건부) |

**tool-result → UI 매핑** (데이터 출처: Chat SSE tool-result. 필드 정의: P1-31):

| 필드 | UI 영역 | 비고 |
|------|---------|------|
| `name.[locale]` | 헤더 제목 | |
| `category` | 헤더 카테고리 배지 | |
| `price_min`, `price_max` | 헤더 가격대 | ₩ min~max 포맷 |
| `why_recommended` | 바디 | AI 생성 추천 이유. tool-result의 `reasons[]`를 LLM이 자연어로 가공 (tool-spec.md §1, system-prompt-spec.md §7). LLM 텍스트 응답에서 추출 |
| `duration_minutes` | 바디 소요 시간 | "약 N분" |
| `downtime_days` | 바디 회복 기간 | "회복 N일" |
| `is_highlighted` | HighlightBadge visible | VP-1: 렌더링만 (Q-2) |
| `highlight_badge` | HighlightBadge 텍스트 | null이면 비표시 |
| `clinic` | 푸터 클리닉 정보 | AI가 맥락에 따라 1개 클리닉 선택 (PRD §3.5) |
| `clinic.name.[locale]` | 푸터 클리닉명 | |
| `clinic.booking_url` | 푸터 예약 링크 | 외부 링크 (새 탭). 없으면 비표시 |

**상태**: ProductCard와 동일 패턴 (스켈레톤/정상/하이라이트) + 경고 상태. 이미지 없음 (시술 카드는 텍스트 중심).

### 1.5 HighlightBadge

**위치**: `client/features/cards/HighlightBadge.tsx`

- `is_highlighted === true && highlight_badge !== null`일 때만 표시
- 배지 텍스트 표시 + 테두리 강조
- VP-1: 시각적 강조만. 정렬/필터/검색에 절대 영향 없음 (Q-2, V-11)

### 1.6 ConsentBanner

**위치**: `client/features/layout/ConsentBanner.tsx` (신규)

- Landing 하단 고정 배너 (쿠키 배너 스타일)
- "동의" 클릭 → `POST /api/auth/anonymous` (세션 생성 + consent 기록 동시) → CTA 버튼 활성화
- "거부" 또는 무시 → CTA 비활성 유지. 배너 재표시 없음 (세션 내)
- 동의 상태는 세션에 저장. 재방문 시 세션 복구되면 배너 미표시
- 인증 흐름 상세 → auth-matrix.md §1.3 참조

### 1.7 LanguageSelector

**위치**: `client/features/layout/LanguageSelector.tsx`

- 6개 대화 언어 옵션 (en, ja, zh, es, fr, ko)
- **MVP: UI는 영어 고정. 이 셀렉터는 "대화 언어"만 변경.** AI 응답 언어가 바뀌고 UI 텍스트는 영어 유지
- shadcn `Select` primitive 사용
- 선택 시 → React Context에 언어 저장 + Chat API 요청에 `Accept-Language` 헤더 포함

### 1.8 MVP 외 카드 (v0.2+)

SalonCard, DiningCard, ExperienceCard — 도메인별 표시 필드는 PRD §3.5 참조. 카드 공통 구조(헤더/바디/푸터/오버레이)는 ProductCard와 동일 패턴. 상세 레이아웃은 v0.2 화면 설계 시 정의.

### 1.9 KPI 이벤트 발화 (ANALYTICS.md §3.2)

카드 컴포넌트와 Landing에서 behavior_logs 이벤트를 `POST /api/events`로 전송한다.

| 컴포넌트 | 이벤트 | 트리거 |
|----------|--------|--------|
| ProductCard / TreatmentCard | `card_exposure` | Intersection Observer (뷰포트 50% 진입, 1회만) |
| ProductCard / TreatmentCard | `card_click` | 카드 영역 클릭/탭 |
| 카드 푸터 링크 | `external_link_click` | 외부 링크 클릭 |
| Landing PathA 버튼 | `path_a_entry` | "Start with profile" 클릭 |

> 메타데이터 필드(필수/선택, zod 스키마): **ANALYTICS.md §3.2** 정본 참조. 이중 정의 방지.
> 이벤트 배치 전송: 1초 디바운스 후 누적 이벤트를 `POST /api/events`에 배열로 전송. 전송 실패 시 무시 (fire-and-forget).

---

## 2. 공통 패턴

### 2.1 에러 표현

| 패턴 | 사용 | 예시 |
|------|------|------|
| **토스트** (Sonner) | 비파괴적 에러. 현재 화면 유지 가능 | 프로필 저장 실패, 네트워크 일시 오류 |
| **인라인** | 특정 영역 내 에러. 재시도 가능 | Chat 스트리밍 에러 (재시도 버튼 포함), 폼 필드 검증 |
| **풀페이지** | 화면 전체 사용 불가 | 404, 서버 에러 (error.tsx) |

PRD §3.9 에러/엣지 케이스별 UI 패턴:

| 에러 상황 (PRD §3.9) | UI 패턴 | 동작 |
|---------------------|---------|------|
| 온보딩 중 이탈 | (없음 — 자동 처리) | 임시 보존 → 복귀 시 이어서 진행 |
| 위치 권한 거부 | 인라인 | Chat에서 "서울 어느 지역?" 질문으로 대체 |
| 지원하지 않는 언어 | 토스트 | 영어 폴백 안내 |
| 프로필 데이터 불완전 | (없음 — VP-3) | 있는 데이터로 추천. 추가 정보 자연스럽게 요청 |
| 세션 만료 (30분 비활동) | 풀페이지 오버레이 | "세션이 만료되었습니다" + Landing 이동 버튼. 프로필은 서버 유지 |
| 재방문 판별 실패 | (없음 — 투명 처리) | 신규 사용자로 처리 |

### 2.2 로딩 패턴

| 패턴 | 사용 |
|------|------|
| **스켈레톤** | 카드 로딩, 프로필 로딩 — 레이아웃 예측 가능할 때 |
| **스피너 + 텍스트** | 프로필 전환 디스플레이 (1~3초) — 진행 단계 표시 |
| **인라인 로딩** | Chat 입력 후 응답 대기 (타이핑 인디케이터) |

### 2.3 빈 상태 (Empty State)

| 상황 | 표현 |
|------|------|
| Chat 첫 진입 (경로A) | AI 인사 메시지 + 프로필 기반 초기 추천 |
| Chat 첫 진입 (경로B) | AI 인사 + 추천 질문 버블 3개 (PRD §3.4) |
| 탭 전환 후 결과 없음 | "아직 이 영역의 추천이 없습니다. 질문해보세요" |
| Coming soon 탭 | 회색 처리 + "Coming soon" 레이블. 클릭 불가 (PRD §3.4) |

### 2.4 레이아웃 셸

```
┌─ Header ──────────────────────────┐
│  [← Back]  [Essenly 로고]  [Lang] │  ← features/layout/Header.tsx
├───────────────────────────────────┤
│                                   │
│           <main>                  │  ← 페이지 콘텐츠
│                                   │
├───────────────────────────────────┤
│         (페이지별 하단)            │  ← Chat: InputBar / Landing: ConsentBanner
└───────────────────────────────────┘
```

- Header 좌측: 컨텍스트별 변경 (Landing: 없음, Chat: "← 프로필", Onboarding: "← Back")
- Header 우측: LanguageSelector (Landing, Chat에서만 표시)
- Skip link: 첫 focusable 요소. "Skip to main content" (accessibility.md §2.1)
- 반응형: 모바일 단일 컬럼. `md:` 이상에서 max-width 제한 (640px) + 중앙 정렬

---

## 3. Landing

> 와이어프레임: PRD §3.2 참조. 전환 조건: PRD §3.7 참조.

### 3.1 컴포넌트 트리

```
app/(user)/[locale]/page.tsx              ← SSG, Composition Root (L-2)
  └─ LandingPage                          ← features/ (page-level wrapper)
       ├─ Header                          ← features/layout/
       ├─ HeroSection                     ← features/layout/ 또는 Landing 전용
       │    ├─ 로고 + 태그라인
       │    ├─ PathAButton ("Start with my profile")
       │    └─ PathBButton ("Just ask")
       ├─ LanguageSelector                ← features/layout/
       ├─ ReturnVisitBanner (조건부)       ← features/layout/
       │    ├─ "Welcome back" 메시지
       │    ├─ ProfileConfirmButton
       │    └─ JustChatButton
       └─ ConsentBanner (조건부)           ← features/layout/
```

### 3.2 상태 매트릭스

| 상태 | 조건 | UI |
|------|------|-----|
| **신규 + 동의 전** | 프로필 없음 + 세션 없음 | HeroSection(PathA/PathB 비활성) + ConsentBanner 표시 |
| **신규 + 동의 후** | 프로필 없음 + 세션 있음 | HeroSection(PathA/PathB 활성) + ConsentBanner 숨김 |
| **재방문** | 프로필 있음 (세션 자동 복구) | ReturnVisitBanner 표시 + HeroSection 숨김 |
| **재방문 판별 실패** | 세션 소실 | 신규 + 동의 전 상태로 폴백 |

### 3.3 동의 → 세션 → CTA 활성화 시퀀스

```
1. Landing 진입 → 세션 확인 (Supabase SDK 자동 복구)
2a. 세션 복구 성공 → GET /api/profile → 200이면 재방문, 404이면 신규(동의 후)
2b. 세션 없음 → ConsentBanner 표시, CTA 버튼 비활성
3. 동의 클릭 → POST /api/auth/anonymous (consent + 세션 동시 생성)
4. 세션 수신 → ConsentBanner 숨김, CTA 버튼 활성
5. CTA 클릭 → 경로A(/onboarding) 또는 경로B(/chat) 이동
```

인증 아키텍처 상세 → auth-matrix.md §1.3 참조.
재방문 시 세션 복구 → api-spec.md §2.1 `POST /api/auth/anonymous` 비고 참조.

### 3.4 인터랙션 상세

| 액션 | 결과 |
|------|------|
| PathAButton 클릭 | `/[locale]/onboarding` 이동 |
| PathBButton 클릭 | `/[locale]/chat` 이동 (프로필 없이) |
| ProfileConfirmButton 클릭 (재방문) | `/[locale]/profile` 이동 |
| JustChatButton 클릭 (재방문) | `/[locale]/chat` 이동 (기존 프로필 적용) |
| LanguageSelector 변경 | 대화 언어 Context 업데이트. UI 영어 유지 |
| ConsentBanner 동의 | 위 시퀀스 3~4단계 실행 |

---

## 4. Onboarding

> 와이어프레임: PRD §3.3 참조. 변수 선택지/제약: PRD §4-A 참조.

### 4.1 컴포넌트 트리

```
app/(user)/[locale]/onboarding/page.tsx   ← CSR, Composition Root
  └─ OnboardingWizard                     ← features/onboarding/ (전체 위저드 관리)
       ├─ Header (← Back 포함)
       ├─ ProgressBar                      ← features/onboarding/ 또는 ui/primitives
       │    └─ "Step N/4: {단계명}" + 진행 바
       ├─ StepContent (현재 단계에 따라 교체)
       │    ├─ StepSkinHair               ← features/onboarding/
       │    ├─ StepConcerns               ← features/onboarding/
       │    ├─ StepTravel                 ← features/onboarding/
       │    └─ StepInterests              ← features/onboarding/
       └─ NavigationButtons
            ├─ BackButton (Step 1에서 숨김)
            └─ NextButton / SubmitButton (Step 4)
```

### 4.2 단계별 입력 컴포넌트 → shadcn 매핑

| 단계 | 입력 타입 | shadcn primitive | 제약 (PRD §4-A 참조) |
|------|----------|-----------------|---------------------|
| Step 1 피부타입 | 단일 선택 칩 | `Button` variant="outline" (선택 시 variant="default") | 5개 중 1개 |
| Step 1 헤어타입 | 단일 선택 칩 | `Button` variant="outline" | 4개 중 1개 |
| Step 2 피부고민 | 복수 선택 칩 | `Button` variant="outline" + 선택 카운트 | 최대 3개 (PRD §4-A JC-1) |
| Step 2 헤어고민 | 복수 선택 칩 | `Button` variant="outline" | 6개 전체 표시, 복수 선택 |
| Step 3 국가 | 드롭다운 | `Select` | ISO 3166-1 |
| Step 3 연령대 | 드롭다운 | `Select` | 선택(optional) |
| Step 3 체류일 | 드롭다운 | `Select` | 1~30일 |
| Step 3 예산 | 드롭다운 | `Select` | 4단계 |
| Step 3 여행스타일 | 복수 선택 칩 | `Button` variant="outline" | 5개 표시 (PRD §4-A JC-5) |
| Step 4 관심활동 | 복수 선택 칩 | `Button` variant="outline" | 5개 = 도메인 1:1 |

### 4.3 프로필 전환 디스플레이

**위치**: `client/features/onboarding/ProfileTransition.tsx`

Step 4 제출 후 표시. 1~3초 소요 (DV-1~4 계산).

| 단계 | 표시 |
|------|------|
| 시작 | 스피너 + "Creating your K-Beauty profile..." |
| 진행 1 | "Analyzing skin type" 체크 표시 |
| 진행 2 | "Matching ingredients" 체크 표시 |
| 진행 3 | "Finding best spots" 체크 표시 |
| 완료 | `/[locale]/profile` 자동 이동 |
| 에러 | 토스트 에러 + 재시도 버튼 |

### 4.4 상태 매트릭스

| 상태 | 조건 | UI |
|------|------|-----|
| **진행 중** | 단계 입력 중 | 현재 Step 표시 + ProgressBar |
| **제출 중** | Step 4 완료 → API 호출 | ProfileTransition 표시 |
| **에러** | API 실패 | 토스트 에러 + 현재 Step 유지 |
| **중단 복귀** | 이전에 이탈 후 재진입 | 마지막 완료 단계의 다음 단계부터 표시. 이전 입력값 복원 (PRD §3.9) |

폼 상태 관리: react-hook-form (L-11). 임시 보존: localStorage에 단계별 입력값 저장.

### 4.5 API 호출

- Step 4 제출 → `POST /api/profile/onboarding` (api-spec.md §2.3)
- 응답 성공 → ProfileTransition → `/[locale]/profile` 이동

---

## 5. Profile

> 와이어프레임: PRD §3.3 (프로필 확인) 참조.

### 5.1 컴포넌트 트리

```
app/(user)/[locale]/profile/page.tsx      ← CSR, Composition Root
  └─ ProfilePage
       ├─ Header
       ├─ ProfileCard                      ← features/profile/
       │    ├─ 기본 정보 (피부타입, 헤어, 국가, 체류 등)
       │    ├─ DerivedVariables
       │    │    ├─ DV-1 선호 성분 목록 (✓ 표시)
       │    │    ├─ DV-2 기피 성분 목록 (✗ 표시)
       │    │    └─ DV-4 AI 뷰티 프로필 요약 (텍스트)
       │    └─ ActionButtons
       │         ├─ EditButton → /onboarding (수정 모드)
       │         └─ ShowPicksButton → /chat
       └─ ProfileConfirm (재방문 시)       ← features/profile/
            └─ "프로필이 맞나요?" + ConfirmButton + EditButton
```

### 5.2 DV 표시 영역

| DV | 표시 방식 |
|----|----------|
| DV-1 선호 성분 | 체크 아이콘 + 성분명 목록 (✓ Salicylic acid, ✓ Niacinamide) |
| DV-2 기피 성분 | X 아이콘 + 성분명 목록 (✗ Alcohol) |
| DV-3 세그먼트 | 표시 안 함 (마케팅/분석용, PRD §4-A DV-3) |
| DV-4 AI 프로필 | 자연어 요약 텍스트 블록 |

### 5.3 상태 매트릭스

| 상태 | 조건 | UI |
|------|------|-----|
| **로딩** | `GET /api/profile` 호출 중 | 스켈레톤 (카드 형태) |
| **정상 (확인 모드)** | 프로필 로드 완료 | ProfileCard + ActionButtons |
| **재방문 확인** | 재방문 경로로 진입 | ProfileConfirm 추가 표시 |
| **프로필 없음** | 404 응답 | `/[locale]/onboarding`으로 리다이렉트 |

### 5.4 인터랙션 상세

| 액션 | 결과 |
|------|------|
| EditButton 클릭 | `/[locale]/onboarding` 이동 (수정 모드: 기존 값 프리필, Step 1부터 시작) |
| ShowPicksButton 클릭 | `/[locale]/chat` 이동 |
| ConfirmButton 클릭 (재방문) | `/[locale]/chat` 이동 (기존 프로필 유지) |

---

## 6. Chat (Results)

> 와이어프레임: PRD §3.4 참조. SSE 이벤트: api-spec.md §3.2 참조. Kit CTA: PRD §3.6 참조.

### 6.1 컴포넌트 트리

```
app/(user)/[locale]/chat/page.tsx         ← CSR, Composition Root
  └─ ChatPage
       ├─ Header (← 프로필 링크 포함)
       ├─ TabBar                           ← features/layout/
       │    ├─ Tab "Shops" (활성)
       │    ├─ Tab "Clinic" (활성)
       │    ├─ Tab "Salon" (비활성, "Coming soon")
       │    ├─ Tab "Eats" (비활성, "Coming soon")
       │    └─ Tab "Exp" (비활성, "Coming soon")
       ├─ MessageList                      ← features/chat/
       │    ├─ MessageBubble (AI)          ← features/chat/
       │    │    └─ 텍스트 (스트리밍)
       │    ├─ MessageBubble (User)
       │    ├─ ProductCard (인라인)         ← features/cards/
       │    ├─ TreatmentCard (인라인)      ← features/cards/
       │    ├─ KitCtaCard (인라인)         ← features/chat/ (에센리 하이라이트)
       │    ├─ SuggestedQuestions (경로B)   ← features/chat/
       │    └─ StreamingIndicator          ← features/chat/
       ├─ InputBar                         ← features/chat/
       │    ├─ Textarea (Enter=전송, Shift+Enter=줄바꿈)
       │    └─ SendButton
       └─ KitCtaSheet (Bottom sheet)       ← features/chat/
            ├─ 키트 설명
            ├─ EmailInput + 마케팅 동의 Checkbox
            ├─ ClaimButton
            └─ SuccessView (제출 후)
```

### 6.2 탭 동작

- MVP 활성 탭: Shops (DOM-1), Clinic (DOM-2)
- 비활성 탭 3개: 회색 처리 + "Coming soon" 텍스트. 클릭 불가 (`disabled`)
- 탭 전환 시 MessageList 필터링: 해당 도메인 카드만 표시. 텍스트 메시지는 모든 탭에 표시
- 반응형: 모바일 가로 스크롤. `md:` 이상 전체 표시

### 6.3 경로B 초기 상태

프로필 없이 Chat 진입 시:

1. AI 인사 메시지 버블: "Hi! I'm your K-Beauty guide in Seoul..." (PRD §3.4)
2. SuggestedQuestions: 3개 추천 질문 버블 (클릭 → 해당 질문으로 자동 전송)
3. 점진적 개인화: 대화 중 UP-1 + JC-1(1개+) 추출 시 저장 제안

**프로필 저장 제안 UI**: AI 메시지 버블 내 인라인 제안. "I noticed you have oily skin and are concerned about acne. Want me to save this as your profile?" + [Save] [Not now] 버튼. Save → `POST /api/profile/onboarding` (추출된 변수만).

> **자동 갱신 고지 설계 결정**: Save 후 대화에서 추출된 선호도(learned_preferences)는 자동으로 프로필에 반영된다 (api-spec.md §3.4 step 11 조건부 저장). 별도 UI 고지 불필요 — 대화 기반 학습은 서비스 핵심 가치이며 사용자 기대에 부합. 이용약관에 "대화에서 공유된 뷰티 관련 정보는 추천 개선에 활용됩니다" 문구 포함 (Phase 2 이용약관 작성 시).

### 6.4 스트리밍 UI 상태 전이

```
idle → submitted → streaming → [card-rendering] → complete
                                                 → error
```

| 상태 | SSE 이벤트 (api-spec §3.2) | UI 표현 |
|------|---------------------------|---------|
| **submitted** | (전송 직후) | 사용자 버블 추가 + StreamingIndicator ("AI is responding...") |
| **streaming** | `text-delta` | AI 버블에 텍스트 점진적 추가 + 자동 스크롤 |
| **card-rendering** | `tool-result` | 카드 스켈레톤 → 데이터 수신 → 카드 렌더링 |
| **complete** | `finish` | StreamingIndicator 제거. 입력 활성화 |
| **error** | `error` | 아래 에러별 처리 |

### 6.5 스트리밍 에러 복구

| 에러 코드 (api-spec §3.3) | UI 표현 | 위치 |
|--------------------------|---------|------|
| `CHAT_LLM_TIMEOUT` | "응답이 지연되고 있습니다" + [재시도] 버튼 | AI 버블 영역 (인라인) |
| `CHAT_LLM_ERROR` | "일시적 오류가 발생했습니다" + [재시도] 버튼 | AI 버블 영역 (인라인) |
| `CHAT_RATE_LIMITED` | "잠시 후 다시 시도해주세요" + 남은 시간 표시 | InputBar 위 (인라인). 입력 비활성화 |

재시도: 마지막 사용자 메시지를 동일하게 재전송.

### 6.6 Kit CTA

**트리거**: 에센리 하이라이트 카드(KitCtaCard) 내 "Claim" 버튼 (PRD §3.6 — 유일한 트리거).

**KitCtaCard** (인라인, Chat 대화 흐름 내):
- 에센리 자사 제품 하이라이트 카드. ProductCard와 유사하나 "Free starter kit" CTA 강조
- Claim 버튼 클릭 → KitCtaSheet (Bottom sheet) 열림

**KitCtaSheet** (Bottom sheet):

| 상태 | UI |
|------|-----|
| 입력 | 키트 설명 + EmailInput (`autocomplete="email"`) + 마케팅 동의 Checkbox + ClaimButton + "Back to results" 닫기 버튼 (PRD §3.6) |
| 제출 중 | ClaimButton 로딩 상태 |
| 성공 | "Thank you!" + 안내 텍스트 + "Back to results" 버튼 |
| 에러 | 토스트 에러 + 입력 상태 유지 |

API: `POST /api/kit/claim` (api-spec.md §2.5). 포커스 트랩: Radix Sheet 내장 (accessibility.md §4).

### 6.7 상태 매트릭스

| 상태 | 조건 | UI |
|------|------|-----|
| **빈 대화 (경로A)** | 프로필 있음 + 대화 없음 | AI 인사 + 프로필 기반 초기 추천 |
| **빈 대화 (경로B)** | 프로필 없음 + 대화 없음 | AI 인사 + 추천 질문 3개 |
| **대화 중** | 메시지 있음 | MessageList + InputBar 활성 |
| **스트리밍** | AI 응답 중 | StreamingIndicator + 입력 비활성 |
| **에러** | LLM 에러 | §6.5 에러별 처리 |
| **Rate limited** | 요청 초과 | InputBar 비활성 + 남은 시간 표시 |
| **Kit CTA 열림** | Bottom sheet 활성 | KitCtaSheet 오버레이. 배경 스크롤 잠금 |

### 6.8 Chat 상태 관리

- 대화: `useChat` (Vercel AI SDK — L-11)
- Kit CTA 폼: `react-hook-form` (L-11)
- 프로필 컨텍스트: React Context (L-11)
- 서버 상태 접근: API 호출만 (L-10). server/ 직접 import 금지

---

## 참조 문서 색인

| 문서 | 참조 내용 |
|------|----------|
| PRD §3.2~3.6 | 화면 와이어프레임 |
| PRD §3.7 | 흐름 전환 조건 13개 |
| PRD §3.8 | 경로별 데이터 상태 |
| PRD §3.9 | 에러/엣지 케이스 6개 |
| PRD §4-A | 개인화 변수 15개 선택지/제약 |
| PRD §3.5 | 카드 UI 요구사항 (5개 타입, 공통 구조) |
| api-spec.md §2 | API 응답 JSON 스키마 |
| api-spec.md §3.2~3.3 | SSE 이벤트 타입, 에러 코드 |
| accessibility.md | WCAG 2.1 AA, 키보드/ARIA/포커스/터치 규칙 |
| auth-matrix.md §1.3 | 인증 아키텍처 (anonymous → 세션 → RLS) |
| sitemap.md §2 | URL 구조, 네비게이션 플로우 |
| ui-framework.md §5 | shadcn 컴포넌트 18개 목록, client/ui/ 계층 |
| seo-strategy.md | Landing generateMetadata, OG 이미지 |
