# P1-12: Accessibility Standards

> Date: 2026-03-22
> Status: Confirmed
> Level: WCAG 2.1 AA

---

## 1. Color Contrast

Minimum contrast ratios (WCAG AA):

| Context | Ratio | Applies to |
|---------|-------|------------|
| Normal text (< 18px / < 14px bold) | >= 4.5:1 | All body text, labels, placeholders |
| Large text (>= 18px / >= 14px bold) | >= 3:1 | Headings, display text |
| UI components & graphical objects | >= 3:1 | Borders, icons, focus indicators |

Color contrast for the design system tokens was verified in P1-4. Implementation must use semantic tokens (`bg-primary`, `text-foreground`) defined in `globals.css` -- never hardcoded hex values.

## 2. Keyboard Navigation

### 2.1 General Rules

| Rule | Description |
|------|-------------|
| Skip link | "Skip to main content" link as first focusable element. Visually hidden until focused |
| Tab order | Follows visual layout order (top-to-bottom, left-to-right). No manual `tabindex` > 0 |
| Focus visible | All interactive elements show a visible focus ring. Tailwind `ring` utility with `--ring` token |
| Enter / Space | Activate buttons and links. Space scrolls page only when no focusable element is active |
| Escape | Close any overlay (bottom sheet, dropdown, tooltip) |
| Arrow keys | Navigate within composite widgets (radio groups, tab panels, select menus) |

### 2.2 Per-Component Rules

| Component | Keyboard behavior |
|-----------|-------------------|
| Chat input | Enter = send message. Shift+Enter = newline |
| Onboarding wizard | Tab through options. Enter = select. Tab to "Next" button |
| Bottom sheet (Kit CTA) | Opens: focus moves to first input. Escape = close. Tab cycles within sheet |
| Product/Treatment card | Tab = navigate between cards. Enter = expand/interact |
| Language selector | Arrow keys = navigate options. Enter = select. Escape = close |

## 3. Screen Reader Support

### 3.1 ARIA Landmarks

| Landmark | Element | Usage |
|----------|---------|-------|
| `main` | Page content area | 1 per page |
| `navigation` | Primary nav, language selector | With `aria-label` distinguishing each |
| `form` | Onboarding steps, Kit CTA email form | With `aria-label` describing purpose |

### 3.2 Chat-Specific Accessibility

| Rule | Implementation |
|------|----------------|
| Message list | `role="log"` with `aria-label="Chat messages"` |
| New AI response | `aria-live="polite"` region. Announce full response text after streaming completes |
| Streaming indicator | `aria-live="polite"` with "AI is responding..." text. Removed when streaming ends |
| User message sent | No announcement needed (user initiated the action) |
| Product/Treatment card in chat | `role="article"` with `aria-label` including product/treatment name |

### 3.3 Dynamic Content

| Pattern | Approach |
|---------|----------|
| Loading states | `aria-busy="true"` on container while loading |
| Error messages | `role="alert"` for immediate announcement |
| Toast notifications | `role="status"` with `aria-live="polite"` |
| Success messages | `role="status"` with `aria-live="polite"`. e.g. "Profile saved", "Email submitted" |
| Step progress (onboarding) | `aria-label="Step 2 of 4: Concerns"` on wizard container |

## 4. Focus Management

| Scenario | Behavior |
|----------|----------|
| Bottom sheet opens | Focus moves to first focusable element inside. Focus trapped within sheet |
| Bottom sheet closes | Focus returns to the trigger element (Kit CTA "Claim" button) |
| Onboarding step change | Focus moves to step heading |
| Route navigation | Focus moves to `<main>` or page heading |
| Error display | Focus moves to error message |

Focus trap uses Radix UI Dialog/Sheet primitives (built into shadcn/ui). No custom implementation needed.

## 5. Touch Targets

| Rule | Value | Applies to |
|------|-------|------------|
| Minimum size | 44 x 44 px | All tappable elements on mobile |
| Spacing | >= 8px gap between adjacent targets | Prevents mis-taps |

Tailwind: `min-h-11 min-w-11` (44px) for interactive elements. Chat send button, onboarding options, card actions must meet this minimum.

## 6. Motion and Animation

| Rule | Implementation |
|------|----------------|
| `prefers-reduced-motion` | Respect OS setting. Disable transitions, skeleton shimmer, auto-scroll |
| Essential motion | Page transitions and bottom sheet slide are allowed (functional, not decorative) |
| Tailwind | Use `motion-safe:` prefix for decorative animations. `motion-reduce:` for reduced alternatives |

## 7. Form Accessibility

| Rule | Implementation |
|------|----------------|
| Labels | Every input has a visible `<label>` with `htmlFor` matching input `id` |
| Error messages | Connected via `aria-describedby` pointing to error element `id` |
| Required fields | `aria-required="true"` + visual indicator (asterisk with sr-only "required" text) |
| Validation timing | On blur for individual fields. On submit for form-level errors |
| Autocomplete | `autocomplete` attribute on known fields. e.g. `autocomplete="email"` on Kit CTA email input |

Applies to: Onboarding wizard, Kit CTA email form, Admin forms.

## 8. Testing

### 8.1 Automated: axe-core

`@axe-core/react` in development mode only. Reports violations to browser console. Not included in production bundle.

Catches: missing alt text, missing labels, contrast violations, invalid ARIA, duplicate IDs.

### 8.2 Manual Checklist (per component)

| # | Check |
|---|-------|
| 1 | Tab through all interactive elements -- order matches visual layout |
| 2 | Every interactive element has visible focus indicator |
| 3 | Escape closes overlays and returns focus to trigger |
| 4 | Screen reader announces purpose of all controls (test with VoiceOver) |
| 5 | All images have meaningful alt text (or `alt=""` for decorative) |
| 6 | Touch targets >= 44x44px on mobile |
| 7 | Page is usable with 200% browser zoom |
| 8 | No information conveyed by color alone (icons/text supplement color) |

## 9. Implementation Scope

| Item | Layer | Notes |
|------|-------|-------|
| ARIA attributes | `client/ui/` + `client/features/` | Component-level props. shadcn/Radix provides most ARIA automatically |
| Focus management | `client/ui/` | Radix Dialog/Sheet handle focus trap |
| axe-core | Dev dependency only | Not in production bundle. No `core/` or `server/` involvement |
| `prefers-reduced-motion` | Component classes only | Tailwind `motion-safe:`/`motion-reduce:` utilities. No globals.css changes needed |

No `server/core/` changes. No new shared types. All implementation is in the client layer using existing shadcn/Radix primitives.
