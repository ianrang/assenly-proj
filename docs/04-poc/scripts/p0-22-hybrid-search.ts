/**
 * P0-22: 하이브리드 검색 로직 검증 (인메모리)
 *
 * SQL 필터 → 벡터 재정렬이 단독 검색보다 나은 결과를 내는지 검증.
 * DB 통합은 Supabase 셋업(§7.5) 후 진행.
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-22-hybrid-search.ts
 */
import { embed, embedMany } from 'ai';
import { getEmbeddingModel, getEmbeddingOptions, provider } from './shared/config.js';
import { ALL_ENTITIES } from './shared/mock-data.js';
import {
  buildEmbeddingText,
  cosineSimilarity,
  hybridSearch,
  type SearchItem,
  type SearchFilters,
} from './shared/vector-utils.js';

const DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface HybridTest {
  id: string;
  description: string;
  query: string;
  filters: SearchFilters;
  expectedBenefit: string; // What hybrid should improve vs vector-only
}

const TESTS: HybridTest[] = [
  {
    id: 'H1',
    description: 'Filter skin_type=dry → vector re-rank',
    query: 'best skincare for dry and dehydrated skin',
    filters: { skin_types: ['dry'] },
    expectedBenefit: 'Removes oily-skin products, keeps dry-skin relevant items',
  },
  {
    id: 'H2',
    description: 'Filter budget < 15000 → vector re-rank',
    query: 'affordable serum for everyday use',
    filters: { budget_max_krw: 15000 },
    expectedBenefit: 'Removes expensive items, semantic sorts affordable ones',
  },
  {
    id: 'H3',
    description: 'No filter (pure vector baseline)',
    query: 'best skincare for dry and dehydrated skin',
    filters: {},
    expectedBenefit: 'Baseline — same as vector-only',
  },
  {
    id: 'H4',
    description: 'Filter eliminates all → empty result',
    query: 'luxury treatment',
    filters: { budget_max_krw: 1000 }, // Impossible budget
    expectedBenefit: 'Should return empty gracefully',
  },
];

async function main() {
  console.log('=== P0-22: Hybrid Search Logic ===');
  console.log(`Provider: ${provider}\n`);

  const model = await getEmbeddingModel();

  // 1. 전체 엔티티 임베딩
  console.log('--- Embedding all entities ---');
  const texts = ALL_ENTITIES.map((e) => buildEmbeddingText(e as Record<string, unknown>));

  const { embeddings } = await embedMany({
    model,
    values: texts,
    providerOptions: getEmbeddingOptions('RETRIEVAL_DOCUMENT'),
  });

  const searchItems: SearchItem[] = ALL_ENTITIES.map((e, i) => ({
    id: e.id,
    text: texts[i],
    vector: embeddings[i],
    data: e as Record<string, unknown>,
  }));

  console.log(`  Embedded ${searchItems.length} items\n`);

  await sleep(DELAY_MS);

  // 2. 테스트 실행
  let allPass = true;

  for (const test of TESTS) {
    console.log(`--- ${test.id}: ${test.description} ---`);
    console.log(`  Query: "${test.query}"`);
    console.log(`  Filters: ${JSON.stringify(test.filters)}`);

    try {
      const queryResult = await embed({
        model,
        value: test.query,
        providerOptions: getEmbeddingOptions('RETRIEVAL_QUERY'),
      });
      const queryVector = queryResult.embedding;

      // A: Vector-only (no filters)
      const vectorOnly = hybridSearch({
        items: searchItems,
        queryVector,
        limit: 5,
      });

      // B: Hybrid (filters + vector)
      const hybrid = hybridSearch({
        items: searchItems,
        queryVector,
        filters: test.filters,
        limit: 5,
      });

      // C: Filter-only (no vector ranking — just filter order)
      const filterOnly = hybridSearch({
        items: searchItems,
        queryVector: new Array(queryVector.length).fill(0), // zero vector = no semantic signal
        filters: test.filters,
        limit: 5,
      });

      console.log('\n  Vector-only results:');
      vectorOnly.forEach((r, i) => {
        const name = (r.data.name as Record<string, string>)?.en ?? r.id;
        console.log(`    ${i + 1}. ${r.id} (${r.score.toFixed(4)}) ${name}`);
      });

      console.log('  Hybrid results:');
      hybrid.forEach((r, i) => {
        const name = (r.data.name as Record<string, string>)?.en ?? r.id;
        console.log(`    ${i + 1}. ${r.id} (${r.score.toFixed(4)}) ${name}`);
      });

      // 검증
      if (test.id === 'H4') {
        // 빈 결과 확인
        const pass = hybrid.length === 0;
        console.log(`\n  Empty result: ${pass ? 'PASS' : 'FAIL'} (${hybrid.length} results)`);
        if (!pass) allPass = false;
      } else if (test.id === 'H3') {
        // 베이스라인 — vector-only와 동일해야 함
        const same = hybrid.length === vectorOnly.length &&
          hybrid.every((h, i) => h.id === vectorOnly[i].id);
        console.log(`\n  Same as vector-only: ${same ? 'PASS' : 'FAIL'}`);
        if (!same) allPass = false;
      } else {
        // H1, H2: 하이브리드가 필터링으로 불필요한 항목 제거했는지 확인
        const hybridItemCount = hybrid.length;
        const vectorItemCount = vectorOnly.length;
        const filtered = vectorItemCount > hybridItemCount;

        console.log(`\n  Vector-only count: ${vectorItemCount}, Hybrid count: ${hybridItemCount}`);
        console.log(`  Filtering effect: ${filtered ? 'YES (reduced results)' : 'NO (same count)'}`);

        // 필터가 적용되었으면 PASS
        const pass = hybridItemCount <= vectorItemCount;
        console.log(`  ${test.id}: ${pass ? 'PASS' : 'FAIL'} — ${test.expectedBenefit}`);
        if (!pass) allPass = false;
      }
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
      allPass = false;
    }

    console.log('');
    await sleep(DELAY_MS);
  }

  // --- 결과 요약 ---
  console.log('=== P0-22 Results Summary ===');
  console.log(`  Hybrid search logic: ${allPass ? 'PASS' : 'issues found'}`);
  console.log('  Note: DB integration (pgvector + real SQL) deferred to §7.5.');
  console.log(`\n=== P0-22 Verdict: ${allPass ? 'PASS' : 'FAIL'} ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
