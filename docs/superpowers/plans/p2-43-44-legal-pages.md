# P2-43 + P2-44: 법률 페이지 (면책 조항 + 이용약관 + 개인정보처리방침)

> 작성일: 2026-04-04
> 근거: PRD §4-C (데이터 정책), data-privacy.md (구현 상세), system-prompt-spec §5 (Guardrails)
> 선행: P2-29 (shadcn 레이아웃 ✅), P2-32 (Landing 페이지 ✅)

---

## 1. 목적

법률 페이지 2개를 구현한다:
- **Terms of Service** (`/terms`): 서비스 이용약관 + 면책 조항(P2-43) 섹션 포함
- **Privacy Policy** (`/privacy`): 개인정보 수집/보관/삭제 정책

업계 표준(Airbnb, Sephora, Uber 등)에 따라 Terms와 Privacy는 별도 페이지로 분리한다. 면책 조항(P2-43)은 Terms 페이지의 한 섹션으로 통합한다 (별도 라우트 불필요).

---

## 2. 설계 근거

### 2.1 콘텐츠 소스 (정본 기준 — G-16)

| 콘텐츠 | 정본 | 참조 |
|--------|------|------|
| 데이터 보존 정책 | PRD §4-C:742-750 | 90일 자동 만료, 영구 보관(계정) |
| 동의 항목 5개, MVP 2개 | PRD §4-C:773-782 | data_retention(필수), marketing(선택) |
| GDPR/개인정보보호법 준수 | PRD §4-C:784-793 | 최소 수집, 동의 기반, 삭제 권리 |
| 삭제 경로 3가지 | PRD §4-C:790-793 | 자동 만료 + 수동 이메일 + v0.2 UI |
| 삭제 요청 이메일 | data-privacy.md:66 | `privacy@essenly.com` |
| 처리 기간 | data-privacy.md:68 | 영업일 3일 이내 |
| CASCADE 삭제 범위 | data-privacy.md §2.4 | 10 테이블 |
| 의료 면책 (No medical advice) | system-prompt-spec §5:254-258 | 가드레일 1번 |

### 2.2 라우트 결정

| 라우트 | 태스크 | HeroSection 참조 |
|--------|--------|-----------------|
| `/[locale]/(app)/terms` | P2-43 + P2-44a | `HeroSection.tsx:60` 기존 링크 유지 |
| `/[locale]/(app)/privacy` | P2-44b | Terms 페이지에서 cross-link |

> `/disclaimer` 별도 라우트는 생성하지 않는다. 업계 표준상 면책 조항은 Terms 내 섹션.

---

## 3. 산출물

### 3.1 신규 파일

| # | 파일 | 계층 | 설명 |
|---|------|------|------|
| 1 | `src/app/(user)/[locale]/(app)/terms/page.tsx` | app/ | Terms 페이지 (Server Component) |
| 2 | `src/app/(user)/[locale]/(app)/privacy/page.tsx` | app/ | Privacy 페이지 (Server Component) |
| 3 | `src/client/features/legal/TermsContent.tsx` | client/features/ | Terms 클라이언트 컴포넌트 |
| 4 | `src/client/features/legal/PrivacyContent.tsx` | client/features/ | Privacy 클라이언트 컴포넌트 |
| 5 | `src/shared/constants/legal.ts` | shared/constants/ | 법률 상수 (이메일, 보존 기간) |

### 3.2 수정 파일

| # | 파일 | 변경 | 영향 범위 |
|---|------|------|----------|
| 1 | `src/shared/constants/index.ts` | `export * from "./legal"` 추가 | barrel export만. 기존 import 무영향 |
| 2 | `messages/en.json` | `terms`, `privacy` 네임스페이스 추가 | 기존 키 무수정. 추가만 |

### 3.3 수정하지 않는 파일

| 파일 | 이유 |
|------|------|
| `src/server/**` | P-2 core 불변. 법률 페이지는 순수 정적 콘텐츠 — 서버 로직 불필요 |
| `src/client/features/landing/HeroSection.tsx` | 기존 `/${locale}/terms` 링크 이미 정확. 수정 불필요 |
| `src/client/ui/**` | 기존 primitives 재사용만 (typography). 신규 ui 컴포넌트 불필요 |
| `src/client/features/layout/Header.tsx` | (app) layout이 이미 Header 포함. 수정 불필요 |
| `src/app/(user)/[locale]/(app)/layout.tsx` | 기존 레이아웃 그대로 사용 |

---

## 4. 구현 상세

### 4.1 shared/constants/legal.ts

```typescript
// 법률 페이지 운영 상수
// PA-20에서 관리자 앱 DB 기반으로 전환 예정. MVP는 하드코딩.
export const PRIVACY_CONTACT_EMAIL = "privacy@essenly.com";
export const DATA_RETENTION_DAYS = 90;
export const DELETION_PROCESSING_DAYS = 3;
export const LEGAL_LAST_UPDATED = "2026-04-04";
```

**규칙 검증:**
- L-13 ✓: 순수 상수만, 런타임 부작용 없음
- L-16 ✓: types/ import 없음 (독립 상수)
- L-15 ✓: flat 구조, import 깊이 0
- N-6 ✓: SCREAMING_SNAKE_CASE

### 4.2 page.tsx (Server Component)

```typescript
// src/app/(user)/[locale]/(app)/terms/page.tsx
import { setRequestLocale } from "next-intl/server";
import TermsContent from "@/client/features/legal/TermsContent";

type Props = { params: Promise<{ locale: string }> };

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TermsContent locale={locale} />;
}
```

**패턴 일관성:** chat/page.tsx, onboarding/page.tsx, profile/page.tsx와 동일 구조.
**규칙 검증:**
- L-2 ✓: 조합만, 직접 로직 없음
- P-1 ✓: app/ → client/ 방향

### 4.3 TermsContent.tsx (Client Component)

```typescript
"use client";
import "client-only";
import { useTranslations } from "next-intl";
import { PageTitle, BodyText } from "@/client/ui/primitives/typography";
import { PRIVACY_CONTACT_EMAIL, DATA_RETENTION_DAYS, DELETION_PROCESSING_DAYS, LEGAL_LAST_UPDATED } from "@/shared/constants";

type TermsContentProps = { locale: string };

export default function TermsContent({ locale }: TermsContentProps) {
  const t = useTranslations("terms");
  // 섹션 렌더링: 서비스 개요, 이용 규칙, 면책 조항, 데이터 개요, 연락처
}
```

**규칙 검증:**
- L-0b ✓: `import "client-only"` 첫 줄
- R-1 ✓: server/ import 없음
- R-11 미적용 (features/ 컴포넌트이므로 R-5 범위): shared/ + ui/ import 허용
- L-12 ✓: Tailwind 기본=모바일
- Q-5 ✓: 200줄 이내 (정적 콘텐츠)
- S-5 ✓: 디자인 토큰만 사용, #hex 하드코딩 없음

### 4.4 PrivacyContent.tsx (Client Component)

TermsContent와 동일 패턴. Privacy 전용 섹션:
- 수집 데이터 범위 (PRD §4-C 기반)
- 보존 정책 (DATA_RETENTION_DAYS 상수 사용)
- 삭제 경로 3가지
- 연락처 (PRIVACY_CONTACT_EMAIL 상수 사용)
- Terms 페이지로 cross-link (`/${locale}/terms`)

### 4.5 messages/en.json 추가 네임스페이스

```json
"terms": {
  "title": "Terms of Service",
  "lastUpdated": "Last updated: {date}",
  "sections": { ... }
},
"privacy": {
  "title": "Privacy Policy",
  "lastUpdated": "Last updated: {date}",
  "sections": { ... }
}
```

> 법률 텍스트를 번역 키로 관리하여 v0.2 다국어 확장 대비.

---

## 5. 의존성 검증 (V-* 체크리스트)

| 검증 | 결과 | 근거 |
|------|------|------|
| V-1 의존성 방향 | ✓ | app/ → client/ → shared/ DAG 준수 |
| V-2 core 불변 | ✓ | core/ 파일 수정 없음 |
| V-3 Composition Root | ✓ | page.tsx가 조합 루트 (L-2) |
| V-4 features 독립 | ✓ | legal/ → 타 features/ import 없음 |
| V-5 콜 스택 ≤ 4 | ✓ | page → TermsContent (2단계) |
| V-6 바인딩 ≤ 4 | ✓ | page → Content → shared/constants (2단계, ui/ 제외) |
| V-7 beauty/ 순수 함수 | N/A | beauty/ 미사용 |
| V-8 beauty/ 단방향 | N/A | beauty/ 미사용 |
| V-9 중복 | ✓ | 기존 법률 관련 코드 없음 |
| V-10 불필요 코드 | ✓ | 모든 파일 사용됨. 패스스루 래퍼 없음 |
| V-11 is_highlighted | N/A | 미사용 |
| V-12 타입 안전 | ✓ | any 미사용 |
| V-13 디자인 토큰 | ✓ | Tailwind 시맨틱 토큰만 사용 |
| V-15 ui/ 순수성 | ✓ | ui/ 수정 없음. 기존 primitives 재사용만 |
| V-16 shared/ 단방향 | ✓ | legal.ts는 독립 상수 파일. 타 shared/ 모듈 import 없음 |
| V-17 제거 안전성 | ✓ | legal/ 폴더 + 라우트 삭제 시 빌드 에러 없음 (HeroSection href는 문자열 리터럴) |
| V-22 스키마 정합성 | N/A | DB 접근 없음 |

---

## 6. 독립성 검증

### 6.1 역참조 0건 확인 (P-10)

legal/ 모듈을 참조하는 외부 코드:
- `HeroSection.tsx:60`: `href={\`/${locale}/terms\`}` → 문자열 리터럴. import 아님. 삭제 시 404만 발생, 빌드 에러 없음.
- 그 외: 0건 (Grep 확인 완료)

### 6.2 수정 영향 분석 (G-15)

| 수정 파일 | 영향 범위 | 위험도 |
|-----------|----------|--------|
| `shared/constants/index.ts` | barrel re-export 추가. 기존 import `from "@/shared/constants"` 무영향 | 없음 |
| `messages/en.json` | 신규 키 추가만. 기존 `useTranslations()` 호출 무영향 | 없음 |

### 6.3 삭제 시 영향 (P-10 완전 검증)

`legal/` 폴더 + `terms/page.tsx` + `privacy/page.tsx` + `shared/constants/legal.ts` 전체 삭제 시:
- core/: 무영향 ✓
- 기존 features/: 무영향 ✓
- client/: 무영향 (HeroSection은 문자열 href만 — 404 발생하나 빌드 에러 아님) ✓
- shared/: `index.ts`에서 `export * from "./legal"` 제거 필요 (1줄) ✓

---

## 7. 구현 순서

| 단계 | 작업 | 파일 |
|------|------|------|
| 1 | shared/constants/legal.ts 생성 + index.ts 수정 | 2파일 |
| 2 | messages/en.json 번역 키 추가 | 1파일 |
| 3 | TermsContent.tsx 생성 | 1파일 |
| 4 | PrivacyContent.tsx 생성 | 1파일 |
| 5 | terms/page.tsx 생성 | 1파일 |
| 6 | privacy/page.tsx 생성 | 1파일 |
| 7 | 빌드 검증 (npx tsc --noEmit) | — |

총 신규 6파일 + 수정 2파일. core/ 수정 0건.
