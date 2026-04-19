## 작업: Explore + Landing + Chat UI/UX 개선 — 분석 → 설계 → 구현 → 검증

### 컨텍스트
- 브랜치: main (PR #30 머지 완료)
- 설계 정본: `docs/03-design/PRD.md`(WHAT) · `docs/03-design/TDD.md`(HOW) · `docs/03-design/schema.dbml`(DB 정본)
- Explore PRD: `docs/superpowers/specs/2026-04-19-explore-page-prd.md`
- 디자인 프리뷰: `public/design-preview.html` (뱃지 CSS 패턴: `.tag-muted`, `.tag-primary`, `.tag-sage`, `.tag-teal` 등)
- 프로젝트 규칙: `CLAUDE.md` (반드시 전체 읽고 준수)
- 메모리: `memory/project_explore_qa_issues.md` — 이전 QA 7건 수정 완료 참고

### 대상 파일 (반드시 현재 코드를 Read로 확인 후 작업)

**카드 컴포넌트:**
- `src/client/features/cards/ProductCard.tsx`
- `src/client/features/cards/StoreCard.tsx`
- `src/client/features/cards/ClinicCard.tsx`
- `src/client/features/cards/TreatmentCard.tsx`
- `src/client/features/cards/HighlightBadge.tsx`

**Explore:**
- `src/client/features/explore/ExploreGrid.tsx` — 가상 스크롤, 행간 여백
- `src/client/features/explore/ExploreClient.tsx` — Load More / 무한 스크롤
- `src/client/features/explore/use-explore.ts` — useSWRInfinite

**Landing:**
- `src/client/features/landing/HeroSection.tsx` — CTA 버튼 구조
- `src/client/features/landing/LandingClient.tsx` — 재방문 판정 로직
- `src/client/features/landing/ReturnVisitBanner.tsx` — 재방문 모달

**Chat/Profile:**
- `src/client/features/chat/ChatInterface.tsx` — 프로필 아이콘 조건부 표시 (L193: `initialOnboardingCompleted ? <ProfileLinkButton> : null`)
- `src/client/features/chat/ProfileLinkButton.tsx` — UserCircle 아이콘
- `src/client/features/chat/ChatContent.tsx` — 대화 복원 로직

**디자인 시스템:**
- `src/app/globals.css` — 디자인 토큰
- `src/client/ui/primitives/badge.tsx` — 뱃지 프리미티브
- `public/design-preview.html` — 뱃지 디자인 패턴 참조

---

### 이슈 7건 (각각 분석 → 검토 → 해결방안 도출 → 구현)

#### 1. 카드 행간 여백 추가
- 현재: `ExploreGrid.tsx`에서 `gap-4`가 CSS Grid 열 간에만 적용됨. 가상 스크롤 행은 `position: absolute` + `translateY`로 배치되므로 행 간 gap이 CSS로 관리되지 않음
- 문제: 카드 위아래가 밀착되어 답답한 레이아웃
- 분석 필요: `ESTIMATE_ROW_HEIGHT`(280px)와 실제 카드 높이의 관계. 행 간 여백을 추가하려면 (A) 각 행 div에 padding-bottom 추가 + ESTIMATE_ROW_HEIGHT 조정, (B) 또는 grid에 row-gap을 별도 반영하는 방법 검토. `measureElement`가 동적 높이를 측정하므로 padding 접근이 안전할 수 있음

#### 2. 카드 뱃지 디자인 재설계
- 현재 문제점:
  - **ProductCard**: "English Label" 뱃지가 표시됨 — 사용자에게 무의미한 정보. 제거 또는 의미 있는 뱃지로 교체 필요
  - **ProductCard**: "Product Details" 텍스트 링크 — 카드 전체 클릭(::after overlay)이 이미 구현되어 있으므로 불필요. 제거 검토
  - 각 카드에 표시하는 뱃지가 디자인 시스템(`design-preview.html`의 `.tag-muted`, `.tag-primary`, `.tag-sage`, `.tag-teal`)과 불일치
- 분석 필요:
  - `design-preview.html`에서 카드별 뱃지 디자인 패턴 확인하고, 실제 카드에 적용되어야 할 뱃지 목록 정리
  - 각 카드별 사용자에게 가치 있는 뱃지만 남기고, 내부 데이터를 그대로 노출하는 뱃지 제거
  - **ProductCard 필요 뱃지**: category, brand, 가격 tier (이미 있음), highlight (이미 있음)
  - **StoreCard 필요 뱃지**: store_type, english_support, rating, tourist_services — 현재 모두 있지만 디자인 통일 필요
  - **ClinicCard 필요 뱃지**: clinic_type, english_support, rating, verified, foreigner_friendly 항목 — 뱃지 스타일 통일 필요
  - **TreatmentCard 필요 뱃지**: category, duration, downtime, 가격 tier (이미 있음) — 뱃지 스타일 통일 필요
  - `ui/primitives/badge.tsx`의 CVA variants 활용 여부 검토

#### 3. 무한 스크롤 전환 (Load More → Intersection Observer 자동 로드)
- 현재: Load More 버튼 수동 클릭 (ExploreClient.tsx → footer prop → ExploreGrid 스크롤 컨테이너 내부)
- 요청: 스크롤 하단 도달 시 자동 로드 (Intersection Observer)
- PRD FR-8 원문: "하단에 'Load More' 버튼" 이지만, 사용자가 자동 로드로 전환 요청
- 분석 필요:
  - `use-explore.ts`의 `loadMore` 호출을 Intersection Observer 트리거로 전환
  - ExploreGrid의 가상 스크롤 컨테이너(`overflow-y-auto`) 하단에 sentinel div 배치
  - 기존 footer prop을 sentinel + loading indicator로 교체
  - 중복 호출 방지: `isValidating` 상태에서 재호출 차단
  - 모든 데이터 로드 완료 시(`!hasMore`) sentinel 미표시

#### 4. 매장/클리닉 기본 이미지 + 뱃지 디자인
- 현재: 이미지 없으면 Lucide 아이콘(`ShoppingBag`, `Stethoscope`)만 표시 (bg-surface-warm 위)
- 요청: 매장 느낌/클리닉 느낌의 기본 플레이스홀더 이미지
- 분석 필요:
  - SVG 기반 일러스트 vs 그라데이션+아이콘 조합 vs 실제 stock 이미지 — 어떤 접근이 디자인 시스템에 맞는지 검토
  - `public/` 디렉토리에 placeholder 이미지 추가 vs CSS 전용 시각 효과
  - 뱃지 디자인은 #2와 연계하여 통합 적용

#### 5. 프로필 아이콘 생명주기 검토
- 현재 동작:
  - 프로필 아이콘(`ProfileLinkButton` = `UserCircle`)은 **Chat 페이지에서만** 표시됨 (`ChatInterface.tsx:193`)
  - 표시 조건: `initialOnboardingCompleted === true` (= `onboarding_completed_at != null`)
  - 판정 로직: `fetchOnboardingCompleted()` → `/api/profile` 호출 → 200 OK + `onboarding_completed_at` 존재 시 true
  - fail-closed: 401/500/네트워크 에러 시 `true` 반환 (온보딩 완료로 간주 → 아이콘 표시)
  - **Explore 페이지 Header에는 프로필 아이콘 없음** — `ExploreClient.tsx`의 Header에 `rightContent={<ChatLinkButton>}`만 전달
- 문제:
  - Chat에서는 보이고 Explore에서는 안 보이는 비일관성
  - 온보딩 미완료 사용자는 프로필 아이콘이 안 보여서 프로필 페이지 진입 불가
  - fail-closed가 올바른 판정인지 검토 (네트워크 에러 시 아이콘이 보이면 404 프로필 페이지로 이동됨)
- 분석 필요: 모든 앱 페이지(Chat, Explore, Profile)에서 프로필 아이콘의 일관된 표시 규칙 정의. Header에 통합 배치 검토

#### 6. 재방문 팝업 UX 개선
- 현재: 랜딩 페이지 진입 시 프로필 존재하면 `ReturnVisitBanner` 모달이 뜸 (fixed overlay, "Continue chatting" 버튼)
- 요청: 별도 팝업 없이 대화방 진입하면 과거 대화와 함께 자연스럽게 이어가기
- 분석 필요:
  - `LandingClient.tsx`의 state 분기: `"returning"` → ReturnVisitBanner vs 바로 Chat 리다이렉트
  - Chat 페이지(`ChatInterface.tsx`)의 대화 복원 로직 — 이미 이전 대화 자동 로드가 구현되어 있는지 확인
  - 방안 A: 재방문 시 자동으로 `/chat` 리다이렉트 (팝업 제거)
  - 방안 B: 팝업은 유지하되 비모달(인라인 배너)로 전환, "Continue" + "Start fresh" 선택지 제공
  - PRD 요구사항과 대조하여 적절한 방안 선택

#### 7. 랜딩페이지 CTA 버튼 개선
- 현재:
  - 메인 CTA: `<Button size="cta">Start chatting</Button>` (w-full, primary)
  - 보조: `<button>Browse our catalog →</button>` (텍스트 링크, primary/80 색상)
  - 구조: 단일 컬럼, 세로 배치 (`max-w-[360px] mx-auto`)
- 요청: "채팅하기" + "제품 둘러보기" 2개 버튼을 동급으로 제공
- 분석 필요:
  - 모바일(< 360px)에서 버튼 2개 배치: 세로 스택 vs 가로 배치
  - "제품 둘러보기"를 `<Button variant="outline" size="cta">` 로 승격
  - 기존 텍스트 링크 제거 후 Button 프리미티브로 통일
  - 디자인 시스템의 `cta` 사이즈가 2개 나란히 배치될 때의 시각적 밸런스

---

### 작업 순서
1. **먼저 7건 전체 분석**: 각 이슈별로 관련 코드를 Read/Grep으로 확인하고 원인과 해결방안을 정리 → 사용자에게 보고
2. **사용자 승인 후 설계**: PlanMode에서 설계
3. **사용자 승인 후 구현**: 승인된 방안만 구현
4. 구현 시 CLAUDE.md V-체크리스트 준수, Q-6(함수 ≤40줄) 준수
5. 빌드/테스트/린트 검증 후 브라우저 테스트
6. 검증 완료 후 커밋/PR 생성

### 주의사항
- 추측하지 말 것. 모든 판단의 근거는 코드베이스 또는 설계 문서의 실제 내용
- 코드 수정 전 반드시 Read로 현재 상태 확인
- `design-preview.html`의 뱃지 디자인 패턴을 반드시 참조하여 일관된 디자인 적용
- 이슈 간 의존관계 파악: #2(뱃지)와 #4(매장/클리닉 뱃지)는 통합 작업, #3(무한 스크롤)은 #1(행간 여백)과 연관
- main에서 새 브랜치 생성 후 작업
- 프로필 관련(#5, #6)은 기존 인증 흐름과 fail-closed 규칙을 깊이 이해한 후 변경
