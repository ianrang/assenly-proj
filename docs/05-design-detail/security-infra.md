# 보안 인프라 설계 — P1-50 / P1-51 / P1-52

> 버전: 1.0
> 작성일: 2026-03-22
> 근거: CLAUDE.md Q-1/Q-8/L-13/L-14, api-spec.md, auth-matrix.md, 7.2-ADMIN §7.2.6
> 원칙: 기존 문서의 "구현 HOW"만 기술. 정책/규칙 WHAT는 참조.

---

## 1. 환경 변수 관리 (P1-51)

### 1.1 전체 변수 목록

> ⚠️ L-4: core/config.ts 설계이므로 사용자 승인 필요.

| 변수명 | 필수 | 구분 | 타입 | 설명 |
|--------|------|------|------|------|
| **DB** | | | | |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | 공개 | URL | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 공개 | string | Supabase anon key (RLS 적용) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 서버 | string | Supabase service_role key (RLS 우회) |
| **AI** | | | | |
| `AI_PROVIDER` | ✅ | 서버 | enum | `anthropic` / `google` / `openai` |
| `AI_MODEL` | ❌ | 서버 | string | 기본: 프로바이더별 기본 모델 |
| `ANTHROPIC_API_KEY` | 조건 | 서버 | string | AI_PROVIDER=anthropic 시 필수 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 조건 | 서버 | string | AI_PROVIDER=google 또는 임베딩 시 필수 |
| `OPENAI_API_KEY` | 조건 | 서버 | string | AI_PROVIDER=openai 시 필수 |
| `EMBEDDING_PROVIDER` | ❌ | 서버 | enum | `google` / `voyage` / `openai`. 기본: `google` |
| `EMBEDDING_DIMENSION` | ❌ | 서버 | number | 기본: `1024` |
| **Admin Auth** | | | | |
| `ADMIN_JWT_SECRET` | ✅ | 서버 | string | 최소 32바이트 (auth-matrix.md §5.1) |
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ | 서버 | string | Google Workspace SSO |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ | 서버 | string | Google Workspace SSO |
| **Rate Limit** | | | | |
| `RATE_LIMIT_CHAT_PER_MIN` | ❌ | 서버 | number | 기본: `5` (api-spec §4.1) |
| `RATE_LIMIT_CHAT_PER_DAY` | ❌ | 서버 | number | 기본: `100` |
| `RATE_LIMIT_PUBLIC_PER_MIN` | ❌ | 서버 | number | 기본: `60` |
| `RATE_LIMIT_ANON_CREATE_PER_MIN` | ❌ | 서버 | number | 기본: `3` |
| **Cron** | | | | |
| `CRON_SECRET` | ✅ | 서버 | string | Vercel Cron Job 인증 토큰 |
| **App** | | | | |
| `NEXT_PUBLIC_APP_URL` | ✅ | 공개 | URL | 앱 기본 URL |
| `NODE_ENV` | ✅ | 서버 | enum | `development` / `production` / `test` |

### 1.2 서버 전용 vs 클라이언트 공개

| 구분 | 접두사 | 변수 | 노출 범위 |
|------|--------|------|----------|
| 공개 | `NEXT_PUBLIC_` | SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL | 클라이언트 번들에 포함 |
| 서버 | (접두사 없음) | 나머지 전부 | 서버 런타임에서만 접근 |

> 서버 전용 변수는 `import 'server-only'` 파일에서만 사용 (L-0a 강제).

### 1.3 런타임 검증 스키마

```typescript
// server/core/config.ts — Q-8 준수
import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  // DB
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // AI — 프로바이더별 조건부 필수
  AI_PROVIDER: z.enum(['anthropic', 'google', 'openai']),
  AI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(['google', 'voyage', 'openai']).default('google'),
  EMBEDDING_DIMENSION: z.coerce.number().default(1024),

  // Admin Auth
  ADMIN_JWT_SECRET: z.string().min(32),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),

  // Rate Limit — 기본값 포함
  RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().default(5),
  RATE_LIMIT_CHAT_PER_DAY: z.coerce.number().default(100),
  RATE_LIMIT_PUBLIC_PER_MIN: z.coerce.number().default(60),
  RATE_LIMIT_ANON_CREATE_PER_MIN: z.coerce.number().default(3),

  // Cron
  CRON_SECRET: z.string().min(1),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
});

// 서버 시작 시 1회 검증. 실패 시 프로세스 종료.
export const env = envSchema.parse(process.env);
```

> AI_PROVIDER별 API 키 조건부 필수 검증은 `.refine()` 또는 `.superRefine()`으로 구현.
> `process.env` 직접 접근은 이 파일에서만. 다른 모든 파일은 `env.VARIABLE_NAME`으로 접근 (Q-8).

### 1.4 환경별 분기

| 환경 | NODE_ENV | Supabase | AI | 비고 |
|------|----------|----------|---|------|
| 로컬 (dev) | development | 개발 프로젝트 | Gemini (무료) | `.env.local` |
| 스테이징 (preview) | production | 개발 프로젝트 | Gemini | Vercel Preview |
| 프로덕션 | production | 프로덕션 프로젝트 | Claude Sonnet | Vercel Production |

---

## 2. API 입력 검증 (P1-50)

### 2.1 검증 파일 구조

> L-13: shared/ = 순수 타입/상수만. zod 스키마(런타임 검증 함수)는 features/에 배치.
> L-14: 모듈 내부 전용 타입은 해당 모듈에 선언.

```
src/
├── shared/
│   ├── types/          # TypeScript 순수 타입만 (interface, type)
│   │   ├── domain.ts   # Product, Store, Treatment 등
│   │   ├── api.ts      # ApiResponse, PaginationMeta 등
│   │   └── profile.ts  # UserProfile, Journey 등
│   └── constants/
│       └── beauty.ts   # MAX_CONCERNS, ALLOWED_SKIN_TYPES 등 (검증에서 참조)
│
└── server/features/
    ├── validators/
    │   └── common.ts           # 공통 zod 패턴 (아래 §2.2)
    ├── profile/
    │   └── schema.ts           # profileOnboardingSchema, profileUpdateSchema
    ├── journey/
    │   └── schema.ts           # journeyCreateSchema
    ├── chat/
    │   └── schema.ts           # chatMessageSchema
    ├── kit/
    │   └── schema.ts           # kitClaimSchema
    └── admin/
        └── schemas/
            ├── product.ts      # productCreateSchema, productUpdateSchema
            ├── store.ts
            ├── clinic.ts
            ├── treatment.ts
            ├── brand.ts
            ├── ingredient.ts
            ├── doctor.ts
            ├── relation.ts     # relationConnectSchema
            └── highlight.ts    # highlightUpdateSchema
```

### 2.2 공통 검증 패턴 (features/validators/common.ts)

```typescript
import 'server-only';
import { z } from 'zod';
import {
  ALLOWED_SKIN_TYPES, ALLOWED_CONCERNS, ALLOWED_LANGUAGES,
} from '@/shared/constants/beauty';

// 다국어 텍스트 (7.2-ADMIN §7.2.6 DV-C1~C3 구현)
export const localizedTextRequired = z.object({
  ko: z.string().min(1),
  en: z.string().min(1),
  ja: z.string().optional(),
  zh: z.string().optional(),
  es: z.string().optional(),
  fr: z.string().optional(),
});

export const localizedTextOptional = localizedTextRequired.partial();

// 배열 필터 파싱 (쿼리 파라미터 "dry,oily" → ['dry', 'oily'])
export const commaSeparatedArray = z.string().transform(s => s.split(',').filter(Boolean));

// 페이지네이션 (api-spec §1.4 참조)
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// 사용자 API 페이지네이션
export const limitOffsetSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

// enum 검증 (schema.dbml enum 값 기반)
export const skinTypeEnum = z.enum(ALLOWED_SKIN_TYPES);
export const concernsEnum = z.enum(ALLOWED_CONCERNS);
```

### 2.3 검증 실패 → 에러 응답 변환

> 에러 응답 형식: api-spec §1.2~1.3 참조 (재정의하지 않음).

```typescript
// features/validators/common.ts — 검증 유틸 함수

export async function validateBody<T>(req: Request, schema: z.Schema<T>): Promise<T> {
  const body = await req.json();
  const result = schema.safeParse(body);
  if (!result.success) {
    // Q-7: 에러 로깅 후 throw (불삼킴 방지)
    console.warn('[VALIDATION]', result.error.issues);
    throw new ValidationError('VALIDATION_FAILED', 400, {
      fields: result.error.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  return result.data;
}

export function validateQuery<T>(url: URL, schema: z.Schema<T>): T {
  const params = Object.fromEntries(url.searchParams);
  const result = schema.safeParse(params);
  if (!result.success) {
    console.warn('[VALIDATION]', result.error.issues);
    throw new ValidationError('VALIDATION_FAILED', 400, {
      fields: result.error.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  return result.data;
}
```

> `ValidationError`는 api-spec §1.2~1.3 에러 응답 형식으로 직렬화된다. Route handler의 catch 블록에서 `errorResponse(e)` 호출 시 `{ error: { code, message, details } }` 형태로 변환.

### 2.4 이미지 업로드 검증

> 요구사항: 7.2-ADMIN §7.2.5 참조 (재서술하지 않음). 구현 방법만.

```typescript
// features/validators/common.ts — 이미지 검증
// 상수는 shared/constants/에 정의 (G-10: 매직 넘버 금지)
import { MAX_IMAGE_SIZE, MAX_IMAGE_COUNT, MIN_IMAGE_COUNT } from '@/shared/constants/beauty';

const IMAGE_MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
};

// 아래 상수는 shared/constants/beauty.ts에 정의
// MAX_IMAGE_SIZE = 5 * 1024 * 1024 (5MB)
// MAX_IMAGE_COUNT = 10
// MIN_IMAGE_COUNT = 1

export function validateImageType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);
  for (const [mime, magic] of Object.entries(IMAGE_MAGIC_BYTES)) {
    if (magic.every((b, i) => bytes[i] === b)) return mime;
  }
  return null; // 허용되지 않는 형식
}
```

### 2.5 SQL Injection 방지

- Supabase JS 클라이언트: 모든 쿼리가 **파라미터화** 처리됨 — SQL injection 자동 방지
- 정렬 필드: `applySort()` 허용 목록으로 검증 (search-engine.md §2.2 참조)
- 텍스트 검색: Supabase `.ilike()` 메서드가 이스케이프 처리

---

## 3. 보안 헤더 (P1-52)

### 3.1 CORS 정책

| 상황 | 정책 |
|------|------|
| 사용자 앱 → API | Same-origin (Next.js 내부) — CORS 불필요 |
| 관리자 앱 → API | Same-origin — CORS 불필요 |
| 외부 → API | 차단 (기본) |
| 클라이언트 → Supabase | Supabase SDK가 자동 처리 |

> MVP: 단일 도메인 배포 (Vercel). cross-origin 요청 없음.
> v0.2: 별도 도메인 시 CORS 허용 목록 추가.

### 3.2 CSP 규칙

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' https://*.supabase.co data:;
connect-src 'self' https://*.supabase.co https://accounts.google.com;
font-src 'self';
frame-src https://accounts.google.com;
```

| 도메인 | 용도 | 지시문 |
|--------|------|--------|
| `*.supabase.co` | DB API + Storage CDN | `connect-src`, `img-src` |
| `accounts.google.com` | Admin Google SSO | `connect-src`, `frame-src` |

> `unsafe-inline`/`unsafe-eval`: Next.js 개발 모드 필요. 프로덕션에서는 nonce 기반으로 강화 검토 (v0.2).

### 3.3 기타 보안 헤더

| 헤더 | 값 | 목적 |
|------|---|------|
| `X-Content-Type-Options` | `nosniff` | MIME 스니핑 방지 |
| `X-Frame-Options` | `DENY` | 클릭재킹 방지 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer 정보 제한 |
| `X-DNS-Prefetch-Control` | `on` | DNS 프리페치 허용 |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | HTTPS 강제 |

> Vercel은 `X-Content-Type-Options`, `X-Frame-Options`를 기본 제공. 추가 헤더만 설정.

### 3.4 next.config.ts 설정

```typescript
// next.config.ts
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; ..." },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```
