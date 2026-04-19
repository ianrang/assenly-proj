## 작업: MVP 배포 — PR #34 머지 + 도메인 변경 + 프로덕션 배포

### 컨텍스트
- 브랜치: `chore/chat-quality-hardening` (PR #34 생성 완료, 머지 대기)
- 설계 정본: `docs/03-design/PRD.md`(WHAT) · `docs/03-design/TDD.md`(HOW)
- 프로젝트 규칙: `CLAUDE.md` (반드시 전체 읽고 준수)
- TODO: `TODO.md` — P3-33b, P3-34, P3-35 참조
- Git 규칙: `docs/03-design/GIT-CONVENTIONS.md`
- 인프라: `docs/03-design/INFRA-PIPELINE.md`

---

## Part A: PR #34 머지 + 정리

### 작업
1. PR #34 (`chore/chat-quality-hardening`) 머지 상태 확인
   - 머지 안 되어 있으면 사용자에게 머지 요청
   - 머지 완료 후 진행
2. main 전환 + pull + feature 브랜치 삭제
3. dev 서버/프로세스 정리

### 완료 기준
- main 브랜치, 최신 상태, feature 브랜치 삭제

---

## Part B: P3-33b — Vercel/도메인 assenly → essenly 변경

### 배경
- 현재 Vercel 프로젝트명과 도메인이 `assenly-proj`로 설정됨 (오타)
- 올바른 이름: `essenly-proj`
- GitHub 레포: `ianrang/essenly-proj` (이미 올바름)

### 코드 내 변경 대상 (확인된 4파일)
- `TODO.md` — 3곳: P0-28 URL, P3-32 설명, P3-33b 설명
- `docs/03-design/TDD.md:242` — Vercel 배포 URL
- `docs/superpowers/plans/2026-04-09-ai-quality-testing-gate-test-plan.md:4` — Repo 이름
- `docs/superpowers/plans/2026-04-09-ai-quality-testing-gate.md:5` — Repo 이름

### Vercel 설정 변경 (수동)
- **사용자에게 안내**: Vercel Dashboard에서 프로젝트명 변경은 Settings → General → Project Name
- 도메인 자동 변경: `assenly-proj.vercel.app` → `essenly-proj.vercel.app`
- 환경변수/시크릿은 프로젝트에 바인딩되므로 변경 불필요

### 구현
1. 코드 내 `assenly` 참조를 `essenly`로 전수 교체 (위 4파일)
2. `grep -r assenly` 로 누락 없는지 재확인 (.gitignore 된 파일 제외)
3. 빌드 + 테스트 확인
4. 커밋: `chore: Vercel 도메인 assenly→essenly 변경 (#P3-33b)`
5. 사용자에게 Vercel Dashboard 프로젝트명 변경 안내

### 검증
- `grep -r assenly --include="*.ts" --include="*.tsx" --include="*.md" --include="*.json" --include="*.yml"` 결과 0건
- 빌드 + tsc + 단위 테스트 통과

### 완료 기준
- 코드 내 assenly 참조 0건
- TODO.md P3-33b 상태 ✅ 업데이트
- 사용자에게 Vercel Dashboard 변경 안내 완료

---

## Part C: P3-34 — 프로덕션 배포

### 배경
- Vercel은 main 브랜치 push 시 자동 배포 (INFRA-PIPELINE.md)
- Part B의 커밋이 main에 머지되면 자동 배포 트리거

### 작업
1. Part B 커밋을 PR → 머지 (또는 main 직접 push — 사용자 판단)
2. Vercel 배포 상태 확인
   - `gh api repos/ianrang/essenly-proj/deployments --jq '.[0] | {state, environment, created_at}'` 또는 사용자에게 Vercel Dashboard 확인 요청
3. 배포 후 프로덕션 URL 접속 확인 (`https://essenly-proj.vercel.app/en`)
4. 프로덕션 핵심 동작 확인:
   - 랜딩 페이지 로드
   - 채팅 진입 + 메시지 송수신
   - Explore 페이지 제품 목록 로드
   - 프로필 설정 흐름

### 미적용 migration 주의
- migration 021/021b는 이전 세션에서 **이미 Supabase Dashboard에 적용 완료**
- migration 016 (skin_type DROP)은 배포 후 24~72h 관측 후 수동 실행 대상

### 완료 기준
- 프로덕션 URL 정상 접속
- 핵심 흐름 4개 정상 동작 확인
- TODO.md P3-34 상태 ✅ 업데이트

---

## Part D: P3-35 — 소프트 런칭

### 작업
1. 소프트 런칭 대상/규모 사용자에게 확인
2. TODO.md P3-35 상태 ✅ 업데이트
3. 메모리 업데이트 (MVP 배포 완료 기록)

### 완료 기준
- 소프트 런칭 시작
- TODO.md 업데이트

---

## 전체 작업 순서

```
Part A: PR #34 머지 + 정리
Part B: P3-33b 도메인 변경 (코드 + Vercel 안내)
Part C: P3-34 프로덕션 배포
Part D: P3-35 소프트 런칭
최종:   메모리 업데이트 + cleanup
```

### 주의사항
- main에서 새 브랜치 생성 후 작업 (GIT-CONVENTIONS.md 준수)
- Vercel Dashboard 프로젝트명 변경은 사용자가 수동 수행 — 안내만 제공
- 배포 후 migration 016 실행 금지 (24~72h 관측 후)
- `grep -r assenly`로 누락 검증 필수 — .env, .env.local 등 환경변수 파일도 확인 안내
