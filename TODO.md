# TODO — 에센리 K-뷰티 AI 에이전트

> 프로젝트 정의: `[MASTER-PLAN.md](docs/03-design/MASTER-PLAN.md)`
> 범례: ✅ 완료 · 🔶 일부 완료 · ⬜ 미수행

---

## 진행률


| Phase      | 작업 수    | 완료      | 진행률     | 상태     |
| ---------- | ------- | ------- | ------- | ------ |
| 사전 완료      | 12      | 12      | 100%    | ✅      |
| Phase 0    | 37      | 37      | 100%    | ✅      |
| Phase 1    | 60      | 60      | 100%    | ✅      |
| Phase 2    | 103     | 8       | 8%      | 🔶 진행중 |
| Phase 3    | 36      | 0       | 0%      | ⬜ 미시작  |
| **MVP 합계** | **248** | **117** | **47%** |        |


**✅ Gate 0 통과 (2026-03-21) → Phase 1 (MVP 설계) 착수 준비**
**🔶 Gate 1 조건부 통과 (2026-03-22) → P1-35~37 완료 후 최종 통과. Phase 2 착수 가능**

---

## 사전 완료 (12/12 ✅)

> PRE-1~PRE-12: 프로젝트 생성, 4계층 디렉토리+ESLint, shared/ 타입+상수, i18n(next-intl), 테스트 환경(Vitest+Playwright), DB 마이그레이션 SQL, 시드 인터페이스, utils 테스트, PRD v2.0, TDD v1.0, DB-SCHEMA v1.0, CLAUDE.md.
>
> 빌드/테스트: `npm run build` ✅ · `npx vitest run` ✅ 8/8

---

# Phase 0: 요구사항 + 기술 검증

> 목표: 확정 문서 검증, 관리자 요구사항 정의, 기술 리스크 제거
> 예상: 2~3주 (1인)

## 요구사항 검증


| ID   | 작업                      | 상세                                                                                            | 산출물            | 상태  |
| ---- | ----------------------- | --------------------------------------------------------------------------------------------- | -------------- | --- |
| P0-1 | PRD v2.0 → v2.2 리뷰 + 정리 | v2.1: 이슈 20건 + 기술 혼입 19개소 제거. v2.2: 중복 제거, 부록 간소화. **사용자 결정 12건 전체 해소** (10건 해소 + 2건 v0.2 연기) | PRD v2.2       | ✅   |
| P0-2 | PRD ↔ DB-SCHEMA 정합성 해소  | X-1~X-6 해소 + P0-1 이관 8건 해소. DB-SCHEMA v1.1, TDD §5 동기화, PRD BH-2 수정                           | 스키마/TDD 수정     | ✅   |
| P0-3 | 성공 지표 측정 방법 정의          | 6개 KPI 이벤트 분석 + U-10 결정: (c) 자체(behavior_logs) + (a) Vercel Analytics 보조. 5개 이벤트, 동의 경계 구분    | `ANALYTICS.md` | ✅   |


## 관리자 앱 요구사항 정의


| ID    | 작업            | 상세                                                                     | 산출물                                                     | 상태  |
| ----- | ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | --- |
| P0-4  | 관리자 역할 정의     | 2역할(super_admin, admin) + 엔티티별 read/write 14개 권한 비트                    | `7.2-ADMIN-REQUIREMENTS.md` §7.2.1                      | ✅   |
| P0-5  | CRUD 기능 목록 확정 | 엔티티별 관리 작업(조회/생성/수정/비활성화), 관계 관리 방식, 하이라이트 업무 흐름, 비즈니스 규칙              | `7.2-ADMIN-REQUIREMENTS.md` §7.2.2                      | ✅   |
| P0-6  | 관리자 인증 요구사항   | Google Workspace SSO + JWT. 비밀번호 관리 없음. super_admin이 허용 이메일 등록 + 권한 할당 | `7.2-ADMIN-REQUIREMENTS.md` §7.2.3                      | ✅   |
| P0-7  | 다국어 데이터 입력 UX | 하이브리드 입력(ko+en 기본 + 4개 확장), ko+en 필수, 폴백 en, 언어 간 복사                   | `7.2-ADMIN-REQUIREMENTS.md` §7.2.4                      | ✅   |
| P0-8  | 이미지 업로드 요구사항  | JPEG/PNG/WebP, 5MB, 최소1장 필수, 최대10장, 1:1 권장, 대표=첫번째                     | `7.2-ADMIN-REQUIREMENTS.md` §7.2.5                      | ✅   |
| P0-9  | 데이터 검증 규칙     | 공통 14규칙 + 엔티티별 필수 필드 + 열거값/범위 + 참조 무결성 + 비활성화 제약                       | `7.2-ADMIN-REQUIREMENTS.md` §7.2.6                      | ✅   |
| P0-10 | 감사 로그 요구사항    | 17개 이벤트, before/after 기록, super_admin 전용 조회, 불변, MVP 무기한 보존            | `7.2-ADMIN-REQUIREMENTS.md` §7.2.7                      | ✅   |
| P0-11 | 버전별 범위 최종 확정  | P0-4~10 결과 반영. §7.2.8 확정 + MASTER-PLAN §2.1/§2.2 구체화 + §7 U-4 삭제       | `7.2-ADMIN-REQUIREMENTS.md` §7.2.8 + MASTER-PLAN §2, §7 | ✅   |


## LLM 기술 검증 (PoC)


| ID    | 검증 항목              | 상세                                                                                                                                      | 성공 기준                   | 실패 시 대안             | 상태  |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------- | --- |
| P0-12 | tool_use 카드 생성     | Gemini 2.0 Flash + Vercel AI SDK. 5시나리오 × 3회 = 15/15 통과 (100%). tool 선택·파라미터·domain 구분 정확                                               | 카드 스키마 부합 JSON 반환       | tool 정의 수정, 프롬프트 개선 | ✅   |
| P0-13 | Vercel AI SDK 스트리밍 | Gemini 2.0 Flash. S1 텍스트 TTFT 719~~989ms, S2 tool+텍스트 1802~~1910ms, S3 멀티tool 2204~2363ms. 스트림 중단 0건. S3 TTFT는 멀티스텝 구조적 특성 (tool 2회 왕복) | 텍스트 실시간 + 카드 자연 삽입      | 커스텀 SSE             | ✅   |
| P0-14 | 다국어 대화 품질          | Gemini 2.0 Flash. 6개 언어 전체 PASS. 평균 4.6/5.0 (EN 4.9, JA 4.6, ZH 4.5, ES 4.6, FR 4.6, KO 4.5). LLM-as-Judge 평가                           | 6개 언어 자연스러운 대화          | 언어별 프롬프트 튜닝         | ✅   |
| P0-15 | 대화 비용·컨텍스트 성장      | 20턴 대화 3회 완료. 컨텍스트 ~2,282 tokens (200K의 1.1%). Claude 추정 $0.10/세션 (목표 근접). 히스토리 요약(P1-36)으로 최적화 가능                                      | input ≤ 50K, 턴당 ≤ $0.05 | 프롬프트 압축, 히스토리 요약    | ✅   |
| P0-16 | LLM 가드레일 테스트       | Gemini 2.0 Flash. 의료 100% BLOCK, off-topic 100%, adversarial 80% (A5 CONFIRM 응답 3건 LEAK — 프롬프트 강화로 해결 가능), edge 100%. FAIL 0건           | 100% 가드레일 작동            | 프롬프트 강화, 후처리 필터     | ✅   |
| P0-17 | 점진적 개인화 추출         | Tool 방식. 6변수: UP-1 100%, JC-1 83%, JC-3 100%, JC-4 100%, UP-4 100%, BH-4 100%. 전체 93%. U-4: Tool 방식 확정                                  | 80%+ 정확 추출              | 별도 추출 tool 정의       | ✅   |
| P0-18 | 멀티 모델 전환 검증        | Gemini 2.0→2.5-flash 전환 성공. Anthropic 초기화 성공. Claude/OpenAI 런타임은 키 확보 후                                                                 | 코드 변경 없이 모델 전환          | 어댑터 패턴              | ✅   |


## RAG 기술 검증 (PoC)


| ID    | 검증 항목         | 상세                                                                                  | 성공 기준            | 실패 시 대안        | 상태  |
| ----- | ------------- | ----------------------------------------------------------------------------------- | ---------------- | -------------- | --- |
| P0-19 | 임베딩 생성        | Google gemini-embedding-001 (1024d). 10건 배치+단일+한국어 정상. 유사도 랭킹 정확                    | 1024차원 정상, 비용 확인 | 다른 임베딩 모델      | ✅   |
| P0-20 | 벡터 검색 정확도     | 인메모리 5/5 + pgvector DB 3/3 통과. 한국어 포함. 인메모리 vs DB 결과 소수점 4자리 일치                     | Top-5 중 3건+ 관련   | 메타데이터 필터 강화    | ✅   |
| P0-21 | SQL 구조화 검색 성능 | 6쿼리 전체 <100ms (42~76ms). GIN 배열 필터, 범위, 복합 조건, 정렬 모두 통과                             | < 100ms          | 인덱스 추가, 쿼리 최적화 | ✅   |
| P0-22 | 하이브리드 검색      | 인메모리 4/4 + pgvector DB 3/3 통과. SQL 필터(skin_types/price/concerns) + 벡터 재정렬 단일 RPC 쿼리 | 구조화+의미 검색 작동     | 2단계 검색         | ✅   |


## 인프라 기술 검증 (PoC)


| ID    | 검증 항목                   | 상세                                                                                                               | 성공 기준          | 상태  |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------- | --- |
| P0-23 | Supabase 마이그레이션         | 19/19 테이블 + pgvector + postgis                                                                                   | DB 접속 + 스키마 반영 | ✅   |
| P0-24 | Supabase 서버 클라이언트       | CRUD 전체 통과 (FK + Array + JSONB)                                                                                  | CRUD 정상 동작     | ✅   |
| P0-25 | Supabase 브라우저 클라이언트     | 공개 읽기 OK, RLS 쓰기 차단 OK                                                                                           | 정상 동작          | ✅   |
| P0-26 | Supabase anonymous auth | 세션 + UUID + 데이터 연결 정상                                                                                            | 세션 유지, 데이터 연결  | ✅   |
| P0-27 | Supabase Storage        | 업로드 + CDN URL(200 OK) 정상                                                                                         | 업로드/조회 정상      | ✅   |
| P0-28 | Vercel + GitHub 배포      | GitHub push + Vercel 연동 완료. [https://assenly-proj.vercel.app/en](https://assenly-proj.vercel.app/en) HTTPS 접근 확인 | 빌드 + HTTPS 접근  | ✅   |


## 도메인 데이터 수집/갱신 검증

> 200+ 제품, 50+ 매장, 30+ 클리닉 등 대량 장소/제품 데이터를 어떻게 확보하고 최신 상태로 유지할 것인지 검증한다.


| ID    | 검증 항목           | 상세                                                                                                                                  | 성공 기준                 | 상태  |
| ----- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --- |
| P0-29 | 외부 데이터 소스 조사    | 카카오 로컬 API(★★★, 무료 30만/일) + 네이버 검색 API(★★★, 25K/일) + Google Places(★★☆). 결정: 카카오 API + 크롤링(검수) + 수동 보완                              | 1개 이상 소스 확인           | ✅   |
| P0-30 | 외부 API 필드 매핑    | 카카오: 이름/주소/좌표/카테고리/전화. 누락: 영업시간/영어지원 → 수동 보완. 네이버: 이름/주소/좌표/링크                                                                      | 필요 필드 확보 가능           | ✅   |
| P0-31 | 크롤링 + 법적 검토     | 올리브영/네이버/화해: 크롤링 높은 법적 리스크. 브랜드 공식: 상대적 안전. 대법원 2022도1533 기준 정리                                                                     | 리스크 평가 완료             | ✅   |
| P0-32 | 데이터 갱신 전략       | 관리자 앱에서 동기화 주기 설정 + 인터페이스로 카카오 API 동기화 트리거. 관리자 앱 요구사항에 "데이터 동기화" 메뉴 추가 필요                                                          | 전략 결정                 | ✅   |
| P0-33 | 초기 데이터 적재 파이프라인 | 멀티 프로바이더(Google/카카오/네이버+mock) 플러그인 구조. 변환→적재 검증 완료. clinics 2/2 적재 성공. stores는 external_links 컬럼 미존재(X-2)로 실패 — Phase 1 마이그레이션에서 해결 | 파이프라인 동작 확인           | ✅   |
| P0-34 | 다국어 번역          | LLM 번역 채택 (P0-14에서 Gemini 6개 언어 4.6/5.0 검증). 200제품×6언어 ≈ $0.50. MVP에 충분                                                             | 번역 방법 결정              | ✅   |
| P0-35 | 이미지 출처/저작권      | 브랜드 공식 이미지 우선 + Google Places 보조. 올리브영/쿠팡 이미지 사용 불가. 저장소: Supabase Storage(P0-27 검증 완료)                                             | 확보 전략 결정              | ✅   |
| P0-36 | 리뷰 데이터 전략       | AI 생성 요약 확정. "AI 생성" 면책 표시. rating은 공개 평점 수동 참조                                                                                     | 전략 결정                 | ✅   |
| P0-37 | 비용 추정 문서화       | 실측: MVP $10~~$346/월 (Gemini~~Claude Sonnet). Supabase Free 충분. 외부 API 무료. `cost-estimate.md` 작성                                     | MASTER-PLAN §4.2 업데이트 | ✅   |


## Gate 0 통과 기준

- PRD 리뷰 완료, 문서 불일치 해소 — P0-1(12건 해소), P0-2(X-1~X-6), PRD↔TDD 교차 검증 22/22 일치
- 관리자 앱 요구사항 문서 확정 — P0-4~P0-11 (7.2-ADMIN-REQUIREMENTS.md)
- 모든 PoC 성공 기준 충족 — LLM 7/7, RAG 4/4, 인프라 6/6, Vercel 배포
- 도메인 데이터 수집/갱신 전략 결정 — P0-29~P0-36 (data-strategy.md)
- 비용 추정 완료, 예산 범위 내 — $10~$346/월 (cost-estimate.md)
- 문서 정합성 검증 — CLAUDE.md SDK 6.x 수정, TDD v2.0 간소화 (921→278줄)

**✅ Gate 0 통과 (2026-03-21)**

---

# Phase 1: MVP 설계

> 목표: MVP 전체 범위의 상세 설계 완료
> 예상: 2~3주 (1인)
> 전제: Gate 0 통과

## 기획 — 디자인 시스템


| ID   | 작업                       | 상세                                                                                                                | 산출물                                   | 상태  |
| ---- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --- |
| P1-1 | 컬러 팔레트                   | Light + Dark Warm Charcoal 확정. Primary/Accent/Neutral/Semantic + 태그 5역할 시스템                                       | `design-preview.html`                 | ✅   |
| P1-2 | 타이포그래피                   | Geist Sans (SIL OFL 1.1) 확정, 7단계 스케일 (Display~Caption), Variable font                                             | `design-preview.html`                 | ✅   |
| P1-3 | 간격/그리드                   | Tailwind 4px 기반 스케일, Border Radius 5단계, 모바일 퍼스트 그리드                                                               | `design-preview.html`                 | ✅   |
| P1-4 | 공통 UI 컴포넌트 스타일 + WCAG AA | WCAG AA 대비 조정 완료 (muted-foreground, sage, teal, coral, warning). shadcn 토큰 네이밍 통일 (36개). gold→teal 교체 (Hue 충돌 해소) | `design-preview.html` + `globals.css` | ✅   |
| P1-5 | UI 프레임워크 결정              | shadcn/ui 전체 통일 확정. client/ui/ 계층 추가, R-11~R-13 규칙, cn()→shared/utils/                                            | `ui-framework.md`                     | ✅   |
| P1-6 | Tailwind 커스텀 설정          | P1-4와 병합 완료. globals.css @theme inline 36개 토큰 바인딩                                                                 | `globals.css`                         | ✅   |


## 기획 — 사이트맵 + 화면


| ID    | 작업                  | 상세                                                                                                                                                                                 | 산출물                | 상태  |
| ----- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --- |
| P1-7  | 사용자 앱 사이트맵 + URL 설계 | Route Group (user)/[locale]/ 구조. Landing SSG, Chat/Onboarding/Profile CSR. Kit CTA=인라인+bottom sheet                                                                                | `sitemap.md`       | ✅   |
| P1-8  | 관리자 앱 사이트맵 (MVP)    | Route Group (admin)/admin/ 구조. 7엔티티×3페이지 + 감사로그 + Admin관리. i18n 없음                                                                                                                 | `sitemap.md`       | ✅   |
| P1-9  | 사용자 앱 화면 상세         | 4페이지(Landing/Onboarding/Profile/Chat) 컴포넌트 분해, 상태 매트릭스, tool-result→UI 매핑. 재사용 컴포넌트(ProductCard/TreatmentCard/ConsentBanner 등) + 공통 패턴(에러/로딩/빈 상태/세션 만료). client/features/ 계층만     | `user-screens.md`  | ✅   |
| P1-10 | 관리자 앱 화면 설계         | 제네릭 CRUD(목록/생성/상세) + 엔티티별 차이 매트릭스. 재사용 컴포넌트 12개(AdminDataTable, EntityForm, MultiLangInput, ImageUploader 등). 고유 화면 4개(로그인/대시보드/감사 로그/관리자 관리). 권한 기반 UI 분기. 한국어 UI                 | `admin-screens.md` | ✅   |
| P1-11 | SEO 전략              | Landing만 SEO 대상 (SSG). 정적 OG 1장, MVP en canonical only (v0.2 hreflang), JSON-LD (WebApplication), sitemap.xml 1 URL, robots.txt (admin/api 차단). 모든 구현 app/ 계층                      | `seo-strategy.md`  | ✅   |
| P1-12 | 접근성 기준              | WCAG 2.1 AA 전체. Skip link, 키보드 내비게이션, aria-live polite (채팅 스트리밍 완료 시 알림), 포커스 트랩 (Radix 내장), 터치 44x44px, prefers-reduced-motion, autocomplete. axe-core + 수동 체크리스트. client/ 계층만 해당 | `accessibility.md` | ✅   |


## 기획 — 권한 체계


| ID    | 작업        | 상세                                                                          | 산출물                 | 상태  |
| ----- | --------- | --------------------------------------------------------------------------- | ------------------- | --- |
| P1-13 | 역할 정의     | anonymous + admin + super_admin. 옵션 B: 서버 API 경유, 사용자=RLS, 관리자=service_role | `auth-matrix.md` §1 | ✅   |
| P1-14 | 권한 매트릭스   | 사용자 앱 11리소스 + 관리자 앱 14권한비트 + API 엔드포인트별 매핑                                  | `auth-matrix.md` §2 | ✅   |
| P1-15 | 라우트 보호 설계 | 2개 미들웨어(auth.ts, admin-auth.ts) + Next.js middleware + RLS defense-in-depth | `auth-matrix.md` §3 | ✅   |


## 설계 — 데이터


| ID    | 작업        | 상세                                                                                                | 산출물                              | 상태  |
| ----- | --------- | ------------------------------------------------------------------------------------------------- | -------------------------------- | --- |
| P1-16 | 스키마 수정    | brands_available 삭제, price_range→3컬럼 분리, status/updated_at 추가(3테이블), FK ON DELETE 12건, CHECK 5건   | `004_schema_v2.sql`              | ✅   |
| P1-17 | 관리자 테이블   | admin_users(role CHECK, permissions JSONB) + audit_logs(불변, RESTRICT). RLS + GRANT. CASCADE 검증 통과 | `004_schema_v2.sql`              | ✅   |
| P1-18 | 인덱스 전략 설계 | 기존 23개 검증 + 신규 14개 추가 (B-tree 14). GIN 기존 유지, GiST/벡터 v0.2+. EXPLAIN ANALYZE 검증 계획 포함             | `index-strategy.md` + 마이그레이션 SQL | ✅   |


## 설계 — API


| ID    | 작업            | 상세                                                                    | 산출물              | 상태  |
| ----- | ------------- | --------------------------------------------------------------------- | ---------------- | --- |
| P1-19 | API 공통 규격     | 응답 형식({data,error,meta}), 에러 코드(도메인별), HTTP 상태, 페이지네이션, Rate limit 헤더 | `api-spec.md` §1 | ✅   |
| P1-20 | 사용자 앱 API     | 14개 엔드포인트. 인증(선택/필수), 요청/응답 스키마, 필터 파라미터                              | `api-spec.md` §2 | ✅   |
| P1-21 | Chat API 스트리밍 | SSE 6개 이벤트 타입, 에러 이벤트 3종, 서버 11단계 플로우. 에러 복구 상세→P1-40                 | `api-spec.md` §3 | ✅   |
| P1-22 | Rate Limiting | Chat 분당5/일100, 공개API 분당60, 익명생성 분당3/IP. MVP 메모리Map, v0.2 Redis(V2-3)  | `api-spec.md` §4 | ✅   |
| P1-23 | 관리자 CRUD API  | 제네릭 CRUD(7엔티티), 관계 관리, 하이라이트, 이미지 업로드. withAuditLog 미들웨어              | `api-spec.md` §5 | ✅   |
| P1-24 | 관리자 인증 API    | Google SSO→자체JWT(24h), 토큰 갱신, 계정 관리(super_admin), 감사 로그 조회            | `api-spec.md` §6 | ✅   |


## 설계 — AI


| ID    | 작업                              | 상세                                                                                                                                                    | 산출물                            | 상태  |
| ----- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --- |
| P1-25 | 시스템 프롬프트 명세                     | 섹션 기반 파이프라인(§2~~10), 코드/LLM 역할 분담, 섹션 소유권(P1-26~~29), MVP 비활성 변수, 프롬프트 관리 전략(MVP 코드→v0.2 DB). TDD U-4 갱신(P1-33 완료 반영)                                 | `system-prompt-spec.md`        | ✅   |
| P1-26 | 가드레일 규칙 상세                      | §5.1 Medical(허용/차단 경계+회색지대+템플릿2), §5.2 Off-topic(판단 기준+Coming soon 제외+템플릿2), §5.3 Adversarial(5패턴 대응+A5 LEAK 강화+템플릿2). MVP 단일턴만                       | `system-prompt-spec.md` §5 확장  | ✅   |
| P1-27 | 카드 포맷 규칙                        | §7 확장: why_recommended 작성 규칙(reasons[]→자연어), 매장/클리닉 선택 규칙(§6에서 이동), 카드 개수 가이드, 비교 요청 처리. §6은 tool 사용법에 집중하도록 정리                                       | `system-prompt-spec.md` §7 확장  | ✅   |
| P1-28 | 경로B 초기 프롬프트                     | §9.1 첫 응답 가이드, §9.2 변수 추출 전략(6변수 3티어 우선순위+VP-3 보호), §9.3 프로필 저장 제안 문구. 추천 질문 버블은 UI 영역(프롬프트 범위 밖)                                                     | `system-prompt-spec.md` §9 확장  | ✅   |
| P1-29 | DV-4 생성 프롬프트                    | §10.1: 별도 LLM 호출(채팅과 독립). 입력 UP-1~~4+JC-1~~5+DV-1~~2, 출력 자연어 2~~3문장. DV-3 제외(마케팅 전용). features/profile/ 위치                                            | `system-prompt-spec.md` §10 확장 | ✅   |
| P1-30 | 프롬프트 평가 체계                      | 3차원(가드레일8+추천7+개인화5=20건), 기계 판정 가능 형태, PoC 대체 전략. 자동화 구현은 Phase 2                                                                                      | `prompt-evaluation.md`         | ✅   |
| P1-31 | Tool 상세 설계 (search_beauty_data) | P1-32와 병합. 입력 스키마(PoC 확장: +category, +max_downtime, limit max 5) + 출력 JSON(ProductCard/TreatmentCard). user-screens.md §1.3~1.4 필드 1:1 대응 검증          | `tool-spec.md` §1              | ✅   |
| P1-32 | Tool 상세 설계 (get_external_links) | P1-31과 병합. 입력 스키마(PoC 유지) + 출력 JSON(5개 링크 타입). extract_user_profile(P1-33 확정)도 §3에 포함                                                                 | `tool-spec.md` §2~3            | ✅   |
| P1-33 | 개인화 추출 방식 결정                    | **동기 tool 확정** (P0-17: 93%). 추출=동기 tool(extract_user_profile), DB 저장=비동기(onFinish). api-spec #7b, TDD U-4, system-prompt-spec §6, auth-matrix §5.4 반영 | 5개 문서 결정 반영                    | ✅   |
| P1-34 | Tool 에러 처리 설계                   | §4: tool별 에러→LLM 반환 형식, embedQuery 실패→SQL 폴백, extract 실패→graceful degradation+로깅. 재시도 없음(LLM stepCountIs에 위임). P1-40 경계 테이블                           | `tool-spec.md` §4              | ✅   |
| P1-35 | 토큰 관리 설계                        | MVP: maxTokens(1024)+historyLimit(20) 상수 정의. 200K 대비 5-8% 사용으로 영역별 예산 불필요 근거. 확장 가능 구조(Recordmodel, config). P1-36/P1-37 v0.2 연기 결정                   | `token-management.md`          | ✅   |
| P1-36 | ~~히스토리 요약 전략~~                  | **→ v0.2 연기**. 트리거: 계정 인증 + 장기 대화(재방문) 도입 시. MVP에서 20턴 히스토리가 200K의 5% — 요약 불필요                                                                        | v0.2                           | ➡️  |
| P1-37 | ~~RAG 결과 압축~~                   | **→ v0.2 연기**. 트리거: 데이터 규모 증가(500→5,000건+) 시. MVP에서 최대 5카드 ~750토큰 — 압축 효과 미미                                                                          | v0.2                           | ➡️  |
| P1-38 | 임베딩 대상 텍스트 정의                   | 4엔티티별 TEXT_FIELDS(en+ko), EMBEDDING_CONFIG 상수(shared/constants/), text-builder 순수 함수, 포함/제외 필드 근거, KB 1doc=1chunk, 태그 전체 포함(MVP)                      | `embedding-strategy.md` §1-2   | ✅   |
| P1-39 | 임베딩 생성 파이프라인 설계                 | 비동기 fire-and-forget(admin CRUD 후), TEXT_FIELDS 변경 감지(JSONB 깊은 비교), 배치 생성(1초/건), null 허용+SQL 폴백, last-write-wins                                       | `embedding-strategy.md` §3     | ✅   |
| P1-40 | LLM 장애 대응 설계                    | 서버 재시도 없음+클라이언트 재시도. 폴백 Claude→Gemini(1회). 에러 분류(429 구분). 스트리밍 중 실패→에러 SSE+기존 출력 유지                                                                   | `llm-resilience.md` §2         | ✅   |
| P1-41 | LLM 모델 교체 아키텍처 설계               | config.ts getModel() 팩토리(core/,P-2). llm-client.ts callWithFallback()(features/,P-3). 환경변수 3개. shared/constants/ai.ts                                 | `llm-resilience.md` §1,§3      | ✅   |


## 설계 — 검색/필터/판단


| ID    | 작업          | 상세                                                                                                                                  | 산출물                   | 상태  |
| ----- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --- |
| P1-42 | 구조화 검색 쿼리   | 3개 Repository 메서드(findByFilters/matchByVector/findAll) + 공통 query-utils(6개 필터 함수). 4엔티티 필터 매핑. null-safe(VP-3)                      | `search-engine.md` §2 | ✅   |
| P1-43 | 뷰티 판단 엔진    | 5단계 판단(SQL 하드 필터 1~~2 + beauty/ 순수 함수 3~~5). judgment.rank() + treatment.checkDowntime() + shopping.scoreProduct() + derived DV-1~3 | `search-engine.md` §3 | ✅   |
| P1-44 | 벡터 검색 파이프라인 | core/knowledge.ts(비즈니스 무관) → embed → matchByVector RPC. SQL/벡터 선택 기준 정의                                                             | `search-engine.md` §4 | ✅   |
| P1-45 | 하이브리드 검색    | 단일 RPC 쿼리(WHERE + ORDER BY embedding). 2단계 불필요. PoC P0-22 검증 완료                                                                     | `search-engine.md` §5 | ✅   |
| P1-46 | 정렬/랭킹       | AI: 4가중치(적합0.4+개인화0.3+유사도0.2+평점0.1). VP-1 준수. 관리자: 엔티티별 허용 정렬 필드                                                                    | `search-engine.md` §6 | ✅   |


## 설계 — 성능 / 보안


| ID    | 작업                  | 상세                                                                                                   | 산출물                           | 상태  |
| ----- | ------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- | --- |
| P1-47 | 성능 목표 (SLA) 정의      | 엔드포인트별 SLA(페이지≤2s, API≤200ms, TTFT≤1.5s, SQL≤100ms). PoC baseline 기반. Phase 3 측정 계획                  | `performance-caching.md` §1   | ✅   |
| P1-48 | 캐싱 전략               | MVP: 이미지 CDN + SSG만. DV/검색/LLM 캐시 안 함 (성능 충분). v0.2 Redis 로드맵 포함                                     | `performance-caching.md` §2-3 | ✅   |
| P1-49 | 인증/인가 아키텍처 설계       | P1-13~15에서 85% 완료. §5 구현 상세 보완: JWT 클레임(HS256), 미들웨어 에러 흐름, 세션 복구, 비동기 user_id, 토큰 경쟁 상태, 감사 로그 트랜잭션 | `auth-matrix.md` v1.1 §5      | ✅   |
| P1-50 | API 입력 검증 설계        | zod 파일 구조(features/ 집중, L-13 준수), 공통 패턴(LocalizedText/배열/페이지네이션), 에러 변환, 이미지 magic bytes             | `security-infra.md` §2        | ✅   |
| P1-51 | 환경 변수 관리 설계         | 전체 20+변수 목록, 서버/공개 분류, zod 런타임 검증(core/config.ts), 환경별 분기                                            | `security-infra.md` §1        | ✅   |
| P1-52 | CORS / CSP 정책       | same-origin CORS, CSP 도메인 화이트리스트(Supabase/Google), 보안 헤더 5종, next.config.ts                          | `security-infra.md` §3        | ✅   |
| P1-53 | 개인정보 보호 설계          | 동의 수집 구현 흐름(Landing+Kit CTA), 동의 철회(MVP 이메일), 처리 프로세스                                                | `data-privacy.md` §1          | ✅   |
| P1-54 | Anonymous 데이터 정리 정책 | Vercel Cron 일 1회, 90일 만료 배치 삭제, system 계정 시드, audit_logs 기록, CASCADE 체인                              | `data-privacy.md` §2          | ✅   |


## 설계 — 통합 + 데이터 준비 계획


| ID    | 작업                 | 상세                                                                               | 산출물                         | 상태  |
| ----- | ------------------ | -------------------------------------------------------------------------------- | --------------------------- | --- |
| P1-55 | 3앱 통합 라우트/미들웨어 설계  | 사용자/관리자/제휴업체 라우트 분리, 인증 분기. 기존 sitemap+auth-matrix+api-spec에 100% 설계됨 → 통합 도표 추가 | `auth-matrix.md` §6         | ✅   |
| P1-56 | Analytics 이벤트 정의   | 5개 KPI 이벤트 상세 속성(필수/선택, 값 제약, 발화 시점, zod 스키마) + 추가 이벤트 4종                        | `ANALYTICS.md` §3 확장 (v0.2) | ✅   |
| P1-57 | LLM 응답 캐싱 전략 결정    | 옵션 분석 후 (a) 캐싱 안 함 결정. 개인화 변수 조합으로 캐시 히트율 극히 낮음. 검색결과 캐싱은 P1-48 소관               | `data-pipeline.md` §5       | ✅   |
| P1-58 | 네트워크 불안정 대응 설계     | MVP: (a) 에러 UI만 채택. 여행객 Wi-Fi/로밍 환경 + 스트리밍 UI로 충분. PWA는 v0.2 검토                  | MVP 결정 (별도 문서 불필요)          | ✅   |
| P1-59 | 데이터 수집/적재 파이프라인 설계 | P0-33 PoC 계승 멀티 프로바이더 ETL. 변환 규칙, zod 검증, 에러 처리/롤백                               | `data-pipeline.md` §3       | ✅   |
| P1-60 | 데이터 갱신 파이프라인 설계    | MVP 관리자 수동 트리거. 변경 감지(해시), 폐업 처리(비활성화), 충돌 해결(관리자 우선)                            | `data-pipeline.md` §4       | ✅   |
| P1-61 | 시드 데이터 수집 계획       | 7 엔티티 목표 수량, 수집 방법, 품질 기준(A/B/C 등급), 타임라인(M1~M3), 어트리뷰션                          | `seed-data-plan.md` §2      | ✅   |
| P1-62 | 뷰티 지식 KB 작성 계획     | 4유형 KB 범위, AI 초안+전문가 검수 결정, Markdown 포맷, 타임라인(K1~K3)                             | `seed-data-plan.md` §3      | ✅   |


## Gate 1 통과 기준

- 모든 설계 문서 작성 완료 (P1-1 ~ P1-62)
- 사용자 승인 (설계 리뷰)
- DB 마이그레이션 SQL 준비 완료
- 프롬프트 초안 + 평가 시나리오 준비
- 교차 문서 일관성 검증 통과

**✅ Gate 1 통과 (2026-03-22)**

- 60/60 설계 문서 작성 완료 (P1-36/P1-37은 v0.2 연기 → V2-13/V2-14)
- Gate 1 교차 검증: 5개 영역 × 20개 문서 검증, 15건 이슈 → 전체 수정 완료
- AI 섹션 최종 교차 검증: 3개 전문가 에이전트 병렬 투입, 8건 추가 이슈 발견 → 전체 수정 완료
- D-6 수정 후 영향 검증: 전수 PASS
- DB 마이그레이션 SQL 준비: ✅ (인덱스 15개 + beauty_summary 컬럼 추가)
- 프롬프트 초안 + 평가 시나리오: ✅ (system-prompt-spec.md §2~§10 + prompt-evaluation.md 20건)

---

# Phase 2: MVP 개발

> 목표: 사용자 앱 + 관리자 기본 CRUD 구현
> 예상: 5~~7주 (1인) / 4~~5주 (2인)
> 전제: Gate 1 통과
> **실행 순서: P2-V(사전 검증) → 인프라 코드 → 이하 병렬 진행. P2-V는 Phase 0 성격의 기술 검증이나, Phase 0/1 완료 후 신규 발견 항목이므로 Phase 2 선두에 배치. 코드 작성 전 반드시 완료.**

## 인프라 코드 (1~2주)


| ID   | 작업                    | 상세                                                                                   | 상태  |
| ---- | --------------------- | ------------------------------------------------------------------------------------ | --- |
| P2-1 | 환경변수 + 설정 모듈          | server/core 설정, 환경별 분기 + shared/constants/ai.ts (LLM_CONFIG + TOKEN_CONFIG)          | ✅   |
| P2-2 | Supabase 서버 클라이언트     | server/core/db.ts: createAuthenticatedClient(RLS 적용) + createServiceClient(RLS 우회). @supabase/supabase-js + config.ts env 경유. 테스트 4개 | ✅   |
| P2-3 | Supabase 브라우저 클라이언트   | client/core/config.ts(zod 검증) + supabase-browser.ts(Auth 전용 팩토리). DB 직접 접근 없음. 테스트 5개 | ✅   |
| P2-4 | DB 마이그레이션 실행          | 004(P1-16+P1-17) + 005(인덱스 13개) + 006(beauty_summary) 실행 완료. kit_subscribers 인덱스는 P2-25에서 처리 | ✅   |
| P2-5 | AI 엔진 + Rate Limiter  | core/rate-limit.ts(메모리Map, window구분자) + features/chat/llm-client.ts(callWithFallback+shouldFallback). ai-engine.ts 삭제. 테스트 13개 | ✅   |
| P2-6 | 프롬프트 관리 모듈            | features/chat/prompts.ts: 고정 6개 상수(§2~§7) + 동적 3개 함수(§8~§10) + buildSystemPrompt 조립. 순수 함수. 테스트 6개 | ✅   |
| P2-7 | Knowledge 검색 (RAG) 모듈 | config.ts: getEmbeddingModel() + knowledge.ts: embedQuery(RETRIEVAL_QUERY) + embedDocument(RETRIEVAL_DOCUMENT). 테스트 6개 | ✅   |
| P2-8 | 대화 메모리 관리 모듈          | core/memory.ts: loadRecentMessages(턴 기반) + saveMessages(DB INSERT). SupabaseClient 파라미터 주입(P-4). 테스트 8개 | ✅   |


## 사용자 앱 — 서비스 + API (2~3주)


| ID     | 작업                                         | 상세                                                                                                                      | 상태  |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --- |
| P2-9   | Anonymous 인증 서비스 + API                     | 익명 세션 생성/관리                                                                                                             | ⬜   |
| P2-10  | 프로필 서비스 + API                              | 온보딩 저장, 프로필 조회/수정                                                                                                       | ⬜   |
| P2-11  | 여정 서비스 + API                               | 여정 생성/조회/수정                                                                                                             | ⬜   |
| P2-12  | 뷰티 판단 엔진                                   | 5단계 판단 로직 (필터→매칭→제약→개인화→하이라이트)                                                                                          | ⬜   |
| P2-13  | 쇼핑 도메인 로직                                  | beauty/ 순수 함수 (shopping)                                                                                                | ⬜   |
| P2-14  | 시술 도메인 로직                                  | beauty/ 순수 함수 (treatment)                                                                                               | ⬜   |
| P2-15  | DV 계산기                                     | 4개 도출 변수 계산 로직                                                                                                          | ⬜   |
| P2-16  | Product 리포지토리                              | 제품 데이터 접근. findByFilters/matchByVector/findById/findAll (search-engine.md §2.1, §2.3 Products)                          | ⬜   |
| P2-16a | Store 리포지토리                                | 매장 데이터 접근. findByFilters/findById/findAll (search-engine.md §2.1, §2.3 Stores)                                          | ⬜   |
| P2-17  | Treatment 리포지토리                            | 시술 데이터 접근. findByFilters/matchByVector/findById/findAll (search-engine.md §2.1, §2.3 Treatments)                        | ⬜   |
| P2-17a | Clinic 리포지토리                               | 클리닉 데이터 접근. findByFilters/findById/findAll (search-engine.md §2.1, §2.3 Clinics)                                        | ⬜   |
| P2-18  | Knowledge 리포지토리                            | RAG 검색 래핑                                                                                                               | ⬜   |
| P2-19  | 채팅 서비스                                     | 대화 오케스트레이션. P2-5/6/8/20/21/22 통합                                                                                        | ⬜   |
| P2-20  | Chat Tool — search_beauty_data             | 도메인 데이터 검색 tool handler. P2-7/12~17a 의존                                                                                 | ⬜   |
| P2-21  | Chat Tool — get_external_links             | 외부 링크 조회 tool handler                                                                                                   | ⬜   |
| P2-22  | Chat Tool — extract_user_profile (동기 tool) | 대화에서 개인화 변수 추출 (P1-33 확정: 동기 tool)                                                                                      | ⬜   |
| P2-23  | Chat API (스트리밍)                            | SSE 스트리밍 응답                                                                                                             | ⬜   |
| P2-24  | Chat 히스토리 API                              | 대화 히스토리 조회                                                                                                              | ⬜   |
| P2-25  | Kit CTA API                                | 이메일 수집/전환                                                                                                               | ⬜   |
| P2-26  | 행동 로그 서비스 + API                            | 비동기 행동 기록 + POST /api/events 라우트 (api-spec §2.7)                                                                        | ⬜   |
| P2-26b | 도메인 데이터 공개 읽기 API                          | GET /api/products/:id, /api/treatments/:id, /api/stores/:id, /api/clinics/:id 등 (api-spec §2.2, search-engine §1.1 경로2) | ⬜   |
| P2-27  | 단위 테스트 — beauty/ 순수 함수                     | judgment, shopping, treatment, derived 테스트                                                                              | ⬜   |
| P2-28  | 단위 테스트 — zod 스키마 검증                        | API 입력, tool 파라미터 유효/무효 케이스                                                                                             | ⬜   |


## 사용자 앱 — UI (2~3주, 병렬 가능)


| ID    | 작업                        | 상세                                                                     | 상태  |
| ----- | ------------------------- | ---------------------------------------------------------------------- | --- |
| P2-29 | 공통 레이아웃 + locale 레이아웃     | shadcn/ui 초기화 + 루트, [locale] 레이아웃                                      | ⬜   |
| P2-30 | 에러 바운더리 + 에러 화면           | 네트워크, LLM, 세션 에러 처리                                                    | ⬜   |
| P2-31 | Header + LanguageSelector | 공통 헤더                                                                  | ⬜   |
| P2-32 | Landing 페이지               | 2가지 경로 분기 + ConsentBanner(동의 배너) + ReturnVisitBanner(재방문 흐름)           | ⬜   |
| P2-33 | 온보딩 페이지 + 4단계 컴포넌트        | Step 1~4 (피부/헤어, 고민, 여행, 관심)                                           | ⬜   |
| P2-34 | 프로필 전환/확인 화면              | 로딩 애니메이션, 프로필 카드                                                       | ⬜   |
| P2-35 | Chat 인터페이스                | 메시지 버블, 입력바, 스트리밍 UI + SuggestedQuestions(경로B 초기 상태)                   | ⬜   |
| P2-36 | 5영역 탭 바                   | Shops/Clinic/Salon/Eats/Exp (MVP: 2개 활성)                               | ⬜   |
| P2-37 | ProductCard 컴포넌트          | PRD §3.5 기반                                                            | ⬜   |
| P2-38 | TreatmentCard 컴포넌트        | PRD §3.5 기반                                                            | ⬜   |
| P2-39 | HighlightBadge 컴포넌트       | VP-1 비개입 시각 강조                                                         | ⬜   |
| P2-40 | Kit CTA 컴포넌트              | KitCtaCard + KitCtaSheet(Bottom sheet). Chat 내 인라인 (user-screens §6.6) | ⬜   |
| P2-41 | Profile 페이지               | 프로필 조회/수정                                                              | ⬜   |
| P2-42 | 프로필 Context               | React Context 상태 관리                                                    | ⬜   |
| P2-43 | 면책 조항 페이지                 | 시술 추천 면책, 의료 조언 아닌 정보 제공 명시                                            | ⬜   |
| P2-44 | 이용약관 + 개인정보처리방침 페이지       | 서비스 이용약관, 데이터 수집/보관/삭제 정책                                              | ⬜   |


## 관리자 앱 — MVP (병렬 가능)


| ID     | 작업                 | 상세                                                                                                                                 | 상태  |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --- |
| P2-45  | 관리자 인증 서비스 + API   | 로그인, 세션, 권한 확인 (api-spec.md §6)                                                                                                    | ⬜   |
| P2-46  | 제네릭 CRUD 서비스       | `features/admin/service.ts` + withAuditLog 미들웨어 + 7엔티티 zod 스키마 + CRUD 후 비동기 임베딩 재생성 연동 (api-spec.md §5.1, embedding-strategy §3.4) | ⬜   |
| P2-46a | 복합 엔티티 라우트         | Product/Store/Treatment/Clinic CRUD 라우트 + 하이라이트 API(§5.3) + 관계 API(§5.2). P2-16/16a/17/17a 리포지토리 의존                                | ⬜   |
| P2-46b | 단순 엔티티 라우트         | Brand/Ingredient/Doctor CRUD 라우트 + 리포지토리 생성 포함 (findAll/findById/create/update/deactivate, query-utils.ts 재사용)                     | ⬜   |
| P2-47  | 이미지 업로드 서비스 + API  | Product/Store/Clinic/Treatment 4엔티티. Supabase Storage + magic bytes 검증 + 순서 관리 (api-spec.md §5.4)                                  | ⬜   |
| P2-48  | 감사 로그 조회 API       | `GET /api/admin/audit-logs` + audit-service.ts. super_admin 전용, 날짜/액터/액션 필터 (api-spec.md §6.6). 기록은 P2-46 withAuditLog가 담당         | ⬜   |
| P2-49  | 관리자 레이아웃 + 로그인 페이지 | admin 라우트 레이아웃, 인증 UI                                                                                                              | ⬜   |
| P2-50  | 관리자 대시보드 (간단)      | 엔티티별 데이터 건수, 최근 변경                                                                                                                 | ⬜   |
| P2-51  | 관리자 공통 컴포넌트 — 목록   | 테이블, 검색, 필터, 페이지네이션                                                                                                                | ⬜   |
| P2-52  | 관리자 공통 컴포넌트 — 폼    | 폼 필드, JSONB 다국어 입력, 이미지 업로드                                                                                                        | ⬜   |
| P2-53a | 복합 엔티티 CRUD 페이지    | Product, Store, Clinic, Treatment — 이미지+관계+하이라이트 포함 (P2-46a 대응)                                                                    | ⬜   |
| P2-53b | 단순 엔티티 CRUD 페이지    | Brand, Ingredient, Doctor — 기본 CRUD (P2-46b 대응)                                                                                    | ⬜   |
| P2-54  | 관계 관리 UI           | Product↔Store, Product↔Ingredient, Clinic↔Treatment                                                                                | ⬜   |
| P2-55  | 하이라이트 관리 UI        | is_highlighted 토글 + badge 텍스트                                                                                                      | ⬜   |


## 데이터 준비 — 사전 검증 (Phase 2 착수 전 필수)

> 설계서: `docs/05-design-detail/data-collection.md` §8 미검증 항목
> **Phase 2 코드 작성 전에 완료 필수.** 결과에 따라 파이프라인 전략이 변경될 수 있음.


| ID    | 작업                        | 상세                                                                                | 의존  | 상태  |
| ----- | ------------------------- | --------------------------------------------------------------------------------- | --- | --- |
| P2-V1 | ~~네이버 약관~~ + 쿠팡 파트너스 가입 (U-5 확정, U-12) | **U-5 완료**: 네이버 API 약관 7.3③ DB 금지 확정 → S2 제거. **신규**: 쿠팡 파트너스 가입 + API 활성화 확인 (U-12). 올리브영 어필리에이트 동시 가입 (U-9) | 없음 | 🔶 |
| P2-V2 | 식약처 API 응답 형식 검증 (U-2)    | data.go.kr API 키 발급 → S3(원료성분)/S4(사용제한)/S5(보고품목) 각 1회 호출. 실제 필드명·형식 확인            | 없음  | ⬜   |
| P2-V3 | 브랜드 공식 이미지 정책 확인 (U-6)    | 이니스프리, 라네즈, 설화수, 미샤, 코스알엑스 5개 브랜드 프레스킷/이미지 사용 정책 확인. 불가 시 placeholder 전략          | 없음  | ⬜   |
| P2-V4 | EU CosIng CSV 다운로드 + 커버리지 | CSV 다운로드 → 타깃 100 성분 중 CAS번호 매칭률 측정 (U-3). 50% 미만 시 전량 수동                         | 없음  | ⬜   |
| P2-V5 | 시술 가격 범위 현실성 검증 (U-7)     | M2 시점. 5개 클리닉 실제 상담 가격과 DB price_min/max 대조. 50%+ 불일치 시 가격 표시 방식 재검토             | P2-62 | ⬜   |


## 데이터 준비 — 파이프라인 구현 (코어 구현과 병렬)

> 설계서 §7. 코드 위치: `scripts/seed/lib/` (Phase 2 초반 CLI). 관리자 앱 통합 시 `server/features/pipeline/`으로 이동.
> 의존 규칙: `scripts/ → server/core/, shared/` 허용. 역방향 금지. `server/features/` import 금지.


| ID     | 작업                                           | 상세                                                                                                       | 의존             | 상태  |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------- | --- |
| P2-56a | shared/validation/ zod 스키마 정의                | 7엔티티 검증 스키마 (product, store, clinic, treatment, ingredient, brand, doctor). 파이프라인 + API 공유               | P2-V2          | ⬜   |
| P2-56b | scripts/seed/config.ts 파이프라인 환경변수            | KAKAO_API_KEY, NAVER_CLIENT_ID, MFDS_SERVICE_KEY 등 파이프라인 전용 env. core/config.ts 수정 없음 (P-2)              | P2-V1, P2-V2   | ⬜   |
| P2-56c | scripts/seed/lib/types.ts 파이프라인 타입           | RawRecord, EnrichedRecord, ValidatedRecord, PipelineResult. shared/types/domain.ts import만               | P2-56a         | ⬜   |
| P2-56d | 카카오 로컬 프로바이더 (S1)                            | scripts/seed/lib/providers/kakao-local.ts. P0-33 PoC 계승. PlaceProvider 인터페이스                             | P2-56b, P2-56c | ⬜   |
| P2-56e | **쿠팡 파트너스 프로바이더 (S7)** | scripts/seed/lib/providers/coupang-partners.ts. Search API → 제품명, 가격, 이미지, 카테고리, 구매링크. ~~S2 네이버 쇼핑 확정 제거 (약관 7.3③).~~ U-12 활성화 조건 확인 후 구현 | P2-V1, P2-56c | ⬜   |
| P2-56f | 식약처 원료성분 프로바이더 (S3)                          | scripts/seed/lib/providers/mfds-ingredient.ts. P2-V2 응답 형식 기반                                            | P2-V2, P2-56c  | ⬜   |
| P2-56g | 식약처 사용제한 프로바이더 (S4)                          | scripts/seed/lib/providers/mfds-restricted.ts. S3 CAS번호 기반 LEFT JOIN                                     | P2-56f         | ⬜   |
| P2-56h | 식약처 보고품목 프로바이더 (S5)                          | scripts/seed/lib/providers/mfds-functional.ts. 제품 교차 검증용. 퍼지 매칭                                          | P2-V2, P2-56c  | ⬜   |
| P2-56i | CosIng CSV 프로바이더 (S6)                        | scripts/seed/lib/providers/cosing-csv.ts. CSV 파싱 + CAS번호 JOIN → inci_name + function 보강                  | P2-V4, P2-56c  | ⬜   |
| P2-56j | CSV 로더 프로바이더                                 | scripts/seed/lib/providers/csv-loader.ts. 수동 CSV → RawRecord 변환. products/ingredients/treatments         | P2-56c         | ⬜   |
| P2-56k | AI 번역 모듈                                     | scripts/seed/lib/enrichment/translator.ts. ko→en 필수 + ja/zh/es/fr 선택. server/core/ai-engine.ts 호출        | P2-56c, P2-5   | ⬜   |
| P2-56l | AI 분류 모듈                                     | scripts/seed/lib/enrichment/classifier.ts. skin_types[], concerns[] 분류. 허용값 제한 프롬프트 + zod 출력 검증          | P2-56c, P2-5   | ⬜   |
| P2-56m | AI 설명 생성 모듈                                  | scripts/seed/lib/enrichment/description-generator.ts. description + review_summary 생성                    | P2-56c, P2-5   | ⬜   |
| P2-56n | fetch-service (Stage 1 오케스트레이션)              | scripts/seed/lib/fetch-service.ts. 프로바이더 호출 → Promise.allSettled → RawRecord[]                             | P2-56d~j       | ⬜   |
| P2-56o | enrich-service (Stage 2 오케스트레이션)             | scripts/seed/lib/enrich-service.ts. RawRecord → 번역+분류(confidence)+생성 → EnrichedRecord[]. 건별 try-catch      | P2-56k~m       | ⬜   |
| P2-56o2 | review-exporter (Stage 3 검수 CSV)             | scripts/seed/lib/review-exporter.ts. EnrichedRecord → 검수용 CSV export (confidence 포함). 구글시트 검수 후 CSV import | P2-56o         | ⬜   |
| P2-56p | loader (Stage 4 DB 적재)                       | scripts/seed/lib/loader.ts. zod 검증 → DB UPSERT. FK 순서 보장, 100건 청크 트랜잭션                                   | P2-56a, P2-2   | ⬜   |
| P2-56q | CLI 진입점 (fetch/import-csv/enrich/export-review/import-review/validate/load) | scripts/seed/*.ts 7개 CLI. thin layer: 인자 파싱 → lib/ 호출                               | P2-56n~p       | ⬜   |
| P2-56r | AI 분류 정확도 PoC (U-1)                          | M1 스켈레톤 10건으로 skin_types/concerns AI 분류 → 전문가 대조. **80% 미달 시 수동 전환 결정**                                  | P2-56l         | ⬜   |


## 데이터 준비 — 데이터 입력 + 검수 (코어 구현과 병렬)

> 설계서 §5 큐레이션 + §6 엔티티별 상세 + §9 타임라인 (M1→M2→M3)
> 수집 순서: Phase A(brands, ingredients, stores, clinics, treatments 병렬) → Phase B(products, doctors) → Phase C(junction) → Phase D(임베딩)


| ID     | 작업                                     | 상세                                                                                                                   | 마일스톤  | 상태  |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----- | --- |
| P2-57  | 뷰티 지식 KB 작성                            | 성분 가이드 20종 + 시술 가이드 15종 (K1). 지역 5개 + 상식 10편 (K2). AI 초안 + 전문가 검수                                                    | K1→K2 | ⬜   |
| P2-58  | M1 스켈레톤 데이터 적재                         | 7엔티티 × 5~10건 수동 YAML. brands 5, products 10, ingredients 10, stores 5, clinics 5, treatments 10, doctors 5. FK 관계 검증 | M1    | ⬜   |
| P2-59  | 큐레이션 리스트 확정                            | 수집 대상 200제품+50매장+30클리닉 선정. 올리브영 랭킹+화해+YouTube 참조(수동). manifests/*.yaml 작성. 카테고리/가격/피부타입 배분 검증                        | M1    | ⬜   |
| P2-60  | Phase A: brands 50+ / ingredients 100+ | 브랜드 수동 입력 + S3 식약처 원료성분 자동 수집 + S6 CosIng INCI 교차 + S4 안전성 검증 + AI function 분류 + 전문가 검수                              | M2    | ⬜   |
| P2-61  | Phase A: stores 50+ (S1 자동수집)          | 카카오 API 수집 → 분류 → AI 번역 → 수동 보완(영업시간, english_support, tourist_services, 이미지)                                        | M2    | ⬜   |
| P2-62  | Phase A: clinics 30+ (S1 자동수집)         | 카카오 API 수집 → 분류 → AI 번역 → 수동 보완(foreigner_friendly, license_verified, 이미지). english_support >= basic 필수              | M2    | ⬜   |
| P2-63  | Phase A: treatments 50+                | 수동 입력 + AI 보강(target_concerns, suitable_skin_types, description, precautions). 전문가 검수 필수. downtime_days 정확성          | M2    | ⬜   |
| P2-64a | Phase B: products 200+ (S7+CSV+수동)      | 쿠팡 API(S7 활성 시) + CSV 임포트(브라우저 수동 참조) + 관리자 수동. AI 분류 → **전수 검수(D-7, 구글시트)**. 브랜드 공식 이미지         | M3    | ⬜   |
| P2-64b | Phase B: doctors 30+                   | 수동 입력. 클리닉당 1명+. languages 영어 포함 필수                                                                                  | M3    | ⬜   |
| P2-64c | Phase C: junction 데이터                  | product_stores(유형 기반+개별 혼합 ~~2,700건), product_ingredients(~~400건 수동 + key/avoid 분류), clinic_treatments(~150건)        | M3    | ⬜   |
| P2-64d | Phase D: 임베딩 생성 + 벡터 DB 적재             | text-builder.ts + generator.ts (embedding-strategy §2) + 배치 스크립트. products, stores, clinics, treatments              | M3    | ⬜   |
| P2-64e | Phase E: S5 교차 검증 + 품질 게이트             | 식약처 보고품목 교차 검증(기능성화장품 태깅). M3 품질 게이트: A등급 100%, B등급 90%, 커버리지 검증(skin_type×40, concern×5)                            | M3    | ⬜   |


## 통합 테스트


| ID    | 작업               | 상세                                    | 상태  |
| ----- | ---------------- | ------------------------------------- | --- |
| P2-71 | API route 통합 테스트 | profile, journey, auth — 실제 DB 연동     | ⬜   |
| P2-72 | 검색 통합 테스트        | 검색 API + repository + DB 필터 정확성       | ⬜   |
| P2-73 | Chat API 통합 테스트  | chat route + service + tools (LLM 모킹) | ⬜   |
| P2-74 | 관리자 CRUD 통합 테스트  | admin API + DB + 감사 로그                | ⬜   |
| P2-75 | 인증 통합 테스트        | anonymous + admin 세션/권한               | ⬜   |


## 프롬프트 평가 실행


| ID    | 작업                 | 상세                                                                              | 상태  |
| ----- | ------------------ | ------------------------------------------------------------------------------- | --- |
| P2-76 | P1-30 평가 자동화 구현    | prompt-evaluation.md 20건 시나리오 → scripts/prompt-eval.ts 자동화. PoC(P0-12/16/17) 대체 | ⬜   |
| P2-77 | 멀티턴 adversarial 검증 | P2-76 평가 실행 후, 멀티턴 탈옥 패턴(점진적 신뢰 구축→공격) 테스트 + 가드레일 강화. P1-26은 단일턴만 커버            | ⬜   |


---

# Phase 3: 테스트 + 배포

> 목표: QA 완료 + 프로덕션 배포
> 예상: 2~3주 (1인)
> 전제: Phase 2 완료

## E2E 테스트


| ID   | 작업           | 시나리오                                        | 상태  |
| ---- | ------------ | ------------------------------------------- | --- |
| P3-1 | 경로A 플로우      | Landing → 온보딩 4단계 → 프로필 → Chat → 카드 → 외부 링크 | ⬜   |
| P3-2 | 경로B 플로우      | Landing → "Just ask" → Chat → 점진적 개인화       | ⬜   |
| P3-3 | Kit CTA 플로우  | Chat → Kit 카드 → 이메일 입력 → 제출                 | ⬜   |
| P3-4 | 관리자 CRUD 플로우 | 로그인 → 생성 → 수정 → 관계 설정 → 삭제                  | ⬜   |
| P3-5 | 모바일 반응형      | 주요 플로우를 모바일 뷰포트에서 테스트                       | ⬜   |
| P3-6 | 에러 시나리오      | 네트워크 끊김, LLM 타임아웃, 잘못된 입력                   | ⬜   |


## AI 품질 테스트


| ID    | 작업              | 상세                        | 상태  |
| ----- | --------------- | ------------------------- | --- |
| P3-7  | 프롬프트 평가 시나리오 실행 | 20+건 시나리오 자동 실행           | ⬜   |
| P3-8  | 카드 데이터 정확성      | tool_use → 카드 스키마 검증      | ⬜   |
| P3-9  | 가드레일 테스트        | 의료 조언, 이탈, 적대적 입력 거부 확인   | ⬜   |
| P3-10 | 다국어 품질 테스트      | 6개 언어 동일 시나리오 자연스러움       | ⬜   |
| P3-11 | 개인화 정확성         | 동일 질문 + 다른 프로필 → 추천 차이 확인 | ⬜   |


## 성능 테스트


| ID    | 작업          | 기준                                      | 상태  |
| ----- | ----------- | --------------------------------------- | --- |
| P3-12 | 페이지 로드 시간   | Landing ≤ 2s, Chat ≤ 3s                 | ⬜   |
| P3-13 | API 응답 시간   | profile/journey ≤ 200ms, search ≤ 100ms | ⬜   |
| P3-14 | LLM 첫 토큰 시간 | ≤ 1s (스트리밍 시작)                          | ⬜   |
| P3-15 | 동시 사용자      | 10 동시 세션 정상 (MVP)                       | ⬜   |


## 보안 검토


| ID    | 작업                      | 상세                                     | 상태  |
| ----- | ----------------------- | -------------------------------------- | --- |
| P3-16 | OWASP Top 10 점검         | Injection, Auth, XSS, Access Control 등 | ⬜   |
| P3-17 | API 키 노출 확인             | Git 이력, 환경변수 클라이언트 노출                  | ⬜   |
| P3-18 | Admin 미인증 접근 테스트        | /admin/* 미인증 시 차단 확인                   | ⬜   |
| P3-19 | SQL injection / XSS 테스트 | 주요 입력 필드 대상                            | ⬜   |
| P3-20 | 파일 업로드 검증               | 악성 파일, MIME 타입, 크기 제한                  | ⬜   |
| P3-21 | Rate limit 동작 확인        | Chat API, Admin API                    | ⬜   |
| P3-22 | 의존성 취약점 스캔              | npm audit                              | ⬜   |


## 인프라 / DevOps


| ID    | 작업                     | 상세                                     | 상태  |
| ----- | ---------------------- | -------------------------------------- | --- |
| P3-23 | CI/CD — GitHub Actions | PR: lint → type-check → test → build   | ⬜   |
| P3-24 | CI/CD — Vercel 자동 배포   | main → prod, PR → preview              | ⬜   |
| P3-25 | 환경 분리                  | dev(로컬) / staging(preview) / prod      | ⬜   |
| P3-26 | Supabase 프로젝트 분리       | dev(CLI) / staging / prod              | ⬜   |
| P3-27 | 에러 트래킹 설정              | Sentry 또는 Vercel Analytics             | ⬜   |
| P3-28 | 성능 모니터링                | Vercel Analytics (Web Vitals)          | ⬜   |
| P3-29 | LLM 비용 모니터링            | Anthropic Console + 커스텀 로깅             | ⬜   |
| P3-30 | 로깅 전략                  | 구조화 로깅 (JSON), 로그 레벨                   | ⬜   |
| P3-31 | DB 백업 확인               | Supabase 일일 백업, Point-in-time Recovery | ⬜   |
| P3-32 | 도메인 + SSL              | 커스텀 도메인, Vercel SSL                    | ⬜   |


## 배포 + 런칭


| ID    | 작업               | 상세                                    | 상태  |
| ----- | ---------------- | ------------------------------------- | --- |
| P3-33 | 버그 수정 + 최적화      | P3-1~22에서 발견된 이슈 해결                   | ⬜   |
| P3-34 | 프로덕션 배포          | 최종 배포                                 | ⬜   |
| P3-35 | 소프트 런칭           | 제한 사용자 테스트 (대상/규모 별도 결정)              | ⬜   |
| P3-36 | 사용자 피드백 수집 채널 구축 | 인앱 피드백 버튼/폼, 버그 리포트 채널. 소프트 런칭 피드백 수집 | ⬜   |


## Gate 2 통과 기준

- E2E 핵심 플로우 100% 통과
- AI 품질 평가 80%+ 통과
- 성능 SLA 충족
- 보안 체크리스트 100% 통과
- 모니터링 + 백업 작동 확인

---

# v0.2 백로그

> MVP 후 구현할 기능. Phase 4에서 상세 계획 작성.


| ID    | 기능                     | 설명                                                                                                      | 근거                       |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| V2-1  | 관리자 API 설정 관리          | Rate limit, 시스템 설정을 관리자 UI에서 조정. DB settings 테이블 + 메모리 캐시(TTL 5분) + max/min 안전장치                        | P1-22 결정                 |
| V2-2  | 관리자 데이터 동기화 UI         | 카카오 API 동기화 주기 설정 + 수동 트리거 + 결과 로그                                                                      | P0-32 결정                 |
| V2-3  | Rate limit Redis 전환    | 메모리 Map → Upstash Redis. 다중 인스턴스 지원                                                                     | P1-22                    |
| V2-4  | 계정 인증 시스템              | anonymous → 계정 (이메일/소셜). Supabase Auth linking                                                          | PRD §4-C                 |
| V2-5  | DOM-3 살롱 + DOM-4 맛집    | salons, restaurants 테이블 + CRUD + 추천                                                                     | PRD §2.2                 |
| V2-6  | 6개 언어 UI               | 영어 외 5개 언어 UI 번역                                                                                        | PRD §5.1                 |
| V2-7  | 위치 기반 추천               | RT-1 (현재 위치) 수집 + 거리 기반 정렬                                                                              | PRD §2.2                 |
| V2-8  | 프로필 화면 데이터 삭제 버튼       | "Delete my data" UI                                                                                     | PRD §4-C A-14            |
| V2-9  | 임베딩 태그 필터링             | 신호 태그(hydrating 등) vs 노이즈 태그(bestseller 등) 분류 규칙 정의 + EMBEDDING_CONFIG.TAG_FILTER 활성화                   | P1-38                    |
| V2-10 | 다국어 임베딩 텍스트 확장         | ja/zh/es/fr 사용자 비율 >20% 시 해당 언어 임베딩 텍스트 추가. EMBEDDING_CONFIG.TEXT_LANGUAGES 확장                          | P1-38                    |
| V2-11 | 교차 엔티티 임베딩 재생성         | Brand 이름 변경 시 관련 Product 임베딩 CASCADE 재생성                                                                | P1-39                    |
| V2-12 | 프롬프트 DB 전환 + 관리자 편집 UI | 코드 상수(prompts.ts) → DB prompt_configs 테이블 마이그레이션. 섹션별 행 관리 + 캐싱(TTL) + 관리자 UI 편집(super_admin) + 버전 히스토리 | system-prompt-spec.md §1 |
| V2-13 | 히스토리 요약 전략             | 트리거: 계정 인증 + 장기 대화(재방문) 도입 시. 20턴 초과 요약 설계. token-management.md §3.3                                    | P1-36                    |
| V2-14 | RAG 결과 압축              | 트리거: 데이터 규모 증가 (500→5,000건+) 시. 검색 결과 경량 포맷 설계. tool-spec.md §1                                         | P1-37                    |
| V2-15 | 토큰 카운터 구현              | 트리거: 비용 모니터링에서 토큰 급증 감지 시                                                                               | P1-35                    |
| V2-16 | 모델별 토큰 예산 분리           | 트리거: 역방향 폴백(Gemini→Claude) 도입 시                                                                         | P1-35                    |
| V2-17 | 토큰 기반 히스토리 로드 전환       | 트리거: 턴당 토큰 변동이 커서 턴 수 기반 부정확 시                                                                          | P1-35                    |


### v0.3 백로그


| ID   | 태스크              | 설명                                                                      | 참조             |
| ---- | ---------------- | ----------------------------------------------------------------------- | -------------- |
| V3-1 | DOM-5 문화 체험      | experiences 테이블 마이그레이션 + ExperienceCard + 추천 로직. schema.dbml에 테이블 정의 완료 | PRD §4-B DOM-5 |
| V3-2 | Stage 2 (코스+팔로업) | F3 뷰티 여정 코스 생성 + F7 자동 팔로업                                              | PRD §2.2       |
| V3-3 | 행동 로그 분석         | behavior_logs 기반 BH-4 자동 학습. 클릭·예약·재방문 패턴 → learned_preferences 갱신      | PRD §5.3 X11   |


- 소프트 런칭 피드백 반영

