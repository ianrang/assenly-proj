# P2-64c-3 재작업: 카카오맵 태그 기반 clinic_treatments 정밀 매핑

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오맵 클리닉 페이지의 태그를 추��하여, 클리닉별 실제 시술 매핑(clinic_treatments junction)을 생성한다. 기존 전조합 9,411건을 클리닉별 개별 매핑 ~2,000-3,000건으로 교체한다.

**Architecture:** 3단계 파이프라인. (1) Playwright로 225곳 카카오맵 태그 수집 → JSON. (2) LLM이 한국어 태그 → treatments 53건 매핑 → D-7 검수 CSV. (3) 기존 junction DELETE + 검수 완료 CSV 적재. 태그 없는 클리닉은 기존 규칙 기반 fallback.

**Tech Stack:** Playwright (기존 설치), Vercel AI SDK generateText(), 기��� loadJunctions(), P2-64c-2 패턴(ingredient-mapper) 참조

---

> 버전: 1.0
> 작성일: 2026-04-06
> 선행: P2-64c-3 기존 구현 (commit 0656297, 9,411건 규칙 기반 — 교체 대상)
> 정본: schema.dbml clinic_treatments, PRD §3.5 카드 렌더링 규칙, tool-spec §1 시술 출력
> 패턴 참조: P2-64c-2 generate-product-ingredients.ts + ingredient-mapper.ts

## 0. Step 0 검증 결과 (완료)

5곳 샘플 카카오맵 페��지 확��� — 태그 ��재율 5/5 (100%):

| 클리닉 | 유형 | 지역 | 태그 수 | 태그 예시 |
|--------|------|------|:------:|----------|
| CNP차앤박피부과 도곡양재점 | 피부과 | 강남 | 14 | 보톡스, 써마지리프팅, 리쥬란, 색소치료 |
| 아르스킨의원 | 피부과 | 홍대 | 4 | 보톡스, 써마지리프팅, 울쎄라, 필러 |
| 아이디병원 | 성형외과 | 강남 | 15 | 가슴성형, 눈매교정, 리프팅, 보톡스 |
| 명동비엘���스의원 | 피부과 | 명동 | 3 | 사각���보톡스, 온다리프팅, 울쎄라써��지 |
| 눈피부과의원 | 피부과 | 강남 | 4 | 눈밑지방재배치, 레이저���술, 보톡스 |

태그→시술 매핑 유형:
- **직접 매칭**: #보톡스→Botox, #써마지리프팅→Thermage FLX, #리쥬란→Rejuran Healer, #울쎄라→Ultherapy
- **관심사/부위 태그**: #색소치료→Laser Toning/Pico Toning/IPL, #여드름→Acne Treatment/Salicylic Peel
- **매칭 불가**: #가슴성형, #쌍꺼풀수술, #양악수술 (우리 53건에 없음 → 스킵)

## 1. 파일 구조

| 파일 | 작업 | 책임 |
|------|------|------|
| `scripts/seed/extract-clinic-tags.ts` | CREATE | Playwright로 카카오맵 225곳 태그 추출 → JSON |
| `scripts/seed/lib/clinic-treatment-mapper.ts` | CREATE | 태그→시술 매핑 순수 함수 (프롬프트, 파싱, junction 생성) |
| `scripts/seed/lib/clinic-treatment-mapper.test.ts` | CREATE | mapper 순수 함수 단위 테스트 |
| `scripts/seed/generate-clinic-treatments.ts` | REWRITE | LLM + D-7 + fallback 통합 (기존 규칙 기반 교체) |

`src/` 변경 0건. 스키마 변경 0건. `shared/validation/relation.ts` 변경 0건.

## 2. 아키텍처 검증

| 규칙 | 검증 |
|------|------|
| P-2 Core 불변 | core/ 수정 0건 |
| P-9 scripts/ 자격 | scripts/ → shared/ + DB 접근. server/ import 0건 |
| P-10 제거 안전성 | 스크립트 삭제해도 src/ 빌드 무영향 |
| G-5 기존 패턴 | P2-64c-2 (ingredient-mapper + generate-product-ingredients) 패턴 동일 |
| G-12 외부 소스 ���증 | Step 0에서 카카오맵 태그 존재 확인 완료. D-7 검수로 정확성 보장 |
| Q-11 복합 쓰기 원자성 | DELETE + INSERT를 단일 스크립트 내에서 순차 실행 |
| Q-12 멱등성 | 재실행 시 DELETE → 재적재로 동일 결과 |
| Q-14 스키�� 정합성 | clinicTreatmentRelationSchema = {clinic_id: uuid, treatment_id: uuid} 동일 |

## 3. 실행 순서

```
Task 1: clinic-treatment-mapper.ts 순수 함수 모듈 (TDD)
Task 2: clinic-treatment-mapper.test.ts 단위 테스트
Task 3: extract-clinic-tags.ts 태그 추출 스크립트
Task 4: generate-clinic-treatments.ts 리라이트 (LLM + D-7 + fallback)
Task 5: 실행 — 태그 추출 + LLM 매핑 + D-7 검수 CSV 생성
Task 6: D-7 검수 (사용자)
Task 7: DB 적재 — DELETE 기존 + 검수 데이터 로드
```

---

### Task 1: clinic-treatment-mapper.ts — 순수 함수 모듈

**Files:**
- Create: `scripts/seed/lib/clinic-treatment-mapper.ts`

ingredient-mapper.ts 패턴��� 따르되, 태그→시술 매핑에 특화.

- [ ] **Step 1: 타입 + 상수 정의**

```typescript
// scripts/seed/lib/clinic-treatment-mapper.ts
// ============================================================
// Clinic-Treatment Tag Mapping — 순수 함수 모듈
// 카카오맵 태그(한국어) → treatments 53건 매핑
// LLM 응답 파��, junction 데이터 생성, fallback 규칙
// P-9: scripts/ 내부 전용. server/ import 금지.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

// ── 타입 (L-14: 모듈 전용) ──────────────────────────────────

/** 카카오맵에서 추출한 클리닉 태그 */
export interface ClinicTagData {
  clinicId: string;
  clinicNameKo: string;
  clinicType: string;
  tags: string[];
}

/** 시술 참조 데이터 */
export interface TreatmentRef {
  id: string;
  nameKo: string;
  nameEn: string;
  category: string;
}

/** 단일 클리닉 LLM 매핑 결과 */
export interface TagMappingResult {
  clinicId: string;
  clinicNameKo: string;
  treatmentIds: string[];
  unmatchedTags: string[];
}

/** DB 적재용 junction 행 */
export interface ClinicTreatmentRow {
  clinic_id: string;
  treatment_id: string;
}

// ── 상수 (G-10) ────────────────────────────────────────────

/** 제외할 비시술 태그 */
const EXCLUDED_TAG_PREFIXES = ["#1차병원", "#2차병원", "#3차병원"];

/** clinic_type → 기본 제공 treatment categories (fallback용) */
export const FALLBACK_CATEGORIES: Record<string, string[]> = {
  dermatology: ["laser", "skin", "facial", "injection"],
  plastic_surgery: ["injection", "body", "facial"],
};

/** hair 키워드 (fallback용) */
export const HAIR_KEYWORDS = ["모발", "탈모", "hair"];
```

- [ ] **Step 2: 태�� 전처리 함수**

```typescript
// ── 태그 전처리 ─────────────────────────────────────────────

/** 태그 배열에서 '#' 접두사 제거 + 비시술 태그 필터링 */
export function cleanTags(rawTags: string[]): string[] {
  return rawTags
    .filter((tag) => !EXCLUDED_TAG_PREFIXES.some((p) => tag.startsWith(p)))
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean);
}
```

- [ ] **Step 3: 시술 목��� + 프롬프트 구성 함수**

```typescript
// ─�� 프롬프트 구성 ───────────────────────────────────────────

/** 시술 목록 → 프롬프트용 텍스트 */
export function buildTreatmentListText(treatments: TreatmentRef[]): string {
  return treatments
    .map((t, i) => `${i + 1}. ${t.nameKo} (${t.nameEn}) [${t.category}]`)
    .join("\n");
}

/** 클리닉 태그 + 시술 목록 → LLM 매핑 프롬프트 */
export function buildTagMappingPrompt(
  clinic: ClinicTagData,
  treatmentListText: string,
): string {
  const cleanedTags = cleanTags(clinic.tags);
  return `You are a Korean dermatology and plastic surgery expert.

A clinic "${clinic.clinicNameKo}" (type: ${clinic.clinicType}) has registered these service tags on Kakao Map:
${cleanedTags.map((t) => `- ${t}`).join("\n")}

From the treatment database below, identify which treatments this clinic likely offers based on their tags.

RULES:
- Match tags to treatments by meaning (e.g., "보톡스" matches all Botox variants, "색소치료" matches laser/peel treatments for pigmentation)
- A tag may match MULTIPLE treatments (e.g., "필러" → all filler types)
- A tag may match ZERO treatments if it's not in our database (e.g., "쌍꺼풀수술")
- Only include treatments you are confident this clinic offers based on the tags
- Return treatment numbers from the list, not names
- Return ONLY valid JSON, no markdown fences, no explanation

Available treatments:
${treatmentListText}

Return JSON: {"treatment_numbers": [1, 5, 12, ...], "unmatched_tags": ["tag1", "tag2"]}`;
}
```

- [ ] **Step 4: LLM 응답 파싱 함수**

```typescript
// ── LLM 응답 파싱 ───────────────────────────────────────────

/** LLM JSON 응답 → treatment indices + unmatched tags */
export function parseTagMappingResponse(
  text: string,
  treatments: TreatmentRef[],
): { treatmentIds: string[]; unmatchedTags: string[] } | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed: { treatment_numbers?: unknown; unmatched_tags?: unknown } =
      JSON.parse(jsonMatch[0]);

    const rawNumbers = Array.isArray(parsed.treatment_numbers)
      ? parsed.treatment_numbers
      : [];
    const rawUnmatched = Array.isArray(parsed.unmatched_tags)
      ? parsed.unmatched_tags
      : [];

    // 1-based index → treatment ID 변환
    const treatmentIds = rawNumbers
      .filter((n): n is number => typeof n === "number" && n >= 1 && n <= treatments.length)
      .map((n) => treatments[n - 1].id);

    // 중복 제거
    const uniqueIds = [...new Set(treatmentIds)];

    const unmatchedTags = rawUnmatched
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim());

    return { treatmentIds: uniqueIds, unmatchedTags };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Junction 데이터 생성 함수**

```typescript
// ── Junction 데이터 생성 ────────────────────────────────────

/** TagMappingResult[] → ClinicTreatmentRow[] (중복 방지) */
export function buildClinicTreatmentJunctions(
  mappings: TagMappingResult[],
): ClinicTreatmentRow[] {
  const rows: ClinicTreatmentRow[] = [];
  const seen = new Set<string>();

  for (const mapping of mappings) {
    for (const treatmentId of mapping.treatmentIds) {
      const key = `${mapping.clinicId}:${treatmentId}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ clinic_id: mapping.clinicId, treatment_id: treatmentId });
      }
    }
  }

  return rows;
}
```

- [ ] **Step 6: Fallback 규칙 기반 매핑 함수**

```typescript
// ── Fallback 규칙 기반 매핑 ��────────────────────────────────

/** 태그 없는 클리닉 → clinic_type 기반 fallback junction 생성 */
export function buildFallbackJunctions(
  clinics: Array<{ id: string; clinicType: string; nameKo: string }>,
  treatments: TreatmentRef[],
): ClinicTreatmentRow[] {
  const byCategory = new Map<string, string[]>();
  for (const t of treatments) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t.id);
    byCategory.set(t.category, list);
  }

  const hairTreatmentIds = byCategory.get("hair") ?? [];
  const rows: ClinicTreatmentRow[] = [];
  const seen = new Set<string>();

  for (const clinic of clinics) {
    const categories = FALLBACK_CATEGORIES[clinic.clinicType] ?? [];
    for (const cat of categories) {
      for (const treatmentId of byCategory.get(cat) ?? []) {
        const key = `${clinic.id}:${treatmentId}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({ clinic_id: clinic.id, treatment_id: treatmentId });
        }
      }
    }

    // hair 키워드 매칭
    if (HAIR_KEYWORDS.some((kw) => clinic.nameKo.includes(kw))) {
      for (const treatmentId of hairTreatmentIds) {
        const key = `${clinic.id}:${treatmentId}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({ clinic_id: clinic.id, treatment_id: treatmentId });
        }
      }
    }
  }

  return rows;
}
```

- [ ] **Step 7: 커밋**

```bash
git add scripts/seed/lib/clinic-treatment-mapper.ts
git commit -m "feat(P2-64c-3): clinic-treatment-mapper 순수 함수 모듈 추가

태그 전처리, LLM 프롬프트 구성, 응답 파싱, junction 생성,
fallback 규칙 기반 매핑 함수 ���함. ingredient-mapper.ts 패턴 준수."
```

---

### Task 2: clinic-treatment-mapper.test.ts — 단위 테스트

**Files:**
- Create: `scripts/seed/lib/clinic-treatment-mapper.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  cleanTags,
  buildTreatmentListText,
  buildTagMappingPrompt,
  parseTagMappingResponse,
  buildClinicTreatmentJunctions,
  buildFallbackJunctions,
  type TreatmentRef,
  type ClinicTagData,
  type TagMappingResult,
} from "./clinic-treatment-mapper";

// ─�� Fixture ─────────────────────────────────────────────────

const TREATMENTS: TreatmentRef[] = [
  { id: "t-1", nameKo: "레이저 토닝", nameEn: "Laser Toning", category: "laser" },
  { id: "t-2", nameKo: "보톡스 이마", nameEn: "Botox Forehead", category: "injection" },
  { id: "t-3", nameKo: "보톡스 턱 (사각턱)", nameEn: "Botox for Jaw", category: "injection" },
  { id: "t-4", nameKo: "써마지 FLX", nameEn: "Thermage FLX", category: "laser" },
  { id: "t-5", nameKo: "아쿠아필", nameEn: "Aqua Peel", category: "skin" },
  { id: "t-6", nameKo: "두피 스케일링", nameEn: "Scalp Scaling", category: "hair" },
];

// ── cleanTags ───────────────────────────────────────────────

describe("cleanTags", () => {
  it("removes # prefix and filters excluded tags", () => {
    const input = ["#1차병원", "#보톡스", "#써마지리프팅", "#피부관리"];
    const result = cleanTags(input);
    expect(result).toEqual(["보톡스", "써마지리프팅", "피부관리"]);
  });

  it("returns empty array for empty input", () => {
    expect(cleanTags([])).toEqual([]);
  });

  it("handles tags without # prefix", () => {
    const result = cleanTags(["보톡스", "#필러"]);
    expect(result).toEqual(["보톡스", "필러"]);
  });
});

// ── buildTreatmentListText ──────────────────────────────────

describe("buildTreatmentListText", () => {
  it("formats treatments as numbered list", () => {
    const result = buildTreatmentListText(TREATMENTS.slice(0, 2));
    expect(result).toContain("1. 레이저 토닝 (Laser Toning) [laser]");
    expect(result).toContain("2. 보톡스 이마 (Botox Forehead) [injection]");
  });
});

// ── buildTagMappingPrompt ───────────────────────────────────

describe("buildTagMappingPrompt", () => {
  it("includes clinic info and cleaned tags", () => {
    const clinic: ClinicTagData = {
      clinicId: "c-1",
      clinicNameKo: "CNP피부과",
      clinicType: "dermatology",
      tags: ["#1차병원", "#보톡스", "#색소치료"],
    };
    const result = buildTagMappingPrompt(clinic, buildTreatmentListText(TREATMENTS));
    expect(result).toContain("CNP피부과");
    expect(result).toContain("dermatology");
    expect(result).toContain("- 보톡스");
    expect(result).toContain("- 색소치료");
    expect(result).not.toContain("1차병원");
  });
});

// ── parseTagMappingResponse ─────────────────────────────────

describe("parseTagMappingResponse", () => {
  it("parses valid JSON with treatment numbers", () => {
    const text = '{"treatment_numbers": [1, 2, 3], "unmatched_tags": ["가슴성형"]}';
    const result = parseTagMappingResponse(text, TREATMENTS);
    expect(result).not.toBeNull();
    expect(result!.treatmentIds).toEqual(["t-1", "t-2", "t-3"]);
    expect(result!.unmatchedTags).toEqual(["가슴성형"]);
  });

  it("deduplicates treatment numbers", () => {
    const text = '{"treatment_numbers": [1, 1, 2], "unmatched_tags": []}';
    const result = parseTagMappingResponse(text, TREATMENTS);
    expect(result!.treatmentIds).toEqual(["t-1", "t-2"]);
  });

  it("ignores out-of-range numbers", () => {
    const text = '{"treatment_numbers": [0, 1, 99], "unmatched_tags": []}';
    const result = parseTagMappingResponse(text, TREATMENTS);
    expect(result!.treatmentIds).toEqual(["t-1"]);
  });

  it("extracts JSON from markdown-wrapped response", () => {
    const text = '```json\n{"treatment_numbers": [4], "unmatched_tags": []}\n```';
    const result = parseTagMappingResponse(text, TREATMENTS);
    expect(result!.treatmentIds).toEqual(["t-4"]);
  });

  it("returns null for unparseable text", () => {
    expect(parseTagMappingResponse("no json here", TREATMENTS)).toBeNull();
  });
});

// ── buildClinicTreatmentJunctions ───────────────────────────

describe("buildClinicTreatmentJunctions", () => {
  it("converts mappings to junction rows with dedup", () => {
    const mappings: TagMappingResult[] = [
      { clinicId: "c-1", clinicNameKo: "A", treatmentIds: ["t-1", "t-2"], unmatchedTags: [] },
      { clinicId: "c-2", clinicNameKo: "B", treatmentIds: ["t-1", "t-3"], unmatchedTags: [] },
    ];
    const rows = buildClinicTreatmentJunctions(mappings);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ clinic_id: "c-1", treatment_id: "t-1" });
  });

  it("handles duplicate clinic-treatment pairs", () => {
    const mappings: TagMappingResult[] = [
      { clinicId: "c-1", clinicNameKo: "A", treatmentIds: ["t-1", "t-1"], unmatchedTags: [] },
    ];
    const rows = buildClinicTreatmentJunctions(mappings);
    expect(rows).toHaveLength(1);
  });
});

// ── buildFallbackJunctions ──────────────────────────────────

describe("buildFallbackJunctions", () => {
  it("maps dermatology clinics to correct categories", () => {
    const clinics = [{ id: "c-1", clinicType: "dermatology", nameKo: "강남피부과" }];
    const rows = buildFallbackJunctions(clinics, TREATMENTS);
    const treatmentIds = rows.map((r) => r.treatment_id);
    expect(treatmentIds).toContain("t-1"); // laser
    expect(treatmentIds).toContain("t-2"); // injection
    expect(treatmentIds).not.toContain("t-6"); // hair (no keyword match)
  });

  it("adds hair treatments for clinics with hair keywords", () => {
    const clinics = [{ id: "c-1", clinicType: "dermatology", nameKo: "���모 전문 피부과" }];
    const rows = buildFallbackJunctions(clinics, TREATMENTS);
    const treatmentIds = rows.map((r) => r.treatment_id);
    expect(treatmentIds).toContain("t-6"); // hair
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run scripts/seed/lib/clinic-treatment-mapper.test.ts`
Expected: FAIL (모듈 미존재)

- [ ] **Step 3: Task 1의 코드로 테스트 통과 확인**

Run: `npx vitest run scripts/seed/lib/clinic-treatment-mapper.test.ts`
Expected: ALL PASS

- [ ] **Step 4: 커밋**

```bash
git add scripts/seed/lib/clinic-treatment-mapper.test.ts
git commit -m "test(P2-64c-3): clinic-treatment-mapper 단위 테스트 6개 suite 추가"
```

---

### Task 3: extract-clinic-tags.ts — 카카오맵 태그 추출

**Files:**
- Create: `scripts/seed/extract-clinic-tags.ts`

- [ ] **Step 1: 스크립트 작성**

```typescript
// scripts/seed/extract-clinic-tags.ts
// ============================================================
// P2-64c-3: 카카오맵 클리닉 페이지 태그 추출
// 225곳 placeUrl → Playwright → 태그 JSON 저장
// P-9: scripts/ → shared/ 허용. server/ import 금지.
// Usage: npx tsx scripts/seed/extract-clinic-tags.ts [--dry-run] [--limit=10]
// Output: scripts/seed/data/clinic-tags.json
// ============================================================

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

import { createPipelineClient } from "./lib/utils/db-client";
import { parseArgs } from "./parse-args";
import type { ClinicTagData } from "./lib/clinic-treatment-mapper";

// ── 상수 (G-10) ────────────────────────────────────────────

/** 페이지 간 딜레이 (ms) — polite scraping */
const PAGE_DELAY_MS = 3000;

/** 페이지 로드 타임아웃 (ms) */
const PAGE_TIMEOUT_MS = 15000;

/** 출력 파일 경로 */
const OUTPUT_PATH = "scripts/seed/data/clinic-tags.json";

// ── 태그 추출 ───────────────────────────────────────────────

/** 카카오맵 페이지에서 태그 섹션 추출 */
async function extractTagsFromPage(
  page: Awaited<ReturnType<typeof chromium.launch>>["contexts"][0]["pages"][0],
  url: string,
): Promise<string[]> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
    // SPA 렌더링 대기
    await page.waitForSelector("h5", { timeout: 5000 }).catch(() => null);

    const tags: string[] = await page.evaluate(() => {
      const headings = [...document.querySelectorAll("h5")];
      const tagHeading = headings.find((h) => h.textContent?.trim() === "태그");
      if (!tagHeading) return [];
      const container = tagHeading.nextElementSibling;
      if (!container) return [];
      return [...container.querySelectorAll("a")]
        .map((a) => a.textContent?.trim() ?? "")
        .filter(Boolean);
    });

    return tags;
  } catch {
    return [];
  }
}

// ── 메인 ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const dryRun = !!args["dry-run"];
  const limit = args.limit ? parseInt(args.limit, 10) : undefined;

  // 1. DB에서 클리닉 조회 (placeUrl 포함)
  const client = createPipelineClient();
  const { data: clinics, error } = await client
    .from("clinics")
    .select("id, clinic_type, name, raw")
    .eq("status", "active");

  if (error || !clinics) {
    console.error("[extract-tags] clinics 조회 실패:", error?.message);
    process.exit(1);
  }

  // placeUrl 추출
  const clinicsWithUrl = clinics
    .map((c) => ({
      id: c.id as string,
      clinicType: c.clinic_type as string,
      nameKo: (c.name as Record<string, string>)?.ko ?? "",
      placeUrl: (c.raw as Record<string, string>)?.place_url ?? "",
    }))
    .filter((c) => c.placeUrl);

  const target = limit ? clinicsWithUrl.slice(0, limit) : clinicsWithUrl;
  console.log(`[extract-tags] clinics: ${target.length}/${clinicsWithUrl.length}`);

  if (dryRun) {
    console.log("[extract-tags] DRY RUN — Playwright 실행 안 함");
    console.log(`[extract-tags] sample placeUrls:`);
    target.slice(0, 5).forEach((c) => console.log(`  ${c.nameKo}: ${c.placeUrl}`));
    return;
  }

  // 2. Playwright 브라우저 시작
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: ClinicTagData[] = [];
  let withTags = 0;
  let withoutTags = 0;

  // 3. 클리닉별 태그 추출
  for (let i = 0; i < target.length; i++) {
    const clinic = target[i];
    const tags = await extractTagsFromPage(page, clinic.placeUrl);

    results.push({
      clinicId: clinic.id,
      clinicNameKo: clinic.nameKo,
      clinicType: clinic.clinicType,
      tags,
    });

    if (tags.length > 0) {
      withTags++;
    } else {
      withoutTags++;
    }

    if ((i + 1) % 20 === 0 || i === target.length - 1) {
      console.log(`  [${i + 1}/${target.length}] tags: ${withTags}, no-tags: ${withoutTags}`);
    }

    if (i < target.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    }
  }

  await browser.close();

  // 4. 결과 저장
  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`[extract-tags] saved: ${OUTPUT_PATH}`);
  console.log(`[extract-tags] total: ${results.length}, with-tags: ${withTags}, no-tags: ${withoutTags}`);
}

main().catch((err) => {
  console.error("[extract-tags] Fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: dry-run 테스트**

Run: `npx tsx scripts/seed/extract-clinic-tags.ts --dry-run --limit=5`
Expected: 클리닉 5곳 placeUrl 출력, Playwright 미실행

- [ ] **Step 3: 소규모 실행 테스트 (3곳)**

Run: `npx tsx scripts/seed/extract-clinic-tags.ts --limit=3`
Expected: `scripts/seed/data/clinic-tags.json` 생성, 태그 추��� 확인

- [ ] **Step 4: 커밋**

```bash
git add scripts/seed/extract-clinic-tags.ts
git commit -m "feat(P2-64c-3): 카카오맵 클리닉 태그 추출 스크립트 추가

Playwright 헤드리스로 placeUrl에서 태그 섹션 추출.
3초 polite delay, --dry-run/--limit 옵션, JSON 출력."
```

---

### Task 4: generate-clinic-treatments.ts — 리라이트

**Files:**
- Rewrite: `scripts/seed/generate-clinic-treatments.ts`

P2-64c-2 (generate-product-ingredients.ts) 패턴과 동일한 2-mode CLI:
- `--generate`: 태그 JSON + LLM → D-7 검수 CSV
- `--load --csv=<path>`: DELETE 기존 + 검수 CSV → DB

- [ ] **Step 1: 스크립트 리라이트**

```typescript
// scripts/seed/generate-clinic-treatments.ts
// ============================================================
// P2-64c-3: clinic_treatments junction — 카카오맵 태그 기반
// 태그 JSON → LLM 매핑 → D-7 검수 CSV → DELETE + UPSERT
// P-9: scripts/ → shared/ 허용. server/ import 금지.
// Usage:
//   npx tsx scripts/seed/generate-clinic-treatments.ts --generate [--dry-run]
//   npx tsx scripts/seed/generate-clinic-treatments.ts --load --csv=<path>
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { generateText } from "ai";

import { getPipelineModel } from "./lib/enrichment/ai-client";
import { createPipelineClient } from "./lib/utils/db-client";
import { loadJunctions } from "./lib/loader";
import { parseCsvFile, stringifyCsvRows } from "./lib/utils/csv-parser";
import { parseArgs } from "./parse-args";
import type { JunctionInput } from "./lib/loader";

import {
  cleanTags,
  buildTreatmentListText,
  buildTagMappingPrompt,
  parseTagMappingResponse,
  buildClinicTreatmentJunctions,
  buildFallbackJunctions,
  type ClinicTagData,
  type TreatmentRef,
  type TagMappingResult,
  type ClinicTreatmentRow,
} from "./lib/clinic-treatment-mapper";

// ── 상수 (G-10) ────────────────────────────────────────────

const CALL_DELAY_MS = 500;
const TAGS_PATH = "scripts/seed/data/clinic-tags.json";

const REVIEW_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : new URL(".", import.meta.url).pathname,
  "review-data",
);

// ── 데이터 로드 ─────────────────────────────────────────────

function loadClinicTags(): ClinicTagData[] {
  return JSON.parse(readFileSync(TAGS_PATH, "utf-8"));
}

async function loadTreatmentsFromDb(): Promise<TreatmentRef[]> {
  const client = createPipelineClient();
  const { data, error } = await client
    .from("treatments")
    .select("id, name, category");

  if (error || !data) {
    console.error("[clinic-treatments] treatments 조회 실패:", error?.message);
    process.exit(1);
  }

  return data.map((t) => ({
    id: t.id as string,
    nameKo: (t.name as Record<string, string>)?.ko ?? "",
    nameEn: (t.name as Record<string, string>)?.en ?? "",
    category: t.category as string,
  }));
}

// ���─ Generate 모드 ───────────────────────────────────────────

async function mapSingleClinic(
  clinic: ClinicTagData,
  model: Awaited<ReturnType<typeof getPipelineModel>>,
  treatmentListText: string,
  treatments: TreatmentRef[],
): Promise<TagMappingResult | null> {
  const cleaned = cleanTags(clinic.tags);
  if (cleaned.length === 0) return null; // 태그 없음 → fallback 대상

  const prompt = buildTagMappingPrompt(clinic, treatmentListText);
  const result = await generateText({ model, prompt });
  const parsed = parseTagMappingResponse(result.text, treatments);

  if (!parsed || parsed.treatmentIds.length === 0) return null;

  return {
    clinicId: clinic.clinicId,
    clinicNameKo: clinic.clinicNameKo,
    treatmentIds: parsed.treatmentIds,
    unmatchedTags: parsed.unmatchedTags,
  };
}

async function generateMappings(dryRun: boolean): Promise<void> {
  const clinicTags = loadClinicTags();
  const treatments = await loadTreatmentsFromDb();
  const treatmentListText = buildTreatmentListText(treatments);
  const treatmentNameMap = new Map(treatments.map((t) => [t.id, t.nameKo]));

  const withTags = clinicTags.filter((c) => cleanTags(c.tags).length > 0);
  const withoutTags = clinicTags.filter((c) => cleanTags(c.tags).length === 0);

  console.log(`[clinic-treatments] total: ${clinicTags.length}`);
  console.log(`[clinic-treatments] with-tags: ${withTags.length}, no-tags: ${withoutTags.length}`);
  console.log(`[clinic-treatments] treatments: ${treatments.length}`);

  if (dryRun) {
    console.log("[clinic-treatments] DRY RUN — LLM 호출 안 함");
    return;
  }

  // LLM 매핑 (태그 있는 클리닉)
  const model = await getPipelineModel();
  const tagMappings: TagMappingResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < withTags.length; i++) {
    try {
      const mapping = await mapSingleClinic(withTags[i], model, treatmentListText, treatments);
      if (mapping) {
        tagMappings.push(mapping);
        succeeded++;
      } else {
        failed++;
      }
    } catch (err) {
      console.warn(`  [${i + 1}/${withTags.length}] ERROR: ${withTags[i].clinicNameKo} — ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    if ((i + 1) % 20 === 0) {
      console.log(`  [${i + 1}/${withTags.length}] processed (${succeeded} ok, ${failed} fail)`);
    }
    if (i < withTags.length - 1) await sleep(CALL_DELAY_MS);
  }

  console.log(`[clinic-treatments] LLM 완료: ${succeeded} succeeded, ${failed} failed`);

  // Tag-based junction
  const tagJunctions = buildClinicTreatmentJunctions(tagMappings);

  // Fallback junction (태그 없는 클리닉)
  const fallbackClinics = withoutTags.map((c) => ({
    id: c.clinicId,
    clinicType: c.clinicType,
    nameKo: c.clinicNameKo,
  }));
  const fallbackJunctions = buildFallbackJunctions(fallbackClinics, treatments);

  console.log(`[clinic-treatments] tag-based: ${tagJunctions.length}, fallback: ${fallbackJunctions.length}`);

  // D-7 검수 CSV 출력
  const allJunctions = [...tagJunctions, ...fallbackJunctions];
  exportForReview(allJunctions, treatmentNameMap, clinicTags);
}

// ── CSV Export (D-7 검수용) ──────────────────────────────────

function exportForReview(
  junctions: ClinicTreatmentRow[],
  treatmentNames: Map<string, string>,
  clinicTags: ClinicTagData[],
): void {
  if (!existsSync(REVIEW_DIR)) mkdirSync(REVIEW_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const clinicNameMap = new Map(clinicTags.map((c) => [c.clinicId, c.clinicNameKo]));
  const clinicTagMap = new Map(clinicTags.map((c) => [c.clinicId, c.tags.join(", ")]));

  // JSON (원본 보존)
  const jsonPath = join(REVIEW_DIR, `junction-clinic-treatments-${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(junctions, null, 2));

  // CSV (검수용)
  const csvRows = junctions.map((row) => ({
    clinic_id: row.clinic_id,
    clinic_name_ko: clinicNameMap.get(row.clinic_id) ?? "",
    treatment_id: row.treatment_id,
    treatment_name_ko: treatmentNames.get(row.treatment_id) ?? "",
    source: clinicTagMap.get(row.clinic_id) ? "tag" : "fallback",
    kakao_tags: clinicTagMap.get(row.clinic_id) ?? "",
    is_approved: "",
    review_notes: "",
  }));

  const csvPath = join(REVIEW_DIR, `review-clinic-treatments-${timestamp}.csv`);
  const csvContent = stringifyCsvRows(csvRows, [
    "clinic_id", "clinic_name_ko", "treatment_id",
    "treatment_name_ko", "source", "kakao_tags", "is_approved", "review_notes",
  ]);
  writeFileSync(csvPath, csvContent);

  console.log(`[clinic-treatments] exported:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  CSV:  ${csvPath}`);
}

// ── Load 모드 ───────────────────────────────────────────────

async function loadReviewed(csvPath: string): Promise<void> {
  const csvRows = parseCsvFile(csvPath);
  console.log(`[clinic-treatments] CSV rows: ${csvRows.length}`);

  const approved = csvRows.filter((row) => {
    const val = (row.is_approved ?? "").trim().toLowerCase();
    return ["true", "1", "yes"].includes(val);
  });
  console.log(`[clinic-treatments] approved: ${approved.length}`);

  if (approved.length === 0) {
    console.log("[clinic-treatments] 승인 건 없음 — 종료");
    return;
  }

  const client = createPipelineClient();

  // 기존 clinic_treatments 전체 삭제 (Q-11 원자성: DELETE → INSERT 순차)
  console.log("[clinic-treatments] deleting existing clinic_treatments...");
  const { error: delError } = await client
    .from("clinic_treatments")
    .delete()
    .gte("clinic_id", "00000000-0000-0000-0000-000000000000"); // Supabase requires filter for delete
  if (delError) {
    console.error("[clinic-treatments] DELETE 실패:", delError.message);
    process.exit(1);
  }
  console.log("[clinic-treatments] DELETE 완료");

  // 검수 데이터 적재
  const junctionData: Record<string, unknown>[] = approved.map((row) => ({
    clinic_id: row.clinic_id,
    treatment_id: row.treatment_id,
  }));

  const input: JunctionInput[] = [
    { type: "clinic_treatment", data: junctionData },
  ];
  const results = await loadJunctions(client, input);

  for (const r of results) {
    console.log(`  ${r.entityType}: ${r.inserted} inserted, ${r.failed} failed`);
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.warn(`    - ${e.message}`));
    }
  }
}

// ── 유틸 ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.load) {
    const csvPath = args.csv;
    if (!csvPath || csvPath === "true") {
      console.error("Error: --csv=<path> is required for --load mode");
      console.error("Usage: npx tsx scripts/seed/generate-clinic-treatments.ts --load --csv=<path>");
      process.exit(1);
    }
    await loadReviewed(csvPath);
  } else {
    const dryRun = !!args["dry-run"];
    await generateMappings(dryRun);
  }
}

main().catch((err) => {
  console.error("[clinic-treatments] Fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: dry-run 테스트**

Run: `npx tsx scripts/seed/generate-clinic-treatments.ts --dry-run`
Expected: 태그 JSON 로드, 클리닉/시술 건수 출력, LLM 미호출

- [ ] **Step 3: 커밋**

```bash
git add scripts/seed/generate-clinic-treatments.ts
git commit -m "feat(P2-64c-3): generate-clinic-treatments LLM+D-7+fallback ��라이트

기존 전조합 규칙 기반 → 카카오맵 태그 기반 LLM 매핑으로 교체.
--generate (LLM+CSV), --load --csv (DELETE+UPSERT) 2-mode.
태그 없는 클리닉은 기존 규칙 기반 fallback 유지."
```

---

### Task 5: 실행 — 태그 추출 + LLM 매핑

- [ ] **Step 1: 전체 태그 추출 (225곳)**

Run: `npx tsx scripts/seed/extract-clinic-tags.ts`
Expected: `scripts/seed/data/clinic-tags.json` 생성, ~11분 소요 (225곳 × 3초)

확인: `cat scripts/seed/data/clinic-tags.json | python3 -c "import json,sys; data=json.load(sys.stdin); wt=sum(1 for c in data if len(c['tags'])>0); print(f'total={len(data)}, with-tags={wt}, no-tags={len(data)-wt}')"`

- [ ] **Step 2: LLM 매핑 + CSV 생성**

Run: `npx tsx scripts/seed/generate-clinic-treatments.ts --generate`
Expected: `scripts/seed/review-data/review-clinic-treatments-*.csv` 생성

확인: CSV 열어서 clinic_name_ko, treatment_name_ko, source(tag/fallback), kakao_tags 확인

- [ ] **Step 3: 커밋**

```bash
git add scripts/seed/data/clinic-tags.json
git commit -m "data(P2-64c-3): 카카오맵 225곳 클리닉 태그 추��� 완료"
```

---

### Task 6: D-7 검수

**사용자 수행 — 자동화 불가**

- [ ] **Step 1: CSV 검수**

`scripts/seed/review-data/review-clinic-treatments-*.csv` 파일을 열어서:
- `is_approved` 열에 `true`/`false` 기입
- 잘못된 매핑은 `false` + `review_notes`에 사유 기재
- tag 기반 매핑과 fallback 매핑을 별도로 검수

- [ ] **Step 2: 검수 완료 CSV 저장**

파일명: `scripts/seed/review-data/reviewed-clinic-treatments.csv`

---

### Task 7: DB 적재

- [ ] **Step 1: 검수 CSV → DB 적재**

Run: `npx tsx scripts/seed/generate-clinic-treatments.ts --load --csv=scripts/seed/review-data/reviewed-clinic-treatments.csv`
Expected: 기존 9,411건 DELETE + 검수 승인 건 INSERT

- [ ] **Step 2: 결과 확인**

Run: Supabase Dashboard에서 `SELECT count(*) FROM clinic_treatments` ���인
Expected: ~2,000-3,000건 (태그 기반 + fallback)

- [ ] **Step 3: 커밋**

```bash
git add scripts/seed/review-data/reviewed-clinic-treatments.csv
git commit -m "feat(P2-64c-3): 카카오맵 태그 기반 clinic_treatments 정밀 매핑 완료

기존 전조합 9,411건 → 태그+fallback 기반 ~N건으로 교체.
태��� 있는 클리닉: LLM 매핑 + D-7 검수.
태그 없는 클리닉: 규칙 기반 fallback."
```

---

## 4. 확장성·유지보수성 설계

| 요구사항 | 대응 |
|----------|------|
| **태그 변경 시 재실행** | `extract-clinic-tags.ts` 재실행 → `generate --generate` → D-7 → `--load` |
| **새 클리닉 추가** | DB에 클리닉 추가 후 위 파이프라인 재실행 |
| **새 시술 추가** | treatments DB에 추가 후 `--generate` 재실행 (treatmentListText 자동 갱신) |
| **v0.2 B2B 데이터 전환** | 같은 junction 테이블 구조. load 시 DELETE + INSERT 패턴으로 전체 교체 가능 |
| **매핑 규칙 변경** | `clinic-treatment-mapper.ts` 1파일만 수정 (P-7 단일 변경점) |
| **fallback 카테고리 변경** | `FALLBACK_CATEGORIES` 상수 1곳만 수정 |

## 5. 검증 체크리스트

```
□ V-1  의존성 방향: scripts/ → shared/ 단방향만
□ V-2  core 불변: core/ 파일 수정 0건
□ V-9  중복: ingredient-mapper 패턴 참조하되 코�� 중복 없음
□ V-10 미사용: 기존 generate-clinic-treatments.ts 전체 교체 (잔��� 코드 없음)
□ V-17 제거 안전성: 스크립트 전�� 삭제해도 src/ 빌드 무영향
□ V-19 복합 쓰기: DELETE + INSERT 순차 (Q-11 원자성)
□ V-20 멱등성: 재실행 시 DELETE → 재적��� (Q-12)
□ V-22 스키마 정합성: clinicTreatmentRelationSchema 동일 (clinic_id, treatment_id)
□ V-25 정본 확인: schema.dbml clinic_treatments 정본, PRD §3.5 카드 규칙 준수
```
