## 작업: 배포 전 하드닝 — NEW-39T, NEW-17f, NEW-17h

### 컨텍스트
- 브랜치: main (PR #32 머지 완료)
- 설계 정본: `docs/03-design/PRD.md`(WHAT) · `docs/03-design/TDD.md`(HOW) · `docs/03-design/schema.dbml`(DB 정본)
- 프로젝트 규칙: `CLAUDE.md` (반드시 전체 읽고 준수)
- TODO: `TODO.md` — NEW-39T, NEW-17f, NEW-17h 참조
- Git 규칙: `docs/03-design/GIT-CONVENTIONS.md`

---

## Part A: NEW-39T — 4도메인 채팅 브라우저 QA

### 배경
- 이전 세션(2026-04-19)에서 **eval 25/25 ALL PASS** + **API 레벨 4도메인 KO QA 정상** 확인 완료
- 브라우저(headless Chromium) QA만 미수행 — browse 바이너리 실행 불안정으로 중단됨

### 작업
1. dev 서버 시작 (`npm run dev`)
2. gstack browse로 `http://localhost:3000/en` 접속
   - 브라우저 사전 워밍업: `$B status` 확인 후 `$B goto about:blank` → 3초 대기 → 실제 URL 접속
   - 타임아웃 60초 이상 설정
3. 동의(consent) 화면 통과 → 채팅 화면 진입
4. 4개 시나리오 순차 테스트 (각각 스크린샷 촬영):
   - `"recommend a moisturizer for dry skin"` → ProductCard 렌더링 확인 (subcategory muted 태그 + english_label teal 태그 존재 여부)
   - `"stores near Myeongdong"` → StoreCard 렌더링 확인
   - `"botox treatment in Gangnam"` → TreatmentCard 렌더링 확인
   - `"foreigner-friendly dermatology clinic"` → ClinicCard 렌더링 확인
5. 각 카드에서 확인할 것:
   - 카드 렌더링 정상 (이미지/텍스트/가격)
   - 태그/뱃지 5색 체계 매핑 정상
   - 링크 동작 (Product Details, Map, Book 등)
6. **브라우저 QA 실패 시** (browse 바이너리 불안정 재현): API 레벨 QA가 이미 완료되었으므로 TODO에 "API QA 완료, 브라우저 QA 스킵" 기록하고 Part B로 진행

### 완료 기준
- 4도메인 카드 렌더링 스크린샷 또는 API QA 완료 기록
- TODO.md NEW-39T 상태 ✅ 업데이트

---

## Part B: NEW-17f — 배포 윈도우 안전 (sync trigger)

### 배경
- Migration 015에서 `skin_type`(단일) → `skin_types`(배열)로 마이그레이션
- Migration 016은 구 `skin_type` 컬럼 DROP (코드 배포 + 24-72h 관측 후 수동 실행)
- **문제**: migration 015 적용 ~ 코드 배포 완료 사이 윈도우에서 구 코드가 `skin_type`에만 write → `skin_types` 미반영으로 데이터 유실 가능
- 설계 정본: `docs/superpowers/specs/2026-04-15-new17-profile-merge-policy-design.md` §2.4.1 (DO-7)

### 관련 파일
- `supabase/migrations/015_profile_skin_types_array.sql` — skin_types 배열 마이그레이션 (130줄)
- `supabase/migrations/016_drop_profile_skin_type.sql` — 구 컬럼 DROP (16줄)
- `docs/superpowers/specs/2026-04-15-new17-profile-merge-policy-design.md` §2.4.1 (L301-325) — DO-7 런북 + trigger 코드

### 구현할 것

**옵션 A 채택** (설계 문서 §2.4.1 권장):

1. **migration 021 신규 생성**: `supabase/migrations/021_sync_skin_type_trigger.sql`
   - `sync_skin_type_to_array()` trigger 함수 생성 (설계 문서 L311-319의 코드 그대로 사용):
     ```sql
     CREATE OR REPLACE FUNCTION sync_skin_type_to_array() RETURNS trigger AS $$
     BEGIN
       IF NEW.skin_type IS NOT NULL
          AND (NEW.skin_types IS NULL OR NOT (NEW.skin_types @> ARRAY[NEW.skin_type])) THEN
         NEW.skin_types := COALESCE(NEW.skin_types, ARRAY[]::text[]) || ARRAY[NEW.skin_type];
       END IF;
       RETURN NEW;
     END;
     $$ LANGUAGE plpgsql;
     ```
   - trigger 생성:
     ```sql
     CREATE TRIGGER trg_sync_skin_type
       BEFORE INSERT OR UPDATE ON user_profiles
       FOR EACH ROW EXECUTE FUNCTION sync_skin_type_to_array();
     ```
   - rollback SQL 포함 (DROP TRIGGER + DROP FUNCTION)

2. **migration 016 수정**: 기존 16줄 파일에 trigger + 함수 DROP 추가
   - 현재: `ALTER TABLE user_profiles DROP COLUMN skin_type;`
   - 추가: `DROP TRIGGER IF EXISTS trg_sync_skin_type ON user_profiles;` + `DROP FUNCTION IF EXISTS sync_skin_type_to_array();`
   - 016은 아직 미적용 상태이므로 파일 직접 수정 가능

### 검증
- migration 021 SQL 문법 검증 (Supabase local 또는 syntax check)
- 016과의 정합성 확인 (016 실행 시 trigger + 함수 + 컬럼 모두 정리되는지)

### 완료 기준
- migration 021 파일 생성
- migration 016 파일에 trigger/함수 DROP 추가
- TODO.md NEW-17f 상태 ✅ 업데이트

---

## Part C: NEW-17h — defense-in-depth + 테스트 격리

### 배경
- NEW-17b PR code review에서 APPROVE_WITH_FOLLOWUPS로 Minor 이슈 2건 식별
- 설계 정본: `docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md`

### 관련 파일
- `supabase/migrations/017_rpc_hardening.sql` — 4개 RPC 함수 (298줄). **현재 SET search_path 없음**
- `src/__tests__/integration/rpc-hardening.integration.test.ts` — 통합 테스트 (603줄)

### M-1: SET search_path 고정

**migration 021b 신규 생성**: `supabase/migrations/021b_rpc_search_path.sql`

migration 017의 4개 함수에 `SET search_path = public, pg_temp` 추가:
```sql
ALTER FUNCTION apply_ai_profile_patch(uuid, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION apply_ai_journey_patch(uuid, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION get_profile_field_spec() SET search_path = public, pg_temp;
ALTER FUNCTION get_journey_field_spec() SET search_path = public, pg_temp;
```

- SECURITY INVOKER + service_role 전용이라 실질 위험 낮지만 defense-in-depth 원칙
- rollback SQL 포함 (`ALTER FUNCTION ... RESET search_path`)
- 017b가 아닌 021b로 번호 부여 (017은 이미 적용 완료 상태이므로 새 migration으로 ALTER)

### M-2: 통합 테스트 격리

**파일**: `src/__tests__/integration/rpc-hardening.integration.test.ts`

**현재 의존 관계** (제거 대상):
- **T3** (L103-128, cap 절단 금지): `userA`를 사용하는데, T2(L63-100)에서 userA의 skin_types를 `['dry', 'oily']`로 변경한 상태에 의존. T3 L106-107에서 `['dry', 'oily', 'combination']`으로 update하지만 이는 T2의 부수효과 위에 구축됨
- **T6** (L193-224, CHECK 제약 방어): L214-219에서 `userB`의 journeys 테이블에 update하는데, 이 journey 레코드는 T4(L131-158)에서 lazy-create로 생성된 것에 의존

**수정 방안**:
- T3: describe 블록 내 시작 부분에 userA의 skin_types를 명시적으로 setup (T2 결과에 의존하지 않도록)
  ```typescript
  // T3 시작 시 — T2 의존 제거
  await admin.from('user_profiles').upsert({
    user_id: userA.userId,
    skin_types: ['dry', 'oily', 'combination'],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  ```
  그러면 기존 L106-108의 update는 제거 가능 (upsert로 대체)

- T6: budget_level 테스트(L214-219)에서 `userB`의 journey 존재에 의존. T6 describe 내에서 journey를 명시적으로 보장:
  ```typescript
  // T6 시작 시 — T4 의존 제거
  await admin.from('journeys').upsert({
    user_id: userB.userId,
    status: 'active',
    country: 'KR',
    city: 'seoul',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id, status' });
  ```

**주의**: 기존 테스트 로직과 assertion은 변경하지 않는다. setup 데이터의 독립성만 확보.

### 검증
- `npm run test:integration` 실행으로 통합 테스트 전체 통과 확인
- 단위 테스트 전체 통과 확인

### 완료 기준
- migration 021b 파일 생성
- rpc-hardening.integration.test.ts T3/T6 테스트 격리
- 통합 테스트 + 단위 테스트 전체 통과
- TODO.md NEW-17h 상태 ✅ 업데이트

---

## 전체 작업 순서

```
Part A: NEW-39T 브라우저 QA (또는 스킵 기록)
Part B: NEW-17f migration 021 (sync trigger)
Part C: NEW-17h migration 021b (search_path) + 테스트 격리
최종:   빌드/린트/테스트 → 커밋/PR
```

- Part A는 독립. B/C는 같은 브랜치에서 진행 가능 (migration 번호 겹치지 않음)
- 커밋은 Part별 또는 통합 — 규모에 따라 판단

### 주의사항
- migration 파일은 Supabase Dashboard 수동 적용 대상. 코드만 작성하고 적용은 배포 시점
- migration 016은 아직 미적용 상태 — 파일 수정 가능
- 기존 migration 015/015b/017은 이미 적용 완료 — 파일 수정 불가, 새 migration으로 ALTER
- 통합 테스트 실행 시 `.env.test` 환경변수 필요 (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- main에서 새 브랜치 생성 후 작업
