# P1-7 / P1-8: Sitemap + URL Design

> Date: 2026-03-21
> Status: Confirmed

---

## 1. Route Group Structure

```
src/app/
  layout.tsx                         # Root layout (html, body, font)
  not-found.tsx                      # Root 404 (locale 밖 — 영어 하드코딩, 브랜드 스타일)
  global-error.tsx                   # Root error boundary (layout 자체 실패 시 — globals.css import)
  (user)/                            # User app group (not in URL)
    [locale]/
      layout.tsx                     # Locale layout (i18n provider만. 풀 너비)
      page.tsx                       # Landing (풀 너비 마케팅 레이아웃. 자체 Header)
      (app)/                         # App route group (not in URL)
        layout.tsx                   # App layout (640px 중앙 + 공통 Header)
        chat/page.tsx                # Chat + Cards + Kit CTA (inline + bottom sheet) — MVP 핵심
        terms/page.tsx               # Terms of Service + Disclaimer (P2-43/44)
        privacy/page.tsx             # Privacy Policy (P2-44)
        onboarding/page.tsx          # 4-step onboarding wizard — v0.2 (라우트 비활성, 코드 유지)
        profile/page.tsx             # Profile confirm / edit — v0.2 (라우트 비활성, 코드 유지)
      error.tsx                      # Error boundary (Phase 2)
      not-found.tsx                  # 404 (Phase 2)
  (admin)/                           # Admin app group (not in URL)
    admin/
      layout.tsx                     # Admin layout (Sidebar, AdminHeader)
      page.tsx                       # Dashboard
      login/page.tsx                 # Google SSO login
      products/
        page.tsx                     # Product list
        new/page.tsx                 # Product create
        [id]/page.tsx                # Product detail / edit
      stores/
        page.tsx                     # Store list
        new/page.tsx                 # Store create
        [id]/page.tsx                # Store detail / edit
      brands/
        page.tsx                     # Brand list
        new/page.tsx                 # Brand create
        [id]/page.tsx                # Brand detail / edit
      ingredients/
        page.tsx                     # Ingredient list
        new/page.tsx                 # Ingredient create
        [id]/page.tsx                # Ingredient detail / edit
      clinics/
        page.tsx                     # Clinic list
        new/page.tsx                 # Clinic create
        [id]/page.tsx                # Clinic detail / edit
      treatments/
        page.tsx                     # Treatment list
        new/page.tsx                 # Treatment create
        [id]/page.tsx                # Treatment detail / edit
      doctors/
        page.tsx                     # Doctor list
        new/page.tsx                 # Doctor create
        [id]/page.tsx                # Doctor detail / edit
      audit-log/page.tsx             # Audit log (super_admin only)
      admins/
        page.tsx                     # Admin management (super_admin only)
        new/page.tsx                 # Admin create
        [id]/page.tsx                # Admin detail / edit
  api/                               # API routes (outside groups)
```

## 2. User App URLs (P1-7)

| URL | Page | Rendering | Description |
|-----|------|-----------|-------------|
| `/[locale]` | Landing | SSG+CSR | 풀 너비 마케팅 랜딩 (4섹션: Hero+CTA, How it works, Benefits, Trust). 자체 Header. 동의/재방문은 CSR |
| `/[locale]/onboarding` | Onboarding | CSR | 4-step wizard (Skin&Hair → Concerns → Travel → Interests). Profile transition display |
| `/[locale]/profile` | Profile | CSR | Profile confirm/edit. DV-1~4 display. "Edit" / "Show my picks" actions |
| `/[locale]/chat` | Chat + Results | CSR | Chat bubbles + ProductCard/TreatmentCard + 5-domain tabs. Kit CTA = inline card + bottom sheet (no separate URL) |

### Navigation Flow

```
MVP (Chat-First 단일 경로):
Landing ─── "Start chatting" → 동의 ────────────────────────→ Chat (VP-3 점진적 개인화)
       └── Return visit ── "Continue chatting" ─────────────→ Chat (대화 이어가기)
                        └── ✕ 닫기 ─────────────────────────→ Landing 콘텐츠

Chat ── Kit CTA (inline card) ── "Claim" ──→ Bottom sheet (email form)

v0.2 (이메일 로그인 도입 시 추가):
Landing └── "Set up my profile" ──→ Onboarding ──→ Profile ──→ Chat
Chat ←── "Edit profile" ──→ Profile
```

### Error Handling

- `error.tsx`: Locale 내 runtime error boundary (i18n 지원)
- `not-found.tsx`: Locale 내 404 (i18n 지원)
- Root `not-found.tsx`: Locale 밖 404 (영어 하드코딩)
- Root `global-error.tsx`: 루트 레이아웃 실패 시 최후 방어선 (globals.css import)
- 모든 에러 페이지: 브랜드 primary 색상 코드 + 설명 + "Back to home" CTA 통일
- No separate `/error` URL needed

## 3. Admin App URLs (P1-8)

| URL | Page | Auth | Description |
|-----|------|------|-------------|
| `/admin/login` | Login | Public | Google SSO single button |
| `/admin` | Dashboard | admin+ | Overview stats |
| `/admin/products` | Product list | product:read | Sortable, filterable, searchable |
| `/admin/products/new` | Product create | product:write | Multi-lang form + image upload |
| `/admin/products/[id]` | Product detail/edit | product:read/write | Detail view + edit form |
| `/admin/stores` | Store list | store:read | |
| `/admin/stores/new` | Store create | store:write | |
| `/admin/stores/[id]` | Store detail/edit | store:read/write | |
| `/admin/brands` | Brand list | brand:read | |
| `/admin/brands/new` | Brand create | brand:write | |
| `/admin/brands/[id]` | Brand detail/edit | brand:read/write | |
| `/admin/ingredients` | Ingredient list | ingredient:read | |
| `/admin/ingredients/new` | Ingredient create | ingredient:write | |
| `/admin/ingredients/[id]` | Ingredient detail/edit | ingredient:read/write | |
| `/admin/clinics` | Clinic list | clinic:read | |
| `/admin/clinics/new` | Clinic create | clinic:write | |
| `/admin/clinics/[id]` | Clinic detail/edit | clinic:read/write | |
| `/admin/treatments` | Treatment list | treatment:read | |
| `/admin/treatments/new` | Treatment create | treatment:write | |
| `/admin/treatments/[id]` | Treatment detail/edit | treatment:read/write | |
| `/admin/doctors` | Doctor list | doctor:read | |
| `/admin/doctors/new` | Doctor create | doctor:write | |
| `/admin/doctors/[id]` | Doctor detail/edit | doctor:read/write | |
| `/admin/audit-log` | Audit log | super_admin | Time-ordered events, filter, before/after diff |
| `/admin/admins` | Admin management | super_admin | Admin accounts, roles, permissions |
| `/admin/admins/new` | Admin create | super_admin | |
| `/admin/admins/[id]` | Admin detail/edit | super_admin | |

### Admin Navigation

```
Sidebar (always visible):
  Dashboard
  ── Entities ──
  Products
  Stores
  Brands
  Ingredients
  Clinics
  Treatments
  Doctors
  ── System (super_admin) ──
  Audit Log
  Admins
```

### Admin i18n

MVP: No i18n. Korean UI only. No `[locale]` segment.

## 4. Middleware

next-intl middleware excludes `/admin` and `/api` paths:

```typescript
matcher: ["/((?!api|admin|_next|_vercel|.*\\..*).*)"]
```

## 5. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Kit CTA format | Inline card + bottom sheet | Chat flow continuity, mobile UX, VP-4 hybrid pattern |
| Admin i18n | None (MVP) | Internal users, Korean only. Expandable in v0.2+ |
| Route Groups | `(user)` + `(admin)` | Layout isolation, expandable to `(partner)` |
| Error pages | Next.js error.tsx convention | No separate URL needed |
| Entity URL pattern | `/admin/[entity]`, `/new`, `/[id]` | RESTful, consistent across 7 entities |
| Root html lang | `lang="en"` hardcoded | MVP English only. v0.2+ multi-lang UI requires dynamic lang attribute |
