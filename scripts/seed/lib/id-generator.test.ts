// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateEntityId } from "./id-generator";
import type { EntityType } from "./types";

describe("generateEntityId", () => {
  it("동일 입력 → 동일 UUID (결정적)", () => {
    const id1 = generateEntityId("brand", "csv", "b001-innisfree");
    const id2 = generateEntityId("brand", "csv", "b001-innisfree");
    expect(id1).toBe(id2);
  });

  it("다른 entityType + 같은 sourceId → 다른 UUID", () => {
    const brandId = generateEntityId("brand", "csv", "test-001");
    const productId = generateEntityId("product", "csv", "test-001");
    expect(brandId).not.toBe(productId);
  });

  it("같은 entityType + 다른 source → 다른 UUID", () => {
    const kakaoId = generateEntityId("store", "kakao", "12345");
    const csvId = generateEntityId("store", "csv", "12345");
    expect(kakaoId).not.toBe(csvId);
  });

  it("같은 entityType + 같은 source + 다른 sourceId → 다른 UUID", () => {
    const id1 = generateEntityId("product", "csv", "p001");
    const id2 = generateEntityId("product", "csv", "p002");
    expect(id1).not.toBe(id2);
  });

  it("UUID v4 형식 반환 (8-4-4-4-12)", () => {
    const id = generateEntityId("brand", "csv", "test");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("7개 entityType 모두 고유 네임스페이스 보유", () => {
    const types: EntityType[] = [
      "brand", "ingredient", "product", "store",
      "clinic", "treatment", "doctor",
    ];
    const ids = types.map((t) => generateEntityId(t, "csv", "same-id"));
    const unique = new Set(ids);
    expect(unique.size).toBe(types.length);
  });

  it("빈 sourceId — 에러 없이 UUID 반환", () => {
    const id = generateEntityId("brand", "csv", "");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
