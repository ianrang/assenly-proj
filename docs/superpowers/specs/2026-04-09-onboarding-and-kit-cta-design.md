# Onboarding + Kit CTA Redesign

**날짜**: 2026-04-09
**상태**: 설계 확정, 구현 대기
**범위**: MVP 소프트 런칭 전 적용
**관련 태스크**: P3-3 (Kit CTA 플로우), 신규 (채팅 내 온보딩)

---

## 1. 배경

### 1.1 현재 상태의 문제점

QA 검증(2026-04-09) 결과 두 가지 핵심 문제가 발견되었다.

**문제 1: 온보딩 부재**

- P2-47에서 Chat-First 전환 결정으로 4단계 OnboardingWizard가 비활성화됨
- AI가 대화 중 자연스럽게 프로필을 수집하도록 설계되었으나, 실제로는 일관성이 없음
- 100명의 유저가 채팅을 시작하면 100명 모두 다른 수준의 프로필을 갖게 됨
- 결과: 첫 응답부터 개인화된 추천 제공 불가능, 유저 가치 저하

**문제 2: Kit CTA 노출 운에 의존**

- 현재 Kit CTA 트리거 = `is_highlighted=true` 상품이 AI 검색 결과에 포함될 때
- 유일한 highlighted 상품 = "Essenly Keratin Hair Mask" (헤어 카테고리)
- 유저 질문의 90%는 스킨케어(건조, 모공, 노화) 관련 → Kit CTA 영원히 노출 안 됨
- 결과: 첫 번째 수익 모델("에센리 키트 판매") 검증 불가능

### 1.2 해결 원칙

1. **일관성**: 모든 유저가 동일한 시작 경험 + 동일한 카드 패턴
2. **자연스러움**: 광고 느낌 배제, 유저가 원할 때 액션
3. **VP-1 준수**: 추천 순위는 변경하지 않음, 시각적 강조만
4. **MVP 범위 유지**: 신규 인프라(이메일 자동화, 결제 등) 도입 없음

---

## 2. 결정 사항

### 2.1 온보딩: 채팅 내 인라인 선택 UI

> **v2 (2026-04-15, NEW-9b)**: 초기 구현(v1)이 concerns 5종/MAX 2로 확정되었으나 PRD §4-A §595 정본은 7종/MAX 3 이다. v2는 정본에 맞춰 정정하고, 무결성·중복·재표시 게이트 이슈를 해결한다. 정본 우선순위(D-11): `PRD.md §4-A` > 본 문서. 본 §2.1은 PRD를 정본으로 참조하는 상세 설계다.

**위치**: ConsentOverlay 통과 후, 빈 채팅 화면 진입 시 첫 메시지 자리에 표시

**필드 수집 범위** (PRD §4-A 정본 준수):

| 필드 | 타입 | 제약 | 저장 위치 | 근거 |
|---|---|---|---|---|
| `skin_type` (UP-1) | 단일 선택, 필수 | 5종: dry/oily/combination/sensitive/normal | `user_profiles.skin_type` | PRD §578 |
| `skin_concerns` (JC-1) | 다중 선택, 권장 | **7종 표시** (acne, wrinkles, dark_spots, redness, dryness, pores, dullness), **최대 3개** | `journeys.skin_concerns` | PRD §589, §595 |

나머지 4개 concerns(dark_circles/uneven_tone/sun_damage/eczema)는 칩 UI에서 제외 — 대화 중 `extract_user_profile` tool이 자동 수집(VP-3 점진적 개인화).

JC-2~5(interest_activities, stay_days, budget_level, travel_style)는 **수집하지 않음** — 5영역 도메인 탭 UI(v0.2 P2-36)가 등장할 때 별도 mini-onboarding에서 수집한다(D2-a 결정).

**구성**:

```
┌─────────────────────────────────┐
│  Essenly                        │
├─────────────────────────────────┤
│                                 │
│  👋 Hi! Before we start, tell  │
│  me a bit about your skin.     │
│  (or skip and just chat)       │
│                                 │
│  Your skin type:                │
│  ┌─────┐ ┌─────┐ ┌────────────┐│
│  │ Dry │ │Oily │ │Combination ││
│  └─────┘ └─────┘ └────────────┘│
│  ┌─────────┐ ┌────────────────┐│
│  │Sensitive│ │Normal/Not sure ││
│  └─────────┘ └────────────────┘│
│                                 │
│  Top skin concerns (pick ≤3):   │
│  ┌─────┐┌──────┐┌──────────┐   │
│  │Acne ││Wrinkl││Dark spots│   │
│  └─────┘└──────┘└──────────┘   │
│  ┌───────┐┌───────┐┌───────┐   │
│  │Redness││Drynes ││Pores  │   │
│  └───────┘└───────┘└───────┘   │
│  ┌──────────┐                   │
│  │Dullness  │                   │
│  └──────────┘                   │
│                                 │
│  ┌──────────────────────┐      │
│  │   Start chatting →   │      │
│  └──────────────────────┘      │
│                                 │
│  Skip — I'll just chat ↓       │
│                                 │
├─────────────────────────────────┤
│ Ask me anything about K-beauty… │
└─────────────────────────────────┘
```

**핵심 동작**:

1. 채팅 화면 안에서 표시 (별도 페이지/모달 아님)
2. 칩 UI: 단일 선택(skin_type, 5종 필수) + 다중 선택(skin_concerns, **최대 3개** 권장)
3. "Start chatting" 버튼 = 선택 저장 후 AI가 개인화 인사
4. "Skip" 링크 = API 호출로 **완료 상태만 기록**, AI 기본 인사 + SuggestedQuestions 표시
5. **재표시 판정**: `showOnboarding = initialMessages.length === 0 && !profile.onboarding_completed_at`. `onboarding_completed_at`이 단일 진실 공급원(아래 §2.1 데이터 모델 참조)

**재사용 자산** (G-2 중복 금지):

- `SKIN_TYPES` 상수 → `shared/constants/beauty.ts:17` (이미 존재)
- `ONBOARDING_SKIN_CONCERNS` 상수 → `shared/constants/beauty.ts:102` (7종 정본, 이미 존재)
- `MAX_ONBOARDING_SKIN_CONCERNS = 3` → `shared/constants/beauty.ts:99` (이미 존재)
- `OptionGroup` 컴포넌트 → `client/ui/primitives/option-group.tsx` (NEW-9b에서 `features/onboarding/`에서 승격)
- i18n: `onboarding.skinType_*`, `onboarding.skinConcern_*`, `onboarding.skinConcernsCount` (이미 존재, 양 로케일 번역됨)
- 신규 i18n 키: `chat.onboarding.greeting`, `chat.onboarding.skipHint`, `chat.onboarding.start`, `chat.onboarding.skip`, `chat.onboarding.saving`, `chat.onboarding.error` (6 키)

**데이터 모델** (NEW-9b 마이그레이션 014):

```sql
-- user_profiles
ADD COLUMN onboarding_completed_at timestamptz  -- NULL=미완료/미스킵, NOT NULL=완료(Start 또는 Skip)

-- journeys
CREATE UNIQUE INDEX ux_journeys_user_active
  ON journeys(user_id) WHERE status='active'
```

**저장 흐름 — Start chatting 경로**:

```
POST /api/profile/onboarding
body: { skin_type: "dry", skin_concerns: ["acne","dryness"] }

Handler (Composition Root, P-4):
1. upsertProfile(client, userId, { skin_type, ... })          ← user_profiles
2. createOrUpdateJourney(client, userId, { skin_concerns, ... }) ← journeys (Q-12 멱등)
3. markOnboardingCompleted(client, userId)                    ← WHERE onboarding_completed_at IS NULL
                                                                 (one-shot, 불변량 I4)
4. 201 { profile_id, journey_id, onboarding_completed: true }
```

**Skip 흐름**:

```
POST /api/profile/onboarding
body: { skipped: true }

Handler:
1. upsertProfile with language only (minimal)                 ← user_profiles row 생성
2. journey 생성 skip (concerns 없음)
3. markOnboardingCompleted(client, userId)                    ← Skip도 "완료된 게이트"
4. 201 { profile_id, journey_id: null, onboarding_completed: true }
```

**실패 시 자기 치유**:

`markOnboardingCompleted`를 **반드시 마지막 단계**로 실행. 1/2단계 실패 시 `onboarding_completed_at`이 NULL로 유지되어 다음 세션에서 칩이 재표시되며, 재제출은 upsert/journey update 멱등성(Q-12) + markOnboardingCompleted 원샷(IS NULL) 덕분에 안전하게 자기 치유된다.

**경합 방어**:

`ux_journeys_user_active` 부분 유니크 인덱스로 동시 INSERT 시 23505 발생. `createOrUpdateJourney`는 unique_violation catch → 재조회 → UPDATE 1회 재시도한다.

**클라이언트 흐름**:

1. `ChatInterface`가 `/api/chat/history` 와 `/api/profile` 을 병렬 조회
2. profile fetch 결과 해석:
   - 200 → `onboarding_completed_at`에서 판정
   - 404 → 신규 사용자, `completed=false`
   - 500/network → **fail-closed**: `completed=true` (칩 미표시, UX 안전)
3. `ChatContent`에 `initialOnboardingCompleted: boolean` 주입
4. `showOnboarding = initialMessages.length === 0 && !initialOnboardingCompleted`
5. 칩 컴포넌트 제출 성공 시 콜백으로 상위 상태 `completed=true` 업데이트
6. 제출 실패 시 에러 메시지 + 재시도 버튼 (자동 onComplete 금지)

**AI 첫 메시지 변경**:

```
(Skip한 경우)
"Hi! I'm your K-beauty guide. Ask me anything about
products, treatments, or where to shop in Seoul."

(온보딩 완료한 경우)
"Hi! I see you have dry, sensitive skin and you're
worried about dryness. Let's find some products that'll
work for you. Want to start with cleansers, moisturizers,
or something else?"
```

이 동작은 시스템 프롬프트의 `buildUserProfileSection`이 이미 처리하므로 추가 코드 변경 불필요.

### 2.2 Kit CTA: 통합 카드 방식

**원칙**: 에센리 상품 카드 = Kit 신청 카드 (별도 카드 없음)

**현재 구조 vs 신규 구조**:

```
[현재 — 별도 카드 2개]
┌─────────┐ ┌─────────┐ ┌──────────┐
│ COSRX   │ │Innisfree│ │ Essenly  │
│ Snail   │ │Green Tea│ │ Mask     │
└─────────┘ └─────────┘ └──────────┘
┌──────────────────────────┐
│ Essenly Mask              │
│ Free Starter Kit          │  ← 별도 카드
│ ✓ Matched...              │
│ [Claim my free kit]       │
└──────────────────────────┘

[신규 — 통합 카드]
┌─────────┐ ┌─────────┐ ┌──────────────────┐
│ COSRX   │ │Innisfree│ │ ⭐ Essenly Pick  │
│ Snail   │ │Green Tea│ │ Keratin Mask    │
│ ₩15,000 │ │ ₩18,000 │ │                  │
│         │ │         │ │ ✨ Free starter │
│         │ │         │ │   kit available │
│ [Buy →] │ │ [Buy →] │ │ [Get free kit→] │
└─────────┘ └─────────┘ └──────────────────┘
```

**시각적 구분**:

- 일반 상품 카드: 기본 보더, "Buy Online" 액션
- 에센리 상품 카드: 강조 보더(`border-primary`), 좌상단 "Essenly Pick" 배지, "Get free kit" 액션
- 카드 크기/비율은 동일 (가로 스크롤 일관성)

**컴포넌트 변경**:

- `KitCtaCard.tsx` — 삭제
- `card-mapper.ts` — `kit-cta-card` 파트 생성 로직 제거 (mapProductCard line 147~154)
- `group-parts.ts` — `kit-cta-card` 타입 분기 제거
- `MessageList.tsx` — `StandalonePart` 함수 제거 (kit-cta-card 전용이었음)
- `ProductCard.tsx` (compact variant) — 다음 변경:
  - `is_highlighted=true` 시 보더 강조 + 배지 표시 (이미 일부 구현됨)
  - 액션 영역: `is_highlighted` 분기로 "Buy Online" / "Get free kit" 선택
  - "Get free kit" 클릭 시 `onKitClaim()` 콜백 호출
- `KitCtaSheet.tsx` — 그대로 유지 (이메일 + 마케팅 동의 시트)
- `MessageList.tsx`의 `KitCtaSheet` 상태 + `setSheetOpen` 콜백은 유지, ProductCard에 전달

**P-7 (단일 변경점) 준수**: 변경 파일 5개. 모두 단일 도메인(chat 카드 렌더링) 내부.

### 2.3 노출 빈도 보장 (서비스 관점)

문제: 에센리 상품이 1개(헤어 마스크)뿐이라, 헤어 관련 검색에서만 노출됨.

**MVP 해결책 (코드 변경 없음)**:

- 현 상태 유지 (1개 상품, 헤어 카테고리 전용)
- 소프트 런칭 시 전환율 데이터 수집 (해당 상품 노출 시 Kit CTA 클릭률)

**v0.2 해결책 (이 설계 범위 외)**:

- 에센리 자체 상품 카테고리별 점진 확장 (스킨케어, 마스크팩, 립케어)
- 각 카테고리 1개씩 추가 → AI 검색 결과 노출 확률 증가
- 여전히 통합 카드 방식 유지, 동일한 UX 패턴

**v0.3+ 백로그 (참고)**:

- 다브랜드 샘플 키트 모델 검토 (다른 K-뷰티 브랜드와 협업)
- 샘플 → 본 제품 구매 전환 funnel 추적
- B2B 리포트 데이터 소스로 활용

### 2.4 MVP 범위 외 항목

이 설계에서 명시적으로 제외:

- ❌ 자동 이메일 발송 (SendGrid 등)
- ❌ Kit 재고 관리 시스템
- ❌ 결제 처리
- ❌ 다브랜드 샘플 큐레이션
- ❌ 운영팀 백오피스 (Kit 신청 목록 관리 UI)

이 항목들은 v0.2 이후 별도 검토. MVP는 **이메일 수집 + DB 저장 + 운영팀 수동 후속**.

---

## 3. 데이터 모델 영향

### 3.1 변경 없음

기존 테이블 그대로 사용:

- `user_profiles`: skin_type, hair_type, concerns 등 (이미 nullable로 부분 업데이트 가능)
- `kit_claims`: email, marketing_consent, conversation_id, claimed_at (기존 구현)
- `products`: is_highlighted, highlight_badge (기존 VP-1 구조)

### 3.2 API 엔드포인트 변경 없음

- `POST /api/profile/onboarding`: 기존 엔드포인트 재사용. 일부 필드만 보내도 동작
- `POST /api/kit/claim`: 변경 없음

---

## 4. 작업 분해 (구현 단계 — 다음 플랜에서 상세화)

### Phase 1: 통합 카드 (Kit CTA)

1. `KitCtaCard.tsx` 삭제
2. `card-mapper.ts` — `mapProductCard`에서 kit-cta-card 생성 로직 제거
3. `card-mapper.ts` — `KitCtaCardPart` 타입 정의 제거, `ChatMessagePart` 유니온 단순화
4. `group-parts.ts` — `kit-cta-card` 분기 제거, `groupParts` 단순화 (text + cards만)
5. `MessageList.tsx` — `StandalonePart` 컴포넌트 + 관련 분기 제거
6. `MessageList.tsx` — `KitCtaSheet` open 상태는 유지, `onKitClaim` 콜백을 ProductCard로 전달
7. `ProductCard.tsx` (compact variant) — `is_highlighted` 분기로 액션 버튼 변경
8. 테스트 업데이트: `MessageList.test.ts`, `card-mapper.test.ts`

### Phase 2: 채팅 내 온보딩

1. `OnboardingChips.tsx` 신규 컴포넌트 — 칩 UI + Skip 링크
2. `ChatContent.tsx` — 빈 채팅 + 프로필 미존재 시 OnboardingChips 표시 (현재 SuggestedQuestions 위치)
3. `OnboardingChips` 완료 시 `POST /api/profile/onboarding` 호출 → 프로필 저장 → 컴포넌트 숨김
4. Skip 시 SuggestedQuestions 표시 (현재 동작)
5. 시스템 프롬프트는 이미 프로필 기반 인사를 처리하므로 변경 불필요
6. 테스트 추가: 온보딩 완료 → 프로필 저장 → 채팅 시작

### Phase 3: 검증

1. Playwright E2E: 온보딩 → 채팅 → 에센리 상품 검색 → Kit CTA 시트 → 이메일 제출
2. 모바일 뷰포트(375x812)에서 칩 UI 레이아웃 확인
3. Skip 경로 검증 (프로필 없이 채팅 시작)

---

## 5. 성공 기준

### 정량

- 100% 유저가 동일한 온보딩 진입점 경험 (선택/Skip 모두 명확)
- Kit CTA 노출 시 클릭률 측정 가능 (소프트 런칭 데이터 수집)
- 변경 영향 파일 ≤ 10개 (단일 변경점 원칙)

### 정성

- 신뢰도: Kit CTA가 광고처럼 느껴지지 않음 (상품 카드의 일부)
- 일관성: 일반 상품 = "Buy", 에센리 상품 = "Get free kit" (동일 패턴)
- 자연스러움: 온보딩이 채팅의 시작 단계로 느껴짐 (별도 페이지 단절감 없음)

---

## 6. 위험 및 완화

| 위험 | 영향 | 완화 |
|------|------|------|
| 온보딩 칩 UI에서 유저가 이탈 | 중 | Skip 옵션 명시적 제공, 1~2단계로 최소화 |
| 에센리 상품이 검색에 안 나옴 | 중 | MVP는 헤어 카테고리 한정, v0.2 카테고리 확장 |
| 통합 카드 변경으로 기존 테스트 깨짐 | 낮 | 테스트 동시 업데이트, 회귀 테스트 작성 |
| OnboardingWizard 코드와 중복 | 낮 | OnboardingWizard는 v0.2 위해 유지, 신규 OnboardingChips는 별개 컴포넌트 |

---

## 7. 향후 검토 (이 설계 범위 외)

- v0.2: 에센리 상품 카테고리 확장 전략 (어떤 카테고리부터, 몇 개씩)
- v0.2: Kit 신청 후 자동 이메일 발송 시스템 (SendGrid)
- v0.3: 다브랜드 샘플 모델 검토 (협업 협상, 법적 검토)
- v0.3: Kit 신청 → 본 제품 구매 conversion funnel 추적

---

## 8. 검토 체크리스트

- [x] D-1 교차 문서 원문 대조: PRD §2.3 수익 모델, §3.8 Kit CTA, schema.dbml 확인 완료
- [x] D-2 3-시나리오 시뮬레이션: (1) 온보딩 완료 (2) Skip (3) 에센리 검색 안 됨 — 모두 정의됨
- [x] D-3 계층 책임: client/features/chat/ 내부 변경, 새 도메인 추가 없음
- [x] D-4 데이터 모델 호환: 기존 테이블/API 그대로 사용
- [x] D-5 처리 흐름 추적: 온보딩 → 프로필 저장 → AI 응답 / 에센리 상품 → 통합 카드 → 시트 → 클레임
- [x] D-9 누락 검증: hair_type, travel_dates는 v0.2 (현재는 skin_type + concerns만 핵심)
