// ============================================================
// P2-61b: Stores 수동 보완 — 체인별 공통값 일괄 적용
// 독립 실행 스크립트. 외부 의존 없음 (Node.js 내장만 사용).
// P-9: scripts/ 조합 루트. P-10: 삭제해도 빌드 에러 0건.
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── 타입 (로컬 정의 — shared/ import 없이 독립성 유지) ──────

interface OperatingHours {
  weekday: string;
  saturday: string;
  sunday: string | null;
  holiday: string | null;
}

interface ChainDefaults {
  operating_hours: OperatingHours;
  english_support: string;
  tourist_services: string[];
  payment_methods: string[];
}

interface StoreData {
  id: string;
  name: Record<string, string>;
  store_type: string | null;
  english_support?: string;
  operating_hours?: OperatingHours | null;
  tourist_services?: string[];
  payment_methods?: string[];
  [key: string]: unknown;
}

interface ValidatedRecord {
  entityType: string;
  data: StoreData;
  isApproved: boolean;
  reviewedBy: string;
}

// ── 비매장 삭제 대상 ID (6건) ────────────────────────────────

const DELETE_IDS = new Set([
  "21ca08ad-c869-52fa-92bb-373ab377c1e7", // 이창글로벌 HQ
  "14c6d095-3efa-549d-b65d-687a93eff093", // 에스디생명공학 사옥
  "fc7980c2-0c7a-599c-a81e-a969f27a2ccd", // 더연 서울사무소
  "d0e3dfca-1ffe-5cb6-80a2-f2f68cf3c922", // 홍대 웯우드스튜디오 향수공방
  "ef1dd990-86c1-5dba-97aa-8c79e6fb1437", // 깍쟁이네일
  "f33c5563-ca38-5798-ada4-f37d368623b8", // P1P닥터에스테
]);

// ── 체인별 공통값 ────────────────────────────────────────────

const CHAIN_DEFAULTS: Record<string, ChainDefaults> = {
  olive_young: {
    operating_hours: {
      weekday: "10:00-22:00",
      saturday: "10:00-22:00",
      sunday: "11:00-22:00",
      holiday: "11:00-21:00",
    },
    english_support: "good",
    tourist_services: [
      "tax_refund",
      "multilingual_staff",
      "sample_bar",
      "beauty_consultation",
    ],
    payment_methods: [
      "cash",
      "credit_card",
      "debit_card",
      "mobile_pay",
      "wechat_pay",
      "alipay",
      "union_pay",
    ],
  },

  chicor: {
    operating_hours: {
      weekday: "10:30-20:00",
      saturday: "10:30-20:30",
      sunday: "10:30-20:00",
      holiday: "10:30-20:00",
    },
    english_support: "good",
    tourist_services: [
      "tax_refund",
      "multilingual_staff",
      "beauty_consultation",
      "sample_bar",
      "gift_wrapping",
    ],
    payment_methods: [
      "cash",
      "credit_card",
      "debit_card",
      "mobile_pay",
      "wechat_pay",
      "alipay",
      "union_pay",
    ],
  },

  department_store: {
    operating_hours: {
      weekday: "10:30-20:00",
      saturday: "10:30-20:30",
      sunday: "10:30-20:00",
      holiday: "10:30-20:00",
    },
    english_support: "good",
    tourist_services: [
      "tax_refund",
      "multilingual_staff",
      "beauty_consultation",
      "gift_wrapping",
      "tourist_discount",
      "wifi",
    ],
    payment_methods: [
      "cash",
      "credit_card",
      "debit_card",
      "mobile_pay",
      "wechat_pay",
      "alipay",
      "union_pay",
    ],
  },

  pharmacy: {
    operating_hours: {
      weekday: "09:00-19:00",
      saturday: "09:00-15:00",
      sunday: null,
      holiday: null,
    },
    english_support: "basic",
    tourist_services: ["tax_refund", "beauty_consultation"],
    payment_methods: ["cash", "credit_card", "debit_card"],
  },

  brand_store: {
    operating_hours: {
      weekday: "10:00-22:00",
      saturday: "10:00-22:00",
      sunday: "10:00-22:00",
      holiday: "11:00-21:00",
    },
    english_support: "basic",
    tourist_services: [
      "tax_refund",
      "multilingual_staff",
      "sample_bar",
      "beauty_consultation",
    ],
    payment_methods: ["cash", "credit_card", "debit_card", "mobile_pay"],
  },

  other: {
    operating_hours: {
      weekday: "10:00-21:00",
      saturday: "10:00-21:00",
      sunday: "11:00-20:00",
      holiday: "11:00-20:00",
    },
    english_support: "basic",
    tourist_services: ["tax_refund"],
    payment_methods: ["cash", "credit_card", "debit_card", "mobile_pay"],
  },
};

// ── 메인 ─────────────────────────────────────────────────────

function main(): void {
  const scriptDir = new URL(".", import.meta.url).pathname;
  const inputPath = join(scriptDir, "data", "stores-validated.json");

  const raw = readFileSync(inputPath, "utf-8");
  const records: ValidatedRecord[] = JSON.parse(raw);

  console.log(`[P2-61b] 입력: ${records.length}건`);

  // Step 1: 비매장 6건 제거
  const filtered = records.filter((r) => {
    if (DELETE_IDS.has(r.data.id)) {
      console.log(`  삭제: ${r.data.name.ko} (${r.data.id})`);
      return false;
    }
    return true;
  });

  console.log(
    `[P2-61b] 비매장 제거: ${records.length - filtered.length}건 → 잔여 ${filtered.length}건`,
  );

  // Step 2: 체인별 공통값 적용
  const stats: Record<string, number> = {};

  for (const record of filtered) {
    const storeType = record.data.store_type ?? "other";
    const defaults = CHAIN_DEFAULTS[storeType] ?? CHAIN_DEFAULTS.other;

    record.data.operating_hours = defaults.operating_hours;
    record.data.english_support = defaults.english_support;
    record.data.tourist_services = [...defaults.tourist_services];
    record.data.payment_methods = [...defaults.payment_methods];

    stats[storeType] = (stats[storeType] ?? 0) + 1;
  }

  console.log("[P2-61b] 체인별 적용 결과:");
  for (const [type, count] of Object.entries(stats).sort(
    ([, a], [, b]) => b - a,
  )) {
    const defaults = CHAIN_DEFAULTS[type] ?? CHAIN_DEFAULTS.other;
    console.log(
      `  ${type}: ${count}건 → english_support=${defaults.english_support}`,
    );
  }

  // Step 3: 저장
  writeFileSync(inputPath, JSON.stringify(filtered, null, 2), "utf-8");

  console.log(`[P2-61b] 완료: ${inputPath} (${filtered.length}건 저장)`);
}

main();
