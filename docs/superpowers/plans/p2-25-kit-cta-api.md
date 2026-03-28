# P2-25: Kit CTA API 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/kit/claim` — Kit CTA 이메일 수집 + 마케팅 동의. MVP 수익 전환 포인트 (PRD §2.3 키트 판매).

**Architecture:** 3단계 구현: (1) migration `008_kit_subscribers.sql` (schema.dbml:209-224), (2) `core/crypto.ts` AES-256-GCM + SHA-256 (L-4 승인, L-5 비즈니스 무관), (3) `app/api/kit/route.ts` thin route.

**Tech Stack:** Node.js crypto (내장), Supabase, Zod, Next.js App Router

---

## 설계 교차 검증 (G-14)

| 확인 항목 | 원문 | 결과 |
|----------|------|------|
| kit_subscribers 테이블 | schema.dbml:209-224 | migration 미반영. 005_indexes에서 예고 (line 14-15) |
| email_encrypted AES-256 | schema.dbml:213 note | NOT NULL. Node.js crypto 내장으로 구현 |
| email_hash SHA-256 UNIQUE | schema.dbml:214, 220 | 중복 제출 방지 + K4 KPI |
| consent_records.marketing UPDATE | api-spec.md §2.5, data-privacy.md line 43 | 동의 기록 |
| rate limit | api-spec.md §4.1 line 478 | GET /api/* 60/분 공유 |
| kit_cta_submit 행동 로그 | ANALYTICS.md §3.2 line 178 | P2-26 behavior 서비스에서 처리. P2-25 범위 아님 |
| Q-14 스키마 정본 | CLAUDE.md Q-14 | schema.dbml 기반 migration + 검증 구현 |

## 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `supabase/migrations/008_kit_subscribers.sql` | 신규 | CREATE TABLE + RLS + index + GRANT |
| `src/server/core/crypto.ts` | 신규 (**L-4 승인**) | encrypt/decrypt (AES-256-GCM) + hash (SHA-256). 비즈니스 무관 (L-5) |
| `src/server/core/crypto.test.ts` | 신규 | 암호화 유틸 테스트 |
| `src/app/api/kit/claim/route.ts` | 신규 | POST /api/kit/claim handler |
| `src/app/api/kit/claim/route.test.ts` | 신규 | route 테스트 |

---

## Task 1: migration `008_kit_subscribers.sql`

- [ ] **Step 1: migration 작성**

```sql
-- ============================================================
-- Migration 008: kit_subscribers 테이블 생성
-- schema.dbml:209-224. Kit CTA 이메일 수집 (PRD §3.6).
-- 005_indexes.sql에서 예고: "kit_subscribers CREATE TABLE 마이그레이션 시 인덱스도 함께 추가"
-- ============================================================

CREATE TABLE IF NOT EXISTS kit_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  email_encrypted TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  locale TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 중복 제출 방지 (schema.dbml:220)
CREATE UNIQUE INDEX IF NOT EXISTS idx_kit_subscribers_email_hash
  ON kit_subscribers(email_hash);

-- RLS
ALTER TABLE kit_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own kit subscriptions" ON kit_subscribers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own kit subscriptions" ON kit_subscribers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- GRANT
GRANT SELECT, INSERT ON kit_subscribers TO authenticated;
GRANT ALL ON kit_subscribers TO service_role;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Commit**

---

## Task 2: `core/crypto.ts` — AES-256-GCM + SHA-256

> **L-4 승인 필요**: core/ 신규 파일. L-5: 비즈니스 용어 없음 (encrypt/decrypt/hash만).

- [ ] **Step 1: crypto.ts 작성**

```typescript
import 'server-only';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { env } from './config';

// ============================================================
// 암호화 유틸 — schema.dbml kit_subscribers: AES-256 + SHA-256
// L-5: 비즈니스 무관. K-뷰티 용어 없음.
// L-4: core/ 신규 파일 (승인 완료).
// G-9: export 3개 (encrypt, decrypt, hash).
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * AES-256-GCM 암호화.
 * @returns `iv:authTag:ciphertext` (hex 인코딩, : 구분)
 */
export function encrypt(plaintext: string): string {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM 복호화.
 * @param ciphertext `iv:authTag:encrypted` 형식
 */
export function decrypt(ciphertext: string): string {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * SHA-256 해시. 중복 체크용 (복호화 불가).
 */
export function hash(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
```

- [ ] **Step 2: crypto.test.ts 작성**

4개 테스트:
1. encrypt → decrypt 라운드트립
2. 같은 입력 → 다른 암호문 (IV 랜덤)
3. hash 결정론적 (같은 입력 → 같은 해시)
4. 잘못된 암호문 → decrypt 에러

- [ ] **Step 3: core/config.ts에 ENCRYPTION_KEY 추가 (L-4)**

envSchema에 추가: `ENCRYPTION_KEY: z.string().length(64)` (32바이트 AES-256 키의 hex 인코딩 = 64문자).
env 객체에도 추가. `.env.local`에 테스트용 키 생성: `openssl rand -hex 32`.

- [ ] **Step 4: Commit**

---

## Task 3: `app/api/kit/route.ts` — POST handler

- [ ] **Step 1: route.ts 작성**

```typescript
import 'server-only';
import { z } from 'zod';
import { authenticateUser } from '@/server/core/auth';
import { createAuthenticatedClient } from '@/server/core/db';
import { checkRateLimit } from '@/server/core/rate-limit';
import { encrypt, hash } from '@/server/core/crypto';

// ============================================================
// POST /api/kit/claim — api-spec.md §2.5
// L-1: thin route. P-4: Composition Root.
// schema.dbml kit_subscribers: email_encrypted + email_hash.
// data-privacy.md §1.2: consent_records.marketing UPDATE.
// Q-12: email_hash UNIQUE → 멱등성 (중복 제출 시 409).
// ============================================================

const kitClaimSchema = z.object({
  email: z.string().email().max(320),
  marketing_consent: z.boolean(),
});

const RATE_LIMIT_CONFIG = { limit: 60, windowMs: 60 * 1000, window: 'minute' } as const;

export async function POST(req: Request) {
  // 1. 인증
  let user;
  try {
    user = await authenticateUser(req);
  } catch {
    return Response.json(
      { error: { code: 'AUTH_REQUIRED', message: 'Authentication is required', details: null } },
      { status: 401 },
    );
  }

  // 2. Rate limit
  const rateResult = checkRateLimit(user.id, 'public', RATE_LIMIT_CONFIG);
  if (!rateResult.allowed) {
    const retryAfter = Math.ceil((rateResult.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: `Too many requests. Try again in ${retryAfter}s.`, details: { retryAfter } } },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // 3. 입력 검증 (Q-1)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: 'Invalid JSON body', details: null } },
      { status: 400 },
    );
  }

  const parsed = kitClaimSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? 'Validation failed', details: null } },
      { status: 400 },
    );
  }

  // 4. 이메일 암호화 + 해시
  const emailEncrypted = encrypt(parsed.data.email);
  const emailHash = hash(parsed.data.email.toLowerCase().trim());

  // 5. DB 저장
  const client = createAuthenticatedClient(user.token);

  try {
    // kit_subscribers INSERT (Q-12: email_hash UNIQUE → 중복 시 에러)
    const { error: insertError } = await client
      .from('kit_subscribers')
      .insert({
        user_id: user.id,
        email_encrypted: emailEncrypted,
        email_hash: emailHash,
        marketing_consent: parsed.data.marketing_consent,
      });

    if (insertError) {
      // UNIQUE 제약 위반 = 중복 제출
      if (insertError.code === '23505') {
        return Response.json(
          { error: { code: 'KIT_ALREADY_CLAIMED', message: 'Kit already claimed with this email', details: null } },
          { status: 409 },
        );
      }
      throw insertError;
    }

    // consent_records.marketing UPDATE (data-privacy.md §1.2)
    // Q-15: consent UPDATE는 kit 등록의 부수 효과. 실패해도 kit 등록은 유효.
    if (parsed.data.marketing_consent) {
      const { error: consentError } = await client
        .from('consent_records')
        .update({ marketing: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (consentError) {
        console.error('[kit/claim] consent update failed', String(consentError));
        // Q-15: 실패 로그만. kit 등록 성공 응답은 유지.
      }
    }

    return Response.json(
      { data: { status: 'claimed' } },
      { status: 201 },
    );
  } catch (error) {
    console.error('[kit/claim] failed', String(error));
    return Response.json(
      { error: { code: 'KIT_CLAIM_FAILED', message: 'Failed to process kit claim', details: null } },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: route.test.ts 작성**

7개 테스트:
1. 인증 실패 → 401
2. rate limit → 429
3. 잘못된 이메일 → 400
4. 정상 요청 → 201 claimed + encrypt/hash 호출 확인
5. 중복 이메일 (23505) → 409 KIT_ALREADY_CLAIMED
6. marketing_consent true → consent_records UPDATE 호출
7. DB 에러 → 500

- [ ] **Step 3: 테스트 실행**
- [ ] **Step 4: 전체 테스트 실행**
- [ ] **Step 5: Commit**

---

## 검증 체크리스트

### 아키텍처

```
[ ] L-0a server-only 첫줄 (route.ts + crypto.ts)
[ ] L-1  thin route: 인증→검증→암호화→INSERT→응답
[ ] L-4  core/ 신규 파일 (crypto.ts) 승인
[ ] L-5  crypto.ts에 K-뷰티 비즈니스 용어 없음
[ ] V-1  import: route → core/ ONLY
[ ] V-22 스키마 정합성: kit_subscribers 컬럼이 schema.dbml과 일치
[ ] V-23 설계 교차 검증: migration 필요성 = schema.dbml 정의 + 005 예고 (이슈 아닌 구현 범위)
```

### 품질

```
[ ] Q-1  zod 검증 (kitClaimSchema)
[ ] Q-7  에러 불삼킴: catch console.error
[ ] Q-8  env: ENCRYPTION_KEY core/config 경유
[ ] Q-12 멱등성: email_hash UNIQUE → 중복 409
[ ] Q-14 스키마 정합성: NOT NULL, UNIQUE 제약 반영
[ ] G-4  미사용 import 없음
[ ] G-10 상수
```
