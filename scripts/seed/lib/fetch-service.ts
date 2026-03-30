// ============================================================
// Stage 1 Fetch Service — data-collection.md §7.0, §7.2
// 프로바이더 병렬 호출(Promise.allSettled) → RawRecord[] 통합.
// Composition Root (P-4, P-9): 각 프로바이더 고유 시그니처 직접 호출.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { pipelineEnv } from "../config";
import type {
  EntityType,
  RawRecord,
  RawPlace,
  SearchOptions,
  PipelineError,
  PipelineResult,
} from "./types";

// ── 프로바이더 import (Composition Root 직접 호출) ─────────

import { kakaoLocalProvider } from "./providers/kakao-local";
import { fetchAllMfdsIngredients } from "./providers/mfds-ingredient";
import { fetchAllMfdsRestricted } from "./providers/mfds-restricted";
import { loadCosIngIngredients } from "./providers/cosing-csv";
import { scrapeProducts } from "./providers/web-scraper";
import { loadCsvAsRawRecords } from "./providers/csv-loader";
import type { SiteConfig } from "./providers/site-configs";
import {
  classifyPlace,
  mapPlaceToRawRecord,
  deduplicatePlaces,
} from "./place-mapper";

// ── 타입 ────────────────────────────────────────────────────

/** Stage 1 수집 옵션 */
export interface FetchOptions {
  /** 수집 대상 — 생략 시 전체 */
  targets?: ("places" | "ingredients" | "products")[];
  /** 카카오 검색 쿼리 목록 */
  placeQueries?: { query: string; options?: SearchOptions }[];
  /** Channel B CSV 파일 */
  csvFiles?: { path: string; entityType: EntityType }[];
  /** Web scraper 사이트 설정 오버라이드 */
  siteConfigs?: SiteConfig[];
  /** 결과 JSON 로그 경로 */
  logDir?: string;
}

// ── 상수 ────────────────────────────────────────────────────

const DEFAULT_LOG_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : new URL(".", import.meta.url).pathname,
  "../../../docs/data-logs",
);

// ── 공개 API ────────────────────────────────────────────────

/** Stage 1: 모든 프로바이더 호출 → RawRecord[] 통합 */
export async function fetchAllRecords(
  options?: FetchOptions,
): Promise<{ records: RawRecord[]; result: PipelineResult }> {
  const targets = options?.targets;
  const logDir = options?.logDir ?? DEFAULT_LOG_DIR;
  const startedAt = new Date().toISOString();
  const allRecords: RawRecord[] = [];
  const errors: PipelineError[] = [];

  // ── places (카카오 등 PlaceProvider) ──────────────────────
  if (!targets || targets.includes("places")) {
    const placeRecords = await fetchPlaces(
      options?.placeQueries ?? [],
      errors,
    );
    allRecords.push(...placeRecords);
  }

  // ── ingredients (S3 + S6 + S4 합병) ──────────────────────
  if (!targets || targets.includes("ingredients")) {
    const ingredientRecords = await fetchIngredients(errors);
    allRecords.push(...ingredientRecords);
  }

  // ── products (web scraper) ────────────────────────────────
  if (!targets || targets.includes("products")) {
    const productRecords = await fetchProducts(
      options?.siteConfigs,
      errors,
    );
    allRecords.push(...productRecords);
  }

  // ── CSV (Channel B) ──────────────────────────────────────
  if (options?.csvFiles && options.csvFiles.length > 0) {
    const csvRecords = fetchCsv(options.csvFiles, errors);
    allRecords.push(...csvRecords);
  }

  // ── 결과 ──────────────────────────────────────────────────
  const pipelineResult: PipelineResult = {
    stage: "fetch",
    startedAt,
    completedAt: new Date().toISOString(),
    total: allRecords.length,
    succeeded: allRecords.length,
    failed: errors.length,
    errors,
  };

  writeFetchLog(pipelineResult, logDir);

  return { records: allRecords, result: pipelineResult };
}

// ── places 수집 ─────────────────────────────────────────────

async function fetchPlaces(
  queries: { query: string; options?: SearchOptions }[],
  errors: PipelineError[],
): Promise<RawRecord[]> {
  if (!kakaoLocalProvider.isAvailable() || queries.length === 0) return [];

  const results = await Promise.allSettled(
    queries.map((q) => kakaoLocalProvider.search(q.query, q.options)),
  );

  const allPlaces: RawPlace[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allPlaces.push(...result.value);
    } else {
      errors.push({
        stage: "fetch",
        message: `kakao search failed: ${result.reason}`,
      });
    }
  }

  // 4단계 dedup (2~4차. 1차는 kakao-local 내부에서 처리)
  const deduplicated = deduplicatePlaces(allPlaces);

  return deduplicated.map(mapPlaceToRawRecord);
}

// ── ingredients 수집 + S3↔S6↔S4 합병 ───────────────────────

async function fetchIngredients(
  errors: PipelineError[],
): Promise<RawRecord[]> {
  const results = await Promise.allSettled([
    pipelineEnv.MFDS_SERVICE_KEY
      ? fetchAllMfdsIngredients()
      : Promise.resolve([]),
    Promise.resolve(loadCosIngIngredients()),
    pipelineEnv.MFDS_SERVICE_KEY
      ? fetchAllMfdsRestricted()
      : Promise.resolve([]),
  ]);

  let s3Records: RawRecord[] = [];
  let s6Records: RawRecord[] = [];
  let s4Records: RawRecord[] = [];

  if (results[0].status === "fulfilled") {
    s3Records = results[0].value;
  } else {
    errors.push({ stage: "fetch", message: `S3 failed: ${results[0].reason}` });
  }

  if (results[1].status === "fulfilled") {
    s6Records = results[1].value;
  } else {
    errors.push({ stage: "fetch", message: `S6 failed: ${results[1].reason}` });
  }

  if (results[2].status === "fulfilled") {
    s4Records = results[2].value;
  } else {
    errors.push({ stage: "fetch", message: `S4 failed: ${results[2].reason}` });
  }

  return mergeIngredientSources(s3Records, s6Records, s4Records);
}

/** S3 기준 LEFT JOIN: S6 function + S4 safety 보강 (data-collection.md §3.7) */
function mergeIngredientSources(
  s3: RawRecord[],
  s6: RawRecord[],
  s4: RawRecord[],
): RawRecord[] {
  // S6 인덱스: INCI name (lowercase) → RawRecord
  const s6Index = new Map<string, RawRecord>();
  for (const record of s6) {
    const inciName = String(
      (record.data as Record<string, unknown>)["INCI name"] ?? "",
    ).toLowerCase().trim();
    if (inciName) s6Index.set(inciName, record);
  }

  // S4 인덱스: INGR_ENG_NAME (lowercase) → RawRecord[]
  const s4Index = new Map<string, RawRecord[]>();
  for (const record of s4) {
    const engName = String(
      (record.data as Record<string, unknown>).INGR_ENG_NAME ?? "",
    ).toLowerCase().trim();
    if (engName) {
      const list = s4Index.get(engName) ?? [];
      list.push(record);
      s4Index.set(engName, list);
    }
  }

  // S3 기준 LEFT JOIN
  return s3.map((s3Record) => {
    const data = s3Record.data as Record<string, unknown>;
    const engName = String(data.INGR_ENG_NAME ?? "").toLowerCase().trim();

    const s6Match = s6Index.get(engName);
    const s4Matches = s4Index.get(engName) ?? [];

    const merged: Record<string, unknown> = { ...data };

    if (s6Match) {
      const s6Data = s6Match.data as Record<string, unknown>;
      merged._cosing = {
        inciName: s6Data["INCI name"],
        function: s6Data["Function"],
        restriction: s6Data["Restriction"],
      };
    }

    if (s4Matches.length > 0) {
      merged._restricted = s4Matches.map((r) => r.data);
    }

    return { ...s3Record, data: merged };
  });
}

// ── products 수집 ───────────────────────────────────────────

async function fetchProducts(
  siteConfigs: SiteConfig[] | undefined,
  errors: PipelineError[],
): Promise<RawRecord[]> {
  try {
    return await scrapeProducts(siteConfigs);
  } catch (err) {
    errors.push({
      stage: "fetch",
      message: `web scraper failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return [];
  }
}

// ── CSV 수집 ────────────────────────────────────────────────

function fetchCsv(
  csvFiles: { path: string; entityType: EntityType }[],
  errors: PipelineError[],
): RawRecord[] {
  const allRecords: RawRecord[] = [];

  for (const file of csvFiles) {
    try {
      const records = loadCsvAsRawRecords(file.path, file.entityType);
      allRecords.push(...records);
    } catch (err) {
      errors.push({
        stage: "fetch",
        message: `CSV load failed (${file.path}): ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return allRecords;
}

// ── 로그 ────────────────────────────────────────────────────

function writeFetchLog(result: PipelineResult, logDir: string): void {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = join(logDir, `fetch-${timestamp}.json`);
    writeFileSync(logPath, JSON.stringify(result, null, 2));
  } catch {
    // 로그 실패는 수집 결과에 영향 없음 (Q-15)
  }
}
