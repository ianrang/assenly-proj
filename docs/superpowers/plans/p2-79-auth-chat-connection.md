# P2-79: 인증-채팅 연결 버그 수정 (세션 토큰 전달)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 클라이언트에서 Supabase SDK로 익명 세션을 생성하고, SDK가 관리하는 access_token을 모든 API 호출에 Authorization Bearer 헤더로 전달하여 인증-채팅 연결을 복구한다.

**Architecture:** auth-matrix.md §1.3 설계 정본 준수. 클라이언트 SDK 세션 관리 + 서버 Bearer 토큰 검증. 인증 fetch 유틸리티 1개 신규 + 기존 파일 수정. 코어(core/) 수정 0건.

**Tech Stack:** @supabase/ssr (기존 getSupabaseBrowserClient), AI SDK 6.x DefaultChatTransport

---

> 버전: 2.0
> 작성일: 2026-04-06
> 선행: P2-9 (익명 인증 서비스 ✅), P2-45 (동의 시점 채팅 내 이동 ✅), P2-50c (히스토리 로드 ✅)
> 정본: auth-matrix.md §1.3 (인증 아키텍처), §5.3 (세션 만료 복구), mvp-flow-redesign.md §2.3

## 1. 문제 분석

### 1.1 설계 의도 (auth-matrix.md §1.3)

```
클라이언트: signInAnonymously() → Supabase Auth → session token
            fetch('/api/*', { Authorization: Bearer <token> })
```

### 1.2 현재 구현 결함

| 단계 | 설계 의도 | 현재 구현 | 결함 |
|------|----------|----------|------|
| 세션 생성 | 클라이언트 SDK `signInAnonymously()` | **서버** `createAnonymousSession()`에서 `signInAnonymously()` | 토큰이 서버에만 존재 |
| 세션 관리 | 클라이언트 SDK 자동 관리 | `getSupabaseBrowserClient()` 미사용 | SDK 세션 복구/갱신 불가 |
| 토큰 전달 | `Authorization: Bearer <token>` 헤더 | `credentials: "include"` (쿠키 기반) | 토큰 미전달 → 401 |
| 토큰 갱신 | SDK `onAuthStateChange: TOKEN_REFRESHED` | 구현 없음 | 세션 만료 시 복구 불가 |

### 1.3 영향 범위 — `credentials: "include"` 사용 위치 전수

| 파일 | API 엔드포인트 | 인증 요구 |
|------|-------------|---------|
| `ChatInterface.tsx:43` | GET `/api/chat/history` | requireAuth |
| `ChatInterface.tsx:83` | POST `/api/auth/anonymous` | 없음 (현재) → requireAuth (변경) |
| `ChatContent.tsx:41` | POST `/api/chat` (SSE) | requireAuth |
| `KitCtaSheet.tsx:52` | POST `/api/kit/claim` | requireAuth |
| `LandingClient.tsx:31` | GET `/api/profile` | requireAuth |
| `OnboardingWizard.tsx:114` | POST `/api/profile/onboarding` | requireAuth |
| `ProfileClient.tsx:35` | GET `/api/profile` | requireAuth |

**7곳 모두** `credentials: "include"` → `Authorization: Bearer` 헤더로 전환 필요.

### 1.4 결과

모든 인증 필요 API 호출이 토큰 없이 전송 → 401 → 채팅 진입 불가, Kit CTA 불가, 프로필 불가.

## 2. 수정 설계

### 2.1 핵심 전략: 인증 fetch 유틸리티

`credentials: "include"` 7곳을 개별 수정하면 **중복 코드**가 발생하고 **G-2 위반**. 공통 유틸리티 1개를 만들어 모든 곳에서 재사용.

**신규 파일: `client/core/auth-fetch.ts`**

```typescript
import 'client-only';
import { getSupabaseBrowserClient } from './supabase-browser';

/**
 * 현재 Supabase 세션의 access_token을 반환.
 * 세션 없으면 null. SDK가 토큰 갱신 자동 처리 (auth-matrix.md §5.3).
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Authorization Bearer 헤더가 포함된 fetch.
 * auth-matrix.md §1.3: fetch('/api/*', { Authorization: Bearer <token> })
 *
 * 세션 없으면 헤더 없이 요청 (optionalAuth 엔드포인트 대응).
 */
export async function authFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}
```

**위치 근거:**
- `client/core/` — 인증은 시스템 인프라 (L-5: K-뷰티 비즈니스 용어 없음)
- `getSupabaseBrowserClient` 의존만 (client/core 내부 단방향)
- L-0b: `client-only` 경계 가드

**토큰 갱신 근거 (I-3):** Supabase SDK의 `getSession()`은 내부적으로 토큰 만료를 감지하여 자동 갱신한다 (auth-matrix.md §5.3). 별도 `onAuthStateChange` 리스너 불필요 — `getSession()` 호출 시점에 SDK가 최신 유효 토큰을 반환.

### 2.2 흐름 변경

```
[변경 전]
ConsentOverlay "Accept"
  → fetch POST /api/auth/anonymous (서버에서 signInAnonymously)
  → 토큰 body에만 반환, 클라이언트 무시
  → checkSessionAndLoad() → credentials: "include" → 401 ❌

[변경 후]
ConsentOverlay "Accept"
  → 1. getSupabaseBrowserClient().auth.signInAnonymously()  (클라이언트 세션 생성)
  → 2. SDK가 access_token 자동 관리
  → 3. authFetch POST /api/auth/anonymous + Bearer (동의 기록 + users INSERT)
  → 4. checkSessionAndLoad() + authFetch + Bearer → 200 ✅
```

## 3. 최종 수정 범위

### 3.1 신규 파일

| 파일 | 내용 | 계층 |
|------|------|------|
| `client/core/auth-fetch.ts` | getAccessToken + authFetch | client/core |
| `client/core/auth-fetch.test.ts` | 단위 테스트 | client/core |

### 3.2 수정 파일

| 파일 | 변경 | 계층 |
|------|------|------|
| `client/features/chat/ChatInterface.tsx` | handleConsent: 클라이언트 SDK signInAnonymously + authFetch. checkSessionAndLoad: authFetch 사용 | client/features |
| `client/features/chat/ChatContent.tsx` | transport: credentials→headers(Bearer 동적). 기존 fetch→제거(ChatInterface에서 히스토리 로드) | client/features |
| `client/features/chat/KitCtaSheet.tsx` | credentials:"include" → authFetch 사용 | client/features |
| `client/features/landing/LandingClient.tsx` | credentials:"include" → authFetch 사용 | client/features |
| `client/features/onboarding/OnboardingWizard.tsx` | credentials:"include" → authFetch 사용 (MVP 비활성이나 코드 일관성 유지) | client/features |
| `client/features/profile/ProfileClient.tsx` | credentials:"include" → authFetch 사용 (MVP 비활성이나 코드 일관성 유지) | client/features |
| `server/features/auth/service.ts` | createAnonymousSession → registerAnonymousUser(userId, consent). signInAnonymously 제거. INSERT→UPSERT 멱등성 보장 (Q-12) | server/features |
| `server/features/api/routes/auth.ts` | requireAuth 미들웨어 추가 + userId를 인증에서 추출. 정본 업데이트: auth-matrix.md §2.4/§3.1 동기화 (C-1) | server/features/api |
| `docs/05-design-detail/auth-matrix.md` | §2.4, §3.1: `/api/auth/anonymous` 인증 방식 "없음"→"requireAuth" 갱신 (P2-79 설계 변경 반영, D-6) | 설계 문서 |

### 3.3 수정하지 않는 파일 (독립성 보장)

| 파일 | 이유 |
|------|------|
| `server/core/*` | P-2: core 불변 |
| `shared/*` | 변경 불필요 |
| `client/core/supabase-browser.ts` | 기존 그대로 사용 |
| `client/features/chat/ConsentOverlay.tsx` | 순수 UI, 콜백 시그니처 동일 |
| `server/features/chat/*` | chat service/tools 변경 없음 |
| `server/features/api/routes/chat.ts` | 이미 requireAuth. 변경 없음 |
| `server/features/api/middleware/*` | 변경 없음 |

## 4. Task별 상세

### Task 1: auth-fetch 유틸리티 생성

- [ ] **Step 1: `client/core/auth-fetch.ts` 작성**
  - getAccessToken(): Supabase SDK getSession → access_token 추출
  - authFetch(url, init): Authorization Bearer 헤더 주입 + fetch
  - `import 'client-only'` 경계 가드 (L-0b)
  - getSupabaseBrowserClient() 의존만 (client/core 내부)

- [ ] **Step 2: `client/core/auth-fetch.test.ts` 작성**
  - getAccessToken: 세션 있음 → 토큰 반환 / 세션 없음 → null
  - authFetch: 토큰 있음 → Authorization 헤더 포함 / 토큰 없음 → 헤더 없이 요청
  - 기존 init.headers 보존 검증

### Task 2: 서버 auth service 역할 변경

- [ ] **Step 0: auth-matrix.md 정본 갱신 (C-1 해결, D-6)**
  - §2.4: `/api/auth/anonymous` 인증 "없음" → "requireAuth (P2-79: 클라이언트 SDK 세션 생성 후 인증된 상태에서 동의 기록)"
  - §3.1: 동일 행 갱신
  - D-6: 다른 설계 문서 영향 확인 (api-spec.md §2.1 동기화)

- [ ] **Step 1: `server/features/auth/service.ts` 수정**
  - `createAnonymousSession` → `registerAnonymousUser(userId: string, consent: ConsentInput)` 리네임
  - signInAnonymously() 호출 제거 (클라이언트에서 이미 완료)
  - userId를 파라미터로 받아 users UPSERT + consent_records UPSERT (Q-12 멱등성, C-2 해결)
  - users: `.upsert({ id: userId, auth_method: 'anonymous' }, { onConflict: 'id' })`
  - consent_records: `.upsert({ user_id: userId, data_retention: true }, { onConflict: 'user_id' })`
  - createServiceClient() 유지 (service_role로 UPSERT)
  - 반환: `{ user_id: string }` (session_token 불필요 — 클라이언트 SDK가 관리)

- [ ] **Step 2: `server/features/api/routes/auth.ts` 수정**
  - requireAuth 미들웨어 추가 → 인증된 사용자만 동의 기록 가능
  - `c.get('user').id` → registerAnonymousUser(userId, consent) 호출
  - 응답: 201 `{ data: { user_id }, meta: { timestamp } }`

- [ ] **Step 3: 테스트 수정**
  - `service.test.ts`: signInAnonymously mock 제거, userId 파라미터 테스트로 전환, UPSERT 멱등성 테스트 추가
  - `auth.test.ts`: requireAuth mock 추가, 인증 없음 → 401 테스트 추가

### Task 3: ChatInterface 인증 흐름 전환

- [ ] **Step 1: `ChatInterface.tsx` 수정**
  - import: getSupabaseBrowserClient + authFetch
  - handleConsent: (1) SDK signInAnonymously (2) signInError 체크 → consentError 설정 (I-2) (3) authFetch POST /api/auth/anonymous (4) checkSessionAndLoad
  - checkSessionAndLoad: fetch → authFetch 교체. 토큰 없으면 needs-consent
  - credentials: "include" 제거

- [ ] **Step 2: `ChatContent.tsx` 수정**
  - transport: credentials → headers(async Bearer 토큰 동적 주입)
  - import: getSupabaseBrowserClient (transport 콜백에서 직접 사용)

### Task 4: 나머지 클라이언트 fetch 전환

- [ ] **Step 1: `KitCtaSheet.tsx` 수정** — credentials → authFetch
- [ ] **Step 2: `LandingClient.tsx` 수정** — credentials → authFetch
- [ ] **Step 3: `OnboardingWizard.tsx` 수정** — credentials → authFetch (MVP 비활성, 일관성)
- [ ] **Step 4: `ProfileClient.tsx` 수정** — credentials → authFetch (MVP 비활성, 일관성)

### Task 5: 전체 테스트 + 검증

- [ ] **Step 1: 기존 테스트 수정** — mock 조정 (credentials → headers)
- [ ] **Step 2: `npx vitest run` 전체 통과 확인**
- [ ] **Step 3: `npx tsc --noEmit` 타입 체크 통과**
- [ ] **Step 4: credentials: "include" 잔존 검색 → 0건 확인**

## 5. 아키텍처 검증

| 규칙 | 검증 |
|------|------|
| P-1 (4계층 DAG) | client/core → shared/ 방향. client/features → client/core 방향. 역방향 없음 ✓ |
| P-2 (Core 불변) | server/core/ 수정 0건 ✓ |
| P-3 (Last Leaf) | features/auth 수정이 다른 features service에 무영향. auth-fetch는 core/ (인프라) ✓ |
| P-4 (Composition Root) | auth route가 Composition Root 역할 유지 ✓ |
| P-5 (콜 스택 ≤ 4) | client → authFetch → fetch → server (3단계). server: route → service (2단계) ✓ |
| P-7 (단일 변경점) | auth-fetch.ts 1곳 변경으로 전체 토큰 전달 방식 제어 ✓ |
| P-8 (순환 의존 금지) | auth-fetch → supabase-browser (단방향). features → core (단방향) ✓ |
| P-10 (제거 안전성) | auth-fetch.ts 삭제 시 features/ 파일 빌드 에러 (의도된 의존). core/ 무영향 ✓ |
| R-1 (client → server 금지) | client는 fetch('/api/*')만. server import 없음 ✓ |
| R-4 (shared → client 금지) | shared/ 미수정 ✓ |
| L-0b (client-only) | auth-fetch.ts에 `import 'client-only'` 추가 ✓ |
| L-5 (core에 비즈니스 용어 금지) | auth-fetch.ts: 인증 용어만 (token, session). K-뷰티 용어 없음 ✓ |
| L-10 (서버 상태 = API) | 서버 상태 접근은 authFetch 경유 ✓ |
| G-2 (중복 금지) | authFetch 1곳 정의, 7곳에서 재사용 ✓ |
| G-3 (패스스루 래퍼 금지) | authFetch는 Bearer 헤더 주입 로직 추가 — 순수 패스스루 아님 ✓ |
| G-4 (미사용 코드 금지) | authFetch 즉시 7곳에서 사용 ✓ |
| G-6 (core 수정 금지) | server/core/ 0건 ✓ |
| G-8 (any 금지) | 타입 안전 유지 ✓ |
| G-9 (export 최소화) | auth-fetch.ts: export 2개 (getAccessToken, authFetch) ✓ |
| G-15 (수정 전 영향 분석) | createAnonymousSession 호출처: auth.ts route 1곳. credentials:"include" 7곳 전수 식별 완료 ✓ |
| Q-7 (에러 불삼킴) | getSession 실패 → null → 헤더 없이 요청 → 서버 401 → 정상 에러 흐름 ✓ |
| Q-11 (복합 쓰기 원자성) | users + consent INSERT 순서 유지. 기존 동일 ✓ |
| S-* (디자인 시스템) | UI 변경 없음 ✓ |
| V-24 (수정 영향 분석) | service.ts → auth.ts route (1곳). credentials 7곳 전수 교체 ✓ |

## 6. 검증 체크리스트

```
□ auth-matrix.md §1.3 설계 정본과 구현 일치
□ 클라이언트 SDK signInAnonymously → access_token → Bearer 헤더 체인 동작
□ server/core/ 수정 0건 (P-2)
□ auth-fetch.ts: client/core에 배치, client-only 가드, export 2개
□ credentials: "include" 잔존 0건 (7곳 전수 교체)
□ server/features/auth/service.ts: signInAnonymously 제거, userId 파라미터
□ server/features/api/routes/auth.ts: requireAuth 미들웨어 추가
□ ConsentOverlay 변경 없음 (순수 UI 유지)
□ DefaultChatTransport headers: Bearer 동적 주입
□ 기존 테스트 수정 + 전체 테스트 통과
□ npx tsc --noEmit 통과
□ getSupabaseBrowserClient() 기존 싱글턴 재사용
```
