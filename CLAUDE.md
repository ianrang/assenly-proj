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
| P-9 | 보조 Composition Root | `scripts/`는 `app/`과 동일한 조합 루트 자격. `scripts/ → server/core/, shared/` 허용. 역방향(`server/ → scripts/`, `client/ → scripts/`, `shared/ → scripts/`) 금지. CLI 실행 시 `server-only`는 Node.js에서 noop으로 정상 동작 |
| P-10 | 제거 안전성 | 신규 모듈(scripts/, features/ 하위) 추가 시, 해당 모듈 전체 삭제 후에도 core/, 기존 features/, client/, shared/에 빌드 에러가 없어야 한다. 역참조 0건을 검증한다 |

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

shared/는 4개 서브 모듈(types/, constants/, utils/, validation/)로 구성. 각 모듈은 단일 책임을 갖고, 의존 방향은 단방향만 허용.

```
types/      ── 순수 타입/인터페이스만. 런타임 코드 금지.
constants/  ── 순수 상수만 (as const / 리터럴). 런타임 부작용 금지.
utils/      ── 순수 유틸 함수만. 부작용 금지. DB/API 호출 금지.
validation/ ── zod 스키마(런타임 검증 객체). 순수 검증만. DB/API 호출 금지.
```

#### 의존 방향 (단방향만 허용, 순환 금지)

```
types/ 내부:
  각 파일은 독립 또는 types/ 내 다른 파일 참조만 허용 (type import만)
  예: profile.ts → domain.ts ✓ / domain.ts → profile.ts ✗

constants/  → types/      ✓ (type import만)
utils/      → types/      ✓ (타입 참조)
validation/ → types/      ✓ (타입 참조)
validation/ → constants/  ✓ (열거값 참조)

constants/  → utils/       ✗ (금지)
constants/  → constants/   ✗ (peer 간 직접 의존 금지)
constants/  → validation/  ✗ (역방향 금지)
utils/      → constants/   ✗ (금지)
utils/      → utils/       ✗ (peer 간 직접 의존 금지. 공통 로직은 별도 파일로 분리)
utils/      → validation/  ✗ (금지)
validation/ → utils/       ✗ (peer 간 금지)
types/      → constants/   ✗ (역방향 금지)
types/      → utils/       ✗ (역방향 금지)
types/      → validation/  ✗ (역방향 금지)
```

#### 모듈 분류 기준

| 기준 | types/ | constants/ | utils/ | validation/ |
|------|--------|-----------|--------|------------|
| 내용물 | type, interface, enum 타입 | 값 상수 (as const, 리터럴) | 순수 함수 | zod 스키마 (검증 객체) |
| import 허용 | types/ 내부만 | types/ 타입만 (type import) | types/ 타입만 | types/ + constants/ |
| export 대상 | 2개 이상 모듈에서 사용하는 타입 | 프로젝트 전역 상수 | 2개 이상 모듈에서 사용하는 유틸 | 파이프라인 + API 공유 스키마 |
| 금지 | 값, 함수, 런타임 코드 | 함수, 로직, 계산 | DB/API 호출, 부작용 | DB/API 호출, 부작용 |

#### 새 파일 추가 기준

- 도메인 그룹별 1파일: `types/domain.ts`(도메인 엔티티), `types/ai.ts`(AI 설정), `constants/beauty.ts`(뷰티 열거값)
- 1파일이 200줄 초과 시 도메인 기준으로 분리
- 새 파일은 반드시 해당 폴더의 `index.ts`에 re-export 추가
- 내부 import 깊이 ≤ 2 (flat 구조 유지, L-15)

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

### shared/ (순수 타입/상수/유틸/검증)

| ID | 규칙 |
|----|------|
| L-13 | 타입, 상수, 순수 유틸 함수만 허용. 런타임 부작용 금지 |
| L-14 | 모듈 내부 전용 타입은 해당 모듈에 선언. shared/에 넣지 않는다 |
| L-15 | 내부 import 깊이 ≤ 2. flat 구조 유지 |
| L-16 | shared/ 단방향 의존: constants/→types/ ✓, utils/→types/ ✓, validation/→types/+constants/ ✓. 역방향·peer 간 import 금지. §2.4 참조 |

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
| G-12 | 외부 소스 사전 검증 | 외부 API/DB를 코드에 통합하기 전, 반드시 (1) 실제 API 1회 호출로 응답 형식 확인 (2) 이용약관의 상업적 사용 가능 여부 확인 (3) 법적 리스크(저작권, 크롤링 금지) 확인. 미검증 소스는 코드에 하드코딩하지 않고 폴백 경로를 마련한다 |
| G-13 | 비즈니스 목표 연결 | 기능/데이터 추가 시, 해당 기능이 PRD §2.3 수익 모델(키트 판매, 제휴 수수료, 하이라이트, B2B) 중 어느 것에 기여하는지 명시할 수 있어야 한다. 어떤 수익 모델에도 연결되지 않는 기능은 설계 재검토 |
| G-14 | 설계 교차 검증 완결 | 구현 범위·이슈·논의 사항을 판단하기 전에, 관련 설계 문서를 **끝까지 추적**하여 교차 검증한다. (1) schema.dbml의 테이블/컬럼 정의가 migration에 반영되었는지 확인 (2) 한 문서의 note/주석이 다른 문서(api-spec, data-privacy, tool-spec 등)에서 구체화되었는지 확인 (3) "미존재"를 발견하면 "이슈"로 분류하기 전에 해당 항목이 다른 문서에서 migration/구현 예고되었는지 반드시 검색 (4) 규칙(Q-14 등)이 답을 정하고 있으면 "논의 필요"가 아니라 "구현 범위"로 분류. 설계가 결정한 사항을 이슈로 재분류하지 않는다 |
| G-15 | 수정 전 영향 분석 필수 | 기존 코드를 수정할 때, 수정 전에 반드시: (1) 관련 설계 문서(PRD, TDD, schema.dbml, tool-spec 등)를 확인하여 수정이 설계 의도와 일치하는지 검증 (2) 수정 대상 코드를 호출/참조하는 모든 비즈니스 코드를 추적하여 수정 범위를 정확히 파악 (3) 수정으로 인한 논리적 결함·기존 규칙 위반·비즈니스 로직 충돌이 없는지 완벽히 검증. **검증에서 문제가 발견되면 수정을 진행하지 않고 사용자와 논의한다** |
| G-16 | 설계 문서 정본 확인 필수 | 동일 주제가 여러 설계 문서에 존재할 때, 반드시 **정본(authoritative source)**을 식별하고 정본 기준으로 설계·구현한다. (1) **정본 우선순위**: `schema.dbml`(DB 구조) > `PRD.md`(요구사항) > `TDD.md`(구현 방침) > `05-design-detail/*`(상세 설계) > `superpowers/plans/*`(태스크별 구현 계획). 하위 문서가 상위 정본과 충돌하면 상위 정본이 우선한다 (2) **버전·날짜 확인**: 동일 주제를 다루는 문서가 복수일 때, 각 문서의 작성/수정 시점을 확인하고 최신 확정 버전을 사용한다. 과거 버전·초안·PoC 단계 문서를 현행 설계로 취급하지 않는다 (3) **충돌 시 조치**: 상위 정본과 하위 문서가 모순되면 하위 문서가 outdated일 가능성을 먼저 의심한다. 자의적으로 판단하지 않고 사용자에게 어느 문서가 현행인지 확인한다 (4) **구현 계획(plans/) 주의**: 태스크별 plans는 작성 시점의 스냅샷이다. 이후 PRD·TDD·schema.dbml이 변경되었을 수 있으므로, plans만 읽고 구현하지 않고 반드시 상위 정본과 대조한다 |

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
| Q-11 | 복합 쓰기 원자성 | 하나의 요청이 2개 이상 테이블에 쓰기할 때, 전체가 성공하거나 전체가 실패해야 한다. 후속 쓰기 실패 시 선행 쓰기를 보상한다. 부분 성공 상태로 성공 응답을 반환하지 않는다 |
| Q-12 | 멱등성 설계 | 동일 요청 재전송 시 중복 데이터가 발생하면 안 되는 API는 멱등성을 보장한다. 매 호출이 새 레코드를 생성하는 것이 설계 의도인 API는 이 규칙 대상이 아니다 |
| Q-13 | FK 의존 순서 | 복수 테이블에 삽입할 때, 부모 레코드를 자식보다 먼저 생성한다. 외래 키 제약 위반을 에러 처리 흐름으로 사용하지 않는다 |
| Q-14 | 스키마 정합성 | 입력 검증의 필수/선택 필드, 허용값, 타입은 DB 스키마의 제약(NOT NULL, CHECK, 열거값)과 일치해야 한다. 불일치 시 DB 스키마를 정본으로 한다 |
| Q-15 | 비동기 쓰기 격리 | 응답 후 비동기로 실행되는 쓰기는 실패해도 사용자 응답에 영향을 주지 않는다. 에러는 로그에 기록한다 |

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
□ V-16 shared/ 단방향: constants/→types/ ✓, utils/→types/ ✓, validation/→types/+constants/ ✓. 역방향·peer 간·순환 import 없는가?
□ V-17 제거 안전성: 이 모듈을 삭제해도 core/, 기존 features/, client/에 빌드 에러가 없는가?
□ V-18 scripts/ 의존 방향: scripts/ → server/core/, shared/ 만 import하는가? 역방향 없는가?
□ V-19 복합 쓰기: 2개+ 테이블 쓰기 시 전체 성공/전체 실패가 보장되는가?
□ V-20 멱등성: 중복 데이터가 문제되는 API에서 재전송 시 동일 결과인가?
□ V-21 FK 순서: 삽입 순서가 부모→자식을 따르는가?
□ V-22 스키마 정합성: 입력 검증의 필수/허용값이 DB 스키마와 일치하는가?
□ V-23 설계 교차 검증: "미존재/불일치" 발견 시, 관련 설계 문서(schema.dbml, api-spec, migration, data-privacy 등)를 끝까지 추적하여 migration 예고·v0.2 명시·규칙 결정 여부를 확인했는가? 설계가 정한 사항을 이슈로 재분류하지 않았는가?
□ V-24 수정 영향 분석: 기존 코드 수정 시, (1) 관련 설계 문서와 설계 의도 일치를 확인했는가? (2) 수정 대상을 호출/참조하는 모든 비즈니스 코드를 추적하여 수정 범위를 정확히 파악했는가? (3) 논리적 결함·규칙 위반·비즈니스 로직 충돌이 없는가? 문제 발견 시 수정을 중단하고 사용자와 논의했는가?
□ V-25 정본 확인: 참조한 설계 문서가 해당 주제의 정본(schema.dbml > PRD > TDD > design-detail > plans)인가? 레거시·아카이브·PoC 초안을 현행 설계로 취급하지 않았는가? 상위 정본과 하위 문서 간 충돌이 없는가?
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
| D-8 | 경쟁 서비스 벤치마킹 | 핵심 기능 설계 시, 동일 문제를 해결하는 기존 서비스가 있는지 조사한다. (1) 경쟁사가 같은 데이터를 어떻게 확보하는지 (2) 우리와 다른 접근이 있는지 (3) 우리의 차별화가 유효한지 확인. 벤치마킹 없이 "최초" 가정으로 설계하지 않는다 |
| D-9 | 누락 검증 | 설계 완료 후, "이 설계에서 다루지 않은 것이 무엇인가"를 명시적으로 점검한다. (1) schema.dbml의 모든 관련 필드가 커버되는가 (2) 모든 사용자 시나리오(경로A/B, 재방문)에서 데이터가 충분한가 (3) 에러/실패 시 폴백이 있는가 |
| D-10 | 수정 전 설계·코드 영향 분석 | 설계 문서 또는 기존 코드를 수정할 때, 수정 전에 반드시: (1) 수정 대상과 관련된 설계 문서(PRD, TDD, schema.dbml, tool-spec 등)를 확인하여 수정이 설계 의도와 일치하는지 검증 (2) 수정 대상을 참조하는 모든 코드·설계 문서를 추적하여 영향 범위를 정확히 파악 (3) 수정으로 인한 논리적 결함·기존 규칙 위반·비즈니스 로직 충돌이 없는지 완벽히 검증. **검증에서 문제가 발견되면 수정을 진행하지 않고 사용자와 논의한다. 논의 없이 문제가 있는 수정을 강행하는 것은 절대 금지** |
| D-11 | 정본 식별 후 설계 | 설계·구현 시 참조할 문서가 복수일 때, 정본을 식별하지 않고 작업을 시작하지 않는다. (1) **정본 우선순위**: `schema.dbml` > `PRD.md` > `TDD.md` > `05-design-detail/*` > `superpowers/plans/*`. 하위 문서가 상위와 충돌하면 상위가 우선 (2) **레거시 문서 배제**: 아카이브된 문서, PoC 초안, 과거 버전의 plans를 현행 설계 근거로 사용하지 않는다. 문서의 작성·수정 시점을 확인하고, 이후 상위 정본이 변경되었는지 반드시 대조한다 (3) **부분 로드 금지**: 설계 문서의 일부 섹션만 읽고 전체 맥락을 추론하지 않는다. 해당 주제의 정본을 끝까지 읽은 후 판단한다 (4) **충돌 발견 시**: 자의적으로 어느 문서를 따를지 결정하지 않고, 충돌 내용을 명시하여 사용자와 논의한다 |
| D-7 | 교차 참조 관리 | 설계 문서 간 참조 시 아래 규칙을 준수한다: (1) **단방향**: 상세 문서 → 정본. 정본이 상세 문서를 역참조하지 않는다 (2) **정본 표시**: 같은 주제가 여러 문서에 있으면 정본 소재를 명시 (3) **의도적 재서술 보호**: 자기 완결성을 위한 재서술은 `> 정본: {출처}. 의도적 재서술. 변경 시 D-6 교차 검증 필수` 주석으로 보호 (4) **옵시디언 링크**: `[[파일명#섹션\|표시텍스트]]` 형식 사용. 기계적 참조 추적 가능 (5) **순환 참조 금지**: A→B→A 순환 금지. 공통 정보는 상위 문서(PRD/TDD/schema.dbml)에 배치 |

### 설계 검증 체크리스트

설계 문서 작성/수정 후 반드시 검증:

```
□ D-CHK-1  다른 설계 문서의 이름·타입·허용값·동작을 원문에서 직접 대조했는가?
□ D-CHK-2  수식/로직을 3개 시나리오(정상·최소·부분)로 시뮬레이션하여 의도대로 동작하는가?
□ D-CHK-3  각 로직이 속하는 계층(core/features/shared)을 아키텍처 규칙으로 분류했으며, 2개 이상 계층에 중복 배치 없는가?
□ D-CHK-4  기능이 사용하는 데이터의 타입·구조·제약이 schema.dbml과 호환되는가?
□ D-CHK-5  기능의 전체 처리 경로(입력→처리→출력)에서 중복 실행이나 무시되는 단계가 없는가?
□ D-CHK-6  이 변경으로 인해 다른 설계 문서에 모순·stale 참조·무효화된 가정이 없는가?
□ D-CHK-7  교차 참조가 단방향이고, 정본이 명시되어 있으며, 순환 참조가 없는가?
□ D-CHK-8  동일 문제를 해결하는 경쟁 서비스를 조사하고, 차별화가 유효한지 확인했는가?
□ D-CHK-9  이 설계에서 다루지 않은 항목(미커버 필드, 미고려 시나리오, 미정의 폴백)을 명시적으로 점검했는가?
□ D-CHK-10 수정 전에 관련 설계 문서·비즈니스 코드를 모두 추적하여 영향 범위를 파악했는가? 논리적 결함·규칙 위반·충돌이 없는가? 문제 발견 시 수정을 중단하고 사용자와 논의했는가?
□ D-CHK-11 참조한 설계 문서가 해당 주제의 정본인가? 정본 우선순위(schema.dbml > PRD > TDD > design-detail > plans)를 확인했는가? 레거시·과거 버전·PoC 초안을 현행 설계로 취급하지 않았는가? 상위 정본이 이후 변경되어 하위 문서가 outdated되지 않았는가?
```
