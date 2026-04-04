# P2-63 설계서: Phase A — treatments 53건 데이터 수집

> **정본 우선순위**: schema.dbml > PRD.md > TDD.md > 이 설계서
> **작성일**: 2026-04-04
> **마일스톤**: M2

---

## 1. 목적

DOM-2(Treatment 도메인)의 시술 데이터 53건을 수집·보강·검수·적재한다.

- AI 채팅에서 시술 추천의 전제 조건 (treatments 테이블 비어있으면 추천 불가)
- Phase C(clinic_treatments 정션)의 선행 조건
- Phase D(임베딩 생성)의 선행 조건

**비즈니스 목표 연결 (G-13)**: 시술 추천 → 클리닉 제휴 수수료 + 하이라이트 배지 수익 모델 (PRD §2.3)

---

## 2. 범위

### 포함

- 매니페스트 의학적 수정 (다운타임/피부타입/고민 불일치 해소)
- 3건 추가 (하이드라페이셜, 쓰레드 리프트, 비타민 수액) + KB 신규 작성 2건
- duration_minutes, session_count 필드 매니페스트 추가
- YAML → CSV 변환 (import-csv.ts 기존 패턴)
- 파이프라인 코드 수정 (enrich-service FIELD_MAPPINGS + generateSpecs, review-exporter 컬럼)
- 파이프라인 실행 (import-csv → enrich → export-review)
- 의학적 정확성 검수
- DB 적재 (import-review → load)

### 제외 (별도 태스크)

- `subcategory` 필드: MVP에서 제외, v0.2에서 추가 (YAGNI)
- `clinic_treatments` 정션 데이터: Phase C (P2-64c)
- `images[]`: 별도 에셋 관리
- LLM 분류 검증: P2-65에서 일괄 수행

---

## 3. 데이터 소스

### 3.1 기존 매니페스트

- 파일: `scripts/seed/manifests/treatments.yaml`
- 현재: 50건 (laser 15, skin 10, injection 10, facial 8, body 4, hair 3)
- 추가 후: 53건

### 3.2 Knowledge Base (참조용)

- 위치: `docs/knowledge-base/treatments/` (15건 상세 문서)
- 용도: duration_minutes, session_count 추출 + 의학적 교차검증
- 신규 작성: `thread-lift.md`, `vitamin-drip.md`

### 3.3 데이터 채널

- **Channel B (CSV/Sheet import)** — `data-collection.md §6.3`과 일치
- 자동화율 ~25%: 전 필드 수동 입력(의학 정보), AI는 번역+description+precautions+aftercare 생성

---

## 4. 매니페스트 수정 사항

### 4.1 의학적 수정 (KB 교차검증 기반)

**다운타임 원칙**: DB는 int 단일값. KB에 범위가 있을 때 **보수적(최대값)** 채택.

> 근거: 관광객은 여행 일정이 고정. 다운타임 과소 추정이 과대 추정보다 위험.
> 전문가 리뷰 단계에서 하향 조정 가능.

| 시술 | 항목 | 현재 | 수정값 | KB 근거 |
|------|------|------|--------|---------|
| 피코 토닝 | downtime_days | 0 | **3** | KB: 1~3일 최대값 |
| 물광주사 | downtime_days | 1 | **3** | KB: 1~3일 최대값 |
| CO2 레이저 | downtime_days | 7 | **14** | KB: 7~14일 최대값 |
| 아쿠아 필 | suitable_skin_types | oily, combination | **+ dry, sensitive, normal** | KB: 전체 피부타입 적합 |
| 아쿠아 필 | target_concerns | pores, dullness, acne | **+ dryness** | KB에 dryness 포함 |
| LED 테라피 | target_concerns | acne, redness, wrinkles | **+ dullness** | KB에 dullness 포함 |
| 두피 스케일링 | target_concerns | [] | **dryness, redness** | KB: 건조/염증성 두피 |
| 헤어 메조테라피 | target_concerns | [] | **dryness** | 건조 두피 영양 공급 |
| PRP 모발 재생 | target_concerns | [] | **dryness** | 두피 재생 목적 |

**가격 범위**: 매니페스트 값 유지 (KB보다 최신 시장가 반영). 전문가 리뷰에서 최종 확인.

### 4.2 시술 추가 (3건)

#### 하이드라페이셜 (KB `hydrafacial.md` 기반)

```yaml
- name_ko: 하이드라페이셜
  name_en: HydraFacial
  category: facial
  expected_concerns: [pores, dullness, dryness, acne, uneven_tone]
  expected_skin_types: [dry, oily, combination, sensitive, normal]
  downtime_days: 0
  price_range_krw: [80000, 200000]
  duration_minutes: 45
  session_count: "2~4주 간격 반복"
```

#### 쓰레드 리프트 (신규 KB 작성 필요)

```yaml
- name_ko: 실리프팅 (쓰레드 리프트)
  name_en: Thread Lift
  category: injection
  expected_concerns: [wrinkles]
  expected_skin_types: [dry, normal, combination, oily, sensitive]
  downtime_days: 7
  price_range_krw: [300000, 1500000]
  duration_minutes: 60
  session_count: "1~2회 (12~18개월 유지)"
```

#### 비타민 수액 (신규 KB 작성 필요)

```yaml
- name_ko: 비타민 수액 (글루타치온 IV)
  name_en: Vitamin IV Drip (Glutathione)
  category: injection
  expected_concerns: [dullness, dryness]
  expected_skin_types: [dry, oily, combination, sensitive, normal]
  downtime_days: 0
  price_range_krw: [50000, 200000]
  duration_minutes: 30
  session_count: "1~2주 간격 (여행 중 1회도 가능)"
```

### 4.3 duration_minutes, session_count 추가

50건 기존 항목에 2개 필드 추가:
- `duration_minutes` (int): KB 15건에서 추출 (최대값). 나머지 35건은 카테고리별 표준값 + 시술 특성.
- `session_count` (text): KB 15건에서 추출. 나머지 35건은 시술 유형별 일반적 권장 횟수.

**카테고리별 duration_minutes 기본값** (KB 없는 항목에 적용):

| 카테고리 | 기본값 | 근거 |
|---------|--------|------|
| laser | 30 | KB 평균 15~45분 |
| skin | 45 | KB 평균 20~60분 |
| injection | 20 | KB 평균 10~30분 |
| facial | 45 | KB 평균 30~45분 |
| body | 45 | KB 평균 30~60분 |
| hair | 45 | KB 평균 30~60분 |

---

## 5. CSV 변환 규칙

### 5.1 필드명 매핑 (YAML → CSV → DB)

| YAML (소스) | CSV 헤더 | DB 컬럼 | 변환 |
|------------|---------|---------|------|
| `name_ko` | `name_ko` | `name.ko` | enrich에서 LocalizedText 변환 |
| `name_en` | `name_en` | `name.en` | enrich에서 LocalizedText 변환 |
| `category` | `category` | `category` | 그대로 |
| `expected_concerns` | `target_concerns` | `target_concerns` | **리네이밍** (DB 필드명 사용) |
| `expected_skin_types` | `suitable_skin_types` | `suitable_skin_types` | **리네이밍** (DB 필드명 사용) |
| `price_range_krw[0]` | `price_min` | `price_min` | 배열 → 개별 int |
| `price_range_krw[1]` | `price_max` | `price_max` | 배열 → 개별 int |
| `downtime_days` | `downtime_days` | `downtime_days` | 그대로 |
| `duration_minutes` | `duration_minutes` | `duration_minutes` | 그대로 |
| `session_count` | `session_count` | `session_count` | 그대로 |

### 5.2 id (source_id) 생성 규칙

CSV `id` 컬럼에 `treat-{name_en 소문자 kebab}` 패턴으로 기입. csv-loader의 기본 ID 컬럼(`id`)과 일치시켜 deterministic UUID 생성을 보장.
예: `treat-laser-toning`, `treat-botox-forehead`, `treat-hydrafacial`

### 5.3 CSV 예시

```csv
id,name_ko,name_en,category,target_concerns,suitable_skin_types,price_min,price_max,downtime_days,duration_minutes,session_count
treat-laser-toning,레이저 토닝,Laser Toning,laser,dark_spots|uneven_tone,oily|combination|normal,50000,150000,1,30,5~10회 (1~2주 간격)
```

배열 값은 `|` 구분자 사용 (기존 review-exporter 패턴과 동일).

---

## 6. 파이프라인 코드 수정

### 6.1 enrich-service.ts — FIELD_MAPPINGS.treatment 추가

```typescript
treatment: {
  duration_minutes: (data: Record<string, unknown>) =>
    data.duration_minutes != null ? Number(data.duration_minutes) : null,
  session_count: (data: Record<string, unknown>) =>
    (data.session_count as string) ?? null,
  price_min: (data: Record<string, unknown>) =>
    data.price_min != null ? Number(data.price_min) : null,
  price_max: (data: Record<string, unknown>) =>
    data.price_max != null ? Number(data.price_max) : null,
},
```

CSV 파싱 시 모든 값이 string으로 들어오므로 int 변환 필요.

### 6.2 enrich-service.ts — generateSpecs 보강

기존:
```typescript
generateSpecs: [
  { fieldName: "description", promptHint: "Treatment process, expected results, and recovery in 2-3 sentences.", maxLength: 300 },
],
```

추가:
```typescript
generateSpecs: [
  { fieldName: "description", promptHint: "Treatment process, expected results, and recovery in 2-3 sentences.", maxLength: 300 },
  { fieldName: "precautions", promptHint: "Pre-treatment warnings. Include downtime range (e.g. '1-3 days recovery'). Add travel-specific advice for tourists (e.g. schedule timing, sun exposure, activities to avoid). 2-3 sentences.", maxLength: 400 },
  { fieldName: "aftercare", promptHint: "Post-treatment care instructions relevant to tourists. Include what to avoid (sun, saunas, hot springs, alcohol), when normal activities can resume, and signs to watch for. 2-3 sentences.", maxLength: 400 },
],
```

precautions에 다운타임 범위 + 여행 맥락 조언을 포함 (방안 A 결정사항).

**생성 흐름**: ko+en 생성 → ja/zh/es/fr 번역 (기존 description 생성과 동일 패턴).

### 6.3 review-exporter.ts — treatment 리뷰 컬럼 보강

기존 6개 → 15개:

```typescript
treatment: [
  // 분류 (AI)
  { header: "suitable_skin_types", source: "data", path: "suitable_skin_types", format: "array", editable: true },
  { header: "suitable_skin_types_confidence", source: "enrichments", path: "confidence.suitable_skin_types", format: "number", editable: false },
  { header: "target_concerns", source: "data", path: "target_concerns", format: "array", editable: true },
  { header: "target_concerns_confidence", source: "enrichments", path: "confidence.target_concerns", format: "number", editable: false },
  // 의학 데이터 (소스 패스스루 → 검수)
  { header: "duration_minutes", source: "data", path: "duration_minutes", format: "number", editable: true },
  { header: "session_count", source: "data", path: "session_count", format: "string", editable: true },
  { header: "downtime_days", source: "data", path: "downtime_days", format: "number", editable: true },
  { header: "price_min", source: "data", path: "price_min", format: "number", editable: true },
  { header: "price_max", source: "data", path: "price_max", format: "number", editable: true },
  // AI 생성 텍스트
  { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
  { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
  { header: "precautions_ko", source: "data", path: "precautions.ko", format: "string", editable: true },
  { header: "precautions_en", source: "data", path: "precautions.en", format: "string", editable: true },
  { header: "aftercare_ko", source: "data", path: "aftercare.ko", format: "string", editable: true },
  { header: "aftercare_en", source: "data", path: "aftercare.en", format: "string", editable: true },
],
```

---

## 7. 실행 순서 및 의존성

```
Step 1: KB 신규 작성 (thread-lift.md, vitamin-drip.md)
   ↓
Step 2: 매니페스트 의학적 수정 + 3건 추가 + duration/session 추가
   ↓ (완성된 매니페스트가 있어야 변환 가능)
Step 3: YAML → CSV 변환 (treatments-raw.csv)
   ↓ (CSV가 있어야 import 가능)
Step 4: 파이프라인 코드 수정
   ├─ enrich-service.ts: FIELD_MAPPINGS + generateSpecs
   └─ review-exporter.ts: 리뷰 컬럼 16개
   ↓ (코드가 준비되어야 실행 가능)
Step 5: 파이프라인 실행
   ├─ import-csv → treatments-raw.json (RawRecord[])
   ├─ enrich → treatments-enriched.json (번역 6개 언어 + 분류 + 생성)
   └─ export-review → CSV (의학 검수용)
   ↓ (리뷰 CSV가 있어야 검수 가능)
Step 6: 의학적 정확성 검수
   ├─ downtime_days 정확성 (여행 일정 직결)
   ├─ precautions/aftercare 의학적 정확성
   ├─ target_concerns ↔ suitable_skin_types 일관성
   ├─ 가격 범위 시장가 반영 여부
   └─ duration_minutes, session_count 현실성
   ↓ (검수 완료 후)
Step 7: DB 적재
   ├─ import-review (검수 반영 → ValidatedRecord[])
   └─ load (treatments 테이블 UPSERT)
```

---

## 8. 의학적 검수 기준

### 검수 항목

| 항목 | 검증 기준 | 위험도 |
|------|----------|--------|
| downtime_days | KB 범위의 최대값과 일치하는가. 여행 일정에 안전한가 | 높음 |
| precautions | 의학적으로 정확한가. 여행 맥락 조언이 적절한가 | 높음 |
| aftercare | 시술 후 관리가 정확한가. 관광 활동 제한 안내가 적절한가 | 높음 |
| target_concerns | 11-pool 내 값인가. 시술 효과와 일치하는가 | 중간 |
| suitable_skin_types | 금기 피부타입이 제외되었는가 | 중간 |
| duration_minutes | 실제 시술 소요시간과 부합하는가 | 낮음 |
| session_count | 권장 횟수/간격이 현실적인가 | 낮음 |
| price_min/max | 2026년 한국 시장가와 부합하는가 | 낮음 |

### 검수 프로세스

1. export-review 생성 CSV를 Google Sheets에서 열기
2. 각 시술별 위 항목 검증
3. 수정 필요 시 CSV에서 직접 편집
4. `is_approved` = TRUE, `review_notes`에 수정 근거 기록
5. CSV 저장 → import-review로 반영

---

## 9. 수정 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/seed/manifests/treatments.yaml` | 수정 | 의학적 수정 + 3건 추가 + duration/session 추가 |
| `scripts/seed/data/treatments-raw.csv` | 신규 | YAML → CSV 변환 결과 |
| `scripts/seed/lib/enrich-service.ts` | 수정 | FIELD_MAPPINGS.treatment + generateSpecs 2개 추가 |
| `scripts/seed/lib/review-exporter.ts` | 수정 | treatment 리뷰 컬럼 6→16개 |
| `docs/knowledge-base/treatments/thread-lift.md` | 신규 | 쓰레드 리프트 KB |
| `docs/knowledge-base/treatments/vitamin-drip.md` | 신규 | 비타민 수액 KB |

---

## 10. 규칙 준수 확인

| 규칙 | 상태 | 근거 |
|------|------|------|
| P-9 scripts/ 의존 | ✅ | scripts/ → shared/ 만 import. 역방향 없음 |
| P-10 제거 안전성 | ✅ | scripts/seed/ 삭제 시 core/features/client 빌드 에러 0건 |
| G-5 기존 패턴 | ✅ | Doctor(CSV import) + Store/Clinic(FIELD_MAPPINGS) 패턴 따름 |
| G-13 비즈니스 목표 | ✅ | 클리닉 제휴 수수료 + 하이라이트 배지 (PRD §2.3) |
| Q-12 멱등성 | ✅ | UPSERT by id (deterministic UUID) |
| Q-13 FK 순서 | ✅ | LOAD_PHASES: treatment은 Phase A (product보다 먼저) |
| Q-14 스키마 정합성 | ✅ | schema.dbml ↔ migration ↔ validation ↔ domain type 전부 일치 확인 완료 |

---

## 11. 제외 사항 (별도 태스크)

| 항목 | 사유 | 태스크 |
|------|------|--------|
| subcategory | MVP에서 category만으로 충분 (YAGNI) | v0.2 |
| clinic_treatments 정션 | Phase C 작업. 매핑 데이터 별도 수집 필요 | P2-64c |
| LLM 분류 검증 | Phase A 전체 완료 후 일괄 수행 | P2-65 |
| images[] | 별도 에셋 관리 프로세스 | 미정 |
