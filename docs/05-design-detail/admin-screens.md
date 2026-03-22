# P1-10: 관리자 앱 화면 설계

> Date: 2026-03-22
> Status: Confirmed
> Scope: 로그인, 대시보드, 7엔티티 CRUD (제네릭 패턴), 감사 로그, 관리자 관리 + 재사용 컴포넌트 + 공통 패턴

---

## 0. 범위 선언

**본 문서의 역할**: 7.2-ADMIN-REQUIREMENTS.md(WHAT)를 Phase 2 구현 가능한 화면 명세(HOW — 컴포넌트 분해, 상태, 데이터 매핑, 인터랙션)로 변환한다.

**본 문서가 하지 않는 것**:
- 다국어 입력 UX 규칙 재기술 → 7.2-ADMIN §7.2.4 참조
- 이미지 업로드 규칙 재기술 → 7.2-ADMIN §7.2.5 참조
- 데이터 검증 규칙(필수 필드/허용값) 재기술 → 7.2-ADMIN §7.2.6 참조
- API 요청/응답 스키마 재정의 → api-spec.md §5~6 참조
- 권한 비트 상세 재기술 → auth-matrix.md §2.3 참조

**계층 규칙**: 모든 컴포넌트는 `client/features/admin/`에 위치 (ui-framework.md §2 확정). `server/`, `core/` 수정 없음.

**UI 언어**: 한국어 고정 (MVP). 다국어 관리자 UI는 v0.2+ (sitemap.md §3).

---

## 1. 공통 레이아웃

### 1.1 AdminLayout

**위치**: `client/features/admin/layouts/`

```
app/(admin)/admin/layout.tsx              ← Composition Root (L-2)
  └─ AdminLayout
       ├─ AdminSidebar (좌측 고정)
       ├─ AdminHeader (상단)
       └─ <main> (페이지 콘텐츠)
```

### 1.2 AdminSidebar

**위치**: `client/features/admin/layouts/AdminSidebar.tsx`

네비게이션 구조 → sitemap.md §3 Admin Navigation 참조.

| 섹션 | 메뉴 항목 | 권한 조건 |
|------|----------|----------|
| — | Dashboard | admin+ (모든 인증 관리자) |
| Entities | Products, Stores, Brands, Ingredients, Clinics, Treatments, Doctors | 해당 `{entity}_read` 권한 보유 시만 표시 |
| System | Audit Log, Admins | `super_admin` 역할만 표시 |

- 현재 페이지 메뉴 하이라이트 (active 상태)
- 권한 없는 메뉴는 **숨김** (비활성이 아닌 미표시)
- 반응형: `lg:` 이상 좌측 고정. `md:` 이하 햄버거 메뉴 → 오버레이

### 1.3 AdminHeader

**위치**: `client/features/admin/layouts/AdminHeader.tsx`

| 영역 | 내용 |
|------|------|
| 좌측 | 현재 페이지 제목 (엔티티명 또는 "Dashboard" 등) |
| 우측 | 관리자 이름 + 역할 배지 (super_admin/admin) + 로그아웃 버튼 |

---

## 2. 재사용 컴포넌트

**위치**: `client/features/admin/components/`

### 2.1 의존성 방향

```
admin/components/   → ui/primitives/ (shadcn) + shared/ ONLY
admin/layouts/      → ui/primitives/ + shared/ ONLY
admin/              → cards/, chat/, onboarding/, profile/, layout/ ✗ (타 features 금지)

내부 단방향:
  EntityForm → MultiLangInput, ImageUploader, RelationManager, HighlightToggle, MultiSelectEnum
  역방향 금지: RelationManager → EntityForm ✗ (인라인 엔티티 생성 금지)
```

### 2.2 AdminDataTable

제네릭 목록 테이블. 7엔티티 + 감사 로그 + 관리자 목록에서 공용.

| 기능 | 구현 |
|------|------|
| 검색 | 텍스트 입력 → `search` 쿼리 파라미터 (api-spec §5.1) |
| 필터 | 엔티티별 필터 (api-spec §5.5). shadcn `Select` |
| 정렬 | 컬럼 헤더 클릭 → `sort`/`order` 파라미터 |
| 페이지네이션 | shadcn `Pagination`. `page`/`pageSize` 파라미터 |
| 행 클릭 | `/admin/{entity}/[id]` 이동 |

**기본 컬럼**: 이미지 썸네일(해당 시), name(ko), status(StatusBadge), updated_at, actions(수정/비활성화).
엔티티별 추가 컬럼 → §4 매트릭스에서 정의.

상태 관리: URL search params (`useSearchParams`). 전역 상태 불필요.

### 2.3 EntityForm

폼 **프레임** (레이아웃 + 제출 + 검증 래퍼). 필드 렌더링은 엔티티별 config 객체로 구동.

| 역할 | 설명 |
|------|------|
| 레이아웃 | 섹션 구분 (기본 정보 / 다국어 / 이미지 / 관계 / 하이라이트) |
| 상태 관리 | react-hook-form (L-11) |
| 검증 | zod 스키마 (api-spec §5.1 요청 스키마 기반). 에러는 필드 옆 인라인 표시 |
| 제출 | 생성 = `POST`, 수정 = `PUT`. 로딩 → 성공 토스트 / 에러 인라인 |
| 모드 | 생성 모드 (빈 폼) vs 수정 모드 (기존 값 프리필) |

### 2.4 MultiLangInput

다국어 텍스트 입력. UX 규칙 → 7.2-ADMIN §7.2.4 참조.

| 기능 | UI |
|------|-----|
| 기본 표시 | ko + en 입력 필드 (항상 표시) |
| 확장 | "번역 추가" 버튼 → ja, zh, es, fr 필드 토글 |
| 완성도 | "2/6 언어 입력됨" 표시 |
| 언어 간 복사 | 복사 버튼 (텍스트 한 방향 복사) |
| 검증 | ko/en 미입력 → 필드 에러. 선택 언어 미입력 → 경고 (저장 허용) |

shadcn `Input` 또는 `Textarea` (필드 타입에 따라).

### 2.5 ImageUploader

이미지 관리. 워크플로 → 7.2-ADMIN §7.2.5 참조.

| 기능 | UI |
|------|-----|
| 업로드 | 파일 선택 또는 드래그 앤 드롭. 여러 장 동시 |
| 미리보기 | 업로드 전 로컬 썸네일 표시 |
| 진행 상태 | 파일별 프로그레스 바 |
| 순서 변경 | 드래그 앤 드롭 |
| 삭제 | 개별 삭제 + 확인. 최소 1장 유지 |
| 에러 | 파일별 인라인 에러 (형식/크기). 성공 파일은 유지 |

API: `POST /api/admin/{entity}/:id/images`, `DELETE .../images/:index`, `PUT .../images/order` (api-spec §5.4).

### 2.6 RelationManager

관계 연결/해제 UI. 3관계: Product↔Store, Product↔Ingredient, Clinic↔Treatment.

| 기능 | UI |
|------|-----|
| 현재 관계 | 연결된 엔티티 목록 (이름 + StatusBadge) |
| 추가 | 검색 가능 셀렉트 (기존 엔티티에서 선택). 인라인 생성 금지 |
| Product↔Ingredient | type 선택: `key` / `avoid` (api-spec §5.2) |
| 해제 | 개별 해제 + 확인 |
| 비활성 표시 | 연결된 엔티티가 inactive이면 경고 표시 (DV-R3) |

API: `POST /api/admin/relations/{type}`, `DELETE /api/admin/relations/{type}` (api-spec §5.2).

### 2.7 HighlightToggle

하이라이트 활성화/비활성화 + 배지 텍스트 입력. 대상: Product, Store, Clinic, Treatment (4엔티티만).

| 기능 | UI |
|------|-----|
| 토글 | shadcn `Switch`. ON → 배지 입력 영역 표시 |
| 배지 입력 | MultiLangInput (en 필수, DV-C7). "에센리 픽" 등 |
| 검증 | inactive 엔티티는 ON 불가 (DV-C8). 토스트 에러 |
| VP-1 | 시각적 강조만. 검색/정렬 미영향 (Q-2, V-11) |

API: `PUT /api/admin/{entity}/:id/highlight` (api-spec §5.3).

### 2.8 DeactivateDialog

비활성화 확인 대화상자. shadcn `AlertDialog`.

| 기능 | UI |
|------|-----|
| 경고 | 영향 범위 표시: 관련 데이터 수, 하이라이트 자동 해제 여부 (DV-D1) |
| 확인 | "비활성화" 버튼 → API 호출 → 성공 시 목록 이동 |
| 취소 | 다이얼로그 닫힘 |

API: `DELETE /api/admin/{entity}/:id` (api-spec §5.1 비활성화).

### 2.9 StatusBadge

엔티티 상태 시각 구분.

| 상태 | 표현 |
|------|------|
| `active` | 초록 배지 (`bg-success`) |
| `inactive` | 회색 배지 (`bg-muted`) |
| `temporarily_closed` | 노란 배지 (`bg-warning`) |

### 2.10 MultiSelectEnum

배열 enum 복수 선택 위젯. skin_types[], hair_types[], concerns[], target_concerns[], travel_style[] 등.

| 기능 | UI |
|------|-----|
| 표시 | 선택된 값 = shadcn `Badge` 목록 |
| 선택 | 드롭다운에서 복수 선택. 이미 선택된 값은 체크 표시 |
| 제거 | 배지 X 버튼으로 개별 제거 |
| 허용값 | 엔티티별 enum (7.2-ADMIN §7.2.6 값 제약 참조) |

### 2.11 PermissionMatrix

관리자 관리 화면 전용. 14비트 권한 체크박스 그리드.

| 구조 | 행: 7엔티티 / 열: read, write |
|------|------|
| super_admin | 전체 체크, 수정 불가 (항상 전권) |
| admin | 엔티티별 read/write 토글. auth-matrix.md §2.3 인터페이스 기반 |

### 2.12 DiffViewer

감사 로그 변경 상세 표시. before/after 비교.

| 표현 | 설명 |
|------|------|
| 추가 필드 | 초록 하이라이트 (after만) |
| 삭제 필드 | 빨간 하이라이트 (before만) |
| 변경 필드 | before(빨간) → after(초록) 좌우 비교 |
| 다국어 필드 | 변경된 언어만 표시 |

---

## 3. 제네릭 CRUD 패턴

> 7엔티티(Product, Store, Brand, Ingredient, Clinic, Treatment, Doctor)에 동일 패턴 적용. 엔티티별 차이는 §4에서 정의.

### 3.1 목록 화면 (`/admin/{entity}`)

**컴포넌트 트리**:

```
app/(admin)/admin/{entity}/page.tsx       ← Composition Root (L-2)
  └─ EntityListPage
       ├─ PageHeader ("Products" + "새로 만들기" 버튼)
       ├─ FilterBar (상태 필터 + 엔티티별 필터 + 검색)
       └─ AdminDataTable
            ├─ 컬럼 헤더 (정렬 가능)
            ├─ 행 (엔티티 데이터 + StatusBadge + actions)
            └─ Pagination
```

**API**: `GET /api/admin/{entity}` (api-spec §5.1 목록 조회).

**상태 매트릭스**:

| 상태 | 조건 | UI |
|------|------|-----|
| **로딩** | API 호출 중 | 테이블 스켈레톤 |
| **정상** | 데이터 있음 | AdminDataTable 표시 |
| **빈 목록** | total = 0 (필터 없음) | "아직 등록된 데이터가 없습니다" + 생성 버튼 |
| **필터 결과 없음** | total = 0 (필터 있음) | "검색 결과가 없습니다" + 필터 초기화 버튼 |
| **에러** | API 실패 | 인라인 에러 + 재시도 버튼 |
| **권한 없음** | `{entity}_read` 미보유 | 이 상태에 도달 불가 — Sidebar에서 메뉴 숨김. URL 직접 접근 시 403 페이지 |

**인터랙션**:

| 액션 | 결과 |
|------|------|
| "새로 만들기" 클릭 | `/admin/{entity}/new` 이동. write 권한 없으면 버튼 숨김 |
| 행 클릭 | `/admin/{entity}/[id]` 이동 |
| 필터/검색 변경 | URL search params 업데이트 → API 재호출 |
| 컬럼 헤더 클릭 | sort/order 토글 → API 재호출 |

### 3.2 생성 화면 (`/admin/{entity}/new`)

**컴포넌트 트리**:

```
app/(admin)/admin/{entity}/new/page.tsx   ← Composition Root (L-2)
  └─ EntityCreatePage
       ├─ PageHeader ("새 Product 등록" + "취소" 버튼)
       └─ EntityForm (생성 모드)
            ├─ 기본 정보 섹션 (엔티티별 config 구동 필드)
            ├─ MultiLangInput (다국어 필드별)
            ├─ MultiSelectEnum (배열 enum 필드)
            ├─ ImageUploader (이미지 엔티티만)
            └─ 제출 버튼 ("등록")
```

**API**: `POST /api/admin/{entity}` (api-spec §5.1 생성).

**상태 매트릭스**:

| 상태 | 조건 | UI |
|------|------|-----|
| **입력 중** | 폼 작성 중 | EntityForm 활성 |
| **검증 에러** | zod 검증 실패 | 필드별 인라인 에러 + 다국어 미입력 경고 |
| **제출 중** | API 호출 중 | 제출 버튼 로딩 상태 |
| **성공** | 201 응답 | 토스트 "등록 완료" + `/admin/{entity}/[id]` 이동 |
| **서버 에러** | API 실패 | 토스트 에러 + 폼 상태 유지 |
| **권한 없음** | `{entity}_write` 미보유 | 이 페이지에 도달 불가 — 생성 버튼 숨김. URL 직접 접근 시 403 |

**관계 관리**: 생성 화면에서는 불가. 엔티티 생성 후 상세/수정 화면에서 관계 추가. (Doctor의 clinic_id는 예외 — 필수 FK이므로 생성 폼에 검색 가능 Select 포함.)

### 3.3 상세/수정 화면 (`/admin/{entity}/[id]`)

**컴포넌트 트리**:

```
app/(admin)/admin/{entity}/[id]/page.tsx  ← Composition Root (L-2)
  └─ EntityDetailPage
       ├─ PageHeader ("COSRX Snail Mucin" + "수정" / "비활성화" 버튼)
       ├─ EntityForm (수정 모드 — 기존 값 프리필)
       │    ├─ 기본 정보 섹션
       │    ├─ MultiLangInput
       │    ├─ MultiSelectEnum
       │    ├─ ImageUploader (이미지 엔티티만)
       │    ├─ HighlightToggle (하이라이트 엔티티만)
       │    └─ 저장 버튼 ("수정 저장")
       ├─ RelationManager (관계 엔티티만)
       │    └─ 관계별 섹션 (Product: stores + ingredients)
       └─ DeactivateDialog (비활성화 확인)
```

**API**: `GET /api/admin/{entity}/:id` (상세), `PUT /api/admin/{entity}/:id` (수정).

**상태 변경**: 상세 화면 상단에 상태 Select 위젯 표시 (write 권한 보유 시). `active` / `inactive` / `temporarily_closed` 전환 가능 (DV-C4). 비활성화(`inactive` 전환)는 DeactivateDialog 경유. 재활성화(`active` 전환)는 즉시 `PUT /api/admin/{entity}/:id` (status=active) 호출.

**상태 매트릭스**:

| 상태 | 조건 | UI |
|------|------|-----|
| **로딩** | API 호출 중 | 폼 스켈레톤 |
| **상세 보기 (read-only)** | read 권한만 보유 | 폼 필드 비활성. 수정/비활성화 버튼 숨김 |
| **수정 모드** | write 권한 보유 | 폼 필드 활성. 수정/비활성화/상태변경 버튼 표시 |
| **비활성 엔티티** | status = inactive | 상단 경고 배너 "비활성 상태입니다" + "재활성화" 버튼 (PUT status=active) |
| **임시 휴업 엔티티** | status = temporarily_closed | 상단 정보 배너 "임시 휴업 상태입니다" + "재활성화" 버튼 |
| **저장 중** | PUT 호출 중 | 저장 버튼 로딩 |
| **성공** | 200 응답 | 토스트 "수정 완료" + 데이터 갱신 |
| **404** | 엔티티 미존재 | 404 페이지 또는 목록으로 리다이렉트 |
| **서버 에러** | API 실패 | 토스트 에러 + 폼 상태 유지 |

---

## 4. 엔티티별 차이 매트릭스

> 검증 규칙(필수/허용값/범위)은 7.2-ADMIN §7.2.6 참조. 여기서는 **UI 관점 차이만** 기술.

### 4.1 기능 매트릭스

| 엔티티 | 이미지 | 하이라이트 | 관계 | FK 참조 |
|--------|:------:|:----------:|------|---------|
| Product | O | O | stores, ingredients(key/avoid) | brand_id (선택) |
| Store | O | O | — | — |
| Brand | — | — | — | — |
| Ingredient | — | — | — | — |
| Clinic | O | O | treatments | — |
| Treatment | O | O | — | — |
| Doctor | — | — | — | clinic_id (필수) |

### 4.2 목록 추가 컬럼

| 엔티티 | 기본 외 추가 컬럼 | 추가 필터 (api-spec §5.5) |
|--------|-------------------|--------------------------|
| Product | category, brand(name), price | category, brand_id, has_highlight (*) |
| Store | store_type, district | district, store_type |
| Brand | tier, is_essenly | tier, is_essenly |
| Ingredient | function | — |
| Clinic | clinic_type, district | district, clinic_type |
| Treatment | category, price_min~max | category |
| Doctor | clinic(name), specialties | clinic_id |

> (*) `has_highlight` 필터: 관리자가 하이라이트 대상 데이터를 관리하기 위한 필터. 사용자 앱 추천 순위/정렬에는 영향 없음 (VP-1 관리 목적 예외).

### 4.3 폼 필드 → 입력 위젯 매핑

> 필수/선택 구분은 7.2-ADMIN §7.2.6 참조. 여기서는 위젯 타입만.

| 위젯 타입 | 대상 필드 | shadcn primitive |
|----------|----------|-----------------|
| **MultiLangInput** (텍스트) | name, description | `Input` / `Textarea` |
| **MultiLangInput** (배지) | highlight_badge | `Input` (en 필수) |
| **Select** (단일 enum) | category, subcategory, store_type, clinic_type, tier, english_support | `Select` |
| **MultiSelectEnum** (배열) | skin_types, hair_types, concerns, target_concerns, tags, specialties, languages, payment_methods, consultation_type | `Popover` + `Checkbox` 목록 |
| **Number** | price, price_min, price_max, duration_minutes, downtime_days, session_count, rating, review_count | `Input` type=number |
| **SearchSelect** (FK) | brand_id, clinic_id | `Popover` + 검색 입력 + 결과 목록 |
| **Switch** (boolean) | english_label, tourist_popular, license_verified, is_essenly | `Switch` |
| **ImageUploader** | images | §2.5 ImageUploader |
| **StructuredInput** (JSONB) | operating_hours, external_links, foreigner_friendly, tourist_services | 엔티티별 커스텀 구조화 폼 (아래 참조) |
| **LocationInput** | location (PostGIS), address (다국어) | 좌표 입력 + 주소 MultiLangInput |

### 4.4 JSONB 구조화 입력 (엔티티별)

| 필드 | 엔티티 | 입력 구조 |
|------|--------|----------|
| `operating_hours` | Store, Clinic | 요일별 영업시간 (open/close) + 휴무일 + 특이사항 텍스트 |
| `external_links` | Clinic | 반복 입력: type(Select, 허용값) + url(Input) + label(Input, 선택) |
| `foreigner_friendly` | Clinic | 구조화 체크리스트: 상담언어, 통역, 영문동의서, 해외카드, 픽업 |
| `tourist_services` | Store | 태그 목록: 면세, 할인, 샘플바 등 |
| `purchase_links` | Product | 반복 입력: platform(Select) + url(Input) |

### 4.5 URL ↔ API 매핑

| 화면 URL | API 엔드포인트 | 비고 |
|----------|---------------|------|
| `/admin/products` | `GET /api/admin/products` | 동일 패턴 |
| `/admin/admins` | `GET /api/admin/users` | **명명 불일치**: 화면은 "admins", API는 "users" (admin_users 테이블 기반) |
| `/admin/admins/new` | `POST /api/admin/users` | |
| `/admin/admins/[id]` | `GET/PUT /api/admin/users/:id` | |
| `/admin/audit-log` | `GET /api/admin/audit-logs` | |

---

## 5. 고유 화면

### 5.1 로그인 (`/admin/login`)

**컴포넌트 트리**:

```
app/(admin)/admin/login/page.tsx
  └─ AdminLoginPage
       ├─ Essenly 로고
       ├─ "관리자 로그인" 제목
       ├─ GoogleSSOButton ("Google로 로그인")
       └─ ErrorMessage (조건부)
```

인증 흐름 상세 → auth-matrix.md §1.3, api-spec.md §6.1 참조.

**상태 매트릭스**:

| 상태 | 조건 | UI |
|------|------|-----|
| **대기** | 초기 | Google SSO 버튼 활성 |
| **로딩** | SSO 진행 중 | 버튼 로딩 상태 |
| **미등록 이메일** | `ADMIN_AUTH_EMAIL_NOT_REGISTERED` | 에러 "등록되지 않은 이메일입니다" |
| **비활성 계정** | `ADMIN_AUTH_ACCOUNT_INACTIVE` | 에러 "비활성화된 계정입니다" |
| **성공** | JWT 수신 | `/admin` (대시보드) 이동 |

### 5.2 대시보드 (`/admin`)

**컴포넌트 트리**:

```
app/(admin)/admin/page.tsx
  └─ AdminDashboardPage
       ├─ EntityCountCards (7엔티티별 active/inactive 카운트)
       └─ RecentAuditLog (최근 감사 로그 5건 — super_admin만)
```

MVP 최소 범위:
- 엔티티별 데이터 카운트 (active / inactive / total)
- 최근 감사 로그 5건 (super_admin만 표시)
- 상세 대시보드/분석은 v0.2+

### 5.3 감사 로그 (`/admin/audit-log`)

**컴포넌트 트리**:

```
app/(admin)/admin/audit-log/page.tsx
  └─ AuditLogPage                         ← super_admin 전용
       ├─ FilterBar
       │    ├─ DateRangePicker (기간)
       │    ├─ AdminSelect (관리자)
       │    ├─ ActionSelect (이벤트 유형)
       │    └─ EntityTypeSelect (엔티티 종류)
       ├─ AdminDataTable (감사 로그 목록)
       │    └─ 컬럼: 시각, 관리자, 이벤트, 대상, IP
       └─ AuditDetailSheet (행 클릭 시 → Side sheet)
            └─ DiffViewer (before/after 비교)
```

필터 항목 → api-spec.md §6.6 참조. 이벤트 목록 → 7.2-ADMIN §7.2.7 참조.

**상태 매트릭스**: 목록 화면(§3.1)과 동일 패턴 + AuditDetailSheet 열림/닫힘.

### 5.4 관리자 관리 (`/admin/admins`)

**목록**: AdminDataTable. 컬럼: 이름, 이메일, 역할(super_admin/admin), 상태(StatusBadge).

**생성** (`/admin/admins/new`):

```
AdminCreatePage
  └─ AdminForm
       ├─ EmailInput (Google 이메일)
       ├─ NameInput
       ├─ RoleSelect (admin / super_admin)
       └─ PermissionMatrix (role=admin일 때만 표시)
```

**상세/수정** (`/admin/admins/[id]`):

```
AdminDetailPage
  ├─ AdminForm (기존 값 프리필)
  │    ├─ 이메일 (읽기 전용)
  │    ├─ 이름
  │    ├─ 역할
  │    └─ PermissionMatrix
  └─ 비활성화/재활성화 버튼
```

API (7엔티티 CRUD 패턴과 다름 — 주의):
- 목록: `GET /api/admin/users`
- 생성: `POST /api/admin/users`
- 수정: `PUT /api/admin/users/:id`
- 비활성화: `PUT /api/admin/users/:id/deactivate` (DELETE 아님)
- 재활성화: `PUT /api/admin/users/:id/reactivate`

URL-API 매핑: §4.5 참조. 권한: auth-matrix.md §2.2 (super_admin 전용).

---

## 6. 공통 패턴

### 6.1 에러 표현

| 패턴 | 사용 |
|------|------|
| **토스트** (Sonner) | 성공 알림, 비파괴적 에러 |
| **필드 인라인** | 폼 검증 에러 (zod) |
| **페이지 에러** | 403 (권한 없음), 404 (미존재), 500 (서버 에러) |

### 6.2 로딩 패턴

| 패턴 | 사용 |
|------|------|
| **테이블 스켈레톤** | 목록 로딩 |
| **폼 스켈레톤** | 상세/수정 로딩 |
| **버튼 로딩** | 제출/비활성화 진행 중 |

### 6.3 빈 상태

| 상황 | 표현 |
|------|------|
| 엔티티 목록 비어있음 | "아직 등록된 데이터가 없습니다" + 생성 버튼 |
| 필터 결과 없음 | "검색 결과가 없습니다" + 필터 초기화 |
| 감사 로그 없음 | "기록된 이벤트가 없습니다" |
| 관계 없음 | "연결된 {엔티티}가 없습니다" + 추가 버튼 |

### 6.4 권한 기반 UI 분기

| 권한 상태 | UI 처리 |
|----------|---------|
| `{entity}_read` 미보유 | Sidebar 메뉴 숨김. URL 직접 접근 → 403 페이지 |
| `{entity}_read` 보유, write 미보유 | 상세 화면 read-only. 생성/수정/비활성화 버튼 숨김 |
| `{entity}_write` 보유 | 전체 기능 활성 |
| `super_admin` | 모든 메뉴 + System 섹션 (감사 로그, 관리자 관리) |

인증 상태: React Context로 admin 세션/권한 정보 제공 (L-11).

### 6.5 폼 접근성

폼 관련 접근성 규칙 → accessibility.md §7 참조.

---

## 참조 문서 색인

| 문서 | 참조 내용 |
|------|----------|
| 7.2-ADMIN §7.2.1 | 역할/권한 모델 (2역할, 14비트) |
| 7.2-ADMIN §7.2.2 | CRUD 기능 목록, 관계 관리, 하이라이트, 비즈니스 규칙 |
| 7.2-ADMIN §7.2.3 | 인증 요구사항 (Google SSO, JWT, 보안) |
| 7.2-ADMIN §7.2.4 | 다국어 데이터 입력 UX (하이브리드, 검증, 복사) |
| 7.2-ADMIN §7.2.5 | 이미지 업로드 (형식, 크기, 순서, 워크플로) |
| 7.2-ADMIN §7.2.6 | 데이터 검증 규칙 (필수 필드, 허용값, 참조 무결성) |
| 7.2-ADMIN §7.2.7 | 감사 로그 (17이벤트, before/after, 조회, 불변) |
| api-spec.md §5 | 관리자 CRUD API (제네릭 패턴, 관계, 하이라이트, 이미지) |
| api-spec.md §6 | 관리자 인증 API (SSO, JWT, 계정 관리, 감사 로그 조회) |
| auth-matrix.md §1.3 | 인증 아키텍처 (옵션 B) |
| auth-matrix.md §2.2~2.3 | 관리자 권한 매트릭스, 14비트 인터페이스 |
| sitemap.md §3 | 관리자 URL 구조, Admin Navigation |
| ui-framework.md §2 | client/features/admin/ 파일 구조 |
| accessibility.md §7 | 폼 접근성 (labels, aria-describedby, 검증 타이밍) |
| user-screens.md | P1-9 사용자 앱 화면 (참조 패턴) |
