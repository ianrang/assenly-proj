# TODO — 에센리 K-뷰티 AI 에이전트

> 프로젝트 정의: `[MASTER-PLAN.md](docs/03-design/MASTER-PLAN.md)`
> 범례: ✅ 완료 · 🔶 보류/v0.2 연기 · ➡️ v0.2 연기 · ⬜ 미수행 · 🗑️ 제거 · ⏭️ 스킵 · ❌ 제외 · ⏸️ 펜딩

---

## 진행률


| Phase      | 작업 수    | 완료      | v0.2 연기 | MVP 잔여 | 상태     |
| ---------- | ------- | ------- | ------- | ------ | ------ |
| 사전 완료      | 12      | 12      | 0       | 0      | ✅      |
| Phase 0    | 37      | 37      | 0       | 0      | ✅      |
| Phase 1    | 62      | 60      | 2       | 0      | ✅      |
| Phase 2    | 132     | 105     | 16      | 11     | 🔶 진행중 |
| Phase 3    | 37      | 6       | 19      | 12     | 🔶 진행중 |
| **MVP 합계** | **280** | **220** | **37**  | **23** |        |
| 관리자 앱 (펜딩) | 20      | 0       | 0       | 20     | ⏸️ 펜딩  |


> 집계 기준: "작업 수"는 ❌ 제외·🗑️ 제거·⏭️ 스킵을 뺀 유효 작업. "v0.2 연기"는 ➡️ + 🔶 합산.

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
| P0-35 | 이미지 출처/저작권      | ~~브랜드 공식 이미지 우선~~ → **P2-V3 갱신: MVP placeholder 전략 확정 (D-14)**. 4/5 브랜드 서면 승인 필요. 저장소: Supabase Storage. 정본: data-collection.md §4  | 확보 전략 결정              | ✅   |
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
| P1-9  | 사용자 앱 화면 상세         | 4페이지(Landing/Onboarding/Profile/Chat) 컴포넌트 분해, 상태 매트릭스, tool-result→UI 매핑. 재사용 컴포넌트(ProductCard/TreatmentCard 등) + 공통 패턴(에러/로딩/빈 상태/세션 만료). client/features/ 계층만                   | `user-screens.md`  | ✅   |
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


| ID    | 작업            | 상세                                                                                       | 산출물              | 상태  |
| ----- | ------------- | ---------------------------------------------------------------------------------------- | ---------------- | --- |
| P1-19 | API 공통 규격     | 응답 형식({data,error,meta}), 에러 코드(도메인별), HTTP 상태, 페이지네이션, Rate limit 헤더                    | `api-spec.md` §1 | ✅   |
| P1-20 | 사용자 앱 API     | 14개 엔드포인트. 인증(선택/필수), 요청/응답 스키마, 필터 파라미터                                                 | `api-spec.md` §2 | ✅   |
| P1-21 | Chat API 스트리밍 | SSE 6개 이벤트 타입, 에러 이벤트 3종, 서버 11단계 플로우. 에러 복구 상세→P1-40                                    | `api-spec.md` §3 | ✅   |
| P1-22 | Rate Limiting | Chat 분당15/일100 (P2-50b에서 5→15 조정), 공개API 분당60, 익명생성 분당3/IP. MVP 메모리Map, v0.2 Redis(V2-3) | `api-spec.md` §4 | ✅   |
| P1-23 | 관리자 CRUD API  | 제네릭 CRUD(7엔티티), 관계 관리, 하이라이트, 이미지 업로드. withAuditLog 미들웨어                                 | `api-spec.md` §5 | ✅   |
| P1-24 | 관리자 인증 API    | Google SSO→자체JWT(24h), 토큰 갱신, 계정 관리(super_admin), 감사 로그 조회                               | `api-spec.md` §6 | ✅   |


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

> 목표: 사용자 앱 구현 (관리자 앱은 Gate 2 이후 별도 진행)
> 예상: 5~~7주 (1인) / 4~~5주 (2인)
> 전제: Gate 1 통과
> **실행 순서: P2-V(사전 검증) → 인프라 코드 → 이하 병렬 진행. P2-V는 Phase 0 성격의 기술 검증이나, Phase 0/1 완료 후 신규 발견 항목이므로 Phase 2 선두에 배치. 코드 작성 전 반드시 완료.**

## 인프라 코드 (1~2주)


| ID   | 작업                    | 상세                                                                                                                                   | 상태  |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --- |
| P2-1 | 환경변수 + 설정 모듈          | server/core 설정, 환경별 분기 + shared/constants/ai.ts (LLM_CONFIG + TOKEN_CONFIG)                                                          | ✅   |
| P2-2 | Supabase 서버 클라이언트     | server/core/db.ts: createAuthenticatedClient(RLS 적용) + createServiceClient(RLS 우회). @supabase/supabase-js + config.ts env 경유. 테스트 4개 | ✅   |
| P2-3 | Supabase 브라우저 클라이언트   | client/core/config.ts(zod 검증) + supabase-browser.ts(Auth 전용 팩토리). DB 직접 접근 없음. 테스트 5개                                                | ✅   |
| P2-4 | DB 마이그레이션 실행          | 004(P1-16+P1-17) + 005(인덱스 13개) + 006(beauty_summary) 실행 완료. kit_subscribers 인덱스는 P2-25에서 처리                                         | ✅   |
| P2-5 | AI 엔진 + Rate Limiter  | core/rate-limit.ts(메모리Map, window구분자) + features/chat/llm-client.ts(callWithFallback+shouldFallback). ai-engine.ts 삭제. 테스트 13개       | ✅   |
| P2-6 | 프롬프트 관리 모듈            | features/chat/prompts.ts: 고정 6개 상수(§2~~§7) + 동적 3개 함수(§8~~§10) + buildSystemPrompt 조립. 순수 함수. 테스트 6개                                 | ✅   |
| P2-7 | Knowledge 검색 (RAG) 모듈 | config.ts: getEmbeddingModel() + knowledge.ts: embedQuery(RETRIEVAL_QUERY) + embedDocument(RETRIEVAL_DOCUMENT). 테스트 6개               | ✅   |
| P2-8 | 대화 메모리 관리 모듈          | core/memory.ts: loadRecentMessages(턴 기반) + saveMessages(DB INSERT). SupabaseClient 파라미터 주입(P-4). 테스트 8개                              | ✅   |


## 사용자 앱 — 서비스 + API (2~3주)


| ID     | 작업                                         | 상세                                                                                                                                                                                                                                | 상태  |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| P2-9   | Anonymous 인증 서비스 + API                     | 익명 세션 생성/관리. core/auth.ts(인증 미들웨어) + features/auth/service.ts + route. 테스트 21개                                                                                                                                                    | ✅   |
| P2-10  | 프로필 서비스 + API                              | profile service(upsert/get/update) + journey service(createOrUpdate/getActive) + onboarding/profile route. 테스트 30개                                                                                                                | ✅   |
| P2-11  | 여정 서비스 + API                               | P2-10에서 완료: createOrUpdateJourney + getActiveJourney. POST /api/journey route는 v0.2 (api-spec B.4)                                                                                                                                | ✅   |
| P2-12  | 뷰티 판단 엔진                                   | judgment.ts: rank() 공통 정렬 + ScoredItem/RankedResult 계약 인터페이스. 순수 함수. 테스트 6개                                                                                                                                                       | ✅   |
| P2-13  | 쇼핑 도메인 로직                                  | shopping.ts: scoreProducts (DV-1/2 성분 매칭). ScoredItem 계약 구현. 순수 함수. 테스트 8개                                                                                                                                                        | ✅   |
| P2-14  | 시술 도메인 로직                                  | treatment.ts: scoreTreatments (다운타임 필터 + checkDowntimeSafety 재사용). 순수 함수. 테스트 11개                                                                                                                                                 | ✅   |
| P2-15  | DV 계산기                                     | derived.ts: DV-1(선호 성분) + DV-2(기피 성분) + DV-3(세그먼트). 독립 순수 함수. 테스트 10개                                                                                                                                                             | ✅   |
| P2-16  | Product 리포지토리                              | product-repository.ts(4메서드) + query-utils.ts(공통 8유틸). 테스트 22개                                                                                                                                                                     | ✅   |
| P2-16a | Store 리포지토리                                | store-repository.ts(3메서드). matchByVector 없음(RPC 미설계). 테스트 8개                                                                                                                                                                      | ✅   |
| P2-17  | Treatment 리포지토리                            | treatment-repository.ts(4메서드) + 007_fix_match_treatments.sql(RPC 수정). 테스트 10개                                                                                                                                                     | ✅   |
| P2-17a | Clinic 리포지토리                               | clinic-repository.ts(3메서드). matchByVector 없음(RPC 미설계). 테스트 8개                                                                                                                                                                     | ✅   |
| P2-20  | Chat Tool — search_beauty_data             | search-handler.ts: domain 분기 + 벡터/SQL 폴백 + beauty 판단 + stores/clinics junction. 테스트 10개                                                                                                                                           | ✅   |
| P2-21  | Chat Tool — get_external_links             | links-handler.ts: entity_type별 링크 조회 + LinkType 확장(purchase/booking/map). 테스트 7개                                                                                                                                                  | ✅   |
| P2-22  | Chat Tool — extract_user_profile (동기 tool) | extraction-handler.ts: zod 스키마 6개 변수 + parse→반환. DB 없음. budget 'moderate'. 테스트 5개                                                                                                                                                 | ✅   |
| P2-19  | 채팅 서비스                                     | service.ts: conversation CRUD + prompt + LLM(callWithFallback+stopWhen) + 3 tools. 테스트 7개                                                                                                                                         | ✅   |
| P2-23  | Chat API (스트리밍)                            | route.ts: 인증+검증+rate limit(5/분+100/일)+cross-domain+chatService+SSE+비동기후처리. 테스트 8개                                                                                                                                                 | ✅   |
| P2-18  | Knowledge 리포지토리                            | 🔶 **v0.2 연기**. 사유: (1) KB 테이블 미설계(schema.dbml 미정의) (2) search_beauty_data에 knowledge 도메인 없음(tool-spec.md §1: shopping/treatment만) (3) MVP KB는 시스템 프롬프트 인라인(embedding-strategy.md §2.4). 선행: KB 테이블 마이그레이션(v0.2) + tool domain 확장 | 🔶  |
| P2-24  | Chat 히스토리 API                              | GET /api/chat/history: conversation 자동 조회. **P2-50b에서 conversations.ui_messages 직접 반환으로 전환** (loadRecentMessages → ui_messages JSONB). 테스트 15개 (P2-50c 보강 포함)                                                                     | ✅   |
| P2-25  | Kit CTA API                                | 008_kit_subscribers migration + core/crypto.ts(AES-256+SHA-256) + POST /api/kit/claim. 테스트 11개                                                                                                                                    | ✅   |
| P2-26  | 행동 로그 서비스 + API                            | POST /api/events: 4개 이벤트(path_a_entry/card_exposure/card_click/external_link_click) + metadata zod + Q-15. 테스트 7개                                                                                                                 | ✅   |
| P2-26b | 도메인 데이터 공개 읽기 API                          | 8개 route (4목록+4상세). findAll* 재사용(offset→page). embedding 제외. optionalAuth. 테스트 20개                                                                                                                                                | ✅   |
| P2-27  | 단위 테스트 — beauty/ 순수 함수                     | P2-12~15에서 TDD로 구현 완료. judgment 6 + shopping 8 + treatment 11 + derived 10 = 35개 테스트                                                                                                                                              | ✅   |
| P2-28  | 단위 테스트 — zod 스키마 검증                        | 각 route/tool 테스트에서 유효/무효 입력 이미 검증. onboarding 3, chat 2, events 3, extraction 2 등. 추가 불필요                                                                                                                                         | ✅   |
| P2-28a | API 레이어 Hono 전환 + OpenAPI 자동 문서화           | 15 route → Hono. middleware(auth+rateLimit). GET /api/docs Swagger UI 자동. core/features/shared 무수정. 테스트 30개                                                                                                                       | ✅   |


## 사용자 앱 — UI (2~3주, 병렬 가능)


| ID     | 작업                              | 상세                                                                                                                                                                                                                                                                                                                                                                                                                                     | 의존          | 상태  |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- |
| P2-29  | 공통 레이아웃 + locale 레이아웃           | shadcn/ui 초기화(18컴포넌트) + cn.ts + viewport 메타태그 + safe-area + touch-action + Sonner Toaster. globals.css 모바일 호환성                                                                                                                                                                                                                                                                                                                         | —           | ✅   |
| P2-30  | 에러 바운더리 + 에러 화면                 | [locale]/error.tsx (role="alert" + 포커스 이동 + reset) + [locale]/not-found.tsx (404) i18n. Root not-found.tsx + global-error.tsx (locale 밖 영어). 브랜드 통일 (primary 코드 + "Back to home"). BrandLogo → 홈 링크 `<a href="/">`                                                                                                                                                                                                                     | —           | ✅   |
| P2-31  | Header + LanguageSelector       | 공유 앱 Header(props 기반 좌측 컨텍스트) + shadcn Select LanguageSelector + LanguageContext(대화 언어)                                                                                                                                                                                                                                                                                                                                                | P2-29       | ✅   |
| P2-32  | Landing 페이지                     | 풀 너비 마케팅 랜딩 7컴포넌트 + (app)/ 라우트 그룹 분리 + CTA 인라인 동의 + ReturnVisitBanner(프로필) + 그래디언트 애니메이션                                                                                                                                                                                                                                                                                                                                               | P2-29       | ✅   |
| P2-33  | 온보딩 페이지 + 4단계 컴포넌트              | ✅ 코드 완료. **MVP에서 비활성** — 라우트 파일 유지, Landing 진입 경로 없음. v0.2(이메일 로그인)에서 활성화. mvp-flow-redesign.md §3 참조                                                                                                                                                                                                                                                                                                                                  | P2-29       | ✅   |
| P2-34  | 프로필 전환/확인 화면                    | ✅ 코드 완료. **MVP에서 비활성** — 라우트 파일 유지, Landing 진입 경로 없음. v0.2(이메일 로그인)에서 활성화. mvp-flow-redesign.md §3 참조                                                                                                                                                                                                                                                                                                                                  | P2-29       | ✅   |
| P2-39  | HighlightBadge 컴포넌트             | VP-1 비개입 시각 강조. is_highlighted+badge 조건부 렌더링. teal 토큰. 다국어 폴백                                                                                                                                                                                                                                                                                                                                                                          | P2-29       | ✅   |
| P2-36  | 5영역 탭 바                         | 🔶 **MVP 보류**: Chat에서 TabBar 제거. en.json `tabs` 키 유지 (TabBar.tsx 참조). 대화 흐름 내 AI 카드 삽입 방식이 VP-4에 부합. v0.2에서 필요성 재검토 (PRD §3.4 탭 구성 보류 참조)                                                                                                                                                                                                                                                                                              | P2-29       | 🔶  |
| P2-37  | ProductCard 컴포넌트                | 4상태(normal/highlighted/skeleton/img-error) + HighlightBadge + localized() + Skeleton                                                                                                                                                                                                                                                                                                                                                   | P2-39       | ✅   |
| P2-38  | TreatmentCard 컴포넌트              | 시술 카드(가격 범위/시간/다운타임 경고 coral) + HighlightBadge + localized() 공용 추출                                                                                                                                                                                                                                                                                                                                                                     | P2-39       | ✅   |
| P2-35  | Chat 인터페이스                      | AI SDK v6 useChat + MessageBubble/List + InputBar(visualViewport) + SuggestedQuestions(경로B) + StreamingIndicator + TabBar                                                                                                                                                                                                                                                                                                              | P2-36~P2-38 | ✅   |
| P2-46  | MVP 흐름 재설계 — 설계 확정              | Chat-First 단일 경로 설계 문서 작성 완료. Landing 단일 CTA + 채팅 내 온보딩 + 카드 결과 + Kit CTA. 프로필/이메일 로그인 v0.2 연기. 설계: `mvp-flow-redesign.md`                                                                                                                                                                                                                                                                                                             | P2-35       | ✅   |
| P2-47  | Landing 단일 CTA + Chat-First 적용  | HeroSection 단일 CTA + ReturnVisitBanner 닫기 버튼 + ChatInterface hasProfile 제거 + chat.ts 프로필 INSERT (P2-50b에서 afterWork→onFinish 통합) + scrollbar-thin + createMinimalProfile 테스트 2개. 커밋 `4830325`                                                                                                                                                                                                                                          | P2-46       | ✅   |
| P2-48  | PRD/설계 문서 v0.2 범위 동기화           | PRD §3.1~3.8 + §5.1/5.6 Chat-First 반영. user-screens §2.3/§3.1/§3.4/§3.5/§6.3 동기화. ANALYTICS K1 측정식 + path_a_entry v0.2 보류. data-privacy, sitemap, api-spec, tool-spec 동기화. 커밋 `aa13980`                                                                                                                                                                                                                                                | P2-46       | ✅   |
| P2-51  | Chat 카드 렌더링 파이프라인               | card-mapper.ts(tool-result→ChatMessagePart변환) + MessageGroup(시각적그룹핑) + MessageList(파트별분기렌더링) + ChatInterface(card-mapper연결). 테스트 13건. 커밋 `85c7553`~`2c505c3`                                                                                                                                                                                                                                                                           | P2-47       | ✅   |
| P2-40  | Kit CTA 컴포넌트 + 연동               | Sheet 프리미티브(`ui/primitives/sheet.tsx`) + KitCtaCard(하이라이트카드) + KitCtaSheet(이메일폼 bottom sheet, react-hook-form, POST /api/kit/claim) + card-mapper 연동(is_highlighted→kit-cta-card 파트). 커밋 `7645121`~`01473d8`                                                                                                                                                                                                                           | P2-51       | ✅   |
| P2-49  | "Show recommendations" 버튼       | 🔶 **보류**: Chat-First 설계에서 "온보딩 완료" 명시적 시점 부재. 클라이언트 감지(extraction tool 유무)는 타이밍 부정확, 서버 신호는 오버엔지니어링. AI가 정보 수집과 추천을 동시 수행하므로 순차적 전환 버튼 불필요. **런칭 후 K1/K2 데이터로 재검토**. 결정 사유: `docs/05-design-detail/p2-49-deferred.md`                                                                                                                                                                                                                 | P2-51       | 🔶  |
| P2-XX  | SuggestedActions (서버 기반 제안 버튼)  | 🔶 **보류**: AI 응답에 상황별 액션 버튼(suggested_actions) 포함. 초기 SuggestedQuestions의 대화 중 확장판. 서버가 컨텍스트에 맞는 제안을 구조화 데이터로 전달 → 클라이언트 렌더링. **P2-49 재검토 시 함께 평가**. 업계 표준 패턴 (ChatGPT/Gemini suggested replies)                                                                                                                                                                                                                                       | K1/K2 데이터   | 🔶  |
| P2-50a | 기술 검증: AI SDK 메시지 저장/복원 PoC     | 비즈니스·코어 코드 무수정. AI SDK 타입 정의 + 공식 문서 기반 정적 분석: (1) onFinish UIMessage[] 구조 확인 — tool parts 포함 확정 (2) UIPartLike ↔ UIMessagePart 호환성 확인 — 완전 호환 (3) 저장 전략 결정: UIMessage[] 통째 저장 (conversations.ui_messages jsonb). (4) afterWork→onFinish 통합 + 요청 파싱 변경 영향 분석. **결과물**: `message-persistence-strategy.md`                                                                                                                               | P2-24       | ✅   |
| P2-50b | 메시지 저장 + LLM 컨텍스트 연속성           | conversations.ui_messages jsonb 추가(009 migration + schema.dbml). chat.ts: UIMessage 파싱(Q-1 text-only 검증) + 서버 권위적 히스토리(convertToModelMessages) + onFinish(UIMessage[] 저장 + 추출 저장 통합) + messageMetadata(conversationId 전달) + consumeStream + rate limit 5→15/분. service.ts: history:ModelMessage[] 파라미터 + loadRecentMessages 제거. ChatInterface: prepareSendMessagesRequest + conversationId 상태. api-spec rate limit 동기화. 테스트 592/592 통과 | P2-50a      | ✅   |
| P2-50c | Chat 히스토리 클라이언트 로드              | ChatInterface: 마운트 시 fetch('/api/chat/history') → useChat({ messages }) 카드 포함 복원 + conversationId 초기화. ChatSkeleton 로딩 UI. ChatContent 분리(조건부 렌더링으로 useChat 초기화 시점 제어). P2-50b 테스트 보강 4건: onFinish 저장 + messageMetadata conversationId + 손상 ui_messages 폴백 + convertToModelMessages 실패 폴백. 테스트 596/596 통과                                                                                                                              | P2-50b      | ✅   |
| P2-43  | 면책 조항 페이지                       | Terms 페이지 내 Disclaimer 섹션으로 통합. 시술 추천 면책, 의료 조언 아닌 정보 제공, 제3자 서비스 면책, 정확성 한계 명시. system-prompt-spec §5 Guardrails 기반                                                                                                                                                                                                                                                                                                                   | P2-29       | ✅   |
| P2-44  | 이용약관 + 개인정보처리방침 페이지             | Terms(/terms) + Privacy(/privacy) 별도 페이지. PRD §4-C + data-privacy.md 기반 실제 콘텐츠. 법률 상수(shared/constants/legal.ts) 단일 관리. PA-20에서 관리자 화면 전환 예정                                                                                                                                                                                                                                                                                           | P2-29       | ✅   |
| P2-45  | 동의 시점 채팅 내 이동 검토                | Landing 동의 → Chat 첫 메시지 전 동의로 이동. ChatInterface 내 ConsentOverlay + 세션 생성. data-privacy §1.2, PRD §4-C, mvp-flow-redesign §2.3 갱신 완료                                                                                                                                                                                                                                                                                                    | P2-47       | ✅   |
| P2-66  | ProductCard purchase_links 렌더링  | ProductCard 푸터에 "Buy Online" 구매 링크 추가. purchase_links[0] 첫번째만 표시, 외부 링크(새 탭). store 링크와 동일 패턴. 테스트 4건(배열/다수/null/빈배열). 벡터 검색 RPC 컬럼 누락은 P2-78 별도 태스크                                                                                                                                                                                                                                                                                   | P2-64a      | ✅   |
| P2-67  | ProductCard english_label 배지    | ProductCard 푸터에 "English Label" pill 배지 추가. english_label===true 시 렌더링. tags 배지와 동일 패턴(neutral pill). 푸터 순서: 배지→지도→구매. 테스트 2건(true/false)                                                                                                                                                                                                                                                                                              | P2-64a      | ✅   |
| P2-68  | store map_url E2E 검증            | 전 경로 단위 테스트 검증 완료. ProductCard 테스트 3건 추가(map_url 링크/plain text/미제공). card-mapper extractMapUrl 3건 + search-handler loadRelatedStores 1건 기존 통과. 코드 수정 0건                                                                                                                                                                                                                                                                                | P2-64a      | ✅   |
| P2-69  | KB 시스템 프롬프트 주입                  | **완료 (2026-04-05)**. Tool 기반 + 빌드 생성 방식. generate-kb.ts: docs/knowledge-base/*.md → shared/constants/kb.generated.ts (37종). knowledge-handler: KB_DOCUMENTS 조회 + zod 스키마 co-location. service.ts: 4번째 tool 등록. prompts.ts §6 사용 지침. 테스트 9개                                                                                                                                                                                             | P2-57       | ✅   |
| P2-70  | ~~chat tool 단위 테스트 보강~~         | **→ v0.2 연기**. (1) extraction-handler 타입 통일 (2) treatment vector 검색 경로 테스트 (3) purchase_links 정상 경로 테스트. 기존 단위 테스트 350+건으로 MVP 커버 충분                                                                                                                                                                                                                                                                                                   | v0.2        | ➡️  |
| P2-79  | 인증-채팅 연결 버그 수정 (세션 토큰 전달)      | **완료 (2026-04-06)**. client/core/auth-fetch.ts(getAccessToken+authFetch) 신규. 클라이언트 SDK signInAnonymously + Bearer 헤더 전달. credentials:"include" 7곳 전수 교체. service.ts UPSERT 멱등성. auth-matrix.md §2.4/§3.1 정본 갱신. 테스트 719/719 pass | P2-9        | ✅   |
| P2-78  | match_products RPC 카드 렌더링 컬럼 확장 | **완료 (2026-04-07)**. 012_expand_rpc_columns.sql: match_products RETURNS TABLE 9→23컬럼, match_treatments 13→22컬럼. schema.dbml 1:1 대응(embedding/timestamps/status 제외). 코드 수정 0건, 하위 호환. Supabase Dashboard 적용 완료 | P2-66       | ✅   |
| P2-41  | Profile 페이지                     | 🔶 **v0.2 연기**: 이메일 로그인 후 프로필 조회/편집. 기존 컴포넌트(ProfileClient/ProfileCard) 재사용. mvp-flow-redesign.md §3 참조                                                                                                                                                                                                                                                                                                                                | v0.2        | 🔶  |
| P2-42  | 프로필 Context                     | 🔶 **v0.2 연기**: 이메일 로그인 후 React Context 상태 관리. mvp-flow-redesign.md §3 참조                                                                                                                                                                                                                                                                                                                                                              | v0.2        | 🔶  |


## 데이터 준비 — 사전 검증 (Phase 2 착수 전 필수)

> 설계서: `docs/05-design-detail/data-collection.md` §8 미검증 항목
> **Phase 2 코드 작성 전에 완료 필수.** 결과에 따라 파이프라인 전략이 변경될 수 있음.


| ID    | 작업                            | 상세                                                                                                                                                                       | 의존   | 상태  |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | --- |
| P2-V2 | 식약처 API 실제 호출 검증 (U-2)        | **완료 (2026-03-25)**. S3/S4/S5 실제 호출 성공. 발견: S3 CAS_NO 대부분 NULL → S6 JOIN 키를 INGR_ENG_NAME↔INCI name으로 변경. S4 REGULATE_TYPE 필터 미작동 → 전체 다운로드+클라이언트 필터. 제조업자 API → MVP 불필요 | 없음   | ✅   |
| P2-V3 | 브랜드 공식 이미지 정책 확인 (U-6)        | **완료 (2026-03-26)**. 5개 브랜드 약관+업계 관행 조사. 4/5 상업적 사용 금지 명시, 1/5 불명확(COSRX). 업계 표준: 브랜드 직접 제출 모델. **판정: MVP placeholder 전략 확정 (D-14). 서면 승인 획득 후 순차 전환**                   | 없음   | ✅   |
| P2-V4 | EU CosIng CSV + 커버리지 검증 (U-3) | **V4-A 완료 (2026-03-25)**. 공식 CSV 28,705건 확보. 대표 30개 성분 INCI 매칭률 **100%**. Function 30/30 보유. S3↔CosIng 교차매칭 5/5 성공. **판정: S6 유효, JOIN 키 변경만**                            | 없음   | ✅   |
| P2-V5 | ~~시술 가격 범위 현실성 검증 (U-7)~~     | **→ v0.2 연기**. 5개 클리닉 실제 상담 가격 대조. MVP는 "참고 가격" 면책 표시로 대응                                                                                                                | v0.2 | ➡️  |
| P2-V7 | 올리브영 글로벌 이용약관 검토 (U-13)       | **완료 (2026-03-25)**. 제14조② 상업적 목적 데이터 금지. robots.txt /product Allow. 판정: 브랜드 사이트 1순위, 올리브영 글로벌 2순위(보조). cosrx/laneige/innisfree robots.txt 허용 확인                         | 없음   | ✅   |


### ~~후순위 대기~~ → MVP 제외 (v0.2 백로그로 이동)

> P2-V1, P2-V6, P2-56e: 어필리에이트 활성화가 현실적으로 어려워 MVP 범위에서 제외 (2026-03-29). 제품 데이터는 A-3 시드 크롤링 + CSV 수동으로 대체. purchase_links는 affiliate_code 없이 일반 URL로 운용.

## 데이터 준비 — 파이프라인 구현 (코어 구현과 병렬)

> 설계서 §7. 코드 위치: `scripts/seed/lib/` (Phase 2 초반 CLI). 관리자 앱 통합 시 `server/features/pipeline/`으로 이동.
> 의존 규칙: `scripts/ → server/core/, shared/` 허용. 역방향 금지. `server/features/` import 금지.


| ID         | 작업                                           | 상세                                                                                                                                                                                                                                                            | 의존                             | 상태   |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---- |
| P2-56a     | shared/validation/ zod 스키마 정의                | **완료 (2026-03-28)**. 7엔티티 create/update 스키마 + 관계 3개 + 하이라이트. 공통 패턴(localizedText, statusEnum, pagination). CLAUDE.md §2.4 + security-infra.md §2.1 갱신. 스켈레톤 데이터 열거값 불일치 17건 수정                                                                                | P2-V2                          | ✅    |
| P2-56b     | scripts/seed/config.ts 파이프라인 환경변수            | **완료 (2026-03-28)**. zod 검증 14개 변수 (파이프라인 전용 4 + DB 3 + AI 5 + App 2). core/config.ts 독립 — ADMIN_JWT_SECRET 등 불필요 변수 미포함. superRefine AI 키 조건부 필수                                                                                                             | P2-V2                          | ✅    |
| P2-56c     | scripts/seed/lib/types.ts 파이프라인 타입           | **완료 (2026-03-28)**. EntityType, RawRecord, EnrichedRecord, ValidatedRecord, LoadResult, PipelineResult, PipelineError, PlaceProvider, RawPlace. shared/types import만                                                                                         | P2-56a                         | ✅    |
| P2-56d     | 카카오 로컬 프로바이더 (S1)                            | **완료 (2026-03-29)**. scripts/seed/lib/providers/kakao-local.ts. PlaceProvider 구현 + 페이지네이션(size=15, is_end, MAX_PAGES=45) + 지수 백오프 재시도(3회) + sourceId dedup. mapDocumentToRawPlace 분리 + 단위 테스트 11개. vitest.config.ts scripts/ include 추가                       | P2-56b, P2-56c                 | ✅    |
| ~~P2-56e~~ | ~~쿠팡 파트너스 프로바이더 (S7)~~ → **MVP 제외**          | v0.2 백로그로 이동. 어필리에이트 활성화 후 coupang-partners.ts 구현 예정                                                                                                                                                                                                          | ~~P2-V1~~                      | ❌ 제외 |
|            | **── Layer 1: 프로바이더 (Stage 1 도구, 각각 독립) ──** |                                                                                                                                                                                                                                                               |                                |      |
| P2-56j     | CSV 로더 프로바이더                                 | **완료 (2026-03-29)**. csv-loader.ts + csv-parser.ts(공유 유틸, P-7). csv-parse 라이브러리. loadCsvAsRawRecords(filePath, entityType) → RawRecord[]. 테스트 12개. cosing-csv/review-exporter도 csv-parser.ts 공유 예정                                                            | P2-56c                         | ✅    |
| P2-56f     | 식약처 원료성분 프로바이더 (S3)                          | **완료 (2026-03-29)**. mfds-ingredient.ts. 전체 풀 다운로드(페이지네이션) + sourceId=INGR_KOR_NAME dedup. fetchWithRetry 재사용. 공공데이터포털 items 구조 방어. 테스트 10개                                                                                                                   | P2-V2, P2-56c                  | ✅    |
| P2-56i     | CosIng CSV 프로바이더 (S6)                        | **완료 (2026-03-29)**. cosing-csv.ts. csv-parser.ts 공유(P-7). sourceId=INCI name, delimiter=";". config COSING_CSV_PATH 자체 참조. S3↔S6 매칭은 fetch-service(P2-56n) 담당. 테스트 10개                                                                                       | P2-V4, P2-56c                  | ✅    |
| P2-56g     | 식약처 사용제한 프로바이더 (S4)                          | **완료 (2026-03-29)**. mfds-restricted.ts. 전체 다운로드(31K건) + 복합키 sourceId(INGR_ENG_NAME:COUNTRY_NAME) dedup. 국가별 레코드 모두 보존(6개국 서비스). 비즈니스 필터링은 Stage 2~3 담당. 테스트 15개                                                                                              | P2-56f                         | ✅    |
| P2-56h     | 식약처 보고품목 프로바이더 (S5)                          | **완료 (2026-03-29)**. mfds-functional.ts. 키워드 검색(item_name) + 페이지네이션. entityType="product", sourceId=COSMETIC_REPORT_SEQ. 퍼지 매칭은 P2-64e(Phase E) 담당. 테스트 14개                                                                                                   | P2-V2, P2-56c                  | ✅    |
| P2-56e2    | **웹 스크래퍼 프로바이더 (Channel A-3)**               | **완료 (2026-03-29)**. web-scraper.ts(엔진) + site-configs.ts(설정 분리, P-7). Playwright 헤드리스. source 분리: scraper-brand/scraper-oliveyoung. Crawl-delay 5초. 사이트 에러 격리. 테스트 10개                                                                                       | P2-56b, P2-56c, P2-V7          | ✅    |
|            | **── Layer 2: AI 모듈 (Stage 2 도구, 각각 독립) ──** |                                                                                                                                                                                                                                                               |                                |      |
| P2-56k     | AI 번역 모듈                                     | **완료 (2026-03-29)**. translator.ts + ai-client.ts(파이프라인 전용 모델 팩토리). ko→en 필수 + ja/zh/es/fr 선택. LocalizedText 출력. 번역 실패 시 ko 폴백. 테스트 19개                                                                                                                       | P2-56c, P2-5                   | ✅    |
| P2-56l     | AI 분류 모듈                                     | **완료 (2026-03-30)**. classifier.ts. classifyFields(inputData, fieldSpecs) 범용 함수. FieldSpec.strict 옵션(false=자유 텍스트 분류). 허용값 필터링 + confidence 클램핑. 테스트 20개                                                                                                      | P2-56c, P2-5                   | ✅    |
| P2-56m     | AI 설명 생성 모듈                                  | **완료 (2026-03-30)**. description-generator.ts. generateDescriptions(inputData, fieldSpecs) 범용 함수. GenerationFieldSpec 전용 인터페이스. ko+en 동시 생성. 테스트 14개                                                                                                          | P2-56c, P2-5                   | ✅    |
| P2-56r     | AI 분류 정확도 PoC (U-1)                          | **완료 (2026-03-30)**. classify-accuracy.ts. M1 10건 Jaccard 비교. 테스트 16개. **실행 결과: overall 80% PASS (skin_types 100%, concerns 80%)**. 실패 2건은 dark_spots 미인식 — 프롬프트 개선 여지 있음. U-1 해소: AI 자동 분류 확정                                                                | P2-56l                         | ✅    |
|            | **── Layer 3: 오케스트레이션 + DB 적재 ──**           |                                                                                                                                                                                                                                                               |                                |      |
| P2-56p     | loader (Stage 4 DB 적재)                       | **완료 (2026-03-30)**. loader.ts + db-client.ts + id-generator.ts. deterministic UUID v5(entityType별 namespace) → zod 재검증 → Phase A→B→C FK순서 → 100건 청크 UPSERT. LoadOptions(dryRun/insertOnly/batchSize/entityTypes) 회차별 유연성. Junction 복합PK ON CONFLICT. 테스트 24개 | P2-56a, P2-2                   | ✅    |
| P2-56n     | fetch-service (Stage 1 오케스트레이션)              | **완료 (2026-03-30)**. fetch-service.ts + place-mapper.ts. Promise.allSettled 병렬 호출. classifyPlace(store/clinic) + 4단계 dedup. S3↔S6↔S4 ingredients 텍스트 매칭 합병. FetchOptions(targets/placeQueries/csvFiles/siteConfigs). 에러 격리. 테스트 35개                           | P2-56d,56e2,56f~j (~~56e 제외~~) | ✅    |
| P2-56o     | enrich-service (Stage 2 오케스트레이션)             | **완료 (2026-03-30)**. enrich-service.ts. ENRICHMENT_CONFIG 7엔티티별 매핑. 5단계: UUID→번역→분류(confidence)→생성(ko+en)→재번역(4언어). EnrichOptions(entityTypes/targetLangs/skip*). 건별 try-catch 에러 격리. 테스트 14개                                                                 | P2-56k~m, P2-56r               | ✅    |
|            | **── Layer 4: 최종 통합 ──**                     |                                                                                                                                                                                                                                                               |                                |      |
| P2-56o2    | review-exporter (Stage 3 검수 CSV)             | **완료 (2026-03-31)**. review-exporter.ts. 2-파일 전략: JSON(보존)+CSV(검수). 엔티티별 개별 파일. ENTITY_REVIEW_COLUMNS 선언적 설정. export(EnrichedRecord[]→JSON+CSV) + import(JSON+CSV→ValidatedRecord[]). csv-parser.ts에 stringifyCsvRows 추가. 테스트 22개                             | P2-56o                         | ✅    |
| P2-56q     | CLI 진입점 (8개 + 레거시 삭제)                        | **완료 (2026-03-31)**. 8개 CLI: fetch, import-csv, enrich, export-review, import-review, validate, load, run-all. run-all 두 모드(검수대기/auto-approve). validate DB 불필요 독립 검증. parse-args.ts 공통 유틸. entity-schemas.ts 공유. 레거시 run.ts+interface.ts 삭제                  | P2-56n~p                       | ✅    |


## 데이터 준비 — 데이터 입력 + 검수 (코어 구현과 병렬)

> 설계서 §5 큐레이션 + §6 엔티티별 상세 + §9 타임라인 (M1→M2→M3)
> 수집 순서: Phase A(brands, ingredients, stores, clinics, treatments 병렬) → Phase B(products) → Phase C(junction) → Phase D(임베딩)


| ID      | 작업                                     | 상세                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 마일스톤  | 상태  |
| ------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --- |
| P2-57   | 뷰티 지식 KB 작성 (K1)                       | **완료 (2026-03-26)**. 성분 가이드 20종 + 시술 가이드 15종 = 35종 AI 초안. 전체 품질 검증 통과 (면책, 필수 섹션, 200-2000자). K2(지역+상식)는 MVP 출시 전 별도                                                                                                                                                                                                                                                                                                                                                                                                                         | K1→K2 | ✅   |
| P2-58   | M1 스켈레톤 데이터 적재                         | **완료 (2026-03-26)**. 7엔티티 50건 YAML. FK 정합성 검증, 열거값 검증, D-14(images=[]) 모두 통과. domain.ts 전체 필드 준수                                                                                                                                                                                                                                                                                                                                                                                                                                             | M1    | ✅   |
| P2-59   | 큐레이션 리스트 확정                            | **완료 (2026-03-26)**. products 200 + stores 50 + clinics 30 + treatments 50 = 330건. 커버리지 검증: skin_type 5종 ✅, concerns 11종 ✅, 브랜드 80개(최대8/브랜드) ✅, 관광객접근 95% ✅                                                                                                                                                                                                                                                                                                                                                                                  | M1    | ✅   |
| P2-60   | Phase A: brands 50+ / ingredients 100+ | **완료 (2026-04-01)**. Step 1: classifier strict + function spec + inci_name 매핑 (테스트 6건). Step 2: brands 73건 JSON→enrich(6언어)→검수(영문명 15건 수정)→DB 적재. Step 3: ingredients S3(21,722)+S6+S4→105건 필터→enrich(번역+function+caution)→DB 적재. CosIng 구분자 수정(;→,)                                                                                                                                                                                                                                                                                         | M2    | ✅   |
| P2-61   | Phase A: stores 200+ (S1 자동수집)         | **완료 (2026-04-02)**. Step 1: STORE_TYPES daiso 추가 + StoreTypeClassifier 인터페이스(정규식 MVP, 30+패턴) + FIELD_MAPPINGS.store(store_type/district/english_support) + review-exporter 8컬럼 + translateKeys name.ko 수정. Step 2: fetch.ts --place-queries 파일 지원 + 카카오 10쿼리 278건 → AI 6언어 번역+설명 → 검수 → DB 적재. description.ko 한국어 번역 보정. classifiers/ 서브디렉토리 정리                                                                                                                                                                                             | M2    | ✅   |
| P2-61b  | stores 수동 보완 전수 입력                     | **완료 (2026-04-03)**. 체인별 공통값 일괄 적용(operating_hours, english_support, tourist_services, payment_methods) 272건 전수. 비매장 6건 삭제(사옥 3+서비스 3). A 방식(파이프라인 validated JSON → load.ts UPSERT)                                                                                                                                                                                                                                                                                                                                                          | M2    | ✅   |
| P2-61c  | LLM store_type 분류 검증 (선택→스킵)           | **스킵 (2026-04-03)**. other 105건 중 ~78건은 정확한 분류(독립 소매점). Phase A 완료 후 P2-65에서 stores+clinics+treatments 전체 LLM 분류 검증 일괄 수행 예정                                                                                                                                                                                                                                                                                                                                                                                                                 | M2    | ⏭️  |
| P2-62   | Phase A: clinics 30+ (S1 자동수집)         | **완료 (2026-04-04)**. Step 1: ClinicTypeClassifier 인터페이스(정규식 MVP, 4유형+null 폴백) + FIELD_MAPPINGS.clinic(clinic_type/district/english_support) + review-exporter 7컬럼. 테스트 16개 통과. Step 2: 카카오 10쿼리 225건 fetch → AI 6언어 번역+설명 → 검수(null 1건 수정) → DB 적재 225건. description.ko 영어 생성(stores와 동일 AI 이슈, P2-62b로 분리). location null 적재(stores 패턴, 좌표 clinics-locations.json 백업)                                                                                                                                                                       | M2    | ✅   |
| P2-63   | Phase A: treatments 53건 데이터 수집         | **완료 (2026-04-04)**. Step 1: KB 신규 2건(thread-lift, vitamin-drip). Step 2: 매니페스트 의학적 수정(다운타임 보수적 최대값 3건 + 피부타입/고민 불일치 6건) + 3건 추가(하이드라페이셜/쓰레드리프트/비타민수액) + duration_minutes/session_count 53건. Step 3: YAML→CSV 변환. Step 4: enrich-service FIELD_MAPPINGS.treatment(4개 추출기) + generateSpecs(precautions/aftercare) + review-exporter 6→15컬럼. TDD 테스트 19+21개. Step 5: import-csv→enrich(6언어 번역+분류+생성)→export-review. Step 6: 의학적 검수(downtime 3건+skin_types 4건+concerns 6건+precautions 20건 수정). Step 7: DB 적재 53건. 테스트 296/296 pass              | M2    | ✅   |
| P2-63b  | M1 스켈레톤 데이터 정리                         | **완료 (2026-04-04)**. DB 전수 검증: M1 slug UUID 20건 조회 → 전부 NOT FOUND. M1 데이터는 DB에 미존재 (적재 전 Phase A 파이프라인이 선행). 현재 DB는 Phase A UUID 데이터만 보유(brands 73, ingredients 105, stores 272, clinics 225, treatments 53). 고아 레코드 0건, FK 위반 0건. m1-skeleton.yaml → data/archive/ 이동(PoC 참조 경로 갱신). Phase B 진입 차단 요인 없음 확인                                                                                                                                                                                                                                 | M3    | ✅   |
| P2-63c  | lib/ 유틸리티 서브디렉토리 정리                    | **완료 (2026-04-04)**. csv-parser, retry, id-generator, db-client → lib/utils/ 이동 (7파일: 4소스+3테스트). import 경로 16건 수정 + vi.mock 경로 7건 수정 (13+7=20파일). 잔존 참조 0건 검증. 테스트 296/296 pass. classifiers/(P2-61) 동일 co-location 패턴                                                                                                                                                                                                                                                                                                                       | M3    | ✅   |
| P2-65   | 분류 검증 + 정규식 개선 (Phase A 완료 후)          | **완료 (2026-04-04)**. 전수 데이터 검증: stores 278건(other 111→94, brand_store 60→81, dept 46→42), clinics 225건(99.1% 정확, null 1건 정당), treatments 53건(critical 4+moderate 5 식별). 분류기 개선: brand_store 패턴 21개 추가 + dept_store 백화점→구체적 체인 패턴 교체(화장품백화점 3건 오분류 해소). 테스트 19→39. 후속: P2-65a(stores 비소매 제거), P2-65b(treatments 보정)                                                                                                                                                                                                                           | M3    | ✅   |
| P2-65a  | stores 비소매 데이터 제거                      | other 105건 전수 리뷰. 명확 비소매 11건(사옥 6+유통 2+서비스 2+작업실 1) + 경계 8건(오피스빌딩 3+유통 2+법인 2+한의원 1) = 19건 삭제. validated JSON + DB DELETE. 272→253건. P2-61b(6건)와 합산 총 25건 비소매 정리 완료                                                                                                                                                                                                                                                                                                                                                                          | M3    | ✅   |
| P2-65b  | treatments 분류 수동 보정 (8건)               | Critical 4건(Botox Jawline/Chin Filler/Fat Dissolving/Body Lifting — contouring 시술 target_concerns→[] 옵션A 적용) + Moderate 4건(Dermapen +dry, Botox Crow's Feet +sensitive, Water Glow +oily, LED 8→4개 축소). Laser Toning은 이미 정상 → 스킵. validated JSON 수정 + DB UPSERT 53건 완료. db-client.ts import 경로 수정(../config→../../config)                                                                                                                                                                                                                    | M3    | ✅   |
| P2-64a  | Phase B: products 200+ (CSV+수동)        | **완료 (2026-04-05)**. Step 1: 매니페스트 정규화(브랜드 25건 수정, 니치 3건→대체 3건) + Daiso 브랜드 추가. Step 2: slug.ts(sourceId 자연키, 13테스트) + csv-loader source옵션 + FIELD_MAPPINGS.product(_expected 보존+tags) + review-exporter 8→12컬럼. Step 3: YAML→CSV 200건 변환 + sourceId 유니크 검증. Step 4: brand_id 룩업(case-insensitive+alias 4건, 200/200 매칭) + AI 보강(6언어+분류+생성). Step 5: auto-approve DB 적재 200건. **D-7 전수 검수 완료 — AI+expected 합집합+카테고리별 규칙 적용, 99건 보정**. Step 6: Daiso 매장 84건(카카오 API→enrich→DB적재, stores 253→337). english_support "basic" 보정. 테스트 347/347 pass | M3    | ✅   |
| P2-64b  | ~~Phase B: doctors 30+~~               | **제거 (2026-04-05)**. 분석 결과 doctors 데이터는 서비스에 불필요: PRD 사용자 스토리·TDD·tool-spec·search-engine에서 doctor 참조 0건. MVP 추천 흐름(시술→클리닉 카드)에 doctor 도달 경로 없음. 스키마 완결성 목적의 과설계로 판단 → doctors 테이블·코드·설계 제거                                                                                                                                                                                                                                                                                                                                                  | M3    | 🗑️ |
| P2-64b2 | 011_drop_doctors.sql Supabase 적용       | **완료 (2026-04-05)**. Dashboard SQL Editor에서 실행. doctors 테이블 DROP 완료                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | M3    | ✅   |
| P2-64a2 | Essenly 자사 브랜드 + 제품 등록                 | **완료 (2026-04-05)**. brands: Essenly 브랜드 등록(is_essenly: true). products: 케라틴 헤어팩 1건 등록(is_highlighted: true, haircare, 24000원, 190ml). purchase_links: 쿠팡+Amazon. Kit CTA 자동 연결 확인. 코드 수정 0건                                                                                                                                                                                                                                                                                                                                                 | M3    | ✅   |
| P2-64c  | Phase C: junction 데이터                  | **완료 (2026-04-06)**. P2-64c-1: product_stores 9,900건 규칙 기반 자동 생성. P2-64c-2: product_ingredients 689건 LLM 매핑 + D-7 검수. P2-64c-3: clinic_treatments 5,611건 — 카카오맵 태그 추출(Playwright 225곳) + LLM 매핑(216/217성공) + 규칙 기반 fallback(9곳). 기존 전조합 9,411건→태그 기반 정밀 매핑으로 교체. 시술 커버리지 53/53, 클리닉 225/225. 테스트 60건 pass (ingredient-mapper 38 + clinic-treatment-mapper 22). 전문가 리뷰 완료: P2-64c 전체 30항목 전수 검증 통과, Q-6/G-10 리팩터링 포함 | M3    | ✅   |
| P2-64d  | Phase D: 임베딩 생성 + 벡터 DB 적재             | **완료 (2026-04-07)**. (1) shared/constants/embedding.ts 상수 + EmbeddingEntityType (2) features/embedding/text-builder.ts 순수 함수 4개 + 테스트 6건 (3) scripts/generate-embeddings.ts 배치 스크립트 (P-9 준수: core/ import 대신 ai SDK 직접 사용). 816건 전체 성공 (products 201 + stores 337 + clinics 225 + treatments 53). generator.ts/repositories 메서드는 v0.2 admin CRUD와 함께 구현 (G-4). **발견 이슈**: core/knowledge.ts embedDocument/embedQuery에 outputDimensionality:1024 누락 → P2-64d-fix로 분리 | M3    | ✅   |
| P2-64d-fix | core/ 임베딩 차원 1024d 설정 (L-4 승인)      | **완료 (2026-04-07)**. config.ts: getEmbeddingProviderOptions() 추가 (outputDimensionality를 env.EMBEDDING_DIMENSION에서 읽음). knowledge.ts: embedQuery/embedDocument에서 사용. 차원 변경 = .env 1곳 (P-7). 테스트 4/4 pass | M3    | ✅   |
| P2-64e  | ~~Phase E: S5 교차 검증 + 품질 게이트~~         | **→ v0.2 연기**. 식약처 보고품목 교차 검증(기능성화장품 태깅). M3 품질 게이트. MVP는 수동 spot-check로 대체                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | v0.2  | ➡️  |
| P2-64f  | v0.2: stores/clinics 직접 벡터 검색 확장       | **→ v0.2 연기**. match_stores/match_clinics RPC 함수 + repository matchByVector + tool domain enum 확장 + search-handler 분기 추가 + beauty/ 랭킹 로직. MVP는 junction 경유(제품→매장, 시술→클리닉). 사용자 로그에서 직접 장소 검색 니즈 확인 후 구현 | v0.2  | ➡️  |


## 통합 테스트


| ID    | 작업                   | 상세                                                                      | 상태  |
| ----- | -------------------- | ----------------------------------------------------------------------- | --- |
| P2-71 | API route 통합 테스트     | **완료 (2026-04-06)**. 6파일 33건 — auth/profile/events/kit/chat-history/domain-read. 실제 DB 연동 + 익명 세션 + 프로필 + 권한 검증 (P2-75 범위 포함) | ✅   |
| P2-72 | 검색 통합 테스트            | **완료 (2026-04-08)**. REST API 필터 41건(4도메인×필터유형+복합+한글/영문 ILIKE) + Vector RPC 15건(자기매칭+스키마+필터+정렬+빈결과). 56건 전체 통과. production 수정 0건 | ✅   |
| P2-73 | Chat API 통합 테스트      | **완료 (2026-04-08)**. 1파일 10건 — 인증/검증(3)+대화생성·스트리밍(3)+tool실행(1)+onFinish DB저장(1)+에러(2). MockLanguageModelV3로 LLM 모킹 + 실제 DB 연동. production 수정 0건. 통합 99건 전체 통과 | ✅   |
| P2-75 | ~~익명 인증 통합 테스트~~     | **→ v0.2 연기**. anonymous 세션 생성/유지/권한 검증. MVP는 수동 E2E로 대체. 관리자 인증은 PA-15 | ➡️  |


## 프롬프트 평가 실행


| ID    | 작업                     | 상세                                                                                          | 상태  |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------- | --- |
| P2-76 | ~~P1-30 평가 자동화 구현~~    | **→ v0.2 연기**. prompt-evaluation.md 20건 시나리오 자동화. MVP는 수동 테스트로 대체 (PoC P0-12/16/17에서 검증 완료) | ➡️  |
| P2-77 | ~~멀티턴 adversarial 검증~~ | **→ v0.2 연기**. 멀티턴 탈옥 패턴 테스트 + 가드레일 강화. MVP는 소프트 런칭 수동 검증으로 대체                              | ➡️  |


## 채팅 품질 수정


| ID      | 작업                      | 상세                                                                                                                                                                                | 상태  |
| ------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| P2-90   | ~~프롬프트: 인사 반복 제거~~      | isFirstTurn 분기 도입. 첫 턴에서만 인사, 후속 턴은 Continuing conversation 지시                                                                                                              | ✅   |
| P2-91   | ~~프롬프트: 반복 응답 방지~~      | Rules §5 "Response variety" 추가. 동일 문구/패턴 반복 금지, 대화 진전 유도                                                                                                                  | ✅   |
| P2-92   | ~~프롬프트: 선제적 추천 유도~~     | search_beauty_data "When to call"에 의도 감지 기반 선제 추천 조건 추가                                                                                                                   | ✅   |
| P2-93   | ~~프롬프트: Chat-First 온보딩 강화~~ | "Recommend → Ask One Thing" 패턴으로 교체. 추천 후 프로필 질문 1개 자연 유도                                                                                                             | ✅   |
| P2-94   | ~~UI: 추천 카드 컴팩트 레이아웃~~  | 가로 스크롤 160px compact 카드 + groupParts 순수 함수 추출 + 말풍선 w-fit 보정. 테스트 11건 추가                                                                                           | ✅   |
| P2-95   | ~~버그: 채팅 히스토리 미표시~~     | ChatContent.tsx 빈 parts 메시지 필터링으로 히스토리 표시 복구                                                                                                                            | ✅   |
| NEW-1   | ~~LLM temperature/maxTokens 설정~~ | TokenConfig에 temperature 0.4 + maxOutputTokens 1024 추가. streamText 호출에 적용                                                                                              | ✅   |
| NEW-2   | ~~프로필 자동 필터 merge~~       | searchShopping에서 LLM이 skin_types 생략 시 profile.skin_type 자동 적용                                                                                                             | ✅   |
| NEW-4   | ~~히스토리 트리밍~~             | TOKEN_CONFIG.historyLimit(20) 적용. 최신 20개 히스토리만 LLM에 전달                                                                                                                    | ✅   |
| NEW-5   | ~~Seed 데이터 재적재 (images + purchase_links)~~ | enrich-service images+purchase_links 매핑 추가 + products-validated.json 병합 + DB 201건 upsert 완료. 172/201 제품 Olive Young 링크 반영 | ✅   |
| NEW-6   | ~~채팅 히스토리 유실 수정~~          | 근본 원인: transport useMemo 클로저가 conversationId(null)를 캡처 → 두 번째 메시지부터 새 conversation 생성 → 대화 분리. 수정: conversationIdRef로 최신 값 참조. Playwright 재현+DB 검증 완료 | ✅   |
| NEW-7   | ~~토큰 기반 히스토리 트리밍~~      | **→ v0.2 연기**. 현재 메시지 카운트 20개 기반 → 토큰 예산 기반 전환. tool call/result가 메시지 슬롯을 소비하여 실질 대화 턴 감소 문제. P1-36(히스토리 요약)과 함께 하이브리드 방식 검토 | ➡️  |
| NEW-8   | CSV 소스 제품 이미지 보강         | **→ v0.2 연기**. CSV 채널 200개 제품에 imageUrl 없음. 방안: (1) 스크래퍼로 재수집 (2) CSV에 image URL 컬럼 추가 (3) purchase_links URL의 OG 이미지 추출. 법적/저작권 검토(G-12) 필요 | ➡️  |
| NEW-9   | 채팅 내 인라인 온보딩 (OnboardingChips)  | ConsentOverlay 통과 후 빈 채팅에 칩 UI(skin_type + concerns) 표시. "Start chatting" / "Skip" 두 경로. 선택 시 POST /api/profile/onboarding 호출 → AI 첫 응답부터 개인화. **별도 브랜치**. 정본: `docs/superpowers/specs/2026-04-09-onboarding-and-kit-cta-design.md` §2.1 | ⬜   |
| NEW-10  | Kit CTA 통합 카드 리팩토링            | 별도 KitCtaCard 제거, ProductCard(compact) 내 is_highlighted 분기로 "Get free kit" 액션 통합. 일관성 원칙: 일반 상품 = "Buy Online", 에센리 = "Get free kit". 영향: card-mapper.ts, group-parts.ts, MessageList.tsx, ProductCard.tsx, KitCtaCard.tsx 삭제, 테스트 업데이트. **별도 브랜치**. 정본: `docs/superpowers/specs/2026-04-09-onboarding-and-kit-cta-design.md` §2.2 | ⬜   |
| NEW-11  | 에센리 자체 상품 카테고리 확장        | **→ v0.2 연기**. 현재 헤어 마스크 1개만 → 스킨케어/마스크팩/립케어 카테고리별 1~2개씩 추가. 통합 카드 방식(NEW-10) 유지. 노출 빈도 자연 증가 목적. 정본: `docs/superpowers/specs/2026-04-09-onboarding-and-kit-cta-design.md` §2.3 | ➡️  |
| NEW-12  | 다브랜드 샘플 키트 모델 검토        | **→ v0.3 백로그**. 에센리 단독 → 다브랜드 샘플 큐레이션 비즈니스 모델 확장 검토. 협업 협상, 법적 검토(화장품 샘플 배포 규제), 물류 인프라 필요 | ➡️  |
| NEW-13  | Kit 신청 후 자동 이메일 발송        | **→ v0.2 연기**. 현재 MVP는 DB 저장 + 운영팀 수동. SendGrid 등 이메일 자동화 인프라 도입 후 "Thank you, we'll contact you within 48h" 자동 회신 | ➡️  |
| NEW-14  | ~~채팅 품질 개선 v1.2 (SSOT)~~   | temperature를 TokenConfig에서 env.LLM_TEMPERATURE로 이전(SSOT). TokenConfig.temperature 필드 제거. llm-client.ts env.LLM_TEMPERATURE 치환. 정본: `docs/superpowers/specs/2026-04-09-chat-quality-improvements.md` | ✅   |
| NEW-15  | ~~LLM 파라미터 튜닝 (v1.1)~~     | temperature 0.4→0.6 ("warm, knowledgeable" 페르소나), maxOutputTokens 1024→2048 (잘림 방지), maxToolSteps 3→5 (비교 요청 지원), LLM_TIMEOUT_MS 30000→45000 (tool 3-5회 포함 여유) | ✅   |
| NEW-16  | ~~Q-7 위반 수정 (search-handler)~~ | silent catch 3곳에 에러 로깅 추가: `[EMBED_FALLBACK]` warn, `[STORE_JOIN_FAILED]` error, `[CLINIC_JOIN_FAILED]` error. 폴백 동작 불변, 로깅만 추가. 테스트 3건 추가 | ✅   |
| NEW-17  | ~~FALLBACK_DELAY_MS 100ms 적용~~ | llm-resilience.md §2.2 선반영된 설계를 코드에 구현. 폴백 프로바이더 전환 전 100ms 대기로 연쇄 실패 방지. 테스트 2건 추가 | ✅   |
| NEW-18  | ~~Few-shot 예시 통합 (§11)~~     | prompt-examples.ts 신규: 5개 few-shot 예시 (프로필 있는 추천, VP-3 추천, 인젝션 무시, 의료 긴급, 병렬 extract+search). Anthropic/LangChain 권장 3-4개 권장, 5개 채택 | ✅   |
| NEW-19  | ~~시스템 프롬프트 축약 (578→510줄)~~ | §5 Guardrails 중복 응답 템플릿 6개 제거 (Hard constraints + Adversarial 규칙 전부 유지), §6 Tools 1줄 기능 설명 제거 (extract_user_profile Behavior "Call silently" 블록 유지 — defense-in-depth), §7 CARD_FORMAT 축약 (클라이언트 책임), AVAILABLE_TOPICS import 제거 (G-4) | ✅   |
| NEW-20  | 의도 분류 (classifyIntent)        | **→ v0.2 후속**. 원래 v1.1에 포함되었으나 plan-eng-review 결정으로 제외. few-shot이 tool 호출 패턴을 가르치므로 v0.1 범위 밖. eval harness 결과 후 별도 PR에서 재검토. 정본: system-prompt-spec.md §12 | ➡️  |


---

# Phase 3: 테스트 + 배포

> 목표: QA 완료 + 프로덕션 배포
> 예상: 2~3주 (1인)
> 전제: Phase 2 완료

## E2E 테스트


| ID    | 작업               | 시나리오                                                                                                                           | 상태  |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | --- |
| P3-1  | ~~경로A 플로우~~      | **→ v0.2 연기**. 온보딩 4단계가 v0.2 연기됨 (P2-33/34). Landing → Chat 경로B만 MVP 대상                                                        | ➡️  |
| P3-2  | 경로B 플로우          | Landing → "Start chatting" → Chat → 점진적 개인화. QA PASS (2026-04-09): 채팅 송수신, 제품 카드, 프로필 저장 정상 동작                                    | ✅   |
| P3-3  | Kit CTA 플로우      | Chat → Kit 카드 → 이메일 입력 → 제출. 통합 카드 방식으로 재설계 완료 (NEW-10). 통합 카드 구현 후 E2E 재검증 필요. 정본: `docs/superpowers/specs/2026-04-09-onboarding-and-kit-cta-design.md` | ⬜   |
| P3-5  | 모바일 반응형          | QA PASS (2026-04-09): 랜딩/채팅/Terms 모바일(375x812) 레이아웃 정상. 카드 가로 스크롤, 다크모드, 언어 선택 동작 확인                                            | ✅   |
| P3-6  | 에러 시나리오          | QA PASS (2026-04-09): 빈 입력 차단, 긴 입력 처리, XSS 방어, 404 페이지, API 인증 에러 정상 응답                                                        | ✅   |
| P3-6a | SEO 구현           | P1-11 설계 기반 구현: sitemap.xml(1 URL), robots.txt(admin/api 차단), OG 이미지(정적 1장), JSON-LD(WebApplication), favicon                     | ✅   |
| P3-6b | ~~접근성(a11y) 검증~~ | **→ v0.2 연기**. axe-core 자동 스캔 + 수동 체크리스트. MVP는 기본 키보드/스크린리더 수동 확인만                                                             | ➡️  |


## AI 품질 테스트


| ID    |                     | 상세                                                                            | 상태  |
| ----- | ------------------- | ----------------------------------------------------------------------------- | --- |
| P3-7  | ~~프롬프트 평가 시나리오 실행~~ | **→ v0.2 연기**. 20+건 시나리오 자동 실행. MVP는 소프트 런칭 수동 검증 (PoC P0-12~17에서 기본 검증 완료)   | ➡️  |
| P3-8  | ~~카드 데이터 정확성~~      | **→ v0.2 연기**. tool_use → 카드 스키마 검증. MVP는 수동 E2E로 대체                          | ➡️  |
| P3-9  | ~~가드레일 테스트~~        | **→ v0.2 연기**. 의료 조언, 이탈, 적대적 입력 거부. MVP는 소프트 런칭 수동 검증 (PoC P0-16에서 기본 검증 완료) | ➡️  |
| P3-10 | ~~다국어 품질 테스트~~      | **→ v0.2 연기**. 6개 언어 동일 시나리오. MVP는 소프트 런칭 수동 검증 (PoC P0-14: 4.6/5.0)          | ➡️  |
| P3-11 | ~~개인화 정확성~~         | **→ v0.2 연기**. 동일 질문 + 다른 프로필 → 추천 차이. MVP는 소프트 런칭 수동 검증                      | ➡️  |


## 성능 테스트


| ID    | 작업              | 기준                                                                                    | 상태  |
| ----- | --------------- | ------------------------------------------------------------------------------------- | --- |
| P3-12 | ~~페이지 로드 시간~~   | **→ v0.2 연기**. Landing ≤ 2s, Chat ≤ 3s. MVP는 Vercel Analytics 기본 모니터링                 | ➡️  |
| P3-13 | ~~API 응답 시간~~   | **→ v0.2 연기**. profile/journey ≤ 200ms, search ≤ 100ms. MVP는 Vercel Analytics 기본 모니터링 | ➡️  |
| P3-14 | ~~LLM 첫 토큰 시간~~ | **→ v0.2 연기**. ≤ 1s (스트리밍 시작). MVP는 소프트 런칭 체감 확인                                      | ➡️  |
| P3-15 | ~~동시 사용자~~      | **→ v0.2 연기**. 10 동시 세션 정상. 소프트 런칭 규모에서 부하 문제 가능성 낮음                                  | ➡️  |


## 보안 검토


| ID    | 작업                          | 상세                                                                                        | 상태  |
| ----- | --------------------------- | ----------------------------------------------------------------------------------------- | --- |
| P3-16 | ~~OWASP Top 10 점검~~         | **→ v0.2 연기**. Injection, Auth, XSS, Access Control 등. MVP는 P3-22(npm audit) + 기본 점검으로 대체 | ➡️  |
| P3-17 | ~~API 키 노출 확인~~             | **→ v0.2 연기**. Git 이력, 환경변수 클라이언트 노출. MVP는 배포 전 수동 확인                                     | ➡️  |
| P3-19 | ~~SQL injection / XSS 테스트~~ | **→ v0.2 연기**. 주요 입력 필드 대상. Supabase RLS + zod 검증으로 기본 방어 확보                              | ➡️  |
| P3-21 | ~~Rate limit 동작 확인~~        | **→ v0.2 연기**. Chat API. MVP는 배포 후 수동 확인                                                  | ➡️  |
| P3-22 | 의존성 취약점 스캔                  | **완료**. `npm audit` 0 vulnerabilities. hono 4.7.11→4.12.12, next 16.1.6→16.2.2, eslint-config-next 동기화. dev 의존성(vite, flatted, brace-expansion, picomatch) 자동 수정. 빌드+테스트 검증 완료 | ✅   |


## 인프라 / DevOps


| ID     | 작업                     | 상세                                                                                         | 상태  |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------ | --- |
| P3-23  | CI/CD — GitHub Actions | PR: lint → type-check → test (빌드 제외 — Vercel CD에서 수행)                                      | ✅   |
| P3-24  | CI/CD — Vercel 자동 배포   | main → prod, PR → preview. tsx devDep 추가 + 빌드/린트/타입 에러 6건 수정                                | ✅   |
| P3-25  | 환경 분리                  | MVP: 전 환경 Google Gemini 사용. Production Anthropic 전환은 v0.2. 정본: INFRA-PIPELINE.md            | ✅   |
| P3-26  | ~~Supabase 프로젝트 분리~~   | **→ v0.2 연기**. 2 프로젝트: dev+preview 공유 / prod. 소프트 런칭은 단일 프로젝트로 충분                         | ➡️  |
| P3-27  | 에러 트래킹 설정              | Vercel Logs 정상 수집 확인. buttonVariants 서버 호출 버그 수정 (P3-33). Sentry는 v0.2                      | ✅   |
| P3-28  | 성능 모니터링                | @vercel/speed-insights 2.0.0 + root layout \<SpeedInsights /\> 추가. Core Web Vitals 수집 시작   | ✅   |
| P3-29  | ~~LLM 비용 모니터링~~        | **→ P3-29a에 통합**. Anthropic Console 기본 제공 + P3-29a 한도 설정으로 충분                              | ➡️  |
| P3-29a | LLM 비용 한도 + 알림         | Anthropic Console $100/월 한도 + 알림. Google 무료 티어 기본 한도. onFinish 토큰 사용량 로그 추가. v0.2: DB 기반 집계 (V2-24) | ✅   |
| P3-30  | ~~로깅 전략~~              | **→ v0.2 연기**. 구조화 로깅 (JSON), 로그 레벨. MVP는 console.error 기본 로깅 충분                           | ➡️  |
| P3-31  | ~~DB 백업 확인~~             | **→ v0.2 연기**. Supabase Pro 업그레이드($25/월)는 정식 런칭 전 수행. MVP 소프트 런칭은 소수 테스트 — 데이터 재시드 가능      | ➡️  |
| P3-32  | ~~도메인 + SSL~~          | **→ v0.2 연기**. MVP는 `assenly-proj.vercel.app` (Vercel 자동 SSL) 사용. 커스텀 도메인 구매·연결은 v0.2           | ➡️  |


## 배포 + 런칭


| ID     | 작업               | 상세                                                                                                  | 상태  |
| ------ | ---------------- | --------------------------------------------------------------------------------------------------- | --- |
| P3-33  | 버그 수정 + 최적화      | P3-1~22(관리자 제외)에서 발견된 이슈 해결                                                                         | ⬜   |
| P3-33a | 법률 전문가 검토        | 소프트 런칭 후 정식 런칭 전 진행. 이용약관(/terms), 개인정보처리방침(/privacy), 면책 조항 법률 전문가 검토. GDPR/국제 규정 검토. 소프트 런칭 차단 아님 | ⬜   |
| P3-34  | 프로덕션 배포          | 최종 배포                                                                                               | ⬜   |
| P3-35  | 소프트 런칭           | 제한 사용자 테스트 (대상/규모 별도 결정)                                                                            | ⬜   |
| P3-36  | ~~사용자 피드백 수집 채널 구축~~ | **→ v0.2 연기**. 인앱 별점+리뷰 UI로 v0.2에서 구현. 소프트 런칭은 소수 사용자 직접 소통으로 피드백 수집                                    | ➡️  |


## Gate 2 통과 기준 (MVP 최소 출시 — 소프트 런칭)

**소프트 런칭 전 필수 (Gate 2 통과 조건)**

- 인증-채팅 연결 정상 동작 (P2-79 — 데이터 준비와 독립, 선행 수행)
- Chat API 통합 검증 (P2-73 — P2-79 완료 후)
- E2E 핵심 플로우 수동 검증 통과 (P3-2 경로B, P3-3 Kit CTA, P3-5 모바일, P3-6 에러)
- SEO 기본 구현 (P3-6a)
- CI/CD + 환경 분리 동작 (P3-23~25)
- 에러 트래킹 + 성능 모니터링 기본 설정 (P3-27, P3-28 — Vercel 기본)
- LLM 비용 한도 설정 (P3-29a)
- 의존성 취약점 0 critical (P3-22)
- ~~도메인 + SSL 설정 (P3-32 — v0.2 연기, MVP는 vercel.app 도메인 사용)~~
- ~~DB 백업 확인 (P3-31 — v0.2 연기, 정식 런칭 전 Pro 업그레이드)~~
- ~~피드백 수집 채널 준비 (P3-36 — v0.2 연기, 소프트 런칭은 직접 소통으로 수집)~~

**Gate 2 통과 후 순차 실행**

- P3-33: 버그 수정 (E2E에서 발견된 이슈)
- P3-34: 프로덕션 배포
- P3-35: 소프트 런칭
- P3-33a: 법률 전문가 검토 (소프트 런칭 후 정식 런칭 전)

> v0.2에서 추가: 자동화 테스트(통합/E2E/AI 품질/성능), OWASP 보안 점검, 접근성 검증, 구조화 로깅, Supabase 프로젝트 분리, Production LLM Anthropic 전환 (AI_PROVIDER=anthropic + ANTHROPIC_API_KEY 등록 + NEXT_PUBLIC_APP_URL 환경별 분리), 커스텀 도메인 연결 (P3-32), 인앱 피드백 UI (P3-36), Supabase Pro 업그레이드 (P3-31)

---

# 관리자 앱 (Gate 2 이후)

> 목표: 관리자 CRUD + 인증 + UI 구현
> 전제: Gate 2 통과 (사용자 앱 배포 완료)
> 설계 완료: Phase 0 (P0-4~~P0-11) + Phase 1 (P1-8, P1-10, P1-13~~P1-17, P1-23~~P1-24)
> 펜딩 사유: 사용자 앱과 아키텍처 의존 없음 (P-3 Last Leaf). MVP 출시 우선.
> ID 이력: Phase 2 관리자 앱 섹션에서 이동 (2026-04-02). 구 ID: P2-45~~P2-55 → P2-80~P2-90 → PA-*.

## 구현


| ID    | 작업                 | 상세                                                                                                                                            | 상태  |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| PA-1  | 관리자 인증 서비스 + API   | Google Cloud Console OAuth 2.0 클라이언트 발급(GOOGLE_OAUTH_CLIENT_ID/SECRET) + ADMIN_JWT_SECRET 생성 + 환경변수 등록. 로그인, 세션, 권한 확인 (api-spec.md §6). (구 P2-80) | ⬜   |
| PA-2  | 제네릭 CRUD 서비스       | `features/admin/service.ts` + withAuditLog 미들웨어 + 6엔티티 zod 스키마 + CRUD 후 비동기 임베딩 재생성 연동 (api-spec.md §5.1, embedding-strategy §3.4). (구 P2-81) | ⬜   |
| PA-3  | 복합 엔티티 라우트         | Product/Store/Treatment/Clinic CRUD 라우트 + 하이라이트 API(§5.3) + 관계 API(§5.2). P2-16/16a/17/17a 리포지토리 의존. (구 P2-81a)                               | ⬜   |
| PA-4  | 단순 엔티티 라우트         | Brand/Ingredient CRUD 라우트 + 리포지토리 생성 포함 (findAll/findById/create/update/deactivate, query-utils.ts 재사용). (구 P2-81b)                           | ⬜   |
| PA-5  | 이미지 업로드 서비스 + API  | Product/Store/Clinic/Treatment 4엔티티. Supabase Storage + magic bytes 검증 + 순서 관리 (api-spec.md §5.4). (구 P2-82)                                  | ⬜   |
| PA-6  | 감사 로그 조회 API       | `GET /api/admin/audit-logs` + audit-service.ts. super_admin 전용, 날짜/액터/액션 필터 (api-spec.md §6.6). 기록은 PA-2 withAuditLog가 담당. (구 P2-83)          | ⬜   |
| PA-7  | 관리자 레이아웃 + 로그인 페이지 | admin 라우트 레이아웃, 인증 UI. (구 P2-84)                                                                                                              | ⬜   |
| PA-8  | 관리자 대시보드 (간단)      | 엔티티별 데이터 건수, 최근 변경. (구 P2-85)                                                                                                                 | ⬜   |
| PA-9  | 관리자 공통 컴포넌트 — 목록   | 테이블, 검색, 필터, 페이지네이션. (구 P2-86)                                                                                                                | ⬜   |
| PA-10 | 관리자 공통 컴포넌트 — 폼    | 폼 필드, JSONB 다국어 입력, 이미지 업로드. (구 P2-87)                                                                                                        | ⬜   |
| PA-11 | 복합 엔티티 CRUD 페이지    | Product, Store, Clinic, Treatment — 이미지+관계+하이라이트 포함 (PA-3 대응). (구 P2-88a)                                                                     | ⬜   |
| PA-12 | 단순 엔티티 CRUD 페이지    | Brand, Ingredient — 기본 CRUD (PA-4 대응). (구 P2-88b)                                                                                             | ⬜   |
| PA-13 | 관계 관리 UI           | Product↔Store, Product↔Ingredient, Clinic↔Treatment. (구 P2-89)                                                                                | ⬜   |
| PA-14 | 하이라이트 관리 UI        | is_highlighted 토글 + badge 텍스트. (구 P2-90)                                                                                                      | ⬜   |


## 통합 테스트


| ID    | 작업              | 상세                                           | 상태  |
| ----- | --------------- | -------------------------------------------- | --- |
| PA-15 | 관리자 인증 통합 테스트   | admin 세션/권한 검증. (구 P2-75 admin 부분, P2-74 포함) | ⬜   |
| PA-16 | 관리자 CRUD 통합 테스트 | admin API + DB + 감사 로그. (구 P2-74)            | ⬜   |


## E2E + 보안 테스트


| ID    | 작업                 | 상세                                                                                                                                                     | 상태  |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| PA-17 | 관리자 CRUD E2E 플로우   | 로그인 → 생성 → 수정 → 관계 설정 → 삭제. (구 P3-4)                                                                                                                   | ⬜   |
| PA-18 | Admin 미인증 접근 테스트   | /admin/* 미인증 시 차단 확인. (구 P3-18)                                                                                                                        | ⬜   |
| PA-19 | 파일 업로드 검증          | 악성 파일, MIME 타입, 크기 제한. (구 P3-20)                                                                                                                       | ⬜   |
| PA-20 | 시스템 설정 관리 API + UI | 삭제 요청 이메일(`privacy@essenly.com`) 등 법률 페이지에 표시되는 운영 상수를 관리자 화면에서 수정 가능하게. site_settings 테이블 또는 KV 방식. MVP에서는 shared/constants에 하드코딩, 관리자 앱에서 DB 기반으로 전환 | ⬜   |


---

# v0.2 백로그

> MVP 후 구현할 기능. Phase 4에서 상세 계획 작성.


| ID    | 기능                           | 설명                                                                                                                                                                               | 근거                       |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| V2-1  | 관리자 API 설정 관리                | Rate limit, 시스템 설정을 관리자 UI에서 조정. DB settings 테이블 + 메모리 캐시(TTL 5분) + max/min 안전장치                                                                                                 | P1-22 결정                 |
| V2-2  | 관리자 데이터 동기화 UI               | 카카오 API 동기화 주기 설정 + 수동 트리거 + 결과 로그                                                                                                                                               | P0-32 결정                 |
| V2-3  | Rate limit Redis 전환          | 메모리 Map → Upstash Redis. 다중 인스턴스 지원                                                                                                                                              | P1-22                    |
| V2-4  | 계정 인증 시스템                    | anonymous → 계정 (이메일/소셜). Supabase Auth linking                                                                                                                                   | PRD §4-C                 |
| V2-5  | DOM-3 살롱 + DOM-4 맛집          | salons, restaurants 테이블 + CRUD + 추천                                                                                                                                              | PRD §2.2                 |
| V2-6  | 6개 언어 UI                     | 영어 외 5개 언어 UI 번역                                                                                                                                                                 | PRD §5.1                 |
| V2-7  | 위치 기반 추천                     | RT-1 (현재 위치) 수집 + 거리 기반 정렬                                                                                                                                                       | PRD §2.2                 |
| V2-8  | 프로필 화면 데이터 삭제 버튼             | "Delete my data" UI                                                                                                                                                              | PRD §4-C A-14            |
| V2-9  | 임베딩 태그 필터링                   | 신호 태그(hydrating 등) vs 노이즈 태그(bestseller 등) 분류 규칙 정의 + EMBEDDING_CONFIG.TAG_FILTER 활성화                                                                                            | P1-38                    |
| V2-10 | 다국어 임베딩 텍스트 확장               | ja/zh/es/fr 사용자 비율 >20% 시 해당 언어 임베딩 텍스트 추가. EMBEDDING_CONFIG.TEXT_LANGUAGES 확장                                                                                                   | P1-38                    |
| V2-11 | 교차 엔티티 임베딩 재생성               | Brand 이름 변경 시 관련 Product 임베딩 CASCADE 재생성                                                                                                                                         | P1-39                    |
| V2-12 | 프롬프트 DB 전환 + 관리자 편집 UI       | 코드 상수(prompts.ts) → DB prompt_configs 테이블 마이그레이션. 섹션별 행 관리 + 캐싱(TTL) + 관리자 UI 편집(super_admin) + 버전 히스토리                                                                          | system-prompt-spec.md §1 |
| V2-13 | 히스토리 요약 전략                   | 트리거: 계정 인증 + 장기 대화(재방문) 도입 시. 20턴 초과 요약 설계. token-management.md §3.3                                                                                                             | P1-36                    |
| V2-14 | RAG 결과 압축                    | 트리거: 데이터 규모 증가 (500→5,000건+) 시. 검색 결과 경량 포맷 설계. tool-spec.md §1                                                                                                                  | P1-37                    |
| V2-15 | 토큰 카운터 구현                    | 트리거: 비용 모니터링에서 토큰 급증 감지 시                                                                                                                                                        | P1-35                    |
| V2-16 | 모델별 토큰 예산 분리                 | 트리거: 역방향 폴백(Gemini→Claude) 도입 시                                                                                                                                                  | P1-35                    |
| V2-17 | 토큰 기반 히스토리 로드 전환             | 트리거: 턴당 토큰 변동이 커서 턴 수 기반 부정확 시                                                                                                                                                   | P1-35                    |
| V2-18 | 채팅 UI 가상 스크롤 최적화             | 트리거: 계정 인증 + 재방문 + 장기 대화 도입 시. MessageList 가상 스크롤, DOM 수 제한. MVP는 Rate limit(100회/일) + 세션 타임아웃(30분)으로 충분                                                                         | user-screens.md §6       |
| V2-19 | 복합 쓰기 rpc 트랜잭션 도입            | 트리거: UPSERT + 보상 전략으로 불충분한 복합 쓰기 시나리오 등장 시. MVP는 모든 시나리오(auth, onboarding, chat, kit)가 UPSERT 멱등성 + 보상 삭제 + 재시도로 해결 가능하여 rpc 불필요. 복잡한 multi-entity 트랜잭션 추가 시 Postgres 함수(rpc) 설계 | Q-11                     |
| V2-20 | domain.ts 열거값 타입 강화          | `status: string` → `EntityStatus`, `english_support: string` → `EnglishSupportLevel` 등 유니온 타입으로 강화. 기존 repositories/route handlers 전반 영향 → 다른 세션 작업 완료 후 일괄 진행. P-7(단일 변경점) 보장   | Q-14, P-7                |
| V2-21 | 쿠팡 파트너스 API 활성화 (P2-V1)      | 판매 실적 15만원 달성 후 API 활성화. coupang-partners.ts 프로바이더 구현 (P2-56e)                                                                                                                   | U-12                     |
| V2-22 | 올리브영/CJ 어필리에이트 약관 확인 (P2-V6) | Involve Asia 승인 후 제품 정보 사용 범위 확인 (U-10, U-11). V2-21 선행                                                                                                                          | V2-21                    |
| V2-23 | 행동 로그 클라이언트 연동               | P2-26 서버 API 완료(POST /api/events). 클라이언트 연동 미구현: card_exposure(Intersection Observer), card_click(onClick), external_link_click(링크 인터셉트). 추적 유틸리티 + 카드 컴포넌트 연결. KPI 측정 활성화       | P2-26, ANALYTICS.md      |
| V2-24 | 옵저버빌리티 통합                    | 분산 트레이싱(요청 흐름 추적), 구조화 로깅 통합, 대시보드(에러율/응답시간/LLM 비용). P3-27~30 개별 설정을 통합 옵저버빌리티 플랫폼으로 연결 (Sentry/Datadog/Vercel Observability)                                                    | P3-27~30                 |


### MVP 간소화로 v0.2 연기된 항목 (Phase 2/3에서 이동)

> 원본은 Phase 2/3 원래 위치에 ➡️ 또는 🔶 상태로 유지. 아래는 v0.2 작업 시 참조용 인덱스.

**기존 v0.2 보류 (🔶, Phase 2)**


| 원본 ID | 작업                             | 비고                            |
| ----- | ------------------------------ | ----------------------------- |
| P2-18 | Knowledge 리포지토리                | KB 테이블 미설계. MVP는 시스템 프롬프트 인라인 |
| P2-36 | 5영역 탭 바                        | MVP 보류. v0.2에서 필요성 재검토        |
| P2-41 | Profile 페이지                    | 이메일 로그인 후 활성화 (V2-4 선행)       |
| P2-42 | 프로필 Context                    | 이메일 로그인 후 활성화 (V2-4 선행)       |
| P2-49 | "Show recommendations" 버튼      | 런칭 후 K1/K2 데이터로 재검토           |
| P2-XX | SuggestedActions (서버 기반 제안 버튼) | P2-49 재검토 시 함께 평가             |


**데이터 검증 (Phase 2)**


| 원본 ID  | 작업                | 비고                                 |
| ------ | ----------------- | ---------------------------------- |
| P2-64e | S5 교차 검증 + 품질 게이트 | 식약처 보고품목 교차 검증. MVP는 수동 spot-check |
| P2-V5  | 시술 가격 범위 현실성 검증   | 5개 클리닉 실제 상담 가격 대조                 |


**자동화 테스트 (Phase 2)**


| 원본 ID | 작업                  | 비고                                       |
| ----- | ------------------- | ---------------------------------------- |
| P2-70 | chat tool 단위 테스트 보강 | extraction-handler 타입 통일 + vector 경로 테스트 |
| P2-75 | 익명 인증 통합 테스트        | P2-71에서 범위 통합. anonymous 세션 + 권한 검증      |
| P2-76 | 프롬프트 평가 자동화 구현      | prompt-evaluation.md 20건 시나리오 자동화        |
| P2-77 | 멀티턴 adversarial 검증  | 멀티턴 탈옥 패턴 테스트 + 가드레일 강화                  |


**E2E + 접근성 (Phase 3)**


| 원본 ID | 작업           | 비고                                 |
| ----- | ------------ | ---------------------------------- |
| P3-1  | 경로A E2E 플로우  | 온보딩 4단계 활성화 후 (V2-4 계정 인증 선행)      |
| P3-6b | 접근성(a11y) 검증 | axe-core 자동 스캔 + WCAG 2.1 AA 체크리스트 |


**AI 품질 테스트 (Phase 3)**


| 원본 ID | 작업              | 비고                     |
| ----- | --------------- | ---------------------- |
| P3-7  | 프롬프트 평가 시나리오 실행 | 20+건 자동 실행 (P2-76 선행)  |
| P3-8  | 카드 데이터 정확성      | tool_use → 카드 스키마 검증   |
| P3-9  | 가드레일 테스트        | 의료 조언, 이탈, 적대적 입력 거부   |
| P3-10 | 다국어 품질 테스트      | 6개 언어 동일 시나리오          |
| P3-11 | 개인화 정확성         | 동일 질문 + 다른 프로필 → 추천 차이 |


**성능 테스트 (Phase 3)**


| 원본 ID | 작업          | 비고                                      |
| ----- | ----------- | --------------------------------------- |
| P3-12 | 페이지 로드 시간   | Landing ≤ 2s, Chat ≤ 3s                 |
| P3-13 | API 응답 시간   | profile/journey ≤ 200ms, search ≤ 100ms |
| P3-14 | LLM 첫 토큰 시간 | ≤ 1s (스트리밍 시작)                          |
| P3-15 | 동시 사용자      | 10 동시 세션 정상                             |


**보안 검토 (Phase 3)**


| 원본 ID | 작업                      | 비고                                   |
| ----- | ----------------------- | ------------------------------------ |
| P3-16 | OWASP Top 10 점검         | Injection, Auth, XSS, Access Control |
| P3-17 | API 키 노출 확인             | Git 이력, 환경변수 클라이언트 노출                |
| P3-19 | SQL injection / XSS 테스트 | 주요 입력 필드 대상                          |
| P3-21 | Rate limit 동작 확인        | Chat API                             |


**인프라 (Phase 3)**


| 원본 ID | 작업               | 비고                                 |
| ----- | ---------------- | ---------------------------------- |
| P3-26 | Supabase 프로젝트 분리 | 2 프로젝트: dev+preview 공유 / prod. 정본: INFRA-PIPELINE.md §6.1 |
| P3-29 | LLM 비용 모니터링      | P3-29a에 통합. V2-24 옵저버빌리티에서 일괄      |
| P3-30 | 구조화 로깅 전략        | JSON 로깅 + 로그 레벨. V2-24 옵저버빌리티에서 일괄 |


### v0.3 백로그


| ID   | 태스크              | 설명                                                                      | 참조             |
| ---- | ---------------- | ----------------------------------------------------------------------- | -------------- |
| V3-1 | DOM-5 문화 체험      | experiences 테이블 마이그레이션 + ExperienceCard + 추천 로직. schema.dbml에 테이블 정의 완료 | PRD §4-B DOM-5 |
| V3-2 | Stage 2 (코스+팔로업) | F3 뷰티 여정 코스 생성 + F7 자동 팔로업                                              | PRD §2.2       |
| V3-3 | 행동 로그 분석         | behavior_logs 기반 BH-4 자동 학습. 클릭·예약·재방문 패턴 → learned_preferences 갱신      | PRD §5.3 X11   |


- 소프트 런칭 피드백 반영

