// ============================================================
// EU CosIng DB CSV (S6) — data-collection.md §3.7
// ingredients INCI 표준화 + function + restriction 보강.
// S3↔S6 매칭은 fetch-service 담당 (P2-56n). 이 모듈은 CSV 로드만.
// P-9: scripts/ 내부 import만. server/ import 금지.
// Q-8: pipelineEnv.COSING_CSV_PATH 경유.
// P-7: CSV 파싱은 csv-parser.ts 공유 유틸.
// ============================================================

import { pipelineEnv } from "../../config";
import { parseCsvFile } from "../csv-parser";
import type { RawRecord } from "../types";

// ── 상수 (G-10 매직넘버 금지) ──────────────────────────────

/** EU CosIng CSV 구분자 (EU 표준 세미콜론) */
const COSING_DELIMITER = ";";

// ── CSV 행 → RawRecord 변환 ───────────────────────────────

/** CosIng CSV 1행을 RawRecord로 변환 */
export function mapRowToRawRecord(
  row: Record<string, string>,
): RawRecord {
  return {
    source: "cosing",
    sourceId: String(row["INCI name"] ?? ""),
    entityType: "ingredient",
    data: row,
    fetchedAt: new Date().toISOString(),
  };
}

// ── CosIng 전체 로드 ──────────────────────────────────────

/** CosIng CSV 전체 로드 → RawRecord[] */
export function loadCosIngIngredients(): RawRecord[] {
  const filePath = pipelineEnv.COSING_CSV_PATH;
  const rows = parseCsvFile(filePath, { delimiter: COSING_DELIMITER });

  const seen = new Map<string, RawRecord>();
  for (const row of rows) {
    const record = mapRowToRawRecord(row);
    if (record.sourceId && !seen.has(record.sourceId)) {
      seen.set(record.sourceId, record);
    }
  }

  return [...seen.values()];
}
