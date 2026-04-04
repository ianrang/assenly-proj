# P2-45: 동의 시점 Landing → Chat 이동

> 작성일: 2026-04-04
> 근거: TODO P2-45, mvp-flow-redesign.md §2.3, PRD §4-C, data-privacy.md §1.2
> 정본 대조: schema.dbml (DB), PRD §4-C (정책 WHAT), data-privacy.md §1.2 (구현 HOW)

---

## 1. 목적

MVP에서 Landing → Chat → 추천 → Kit CTA 전체 플로우를 검증하려면, 동의가 **실제 사용 시점(Chat)** 에서 수집되어야 자연스럽다. 현재 Landing에서 동의를 수집하면:

1. **Landing 진입 마찰**: 사용자가 Chat에 도달하기 전 동의 단계를 거침
2. **GDPR 정신과 불일치**: 데이터 처리가 시작되는 시점(Chat)이 아닌 이전 단계(Landing)에서 동의 수집
3. **불필요한 세션 생성**: Landing에서 세션을 생성하지만, 실제 데이터 처리는 Chat에서 시작

**변경**: Landing CTA → 바로 /chat 이동. Chat 진입 시 세션 미존재 감지 → 동의 UI 표시 → 동의 후 세션 생성 → 채팅 활성화.

---

## 2. 현재 상태 분석

### 2.1 현재 동의 흐름 (Landing 기반)

```
Landing CTA 클릭
  → HeroSection: showConsent=true (인라인 동의 UI)
  → "Continue" 클릭
  → LandingClient.handleConsent(): POST /api/auth/anonymous { data_retention: true }
  → 서버: signInAnonymously() → users INSERT → consent_records INSERT
  → 클라이언트: setState("consented") → router.push(/chat)
```

### 2.2 관련 파일 현황

| 파일 | 역할 | 동의 관련 코드 |
|------|------|---------------|
| `client/features/landing/HeroSection.tsx` | Hero CTA + 동의 UI | showConsent 상태, 동의 확인 UI, handleConsentConfirm |
| `client/features/landing/LandingClient.tsx` | Landing 오케스트레이터 | handleConsent() → POST /api/auth/anonymous, state: loading\|new\|consented\|returning |
| `client/features/chat/ChatInterface.tsx` | Chat 오케스트레이터 | 세션 존재를 가정 (동의 미확인) |
| `server/features/api/routes/auth.ts` | 인증 API | POST /api/auth/anonymous (변경 없음) |
| `server/features/auth/service.ts` | 세션 생성 서비스 | createAnonymousSession (변경 없음) |

---

## 3. 변경 설계

### 3.1 변경 원칙

| 원칙 | 적용 |
|------|------|
| P-2 Core 불변 | server/core/ 변경 없음 |
| P-3 Last Leaf | chat 내 동의 UI는 교체/수정해도 core 및 타 features에 무영향 |
| P-7 단일 변경점 | 동의 UI 위치 변경 = client/features/landing/ + client/features/chat/ 2곳 수정 |
| P-10 제거 안전성 | ConsentOverlay 삭제해도 타 모듈에 빌드 에러 없음 |
| R-1 | client → server import 없음 |
| R-11 | ConsentOverlay는 shared/ + client/ui/ 만 import |
| L-10 | 서버 상태 접근은 API 호출만 (fetch /api/auth/anonymous) |
| L-12 | 모바일 퍼스트 Tailwind |

### 3.2 변경 파일 목록

#### 수정 파일 (4개)

**① `client/features/chat/ChatInterface.tsx`** — 동의 게이트 추가

현재: mount → fetch history → ChatContent
변경: mount → fetch history → 401이면 ConsentOverlay 표시 → 동의 완료 후 재시도 → ChatContent

```
상태 머신:
  "checking"      → 세션 확인 중 (ChatSkeleton 표시)
  "needs-consent" → 세션 없음 → ConsentOverlay 표시
  "consenting"    → 동의 API 호출 중 (버튼 disabled)
  "ready"         → 세션 존재 → ChatContent 렌더
```

변경 범위:
- `loaded` boolean → `phase` 상태 (`"checking" | "needs-consent" | "ready"`)
- useEffect 내 fetch 401 감지 → phase="needs-consent"
- phase별 분기 렌더링: checking→ChatSkeleton, needs-consent→ConsentOverlay, ready→ChatContent
- `handleConsent` 함수 추가: POST /api/auth/anonymous → 성공 시 phase="checking" 재시도

**② `client/features/landing/HeroSection.tsx`** — 동의 UI 제거

현재: showConsent 상태 → 동의 UI 또는 CTA 버튼
변경: 항상 CTA 버튼만 표시 → 클릭 시 바로 /chat 이동

제거 항목:
- `showConsent` 상태
- `handleConsentConfirm` 함수
- `onConsent`, `isConsenting` props
- 동의 UI JSX 블록 (consent.consentNotice, consent.learnMore, consent.cancel, consent.accept)

유지 항목:
- `state`, `locale` props (재방문 판별에 여전히 사용)
- CTA 버튼 ("Start chatting")
- ctaDescription 텍스트

Props 변경: `{ state, onConsent, isConsenting, locale }` → `{ state, locale }`

**③ `client/features/landing/LandingClient.tsx`** — 동의 로직 제거

제거 항목:
- `handleConsent` 함수 (POST /api/auth/anonymous 호출)
- `isConsenting` 상태
- `"consented"` 상태 값 (세션은 있지만 프로필 없는 상태 → 이제 Chat에서 처리)

변경 항목:
- LandingState: `"loading" | "new" | "returning"` (3값)
- checkSession: `/api/profile` 200 → "returning", 그 외 → "new"
- HeroSection props에서 onConsent, isConsenting 제거

**④ `messages/en.json`** — consent 키 재사용 (변경 최소)

기존 consent.* 키는 그대로 유지 (ChatInterface에서 재사용).
`terms.consentRetention` 텍스트만 "landing page" → "chat" 문구 수정.

#### 신규 파일 (1개)

**⑤ `client/features/chat/ConsentOverlay.tsx`** — Chat 내 동의 UI

책임: 동의 안내 + Terms 링크 + Accept/Cancel 버튼
Props: `{ onConsent: () => Promise<boolean>; isConsenting: boolean; locale: string }`

import 범위 (R-11 준수):
- `@/client/ui/primitives/button` (Button)
- `@/client/ui/primitives/typography` (BodyText)
- `next-intl` (useTranslations)
- `shared/` 타입만 (필요 시)

비즈니스 로직 없음 — 순수 UI 컴포넌트. onConsent 콜백은 부모(ChatInterface)에서 주입.

구조:
```tsx
<div className="동의 오버레이 컨테이너">
  <BodyText>{tc("consentNotice")}</BodyText>
  <a href={`/${locale}/terms`}>{tc("learnMore")}</a>
  <div className="버튼 그룹">
    <Button variant="outline">{tc("cancel")}</Button>  // Landing으로 돌아가기
    <Button onClick={onConsent} disabled={isConsenting}>{tc("accept")}</Button>
  </div>
</div>
```

#### 변경 없는 파일 (명시)

| 파일 | 이유 |
|------|------|
| `server/core/*` | P-2 Core 불변 |
| `server/features/auth/service.ts` | API 동일 (호출 주체만 변경) |
| `server/features/api/routes/auth.ts` | 엔드포인트 동일 |
| `shared/*` | 타입/상수 변경 불필요 |
| `client/ui/*` | 기존 프리미티브 재사용 |

### 3.3 상태 흐름도 (변경 후)

```
신규 사용자:
  Landing → CTA 클릭 → /chat 이동 (세션 없음)
  → ChatInterface mount → fetch /api/chat/history → 401
  → phase="needs-consent" → ConsentOverlay 표시
  → "Accept" 클릭 → POST /api/auth/anonymous
  → 성공 → phase="checking" (재시도) → fetch history → 200/빈 대화
  → phase="ready" → ChatContent (인사 + 제안 질문)

재방문 사용자:
  Landing → ReturnVisitBanner → "Continue chatting" → /chat 이동
  → ChatInterface mount → fetch /api/chat/history → 200
  → phase="ready" → ChatContent (히스토리 로드)

직접 /chat 접근 (북마크):
  → ChatInterface mount → fetch /api/chat/history
  → 세션 있음 → phase="ready"
  → 세션 없음 → phase="needs-consent" → ConsentOverlay
```

### 3.4 Cancel 동작

ConsentOverlay에서 Cancel 클릭 시:
- `router.push(`/${locale}`)` → Landing으로 돌아감
- Chat 사용을 위해서는 동의가 필수이므로, 동의 없이 Chat 진행 불가

---

## 4. 설계 문서 갱신

P2-45 구현 후 아래 설계 문서의 동의 시점 기술을 갱신해야 한다.

| 문서 | 섹션 | 변경 내용 |
|------|------|----------|
| `data-privacy.md` | §1.2 동의 수집 구현 흐름 | "CTA 클릭 시 인라인 동의" → "Chat 진입 시 인라인 동의". Landing→세션 생성 흐름 → Chat→세션 생성 흐름 |
| `mvp-flow-redesign.md` | §2.3 동의 흐름 | "Landing CTA 클릭 시" → "Chat 진입 시 (첫 메시지 전)". "향후 검토 (P2-45)" 라인 제거 |
| `PRD.md` | §4-C 개인정보 보호 | "Landing CTA 클릭 시 인라인 동의" → "Chat 진입 시 인라인 동의" |
| `messages/en.json` | terms.consentRetention | "landing page" 문구 → "chat" 문구 수정 |

---

## 5. 규칙 준수 검증

### 5.1 아키텍처 원칙 (P-*)

| ID | 검증 | 결과 |
|----|------|------|
| P-1 | client/ → shared/ (DAG 준수) | ✅ |
| P-2 | core/ 수정 없음 | ✅ |
| P-3 | ConsentOverlay는 교체/삭제해도 core 및 타 features에 무영향 | ✅ |
| P-4 | cross-domain 데이터 없음 (동의 단일 도메인) | ✅ |
| P-5 | 콜 스택: ChatInterface → ConsentOverlay(UI) → fetch API. ≤4 | ✅ |
| P-7 | 동의 위치 변경 = HeroSection + LandingClient + ChatInterface + ConsentOverlay. 4파일이지만, HeroSection/LandingClient는 "제거" 방향이므로 실질 변경점은 ChatInterface 1곳 | ✅ |
| P-8 | 순환 의존 없음 | ✅ |
| P-10 | ConsentOverlay 삭제 시 타 모듈 빌드 에러 없음 | ✅ |

### 5.2 의존성 규칙 (R-*)

| ID | 검증 | 결과 |
|----|------|------|
| R-1 | client → server import 없음 | ✅ |
| R-11 | ConsentOverlay → shared/ + client/ui/ 만 import | ✅ |
| R-4 | shared/ → client/ import 없음 | ✅ |

### 5.3 레이어 규칙 (L-*)

| ID | 검증 | 결과 |
|----|------|------|
| L-0b | ConsentOverlay에 `import 'client-only'` 추가 | ✅ |
| L-10 | 서버 상태는 fetch API만 (POST /api/auth/anonymous) | ✅ |
| L-12 | 모바일 퍼스트 Tailwind | ✅ |
| L-17 | ConsentOverlay에 K-뷰티 비즈니스 용어 없음 | ✅ — 하지만 ConsentOverlay는 client/features/chat/ 위치이므로 L-17(ui/ 규칙) 미적용 |

### 5.4 AI 코드 생성 규칙 (G-*)

| ID | 검증 | 결과 |
|----|------|------|
| G-1 | 기존 코드 분석 완료 (HeroSection, LandingClient, ChatInterface, auth 전체) | ✅ |
| G-2 | 기존 consent UI 패턴을 재사용 (HeroSection → ConsentOverlay 이동) | ✅ |
| G-3 | 패스스루 래퍼 없음 | ✅ |
| G-4 | 모든 코드가 즉시 사용됨 | ✅ |
| G-5 | 기존 HeroSection의 동의 UI 패턴 따름 | ✅ |
| G-6 | core/ 수정 없음 | ✅ |
| G-8 | any 타입 없음 | ✅ |
| G-15 | 수정 전 영향 분석 완료 (§2, §3에 기술) | ✅ |

### 5.5 품질 규칙 (Q-*)

| ID | 검증 | 결과 |
|----|------|------|
| Q-5 | ConsentOverlay ≤ 200줄 (예상 ~50줄) | ✅ |
| Q-6 | handleConsent 함수 ≤ 40줄 | ✅ |
| Q-7 | fetch 에러 처리 (catch로 phase 유지) | ✅ |

### 5.6 디자인 시스템 (S-*)

| ID | 검증 | 결과 |
|----|------|------|
| S-5 | 하드코딩 없음 — Tailwind 시맨틱 토큰 사용 | ✅ |
| S-10 | Tailwind 유틸리티 + 디자인 토큰만 | ✅ |

---

## 6. 영향 분석

### 6.1 외부 코드 영향: 없음

- server/core/: 변경 없음
- server/features/auth/: 변경 없음 (API 동일, 호출 주체만 LandingClient → ChatInterface로 변경)
- shared/: 변경 없음
- client/ui/: 변경 없음 (기존 Button, BodyText 재사용)

### 6.2 비즈니스 코드 영향: 최소

- `client/features/landing/`: HeroSection, LandingClient에서 동의 코드 **제거** (단순화)
- `client/features/chat/`: ChatInterface에 동의 게이트 **추가**, ConsentOverlay **신규**

### 6.3 테스트 영향

| 파일 | 영향 |
|------|------|
| auth.test.ts, auth/service.test.ts | 변경 없음 (API 동일) |
| 기존 landing 테스트 (있다면) | 동의 관련 테스트 제거 필요 |
| ChatInterface 테스트 (있다면) | 동의 게이트 테스트 추가 필요 |

---

## 7. 구현 순서

1. **ConsentOverlay.tsx 생성** — 독립 UI 컴포넌트 (의존 없음)
2. **ChatInterface.tsx 수정** — 동의 게이트 추가 + ConsentOverlay 통합
3. **HeroSection.tsx 수정** — 동의 UI 제거, CTA 단순화
4. **LandingClient.tsx 수정** — handleConsent 제거, 상태 단순화
5. **messages/en.json 수정** — terms.consentRetention 문구 갱신
6. **설계 문서 갱신** — data-privacy.md, mvp-flow-redesign.md, PRD.md
7. **tsc --noEmit 검증** — 타입 에러 없음 확인
