// ============================================================
// Stage 3 Review Exporter — data-collection.md §7.1
// EnrichedRecord[] → JSON(보존) + CSV(검수) export
// 검수 완료 CSV + JSON → ValidatedRecord[] import
// P-9: scripts/ 내부 + types.ts, csv-parser.ts import만.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { parseCsvFile, stringifyCsvRows } from "./csv-parser";

import type {
  EntityType,
  EnrichedRecord,
  ValidatedRecord,
  PipelineError,
} from "./types";

// ── 타입 ────────────────────────────────────────────────────

/** Export 옵션 */
export interface ExportOptions {
  outputDir?: string;
  entityTypes?: EntityType[];
  timestamp?: string;
}

/** Export 결과 */
export interface ExportResult {
  files: { entityType: EntityType; jsonPath: string; csvPath: string; count: number }[];
  total: number;
  skipped: number;
}

/** Import 옵션 */
export interface ImportOptions {
  reviewedBy?: string;
}

/** Import 결과 */
export interface ImportResult {
  records: ValidatedRecord[];
  total: number;
  matched: number;
  skipped: number;
  errors: PipelineError[];
}

// ── 컬럼 정의 ──────────────────────────────────────────────

/** CSV 컬럼 정의 */
interface ReviewColumnDef {
  header: string;
  source: "data" | "enrichments" | "meta";
  path: string;
  format: "string" | "number" | "array";
  editable: boolean;
}

/** 파이프 구분자 — 배열 직렬화용 */
const ARRAY_DELIMITER = "|";

/** 공통 컬럼 (전 엔티티 앞부분) */
const COMMON_COLUMNS: ReviewColumnDef[] = [
  { header: "id", source: "data", path: "id", format: "string", editable: false },
  { header: "source_id", source: "meta", path: "sourceId", format: "string", editable: false },
  { header: "name_ko", source: "data", path: "name.ko", format: "string", editable: false },
  { header: "name_en", source: "data", path: "name.en", format: "string", editable: false },
];

/** 검수 메타 컬럼 (전 엔티티 뒷부분) */
const REVIEW_META_COLUMNS: ReviewColumnDef[] = [
  { header: "is_approved", source: "meta", path: "", format: "string", editable: true },
  { header: "review_notes", source: "meta", path: "", format: "string", editable: true },
];

/** 엔티티별 검수 대상 컬럼 */
const ENTITY_REVIEW_COLUMNS: Record<EntityType, ReviewColumnDef[]> = {
  product: [
    { header: "skin_types", source: "data", path: "skin_types", format: "array", editable: true },
    { header: "skin_types_confidence", source: "enrichments", path: "confidence.skin_types", format: "number", editable: false },
    { header: "concerns", source: "data", path: "concerns", format: "array", editable: true },
    { header: "concerns_confidence", source: "enrichments", path: "confidence.concerns", format: "number", editable: false },
    { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
    { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
    { header: "review_summary_ko", source: "data", path: "review_summary.ko", format: "string", editable: true },
    { header: "review_summary_en", source: "data", path: "review_summary.en", format: "string", editable: true },
  ],
  treatment: [
    { header: "suitable_skin_types", source: "data", path: "suitable_skin_types", format: "array", editable: true },
    { header: "suitable_skin_types_confidence", source: "enrichments", path: "confidence.suitable_skin_types", format: "number", editable: false },
    { header: "target_concerns", source: "data", path: "target_concerns", format: "array", editable: true },
    { header: "target_concerns_confidence", source: "enrichments", path: "confidence.target_concerns", format: "number", editable: false },
    { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
    { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
  ],
  ingredient: [
    { header: "inci_name", source: "data", path: "inci_name", format: "string", editable: false },
    { header: "function", source: "data", path: "function", format: "array", editable: true },
    { header: "function_confidence", source: "enrichments", path: "confidence.function", format: "number", editable: false },
    { header: "caution_skin_types", source: "data", path: "caution_skin_types", format: "array", editable: true },
    { header: "caution_skin_types_confidence", source: "enrichments", path: "confidence.caution_skin_types", format: "number", editable: false },
  ],
  store: [
    { header: "store_type", source: "data", path: "store_type", format: "string", editable: true },
    { header: "district", source: "data", path: "district", format: "string", editable: true },
    { header: "address_ko", source: "data", path: "address.ko", format: "string", editable: false },
    { header: "phone", source: "data", path: "phone", format: "string", editable: false },
    { header: "english_support", source: "data", path: "english_support", format: "string", editable: true },
    { header: "tourist_services", source: "data", path: "tourist_services", format: "array", editable: true },
    { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
    { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
  ],
  clinic: [
    { header: "description_ko", source: "data", path: "description.ko", format: "string", editable: true },
    { header: "description_en", source: "data", path: "description.en", format: "string", editable: true },
  ],
  brand: [],
  doctor: [],
};

// ── 상수 ────────────────────────────────────────────────────

const DEFAULT_OUTPUT_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : new URL(".", import.meta.url).pathname,
  "../review-data",
);

const DEFAULT_LOG_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : new URL(".", import.meta.url).pathname,
  "../../../docs/data-logs",
);

// ── Export API ──────────────────────────────────────────────

/** Stage 3 Export: EnrichedRecord[] → 엔티티별 JSON + CSV 파일 쌍 */
export function exportForReview(
  records: EnrichedRecord[],
  options?: ExportOptions,
): ExportResult {
  const outputDir = options?.outputDir ?? DEFAULT_OUTPUT_DIR;
  const filterTypes = options?.entityTypes;
  const timestamp = options?.timestamp ?? new Date().toISOString().replace(/[:.]/g, "-");

  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const grouped = groupByEntityType(records, filterTypes);
  const files: ExportResult["files"] = [];
  let total = 0;

  for (const [entityType, entityRecords] of Object.entries(grouped)) {
    if (entityRecords.length === 0) continue;

    const jsonPath = join(outputDir, `enriched-${entityType}-${timestamp}.json`);
    const csvPath = join(outputDir, `review-${entityType}-${timestamp}.csv`);

    writeFileSync(jsonPath, JSON.stringify(entityRecords, null, 2));

    const columns = getColumnsForEntity(entityType as EntityType);
    const csvRows = entityRecords.map((r) => recordToCsvRow(r, columns));
    const csvContent = stringifyCsvRows(csvRows, columns.map((c) => c.header));
    writeFileSync(csvPath, csvContent);

    files.push({ entityType: entityType as EntityType, jsonPath, csvPath, count: entityRecords.length });
    total += entityRecords.length;
  }

  const skipped = records.length - total;

  writeExportLog({ total, skipped, fileCount: files.length }, DEFAULT_LOG_DIR, timestamp);

  return { files, total, skipped };
}

// ── Import API ─────────────────────────────────────────────

/** Stage 3 Import: JSON(원본) + CSV(검수 완료) → ValidatedRecord[] */
export function importReviewed(
  enrichedJsonPath: string,
  reviewedCsvPath: string,
  options?: ImportOptions,
): ImportResult {
  const reviewedBy = options?.reviewedBy ?? "google-sheets";
  const errors: PipelineError[] = [];

  const enrichedRecords: EnrichedRecord[] = JSON.parse(
    readFileSync(enrichedJsonPath, "utf-8"),
  );

  const enrichedMap = buildEnrichedMap(enrichedRecords);
  const csvRows = parseCsvFile(reviewedCsvPath);
  const records = matchAndBuild(csvRows, enrichedMap, reviewedBy, errors);

  const result: ImportResult = {
    records,
    total: csvRows.length,
    matched: records.length,
    skipped: enrichedRecords.length - records.length,
    errors,
  };

  writeImportLog(result, DEFAULT_LOG_DIR);

  return result;
}

/** EnrichedRecord[] → id 기반 Map */
function buildEnrichedMap(records: EnrichedRecord[]): Map<string, EnrichedRecord> {
  const map = new Map<string, EnrichedRecord>();
  for (const record of records) {
    const id = (record.data as Record<string, unknown>).id as string | undefined;
    if (id) map.set(id, record);
  }
  return map;
}

/** CSV 행별 매칭 + ValidatedRecord 생성 */
function matchAndBuild(
  csvRows: Record<string, string>[],
  enrichedMap: Map<string, EnrichedRecord>,
  reviewedBy: string,
  errors: PipelineError[],
): ValidatedRecord[] {
  const records: ValidatedRecord[] = [];

  for (const row of csvRows) {
    const id = row.id;
    if (!id) {
      errors.push({ stage: "review-import", message: "CSV row missing id" });
      continue;
    }

    const original = enrichedMap.get(id);
    if (!original) {
      errors.push({ stage: "review-import", recordId: id, message: "id not found in enriched JSON" });
      continue;
    }

    records.push(buildValidatedRecord(original, row, reviewedBy));
  }

  return records;
}

// ── 내부 헬퍼: Export ──────────────────────────────────────

/** EnrichedRecord[]를 entityType별로 그룹화 */
function groupByEntityType(
  records: EnrichedRecord[],
  filterTypes?: EntityType[],
): Record<string, EnrichedRecord[]> {
  const grouped: Record<string, EnrichedRecord[]> = {};
  for (const record of records) {
    if (filterTypes && !filterTypes.includes(record.entityType)) continue;
    const list = grouped[record.entityType] ?? [];
    list.push(record);
    grouped[record.entityType] = list;
  }
  return grouped;
}

/** 엔티티별 전체 컬럼 목록 (공통 + 엔티티 고유 + 검수 메타) */
function getColumnsForEntity(entityType: EntityType): ReviewColumnDef[] {
  return [
    ...COMMON_COLUMNS,
    ...ENTITY_REVIEW_COLUMNS[entityType],
    ...REVIEW_META_COLUMNS,
  ];
}

/** EnrichedRecord → CSV 행 (평탄화) */
function recordToCsvRow(
  record: EnrichedRecord,
  columns: ReviewColumnDef[],
): Record<string, string> {
  const row: Record<string, string> = {};
  for (const col of columns) {
    row[col.header] = extractCsvValue(record, col);
  }
  return row;
}

/** 컬럼 정의에 따라 EnrichedRecord에서 값 추출 → CSV 문자열 */
function extractCsvValue(record: EnrichedRecord, col: ReviewColumnDef): string {
  if (col.header === "is_approved" || col.header === "review_notes") return "";

  const raw = resolveValue(record, col.source, col.path);

  if (raw === null || raw === undefined) return "";
  if (col.format === "array" && Array.isArray(raw)) return raw.join(ARRAY_DELIMITER);
  if (col.format === "number") return String(raw);
  return String(raw);
}

/** source + dot-path로 EnrichedRecord에서 값 탐색 */
function resolveValue(
  record: EnrichedRecord,
  source: "data" | "enrichments" | "meta",
  path: string,
): unknown {
  let obj: unknown;
  if (source === "data") obj = record.data;
  else if (source === "enrichments") obj = record.enrichments;
  else obj = record;

  if (!path) return obj;

  const parts = path.split(".");
  for (const part of parts) {
    if (obj === null || obj === undefined || typeof obj !== "object") return undefined;
    obj = (obj as Record<string, unknown>)[part];
  }
  return obj;
}

// ── 내부 헬퍼: Import ──────────────────────────────────────

/** 원본 EnrichedRecord + CSV 행 → ValidatedRecord */
function buildValidatedRecord(
  original: EnrichedRecord,
  csvRow: Record<string, string>,
  reviewedBy: string,
): ValidatedRecord {
  const data: Record<string, unknown> = { ...(original.data as Record<string, unknown>) };
  const columns = ENTITY_REVIEW_COLUMNS[original.entityType];

  for (const col of columns) {
    if (!col.editable) continue;

    const csvValue = csvRow[col.header];
    if (csvValue === undefined) continue;

    applyOverride(data, col.path, csvValue, col.format);
  }

  const isApproved = parseBoolean(csvRow.is_approved);

  return {
    entityType: original.entityType,
    data,
    isApproved,
    reviewedBy,
    reviewNotes: csvRow.review_notes || undefined,
  };
}

/** CSV 값을 data에 오버라이드 (dot-path 지원) */
function applyOverride(
  data: Record<string, unknown>,
  path: string,
  csvValue: string,
  format: "string" | "number" | "array",
): void {
  const parts = path.split(".");

  if (parts.length === 1) {
    data[parts[0]] = convertCsvValue(csvValue, format);
    return;
  }

  // 2레벨 경로만 지원 (e.g., "description.ko"). 3+ 레벨은 REVIEW_COLUMNS 설계 범위 외.
  if (parts.length > 2) throw new Error(`applyOverride: path depth > 2 not supported: ${path}`);

  // 중첩 경로 — 원본 객체 변이 방지
  const [first, ...rest] = parts;
  const nested = { ...(data[first] ?? {}) as Record<string, unknown> };
  nested[rest.join(".")] = convertCsvValue(csvValue, format);
  data[first] = nested;
}

/** CSV 문자열 → 타입 변환 */
function convertCsvValue(
  value: string,
  format: "string" | "number" | "array",
): string | number | string[] {
  if (format === "array") {
    return value.trim() ? value.split(ARRAY_DELIMITER).map((v) => v.trim()).filter(Boolean) : [];
  }
  if (format === "number") return parseFloat(value) || 0;
  return value;
}

/** "TRUE"/"true"/"1" → true, 그 외 → false */
function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ["true", "1", "yes"].includes(value.trim().toLowerCase());
}

// ── 로그 ────────────────────────────────────────────────────

function writeExportLog(
  summary: { total: number; skipped: number; fileCount: number },
  logDir: string,
  timestamp: string,
): void {
  try {
    const logPath = join(logDir, `review-export-${timestamp}.json`);
    writeFileSync(logPath, JSON.stringify(summary, null, 2));
  } catch {
    // Q-15: 로그 실패는 export 결과에 영향 없음
  }
}

function writeImportLog(result: ImportResult, logDir: string): void {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = join(logDir, `review-import-${timestamp}.json`);
    const summary = {
      total: result.total,
      matched: result.matched,
      skipped: result.skipped,
      errors: result.errors,
    };
    writeFileSync(logPath, JSON.stringify(summary, null, 2));
  } catch {
    // Q-15: 로그 실패는 import 결과에 영향 없음
  }
}
