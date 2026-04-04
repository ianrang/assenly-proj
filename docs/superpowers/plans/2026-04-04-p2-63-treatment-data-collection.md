# P2-63: treatments 53건 데이터 수집 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DOM-2 시술 데이터 53건을 매니페스트 수정 → CSV 변환 → AI 보강 → 의학 검수 → DB 적재로 파이프라인에 투입한다.

**Architecture:** 기존 Channel B (CSV import) 패턴을 따른다. treatments.yaml을 의학적으로 수정하고, YAML→CSV 변환 후 import-csv → enrich → export-review → import-review → load 순서로 실행. enrich-service에 FIELD_MAPPINGS.treatment + generateSpecs(precautions/aftercare) 추가, review-exporter에 의학 검수 컬럼 15개로 확장.

**Tech Stack:** TypeScript, scripts/seed 파이프라인, Claude API (AI 보강), Supabase (DB 적재)

**설계서:** `docs/superpowers/specs/2026-04-04-p2-63-treatment-data-collection-design.md`

---

## 파일 구조

| 파일 | 변경 | 책임 |
|------|------|------|
| `docs/knowledge-base/treatments/thread-lift.md` | 신규 | 쓰레드 리프트 KB 문서 |
| `docs/knowledge-base/treatments/vitamin-drip.md` | 신규 | 비타민 수액 KB 문서 |
| `scripts/seed/manifests/treatments.yaml` | 수정 | 의학적 수정 + 3건 추가 + duration/session 추가 |
| `scripts/seed/data/treatments-raw.csv` | 신규 | YAML→CSV 변환 결과 |
| `scripts/seed/lib/enrich-service.ts` | 수정 (lines 147-153, 216-233) | FIELD_MAPPINGS + generateSpecs 추가 |
| `scripts/seed/lib/enrich-service.test.ts` | 수정 | treatment FIELD_MAPPINGS 테스트 추가 |
| `scripts/seed/lib/review-exporter.ts` | 수정 (lines 91-98) | treatment 리뷰 컬럼 6→15개 |
| `scripts/seed/lib/review-exporter.test.ts` | 수정 | treatment 리뷰 컬럼 테스트 추가 |

---

### Task 1: KB 신규 작성 (thread-lift.md, vitamin-drip.md)

**Files:**
- Create: `docs/knowledge-base/treatments/thread-lift.md`
- Create: `docs/knowledge-base/treatments/vitamin-drip.md`
- Reference: `docs/knowledge-base/treatments/botox.md` (템플릿)

- [ ] **Step 1: thread-lift.md 작성**

`botox.md` 포맷을 따라 작성. 기존 KB 파일은 한국어로 작성.

```markdown
# 실리프팅 (쓰레드 리프트)

## 기본 정보
- **카테고리**: injection
- **시술 원리**: 녹는 실(PDO, PLLA, PCL)을 피부 아래 삽입하여 처진 피부를 물리적으로 당기고, 콜라겐 생성을 유도하는 비수술 리프팅 시술.
- **소요 시간**: 30~60분
- **다운타임**: 5~7일 (붓기, 당김감. 멍 가능)

## 적합 피부타입
- 모든 피부타입 적합 (피부 표면이 아닌 피하조직에 작용)

## 적합 고민
- 주름 (wrinkles): 처진 볼, 턱선, 이중턱 개선

## 시술 횟수 및 비용
- **권장 횟수**: 1~2회 (실 종류에 따라 12~18개월 유지)
- **가격 범위**: ₩300,000~₩1,500,000 (실 종류·개수에 따라)

## 시술 전 주의사항
- 시술 1주 전 혈액 희석제(아스피린, 오메가3) 중단
- 시술 당일 과도한 음주 금지
- 임신·수유 중 시술 불가
- 시술 부위 염증·감염 시 시술 불가

## 시술 후 관리
- 시술 후 2~3일간 과도한 표정 변화 자제
- 1주일간 얼굴 마사지, 사우나, 찜질방 금지
- 2주간 격렬한 운동 자제
- 붓기·멍은 3~7일 내 자연 소실
- 이상 증상(지속적 통증, 실 돌출) 시 즉시 시술 병원 방문

## 한국 의료관광 참고
- 강남·압구정 지역 클리닉에서 외국인 시술 다수 진행
- 실 종류(PDO/PLLA/PCL)에 따라 유지 기간·가격 차이 큼
- 시술 후 5~7일 다운타임 고려하여 여행 초반 시술 권장

> ⚠️ 본 정보는 일반적인 참고용이며, 실제 시술은 전문의 상담 후 결정하세요.
```

- [ ] **Step 2: vitamin-drip.md 작성**

```markdown
# 비타민 수액 (글루타치온 IV)

## 기본 정보
- **카테고리**: injection
- **시술 원리**: 글루타치온, 비타민C, 비타민B군 등을 정맥주사(IV)로 직접 혈관에 투여하여 항산화·미백·피로 회복 효과를 제공하는 시술.
- **소요 시간**: 20~40분
- **다운타임**: 0일 (시술 직후 일상 활동 가능)

## 적합 피부타입
- 모든 피부타입 적합 (전신 투여이므로 피부타입 무관)

## 적합 고민
- 칙칙함 (dullness): 글루타치온의 멜라닌 억제 효과
- 건조함 (dryness): 비타민C·히알루론산 수분 공급

## 시술 횟수 및 비용
- **권장 횟수**: 1~2주 간격 반복 (여행 중 1회도 효과 있음)
- **가격 범위**: ₩50,000~₩200,000 (성분 조합에 따라)

## 시술 전 주의사항
- 공복 상태 피하기 (가벼운 식사 후 시술 권장)
- G6PD 결핍증 환자는 글루타치온 주사 금기
- 임신·수유 중 시술 전 전문의 상담 필수

## 시술 후 관리
- 시술 직후 일상 활동 가능 (다운타임 없음)
- 주사 부위 가벼운 멍·통증 가능 (1~2일 내 소실)
- 시술 후 충분한 수분 섭취 권장
- 음주는 시술 당일 자제 권장

## 한국 의료관광 참고
- 한국 피부과·성형외과에서 '백옥주사', '신데렐라주사'로도 불림
- 여행 중 피로 회복 + 피부 미백을 동시에 원하는 외국인 관광객에게 인기
- 제로 다운타임으로 시술 직후 관광 일정 지속 가능

> ⚠️ 본 정보는 일반적인 참고용이며, 실제 시술은 전문의 상담 후 결정하세요.
```

- [ ] **Step 3: 커밋**

```bash
git add docs/knowledge-base/treatments/thread-lift.md docs/knowledge-base/treatments/vitamin-drip.md
git commit -m "docs(P2-63): KB 신규 2건 — thread-lift, vitamin-drip"
```

---

### Task 2: 매니페스트 수정 (treatments.yaml)

**Files:**
- Modify: `scripts/seed/manifests/treatments.yaml`
- Reference: 설계서 §4.1, §4.2, §4.3

- [ ] **Step 1: 의학적 수정 9건 적용**

`scripts/seed/manifests/treatments.yaml`에서 아래 항목 수정:

**피코 토닝** (line ~28): `downtime_days: 0` → `downtime_days: 3`
**물광주사** (line ~491): `downtime_days: 1` → `downtime_days: 3`
**CO2 프락셔널 레이저** (line ~67): `downtime_days: 7` → `downtime_days: 14`
**아쿠아필** (line ~229):
```yaml
  expected_concerns:
  - pores
  - dullness
  - acne
  - dryness
  expected_skin_types:
  - dry
  - oily
  - combination
  - sensitive
  - normal
```
**LED 테라피** (line ~598): `expected_concerns`에 `- dullness` 추가
**두피 스케일링** (line ~700): `expected_concerns`에 `- dryness`와 `- redness` 추가
**헤어 메조테라피** (line ~712): `expected_concerns`에 `- dryness` 추가
**PRP 모발 재생** (line ~724): `expected_concerns`에 `- dryness` 추가

- [ ] **Step 2: 3건 추가 (하이드라페이셜, 쓰레드 리프트, 비타민 수액)**

파일 끝에 3건 추가:

```yaml
- name_ko: 하이드라페이셜
  name_en: HydraFacial
  category: facial
  expected_concerns:
  - pores
  - dullness
  - dryness
  - acne
  - uneven_tone
  expected_skin_types:
  - dry
  - oily
  - combination
  - sensitive
  - normal
  downtime_days: 0
  price_range_krw:
  - 80000
  - 200000
  duration_minutes: 45
  session_count: "2~4주 간격 반복"
- name_ko: 실리프팅 (쓰레드 리프트)
  name_en: Thread Lift
  category: injection
  expected_concerns:
  - wrinkles
  expected_skin_types:
  - dry
  - normal
  - combination
  - oily
  - sensitive
  downtime_days: 7
  price_range_krw:
  - 300000
  - 1500000
  duration_minutes: 60
  session_count: "1~2회 (12~18개월 유지)"
- name_ko: 비타민 수액 (글루타치온 IV)
  name_en: Vitamin IV Drip (Glutathione)
  category: injection
  expected_concerns:
  - dullness
  - dryness
  expected_skin_types:
  - dry
  - oily
  - combination
  - sensitive
  - normal
  downtime_days: 0
  price_range_krw:
  - 50000
  - 200000
  duration_minutes: 30
  session_count: "1~2주 간격 (여행 중 1회도 가능)"
```

- [ ] **Step 3: 기존 50건에 duration_minutes, session_count 추가**

모든 기존 항목에 `duration_minutes`와 `session_count` 필드 추가. KB가 있는 항목은 KB 값 사용, 없는 항목은 카테고리별 기본값 사용.

**KB 기반 값 (15건 해당)**:

| 시술 | duration_minutes | session_count |
|------|-----------------|---------------|
| 레이저 토닝 | 30 | "5~10회 (1~2주 간격)" |
| 피코 토닝 | 30 | "3~5회 (3~4주 간격)" |
| CO2 프락셔널 레이저 | 45 | "1~3회 (6~8주 간격)" |
| 프락셀 레이저 | 60 | "3~5회 (4~6주 간격)" |
| IPL 광선 치료 | 40 | "3~5회 (3~4주 간격)" |
| 아쿠아필 | 30 | "2~4주 간격 반복" |
| 살리실산 필링 | 30 | "3~6회 (2~4주 간격)" |
| 더마펜 MTS | 60 | "3~6회 (4주 간격)" |
| 보톡스 이마/눈가/턱 | 20 | "3~6개월마다 반복" |
| 필러 팔자/입술/볼륨/턱끝/쥬베덤 | 30 | "6~18개월마다 반복" |
| LED 테라피 | 20 | "주 2~3회, 8~12회" |
| 두피 스케일링 | 60 | "주 1회, 8~12회" |
| 물광주사 | 30 | "3~4회 (2~4주 간격)" |

**카테고리 기본값 (나머지 항목)**:

| 카테고리 | duration_minutes | session_count |
|---------|-----------------|---------------|
| laser | 30 | "3~5회 (2~4주 간격)" |
| skin | 45 | "3~5회 (2~4주 간격)" |
| injection | 20 | "3~6개월마다 반복" |
| facial | 45 | "2~4주 간격 반복" |
| body | 45 | "2~4회 (4~8주 간격)" |
| hair | 45 | "주 1회, 8~12회" |

- [ ] **Step 4: 검증 — 총 53건, 모든 항목에 duration_minutes/session_count 존재**

```bash
cd /Users/ian/dev/side-proj && node -e "
const yaml = require('js-yaml');
const fs = require('fs');
const data = yaml.load(fs.readFileSync('scripts/seed/manifests/treatments.yaml', 'utf8'));
const treatments = data.treatments;
console.log('총 건수:', treatments.length);
const missing = treatments.filter(t => !t.duration_minutes || !t.session_count);
console.log('duration/session 누락:', missing.length);
if (missing.length > 0) missing.forEach(t => console.log(' -', t.name_en));
"
```

Expected: `총 건수: 53`, `duration/session 누락: 0`

- [ ] **Step 5: 커밋**

```bash
git add scripts/seed/manifests/treatments.yaml
git commit -m "data(P2-63): treatments.yaml 의학적 수정 9건 + 3건 추가 + duration/session 53건"
```

---

### Task 3: YAML → CSV 변환

**Files:**
- Create: `scripts/seed/data/treatments-raw.csv`
- Reference: 설계서 §5

- [ ] **Step 1: YAML → CSV 변환 스크립트 실행**

```bash
cd /Users/ian/dev/side-proj && node -e "
const yaml = require('js-yaml');
const fs = require('fs');
const data = yaml.load(fs.readFileSync('scripts/seed/manifests/treatments.yaml', 'utf8'));

const header = 'id,name_ko,name_en,category,target_concerns,suitable_skin_types,price_min,price_max,downtime_days,duration_minutes,session_count';
const rows = data.treatments.map(t => {
  const id = 'treat-' + t.name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/,'');
  const concerns = (t.expected_concerns || []).join('|');
  const skins = (t.expected_skin_types || []).join('|');
  const priceMin = t.price_range_krw?.[0] ?? '';
  const priceMax = t.price_range_krw?.[1] ?? '';
  const session = (t.session_count || '').includes(',') ? '\"' + t.session_count + '\"' : t.session_count || '';
  return [id, t.name_ko, t.name_en, t.category, concerns, skins, priceMin, priceMax, t.downtime_days, t.duration_minutes, session].join(',');
});

const csv = [header, ...rows].join('\n') + '\n';
fs.writeFileSync('scripts/seed/data/treatments-raw.csv', csv);
console.log('Written', rows.length, 'rows to treatments-raw.csv');
"
```

- [ ] **Step 2: CSV 검증 — 53행, 11컬럼, id 유일성**

```bash
cd /Users/ian/dev/side-proj && node -e "
const fs = require('fs');
const csv = fs.readFileSync('scripts/seed/data/treatments-raw.csv', 'utf8').trim().split('\n');
console.log('행 수 (헤더 포함):', csv.length);
console.log('데이터 행:', csv.length - 1);
const header = csv[0].split(',');
console.log('컬럼:', header.length, header);
const ids = csv.slice(1).map(r => r.split(',')[0]);
const unique = new Set(ids);
console.log('ID 유일성:', ids.length === unique.size ? 'OK' : 'DUPLICATE');
if (ids.length !== unique.size) {
  const dups = ids.filter((v,i) => ids.indexOf(v) !== i);
  console.log('중복:', dups);
}
"
```

Expected: `데이터 행: 53`, `컬럼: 11`, `ID 유일성: OK`

- [ ] **Step 3: 커밋**

```bash
git add scripts/seed/data/treatments-raw.csv
git commit -m "data(P2-63): treatments-raw.csv 53건 (YAML→CSV 변환)"
```

---

### Task 4: enrich-service.ts 수정 (FIELD_MAPPINGS + generateSpecs)

**Files:**
- Modify: `scripts/seed/lib/enrich-service.ts:147-153` (ENRICHMENT_CONFIG.treatment)
- Modify: `scripts/seed/lib/enrich-service.ts:216-233` (FIELD_MAPPINGS)
- Test: `scripts/seed/lib/enrich-service.test.ts`

- [ ] **Step 1: FIELD_MAPPINGS.treatment 테스트 작성**

`scripts/seed/lib/enrich-service.test.ts`에 treatment FIELD_MAPPINGS 테스트 추가 (기존 store/ingredient 패턴 따름):

```typescript
it("treatment: FIELD_MAPPINGS — duration_minutes, session_count, price_min, price_max 변환", async () => {
  const records: RawRecord[] = [
    {
      source: "csv",
      sourceId: "treat-botox-forehead",
      entityType: "treatment",
      data: {
        name_ko: "보톡스 이마",
        name_en: "Botox Forehead",
        category: "injection",
        duration_minutes: "20",
        session_count: "3~6개월마다 반복",
        price_min: "50000",
        price_max: "150000",
        downtime_days: "0",
        target_concerns: "wrinkles",
        suitable_skin_types: "dry|normal|combination|oily|sensitive",
      },
      fetchedAt: new Date().toISOString(),
    },
  ];

  const result = await enrichRecords(records, {
    skipTranslation: true,
    skipClassification: true,
    skipGeneration: true,
  });

  expect(result[0].data.duration_minutes).toBe(20);
  expect(result[0].data.session_count).toBe("3~6개월마다 반복");
  expect(result[0].data.price_min).toBe(50000);
  expect(result[0].data.price_max).toBe(150000);
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /Users/ian/dev/side-proj && npx vitest run scripts/seed/lib/enrich-service.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `duration_minutes`가 string "20"으로 남아있음 (FIELD_MAPPINGS 미적용)

- [ ] **Step 3: FIELD_MAPPINGS.treatment 구현**

`scripts/seed/lib/enrich-service.ts`의 FIELD_MAPPINGS 객체(line ~233 이후)에 treatment 엔트리 추가:

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

- [ ] **Step 4: generateSpecs에 precautions, aftercare 추가**

`scripts/seed/lib/enrich-service.ts`의 ENRICHMENT_CONFIG.treatment.generateSpecs(line ~150-152)를 교체:

```typescript
generateSpecs: [
  { fieldName: "description", promptHint: "Treatment process, expected results, and recovery in 2-3 sentences.", maxLength: 300 },
  { fieldName: "precautions", promptHint: "Pre-treatment warnings. Include downtime range (e.g. '1-3 days recovery'). Add travel-specific advice for tourists (e.g. schedule timing, sun exposure, activities to avoid). 2-3 sentences.", maxLength: 400 },
  { fieldName: "aftercare", promptHint: "Post-treatment care instructions relevant to tourists. Include what to avoid (sun, saunas, hot springs, alcohol), when normal activities can resume, and signs to watch for. 2-3 sentences.", maxLength: 400 },
],
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

```bash
cd /Users/ian/dev/side-proj && npx vitest run scripts/seed/lib/enrich-service.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: ALL PASS

- [ ] **Step 6: 커밋**

```bash
git add scripts/seed/lib/enrich-service.ts scripts/seed/lib/enrich-service.test.ts
git commit -m "feat(P2-63): enrich-service FIELD_MAPPINGS.treatment + generateSpecs(precautions/aftercare)"
```

---

### Task 5: review-exporter.ts 수정 (treatment 리뷰 컬럼 15개)

**Files:**
- Modify: `scripts/seed/lib/review-exporter.ts:91-98` (ENTITY_REVIEW_COLUMNS.treatment)
- Test: `scripts/seed/lib/review-exporter.test.ts`

- [ ] **Step 1: treatment 리뷰 컬럼 테스트 작성**

`scripts/seed/lib/review-exporter.test.ts`에 treatment export 테스트 추가 (기존 store 패턴 따름):

```typescript
it("treatment export — 15개 엔티티 컬럼 + 공통 컬럼 출력", async () => {
  const records: EnrichedRecord[] = [
    {
      source: "csv",
      sourceId: "treat-botox-forehead",
      entityType: "treatment",
      data: {
        id: "uuid-treat-botox",
        name: { ko: "보톡스 이마", en: "Botox Forehead" },
        suitable_skin_types: ["dry", "normal"],
        target_concerns: ["wrinkles"],
        duration_minutes: 20,
        session_count: "3~6개월마다 반복",
        downtime_days: 0,
        price_min: 50000,
        price_max: 150000,
        description: { ko: "설명", en: "Description" },
        precautions: { ko: "주의사항", en: "Precautions" },
        aftercare: { ko: "사후관리", en: "Aftercare" },
      },
      enrichments: {
        translatedFields: ["name", "description"],
        classifiedFields: ["suitable_skin_types", "target_concerns"],
        confidence: { suitable_skin_types: 0.95, target_concerns: 0.9 },
      },
      enrichedAt: new Date().toISOString(),
    },
  ];

  const result = await exportForReview(records, { outputDir: tmpDir });

  const csvContent = fs.readFileSync(
    path.join(tmpDir, result.files[0].csvPath),
    "utf8",
  );
  const headers = csvContent.split("\n")[0].split(",");

  // 공통 4 + 엔티티 15 + 메타 2 = 21
  expect(headers).toHaveLength(21);
  expect(headers).toContain("duration_minutes");
  expect(headers).toContain("session_count");
  expect(headers).toContain("downtime_days");
  expect(headers).toContain("price_min");
  expect(headers).toContain("price_max");
  expect(headers).toContain("precautions_ko");
  expect(headers).toContain("precautions_en");
  expect(headers).toContain("aftercare_ko");
  expect(headers).toContain("aftercare_en");

  const dataRow = csvContent.split("\n")[1];
  expect(dataRow).toContain("dry|normal");
  expect(dataRow).toContain("wrinkles");
  expect(dataRow).toContain("20");
  expect(dataRow).toContain("주의사항");
  expect(dataRow).toContain("Aftercare");
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd /Users/ian/dev/side-proj && npx vitest run scripts/seed/lib/review-exporter.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — 현재 treatment 컬럼이 6개뿐이므로 headers.length ≠ 21

- [ ] **Step 3: ENTITY_REVIEW_COLUMNS.treatment 교체**

`scripts/seed/lib/review-exporter.ts`의 treatment 엔트리(lines 91-98)를 교체:

```typescript
treatment: [
  { header: "suitable_skin_types", source: "data", path: "suitable_skin_types", format: "array", editable: true },
  { header: "suitable_skin_types_confidence", source: "enrichments", path: "confidence.suitable_skin_types", format: "number", editable: false },
  { header: "target_concerns", source: "data", path: "target_concerns", format: "array", editable: true },
  { header: "target_concerns_confidence", source: "enrichments", path: "confidence.target_concerns", format: "number", editable: false },
  { header: "duration_minutes", source: "data", path: "duration_minutes", format: "number", editable: true },
  { header: "session_count", source: "data", path: "session_count", format: "string", editable: true },
  { header: "downtime_days", source: "data", path: "downtime_days", format: "number", editable: true },
  { header: "price_min", source: "data", path: "price_min", format: "number", editable: true },
  { header: "price_max", source: "data", path: "price_max", format: "number", editable: true },
  { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
  { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
  { header: "precautions_ko", source: "data", path: "precautions.ko", format: "string", editable: true },
  { header: "precautions_en", source: "data", path: "precautions.en", format: "string", editable: true },
  { header: "aftercare_ko", source: "data", path: "aftercare.ko", format: "string", editable: true },
  { header: "aftercare_en", source: "data", path: "aftercare.en", format: "string", editable: true },
],
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
cd /Users/ian/dev/side-proj && npx vitest run scripts/seed/lib/review-exporter.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: ALL PASS

- [ ] **Step 5: 커밋**

```bash
git add scripts/seed/lib/review-exporter.ts scripts/seed/lib/review-exporter.test.ts
git commit -m "feat(P2-63): review-exporter treatment 리뷰 컬럼 6→15개 (의학 검수용)"
```

---

### Task 6: 파이프라인 실행 (import-csv → enrich → export-review)

**Files:**
- Input: `scripts/seed/data/treatments-raw.csv`
- Output: `scripts/seed/data/treatments-raw.json`, `treatments-enriched.json`
- Output: `scripts/seed/review-data/enriched-treatment-*.json`, `review-treatment-*.csv`

- [ ] **Step 1: import-csv 실행**

```bash
cd /Users/ian/dev/side-proj && npx tsx scripts/seed/import-csv.ts \
  --file scripts/seed/data/treatments-raw.csv \
  --entity-type treatment \
  --output scripts/seed/data/treatments-raw.json
```

Expected: `[import-csv] 53 records → scripts/seed/data/treatments-raw.json`

- [ ] **Step 2: import 결과 검증**

```bash
cd /Users/ian/dev/side-proj && node -e "
const data = require('./scripts/seed/data/treatments-raw.json');
console.log('records:', data.length);
console.log('first sourceId:', data[0].sourceId);
console.log('first category:', data[0].data.category);
console.log('all entityType treatment:', data.every(r => r.entityType === 'treatment'));
"
```

Expected: `records: 53`, `first sourceId: treat-laser-toning`, `all entityType treatment: true`

- [ ] **Step 3: enrich 실행**

```bash
cd /Users/ian/dev/side-proj && npx tsx scripts/seed/enrich.ts \
  --input scripts/seed/data/treatments-raw.json \
  --output scripts/seed/data/treatments-enriched.json \
  --entity-type treatment
```

Expected: 53건 enrich 완료 (번역 6개 언어 + 분류 + description/precautions/aftercare 생성). AI API 호출 소요 ~5-10분.

- [ ] **Step 4: enrich 결과 검증**

```bash
cd /Users/ian/dev/side-proj && node -e "
const data = require('./scripts/seed/data/treatments-enriched.json');
console.log('records:', data.length);
const first = data[0];
console.log('name languages:', Object.keys(first.data.name || {}));
console.log('has description:', !!first.data.description);
console.log('has precautions:', !!first.data.precautions);
console.log('has aftercare:', !!first.data.aftercare);
console.log('duration_minutes type:', typeof first.data.duration_minutes);
console.log('price_min type:', typeof first.data.price_min);
"
```

Expected: `name languages: [ko, en, ja, zh, es, fr]`, `has precautions: true`, `duration_minutes type: number`

- [ ] **Step 5: export-review 실행**

```bash
cd /Users/ian/dev/side-proj && npx tsx scripts/seed/export-review.ts \
  --input scripts/seed/data/treatments-enriched.json \
  --output-dir scripts/seed/review-data
```

Expected: `enriched-treatment-*.json` + `review-treatment-*.csv` 생성

- [ ] **Step 6: 리뷰 CSV 검증**

```bash
cd /Users/ian/dev/side-proj && ls -la scripts/seed/review-data/review-treatment-*.csv && head -2 scripts/seed/review-data/review-treatment-*.csv
```

Expected: CSV 첫 행에 21개 컬럼 (id, source_id, name_ko, name_en + 15개 엔티티 + is_approved, review_notes)

---

### Task 7: 의학적 정확성 검수

- [ ] **Step 1: 리뷰 CSV를 열고 검수 수행**

Google Sheets에서 `review-treatment-*.csv` 열기. 다음 항목 검증:

1. **downtime_days**: KB 최대값 원칙 준수 여부
2. **precautions**: 의학적 정확성 + 여행 맥락 조언 포함 여부
3. **aftercare**: 시술 후 관리 정확성 + 관광 활동 제한 안내
4. **target_concerns**: 11-pool 내 값, 시술 효과와 일치
5. **suitable_skin_types**: 금기 피부타입 제외 여부
6. **duration_minutes / session_count**: 현실성
7. **price_min / price_max**: 2026 시장가 부합

- [ ] **Step 2: 수정 사항 CSV에 반영**

수정 필요 항목은 CSV에서 직접 편집. `is_approved` = `true`, `review_notes`에 수정 근거 기록.

- [ ] **Step 3: 검수 완료 CSV 저장**

수정된 CSV를 `scripts/seed/review-data/` 디렉토리에 저장 (원본 덮어쓰기).

---

### Task 8: DB 적재 (import-review → load)

**Files:**
- Input: `scripts/seed/review-data/enriched-treatment-*.json`, `review-treatment-*.csv`
- Target: Supabase `treatments` 테이블

- [ ] **Step 1: import-review 실행**

```bash
cd /Users/ian/dev/side-proj && npx tsx scripts/seed/import-review.ts \
  --enriched-json scripts/seed/review-data/enriched-treatment-*.json \
  --review-csv scripts/seed/review-data/review-treatment-*.csv \
  --output scripts/seed/data/treatments-validated.json
```

Expected: `validated records: 53` (is_approved가 true인 레코드)

- [ ] **Step 2: load 실행**

```bash
cd /Users/ian/dev/side-proj && npx tsx scripts/seed/load.ts \
  --input scripts/seed/data/treatments-validated.json \
  --entity-type treatment
```

Expected: `[load] treatment: 53 inserted/updated, 0 failed`

- [ ] **Step 3: DB 검증**

```bash
cd /Users/ian/dev/side-proj && npx tsx -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { count } = await supabase.from('treatments').select('*', { count: 'exact', head: true });
console.log('treatments count:', count);
const { data } = await supabase.from('treatments').select('name, category, downtime_days, duration_minutes').limit(3);
console.log('sample:', JSON.stringify(data, null, 2));
"
```

Expected: `treatments count: 53`

- [ ] **Step 4: 최종 커밋**

```bash
git add scripts/seed/data/treatments-raw.json scripts/seed/data/treatments-enriched.json scripts/seed/data/treatments-validated.json
git commit -m "feat(P2-63): treatments 53건 AI 보강 → 검수 → DB 적재 완료"
```

- [ ] **Step 5: npx tsc --noEmit 빌드 검증**

```bash
cd /Users/ian/dev/side-proj && npx tsc --noEmit
```

Expected: 에러 없음

---

## 전체 테스트 실행

```bash
cd /Users/ian/dev/side-proj && npx vitest run scripts/seed/lib/ --reporter=verbose
```

Expected: ALL PASS (enrich-service + review-exporter + 기존 테스트 모두)
