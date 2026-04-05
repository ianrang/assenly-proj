// ============================================================
// P2-64c-1: product_stores junction 자동 생성
// _available_at 기반 유형 매핑 → loadJunctions() 적재
// P-9: scripts/ → shared/ 허용. server/ import 금지.
// Usage: npx tsx scripts/seed/generate-product-stores.ts [--dry-run]
// ============================================================

import { readFileSync } from "node:fs";
import { createPipelineClient } from "./lib/utils/db-client";
import { loadJunctions } from "./lib/loader";
import { parseArgs } from "./parse-args";
import type { ValidatedRecord } from "./lib/types";
import type { JunctionInput } from "./lib/loader";

// ── 매핑 규칙 (data-collection.md D-4) ────────────────────────

/** _available_at 값 → store_type 매핑 */
const AVAILABLE_AT_TO_STORE_TYPE: Record<string, string> = {
  olive_young: "olive_young",
  chicor: "chicor",
  daiso: "daiso",
  department_store: "department_store",
};

/** 브랜드 매장 매핑 (brand_store + 브랜드명 포함) */
const BRAND_STORE_KEYWORDS: Record<string, string[]> = {
  innisfree_store: ["이니스프리", "innisfree"],
  laneige_store: ["라네즈", "laneige"],
  etude_store: ["에뛰드", "etude"],
};

async function main() {
  const args = parseArgs();
  const dryRun = !!args["dry-run"];

  // 1. products-validated.json 로드
  const products: ValidatedRecord[] = JSON.parse(
    readFileSync("scripts/seed/data/products-validated.json", "utf-8"),
  );
  const approved = products.filter((r) => r.isApproved);
  console.log(`[product-stores] products: ${approved.length}`);

  // 2. DB에서 stores 조회 (id, store_type, name)
  const client = createPipelineClient();
  const { data: stores, error } = await client
    .from("stores")
    .select("id, store_type, name")
    .eq("status", "active");

  if (error || !stores) {
    console.error("[product-stores] stores 조회 실패:", error?.message);
    process.exit(1);
  }
  console.log(`[product-stores] stores: ${stores.length}`);

  // 3. store_type별 그룹
  const storesByType = new Map<string, string[]>();
  for (const store of stores) {
    const list = storesByType.get(store.store_type) ?? [];
    list.push(store.id);
    storesByType.set(store.store_type, list);
  }

  // 4. junction 생성
  const junctionData: { product_id: string; store_id: string }[] = [];
  const seen = new Set<string>();

  for (const product of approved) {
    const productId = product.data.id as string;
    const availableAt = (product.data._available_at as string[]) ?? [];

    for (const at of availableAt) {
      // 유형 기반 매핑 (olive_young, chicor, daiso, department_store)
      const storeType = AVAILABLE_AT_TO_STORE_TYPE[at];
      if (storeType) {
        const storeIds = storesByType.get(storeType) ?? [];
        for (const storeId of storeIds) {
          const key = `${productId}:${storeId}`;
          if (!seen.has(key)) {
            seen.add(key);
            junctionData.push({ product_id: productId, store_id: storeId });
          }
        }
        continue;
      }

      // 브랜드 매장 매핑
      const keywords = BRAND_STORE_KEYWORDS[at];
      if (keywords) {
        const brandStores = stores.filter(
          (s) =>
            s.store_type === "brand_store" &&
            keywords.some(
              (kw) =>
                (s.name as Record<string, string>)?.ko?.includes(kw) ||
                (s.name as Record<string, string>)?.en
                  ?.toLowerCase()
                  .includes(kw.toLowerCase()),
            ),
        );
        for (const store of brandStores) {
          const key = `${productId}:${store.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            junctionData.push({ product_id: productId, store_id: store.id });
          }
        }
      }
    }
  }

  console.log(`[product-stores] generated: ${junctionData.length} junctions`);

  if (dryRun) {
    console.log("[product-stores] DRY RUN — DB 적재 안 함");
    // store_type별 통계
    const stats: Record<string, number> = {};
    for (const j of junctionData) {
      const store = stores.find((s) => s.id === j.store_id);
      const type = store?.store_type ?? "unknown";
      stats[type] = (stats[type] ?? 0) + 1;
    }
    console.log("[product-stores] store_type별:", JSON.stringify(stats, null, 2));
    return;
  }

  // 5. loadJunctions 적재
  const input: JunctionInput[] = [
    { type: "product_store", data: junctionData },
  ];
  const results = await loadJunctions(client, input);
  for (const r of results) {
    console.log(
      `  ${r.entityType}: ${r.inserted} inserted, ${r.failed} failed`,
    );
    if (r.errors.length > 0) {
      r.errors.forEach((e) => console.warn(`    - ${e.message}`));
    }
  }
}

main().catch((err) => {
  console.error("[product-stores] Fatal:", err);
  process.exit(1);
});
