// ============================================================
// P2-64c-3: 카카오맵 클리닉 태그 추출
// Playwright 헤드리스로 placeUrl 방문 → 태그 섹션 추출 → JSON 저장
// P-9: scripts/ → shared/ 허용. server/ import 금지.
// Usage:
//   npx tsx scripts/seed/extract-clinic-tags.ts [--dry-run] [--limit=N]
// Output: scripts/seed/data/clinic-tags.json
// ============================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { parseArgs } from "./parse-args";
import type { ClinicTagData } from "./lib/clinic-treatment-mapper";
import type { ValidatedRecord } from "./lib/types";

// ── 상수 (G-10 매직넘버 금지) ──────────────────────────────

/** 페이지 간 polite delay (ms) */
const PAGE_DELAY_MS = 3000;

/** JS SPA 렌더링 대기 타임아웃 (ms) */
const SELECTOR_TIMEOUT_MS = 5000;

/** 진행률 로그 간격 */
const LOG_INTERVAL = 20;

/** 출력 디렉토리 */
const DATA_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : new URL(".", import.meta.url).pathname,
  "data",
);

/** 출력 파일 경로 */
const OUTPUT_PATH = join(DATA_DIR, "clinic-tags.json");

/** 클리닉 검증 데이터 경로 */
const CLINICS_VALIDATED_PATH = join(DATA_DIR, "clinics-validated.json");

// ── 타입 ─────────────────────────────────────────────────

interface ClinicEntry {
  id: string;
  nameKo: string;
  clinicType: string;
  placeUrl: string;
}

// ── 데이터 로드 ──────────────────────────────────────────

/** clinics-validated.json에서 placeUrl이 있는 클리닉 목록 로드 */
function loadClinics(limit?: number): ClinicEntry[] {
  const records: ValidatedRecord[] = JSON.parse(
    readFileSync(CLINICS_VALIDATED_PATH, "utf-8"),
  );

  const entries: ClinicEntry[] = [];
  for (const record of records) {
    const data = record.data as Record<string, unknown>;
    const id = data["id"] as string | undefined;
    const placeUrl = data["placeUrl"] as string | undefined;
    if (!id || !placeUrl) continue;

    const name = data["name"] as Record<string, string> | string | undefined;
    const nameKo =
      typeof name === "string"
        ? name
        : (name?.["ko"] ?? name?.["en"] ?? "");

    entries.push({
      id,
      nameKo,
      clinicType: (data["clinic_type"] as string) ?? "",
      placeUrl,
    });
  }

  return limit !== undefined ? entries.slice(0, limit) : entries;
}

// ── delay 유틸 ──────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 태그 추출 (단일 페이지) ──────────────────────────────

/**
 * 카카오맵 페이지에서 태그 섹션 추출.
 * DOM 구조: <h5>태그</h5> + 다음 형제 <div> 내 <a> 텍스트
 */
async function extractTagsFromPage(
  page: import("playwright").Page,
  url: string,
): Promise<string[]> {
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Vite SPA — JS 렌더링 대기
  try {
    await page.waitForSelector("h5", { timeout: SELECTOR_TIMEOUT_MS });
  } catch {
    // h5가 없으면 태그 없음
    return [];
  }

  // "태그" h5 찾기 → 다음 형제의 <a> 텍스트 수집
  const tags = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h5"));
    const tagHeading = headings.find((h) => h.textContent?.trim() === "태그");
    if (!tagHeading) return [];

    const sibling = tagHeading.nextElementSibling;
    if (!sibling) return [];

    return Array.from(sibling.querySelectorAll("a"))
      .map((a) => a.textContent?.trim() ?? "")
      .filter(Boolean);
  });

  return tags;
}

// ── Playwright 스크래핑 루프 ─────────────────────────────

/** 단일 클리닉 태그 추출 + 결과 축적 (에러 격리) */
async function scrapeSingleClinic(
  page: import("playwright").Page,
  clinic: ClinicEntry,
  results: ClinicTagData[],
): Promise<boolean> {
  try {
    const tags = await extractTagsFromPage(page, clinic.placeUrl);
    results.push({
      clinicId: clinic.id,
      clinicNameKo: clinic.nameKo,
      clinicType: clinic.clinicType,
      tags,
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ERROR: ${clinic.nameKo} — ${msg}`);
    return false;
  }
}

/** 클리닉 목록 순회하며 태그 추출 */
async function scrapeAllTags(clinics: ClinicEntry[]): Promise<ClinicTagData[]> {
  const browser = await chromium.launch({ headless: true });
  const results: ClinicTagData[] = [];
  let succeeded = 0;
  let failed = 0;

  try {
    const page = await browser.newPage();
    for (let i = 0; i < clinics.length; i++) {
      const ok = await scrapeSingleClinic(page, clinics[i], results);
      if (ok) succeeded++;
      else failed++;
      if ((i + 1) % LOG_INTERVAL === 0) console.log(`  [${i + 1}/${clinics.length}] (${succeeded} ok, ${failed} fail)`);
      if (i < clinics.length - 1) await delay(PAGE_DELAY_MS);
    }
    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`[clinic-tags] 완료: ${succeeded} ok, ${failed} fail`);
  return results;
}

// ── 메인 ────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const dryRun = args["dry-run"] === "true";
  const limitArg = args["limit"];
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  const clinics = loadClinics(limit);
  console.log(`[clinic-tags] clinics loaded: ${clinics.length}`);

  if (dryRun) {
    console.log("[clinic-tags] DRY RUN — Playwright 실행 안 함");
    for (const clinic of clinics.slice(0, 3)) {
      console.log(`  ${clinic.nameKo} → ${clinic.placeUrl}`);
    }
    return;
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const results = await scrapeAllTags(clinics);

  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`[clinic-tags] saved: ${OUTPUT_PATH} (${results.length} clinics)`);

  const withTags = results.filter((r) => r.tags.length > 0).length;
  console.log(`[clinic-tags] 태그 있음: ${withTags}, 없음: ${results.length - withTags}`);
}

main().catch((err) => {
  console.error("[clinic-tags] Fatal:", err);
  process.exit(1);
});
