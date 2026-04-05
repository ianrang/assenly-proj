// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  resolveIngredientName,
  buildCanonicalMap,
  buildNameToIdMap,
  buildIngredientRefs,
  parseMappingResponse,
  buildJunctionData,
  buildIngredientListText,
  buildMappingPrompt,
  KEY_MIN,
  KEY_MAX,
  AVOID_MIN,
  AVOID_MAX,
  type IngredientRef,
  type MappingResult,
} from "./ingredient-mapper";

// ── Fixture ─────────────────────────────────────────────────

const INGREDIENTS: IngredientRef[] = [
  {
    id: "id-niacinamide",
    nameEn: "Niacinamide",
    inciName: "Niacinamide",
    displayName: "Niacinamide",
    functions: ["brightening", "anti-inflammatory"],
    cautionSkinTypes: [],
  },
  {
    id: "id-retinol",
    nameEn: "Retinol",
    inciName: "Retinol",
    displayName: "Retinol",
    functions: ["anti-aging", "cell turnover"],
    cautionSkinTypes: ["sensitive"],
  },
  {
    id: "id-sls",
    nameEn: "Sodium Lauryl Sulfate",
    inciName: "Sodium Lauryl Sulfate",
    displayName: "Sodium Lauryl Sulfate",
    functions: ["surfactant"],
    cautionSkinTypes: ["sensitive", "dry"],
  },
  {
    id: "id-mugwort-a",
    nameEn: "Mugwort Extract",
    inciName: "Artemisia Princeps Extract",
    displayName: "Mugwort Extract (Artemisia Princeps Extract)",
    functions: ["soothing"],
    cautionSkinTypes: ["sensitive"],
  },
  {
    id: "id-mugwort-b",
    nameEn: "Mugwort Extract",
    inciName: "Artemisia Annua Extract",
    displayName: "Mugwort Extract (Artemisia Annua Extract)",
    functions: ["soothing", "antioxidant"],
    cautionSkinTypes: ["sensitive"],
  },
];

function getCanonicalMap() {
  return buildCanonicalMap(INGREDIENTS);
}

function getNameToIdMap() {
  return buildNameToIdMap(INGREDIENTS);
}

// ── resolveIngredientName ───────────────────────────────────

describe("resolveIngredientName", () => {
  const map = getCanonicalMap();

  it("정확한 이름 → 정규명 반환", () => {
    expect(resolveIngredientName("Niacinamide", map)).toBe("Niacinamide");
  });

  it("대소문자 무시 매칭", () => {
    expect(resolveIngredientName("niacinamide", map)).toBe("Niacinamide");
    expect(resolveIngredientName("NIACINAMIDE", map)).toBe("Niacinamide");
    expect(resolveIngredientName("NiAcInAmIdE", map)).toBe("Niacinamide");
  });

  it("앞뒤 공백 제거 후 매칭", () => {
    expect(resolveIngredientName("  Niacinamide  ", map)).toBe("Niacinamide");
  });

  it("존재하지 않는 이름 → null", () => {
    expect(resolveIngredientName("Unknown Ingredient", map)).toBeNull();
  });

  it("빈 문자열 → null", () => {
    expect(resolveIngredientName("", map)).toBeNull();
  });

  it("중복 해소된 displayName 매칭", () => {
    expect(
      resolveIngredientName(
        "mugwort extract (artemisia princeps extract)",
        map,
      ),
    ).toBe("Mugwort Extract (Artemisia Princeps Extract)");
    expect(
      resolveIngredientName(
        "Mugwort Extract (Artemisia Annua Extract)",
        map,
      ),
    ).toBe("Mugwort Extract (Artemisia Annua Extract)");
  });
});

// ── buildCanonicalMap / buildNameToIdMap ─────────────────────

describe("buildCanonicalMap", () => {
  it("모든 displayName이 lowercase 키로 등록", () => {
    const map = getCanonicalMap();
    expect(map.size).toBe(5);
    expect(map.get("niacinamide")).toBe("Niacinamide");
    expect(map.get("mugwort extract (artemisia princeps extract)")).toBe(
      "Mugwort Extract (Artemisia Princeps Extract)",
    );
  });
});

describe("buildNameToIdMap", () => {
  it("displayName → id 1:1 매핑", () => {
    const map = getNameToIdMap();
    expect(map.size).toBe(5);
    expect(map.get("Niacinamide")).toBe("id-niacinamide");
    expect(
      map.get("Mugwort Extract (Artemisia Princeps Extract)"),
    ).toBe("id-mugwort-a");
    expect(
      map.get("Mugwort Extract (Artemisia Annua Extract)"),
    ).toBe("id-mugwort-b");
  });
});

// ── buildIngredientRefs (displayName 중복 해소) ─────────────

describe("buildIngredientRefs", () => {
  it("고유 name.en → displayName = nameEn", () => {
    const refs = buildIngredientRefs([
      { id: "1", nameEn: "Niacinamide", inciName: "Niacinamide", functions: [], cautionSkinTypes: [] },
    ]);
    expect(refs[0].displayName).toBe("Niacinamide");
  });

  it("중복 name.en → displayName에 INCI name 보강", () => {
    const refs = buildIngredientRefs([
      { id: "1", nameEn: "Mugwort Extract", inciName: "Artemisia Princeps Extract", functions: [], cautionSkinTypes: [] },
      { id: "2", nameEn: "Mugwort Extract", inciName: "Artemisia Annua Extract", functions: [], cautionSkinTypes: [] },
    ]);
    expect(refs[0].displayName).toBe("Mugwort Extract (Artemisia Princeps Extract)");
    expect(refs[1].displayName).toBe("Mugwort Extract (Artemisia Annua Extract)");
  });

  it("중복 name.en + inciName 없음 → displayName = nameEn (폴백)", () => {
    const refs = buildIngredientRefs([
      { id: "1", nameEn: "Test", inciName: "", functions: [], cautionSkinTypes: [] },
      { id: "2", nameEn: "Test", inciName: "", functions: [], cautionSkinTypes: [] },
    ]);
    expect(refs[0].displayName).toBe("Test");
    expect(refs[1].displayName).toBe("Test");
  });

  it("원본 필드 보존", () => {
    const refs = buildIngredientRefs([
      { id: "x", nameEn: "A", inciName: "B", functions: ["f1"], cautionSkinTypes: ["sensitive"] },
    ]);
    expect(refs[0].id).toBe("x");
    expect(refs[0].nameEn).toBe("A");
    expect(refs[0].inciName).toBe("B");
    expect(refs[0].functions).toEqual(["f1"]);
    expect(refs[0].cautionSkinTypes).toEqual(["sensitive"]);
  });
});

// ── parseMappingResponse ────────────────────────────────────

describe("parseMappingResponse", () => {
  const map = getCanonicalMap();

  it("정상 JSON → key/avoid 반환", () => {
    const text = '{"key": ["Niacinamide", "Retinol"], "avoid": ["Sodium Lauryl Sulfate"]}';
    const result = parseMappingResponse(text, map);
    expect(result).toEqual({
      key: ["Niacinamide", "Retinol"],
      avoid: ["Sodium Lauryl Sulfate"],
    });
  });

  it("대소문자 불일치 → 정규명으로 해석", () => {
    const text = '{"key": ["niacinamide", "RETINOL"], "avoid": []}';
    const result = parseMappingResponse(text, map);
    expect(result).toEqual({ key: ["Niacinamide", "Retinol"], avoid: [] });
  });

  it("존재하지 않는 성분명 → 필터링", () => {
    const text = '{"key": ["Niacinamide", "Unknown Stuff"], "avoid": ["Fake Acid"]}';
    const result = parseMappingResponse(text, map);
    expect(result).toEqual({ key: ["Niacinamide"], avoid: [] });
  });

  it("key/avoid 중복 → avoid에서 제거 (PK 보호)", () => {
    const text = '{"key": ["Niacinamide"], "avoid": ["Niacinamide", "Sodium Lauryl Sulfate"]}';
    const result = parseMappingResponse(text, map);
    expect(result).toEqual({
      key: ["Niacinamide"],
      avoid: ["Sodium Lauryl Sulfate"],
    });
  });

  it("key/avoid 모두 빈 배열 → key/avoid 빈 배열 반환", () => {
    const text = '{"key": [], "avoid": []}';
    const result = parseMappingResponse(text, map);
    expect(result).toEqual({ key: [], avoid: [] });
  });

  it("JSON이 아닌 텍스트 → null", () => {
    expect(parseMappingResponse("I cannot do this", map)).toBeNull();
  });

  it("빈 문자열 → null", () => {
    expect(parseMappingResponse("", map)).toBeNull();
  });

  it("마크다운 코드 블록 감싸진 JSON → 파싱 성공", () => {
    const text = '```json\n{"key": ["Retinol"], "avoid": []}\n```';
    const result = parseMappingResponse(text, map);
    expect(result).toEqual({ key: ["Retinol"], avoid: [] });
  });

  it("key가 배열이 아닌 경우 → 빈 배열 처리", () => {
    const text = '{"key": "Niacinamide", "avoid": []}';
    const result = parseMappingResponse(text, map);
    expect(result).toEqual({ key: [], avoid: [] });
  });

  it("비문자열 값 필터링", () => {
    const text = '{"key": ["Niacinamide", 123, null, true], "avoid": []}';
    const result = parseMappingResponse(text, map);
    expect(result).toEqual({ key: ["Niacinamide"], avoid: [] });
  });

  it("중복 displayName (Mugwort) 정확히 구분", () => {
    const text = '{"key": ["Mugwort Extract (Artemisia Princeps Extract)"], "avoid": ["Mugwort Extract (Artemisia Annua Extract)"]}';
    const result = parseMappingResponse(text, map);
    expect(result).toEqual({
      key: ["Mugwort Extract (Artemisia Princeps Extract)"],
      avoid: ["Mugwort Extract (Artemisia Annua Extract)"],
    });
  });
});

// ── buildJunctionData ───────────────────────────────────────

describe("buildJunctionData", () => {
  const nameToId = getNameToIdMap();

  it("정상 매핑 → junction 행 생성", () => {
    const mappings: MappingResult[] = [
      { productId: "p1", productNameEn: "Product 1", key: ["Niacinamide", "Retinol"], avoid: ["Sodium Lauryl Sulfate"] },
    ];
    const result = buildJunctionData(mappings, nameToId);
    expect(result).toEqual([
      { product_id: "p1", ingredient_id: "id-niacinamide", type: "key" },
      { product_id: "p1", ingredient_id: "id-retinol", type: "key" },
      { product_id: "p1", ingredient_id: "id-sls", type: "avoid" },
    ]);
  });

  it("동일 product+ingredient 중복 → 첫 번째만 유지 (seen set)", () => {
    const mappings: MappingResult[] = [
      { productId: "p1", productNameEn: "Product 1", key: ["Niacinamide"], avoid: [] },
      { productId: "p1", productNameEn: "Product 1", key: ["Niacinamide"], avoid: [] },
    ];
    const result = buildJunctionData(mappings, nameToId);
    expect(result).toHaveLength(1);
  });

  it("nameToId에 없는 성분명 → 스킵", () => {
    const mappings: MappingResult[] = [
      { productId: "p1", productNameEn: "Product 1", key: ["Unknown"], avoid: [] },
    ];
    const result = buildJunctionData(mappings, nameToId);
    expect(result).toHaveLength(0);
  });

  it("빈 매핑 → 빈 배열", () => {
    expect(buildJunctionData([], nameToId)).toEqual([]);
  });

  it("여러 제품 → 각각 독립 junction", () => {
    const mappings: MappingResult[] = [
      { productId: "p1", productNameEn: "P1", key: ["Niacinamide"], avoid: [] },
      { productId: "p2", productNameEn: "P2", key: ["Niacinamide"], avoid: [] },
    ];
    const result = buildJunctionData(mappings, nameToId);
    expect(result).toHaveLength(2);
    expect(result[0].product_id).toBe("p1");
    expect(result[1].product_id).toBe("p2");
  });

  it("key와 avoid에 같은 성분이 다른 product → 각각 독립 생성", () => {
    const mappings: MappingResult[] = [
      { productId: "p1", productNameEn: "P1", key: ["Retinol"], avoid: [] },
      { productId: "p2", productNameEn: "P2", key: [], avoid: ["Retinol"] },
    ];
    const result = buildJunctionData(mappings, nameToId);
    expect(result).toEqual([
      { product_id: "p1", ingredient_id: "id-retinol", type: "key" },
      { product_id: "p2", ingredient_id: "id-retinol", type: "avoid" },
    ]);
  });
});

// ── buildIngredientListText ─────────────────────────────────

describe("buildIngredientListText", () => {
  it("번호 + displayName + function + caution 포맷", () => {
    const text = buildIngredientListText([INGREDIENTS[0]]);
    expect(text).toBe("1. Niacinamide (brightening, anti-inflammatory)");
  });

  it("caution 있는 성분 → [caution: ...] 접미", () => {
    const text = buildIngredientListText([INGREDIENTS[1]]);
    expect(text).toContain("[caution: sensitive]");
  });

  it("function 없는 성분 → 'general'", () => {
    const noFunc: IngredientRef = { ...INGREDIENTS[0], functions: [] };
    const text = buildIngredientListText([noFunc]);
    expect(text).toContain("(general)");
  });

  it("복수 성분 → 줄바꿈 구분 + 순번", () => {
    const text = buildIngredientListText(INGREDIENTS.slice(0, 3));
    const lines = text.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^1\./);
    expect(lines[1]).toMatch(/^2\./);
    expect(lines[2]).toMatch(/^3\./);
  });
});

// ── buildMappingPrompt ──────────────────────────────────────

describe("buildMappingPrompt", () => {
  const ingredientListText = "1. Niacinamide (brightening)";
  const product: Parameters<typeof buildMappingPrompt>[0] = {
    nameEn: "Test Cream",
    category: "skincare",
    subcategory: "moisturizer",
    skinTypes: ["dry", "normal"],
    concerns: ["dryness"],
  };

  it("제품 정보 포함", () => {
    const prompt = buildMappingPrompt(product, ingredientListText);
    expect(prompt).toContain("Test Cream");
    expect(prompt).toContain("skincare / moisturizer");
    expect(prompt).toContain("dry, normal");
    expect(prompt).toContain("dryness");
  });

  it("KEY/AVOID 범위 상수 포함", () => {
    const prompt = buildMappingPrompt(product, ingredientListText);
    expect(prompt).toContain(`(${KEY_MIN}-${KEY_MAX})`);
    expect(prompt).toContain(`(${AVOID_MIN}-${AVOID_MAX})`);
  });

  it("성분 목록 포함", () => {
    const prompt = buildMappingPrompt(product, ingredientListText);
    expect(prompt).toContain(ingredientListText);
  });

  it("key/avoid 중복 금지 규칙 포함", () => {
    const prompt = buildMappingPrompt(product, ingredientListText);
    expect(prompt).toContain("CANNOT be both key and avoid");
  });

  it("JSON 반환 형식 지시 포함", () => {
    const prompt = buildMappingPrompt(product, ingredientListText);
    expect(prompt).toContain('"key"');
    expect(prompt).toContain('"avoid"');
  });
});
