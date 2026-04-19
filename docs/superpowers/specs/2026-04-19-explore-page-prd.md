# Explore 페이지 — PRD (제품 요구사항)

- 작성일: 2026-04-19
- 정본 상태: v1.0 (초안)
- 상위 정본: `docs/03-design/PRD.md` v2.2 (MVP Chat-First 단일 경로)
- DB 정본: `docs/03-design/schema.dbml` (products, stores, clinics, treatments)
- API 정본: P2-26b 공개 읽기 API 4도메인 완료
- TODO 정본: `TODO.md` (NEW-39T 이후 신규 태스크)

---

## 1. 개요

### 1.1 문제 정의

현재 앱은 Chat-First 단일 경로만 제공한다. 사용자가 제품/매장/클리닉/시술 데이터에 접근하려면 반드시 AI와 대화해야 한다. 이로 인해:

1. **진입 장벽**: "뭘 물어봐야 할지 모르는" 사용자는 이탈한다
2. **탐색 불가**: 뚜렷한 목적 없이 "구경하고 싶은" 사용자를 수용하지 못한다
3. **SEO 부재**: 정적 상품 페이지가 없어 검색 유입이 불가능하다
4. **데이터 가치 미활용**: 597개 제품, 337개 매장, 225개 클리닉, 53개 시술 데이터가 채팅 안에서만 노출된다

### 1.2 대상 사용자

- 주요: 한국 방문 예정/방문 중인 외국인 2040 여성 여행객 (기존 PRD §1.3과 동일)
- 보조 사용자: K-뷰티에 관심 있지만 AI 대화에 거부감이 있는 사용자

### 1.3 핵심 가치

- Chat과 병행하는 **셀프 탐색 경로**: AI 대화 없이도 제품/매장/클리닉/시술을 직접 탐색
- **프로필 기반 개인화 정렬**: 쇼핑몰과 차별화 — 프로필이 있으면 적합도순으로 정렬, 추천 이유 표시
- **Chat 연결**: 탐색 중 AI 상담이 필요하면 헤더에서 즉시 Chat으로 전환

### 1.4 프로젝트 유형

기존 앱(brownfield) 확장. PRD v2.2의 Chat-First 원칙에 Explore 보조 경로를 추가.

### 1.5 수익 모델 연결 (G-13)

- 에센리 키트 판매: is_highlighted 제품이 Explore에서도 하이라이트 배지로 노출 → Kit CTA 유입 경로 확대
- 제휴 수수료: 카드의 외부 링크(Map/Buy/Book) 클릭 → Explore에서 직접 전환
- 카드 클릭률 30% KPI: 채팅 + 탐색 양쪽에서 카드 노출 → 전환 기회 확대

---

## 2. 기능 요구사항

| ID | 요구사항 | 수용 기준 | 우선순위 |
|----|---------|----------|---------|
| FR-1 | 단일 Explore 페이지 (`/[locale]/explore`) | URL 접근 가능, 도메인 탭 전환 시 `?domain=` query param 반영. 독자 레이아웃 (chat 패턴, `(pages)` 밖 배치). 모바일 풀너비 / 데스크톱 max-w-960px | Must |
| FR-2 | 4개 도메인 탭 (Products, Treatments, Stores, Clinics) | 탭 전환 시 해당 도메인의 데이터 로드, 필터 초기화. 기본 탭: Products | Must |
| FR-3 | 도메인별 필터 | Products: skin_types, category, budget. Treatments: concerns, category, budget, downtime. Stores: store_type, english_support. Clinics: clinic_type, english_support | Must |
| FR-4 | 필터 UI — 모바일 bottom sheet | 필터 버튼 탭 시 bottom sheet 열림. 선택 후 Apply 버튼으로 적용. 활성 필터는 칩으로 표시. 칩 탭 시 해당 필터 제거 | Must |
| FR-5 | 프로필 기반 개인화 정렬 | 서버 사이드 API 엔드포인트(`/api/explore`)에서 beauty scoring 수행 → 적합도순 정렬 결과 반환. scoring 함수는 `import 'server-only'` 제약으로 클라이언트 실행 불가 — 반드시 서버에서 수행. 프로필 미존재 시: rating순 정렬. 카드에 whyRecommended 표시 | Must |
| FR-6 | 프로필 미설정 배너 | 프로필이 없을 때 카드 상단에 "Set up your profile for personalized picks" 배너 표시. 배너 클릭 → `/profile/edit` 이동. dismiss 가능 (세션 내 1회) | Should |
| FR-7 | 정렬 옵션 드롭다운 | 적합도순(기본, 프로필 있을 때)/평점순(기본, 프로필 없을 때)/가격순(Products, Treatments만) | Must |
| FR-8 | Load More 무한 스크롤 | 하단에 "Load More" 버튼. 클릭 시 다음 배치(10건) 로드하여 기존 결과 아래에 추가. 잔여 건수 표시 | Must |
| FR-9 | 가상 스크롤링 (Virtualization) | 누적 로드된 카드가 많아져도 화면에 보이는 카드 + 상하 버퍼만 DOM에 렌더. 1000건 이상에서도 스크롤 성능 유지 | Must |
| FR-10 | 데이터 캐싱 | 이미 로드한 페이지 데이터를 캐시하여 탭 전환/뒤로가기 시 재요청 방지. 도메인+필터 조합별 캐시 | Must |
| FR-11 | 카드 그리드 | 모바일: 2열. 데스크톱(lg:): 3열. 기존 카드 컴포넌트(default variant) 재사용 | Must |
| FR-12 | 결과 없음 상태 | 필터 조합에 맞는 결과가 0건일 때 빈 상태 UI + "필터를 줄여보세요" 제안 + 필터 초기화 버튼 | Must |
| FR-13 | 헤더 Chat 아이콘 | Explore 페이지 헤더 우측에 MessageCircle 아이콘 버튼. 클릭 시 `/chat`으로 이동 | Must |
| FR-14 | 랜딩 Hero CTA 병렬 | 기존 "Start chatting" CTA 아래에 "or Browse products →" 보조 링크 추가. 클릭 시 `/explore` 이동 | Must |
| FR-15 | URL 상태 반영 | domain, 필터, 정렬을 URL query param에 반영. 공유/북마크 시 동일 상태 복원 | Should |
| FR-16 | 카드 로딩 스켈레톤 | 데이터 로드 중 카드 스켈레톤 표시. 기존 ProductCardSkeleton 등 재사용 | Must |
| FR-17 | i18n 지원 | en/ko 모든 UI 텍스트 다국어 지원. 기존 messages/en.json, ko.json에 키 추가 | Must |

---

## 3. 비기능 요구사항

| ID | 요구사항 | 기준 |
|----|---------|------|
| NFR-1 | 초기 로드 성능 | 첫 10건 카드 표시까지 1초 이내 (LCP). API 응답 + 렌더링 포함 |
| NFR-2 | 가상 스크롤 성능 | 500건 이상 누적 시에도 스크롤 FPS 60 유지. DOM 노드 수 100개 이하 |
| NFR-3 | 접근성 | WCAG 2.1 AA. 키보드 네비게이션(탭 전환, 필터, 카드 포커스). 터치 타겟 44x44px |
| NFR-4 | 모바일 퍼스트 | Tailwind 기본=모바일, lg:=데스크톱. 2열(모바일) / 3열(데스크톱) 반응형 |
| NFR-5 | 기존 아키텍처 준수 | P-1 ~ P-10, R-*, L-* 규칙 준수. client/ 계층에서 API 호출 (L-10). shared/ 타입 재사용 |
| NFR-6 | 디자인 시스템 일관성 | 기존 디자인 토큰(rose/warm) 사용. S-* 규칙 준수. 새 색상/폰트 추가 금지 |
| NFR-7 | SEO | 도메인별 meta title/description 동적 생성. Open Graph 태그 |
| NFR-8 | 검색 추상화 | 필터/정렬/페이지네이션 로직을 도메인 무관한 추상 인터페이스로 설계. 새 도메인(salon, dining 등) 추가 시 인터페이스 구현체 1개 추가 + 레지스트리 등록만으로 확장 가능. 도메인별 필터 항목, 정렬 옵션, API 엔드포인트를 단일 설정 객체(레지스트리)에서 관리하여 수정 시 변경점 1곳 보장 |

---

## 4. 에픽

### Epic 1: Explore 페이지 기반 구조

- 의존성: 없음
- 스토리:
  - 1.1 `/[locale]/explore` 라우트 + 레이아웃 (Header에 Chat 아이콘)
  - 1.2 도메인 탭 컴포넌트 (Products/Treatments/Stores/Clinics)
  - 1.3 카드 그리드 컴포넌트 (2열 모바일 / 3열 데스크톱)
  - 1.4 API 연동 — `/api/explore` 엔드포인트 호출 (서버 scoring + 필터 + 정렬 + 페이지네이션)
  - 1.5 카드 로딩 스켈레톤 + 에러 상태 + 결과 없음 상태
  - 1.6 i18n 키 추가 (en/ko)

### Epic 2: 필터 + 정렬

- 의존성: Epic 1
- 스토리:
  - 2.1 필터 bottom sheet 컴포넌트 (도메인별 필터 항목 분기)
  - 2.2 활성 필터 칩 표시 + 개별 제거
  - 2.3 정렬 드롭다운 (적합도순/평점순/가격순)
  - 2.4 URL query param 상태 반영 (domain, filters, sort)

### Epic 3: 프로필 기반 개인화

- 의존성: Epic 1
- 스토리:
  - 3.1 프로필 로드 + beauty scoring 적용 (서버 API 엔드포인트에서 수행 — 확정)
  - 3.2 whyRecommended 카드 표시
  - 3.3 프로필 미설정 배너 + CTA

### Epic 4: 성능 최적화 — 가상 스크롤 + 캐싱

- 의존성: Epic 1
- 스토리:
  - 4.1 Load More 버튼 + 누적 로드
  - 4.2 가상 스크롤링 라이브러리 도입 + 카드 그리드 적용
  - 4.3 도메인+필터 조합별 데이터 캐싱
  - 4.4 탭 전환 시 스크롤 위치/데이터 복원

### Epic 5: 랜딩 페이지 연결

- 의존성: Epic 1
- 스토리:
  - 5.1 Hero CTA 아래 "or Browse products →" 보조 링크 추가
  - 5.2 랜딩 헤더에 Explore 네비게이션 링크 (선택적)

---

## 5. MVP 범위

### 포함

- Epic 1 ~ 5 전체

### 제외 (v0.2 이후)

- 카드 상세 페이지 (`/products/:id`) — 현재 카드에서 외부 링크 직접 제공
- 검색 바 (텍스트 자유 검색) — 필터로 대체. 텍스트 검색은 Chat 역할
- 위시리스트/북마크 — 계정 인증(v0.2) 후 도입
- 카드에서 Chat으로 컨텍스트 전달 ("Ask AI about this") — 개별 카드 인터렉션 과다. 헤더 Chat 아이콘으로 대체

---

## 6. 기술 제약

- 스택: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4
- 상태 관리: React Context + URL query params (Zustand 금지, L-11)
- API: 새 `/api/explore` 엔드포인트 생성 필요 (서버 사이드 scoring + sort + pagination). scoring 함수는 `import 'server-only'` 제약으로 클라이언트 실행 불가. 기존 공개 읽기 API(`/api/products` 등)는 직접 사용하지 않고, `/api/explore`에서 repository 함수를 재사용
- 카드 컴포넌트: 기존 `ProductCard`, `StoreCard`, `ClinicCard`, `TreatmentCard` (default variant) 재사용
- 디자인 시스템: `globals.css` 디자인 토큰 사용 (S-* 규칙)
- 가상 스크롤: `@tanstack/react-virtual` 3.13.23 (확정 — headless, 가변 높이 measureElement, 3.9 kB)
- 캐싱: `SWR` 2.4.1 (확정 — Provider 불필요, useSWRInfinite, 4.2 kB)

### 가상 스크롤 + 캐싱 기술 검토 사항

설계(dev-design-arch) 단계에서 다음을 분석해야 한다:

1. **가상 스크롤 라이브러리 선택**: `@tanstack/react-virtual` vs `react-window` vs `react-virtuoso`. 그리드(2열/3열) 지원 여부, 가변 높이 카드 지원, React 19 호환성
2. **카드 높이 불균형 문제**: 이미지 유무, 텍스트 길이에 따라 카드 높이가 다름. 가상 스크롤에서 가변 높이 처리 방식 (측정 후 캐시 vs 고정 높이 강제)
3. **캐싱 전략**: 도메인+필터+정렬 조합을 키로 한 캐시. 캐시 무효화 시점 (탭 전환 시 유지, 필터 변경 시 새 요청). 메모리 제한 (최대 캐시 엔트리 수)
4. **현재 구조와의 호환**: App Router RSC vs Client Component 경계. `/api/explore` 서버 엔드포인트에서 scoring 수행 (확정). 클라이언트는 결과만 fetch
5. **Q-9 exact versions**: 새 패키지 추가 시 정확한 버전 고정

---

## 7. 검증 결과

| 항목 | 상태 | 비고 |
|------|------|------|
| 완전성 | PASS | 모든 FR에 수용 기준 존재 |
| 일관성 | PASS | FR 간 모순 없음. FR-5(프로필 정렬)과 FR-7(정렬 옵션)은 상호 보완적 |
| 추적성 | PASS | 모든 FR이 최소 1개 에픽에 매핑됨 |
| 범위 | PASS | 제외 항목 명시. 카드 상세/검색바/위시리스트/카드별 AI 연동 제외 |
| 의존성 | PASS | Epic 2~5는 Epic 1에 의존. Epic 2와 3은 독립(병렬 가능) |

### 기존 PRD와의 관계

- PRD v2.2 §3.2 Landing CTA에 보조 링크 추가 → PRD 갱신 필요
- PRD v2.2 "MVP Chat-First 단일 경로" 원칙에 보조 경로 추가 → PRD §5.1 범위 갱신 필요
- 갱신은 이 기능 구현 완료 후 `/gstack-document-release`로 수행

---

## 8. 미결정 사항 (설계 단계에서 결정)

| 항목 | 선택지 | 결정 시점 |
|------|--------|----------|
| ~~scoring 실행 위치~~ | ~~서버 API 엔드포인트~~ | **확정** — `import 'server-only'` 제약으로 서버 필수 |
| ~~가상 스크롤 라이브러리~~ | ~~@tanstack/react-virtual 3.13.23~~ | **확정** — headless, 가변 높이 measureElement, 3.9 kB |
| ~~캐싱 방식~~ | ~~SWR 2.4.1~~ | **확정** — Provider 불필요(L-11), useSWRInfinite, 4.2 kB |
| ~~카드 높이~~ | ~~가변 (measureElement 동적 측정)~~ | **확정** — estimateSize 초기 추정 + measureElement 비동기 보정 |
| 데스크톱 필터 UI | bottom sheet 유지 (MVP) / 사이드바 (v0.2 검토) | MVP: bottom sheet 유지. v0.2에서 사용자 피드백 기반 결정 |
