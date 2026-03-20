/**
 * 벡터 유틸 — cosine similarity, 임베딩 텍스트 생성, 하이브리드 검색
 */

/**
 * 코사인 유사도 (두 벡터 간 -1 ~ 1)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 엔티티 데이터 → 임베딩용 텍스트 생성
 * 포맷: name | category | skin_types | concerns | key_ingredients
 */
export function buildEmbeddingText(entity: Record<string, unknown>): string {
  const parts: string[] = [];

  // name (LocalizedText → en)
  const name = entity.name;
  if (name && typeof name === 'object' && 'en' in (name as Record<string, unknown>)) {
    parts.push((name as Record<string, string>).en);
  } else if (typeof name === 'string') {
    parts.push(name);
  }

  // category / clinic_name
  if (entity.category) parts.push(String(entity.category));
  if (entity.clinic_name && typeof entity.clinic_name === 'object') {
    parts.push((entity.clinic_name as Record<string, string>).en ?? '');
  }

  // skin_types / suitable_skin_types
  const skinTypes = (entity.skin_types ?? entity.suitable_skin_types) as string[] | undefined;
  if (skinTypes?.length) parts.push(`Skin types: ${skinTypes.join(', ')}`);

  // concerns / target_concerns
  const concerns = (entity.concerns ?? entity.target_concerns) as string[] | undefined;
  if (concerns?.length) parts.push(`Concerns: ${concerns.join(', ')}`);

  // key_ingredients
  const ingredients = entity.key_ingredients as string[] | undefined;
  if (ingredients?.length) parts.push(`Ingredients: ${ingredients.join(', ')}`);

  // price
  if (entity.price) parts.push(`Price: ${entity.price} KRW`);
  if (entity.price_range && typeof entity.price_range === 'object') {
    const pr = entity.price_range as Record<string, number>;
    parts.push(`Price: ${pr.min}-${pr.max} KRW`);
  }

  return parts.join(' | ');
}

/**
 * 인메모리 하이브리드 검색: SQL 필터 → 벡터 재정렬
 */
export interface SearchItem {
  id: string;
  text: string;
  vector: number[];
  data: Record<string, unknown>;
}

export interface SearchFilters {
  skin_types?: string[];
  concerns?: string[];
  budget_max_krw?: number;
  domain?: 'shopping' | 'treatment';
}

export function hybridSearch(params: {
  items: SearchItem[];
  queryVector: number[];
  filters?: SearchFilters;
  limit?: number;
}): Array<{ id: string; score: number; data: Record<string, unknown> }> {
  const { items, queryVector, filters, limit = 5 } = params;

  // 1단계: SQL 필터 시뮬레이션
  let filtered = items;

  if (filters) {
    if (filters.domain === 'shopping') {
      filtered = filtered.filter((item) => 'price' in item.data && !('clinic_name' in item.data));
    } else if (filters.domain === 'treatment') {
      filtered = filtered.filter((item) => 'clinic_name' in item.data);
    }

    if (filters.skin_types?.length) {
      filtered = filtered.filter((item) => {
        const types = (item.data.skin_types ?? item.data.suitable_skin_types) as string[] | undefined;
        return types?.some((t) => filters.skin_types!.includes(t));
      });
    }

    if (filters.concerns?.length) {
      filtered = filtered.filter((item) => {
        const c = (item.data.concerns ?? item.data.target_concerns) as string[] | undefined;
        return c?.some((t) => filters.concerns!.includes(t));
      });
    }

    if (filters.budget_max_krw !== undefined) {
      filtered = filtered.filter((item) => {
        const price = item.data.price as number | undefined;
        const priceRange = item.data.price_range as { min: number } | undefined;
        return (price !== undefined && price <= filters.budget_max_krw!) ||
               (priceRange !== undefined && priceRange.min <= filters.budget_max_krw!);
      });
    }
  }

  // 2단계: 벡터 유사도 재정렬
  const scored = filtered.map((item) => ({
    id: item.id,
    score: cosineSimilarity(item.vector, queryVector),
    data: item.data,
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}
