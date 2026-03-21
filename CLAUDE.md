# 에센리 K-뷰티 AI 에이전트 — 코드 표준

> 이 문서의 모든 규칙은 코드 생성/수정 시 반드시 준수한다. 위반 시 코드 리뷰에서 거부된다.

## 프로젝트

- 앱: K-뷰티 AI 의사결정 보조 웹 앱 (외국인 2040 여성 여행객 대상)
- 스택: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase · Vercel AI SDK 6.x
- 상태 관리: useChat + react-hook-form + React Context (Zustand/Redux 금지)
- 별칭: `@/server`, `@/client`, `@/shared`
- 설계 문서: `docs/03-design/PRD.md`(WHAT) · `docs/03-design/TDD.md`(HOW) · `docs/03-design/DB-SCHEMA.md`

---

## §1. 아키텍처 원칙 (P-*)

| ID | 원칙 | 설명 |
|----|------|------|
| P-1 | 4계층 DAG | `app/ → server/, client/ → shared/`. 역방향 import 금지 |
| P-2 | Core 불변 | `core/` 모듈은 비즈니스 변경으로 수정 금지. 비즈니스가 core를 호출한다 |
| P-3 | Last Leaf | `features/` 모듈은 교체/수정해도 core 및 다른 features service에 무영향 |
| P-4 | Composition Root | `app/`이 조합 루트. cross-domain 데이터 조회 → service에 파라미터 전달. service 간 직접 호출/import 금지 |
| P-5 | 콜 스택 ≤ 4 | route → service → tool/domain → repository/core. 최대 4단계 |
| P-6 | 바인딩 ≤ 4 | 정적 의존 체인 최대 4단계. shared/(타입/상수/유틸)는 카운트 제외 |
| P-7 | 단일 변경점 | 하나의 기능 변경은 1~2개 파일 수정. 3개 이상이면 설계 재검토 |
| P-8 | 순환 의존 금지 | 모든 import는 단방향. A→B이면 B→A 불가 |

---

## §2. 의존성 규칙 (R-*)

### 2.1 계층 간 의존성

| ID | 규칙 | 강제 수단 |
|----|------|----------|
| R-1 | `client/` → `server/` import 금지 | `import 'server-only'` → 빌드 에러 |
| R-2 | `server/` → `client/` import 금지 | `import 'client-only'` → 빌드 에러 |
| R-3 | `core/` → `features/` import 금지 | ESLint `no-restricted-imports` |
| R-4 | `shared/` → `server/`, `client/` import 금지 | ESLint `no-restricted-imports` |

### 2.2 features/ 내부 의존성

| ID | 규칙 | 허용 import |
|----|------|------------|
| R-5 | service.ts — 오케스트레이터 | 자기 도메인 내부 + beauty/ + core/ + shared/. 타 도메인 데이터는 route handler에서 파라미터로 수신 (P-4) |
| R-6 | tool handler — LLM 콜백 (유일한 예외) | repositories/ + beauty/ + shared/. LLM 콜백 특성상 직접 import 허용 |
| R-7 | beauty/*.ts — 순수 함수 | beauty/ 내부(단방향만) + shared/ ONLY. DB/API 호출 금지 |
| R-8 | repositories/*.ts — DB CRUD | core/db/ + shared/ ONLY. 비즈니스 로직 금지 |
| R-9 | service → 타 도메인 service/repository 금지 | cross-domain 데이터는 route handler에서 파라미터로 전달 (P-4) |
| R-10 | tool → service 역호출 금지 | tool(③)에서 service(②) 재호출 불가 |

### 2.3 beauty/ 내부 단방향 규칙

```
derived.ts   ──→ (없음)        ✓  (독립 — shared/ types만 참조)
shopping.ts  ──→ judgment.ts   ✓  (공통 필터 사용)
treatment.ts ──→ judgment.ts   ✓  (공통 필터 사용)
judgment.ts  ──→ shopping.ts   ✗  (역방향 금지)
judgment.ts  ──→ derived.ts    ✗  (역방향 금지)
shopping.ts  ──→ treatment.ts  ✗  (peer 간 직접 의존 금지)
treatment.ts ──→ shopping.ts   ✗  (peer 간 직접 의존 금지)
shopping.ts  ──→ derived.ts    ✗  (peer 간 직접 의존 금지)
treatment.ts ──→ derived.ts    ✗  (peer 간 직접 의존 금지)
```

공통 로직이 필요하면 judgment.ts(기반 모듈)에 배치. derived.ts는 프로필 데이터(shared/types)를 입력받아 도출 변수를 반환하는 독립 순수 함수.

### 2.4 shared/ 내부 규칙

- 내부 import 깊이 ≤ 2 (flat 구조 유지)
- `utils/` → `types/` ✓ (타입 참조)
- `constants/` → `types/` ✓ (타입 참조)
- 그 외 cross-import 금지. 순환 금지

---

## §3. 레이어별 규칙 (L-*)

### 경계 가드 (런타임 강제)

| ID | 규칙 |
|----|------|
| L-0a | **server/ 파일**: 첫 줄에 `import 'server-only'` 필수. 클라이언트 번들에 포함되면 빌드 에러 |
| L-0b | **client/ 파일**: 첫 줄에 `import 'client-only'` 필수. 서버 번들에 포함되면 빌드 에러 |
| L-0c | **shared/ 파일**: `server-only`, `client-only` import 금지. 양쪽에서 사용 가능해야 함 |

### app/ (Composition Root)

| ID | 규칙 |
|----|------|
| L-1 | API route는 thin: 입력 검증 → cross-domain 데이터 조회 → service 호출(파라미터 전달) → 응답 반환 |
| L-2 | page.tsx는 조합만: features/ 컴포넌트 배치. 직접 로직 금지 |
| L-3 | cross-domain 데이터는 여기서 조회하여 service에 전달 (P-4). 이것이 3-layer와의 핵심 차이 |

### server/core/ (시스템 인프라)

| ID | 규칙 |
|----|------|
| L-4 | 파일 추가/수정 시 사용자 승인 필수 |
| L-5 | K-뷰티 비즈니스 용어(skin_type, concerns 등) 포함 금지 |

### server/features/ (비즈니스 코드)

| ID | 규칙 |
|----|------|
| L-6 | 새 도메인 추가 = features/에 폴더 추가. core/ 수정 불필요해야 한다 (OCP) |
| L-7 | beauty/ 모듈은 순수 함수만: 입력→출력, 부작용 없음, DB/API 호출 금지 |
| L-8 | repositories/는 DB CRUD만: 비즈니스 로직(필터링, 정렬, 계산) 금지 |
| L-9 | service 간 직접 import/호출 금지 (R-9) |

### client/ (UI)

| ID | 규칙 |
|----|------|
| L-10 | 서버 상태 접근은 API 호출만. server/ 직접 import 금지 |
| L-11 | 상태: useChat(채팅) + react-hook-form(폼) + React Context(프로필). Zustand 금지 |
| L-12 | 모바일 퍼스트: Tailwind 기본=모바일, md:=태블릿, lg:=데스크톱 |

### shared/ (순수 타입/상수/유틸)

| ID | 규칙 |
|----|------|
| L-13 | 타입, 상수, 순수 유틸 함수만 허용. 런타임 부작용 금지 |
| L-14 | 모듈 내부 전용 타입은 해당 모듈에 선언. shared/에 넣지 않는다 |
| L-15 | 내부 import 깊이 ≤ 2. flat 구조 유지 |

---

## §4. AI 코드 생성 규칙 (G-*)

> Claude Code가 코드를 생성/수정할 때 반드시 준수.

| ID | 규칙 | 설명 |
|----|------|------|
| G-1 | 기존 코드 분석 필수 | 새 코드 작성 전 관련 모듈의 기존 코드를 Read/Grep으로 확인 |
| G-2 | 중복 금지 | 유사 함수가 존재하면 재사용하거나 확장. 새로 생성 금지 |
| G-3 | 패스스루 래퍼 금지 | 인자를 그대로 전달만 하는 함수/컴포넌트 생성 금지 |
| G-4 | 미사용 코드 금지 | 현재 호출되지 않는 함수, export, 변수 생성 금지 |
| G-5 | 기존 패턴 따르기 | 유사 기능의 기존 코드를 참조하여 동일 패턴으로 작성 |
| G-6 | core/ 수정 금지 | 비즈니스 기능 구현 중 core/ 파일 수정 시도 금지. 필요하면 질문 |
| G-7 | 위치 확인 후 작성 | 새 코드가 어느 계층/폴더에 속하는지 확인. R-* 검증 |
| G-8 | any 타입 금지 | unknown + 타입 가드 또는 제네릭 사용 |
| G-9 | export 최소화 | 외부에서 사용하는 함수/타입만 export. 내부 헬퍼는 비공개 |
| G-10 | 매직 넘버 금지 | 상수는 shared/constants/ 또는 모듈 상단에 명명된 상수로 선언 |

---

## §5. 네이밍 규칙 (N-*)

### 파일명

| ID | 대상 | 규칙 | 예시 |
|----|------|------|------|
| N-1 | 컴포넌트 | PascalCase.tsx | `ProductCard.tsx` |
| N-2 | 비컴포넌트 TS | kebab-case.ts | `search-beauty.ts` |
| N-3 | 테스트 | 원본명.test.ts(x) | `judgment.test.ts` |

### 코드 네이밍

| ID | 대상 | 규칙 | 예시 |
|----|------|------|------|
| N-4 | 함수 | camelCase, 동사 시작 | `filterByDowntime()` |
| N-5 | 타입/인터페이스 | PascalCase | `ProductCard` |
| N-6 | 상수 | SCREAMING_SNAKE_CASE | `MAX_CONCERNS` |
| N-7 | boolean | is/has/should 접두사 | `isHighlighted` |
| N-8 | 이벤트 핸들러 | handle 접두사 | `handleSubmit` |
| N-9 | 커스텀 훅 | use 접두사 | `useProfile` |
| N-10 | 환경 변수 | SCREAMING_SNAKE_CASE | `LLM_PROVIDER` |

---

## §6. 품질 규칙 (Q-*)

| ID | 규칙 | 설명 |
|----|------|------|
| Q-1 | zod 검증 | API 입력, tool_use 파라미터, 폼 데이터는 zod 스키마로 검증 |
| Q-2 | VP-1 비개입적 판단 | is_highlighted를 검색/정렬/필터에서 참조 금지. 배지 렌더링만 |
| Q-3 | VP-3 null-safe | 개인화 변수는 항상 null 허용. 미입력 시 해당 필터 비활성 |
| Q-4 | TypeScript strict | tsconfig strict: true 필수 |
| Q-5 | 컴포넌트 ≤ 200줄 | 초과 시 분리 |
| Q-6 | 함수 ≤ 40줄 | 초과 시 헬퍼로 분리 |
| Q-7 | 에러 불삼킴 | try-catch에서 에러를 무시하지 않는다 |

---

## §7. 검증 체크리스트 (V-*)

코드 작성/수정 후 반드시 검증:

```
□ V-1  의존성 방향: import가 DAG를 위반하지 않는가? (P-1, R-1~R-4)
□ V-2  core 불변: core/ 파일을 수정하지 않았는가? (P-2)
□ V-3  Composition Root: cross-domain 데이터를 route handler에서 전달하는가? (P-4)
□ V-4  features 독립: service 간 직접 호출/import이 없는가? (R-9)
□ V-5  콜 스택 ≤ 4인가? (P-5)
□ V-6  바인딩 체인 ≤ 4인가? (P-6, shared/ 제외)
□ V-7  beauty/ 순수 함수: DB/API 호출이 없는가? (R-7, L-7)
□ V-8  beauty/ 단방향: 내부 import가 단방향인가? (§2.3)
□ V-9  중복: 기존 코드와 동일/유사 구현이 없는가? (G-2)
□ V-10 불필요 코드: 미사용 export, 패스스루 래퍼가 없는가? (G-3, G-4)
□ V-11 VP-1: is_highlighted가 렌더링 이외에 사용되지 않는가? (Q-2)
□ V-12 타입 안전: any 타입이 없는가? (G-8)
```
