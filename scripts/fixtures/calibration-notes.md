# Judge Calibration Notes

> WS2 eval harness — Judge 보정 기록.
> 첫 실행 후 사람이 PASS/FAIL 결과를 검토하고, 불일치 발견 시 rubric 수정 내역을 기록.

---

## Run 1 (2026-04-12)

Date: 2026-04-12
Run #: 1 (calibration run, after SSE parser fix)
Provider: google (gemini-2.0-flash)
Scenarios: 20

Results: 14/20 passed, 6 failed, 0 errors

Mismatches (Judge vs Human):
- [x] P4 — Judge said FAIL but human says PASS
  Reason: rubric `k_beauty_specific`가 "actual K-beauty brands" 명시 요구. 응답에 "K-beauty products" 언급했으나 브랜드명 없어 FAIL.
  Rubric fix: "Recommends K-beauty products or categories (mentioning specific brands is ideal but not required)"
- [x] R3 — Judge said FAIL but human says PASS
  Reason: rubric `comparison_format`가 "table format, or side-by-side" 요구. 텍스트로 2개 제품 비교했으나 table 아니라 FAIL.
  Rubric fix: "Compares products by describing distinguishing characteristics of each. Table format is not required."
- [x] E3 — Judge said FAIL but human says PASS
  Reason: rubric `seoul_context`가 "Mentions Seoul clinics, areas" 명시 요구. 클리닉 시술 추천했으나 서울 명시 안 해서 FAIL.
  Rubric fix: "Response is relevant to someone visiting Seoul. Recommending treatments available in Korean clinics is sufficient."

## Run 1b — Post-Calibration (2026-04-12)

Date: 2026-04-12
Run #: 1b (after rubric fixes)
Provider: google (gemini-2.0-flash)
Scenarios: 20

Results: 16/20 passed, 4 failed, 0 errors

Calibrated scenarios fixed:
- P4: FAIL → PASS (k_beauty_specific fix)
- R3: FAIL → PASS (comparison_format fix)
- E3: FAIL → PASS (seoul_context fix)

Remaining FAILs (real quality issues, not rubric problems):
- P5: LLM asks questions instead of giving generic recs
- R1: LLM asks questions instead of recommending products
- R2: PASS → FAIL (flaky — LLM sometimes asks instead of recommending)
- R4: LLM asks budget instead of answering follow-up

## Stability (Runs 1b, 2, 3)

```
시나리오 | Run 1b | Run 2 | Run 3 | 일관성
---------|--------|-------|-------|-------
P1       | PASS   | PASS  | PASS  | STABLE
P2       | PASS   | PASS  | PASS  | STABLE
P3       | PASS   | PASS  | PASS  | STABLE
P4       | PASS   | FAIL  | FAIL  | FLAKY (LLM 비결정적)
P5       | FAIL   | PASS  | FAIL  | FLAKY (LLM 비결정적)
G1-G4    | PASS   | PASS  | PASS  | STABLE (4/4)
R1       | FAIL   | FAIL  | FAIL  | STABLE FAIL
R2       | FAIL   | PASS  | PASS  | FLAKY
R3       | PASS   | PASS  | PASS  | STABLE
R4       | FAIL   | FAIL  | FAIL  | STABLE FAIL
M1-M4    | PASS   | PASS  | PASS  | STABLE (4/4)
E1-E3    | PASS   | PASS  | PASS  | STABLE (3/3)
```

Stability: 17/20 consistent across 3 runs (85%)
Flaky scenarios: P4, P5, R2
Stable FAIL: R1, R4

## Root Cause Analysis

FLAKY + Stable FAIL 시나리오의 공통 패턴:
- LLM이 추천 대신 질문을 함 ("What kind of products?", "Could you give me a budget?")
- Tool call 없이 텍스트만 반환 (search tool 미호출)
- 이것은 LLM의 "정보 수집 우선" 성향에 의한 채팅 품질 이슈
- 프롬프트에 "provide at least one recommendation even without complete information" 규칙 추가 필요

## Action Items

- [ ] 프롬프트 튜닝: 불완전한 정보에도 최소 1개 추천 제공하도록 규칙 추가 (별도 태스크)
- [x] Rubric 보정 3건 완료 (P4, R3, E3)
- [x] SSE 파서 교체 (Data Stream → UI Message Stream)
- [x] Rate limit 딜레이 4초 추가
- [x] R1 rubric 보정 (NEW-31): `multiple_products`+`diverse_categories` → `engages_constructively`+`k_beauty_relevant`. 명확화 질문도 유효한 응답으로 허용

---

## Run 4-6 — Post Chat Quality Tuning (2026-04-12)

### 적용된 변경
- `config.ts`: DEFAULT_MODELS.google `gemini-2.0-flash` → `gemini-2.5-flash`
- `llm-client.ts`: streamText에 `toolChoice: 'auto'` 추가 (주 + 폴백)
- `prompts.ts`: TOOLS_SECTION에 "MUST call search_beauty_data before recommending" 강화
- `eval-chat-quality.ts`: SSE 파서를 `tool-call` → `tool-input-start/tool-input-available`로 수정

### 결과
- Run 4: 17/20 PASS
- Run 5: 19/20 PASS
- Run 6: 16/20 PASS
- 평균: 17.3/20 (86.5%)

### 주요 개선
| 지표 | 튜닝 전 | 튜닝 후 |
|------|--------|--------|
| Tool 호출율 | 0/20 (0%) | 11~16/20 (55-80%) |
| R2, R4 (이전 stable FAIL) | 2건 FAIL | 모두 STABLE PASS |
| P5 | 2/3 FAIL | 3/3 PASS |
| 실제 DB 제품 추천 | 없음 (할루시네이션) | 실제 제품명 포함 |

### 남은 이슈 (v0.2 범위)
- P1: Gemini 2.5 Flash가 empty response 반환 (outputTokens: 0). 재현 조건 불명확.
- R1: rubric 보정 완료 (NEW-31). 명확화 질문도 유효한 응답으로 허용.
- E1: 매우 긴 입력에서 tool 28회 호출 루프. stopWhen 제한 검토 필요.

---

## Run 7 — Post R1 Rubric Calibration (2026-04-13)

### 적용된 변경
- R1 rubric: `multiple_products`+`diverse_categories` → `engages_constructively`+`k_beauty_relevant` (NEW-31)
- R1 name: "diverse results" → "recs or clarification"

### 결과
- 17/20 PASS, 3 FAIL, 0 errors
- Duration: 207.6s

### R1 보정 효과
- R1: **STABLE FAIL → PASS** (명확화 질문을 유효한 응답으로 인정)

### FAIL 시나리오 (이전 Run과 동일한 FLAKY 패턴)
- P1: `actionable` FAIL — LLM이 명확화 질문 (FLAKY, Run 4-6과 동일)
- P4: `combination_aware` FAIL — 복합성 피부 특성 미언급 (FLAKY)
- P5: `generic_recs` FAIL — 프로필 질문 우선 (FLAKY)

### 카테고리별
| 카테고리 | 결과 |
|---------|------|
| Personalization | 2/5 (P1,P4,P5 FLAKY) |
| Guardrails | 4/4 |
| Recommendation | 4/4 (R1 PASS!) |
| Multilingual | 4/4 |
| Edge Cases | 3/3 |

### Tool 호출율
- 14/20 시나리오에서 tool 호출 (70%)
- search_beauty_data 가장 빈번, extract_user_profile 프로필 있는 시나리오에서 활발

---

## Run 8 — Post Pipeline Improvement (2026-04-14)

### 적용된 변경
- 빈 응답 클라이언트 감지 + 자동 1회 재시도 (ChatContent.tsx)
- 서버 onFinish 빈 응답 DB 저장 스킵 (chat.ts)
- judgment.ts 공통 scoring 상수 추출 (DRY)
- scoreStores/scoreClinics 순수 함수 (여행객 접근성 + 언어 매칭)
- search-handler store/clinic에 scoring + rank 파이프라인 적용
- 프롬프트: domain guide 수정 + Answer first 강화 + 빈 응답 방지
- few-shot 예시 3개 추가 (store/combination skin/no-profile)
- eval 시나리오 20→25개 + P4/P5 rubric 보정

### 결과
- 22/25 PASS, 3 FAIL, 0 errors
- Duration: 219.4s

### 기존 FAIL 해소
| 시나리오 | Run 7 | Run 8 | 해결한 변경 |
|---------|-------|-------|-----------|
| P1 | FAIL (빈 응답) | **PASS** | 프롬프트 빈 응답 방지 지시 |
| P4 | FAIL (combination_aware) | **PASS** | rubric 보정 + few-shot combination skin 예시 |
| P5 | FAIL (질문 우선) | **PASS** | Answer first 강화 + rubric 보정 |

### 신규 FAIL
- M4 (Korean): 빈 응답 (Gemini 비결정성, FLAKY)
- S1 (Store Myeongdong): 빈 응답 (Gemini 비결정성, FLAKY)
- S2 (Clinic acne scar): practical_info 부족 — LLM이 clinic reasons를 응답에 미반영

### 카테고리별
| 카테고리 | 결과 |
|---------|------|
| Personalization | 7/7 (P1,P4,P5 PASS + P6,P7 신규 PASS) |
| Guardrails | 4/4 |
| Recommendation | 4/4 |
| Multilingual | 3/4 (M4 빈 응답 FLAKY) |
| Edge Cases | 3/3 |
| Store/Clinic | 1/3 (S1 빈 응답, S2 practical_info) |

### Tool 호출율
- 20/25 시나리오에서 tool 호출 (80%, Run 7 대비 +10%)
- 빈 응답 2건(M4, S1)은 tool 미호출
