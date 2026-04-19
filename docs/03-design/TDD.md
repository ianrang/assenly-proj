# 에센리 K-뷰티 AI 에이전트 — 기술 설계 문서 (TDD)

> 버전: 2.0
> 최종 갱신: 2026-03-21
> 성격: 아키텍처 결정 + PoC 검증 결과. 상세 설계는 Phase 1에서 별도 문서로 작성.
> 원칙: 이 문서는 기술 구현(HOW)만을 다룬다. 제품 요구사항(WHAT)은 PRD.md에 정의.

---

## 목차

1. [구현 개요](#1-구현-개요)
2. [기술 스택](#2-기술-스택)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [PoC 검증 결과](#4-poc-검증-결과)
5. [기술 리스크 + 완화](#5-기술-리스크--완화)
6. [부록: 기술 결정 로그](#6-부록-기술-결정-로그)

---

# 1. 구현 개요

에센리 K-뷰티 AI 에이전트의 기술 구현 설계. 5개 도메인 서비스, 15개 개인화 변수, 5개 카드 타입을 AI 대화형 웹 앱으로 구현한다.

4계층 아키텍처(Client → API → Backend Services → Data)를 채택하며, LLM 기반 대화 엔진 + RAG 벡터 검색 + 개인화 판단 엔진을 핵심으로 한다.

**참조 문서**:
- DB 스키마: [`schema.dbml`](schema.dbml) (DBML 정본)
- 코드 표준: [`CLAUDE.md`](../../CLAUDE.md) (8개 섹션, 59개 규칙)
- 프로젝트 정의: [`MASTER-PLAN.md`](MASTER-PLAN.md)

---

# 2. 기술 스택

## 2.1 프론트엔드

| 기술 | 선정 이유 |
|---|---|
| Next.js 15 (App Router) | SSR/SSG 혼합, API Routes, Server Actions, 스트리밍 UI |
| React 19 | 서버 컴포넌트, Suspense, 스트리밍 |
| Tailwind CSS 4 | UX 프로토타입 디자인 시스템과 빠른 매칭 |
| next-intl | 6개 언어 i18n (URL 기반 라우팅) |
| Vercel AI SDK 6.x | LLM 스트리밍 응답 UI, 도구 호출 통합 |

## 2.2 백엔드

| 기술 | 선정 이유 |
|---|---|
| Next.js API Routes | 프론트엔드와 동일 코드베이스, 서버리스 배포 |
| Claude API (Anthropic) | 다국어 대화 + 도구 사용 + 긴 컨텍스트. 프로바이더 교체 가능 (Vercel AI SDK) |
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
| `ai` (Vercel AI SDK) | 스트리밍 UI + 도구 호출 + 멀티 프로바이더 |
| `@ai-sdk/anthropic` | Claude 프로바이더 |
| `@ai-sdk/google` | Gemini 프로바이더 (PoC + 폴백) |
| `@supabase/supabase-js` | Supabase 클라이언트 |
| `@supabase/ssr` | Next.js SSR용 Supabase 클라이언트 |
| `next-intl` | 다국어 지원 |
| `zod` 4.x | 스키마 검증 |
| `react-hook-form` | 폼 상태 관리 |

---

# 3. 시스템 아키텍처

## 3.1 4계층 개요

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Web App)                      │
│  Next.js (App Router) + React + Tailwind CSS            │
│  [Landing] [Onboarding] [Results+Chat] [Conversion]     │
│  [i18n: 6 Languages] [Streaming UI]                     │
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
│  PostgreSQL (Supabase) + pgvector + PostGIS             │
│  사용자/프로필/여정/히스토리/도메인 데이터               │
└─────────────────────────────────────────────────────────┘
```

## 3.2 L1: LLM 엔진 + RAG

**LLM 엔진**: Claude Sonnet (비용/성능 균형). Vercel AI SDK로 멀티 프로바이더 전환 가능 (P0-18 검증 완료).

**RAG 엔진**: Knowledge Base = 제품 DB + 장소 DB + 뷰티 지식 KB. 검색 전략 = 벡터 검색 + 메타데이터 필터 → Top-K → LLM 컨텍스트 주입.

> 시스템 프롬프트 구조, tool 정의, 임베딩 전략 상세는 Phase 1에서 설계 (P1-25~P1-39).

## 3.3 L2: Agent Logic Layer

**뷰티 판단 엔진**: 하드 필터(skin_type, budget, downtime, 영업시간) + 소프트 판단(성분 매칭, 학습 선호도). 비개입적 판단(VP-1): is_highlighted는 배지만, 순위/선정 미영향.

**도출 변수**: DV-1(선호 성분), DV-2(기피 성분), DV-3(세그먼트), DV-4(AI 뷰티 프로필). PRD §4-A 참조.

> 의도 분류, 판단 5단계 로직, DV 계산 규칙 상세는 Phase 1에서 설계 (P1-43, P1-33 완료: 동기 tool).

## 3.4 L3: Memory Layer

**단기 메모리**: Supabase DB (conversations.ui_messages JSONB). AI SDK UIMessage[] 스냅샷으로 매 턴 덮어쓰기 저장. 클라이언트 복원(카드 포함) + LLM 컨텍스트 연속성 모두 이 단일 소스에서 제공 (P2-50b). Redis 대신 DB 사용 — 추가 인프라 없이 운영. 성능 이슈 시 v0.2+ Redis 도입.

**장기 메모리**: Supabase DB. UP/JC/BH 영구 저장. Anonymous 비활동 90일 자동 만료 (PRD §4-C).

> 히스토리 요약 전략, 컨텍스트 윈도우 관리 상세는 Phase 1에서 설계 (P1-36).

## 3.5 L4: Action Layer

3단계 Action Layer (PRD §2.2):
- **Stage 1 (MVP)**: F1 정보 제공 (search_beauty_data) + F2 외부 링크 (get_external_links)
- **Stage 2 (v0.3)**: F3 코스 생성 + F7 자동 팔로업
- **Stage 3 (v1.0)**: F4 예약 + F5 알림 + F6 리뷰

> Tool JSON Schema, 호출 흐름, 에러 처리 상세는 Phase 1에서 설계 (P1-31~P1-34).

## 3.6 프로젝트 구조 (4계층)

```
src/
├── app/              # Composition Root (조합 루트)
│   ├── [locale]/     # i18n 라우팅 (Landing, Onboarding, Chat, Profile)
│   └── api/          # API Routes (Auth, Profile, Chat, Journey, Kit)
│
├── server/           # 서버 전용 (import 'server-only')
│   ├── core/         # 시스템 인프라 (AI engine, RAG, DB, auth, admin-auth, config)
│   └── features/     # 비즈니스 코드 (chat, profile, beauty, repositories)
│
├── client/           # 클라이언트 전용 (import 'client-only')
│   ├── core/         # 시스템 인프라 (UI 라이브러리 무관, 프로젝트 무관)
│   ├── ui/           # 디자인 시스템 (shadcn/ui, 교체 가능 단위)
│   │   └── primitives/  # shadcn 컴포넌트 (button, dialog, input...)
│   └── features/     # 비즈니스 UI (chat, cards, onboarding, profile, admin)
│
└── shared/           # 순수 타입/상수/유틸 — 런타임 부작용 금지
    ├── types/        # domain.ts, profile.ts, api.ts
    ├── constants/    # beauty.ts, domains.ts
    └── utils/        # 순수 유틸 함수
```

> 파일별 상세 구조, 네이밍 규칙, 경계 가드 규칙은 CLAUDE.md §3~§5 참조.

## 3.7 Chat API 플로우 (핵심)

```
Client → POST /api/chat { message: UIMessage, conversation_id }
  │      (Authorization: Bearer <supabase_token>)
  │      (prepareSendMessagesRequest: 마지막 UIMessage만 전송)
  │
  ├─ 0. authenticateUser(req) → user.id + user.token  [core/auth.ts]
  ├─ 1. createAuthenticatedClient(token) → RLS 적용    [core/db.ts]
  ├─ 2. 대화 히스토리 로드 (conversations.ui_messages → convertToModelMessages, RLS: 본인만)
  ├─ 3. 프로필 로드 (user_profiles + journeys, RLS: 본인만)
  ├─ 4. 시스템 프롬프트 구성
  ├─ 5. LLM 호출 (스트리밍 + tool_use)
  │     ├─ tool_use: search_beauty_data → RAG 검색
  │     ├─ tool_use: get_external_links → 링크 조회
  │     ├─ tool_use: extract_user_profile → 개인화 추출 (동기, P1-33 확정)
  │     └─ 최종 응답 생성 (텍스트 + 카드 데이터)
  │
  ├─ 6. toUIMessageStreamResponse + consumeStream
  │     ├─ messageMetadata: conversationId 클라이언트 전달
  │     └─ onFinish (스트리밍 완료 후, Q-15 격리):
  │           ├─ 6a. UIMessage[] 스냅샷 저장 (conversations.ui_messages)
  │           ├─ 6b. 개인화 추출 결과 조건부 저장 (service_role)
  │           └─ 6c. 행동 로그 기록 (TODO P2-26)
  │
  └─ Response: SSE 스트리밍
```

> 상세 플로우 (11단계): [[api-spec#3.4 서버 플로우|api-spec.md §3.4]] — conversation 조회/생성, 프로필 로드, 비동기 후처리 등 세분화된 정본.
> API 엔드포인트 상세 명세, Rate limiting, 에러 처리: [[api-spec|api-spec.md]] §1~§4 (P1-19~P1-24).

---

# 4. PoC 검증 결과

Phase 0에서 실행한 기술 검증 결과 요약. 상세는 `docs/04-poc/` 참조.

## 4.1 LLM (§7.3, P0-12~P0-18)

| 항목 | 결과 | 비고 |
|------|------|------|
| tool_use 카드 생성 | **PASS** 15/15 (100%) | Gemini 2.0 Flash |
| 스트리밍 | **PASS** 중단 0건 | TTFT 719~989ms (텍스트) |
| 다국어 6개 언어 | **PASS** 평균 4.6/5.0 | LLM-as-Judge |
| 비용/컨텍스트 | **PASS** $0.10/세션 (Claude 추정) | 20턴, 컨텍스트 1.1% |
| 가드레일 | **PASS** 의료 100%, adversarial 80% | A5 CONFIRM LEAK — 프롬프트 강화 필요 |
| 개인화 추출 | **PASS** 93% 정확도 | Tool 방식 채택 (U-4 결정) |
| 멀티 모델 전환 | **PASS** 8/8 | Gemini 2.0↔2.5 전환 + Anthropic 초기화 |

**SDK 이슈**: Zod 4 + `tool()` 헬퍼 비호환 → `inputSchema + zodSchema()` 워크어라운드. SDK 6.x `toolCalls[0].input` (not `.args`).

## 4.2 RAG (§7.4, P0-19~P0-22)

| 항목 | 결과 | 비고 |
|------|------|------|
| 임베딩 생성 | **PASS** 1024d, 한국어 지원 | Google gemini-embedding-001 |
| 벡터 검색 | **PASS** 5/5 쿼리 (인메모리) | pgvector DB 통합은 Phase 1 |
| SQL 검색 성능 | **PASS** 전체 <100ms | 42~76ms, GIN 인덱스 |
| 하이브리드 검색 | **PASS** 4/4 (인메모리) | 필터→벡터 재정렬 |

**임베딩 모델 교체 가능**: `getEmbeddingModel()` → google/voyage/openai 전환. `EMBEDDING_DIMENSION = 1024`.

## 4.3 인프라 (§7.5, P0-23~P0-28)

| 항목 | 결과 | 비고 |
|------|------|------|
| Supabase 마이그레이션 | **PASS** 19/19 테이블 | pgvector + PostGIS |
| 서버 CRUD | **PASS** | FK, Array, JSONB |
| 브라우저 클라이언트 | **PASS** | RLS 쓰기 차단 확인 |
| Anonymous auth | **PASS** | 세션 + UUID + 데이터 연결 |
| Storage | **PASS** | CDN URL 200 OK |
| Vercel 배포 | **PASS** | https://essenly-proj.vercel.app |

## 4.4 비용 (P0-37)

| 시나리오 | 월간 비용 |
|----------|----------|
| 최소 (Gemini + Free tier) | $10/월 |
| 권장 (Claude Haiku + Free tier) | $91/월 |
| 프리미엄 (Claude Sonnet + Pro tier) | $346/월 |

---

# 5. 기술 리스크 + 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| LLM 응답 지연 | UX 저하 | 스트리밍 UI (P0-13 검증) |
| LLM 비용 초과 | 운영비 | Sonnet/Haiku 모델 선택, 토큰 모니터링 |
| 시드 데이터 품질 | 추천 정확도 | 카카오 API + 수동 검수 (P0-29~33) |
| 부정확한 추천 | 신뢰도 | why_recommended 투명 설명 |
| 다국어 품질 | UX | Claude 네이티브 다국어 (P0-14: 4.6/5.0) |
| pgvector 정확도 | 추천 품질 | 하이브리드 검색 (P0-22 검증) |

---

# 6. 부록: 기술 결정 로그

PRD에서 확정된 비즈니스 결정에 따른 기술 구현 결정 기록.

| # | 비즈니스 결정 | 기술 구현 결정 |
|---|---|---|
| C-3 | 프로필 서버 영구 저장 | Supabase PostgreSQL. localStorage에 anonymous UUID만 |
| C-4 | MVP 인증 anonymous만 | Supabase anonymous auth (P0-26 검증) |
| C-5 | 대화 히스토리 서버 DB 저장 | Supabase conversations.ui_messages (UIMessage[] JSONB 스냅샷, P2-50b). 클라이언트 복원 + LLM 컨텍스트 단일 소스. messages 테이블은 향후 재검토. Redis는 v0.2+ |
| C-6 | 다국어 텍스트 JSONB 단일 컬럼 | `entity.name->>'en'` 패턴 |
| C-7 | Budget level만 사용 | TEXT 단일 컬럼 |
| A-14 | 비활동 90일 자동 만료 | Supabase cron/Edge Function 스케줄러 |
| A-15 | 쿠키 기반 간이 재방문 | localStorage UUID → 서버 프로필 조회 |
| M-6 | 동의: Chat 진입 시 인라인 동의 (ConsentOverlay) + Kit CTA 체크박스 | consent_records 테이블 |
| U-4 | 개인화 추출: **동기 tool 확정** (P1-33) | P0-17: 93% 정확도. extract_user_profile tool. 추출=동기 tool(LLM tool_use). 결과=조건부 저장: 프로필 존재 시 비동기 DB 갱신, 미존재 시 메모리만(동의 후 DB 저장). PRD §4-C. [[api-spec#3.4 서버 플로우|api-spec.md §3.4]] 참조 |
| D-1 | 하이브리드 검색 | SQL 필터 + RAG 벡터 (P0-20~22 검증) |
| D-2 | 하이브리드 판단 | 하드 필터(코드) + 소프트 판단(LLM) |
| D-3 | 4계층 + core/features | server/core (시스템) + server/features (비즈니스) |
| D-4 | DB 접근: 서버 API 경유만 (옵션 B) | 클라이언트 직접 DB 접근 금지. 사용자 API: Supabase JWT 클라이언트 (RLS 적용). 관리자 API: service_role (권한은 코드 검증). RLS = defense-in-depth |
| D-5 | 관리자 인증: 자체 JWT | Google SSO → 자체 JWT 발급 → API 미들웨어 검증. Supabase Auth와 분리 |

---

> Phase 1 상세 설계 문서: 권한 체계([`auth-matrix.md`](../05-design-detail/auth-matrix.md)), 프롬프트(P1-25~29), Tool(P1-31~34), API(P1-19~24), 검색/판단(P1-42~46), 성능/보안(P1-47~54)
> DB 스키마: [`schema.dbml`](schema.dbml) (DBML 정본)
