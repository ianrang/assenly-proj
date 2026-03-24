# P2-10: 프로필 서비스 + API 구현 계획

> 상태: 검토 대기
> 선행: P2-9 (Anonymous 인증) 완료
> 근거: api-spec.md §2.3, auth-matrix.md §2.1/§3.3, schema.dbml user_profiles/journeys

---

## 목적

온보딩 4단계 데이터(UP 4개 + JC 5개)를 DB에 저장하고, 프로필 조회/수정 API를 제공한다.
재방문 감지(GET → 200/404)의 기반이 되며, P2-12(뷰티 판단), P2-19(채팅 개인화)의 전제 조건.

---

## 범위

### 포함

| 파일 | 작업 | 비고 |
|------|------|------|
| `features/profile/service.ts` | skeleton → 구현 | upsertProfile, getProfile, updateProfile |
| `features/journey/service.ts` | skeleton → 구현 | createOrUpdateJourney + getActiveJourney (2개 함수) |
| `app/api/profile/onboarding/route.ts` | skeleton → 구현 | POST |
| `app/api/profile/route.ts` | skeleton → 구현 | GET + PUT |
| `features/profile/service.test.ts` | 신규 | profile service 단위 테스트 |
| `features/journey/service.test.ts` | 신규 | journey service 단위 테스트 |
| `app/api/profile/onboarding/route.test.ts` | 신규 | onboarding route 테스트 |
| `app/api/profile/route.test.ts` | 신규 | GET + PUT route 테스트 |

### 미포함

| 파일 | 이유 |
|------|------|
| `app/api/profile/beauty/route.ts` (DV-4) | P2-15 DV 계산기 의존 |
| `app/api/journey/route.ts` (POST 새 여정) | v0.2 다중 여정 |
| `app/api/journey/active` (GET 활성 여정) | P2-11 |
| `POST /api/journey` route, `GET /api/journey/active` route | P2-11 범위 |

---

## 의존성

### 사용하는 기존 모듈 (수정 없음)

| 모듈 | 용도 | 수정 |
|------|------|------|
| `core/auth.ts` | authenticateUser(req) → { id, token } | 없음 |
| `core/db.ts` | createAuthenticatedClient(token) → RLS 적용 | 없음 |
| `core/rate-limit.ts` | checkRateLimit(userId, endpoint, config) | 없음 |
| `core/config.ts` | env (간접 — db.ts, auth.ts 경유) | 없음 |
| `shared/types/profile.ts` | UserProfile, Journey, OnboardingFormData 타입 | 없음 |
| `shared/types/domain.ts` | SkinType, HairType 등 열거 타입 | 없음 |

### 의존 방향 검증

```
app/api/profile/onboarding/route.ts
  → core/auth.ts (authenticateUser)
  → core/db.ts (createAuthenticatedClient)
  → core/rate-limit.ts (checkRateLimit)
  → features/profile/service.ts (upsertProfile)
  → features/journey/service.ts (createOrUpdateJourney)
  → shared/types/ (타입 import)

app/api/profile/route.ts
  → core/auth.ts
  → core/db.ts
  → core/rate-limit.ts
  → features/profile/service.ts (getProfile, updateProfile)
  → features/journey/service.ts (getActiveJourney)
  → shared/types/

features/profile/service.ts
  → shared/types/ (타입 import)
  ✗ core/ import 없음 (client를 파라미터로 수신)
  ✗ features/journey/ import 없음 (P-4, R-9)

features/journey/service.ts
  → shared/types/ (타입 import)
  ✗ core/ import 없음 (client를 파라미터로 수신)
  ✗ features/profile/ import 없음 (P-4, R-9)
```

순환 참조 없음. profile ↛ journey, journey ↛ profile. 양방향 모두 route에서만 호출.

---

## 설계 결정

### D-1. Composition Root 패턴 (P-4)

onboarding route에서 두 service를 순차 호출. service 간 직접 import 금지.

```
POST /api/profile/onboarding (route = Composition Root)
  → authenticateUser(req)
  → createAuthenticatedClient(token)
  → zod 검증
  → profileService.upsertProfile(client, userId, profileData)    ← await ①
  → journeyService.createOrUpdateJourney(client, userId, journeyData)  ← await ②
  → 201 응답
```

GET /api/profile도 동일 패턴:
```
GET /api/profile (route = Composition Root)
  → authenticateUser(req)
  → createAuthenticatedClient(token)
  → profileService.getProfile(client, userId)           ← domain A
  → journeyService.getActiveJourney(client, userId)     ← domain B
  → 합성하여 200 응답 (profile 없으면 404)
```

L-1 준수: route는 DB를 직접 호출하지 않고 service 경유. 두 도메인 합성만 route 책임.

### D-2. 복합 쓰기 전략 (Q-11, Q-12, Q-13)

**onboarding = 2테이블 동기 순차 쓰기:**

| 단계 | 테이블 | 연산 | 멱등성 |
|------|--------|------|--------|
| ① | user_profiles | UPSERT (PK = user_id) | 재시도 시 덮어쓰기 → 멱등 |
| ② | journeys | SELECT 확인 → UPDATE 또는 INSERT | 재시도 시 기존 여정 UPDATE → 멱등 |

**② 실패 시:** 에러 응답 반환. ①의 profile은 남지만, 재시도 시 UPSERT로 정상 덮어쓰기. 부분 성공 응답 반환하지 않음 (Q-11).

**journey 멱등성 (Q-12) — 전략 (a):**
```typescript
// journey service 내부
const { data: existing } = await client
  .from('journeys')
  .select('id')
  .eq('user_id', userId)
  .eq('status', 'active')
  .limit(1)
  .single();

if (existing) {
  // UPDATE 기존 활성 여정
  await client.from('journeys').update(journeyData).eq('id', existing.id);
  return existing.id;
} else {
  // INSERT 새 여정
  const { data } = await client.from('journeys').insert({ user_id: userId, ...journeyData }).select('id').single();
  return data.id;
}
```

**근거:** 재시도 시 중복 journey 미생성, 기존 journey_id 보존 (conversations FK 안전).

### D-3. end_date 서버 계산 (api-spec B.4)

```typescript
// journey service 내부
const end_date = start_date && stay_days
  ? addDays(new Date(start_date), stay_days).toISOString().split('T')[0]
  : null;
```

클라이언트 요청에 end_date 미포함. zod 스키마에서 제외.

### D-4. GET /api/profile 응답 분기

| 상태 | 응답 | 용도 |
|------|------|------|
| profile 존재 | 200 `{ data: { profile, active_journey } }` | 재방문 감지 |
| profile 미존재 | 404 `{ error: { code: 'PROFILE_NOT_FOUND' } }` | 신규/미완료 |
| 인증 실패 | 401 | 세션 만료 |

**보안:** URL에 user_id 없음 (토큰에서 추출). RLS `auth.uid() = user_id`로 본인만 조회. 타인 프로필 열거 불가.

### D-5. PUT /api/profile 부분 업데이트

```typescript
const updateSchema = z.object({
  skin_type: z.enum([...]).optional(),
  hair_type: z.enum([...]).optional(),
  hair_concerns: z.array(z.enum([...])).optional(),
  country: z.string().min(2).max(2).optional(),
  language: z.enum([...]).optional(),  // NOT NULL → 빈 문자열/null 불가
  age_range: z.enum([...]).optional(),
}).refine(obj => Object.keys(obj).length > 0, {
  message: 'At least one field is required',
});
```

**Q-14 스키마 정합성:** language는 DB NOT NULL이므로 null 전송 불가. 나머지는 nullable.

### D-6. Rate Limit

| 엔드포인트 | 제한 | 식별 | 근거 |
|-----------|------|------|------|
| POST /api/profile/onboarding | 60회/분 | user_id | api-spec §4.1 사용자 읽기/쓰기 공통 |
| GET /api/profile | 60회/분 | user_id | api-spec §4.1 |
| PUT /api/profile | 60회/분 | user_id | api-spec §4.1 |

### D-7. 에러 코드

| 상황 | code | status |
|------|------|--------|
| 인증 실패 | AUTH_REQUIRED / AUTH_INVALID_TOKEN | 401 |
| 검증 실패 | VALIDATION_FAILED | 400 |
| 프로필 미존재 (GET) | PROFILE_NOT_FOUND | 404 |
| Rate limit | RATE_LIMIT_EXCEEDED | 429 |
| 서비스 에러 | PROFILE_CREATION_FAILED / PROFILE_UPDATE_FAILED | 500 |

모든 에러 응답: `{ error: { code, message, details } }` (api-spec §1.1).
DB/내부 에러 메시지 노출 금지.

---

## 구현 순서

### Task 1: features/profile/service.ts + 테스트

**1-1. service.ts 구현**

```typescript
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// 3개 함수 export:
// - upsertProfile(client, userId, data) → void
// - getProfile(client, userId) → UserProfile | null
// - updateProfile(client, userId, data) → void
```

- client를 파라미터로 수신 (P-4: route에서 생성하여 전달)
- shared/types/profile.ts 타입 사용
- DB 에러 시 제네릭 메시지로 throw (내부 메시지 노출 금지)
- updated_at은 DB default (now()) 또는 명시적 갱신

**1-2. service.test.ts 작성**

| 테스트 | 검증 |
|--------|------|
| upsertProfile 정상 | UPSERT 호출, 데이터 전달 확인 |
| upsertProfile 실패 | DB 에러 시 throw, 내부 메시지 미노출 |
| getProfile 존재 | 정상 반환 |
| getProfile 미존재 | null 반환 |
| updateProfile 정상 | UPDATE 호출, 부분 필드만 전달 |
| updateProfile 실패 | DB 에러 시 throw |

### Task 2: features/journey/service.ts + 테스트

**2-1. service.ts 구현**

```typescript
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// 2개 함수 export:
// - createOrUpdateJourney(client, userId, data) → { journeyId: string }
// - getActiveJourney(client, userId) → Journey | null
```

- SELECT 확인 → 활성 여정 존재 시 UPDATE, 없으면 INSERT (Q-12 멱등성)
- end_date = start_date + stay_days 서버 계산 (api-spec B.4)
- journey.country = 'KR', city = 'seoul' (MVP 고정, schema.dbml default)
- getActiveJourney: L-1 준수를 위해 GET /api/profile route에서 사용

**2-2. service.test.ts 작성**

| 테스트 | 검증 |
|--------|------|
| createOrUpdateJourney 신규 | 활성 여정 없음 → INSERT, journeyId 반환 |
| createOrUpdateJourney 기존 | 활성 여정 있음 → UPDATE, 기존 id 반환 |
| createOrUpdateJourney 실패 | DB 에러 시 throw |
| end_date 계산 | start_date + stay_days 정확히 계산 |
| end_date null | start_date 없으면 end_date도 null |
| getActiveJourney 존재 | 활성 여정 반환 |
| getActiveJourney 미존재 | null 반환 |

### Task 3: route 구현 + 테스트

**3-1. POST /api/profile/onboarding route**

```
1. authenticateUser(req) → { id, token }
2. createAuthenticatedClient(token)
3. checkRateLimit(userId, 'profile_onboarding', config)
4. zod 검증 (onboardingSchema)
5. profileService.upsertProfile(client, userId, profileData)
6. journeyService.createOrUpdateJourney(client, userId, journeyData)
7. 201 { data: { profile_id: userId, journey_id }, meta: { timestamp } }
```

**zod 스키마 (Q-14 스키마 정합성):**

```typescript
const onboardingSchema = z.object({
  // user_profiles 필드 (UP 변수)
  skin_type: z.enum(['dry', 'oily', 'combination', 'sensitive', 'normal']),
  hair_type: z.enum(['straight', 'wavy', 'curly', 'coily']).nullable().optional(),
  hair_concerns: z.array(z.enum(['damage', 'thinning', 'oily_scalp', 'dryness', 'dandruff', 'color_treated'])).default([]),
  country: z.string().min(2).max(2),
  language: z.enum(['en', 'ja', 'zh', 'es', 'fr', 'ko']).default('en'),
  age_range: z.enum(['18-24', '25-29', '30-34', '35-39', '40-49', '50+']).optional(),

  // journeys 필드 (JC 변수)
  skin_concerns: z.array(z.enum(['acne', 'wrinkles', 'dark_spots', 'redness', 'dryness', 'pores', 'dullness', 'dark_circles', 'uneven_tone', 'sun_damage', 'eczema'])).max(5),
  interest_activities: z.array(z.enum(['shopping', 'clinic', 'salon', 'dining', 'cultural'])).min(1),
  stay_days: z.number().int().positive(),
  start_date: z.string().date().optional(),
  budget_level: z.enum(['budget', 'moderate', 'premium', 'luxury']),
  travel_style: z.array(z.enum(['efficient', 'relaxed', 'adventurous', 'instagram', 'local_experience', 'luxury', 'budget'])).default([]),
});
// end_date 미포함 (서버 계산)
```

**필드 분리 (route 책임 — L-1 thin):**

```typescript
const profileData = {
  skin_type, hair_type, hair_concerns, country, language, age_range
};
const journeyData = {
  skin_concerns, interest_activities, stay_days, start_date, budget_level, travel_style
};
```

**3-2. GET /api/profile route**

```
1. authenticateUser(req) → { id, token }
2. createAuthenticatedClient(token)
3. checkRateLimit(userId, 'profile_read', config)
4. profileService.getProfile(client, userId)
5. profile null → 404
6. journeyService.getActiveJourney(client, userId)
7. 200 { data: { profile, active_journey }, meta: { timestamp } }
```

**3-3. PUT /api/profile route**

```
1. authenticateUser(req) → { id, token }
2. createAuthenticatedClient(token)
3. checkRateLimit(userId, 'profile_update', config)
4. zod 검증 (updateSchema — partial, 최소 1필드)
5. profileService.updateProfile(client, userId, data)
6. 200 { data: { updated: true }, meta: { timestamp } }
```

**3-4. route 테스트**

| 테스트 (onboarding) | 검증 |
|---------------------|------|
| 정상 201 | data + meta.timestamp + X-RateLimit-* |
| 인증 없음 401 | authenticateUser throw |
| 검증 실패 400 | skin_type 누락 등 |
| skin_concerns 6개 400 | max(5) 검증 |
| interest_activities 빈 배열 400 | min(1) 검증 |
| service 에러 500 | 내부 메시지 미노출 |
| Rate limit 429 | Retry-After 헤더 |

| 테스트 (GET) | 검증 |
|-------------|------|
| 정상 200 | profile + active_journey |
| 프로필 미존재 404 | PROFILE_NOT_FOUND |
| 인증 없음 401 | |

| 테스트 (PUT) | 검증 |
|-------------|------|
| 정상 200 | 부분 업데이트 |
| 빈 요청 400 | 최소 1필드 |
| 인증 없음 401 | |
| service 에러 500 | |

---

## 검증 체크리스트

### 아키텍처 (P-*, R-*)

```
[ ] V-1  import 방향: app/ → features/ → shared/. 역방향 없음
[ ] V-2  core/ 수정 없음
[ ] V-3  onboarding route에서 두 service 파라미터 전달 (P-4)
[ ] V-4  profile service ↛ journey service, 역방향도 없음 (R-9)
[ ] V-5  콜 스택 ≤ 4: route → service → DB (3단계)
[ ] V-6  바인딩 체인 ≤ 4
[ ] V-17 profile/, journey/ 삭제해도 core/, auth/, shared/ 빌드 에러 없음
```

### 데이터 무결성 (Q-11~15)

```
[ ] V-19 onboarding 2테이블 쓰기: ② 실패 시 에러 응답, 성공 응답 미반환
[ ] V-20 journey: SELECT 확인 → UPDATE/INSERT 멱등 패턴
[ ] V-21 FK 순서: user_profiles(PK=user_id) → journeys(FK=user_id)
[ ] V-22 zod 열거값 = shared/types/domain.ts = DB 스키마 CHECK 일치
```

### 품질 (Q-*, G-*)

```
[ ] Q-1  모든 API 입력 zod 검증
[ ] Q-8  env 직접 접근 없음 (config.ts 경유)
[ ] G-2  중복 없음 (shared/types 재사용)
[ ] G-4  미사용 export 없음
[ ] G-5  P2-9 route 패턴과 동일
[ ] G-8  any 타입 없음
[ ] G-9  export 최소화
```

### 보안

```
[ ] RLS: createAuthenticatedClient(token) 사용 → auth.uid() = user_id
[ ] 에러: DB/내부 에러 메시지 노출 금지
[ ] 인증: 3개 API 모두 authenticateUser 필수
[ ] Rate limit: 3개 API 모두 적용 (60회/분, user_id)
[ ] 404: URL에 user_id 없음. 본인 프로필 유무만 확인 가능
```

### 테스트

```
[ ] profile service 테스트 (6개)
[ ] journey service 테스트 (7개)
[ ] onboarding route 테스트 (7개)
[ ] GET/PUT route 테스트 (7개)
[ ] npx vitest run 전체 통과
```
