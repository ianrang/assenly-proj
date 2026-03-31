// ============================================================
// 엔티티별 zod 스키마 매핑 — validate.ts + run-all.ts 공유 (G-2)
// P-9: scripts/ → @/shared/validation import 허용.
// ============================================================

import { z } from "zod";

import {
  productCreateSchema,
  storeCreateSchema,
  clinicCreateSchema,
  treatmentCreateSchema,
  brandCreateSchema,
  ingredientCreateSchema,
  doctorCreateSchema,
} from "@/shared/validation";

import type { EntityType, ValidatedRecord } from "./types";

/** 엔티티별 zod 검증 스키마 (loader.ts ENTITY_CONFIG과 동일 기준) */
export const ENTITY_SCHEMAS: Record<EntityType, z.ZodSchema> = {
  product: productCreateSchema,
  store: storeCreateSchema,
  clinic: clinicCreateSchema,
  treatment: treatmentCreateSchema,
  brand: brandCreateSchema,
  ingredient: ingredientCreateSchema,
  doctor: doctorCreateSchema,
};

/** ValidatedRecord[] 공통 검증 — validate.ts + run-all.ts 공유 (G-2) */
export function validateWithSchemas(
  records: ValidatedRecord[],
  filterTypes?: EntityType[],
): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const record of records) {
    if (filterTypes && filterTypes.length > 0 && !filterTypes.includes(record.entityType)) continue;

    const schema = ENTITY_SCHEMAS[record.entityType];
    if (!schema) {
      failed++;
      errors.push(`Unknown entityType: ${record.entityType}`);
      continue;
    }

    const result = schema.safeParse(record.data);
    if (result.success) {
      passed++;
    } else {
      failed++;
      const id = (record.data as Record<string, unknown>).id ?? "?";
      errors.push(`${record.entityType} ${id}: ${result.error.issues.map((i) => i.message).join("; ")}`);
    }
  }

  return { passed, failed, errors };
}
