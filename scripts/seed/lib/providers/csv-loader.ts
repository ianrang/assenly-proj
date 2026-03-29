// ============================================================
// Channel B CSV 로더 — data-collection.md §1.2 Channel B
// 수동 CSV (구글시트 export) → RawRecord[] 변환.
// P-9: scripts/ 내부만. server/ import 금지.
// P-7: CSV 파싱은 csv-parser.ts에 위임 (단일 변경점).
// ============================================================

import { parseCsvFile, type CsvParseOptions } from "../csv-parser";
import type { RawRecord, EntityType } from "../types";

// ── 상수 (G-10 매직넘버 금지) ──────────────────────────────

/** sourceId로 사용할 기본 컬럼명 */
const DEFAULT_ID_COLUMN = "id";

// ── CSV → RawRecord 변환 ──────────────────────────────────

/** CSV 파일 → RawRecord[] 변환 */
export function loadCsvAsRawRecords(
  filePath: string,
  entityType: EntityType,
  options?: CsvParseOptions & { idColumn?: string },
): RawRecord[] {
  const rows = parseCsvFile(filePath, options);
  const idColumn = options?.idColumn ?? DEFAULT_ID_COLUMN;
  const fetchedAt = new Date().toISOString();

  return rows.map((row, index) => ({
    source: "csv",
    sourceId: String(row[idColumn] ?? `csv-${index}`),
    entityType,
    data: row,
    fetchedAt,
  }));
}
