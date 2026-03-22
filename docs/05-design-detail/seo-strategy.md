# P1-11: SEO Strategy

> Date: 2026-03-22
> Status: Confirmed

---

## 1. SEO Scope by Page

| Page | URL | Rendering | SEO Target | Rationale |
|------|-----|-----------|------------|-----------|
| Landing | `/[locale]` | SSG | Yes | Only crawlable page. Entry point for organic search |
| Onboarding | `/[locale]/onboarding` | CSR | No | User input wizard, no static content to index |
| Profile | `/[locale]/profile` | CSR | No | Per-user data, no public content |
| Chat | `/[locale]/chat` | CSR | No | Dynamic AI conversation, not indexable |
| Admin | `/admin/*` | CSR | No | Internal tool, blocked by robots.txt |

SEO effort concentrates on Landing. CSR pages get basic metadata for SNS sharing only.

## 2. Metadata

### 2.1 Landing (`/[locale]`)

Page-level `generateMetadata` in `app/(user)/[locale]/page.tsx`:

- `title`: Localized. e.g. "Essenly -- Your AI K-Beauty Guide"
- `description`: Localized. e.g. "AI-powered K-beauty recommendations personalized to your skin type, concerns, and travel plans."
- `keywords`: `["K-beauty", "Korean skincare", "AI beauty", "Seoul beauty guide"]`

### 2.2 CSR Pages

Shared fallback metadata in `app/(user)/[locale]/layout.tsx`:

- `title.template`: `"%s | Essenly"`
- `title.default`: `"Essenly -- Your AI K-Beauty Guide"`
- `description`: Same as Landing

### 2.3 Admin

No SEO metadata. Blocked by robots.txt.

## 3. Open Graph + Twitter Card

Single static OG image: `public/og.png` (1200x630px).

Applied via `generateMetadata` in locale layout:

```
openGraph:
  type: "website"
  siteName: "Essenly"
  title: (localized)
  description: (localized)
  images: [{ url: "/og.png", width: 1200, height: 630, alt: "Essenly" }]
  locale: (current locale)

twitter:
  card: "summary_large_image"
  title: (localized)
  description: (localized)
  images: ["/og.png"]
```

OG image is produced at implementation time. Design document only specifies the strategy.

## 4. Multilingual SEO (hreflang)

MVP: `en` locale only. No hreflang needed (single language, no alternate URLs).

Landing `generateMetadata` includes canonical only:

```
alternates:
  canonical: "/en"
```

v0.2+ multi-locale expansion: Add `alternates.languages` for all locales. next-intl generates `<link rel="alternate" hreflang="...">` tags automatically. `x-default` points to `/en`.

## 5. JSON-LD Structured Data

Landing page only. `<script type="application/ld+json">` in `app/(user)/[locale]/page.tsx`:

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Essenly",
  "description": "AI-powered K-beauty recommendations for travelers visiting Korea",
  "url": "https://essenly.com",
  "applicationCategory": "LifestyleApplication",
  "operatingSystem": "Web",
  "availableLanguage": ["en"],
  "publisher": {
    "@type": "Organization",
    "name": "Essenly"
  }
}
```

v0.2+: `availableLanguage` expands to `["en", "ko", "ja", "zh", "es", "fr"]` when multi-locale UI is added.

## 6. sitemap.xml

Next.js `app/sitemap.ts` generates static sitemap:

```
https://essenly.com/en
```

1 URL (Landing x 1 locale). CSR pages excluded (no unique public content). `changeFrequency: "weekly"`, `priority: 1.0`.

v0.2+: Add locale-specific Landing URLs as locales are enabled.

## 7. robots.txt

Next.js `app/robots.ts`:

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Sitemap: https://essenly.com/sitemap.xml
```

## 8. Implementation Location

| Artifact | File | Layer |
|----------|------|-------|
| Landing metadata | `app/(user)/[locale]/page.tsx` | app/ (Composition Root) |
| Layout metadata template | `app/(user)/[locale]/layout.tsx` | app/ (Composition Root) |
| JSON-LD script | `app/(user)/[locale]/page.tsx` | app/ (Composition Root) |
| sitemap.xml | `app/sitemap.ts` | app/ (Composition Root) |
| robots.txt | `app/robots.ts` | app/ (Composition Root) |
| OG image | `public/og.png` | Static asset |
| metadataBase | `app/(user)/[locale]/layout.tsx` | `metadataBase: new URL('https://essenly.com')` — required for OG image absolute URL resolution |

All artifacts reside in `app/` layer. No `server/`, `client/`, `shared/`, or `core/` changes required.
