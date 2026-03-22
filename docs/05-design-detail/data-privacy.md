# 데이터 프라이버시 설계 — P1-53 / P1-54

> 버전: 1.0
> 작성일: 2026-03-22
> 근거: PRD §4-C (정책 정본), schema.dbml, auth-matrix.md §5.3/§5.6
> 원칙: PRD §4-C = 정책 WHAT. 본 문서 = 구현 HOW만.

---

## 1. 동의 관리 구현 (P1-53)

### 1.1 정책 참조

> 동의 항목(5개), 수집 시점, 필수/선택 구분: **PRD §4-C** 참조.
> consent_records 테이블 구조(5개 boolean 플래그): **schema.dbml** 참조.
> 본 섹션은 구현 흐름만 기술한다.

### 1.2 동의 수집 구현 흐름

| 동의 항목 | 수집 시점 | API | 구현 |
|-----------|----------|-----|------|
| `data_retention` (필수) | Landing 배너 동의 시 | `POST /api/auth/anonymous` | 세션 생성과 동시에 consent_records INSERT |
| `marketing` (선택) | Kit CTA 이메일 제출 시 | `POST /api/kit/claim` | consent_records.marketing UPDATE |
| `location_tracking` | MVP 제외 | - | consent_records 기본값 false 유지 |
| `behavior_logging` | MVP 제외 | - | consent_records 기본값 false 유지 |
| `analytics` | MVP 제외 | - | consent_records 기본값 false 유지 |

**Landing → 세션 생성 흐름:**
```
1. Landing 하단 동의 배너 표시
2. 사용자 "동의" 클릭
3. 클라이언트: POST /api/auth/anonymous { consent: { data_retention: true } }
4. 서버: signInAnonymously() → users INSERT → consent_records INSERT
5. 응답: { user_id, session_token }
6. 클라이언트: session_token을 localStorage에 저장
```

**Kit CTA 마케팅 동의 흐름:**
```
1. 대화 중 Kit CTA 카드 표시
2. 사용자: 이메일 입력 + 마케팅 동의 체크박스 선택
3. 클라이언트: POST /api/kit/claim { email, marketing_consent: true }
4. 서버: consent_records.marketing = true UPDATE
```

### 1.3 동의 철회 (MVP)

> PRD §4-C: "수동 요청: 이용약관에 데이터 삭제 요청 연락처(이메일) 명시"
> "명시적 UI 삭제: v0.2에서 'Delete my data' 버튼 제공"

**MVP 처리 프로세스:**

| 단계 | 행위자 | 작업 |
|------|--------|------|
| 1 | 사용자 | 이용약관 명시 이메일로 삭제 요청 |
| 2 | 운영팀 | Kit CTA에서 수집한 이메일로 user 식별 |
| 3 | 운영팀 | 관리자 앱에서 해당 user 검색 → 삭제 실행 |
| 4 | 시스템 | `DELETE FROM users WHERE id = ?` (CASCADE) |
| 5 | 시스템 | audit_logs 기록: `action = 'manual_deletion'` |

**Kit CTA 미제출 사용자 (이메일 없음):**
- 식별 방법 없음 → 90일 자동 만료가 유일한 삭제 메커니즘
- 이용약관에 명시: "anonymous 사용자 데이터는 90일 비활동 시 자동 삭제됩니다"

**삭제 요청 이메일:** 이용약관에 `privacy@essenly.com` (또는 운영팀 결정 주소) 명시

**처리 기간:** 영업일 3일 이내

**v0.2:** 계정 사용자에게 프로필 화면 "Delete my data" 버튼 제공

---

## 2. 데이터 삭제 구현 (P1-54)

### 2.1 자동 90일 만료

> 정책: **PRD §4-C** 참조 — "비활동 90일 경과 시 사용자 데이터 자동 삭제"
> 기준 컬럼: **schema.dbml** `users.last_active` — "used for 90-day auto-expiry detection"

#### 구현: Vercel Cron Job

**vercel.json 설정:**
```json
{
  "crons": [{
    "path": "/api/cron/cleanup",
    "schedule": "0 3 * * *"
  }]
}
```

> 매일 03:00 UTC (한국시간 12:00) 실행. Vercel Hobby tier: 일 1회 지원, 10초 타임아웃.

**API Route 구현:**
```typescript
// app/api/cron/cleanup/route.ts
import 'server-only';
import { env } from '@/server/core/config';
import { createServiceClient } from '@/server/core/db';

const SYSTEM_ACCOUNT_ID = '00000000-0000-0000-0000-000000000000';
const BATCH_SIZE = 100;

export async function GET(req: Request) {
  // Vercel Cron 인증 검증
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const client = createServiceClient();

  // 1. 만료 대상 조회
  const { data: expiredUsers, error } = await client
    .from('users')
    .select('id')
    .eq('auth_method', 'anonymous')
    .lt('last_active', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[CRON_CLEANUP] Query failed:', error);
    return Response.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!expiredUsers || expiredUsers.length === 0) {
    return Response.json({ deleted: 0 });
  }

  // 2. 삭제 실행 (CASCADE로 관련 데이터 자동 삭제)
  const userIds = expiredUsers.map(u => u.id);
  const { error: deleteError } = await client
    .from('users')
    .delete()
    .in('id', userIds);

  if (deleteError) {
    console.error('[CRON_CLEANUP] Delete failed:', deleteError);
    return Response.json({ error: 'Delete failed' }, { status: 500 });
  }

  // 3. 감사 로그 기록 (개별 user_id)
  const auditEntries = userIds.map(userId => ({
    actor_id: SYSTEM_ACCOUNT_ID,
    action: 'auto_deletion',
    target_type: 'user',
    target_id: userId,
    changes: { reason: '90day_inactivity' },
  }));

  const { error: auditError } = await client
    .from('audit_logs')
    .insert(auditEntries);

  if (auditError) {
    // Q-7: 에러 불삼킴 — 로그 기록. 삭제는 이미 완료됨.
    console.error('[CRON_CLEANUP] Audit log failed:', auditError);
  }

  return Response.json({ deleted: userIds.length });
}
```

#### system 계정 시드

audit_logs.actor_id FK를 위한 시스템 계정:

```sql
-- 시드 SQL (마이그레이션 또는 초기화 스크립트)
INSERT INTO admin_users (id, email, name, role, permissions, status)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'system@essenly.internal',
  'System',
  'admin',
  '{}',
  'active'
) ON CONFLICT (id) DO NOTHING;
```

| 항목 | 값 | 근거 |
|------|---|------|
| id | 고정 UUID (0) | 코드에서 상수로 참조 |
| email | `system@essenly.internal` | Google SSO 로그인 불가 (.internal 도메인) |
| role | `admin` | CHECK 제약 호환 (super_admin/admin) |
| permissions | `{}` (빈 객체) | 어떤 엔티티에도 접근 불가 |

**관리자 목록에서 제외:**
```typescript
// 관리자 목록 API에서 system 계정 필터링
query.neq('id', SYSTEM_ACCOUNT_ID);
```

#### 타임아웃 안전장치

- `BATCH_SIZE = 100`: 한 번에 최대 100명 삭제
- MVP 예상: 비활동 사용자 ~10~50명 → 1회 실행으로 충분
- 100명 × (DELETE + CASCADE 9테이블) ≈ 5초 < 10초 타임아웃
- 100명 초과 시: 다음 날 cron에서 나머지 처리 (멱등)
- Phase 2 부하 테스트에서 실제 타이밍 검증 권장. 지연 시 BATCH_SIZE를 50으로 축소

#### last_active 갱신 시점

```typescript
// server/core/auth.ts — authenticateUser 내부
async function authenticateUser(req: Request): Promise<AuthenticatedUser> {
  // ... 기존 인증 로직 ...

  // 비동기 last_active 갱신 (응답 차단하지 않음)
  const serviceClient = createServiceClient();
  serviceClient
    .from('users')
    .update({ last_active: new Date().toISOString() })
    .eq('id', user.id)
    .then(() => {}) // fire-and-forget
    .catch(err => console.error('[LAST_ACTIVE] Update failed:', err));

  return { id: user.id, token };
}
```

> 모든 인증 필수 API 호출 시 갱신. 비동기 처리로 응답 지연 없음.

### 2.2 수동 삭제 요청 처리

| 단계 | 행위자 | 작업 | 비고 |
|------|--------|------|------|
| 1 | 사용자 | 이용약관 명시 이메일로 삭제 요청 발송 | 이메일 주소 이용약관에 명시 |
| 2 | 운영팀 | 이메일 → users/consent_records에서 사용자 식별 | Kit CTA 이메일로 매칭 |
| 3 | 운영팀 | 관리자 앱에서 DELETE 실행 | `DELETE FROM users WHERE id = ?` |
| 4 | 시스템 | CASCADE 삭제 + audit_logs 기록 | `action = 'manual_deletion'`, actor_id = 요청 처리 admin |
| 5 | 운영팀 | 삭제 완료 이메일 회신 | v0.2: 자동 발송 |

**식별 불가 사용자:** 90일 자동 만료 안내

### 2.3 재방문 불가 사용자 처리

90일 만료 후 해당 anonymous UUID로 접근 시:

```
1. 클라이언트: localStorage에서 session_token 복구 시도
2. Supabase SDK: refresh_token 만료 → SIGNED_OUT 이벤트
   (auth-matrix.md §5.3 참조)
3. 클라이언트: POST /api/auth/anonymous 재호출 → 새 user_id 발급
4. 결과: 완전한 신규 사용자로 취급 (Landing → 온보딩)
5. 이전 데이터: DB에서 CASCADE 삭제됨 → 접근 불가
```

> 사용자에게 "이전 데이터 복구 불가" 알림 없음 (anonymous 특성상 자연스러움).
> v0.2 계정 사용자는 데이터 영구 보존 (자동 만료 미적용).

### 2.4 삭제 범위 (CASCADE 체인)

| 순서 | 테이블 | FK 관계 | ON DELETE |
|------|--------|---------|-----------|
| 0 | **users** (삭제 대상) | - | - |
| 1 | user_profiles | user_id → users.id | CASCADE |
| 2 | journeys | user_id → users.id | CASCADE |
| 3 | conversations | user_id → users.id | CASCADE |
| 4 | messages | conversation_id → conversations.id | CASCADE (연쇄) |
| 5 | beauty_history | user_id → users.id | CASCADE |
| 6 | learned_preferences | user_id → users.id | CASCADE |
| 7 | behavior_logs | user_id → users.id | CASCADE |
| 8 | consent_records | user_id → users.id | CASCADE |

> conversations.journey_id → journeys.id: ON DELETE SET NULL (journey 삭제 시 conversation은 유지하나, user 삭제 시 conversation도 CASCADE로 삭제되므로 무관).
