// ============================================================
// 식약처 화장품 사용제한 원료정보 API (S4) — data-collection.md §3.5
// ingredients 안전성 보강. S3 LEFT JOIN enrichment.
// 전체 다운로드 → 국가별 레코드 모두 보존 (6개국 서비스).
// 비즈니스 필터링(REGULATE_TYPE, 한국/EU 우선)은 Stage 2~3 담당.
// P-9: scripts/ 내부 import만. server/ import 금지.
// Q-8: process.env 직접 접근 금지 — pipelineEnv 경유.
// ============================================================

import { pipelineEnv } from "../../config";
import { fetchWithRetry } from "../retry";
import type { RawRecord } from "../types";

// ── 상수 (G-10 매직넘버 금지) ──────────────────────────────

/** 페이지당 요청 건수 */
const PAGE_SIZE = 100;

/** S4 API 엔드포인트 (P2-V2 검증 완료 2026-03-25) */
const MFDS_RESTRICTED_ENDPOINT =
  "https://apis.data.go.kr/1471000/CsmtcsUseRstrcInfoService/getCsmtcsUseRstrcInfoService";

// ── API 응답 → RawRecord 변환 ─────────────────────────────

/** S4 API item 1건을 RawRecord로 변환 */
export function mapItemToRawRecord(
  item: Record<string, unknown>,
): RawRecord {
  const engName = String(item.INGR_ENG_NAME ?? "");
  const country = String(item.COUNTRY_NAME ?? "");

  return {
    source: "mfds-restricted",
    sourceId: engName && country ? `${engName}:${country}` : engName || "",
    entityType: "ingredient",
    data: item,
    fetchedAt: new Date().toISOString(),
  };
}

// ── 전체 풀 다운로드 ──────────────────────────────────────

/** S4 전체 사용제한 원료 다운로드 → RawRecord[] */
export async function fetchAllMfdsRestricted(): Promise<RawRecord[]> {
  const serviceKey = pipelineEnv.MFDS_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("MFDS_SERVICE_KEY is not configured");
  }

  const seen = new Map<string, RawRecord>();
  let fetched = 0;

  for (let pageNo = 1; ; pageNo++) {
    const params = new URLSearchParams({
      serviceKey,
      type: "json",
      numOfRows: String(PAGE_SIZE),
      pageNo: String(pageNo),
    });

    const response = await fetchWithRetry(
      `${MFDS_RESTRICTED_ENDPOINT}?${params}`,
      {},
    );

    if (!response.ok) {
      throw new Error(
        `MFDS S4 API error ${response.status}: ${await response.text()}`,
      );
    }

    const data: unknown = await response.json();
    const body = (data as Record<string, unknown>).body as
      | { totalCount?: number; items?: unknown }
      | undefined;

    // items 구조 방어: { item: [...] } 또는 직접 배열
    const rawItems = body?.items;
    const items: Record<string, unknown>[] = Array.isArray(rawItems)
      ? rawItems
      : Array.isArray((rawItems as Record<string, unknown> | undefined)?.item)
        ? ((rawItems as Record<string, unknown>).item as Record<string, unknown>[])
        : [];

    for (const item of items) {
      const record = mapItemToRawRecord(item);
      if (record.sourceId && !seen.has(record.sourceId)) {
        seen.set(record.sourceId, record);
      }
    }

    fetched += items.length;

    // 종료: totalCount 도달 또는 빈 페이지
    const totalCount = body?.totalCount ?? 0;
    if (items.length === 0 || fetched >= totalCount) {
      break;
    }
  }

  return [...seen.values()];
}
