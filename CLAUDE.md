# 에센리 K-뷰티 AI 에이전트 — 코드 표준

> 이 문서의 모든 규칙은 코드 생성/수정 시 반드시 준수한다. 위반 시 코드 리뷰에서 거부된다.

## 프로젝트

- 앱: K-뷰티 AI 의사결정 보조 웹 앱 (외국인 2040 여성 여행객 대상)
- 스택: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase · Vercel AI SDK 6.x
- 상태 관리: useChat + react-hook-form + React Context (Zustand/Redux 금지)
- 별칭: `@/server`, `@/client`, `@/shared`
- 설계 문서: `docs/03-design/PRD.md`(WHAT) · `docs/03-design/TDD.md`(HOW) · `docs/03-design/schema.dbml`(DB 정본)

---

## §1. 아키텍처 원칙 (P-*)

| ID | 원칙 | 설명 |
|----|------|------|
| P-1 | 4계층 DAG | `app/ → server/, client/ → shared/`. 역방향 import 금지 |
| P-2 | Core 불변 | `core/` 모듈은 비즈니스 변경으로 수정 금지. 비즈니스가 core를 호출한다 |
| P-3 | Last Leaf | `features/` 모듈은 교체/수정해도 core 및 다른 features service에 무영향 |
| P-4 | Composition Root | `app/`이 조합 루트. cross-domain 데이터 조회 → service에 파라미터 전달. service 간 직접 호출/import 금지 |
| P-5 | 콜 스택 ≤ 4 | route → service → tool/domain → repository/core. 최대 4단계 |
| P-6 | 바인딩 ≤ 4 | 정적 의존 체인 최대 4단계. shared/ 및 client/ui/ 내부 import는 카운트 제외 |
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
| R-11 | `ui/` import 허용: `shared/` ONLY | core/, features/ 등 그 외 모든 계층 import 금지. ui/는 교체 가능한 독립 단위 |
| R-12 | `core/` → `ui/` import 금지 | core/는 UI 라이브러리 선택에 무관해야 한다 |

### 2.2 features/ 내부 의존성

| ID | 규칙 | 허용 import |
|----|------|------------|
| R-5 | service.ts — 오케스트레이터 | 자기 도메인 내부 + beauty/ + core/ + shared/. 타 도메인 데이터는 route handler에서 파라미터로 수신 |
| R-6 | tool handler — LLM 콜백 (유일한 예외) | repositories/ + beauty/ + shared/. LLM 콜백 특성상 직접 import 허용 |
| R-7 | beauty/*.ts import 범위 | beauty/ 내부(단방향만) + shared/ ONLY |
| R-8 | repositories/*.ts import 범위 | core/db/ + shared/ ONLY |
| R-9 | service → 타 도메인 import 금지 | 타 도메인의 service.ts, repositories/ 직접 import 불가 |
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
| L-3 | cross-domain 데이터는 여기서 조회하여 service에 파라미터로 전달. service가 타 도메인을 직접 호출하지 않는다 |

### server/core/ (시스템 인프라)

| ID | 규칙 |
|----|------|
| L-4 | 파일 추가/수정 시 사용자 승인 필수 |
| L-5 | K-뷰티 비즈니스 용어(skin_type, concerns 등) 포함 금지 |

### server/features/ (비즈니스 코드)

| ID | 규칙 |
|----|------|
| L-6 | 새 도메인 추가 = features/에 폴더 추가. core/ 수정 불필요해야 한다 (OCP) |
| L-7 | beauty/ 모듈은 순수 함수만: 입력→출력, 부작용(DB 조회, API 호출, 전역 상태 변경) 없음 |
| L-8 | repositories/는 DB CRUD만: 비즈니스 로직(필터링, 정렬, 계산) 금지 |
| L-9 | service는 자기 도메인 범위 내에서만 동작. 타 도메인 데이터는 route handler에서 파라미터로 수신 |

### client/ (UI)

| ID | 규칙 |
|----|------|
| L-10 | 서버 상태 접근은 API 호출만. server/ 직접 import 금지 |
| L-11 | 상태: useChat(채팅) + react-hook-form(폼) + React Context(프로필). Zustand 금지 |
| L-12 | 모바일 퍼스트: Tailwind 기본=모바일, md:=태블릿, lg:=데스크톱 |

### client/ui/ (디자인 시스템 — 교체 가능 독립 단위)

| ID | 규칙 |
|----|------|
| L-17 | K-뷰티 비즈니스 용어(skin_type, concerns 등) 포함 금지. ui/는 도메인 무관해야 한다 |
| L-18 | 스타일은 시맨틱 토큰(`bg-primary` 등)만 사용. `#hex` 값 직접 기입 금지 |
| L-19 | ui/ 컴포넌트는 props와 디자인 토큰만으로 렌더링 완결. 비즈니스 로직 포함 금지 |

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
| G-11 | AI 확장 최적화 | 코드 구조를 AI가 점진적으로 확장할 수 있도록 설계. 명시적 인터페이스, 패턴 일관성, 자기 설명적 구조 |

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
| Q-8 | env 런타임 검증 | `process.env` 직접 접근 금지. 설정 모듈(server/core)을 통해 검증된 값만 사용 |
| Q-9 | exact versions | package.json 버전에 `^`, `~`, 범위 금지. 정확한 버전만 기입 |
| Q-10 | lockfile 불변 | package-lock.json 커밋 필수. CI에서 `npm ci` 사용 |

---

## §7. 디자인 시스템 규칙 (S-*)

> 스타일링 코드(CSS, Tailwind 클래스) 작성/수정 시 반드시 준수.

### 7.1 토큰 아키텍처

| ID | 규칙 | 설명 |
|----|------|------|
| S-1 | 3계층 토큰 구조 | `:root` CSS 변수(값 정의) → `@theme inline`(Tailwind 바인딩) → Tailwind 유틸리티(소비). 계층을 건너뛰지 않는다 |
| S-2 | 단일 진실 공급원 | 모든 디자인 값은 `globals.css`의 `:root`에서 1번만 정의. 컴포넌트·모듈에서 자체 색상/간격 변수 선언 금지 |
| S-3 | Dark 모드 = 오버라이드만 | Dark `@media` 블록은 변경이 필요한 변수만 재선언. 양 모드에서 동일한 값(예: `--radius-*`, `--primary-foreground`)은 `:root`에서 1번만 선언하여 상속 |
| S-4 | Tailwind 우선 | 스타일은 Tailwind 유틸리티 클래스로 적용. 커스텀 CSS는 Tailwind로 표현 불가능한 경우에만 허용 |

### 7.2 단일 변경점 + 캡슐화

| ID | 규칙 | 설명 |
|----|------|------|
| S-5 | 하드코딩 금지 | 디자인 시스템에 속하는 색상·radius·그림자를 컴포넌트에 직접 기입 금지 (`#D4788A` ✗ → `bg-primary` ✓). 변경 시 `globals.css` 1곳만 수정하면 전체 반영되어야 한다 |
| S-6 | 바인딩 동기화 | `:root`에 변수 추가/제거 시 `@theme inline` 바인딩을 반드시 동기화. 바인딩 없는 변수는 Tailwind 유틸리티에서 사용 불가 |
| S-7 | 의미 기반 네이밍 | 토큰 이름은 역할(예: `--primary`, `--surface`)로 명명. 시각 속성(예: `--pink`, `--dark-gray`)으로 명명 금지. 값이 바뀌어도 이름이 유효해야 한다 |

### 7.3 독립성 + 확장성

| ID | 규칙 | 설명 |
|----|------|------|
| S-8 | 토큰 추가 = 2곳만 | 새 디자인 토큰 추가 시 수정 파일은 `globals.css`(`:root` + `@theme inline`) 1개뿐이어야 한다. 다른 설정 파일 수정 불필요 |
| S-9 | 모드 독립 구조 | Light/Dark는 동일 변수명을 공유. 컴포넌트 코드에 모드별 분기(`dark:` 접두사) 최소화. 토큰이 모드를 흡수한다 |
| S-10 | 컴포넌트 스타일 자족 | 컴포넌트는 Tailwind 유틸리티 + 디자인 토큰만으로 스타일 완결. 외부 CSS 파일·전역 클래스 의존 금지 (globals.css의 `body` 기본 스타일 제외) |

---

## §8. 검증 체크리스트 (V-*)

코드 작성/수정 후 반드시 검증:

```
□ V-1  의존성 방향: import가 app/ → server/, client/ → shared/ DAG를 위반하지 않는가?
□ V-2  core 불변: core/ 파일을 수정하지 않았는가?
□ V-3  Composition Root: cross-domain 데이터를 route handler에서 전달하는가?
□ V-4  features 독립: service 간 직접 호출/import이 없는가?
□ V-5  콜 스택 ≤ 4인가? (route → service → tool/domain → repository)
□ V-6  바인딩 체인 ≤ 4인가? (shared/ 및 client/ui/ 내부 import는 제외)
□ V-7  beauty/ 순수 함수: DB/API 호출이 없는가?
□ V-8  beauty/ 단방향: 내부 import가 단방향인가?
□ V-9  중복: 기존 코드와 동일/유사 구현이 없는가?
□ V-10 불필요 코드: 미사용 export, 패스스루 래퍼가 없는가?
□ V-11 is_highlighted가 렌더링 이외(검색/정렬/필터)에 사용되지 않는가?
□ V-12 타입 안전: any 타입이 없는가?
□ V-13 디자인 토큰: 색상·radius·그림자를 #hex로 하드코딩하지 않았는가?
□ V-14 토큰 동기화: :root 변수와 @theme inline 바인딩이 1:1 대응하는가?
□ V-15 ui/ 순수성: client/ui/ 파일에 비즈니스 용어나 features/ import가 없는가?
```

---

## §9. 설계 검증 규칙 (D-*)

> 설계 문서 작성/수정 시 반드시 준수.

| ID | 규칙 | 설명 |
|----|------|------|
| D-1 | 교차 문서 원문 대조 | 다른 설계 문서를 참조할 때, 이름·타입·허용값·동작을 원문에서 직접 확인하고 양쪽이 동일한지 대조한다 |
| D-2 | 3-시나리오 시뮬레이션 | 수식·로직·흐름을 설계할 때, 최소 3개 시나리오로 결과를 시뮬레이션한다: (1) 정상 입력, (2) 최소/빈 입력, (3) 부분/예외 입력 |
| D-3 | 계층 책임 분류 | 요구사항을 구현에 배치할 때, 각 로직이 어느 계층(core/features/shared)에 속하는지 아키텍처 규칙(§1~§3)으로 분류한다. 동일 로직을 2개 이상 계층에 중복 배치하지 않는다 |
| D-4 | 데이터 모델 호환 검증 | 기능을 설계할 때, 해당 기능이 사용하는 데이터의 타입·구조·제약을 schema.dbml에서 확인한다. 설계가 데이터 모델과 호환되지 않으면 설계를 수정한다 |
| D-5 | 처리 흐름 end-to-end 추적 | 설계 완료 전, 기능의 전체 처리 경로를 입력부터 출력까지 추적한다. 동일 처리가 경로 내 2곳에서 중복되지 않는지, 중간 단계의 결과가 이후 단계에서 무시되지 않는지 확인한다 |
| D-6 | 수정 후 영향 범위 검증 | 설계 문서를 작성/수정한 후, 해당 변경이 다른 설계 문서에 미치는 영향을 검증한다: (1) 동일 주제를 다루는 다른 문서와 모순이 없는지 (2) 다른 문서의 "미작성"/참조 표시가 갱신 필요한지 (3) 다른 문서의 가정·결정이 변경으로 무효화되지 않는지 |

### 설계 검증 체크리스트

설계 문서 작성/수정 후 반드시 검증:

```
□ D-CHK-1  다른 설계 문서의 이름·타입·허용값·동작을 원문에서 직접 대조했는가?
□ D-CHK-2  수식/로직을 3개 시나리오(정상·최소·부분)로 시뮬레이션하여 의도대로 동작하는가?
□ D-CHK-3  각 로직이 속하는 계층(core/features/shared)을 아키텍처 규칙으로 분류했으며, 2개 이상 계층에 중복 배치 없는가?
□ D-CHK-4  기능이 사용하는 데이터의 타입·구조·제약이 schema.dbml과 호환되는가?
□ D-CHK-5  기능의 전체 처리 경로(입력→처리→출력)에서 중복 실행이나 무시되는 단계가 없는가?
□ D-CHK-6  이 변경으로 인해 다른 설계 문서에 모순·stale 참조·무효화된 가정이 없는가?
```
