// ============================================================
// Deterministic UUID v5 Generator — data-pipeline.md §3.4
// Q-12: 동일 sourceId → 동일 UUID → 재적재 멱등.
// P-9: shared/types import만. server/ import 금지.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

import { v5 as uuidv5 } from "uuid";
import type { EntityType } from "./types";

// ── 엔티티별 네임스페이스 (G-10: 매직 넘버 금지) ────────────────

/** uuid v5 네임스페이스 — entityType별 고정 UUID v4. 다른 엔티티 간 충돌 방지. */
const ENTITY_NAMESPACES: Record<EntityType, string> = {
  brand: "3ba541df-e0f7-442f-b9a5-f4e8e6c6c95f",
  ingredient: "d4c1e8b3-7f6a-4e9c-a5b2-f3c8d1e6a9b4",
  product: "a2f8c5d1-9e4b-4a7c-b3f6-e1d9a2c8b5f7",
  store: "8a7c4e1f-b2d9-4a6f-9e3d-a5b8c2f7e0c1",
  clinic: "7f9a2c8b-4e1d-4f6c-a3b9-c5d8e2f7a1b6",
  treatment: "c6b9f2a5-8e3d-4c7b-a1f4-d8c2e5b9a3f6",
  doctor: "e8a3d6b1-5c9f-4a7e-b4f2-a9d3c6e1b8f5",
};

// ── 공개 API ────────────────────────────────────────────────

/**
 * source + sourceId → entityType 네임스페이스 기반 deterministic UUID v5.
 * 동일 입력이면 항상 동일 UUID 반환 (Q-12 멱등성).
 * FK 참조 시에도 같은 함수 호출 → 정합성 자동 보장.
 */
export function generateEntityId(
  entityType: EntityType,
  source: string,
  sourceId: string,
): string {
  const namespace = ENTITY_NAMESPACES[entityType];
  const key = `${source}:${sourceId}`;
  return uuidv5(key, namespace);
}
