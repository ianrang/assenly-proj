// ============================================================
// 식약처 기능성화장품 보고품목 API (S5) — data-collection.md §3.6
// products 교차 검증용. 생성이 아닌 검증 도구.
// 기능성화장품(미백/주름개선/자외선차단) 여부 확인 → tags 보강.
// 퍼지 매칭(ITEM_NAME ↔ 제품명)은 P2-64e(Phase E) 담당.
// P-9: scripts/ 내부 import만. server/ import 금지.
// Q-8: process.env 직접 접근 금지 — pipelineEnv 경유.
// ============================================================

import { pipelineEnv } from "../../config";
import { fetchWithRetry } from "../retry";
import type { RawRecord } from "../types";

// ── 상수 (G-10 매직넘버 금지) ──────────────────────────────

/** 페이지당 요청 건수 */
const PAGE_SIZE = 100;

/** S5 API 엔드포인트 (P2-V2 검증 완료 2026-03-25) */
const MFDS_FUNCTIONAL_ENDPOINT =
  "http://apis.data.go.kr/1471000/FtnltCosmRptPrdlstInfoService/getRptPrdlstInq";

// ── API 응답 → RawRecord 변환 ─────────────────────────────

/** S5 API item 1건을 RawRecord로 변환 */
export function mapItemToRawRecord(
  item: Record<string, unknown>,
): RawRecord {
  return {
    source: "mfds-functional",
    sourceId: String(item.COSMETIC_REPORT_SEQ ?? ""),
    entityType: "product",
    data: item,
    fetchedAt: new Date().toISOString(),
  };
}

// ── 키워드 검색 ───────────────────────────────────────────

/** S5 item_name 키워드 검색 → RawRecord[] */
export async function searchMfdsFunctional(
  itemName: string,
): Promise<RawRecord[]> {
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
      item_name: itemName,
    });

    const response = await fetchWithRetry(
      `${MFDS_FUNCTIONAL_ENDPOINT}?${params}`,
      {},
    );

    if (!response.ok) {
      throw new Error(
        `MFDS S5 API error ${response.status}: ${await response.text()}`,
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
