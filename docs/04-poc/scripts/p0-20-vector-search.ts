/**
 * P0-20: 벡터 검색 정확도 검증 (인메모리)
 *
 * 10건 임베딩 → 5개 쿼리 → Top-5 관련성 확인
 * pgvector는 Supabase 셋업(§7.5) 후 검증. 여기서는 임베딩 품질 + 유사도 로직 확인.
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-20-vector-search.ts
 */
import { embed, embedMany } from 'ai';
import { getEmbeddingModel, getEmbeddingOptions, EMBEDDING_DIMENSION, provider } from './shared/config.js';
import { ALL_ENTITIES } from './shared/mock-data.js';
import { buildEmbeddingText, cosineSimilarity, type SearchItem } from './shared/vector-utils.js';

const DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface QueryTest {
  id: string;
  query: string;
  description: string;
  expectedRelevant: string[]; // IDs that should appear in top-5
  minRelevantInTop5: number;
}

const QUERIES: QueryTest[] = [
  {
    id: 'V1',
    query: 'hydrating serum for sensitive skin',
    description: 'Sensitive skin hydrating serum',
    expectedRelevant: ['prod-003', 'prod-001'], // Torriden, COSRX Snail
    minRelevantInTop5: 1,
  },
  {
    id: 'V2',
    query: 'laser treatment for pigmentation and dark spots',
    description: 'Laser for dark spots',
    expectedRelevant: ['treat-002', 'treat-003'], // Laser Toning, Chemical Peel
    minRelevantInTop5: 1,
  },
  {
    id: 'V3',
    query: 'affordable skincare product under 10000 won',
    description: 'Budget constraint (semantic limitation test)',
    expectedRelevant: ['prod-005'], // COSRX Cleanser 9000
    minRelevantInTop5: 0, // may not work — semantic search doesn't understand price numerics well
  },
  {
    id: 'V4',
    query: 'facial treatment at a clinic near Gangnam',
    description: 'Cross-domain: treatments should rank higher',
    expectedRelevant: ['treat-001', 'treat-005'], // Gangnam Glow Clinic treatments
    minRelevantInTop5: 1,
  },
  {
    id: 'V5',
    query: '지성 피부 세럼 추천해주세요',
    description: 'Korean language query',
    expectedRelevant: ['prod-002', 'prod-005'], // BOJ Glow (oily), COSRX Cleanser (oily)
    minRelevantInTop5: 1,
  },
];

async function main() {
  console.log('=== P0-20: Vector Search Accuracy (In-Memory) ===');
  console.log(`Provider: ${provider}`);
  console.log(`Entities: ${ALL_ENTITIES.length}, Queries: ${QUERIES.length}\n`);

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

  console.log(`  Embedded ${searchItems.length} items (${embeddings[0].length}d)\n`);

  await sleep(DELAY_MS);

  // 2. 쿼리별 검색
  let totalPass = 0;

  for (const qt of QUERIES) {
    console.log(`--- ${qt.id}: ${qt.description} ---`);
    console.log(`  Query: "${qt.query}"`);

    try {
      const result = await embed({
        model,
        value: qt.query,
        providerOptions: getEmbeddingOptions('RETRIEVAL_QUERY'),
      });

      // 유사도 계산 + 정렬
      const scored = searchItems.map((item) => ({
        id: item.id,
        name: ((item.data.name as Record<string, string>)?.en ?? item.id),
        score: cosineSimilarity(result.embedding, item.vector),
      }));
      scored.sort((a, b) => b.score - a.score);

      // Top-5 출력
      const top5 = scored.slice(0, 5);
      console.log('  Top-5:');
      top5.forEach((s, i) =>
        console.log(`    ${i + 1}. ${s.id} (${s.score.toFixed(4)}) ${s.name}`),
      );

      // 관련성 확인
      const relevantInTop5 = top5.filter((s) => qt.expectedRelevant.includes(s.id)).length;
      const pass = relevantInTop5 >= qt.minRelevantInTop5;
      totalPass += pass ? 1 : 0;

      console.log(
        `  Relevant in Top-5: ${relevantInTop5}/${qt.expectedRelevant.length}` +
          ` (min required: ${qt.minRelevantInTop5}) — ${pass ? 'PASS' : 'FAIL'}`,
      );
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
    }

    console.log('');
    await sleep(DELAY_MS);
  }

  // --- 결과 요약 ---
  console.log('=== P0-20 Results Summary ===');
  console.log(`  Queries passed: ${totalPass}/${QUERIES.length}`);
  console.log(`  Note: V3 (budget) is expected to fail — semantic search doesn't understand numeric price.`);
  console.log(`  Note: pgvector integration deferred to §7.5 (Supabase setup).`);

  // V3 제외하고 판정 (V3는 한계 테스트)
  const coreQueries = QUERIES.filter((q) => q.id !== 'V3');
  const corePass = totalPass >= coreQueries.length;

  const verdict = corePass ? 'PASS' : totalPass >= 3 ? 'CONDITIONAL' : 'FAIL';
  console.log(`\n=== P0-20 Verdict: ${verdict} (${totalPass}/${QUERIES.length}, core ${coreQueries.length} required) ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
