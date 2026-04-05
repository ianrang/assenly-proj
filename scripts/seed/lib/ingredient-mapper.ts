// ============================================================
// Product-Ingredient Mapping — 순수 함수 모듈
// LLM 응답 파싱, 성분명 해석, junction 데이터 생성, 프롬프트 구성
// P-9: scripts/ 내부 전용. server/ import 금지.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

// ── 타입 (L-14: 모듈 전용) ──────────────────────────────────

/** 성분 참조 데이터 */
export interface IngredientRef {
  id: string;
  nameEn: string;
  inciName: string;
  /** 동일 name.en 중복 시 "{name} ({inci})" 형식 */
  displayName: string;
  functions: string[];
  cautionSkinTypes: string[];
}

/** 단일 제품 LLM 매핑 결과 */
export interface MappingResult {
  productId: string;
  productNameEn: string;
  key: string[];
  avoid: string[];
}

/** DB 적재용 junction 행 */
export interface JunctionRow {
  product_id: string;
  ingredient_id: string;
  type: "key" | "avoid";
}

/** 프롬프트 입력용 제품 정보 */
export interface ProductInput {
  nameEn: string;
  category: string;
  subcategory: string;
  skinTypes: string[];
  concerns: string[];
}

// ── 상수 (G-10) ────────────────────────────────────────────

/** 성분 매핑 건수 범위 (프롬프트 지시용) */
export const KEY_MIN = 2;
export const KEY_MAX = 5;
export const AVOID_MIN = 0;
export const AVOID_MAX = 2;

// ── 성분명 해석 ─────────────────────────────────────────────

/** LLM 반환 성분명 → 원본 정규명 (case-insensitive) */
export function resolveIngredientName(
  raw: string,
  lowerToCanonical: Map<string, string>,
): string | null {
  return lowerToCanonical.get(raw.trim().toLowerCase()) ?? null;
}

/** IngredientRef[] → lowercase→canonical 매핑 구축 */
export function buildCanonicalMap(
  ingredients: IngredientRef[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ing of ingredients) {
    map.set(ing.displayName.toLowerCase(), ing.displayName);
  }
  return map;
}

/** IngredientRef[] → displayName→id 매핑 구축 */
export function buildNameToIdMap(
  ingredients: IngredientRef[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const ing of ingredients) {
    map.set(ing.displayName, ing.id);
  }
  return map;
}

// ── displayName 중복 해소 ───────────────────────────────────

/** 원시 성분 데이터 → IngredientRef (중복 name.en은 INCI name 보강) */
export function buildIngredientRefs(
  records: Array<{
    id: string;
    nameEn: string;
    inciName: string;
    functions: string[];
    cautionSkinTypes: string[];
  }>,
): IngredientRef[] {
  // 중복 name.en 탐지
  const nameCount = new Map<string, number>();
  for (const r of records) {
    nameCount.set(r.nameEn, (nameCount.get(r.nameEn) ?? 0) + 1);
  }

  return records.map((r) => {
    const isDuplicate = (nameCount.get(r.nameEn) ?? 0) > 1;
    const displayName =
      isDuplicate && r.inciName ? `${r.nameEn} (${r.inciName})` : r.nameEn;

    return { ...r, displayName };
  });
}

// ── LLM 응답 파싱 ───────────────────────────────────────────

/** LLM JSON 응답 → key/avoid 성분명 배열 (검증 + 중복 제거) */
export function parseMappingResponse(
  text: string,
  lowerToCanonical: Map<string, string>,
): { key: string[]; avoid: string[] } | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed: { key?: unknown; avoid?: unknown } = JSON.parse(
      jsonMatch[0],
    );

    const rawKey = Array.isArray(parsed.key) ? parsed.key : [];
    const rawAvoid = Array.isArray(parsed.avoid) ? parsed.avoid : [];

    // case-insensitive 매칭 → 정규 성분명 반환
    const key = rawKey
      .map((v) =>
        typeof v === "string" ? resolveIngredientName(v, lowerToCanonical) : null,
      )
      .filter((v): v is string => v !== null);

    const avoid = rawAvoid
      .map((v) =>
        typeof v === "string" ? resolveIngredientName(v, lowerToCanonical) : null,
      )
      .filter((v): v is string => v !== null);

    // key/avoid 중복 제거 (PK 제약: 동일 성분은 하나의 type만)
    const keySet = new Set(key);
    const filteredAvoid = avoid.filter((name) => !keySet.has(name));

    return { key, avoid: filteredAvoid };
  } catch {
    return null;
  }
}

// ── Junction 데이터 생성 ────────────────────────────────────

/** MappingResult[] → JunctionRow[] (중복 방지 + name→ID 해석) */
export function buildJunctionData(
  mappings: MappingResult[],
  nameToId: Map<string, string>,
): JunctionRow[] {
  const junctionData: JunctionRow[] = [];
  const seen = new Set<string>();

  for (const mapping of mappings) {
    for (const name of mapping.key) {
      const ingredientId = nameToId.get(name);
      if (!ingredientId) continue;
      const key = `${mapping.productId}:${ingredientId}`;
      if (!seen.has(key)) {
        seen.add(key);
        junctionData.push({
          product_id: mapping.productId,
          ingredient_id: ingredientId,
          type: "key",
        });
      }
    }

    for (const name of mapping.avoid) {
      const ingredientId = nameToId.get(name);
      if (!ingredientId) continue;
      const key = `${mapping.productId}:${ingredientId}`;
      if (!seen.has(key)) {
        seen.add(key);
        junctionData.push({
          product_id: mapping.productId,
          ingredient_id: ingredientId,
          type: "avoid",
        });
      }
    }
  }

  return junctionData;
}

// ── 프롬프트 구성 ───────────────────────────────────────────

/** 성분 목록 → 프롬프트용 텍스트 */
export function buildIngredientListText(
  ingredients: IngredientRef[],
): string {
  return ingredients
    .map((ing, i) => {
      const funcs =
        ing.functions.length > 0 ? ing.functions.join(", ") : "general";
      const caution =
        ing.cautionSkinTypes.length > 0
          ? ` [caution: ${ing.cautionSkinTypes.join(", ")}]`
          : "";
      return `${i + 1}. ${ing.displayName} (${funcs})${caution}`;
    })
    .join("\n");
}

/** 제품 + 성분 목록 → LLM 매핑 프롬프트 */
export function buildMappingPrompt(
  product: ProductInput,
  ingredientListText: string,
): string {
  return `You are a K-beauty product formulation expert.

Given this product:
- Name: ${product.nameEn}
- Category: ${product.category} / ${product.subcategory}
- Target skin types: ${product.skinTypes.join(", ")}
- Target concerns: ${product.concerns.join(", ")}

From the ingredient database below, identify:
1. KEY ingredients (${KEY_MIN}-${KEY_MAX}): active ingredients most likely present in this product based on its name, category, and formulation purpose
2. AVOID ingredients (${AVOID_MIN}-${AVOID_MAX}): ingredients from the list that users with this product's target skin types should be cautious about

RULES:
- An ingredient CANNOT be both key and avoid for the same product
- Use EXACT ingredient names from the list below
- Return ONLY valid JSON, no markdown fences, no explanation

Available ingredients:
${ingredientListText}

Return JSON in this exact format:
{"key": ["Ingredient Name 1", "Ingredient Name 2"], "avoid": ["Ingredient Name 3"]}`;
}
