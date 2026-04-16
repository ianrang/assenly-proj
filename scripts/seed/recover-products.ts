// ============================================================
// Phase 1: 제품 데이터 정본 복원
// enriched.json 기반 brand 복원 + 오염 데이터 초기화
// P-9: scripts/ → shared/ import만. server/ import 금지.
//
// 실행: npx tsx scripts/seed/recover-products.ts
// ============================================================

import * as fs from "node:fs";
import * as path from "node:path";

const DATA_DIR = path.join(__dirname, "data");
const ENRICHED_PATH = path.join(DATA_DIR, "products-enriched.json");
const VALIDATED_PATH = path.join(DATA_DIR, "products-validated.json");
const RECOVERED_PATH = path.join(DATA_DIR, "products-recovered.json");

// ── 타입 ─────────────────────────────────────────────────────

interface EnrichedData {
  id: string;
  brand: string;
  brand_id: string;
  name_en: string;
  [key: string]: unknown;
}

interface ValidatedData {
  id: string;
  brand: string;
  brand_id: string;
  name: { en: string; ko: string; [key: string]: string };
  name_en?: string;
  name_ko?: string;
  images: string[];
  purchase_links: Array<{ platform: string; url: string }> | null;
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  [key: string]: unknown;
}

interface ValidatedRecord {
  entityType: string;
  data: ValidatedData;
  isApproved: boolean;
  [key: string]: unknown;
}

interface EnrichedRecord {
  data: EnrichedData;
  [key: string]: unknown;
}

// ── 순수 함수 (테스트 가능) ─────────────────────────────────

/** 오염 여부 판정: enriched brand ≠ validated brand */
export function isCorruptedProduct(
  enriched: Pick<EnrichedData, 'brand' | 'name_en'>,
  validated: Pick<ValidatedData, 'brand' | 'name_en'>,
): boolean {
  return enriched.brand !== validated.brand;
}

/** enriched에서 brand/brand_id 추출 */
export function recoverBrand(
  enriched: Pick<EnrichedData, 'brand' | 'brand_id'>,
): { brand: string; brand_id: string } {
  return { brand: enriched.brand, brand_id: enriched.brand_id };
}

/** 복원된 레코드 생성 */
export function buildRecoveredRecord(
  validated: ValidatedRecord,
  enriched: Pick<EnrichedData, 'brand' | 'brand_id'>,
): ValidatedRecord {
  const isCorrupted = validated.data.brand !== enriched.brand;

  if (!isCorrupted) {
    return validated; // 정상 — 그대로 보존
  }

  // 오염 — brand 복원 + 이미지/링크/가격 초기화
  return {
    ...validated,
    data: {
      ...validated.data,
      brand: enriched.brand,
      brand_id: enriched.brand_id,
      images: [],
      purchase_links: null,
      price: null,
      price_min: null,
      price_max: null,
    },
  };
}

// ── 메인 ─────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(ENRICHED_PATH) || !fs.existsSync(VALIDATED_PATH)) {
    console.error("필수 파일 없음:", ENRICHED_PATH, VALIDATED_PATH);
    process.exit(1);
  }

  const enrichedRecords: EnrichedRecord[] = JSON.parse(fs.readFileSync(ENRICHED_PATH, "utf-8"));
  const validatedRecords: ValidatedRecord[] = JSON.parse(fs.readFileSync(VALIDATED_PATH, "utf-8"));

  // enriched ID → data 맵
  const enrichedMap = new Map<string, EnrichedData>();
  for (const r of enrichedRecords) {
    enrichedMap.set(r.data.id, r.data);
  }

  let restored = 0;
  let preserved = 0;
  let essenlyKept = 0;

  const recovered: ValidatedRecord[] = [];

  for (const v of validatedRecords) {
    if (v.entityType !== "product") {
      recovered.push(v);
      continue;
    }

    const enriched = enrichedMap.get(v.data.id);

    if (!enriched) {
      // enriched에 없는 제품 (Essenly 등) → 그대로 보존
      recovered.push(v);
      essenlyKept++;
      console.log(`보존 (enriched 미존재): ${v.data.name?.en ?? v.data.name_en ?? v.data.id}`);
      continue;
    }

    const result = buildRecoveredRecord(v, enriched);
    if (result !== v) {
      restored++;
      console.log(`복원: [${enriched.brand}] ${enriched.name_en}`);
    } else {
      preserved++;
    }
    recovered.push(result);
  }

  fs.writeFileSync(RECOVERED_PATH, JSON.stringify(recovered, null, 2), "utf-8");

  console.log(`\n=== 복원 결과 ===`);
  console.log(`복원: ${restored}건`);
  console.log(`보존: ${preserved}건`);
  console.log(`Essenly 등 특수: ${essenlyKept}건`);
  console.log(`총: ${recovered.length}건 → ${RECOVERED_PATH}`);
}

const isDirectRun = process.argv[1]?.endsWith("recover-products.ts");
if (isDirectRun) {
  main();
}
