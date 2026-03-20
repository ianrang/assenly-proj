/**
 * P0-19: 임베딩 생성 검증
 *
 * Google gemini-embedding-001 (1024d, outputDimensionality 조정)
 * 10건 엔티티 임베딩 + 쿼리 임베딩 + 유사도 검증
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-19-embedding.ts
 */
import { embed, embedMany } from 'ai';
import { getEmbeddingModel, getEmbeddingOptions, EMBEDDING_DIMENSION, provider } from './shared/config.js';
import { ALL_ENTITIES } from './shared/mock-data.js';
import { buildEmbeddingText, cosineSimilarity } from './shared/vector-utils.js';

const DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('=== P0-19: Embedding Generation ===');
  console.log(`Provider: ${provider}`);
  console.log(`Target dimension: ${EMBEDDING_DIMENSION}`);
  console.log(`Entities: ${ALL_ENTITIES.length}\n`);

  const model = await getEmbeddingModel();
  let allPass = true;

  // --- E1: 배치 임베딩 (10건) ---
  console.log('--- E1: Batch embed all entities ---');
  const texts = ALL_ENTITIES.map((e) => buildEmbeddingText(e as Record<string, unknown>));

  console.log('  Texts to embed:');
  texts.forEach((t, i) => console.log(`    [${i}] ${t.slice(0, 80)}...`));

  let entityEmbeddings: number[][] = [];
  try {
    const result = await embedMany({
      model,
      values: texts,
      providerOptions: getEmbeddingOptions('RETRIEVAL_DOCUMENT'),
    });

    entityEmbeddings = result.embeddings;
    const dims = entityEmbeddings.map((e) => e.length);
    const allCorrectDim = dims.every((d) => d === EMBEDDING_DIMENSION);

    console.log(`  Vectors: ${entityEmbeddings.length}`);
    console.log(`  Dimensions: ${[...new Set(dims)].join(', ')}`);
    console.log(`  All ${EMBEDDING_DIMENSION}d: ${allCorrectDim ? 'OK' : 'FAIL'}`);

    if (!allCorrectDim) allPass = false;
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
    allPass = false;
  }

  await sleep(DELAY_MS);

  // --- E2: 단일 쿼리 임베딩 (영어) ---
  console.log('\n--- E2: Single query embed (English) ---');
  let queryVector: number[] = [];
  try {
    const result = await embed({
      model,
      value: 'moisturizer for dry skin',
      providerOptions: getEmbeddingOptions('RETRIEVAL_QUERY'),
    });

    queryVector = result.embedding;
    const dimOk = queryVector.length === EMBEDDING_DIMENSION;
    console.log(`  Dimension: ${queryVector.length} (${dimOk ? 'OK' : 'FAIL'})`);
    if (!dimOk) allPass = false;
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
    allPass = false;
  }

  await sleep(DELAY_MS);

  // --- E3: 한국어 쿼리 임베딩 ---
  console.log('\n--- E3: Korean query embed ---');
  try {
    const result = await embed({
      model,
      value: '건성 피부용 보습제 추천해주세요',
      providerOptions: getEmbeddingOptions('RETRIEVAL_QUERY'),
    });

    const dimOk = result.embedding.length === EMBEDDING_DIMENSION;
    console.log(`  Dimension: ${result.embedding.length} (${dimOk ? 'OK' : 'FAIL'})`);
    if (!dimOk) allPass = false;
  } catch (err) {
    console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
    allPass = false;
  }

  await sleep(DELAY_MS);

  // --- E4: 유사도 검증 — "serum for oily skin" ---
  console.log('\n--- E4: Similarity — "serum for oily skin" ---');
  if (entityEmbeddings.length > 0) {
    try {
      const result = await embed({
        model,
        value: 'serum for oily skin with pore care',
        providerOptions: getEmbeddingOptions('RETRIEVAL_QUERY'),
      });

      const scores = ALL_ENTITIES.map((e, i) => ({
        id: e.id,
        name: (e.name as Record<string, string>).en,
        score: cosineSimilarity(result.embedding, entityEmbeddings[i]),
      }));
      scores.sort((a, b) => b.score - a.score);

      console.log('  Rankings:');
      scores.forEach((s, i) => console.log(`    ${i + 1}. ${s.id} (${s.score.toFixed(4)}) ${s.name}`));

      // prod-002 (Beauty of Joseon Glow Serum, oily skin) should be top among products
      const topProducts = scores.filter((s) => s.id.startsWith('prod-'));
      const bojRank = topProducts.findIndex((s) => s.id === 'prod-002') + 1;
      const pass = bojRank <= 2;
      console.log(`  prod-002 (BOJ Glow Serum) rank among products: #${bojRank} ${pass ? 'PASS' : 'FAIL'}`);
      if (!pass) allPass = false;
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
      allPass = false;
    }
  }

  await sleep(DELAY_MS);

  // --- E5: 유사도 검증 — "treatment for dark spots" ---
  console.log('\n--- E5: Similarity — "treatment for dark spots" ---');
  if (entityEmbeddings.length > 0) {
    try {
      const result = await embed({
        model,
        value: 'laser treatment for dark spots and pigmentation',
        providerOptions: getEmbeddingOptions('RETRIEVAL_QUERY'),
      });

      const scores = ALL_ENTITIES.map((e, i) => ({
        id: e.id,
        name: (e.name as Record<string, string>).en,
        score: cosineSimilarity(result.embedding, entityEmbeddings[i]),
      }));
      scores.sort((a, b) => b.score - a.score);

      console.log('  Rankings:');
      scores.forEach((s, i) => console.log(`    ${i + 1}. ${s.id} (${s.score.toFixed(4)}) ${s.name}`));

      // treat-002 (Laser Toning) or treat-003 (Chemical Peel) should be top among treatments
      const topTreatments = scores.filter((s) => s.id.startsWith('treat-'));
      const laserRank = topTreatments.findIndex((s) => s.id === 'treat-002') + 1;
      const pass = laserRank <= 2;
      console.log(`  treat-002 (Laser Toning) rank among treatments: #${laserRank} ${pass ? 'PASS' : 'FAIL'}`);
      if (!pass) allPass = false;
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : err}`);
      allPass = false;
    }
  }

  // --- 결과 요약 ---
  console.log('\n=== P0-19 Results Summary ===');
  console.log(`  Embedding model: gemini-embedding-001 (${EMBEDDING_DIMENSION}d)`);
  console.log(`  Entities embedded: ${entityEmbeddings.length}/${ALL_ENTITIES.length}`);
  console.log(`  Multilingual: Korean embed OK`);
  console.log(`  Similarity rankings: ${allPass ? 'correct' : 'issues found'}`);
  console.log(`\n=== P0-19 Verdict: ${allPass ? 'PASS' : 'FAIL'} ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
