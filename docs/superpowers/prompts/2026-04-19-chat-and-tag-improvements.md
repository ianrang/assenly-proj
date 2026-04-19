## 작업: 채팅 언어/품질 + 카드 태그 시스템 개선 — NEW-42~46

### 컨텍스트
- 브랜치: main (PR #31 머지 완료)
- 설계 정본: `docs/03-design/PRD.md`(WHAT) · `docs/03-design/TDD.md`(HOW) · `docs/03-design/schema.dbml`(DB 정본)
- 디자인 프리뷰: `public/design-preview.html` (Tag System 섹션 — 5색 체계 정의)
- 프로젝트 규칙: `CLAUDE.md` (반드시 전체 읽고 준수)
- TODO: `TODO.md` — NEW-42~46 참조
- 메모리: `memory/project_next_tasks.md` — 작업 순서 참조

---

## Part A: 채팅 언어 + 품질 (NEW-42, NEW-43)

### 현재 문제

#### NEW-42: 채팅 언어 감지 불일치
- **증상**: `/en`, `/ko` URL과 무관하게 사용자 질문 언어에 따라 해당 언어로 응답해야 하는데, "했다가 안했다가" 불안정
- **근본 원인 (이전 세션 분석 완료)**:
  1. API locale enum이 `z.enum(['en', 'ko'])` — ja/zh/th 등은 `'en'`으로 폴백
  2. `prompts.ts` buildRulesSection(locale): "첫 응답은 ${locale}, 이후는 사용자 입력 언어를 따라감" → LLM 자동 감지에 전적 의존
  3. 명시적 언어 감지 로직 없음
  4. eval M1-M4에서 locale='en'으로 전송되어 첫 응답이 영어로 시작할 가능성

- **관련 파일**:
  - `src/server/features/api/routes/chat.ts` — chatRequestSchema locale 필드
  - `src/server/features/chat/prompts.ts` — buildRulesSection(locale) (L72-108)
  - `src/server/features/chat/service.ts` — streamChat params.locale 전달
  - `src/client/features/chat/ChatContent.tsx` — localeRef, prepareSendMessagesRequest
  - `src/server/features/chat/prompt-examples.ts` — few-shot 다국어 예시 (M1-M4)
  - `scripts/eval-chat-quality.ts` — locale 결정 로직 (L378)
  - `scripts/fixtures/eval-scenarios.json` — 21개 시나리오 (M1-M4 다국어 포함)

#### NEW-43: 채팅 품질 검증
- eval 하네스 존재: 21개 시나리오, Gemini judge
- **최근 eval 실행 결과 없음** — 현재 품질 상태 미확인
- NEW-39T (4도메인 채팅 수동 QA)도 미수행

### Part A 작업 순서

1. **분석**: 관련 파일 전체 Read 확인 (prompts.ts, chat.ts, ChatContent.tsx, service.ts, eval-chat-quality.ts)
2. **방안 도출 + 사용자 보고**: 언어 안정화 방안 결정 → 사용자 승인
3. **구현**: 승인된 방안 구현
4. **eval 실행**: 전체 21개 시나리오 실행 (dev 서버 필요, `npm run dev`)
5. **결과 분석**: PASS/FAIL 분류, FAIL 원인 분석
6. **NEW-39T 통합**: dev 서버 4개 도메인 채팅 QA
   - products: "건성 피부에 좋은 수분크림 추천"
   - stores: "서울에서 올리브영 매장 알려줘"
   - treatments: "강남에서 보톡스 시술 추천해줘"
   - clinics: "외국인 친화적인 피부과 클리닉 추천"
7. **튜닝** (필요 시): FAIL 시나리오 프롬프트/few-shot 튜닝 → 재실행

---

## Part B: 카드 태그 시스템 (NEW-44, NEW-45, NEW-46)

### 현재 문제

PR #31에서 **구조별 뱃지**(english_support, tourist_services, foreigner_friendly 등)는 5색 적용 완료.
그러나:
1. **ProductCard**: `product.tags` 배열(displayTags)이 전부 muted → 5색 분류 미적용. "English Label" 뱃지 영역 과다. 제품 정보에서 유용한 태그 1~2개 추가 필요
2. **StoreCard**: 모든 태그가 동일 색상/디자인 → design-preview.html 기준 검토 필요
3. **ClinicCard**: 동일 → design-preview.html 기준 검토 필요

### 관련 파일
- `src/client/features/cards/ProductCard.tsx` — displayTags (L165-176), English Label (L179-182)
- `src/client/features/cards/StoreCard.tsx` — 전체 뱃지 배치
- `src/client/features/cards/ClinicCard.tsx` — 전체 뱃지 배치
- `src/client/features/cards/TreatmentCard.tsx` — PR #31 완료 (coral/sage)
- `public/design-preview.html` — Tag System 5색 정의 + 카드별 권장 배치
- `src/shared/types/domain.ts` — Product/Store/Clinic 타입, tags 필드
- `src/shared/constants/beauty.ts` — INTERNAL_TAG_PREFIXES
- `src/app/globals.css` — 디자인 토큰

### Part B 작업 순서

1. **데이터 분석**: 실제 DB/seed의 product.tags, clinic.tags 값 확인 (Supabase RPC 또는 seed 스크립트)
2. **design-preview.html 대조**: Tag System 5색 체계와 현재 카드 뱃지 비교, 개선 방안 도출
3. **사용자 보고 + 승인**
4. **구현**: ProductCard(NEW-44) → StoreCard(NEW-45) → ClinicCard(NEW-46) 순
5. **검증**: 빌드/린트/테스트 + 브라우저 QA

---

## 전체 작업 순서

```
Part A-1: NEW-42 분석 + 방안 도출 → 사용자 승인 → 구현
Part A-2: NEW-43 eval 실행 + NEW-39T QA → 결과 분석 → 튜닝
Part B:   NEW-44~46 데이터 분석 → 설계 → 사용자 승인 → 구현 → 검증
최종:     빌드/린트/테스트 → 브라우저 QA → 커밋/PR
```

Part A 완료 후 Part B 진행. Part A 내에서 NEW-42 → NEW-43 순서 (언어 안정화 → eval 검증).

### 주의사항
- 추측하지 말 것. 모든 판단의 근거는 코드베이스 또는 설계 문서의 실제 내용
- 코드 수정 전 반드시 Read로 현재 상태 확인
- eval 실행 시 dev 서버 필요 (`npm run dev`), API 키 환경변수 확인
- design-preview.html의 패턴을 디자인 정본으로 사용
- main에서 새 브랜치 생성 후 작업 (Part A, B 별도 브랜치 또는 통합 — 규모에 따라 판단)
- 각 Part 완료 후 빌드/린트/테스트 검증 필수
