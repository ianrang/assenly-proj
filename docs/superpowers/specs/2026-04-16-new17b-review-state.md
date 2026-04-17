# NEW-17b 완료 핸드오프 (2026-04-16)

> 다른 PC에서 PR 생성 단계만 이어서 수행할 수 있도록 정리한 현재 상태 문서.
> 이 문서는 2026-04-16 오전 브랜치 생성 시점의 작업 핸드오프로 작성되었고, 동일 날짜 저녁 실행 완료 후 **완료 상태로 리라이트됨**.
> 정본 설계: `2026-04-16-new17b-rpc-hardening-design.md` v1.2

---

## 1. 현재 상태

- **브랜치**: `fix/new-17b-rpc-hardening-and-tests`
- **origin 동기화**: push 완료 (PR 미생성)
- **main 대비 커밋 수**: 8 commits (+ main 머지 1)
- **working tree**: clean
- **전수 검증**: ✅ type-check + lint + build + unit 907/907 + integration 124/124 PASS

## 2. 커밋 시퀀스 (main 머지 이후)

| # | SHA | 종류 | 메시지 |
|---|---|---|---|
| 1 | `613a13b` | docs | NEW-17b RPC 하드닝 + NEW-17e 통합 테스트 설계 spec 추가 |
| 2 | `c4da460` | docs | NEW-17b spec v1.1 (plan-eng-review 반영) + 핸드오프 노트 + NEW-17g TODO |
| 3 | `42494e5` | merge | Merge branch 'main' (NEW-40 등) |
| 4 | `be2b066` | feat | migration 017 RPC 하드닝 + rollback SQL 추가 |
| 5 | `699d72f` | test | RPC 하드닝 통합 테스트 T1~T8 추가 (red) |
| 6 | `0cd80a1` | fix | RPC FOUND semantics — dynamic EXECUTE 후 ROW_COUNT 사용 |
| 7 | `05bac3e` | feat | service.ts p_spec 인자 제거 + unit test exact match 재정의 |
| 8 | `87104b4` | docs | CLAUDE.md에 DB-TS spec drift 방어 규칙 추가 (Q-16 + V-27) |
| 9 | `31e9a5e` | docs | 플랜 + TODO 상태 업데이트 |

## 3. 작업 완료 범위

### 구현
- ✅ Migration `017_rpc_hardening.sql`: DROP 3-arg RPC → CREATE 2-arg + `get_*_field_spec()` IMMUTABLE + CHECK 제약 3건 + REVOKE authenticated/anon/PUBLIC + GRANT service_role (4 함수) + COMMENT
- ✅ Migration `017_rpc_hardening_rollback.sql`: 완전 역방향 (3-arg 복원 + CHECK DROP + GRANT authenticated 복원)
- ✅ `src/server/features/profile/service.ts`: `PROFILE_FIELD_SPEC`/`JOURNEY_FIELD_SPEC` import 제거 + RPC 2-arg 호출
- ✅ `src/server/features/profile/service.test.ts`: M4 테스트를 exact match (`Object.keys(args).sort()`) 로 재정의
- ✅ `src/__tests__/integration/rpc-hardening.integration.test.ts`: T1~T8 (14 테스트 케이스) 전부 green
- ✅ `CLAUDE.md`: Q-16 (DB-TS spec drift 방어) + V-27 (체크리스트) 추가
- ✅ `TODO.md`: NEW-17a/17b/17e 완료 반영
- ✅ Spec v1.2 개정 (FOUND 버그 수정 반영) + §11 changelog 갱신

### Supabase DB 적용 상태
- ✅ `017_rpc_hardening.sql` 적용 완료 (2026-04-16, v1.2 FOUND fix 포함)
- ⏸ `016_drop_profile_skin_type.sql`: **미적용** (프로덕션 코드 배포 + 24~72h 관측 후 별도 적용)

## 4. 실행 중 발견 사항 (중요)

**PL/pgSQL `FOUND` 버그** (commit `0cd80a1`):
- 원래 spec v1.1은 migration 015/015b의 `IF FOUND` 패턴을 그대로 복사
- PostgreSQL 공식 문서: `EXECUTE changes the output of GET DIAGNOSTICS, but does not change FOUND`
- 증상: T8 integration test에서 scalar NULL→AI set은 DB에 반영되었지만 `applied` 배열에 누락
- 부수 증상: array branch에서 직전 `SELECT INTO`가 설정한 FOUND=TRUE가 남아있어 UPDATE 0-row 시에도 applied 오탐
- 수정: `IF FOUND` 4곳 → `GET DIAGNOSTICS v_count = ROW_COUNT; IF v_count > 0` + 양 함수 DECLARE에 `v_count int;` 추가
- Rollback SQL은 015/015b 원형(버그 포함) 유지 — pre-017 상태 복원이 목적

## 5. 최종 리뷰 결과 (code-quality-reviewer)

**판정**: APPROVE_WITH_FOLLOWUPS (blocking 이슈 없음, 즉시 머지 가능)

### Important — 이 PR 내에서 해결 완료
- I-1 (plan v1.1 stale): Executed-as amendment 헤더 추가 (commit 시점)
- I-2 (review-state.md v1.1 pin): 본 문서 리라이트

### Minor — follow-up으로 분리
- **M-1 (SET search_path 누락)**: SECURITY INVOKER 함수에 `search_path = public, pg_temp` 미설정. service_role 전용이라 실질 위험 낮으나 defense-in-depth → **NEW-17h 등록**
- **M-2 (테스트 순서 의존)**: T6 budget_level이 T4의 userB journey 생성에 의존. T3도 T2 순차 실행 전제 → **NEW-17h 등록**
- **M-3 (T5 에러코드 과도 광범위)**: `42501 | PGRST202 | PGRST301` 중 하나를 허용 → PGRST202(function not found)가 false-positive로 통과 가능 → **NEW-17g에 추가** (CI 통합 시 엄격화)
- **M-4 (anon 명시 테스트 부재)**: authenticated가 거부되면 anon도 거부되지만 명시 테스트 없음. 낮은 가치 → **skip**
- **M-5 (플랜 체크박스 미체크)**: commit 시점 체크 완료

## 6. 남은 작업 (다른 PC에서 이어가기)

### 단 하나: PR 생성

```bash
# 브랜치 체크아웃
git checkout fix/new-17b-rpc-hardening-and-tests
git pull

# 상태 재확인 (선택)
git status                          # clean 확인
git log --oneline main..HEAD        # 9 commits

# PR 생성
gh pr create --base main \
  --title "fix(NEW-17b): RPC 보안 하드닝 + 통합 테스트 T1~T8" \
  --body "$(cat <<'EOF'
## Summary
- RPC `p_spec` 인자 제거 → 서버 내부 `get_*_field_spec()` IMMUTABLE 함수로 고정 (authenticated의 p_spec 위조 차단)
- `REVOKE authenticated/anon/PUBLIC` + `GRANT service_role` (4개 함수: apply_*_patch × 2 + get_*_field_spec × 2)
- CHECK 제약 3건 (`skin_types`, `age_range`, `budget_level`) — DB 레벨 허용값 강제
- 통합 테스트 T1~T8 추가 (drift guard, M1/M3, cap, lazy-create, REVOKE, CHECK, array union)
- PL/pgSQL FOUND 버그 수정 (015/015b 복사 유래, `GET DIAGNOSTICS ROW_COUNT` 사용)
- `CLAUDE.md` Q-16 + V-27: DB-TS spec drift 방어 규칙

## Pre-merge Checklist
- [x] `npm run test:integration` 로컬 통과 (T1~T8, 124/124)
- [x] `017_rpc_hardening.sql` Supabase Dashboard 적용 완료 (v1.2)
- [x] `SELECT proname, pronargs FROM pg_proc ...` 결과 4 rows 확인 (2-arg apply × 2 + 0-arg get × 2)
- [x] 전수 검증 통과 (`type-check && lint && build && test && test:integration`)
- [x] `CLAUDE.md` Q-16 + V-27 drift 방어 규칙 추가

## Spec
`docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md` v1.2

## Plan
`docs/superpowers/plans/2026-04-16-new17b-rpc-hardening.md`

## Rollback
`supabase/migrations/017_rpc_hardening_rollback.sql` — 코드 revert와 동시 적용 필수

## Follow-ups (별도 태스크)
- NEW-17h: SET search_path 고정 + 테스트 순서 의존 제거 (M-1, M-2)
- NEW-17g: CI integration test 통합 + T5 에러코드 assertion 엄격화 (M-3)
EOF
)"
```

## 7. 중요 제약 (재확인)

- **NO Docker, NO Supabase CLI, NO 로컬 DB** (CLAUDE.md). 017은 이미 사용자가 Dashboard 수동 적용 완료.
- **main 브랜치 직접 커밋 금지**. 이 브랜치를 유지.
- **커밋 메시지 Co-Authored-By 라인 금지** (Claude/AI 전부).
- **Integration test는 로컬 전용** (`.env.test` 필요, CI 미실행). INFRA-PIPELINE.md v1.1 §3.5 "GitHub Secrets 미사용" 정본.

## 8. 핵심 파일 참조

| 파일 | 역할 |
|---|---|
| `docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md` | **정본 설계 v1.2** (v1.0 → v1.1 → v1.2 이력) |
| `docs/superpowers/plans/2026-04-16-new17b-rpc-hardening.md` | 구현 플랜 (v1.1 기준 작성, 상단 Executed-as amendment 참조) |
| `docs/03-design/INFRA-PIPELINE.md` | CI/CD 정본 (M-3 결정 근거) |
| `docs/03-design/schema.dbml` | DB 정본 (CHECK 제약 허용값 교차 대조용) |
| `supabase/migrations/017_rpc_hardening.sql` | 적용된 migration (v1.2 FOUND fix 포함) |
| `supabase/migrations/017_rpc_hardening_rollback.sql` | 역방향 migration |
| `src/__tests__/integration/rpc-hardening.integration.test.ts` | T1~T8 통합 테스트 |
| `src/server/features/profile/service.ts` | 2-arg RPC 호출부 |
| `src/shared/constants/profile-field-spec.ts` | TS 상수 (drift 대조 기준) |
| `CLAUDE.md` | Q-16 + V-27 규칙 |
| `TODO.md` | NEW-17a/17b/17e/17g/17h 상태 |

## 9. 미결정 사항

없음. PR 생성만 남음.
