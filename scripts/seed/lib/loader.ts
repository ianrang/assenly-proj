// ============================================================
// Stage 4 Loader — data-pipeline.md §3.4
// ValidatedRecord[] → zod 재검증 → FK 순서 → 100건 청크 UPSERT
// P-9: shared/validation/ import만. server/ import 금지.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import {
  brandCreateSchema,
  ingredientCreateSchema,
  productCreateSchema,
  storeCreateSchema,
  clinicCreateSchema,
  treatmentCreateSchema,
  doctorCreateSchema,
  productStoreRelationSchema,
  productIngredientRelationSchema,
  clinicTreatmentRelationSchema,
} from "@/shared/validation";

import { pipelineEnv } from "../config";
import type {
  EntityType,
  ValidatedRecord,
  LoadResult,
  PipelineError,
} from "./types";

// ── 타입 ────────────────────────────────────────────────────

/** 적재 옵션 — 회차별 유연성 (D-6) */
export interface LoadOptions {
  /** 청크 크기 오버라이드 (기본: PIPELINE_BATCH_SIZE) */
  batchSize?: number;
  /** 검증만 수행, DB 미접근 */
  dryRun?: boolean;
  /** 특정 entityType만 적재 */
  entityTypes?: EntityType[];
  /** UPSERT 대신 INSERT (최초 적재) */
  insertOnly?: boolean;
  /** 결과 JSON 로그 디렉토리 */
  logDir?: string;
}

/** Junction 적재 입력 */
export type JunctionType =
  | "product_store"
  | "product_ingredient"
  | "clinic_treatment";

export interface JunctionInput {
  type: JunctionType;
  data: Record<string, unknown>[];
}

// ── 매핑 상수 (D-3, G-10) ──────────────────────────────────

interface EntityConfig {
  tableName: string;
  schema: z.ZodSchema;
  onConflict: string;
}

const ENTITY_CONFIG: Record<EntityType, EntityConfig> = {
  brand: { tableName: "brands", schema: brandCreateSchema, onConflict: "id" },
  ingredient: { tableName: "ingredients", schema: ingredientCreateSchema, onConflict: "id" },
  product: { tableName: "products", schema: productCreateSchema, onConflict: "id" },
  store: { tableName: "stores", schema: storeCreateSchema, onConflict: "id" },
  clinic: { tableName: "clinics", schema: clinicCreateSchema, onConflict: "id" },
  treatment: { tableName: "treatments", schema: treatmentCreateSchema, onConflict: "id" },
  doctor: { tableName: "doctors", schema: doctorCreateSchema, onConflict: "id" },
};

const JUNCTION_CONFIG: Record<JunctionType, EntityConfig> = {
  product_store: {
    tableName: "product_stores",
    schema: productStoreRelationSchema,
    onConflict: "product_id,store_id",
  },
  product_ingredient: {
    tableName: "product_ingredients",
    schema: productIngredientRelationSchema,
    onConflict: "product_id,ingredient_id",
  },
  clinic_treatment: {
    tableName: "clinic_treatments",
    schema: clinicTreatmentRelationSchema,
    onConflict: "clinic_id,treatment_id",
  },
};

// FK 순서 — schema.dbml 의존 관계 (D-4, Q-13)
const LOAD_PHASES: EntityType[][] = [
  ["brand", "ingredient", "store", "clinic", "treatment"],
  ["product", "doctor"],
];

const DEFAULT_LOG_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : new URL(".", import.meta.url).pathname,
  "../../../docs/data-logs",
);

// ── 내부 헬퍼 ──────────────────────────────────────────────

/** 배열을 batchSize 단위 청크로 분할 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** zod safeParse로 레코드 필터링 — 통과만 반환, 실패는 에러 기록 */
function validateRecords(
  records: { id?: string; data: Record<string, unknown> }[],
  schema: z.ZodSchema,
): { valid: Record<string, unknown>[]; errors: PipelineError[] } {
  const valid: Record<string, unknown>[] = [];
  const errors: PipelineError[] = [];

  for (const record of records) {
    const result = schema.safeParse(record.data);
    if (result.success) {
      const row: Record<string, unknown> = { ...result.data };
      if (record.id) row.id = record.id;
      valid.push(row);
    } else {
      errors.push({
        stage: "load-validate",
        recordId: record.id as string | undefined,
        message: result.error.issues.map((i) => i.message).join("; "),
      });
    }
  }
  return { valid, errors };
}

/** 단일 엔티티 타입의 청크 UPSERT 실행 */
async function upsertChunks(
  client: SupabaseClient,
  tableName: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  batchSize: number,
  insertOnly: boolean,
): Promise<{ inserted: number; failed: number; errors: PipelineError[] }> {
  const chunks = chunk(rows, batchSize);
  let inserted = 0;
  let failed = 0;
  const errors: PipelineError[] = [];

  for (const batch of chunks) {
    if (insertOnly) {
      const { error } = await client.from(tableName).insert(batch);
      if (error) {
        errors.push({ stage: "load-insert", message: error.message });
        failed += batch.length;
      } else {
        inserted += batch.length;
      }
    } else {
      const { error } = await client
        .from(tableName)
        .upsert(batch, { onConflict });
      if (error) {
        errors.push({ stage: "load-upsert", message: error.message });
        failed += batch.length;
      } else {
        inserted += batch.length;
      }
    }
  }

  return { inserted, failed, errors };
}

// ── 공개 API ────────────────────────────────────────────────

/**
 * Stage 4: ValidatedRecord[] → zod 재검증 → FK 순서 → 청크 UPSERT.
 * data.id가 이미 존재한다고 가정 (deterministic UUID, D-2).
 */
export async function loadRecords(
  client: SupabaseClient,
  records: ValidatedRecord[],
  options?: LoadOptions,
): Promise<LoadResult[]> {
  const batchSize = options?.batchSize ?? pipelineEnv.PIPELINE_BATCH_SIZE;
  const dryRun = options?.dryRun ?? false;
  const insertOnly = options?.insertOnly ?? false;
  const filterTypes = options?.entityTypes;
  const logDir = options?.logDir ?? DEFAULT_LOG_DIR;

  // 승인된 레코드만 (Stage 3 검수)
  const approved = records.filter((r) => r.isApproved);

  // entityType별 그룹화
  const grouped = new Map<EntityType, ValidatedRecord[]>();
  for (const record of approved) {
    if (filterTypes && !filterTypes.includes(record.entityType)) continue;
    const list = grouped.get(record.entityType) ?? [];
    list.push(record);
    grouped.set(record.entityType, list);
  }

  const results: LoadResult[] = [];

  // Phase A → B 순서 적재 (D-4)
  for (const phase of LOAD_PHASES) {
    for (const entityType of phase) {
      const entityRecords = grouped.get(entityType);
      if (!entityRecords || entityRecords.length === 0) continue;

      const config = ENTITY_CONFIG[entityType];
      const result = await loadEntityType(
        client, entityType, entityRecords, config, batchSize, dryRun, insertOnly,
      );
      results.push(result);
    }
  }

  // 결과 로그 저장 (D-7)
  writeLoadLog(results, logDir);

  return results;
}

/** Junction 테이블 적재 (Phase C) */
export async function loadJunctions(
  client: SupabaseClient,
  junctions: JunctionInput[],
  options?: LoadOptions,
): Promise<LoadResult[]> {
  const batchSize = options?.batchSize ?? pipelineEnv.PIPELINE_BATCH_SIZE;
  const dryRun = options?.dryRun ?? false;
  const insertOnly = options?.insertOnly ?? false;
  const logDir = options?.logDir ?? DEFAULT_LOG_DIR;

  const results: LoadResult[] = [];

  for (const junction of junctions) {
    const config = JUNCTION_CONFIG[junction.type];
    const entityType = junction.type.replace("_", "-") as EntityType;

    // zod 검증
    const { valid, errors: valErrors } = validateRecords(
      junction.data.map((d) => ({ data: d })),
      config.schema,
    );

    const loadResult: LoadResult = {
      entityType: entityType as EntityType,
      total: junction.data.length,
      inserted: 0,
      updated: 0,
      failed: valErrors.length,
      errors: [...valErrors],
    };

    if (!dryRun && valid.length > 0) {
      const upsertResult = await upsertChunks(
        client, config.tableName, valid, config.onConflict, batchSize, insertOnly,
      );
      loadResult.inserted = upsertResult.inserted;
      loadResult.failed += upsertResult.failed;
      loadResult.errors.push(...upsertResult.errors);
    }

    results.push(loadResult);
  }

  writeLoadLog(results, logDir);
  return results;
}

// ── 내부 함수 ──────────────────────────────────────────────

async function loadEntityType(
  client: SupabaseClient,
  entityType: EntityType,
  records: ValidatedRecord[],
  config: EntityConfig,
  batchSize: number,
  dryRun: boolean,
  insertOnly: boolean,
): Promise<LoadResult> {
  // zod 재검증 — 통과한 레코드만 적재
  const recordsWithId = records.map((r) => ({
    id: r.data.id as string | undefined,
    data: r.data,
  }));
  const { valid, errors: valErrors } = validateRecords(recordsWithId, config.schema);

  const result: LoadResult = {
    entityType,
    total: records.length,
    inserted: 0,
    updated: 0,
    failed: valErrors.length,
    errors: [...valErrors],
  };

  if (dryRun || valid.length === 0) return result;

  const upsertResult = await upsertChunks(
    client, config.tableName, valid, config.onConflict, batchSize, insertOnly,
  );
  result.inserted = upsertResult.inserted;
  result.failed += upsertResult.failed;
  result.errors.push(...upsertResult.errors);

  return result;
}

function writeLoadLog(results: LoadResult[], logDir: string): void {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = join(logDir, `load-${timestamp}.json`);
    const summary = {
      timestamp: new Date().toISOString(),
      results,
      totals: {
        total: results.reduce((s, r) => s + r.total, 0),
        inserted: results.reduce((s, r) => s + r.inserted, 0),
        failed: results.reduce((s, r) => s + r.failed, 0),
        errors: results.reduce((s, r) => s + r.errors.length, 0),
      },
    };
    writeFileSync(logPath, JSON.stringify(summary, null, 2));
  } catch {
    // 로그 실패는 적재 결과에 영향 없음 (Q-15)
  }
}
