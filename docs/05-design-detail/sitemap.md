# P1-7 / P1-8: Sitemap + URL Design

> Date: 2026-03-21
> Status: Confirmed

---

## 1. Route Group Structure

```
src/app/
  layout.tsx                         # Root layout (html, body, font)
  (user)/                            # User app group (not in URL)
    [locale]/
      layout.tsx                     # User layout (i18n provider)
      page.tsx                       # Landing
      chat/page.tsx                  # Chat + Cards + Kit CTA (inline + bottom sheet)
      onboarding/page.tsx            # 4-step onboarding wizard
      profile/page.tsx               # Profile confirm / edit
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
| `/[locale]` | Landing | SSG | 2-path entry: "Start with profile" / "Just ask". Language selector. Consent banner. Return-visit detection |
| `/[locale]/onboarding` | Onboarding | CSR | 4-step wizard (Skin&Hair → Concerns → Travel → Interests). Profile transition display |
| `/[locale]/profile` | Profile | CSR | Profile confirm/edit. DV-1~4 display. "Edit" / "Show my picks" actions |
| `/[locale]/chat` | Chat + Results | CSR | Chat bubbles + ProductCard/TreatmentCard + 5-domain tabs. Kit CTA = inline card + bottom sheet (no separate URL) |

### Navigation Flow

```
Landing ─── "Start with profile" ──→ Onboarding ──→ Profile ──→ Chat
       └── "Just ask" ──────────────────────────────────────→ Chat (Path B)
       └── Return visit ── "Profile confirm" ──→ Profile ──→ Chat
                        └── "Just chat" ──────────────────→ Chat

Chat ←── "Edit profile" ──→ Profile
Chat ── Kit CTA (inline card) ── "Claim" ──→ Bottom sheet (email form)
```

### Error Handling

- `error.tsx`: Runtime error boundary per Next.js convention
- `not-found.tsx`: 404 page
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
