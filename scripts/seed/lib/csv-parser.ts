// ============================================================
// 파이프라인 공유 CSV 파싱 유틸 — data-collection.md §7.2
// P-7: CSV 파싱 로직 단일 변경점. 라이브러리 교체 시 이 파일만 수정.
// P-9: scripts/ 내부만. server/ import 금지.
// ============================================================

import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

// ── 옵션 ──────────────────────────────────────────────────────

/** CSV 파싱 옵션 */
export interface CsvParseOptions {
  /** 구분자 (기본: ',') */
  delimiter?: string;
  /** 파일 인코딩 (기본: 'utf-8') */
  encoding?: BufferEncoding;
  /** 빈 행 건너뛰기 (기본: true) */
  skipEmptyLines?: boolean;
  /** 필드 앞뒤 공백 제거 (기본: true) */
  trim?: boolean;
}

// ── 파싱 함수 ─────────────────────────────────────────────────

/** CSV 문자열 → Record 배열 파싱 (테스트 + 인메모리 용) */
export function parseCsvString(
  content: string,
  options?: CsvParseOptions,
): Record<string, string>[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: options?.skipEmptyLines ?? true,
    trim: options?.trim ?? true,
    delimiter: options?.delimiter ?? ",",
    bom: true,
  });
}

/** CSV 파일 → Record 배열 파싱 */
export function parseCsvFile(
  filePath: string,
  options?: CsvParseOptions,
): Record<string, string>[] {
  const content = readFileSync(filePath, {
    encoding: options?.encoding ?? "utf-8",
  });
  return parseCsvString(content, options);
}

// ── CSV 쓰기 ─────────────────────────────────────────────────

/** Record 배열 → CSV 문자열 (BOM 포함, 구글시트 호환) */
export function stringifyCsvRows(
  rows: Record<string, string>[],
  columns?: string[],
): string {
  return stringify(rows, {
    header: true,
    columns,
    bom: true,
  });
}
