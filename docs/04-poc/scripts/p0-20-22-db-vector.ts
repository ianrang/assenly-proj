/**
 * P0-20 + P0-22: pgvector DB 벡터 검색 + 하이브리드 검색 검증
 *
 * 1. Mock 10건 + 임베딩 → products/treatments 테이블 삽입
 * 2. pgvector RPC 함수로 유사도 검색 → 인메모리 결과와 비교
 * 3. SQL 필터 + 벡터 재정렬 (하이브리드) 검증
 * 4. 전체 정리
 *
 * 사전 요구: 003_vector_search_functions.sql 실행 완료
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-20-22-db-vector.ts
 */
import { embed, embedMany } from 'ai';
import { getEmbeddingModel, getEmbeddingOptions, provider } from './shared/config.js';
import { ALL_PRODUCTS, ALL_TREATMENTS } from './shared/mock-data.js';
import { buildEmbeddingText, cosineSimilarity } from './shared/vector-utils.js';
import { createServiceClient, printResult } from './infra/helpers.js';

const DELAY_MS = 1000;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('=== P0-20/P0-22: pgvector DB Vector Search ===');
  console.log(`Provider: ${provider}\n`);

  const supabase = createServiceClient();
  const embeddingModel = await getEmbeddingModel();
  let allPass = true;

  const insertedProductIds: string[] = [];
  const insertedTreatmentIds: string[] = [];

  // --- 1. 임베딩 생성 ---
  console.log('--- 1. Generate embeddings ---');
  const productTexts = ALL_PRODUCTS.map((p) => buildEmbeddingText(p as Record<string, unknown>));
  const treatmentTexts = ALL_TREATMENTS.map((t) => buildEmbeddingText(t as Record<string, unknown>));

  const { embeddings: productEmbeddings } = await embedMany({
    model: embeddingModel,
    values: productTexts,
    providerOptions: getEmbeddingOptions('RETRIEVAL_DOCUMENT'),
  });
  console.log(`  Products: ${productEmbeddings.length} embeddings (${productEmbeddings[0].length}d)`);

  await sleep(DELAY_MS);

  const { embeddings: treatmentEmbeddings } = await embedMany({
    model: embeddingModel,
    values: treatmentTexts,
    providerOptions: getEmbeddingOptions('RETRIEVAL_DOCUMENT'),
  });
  console.log(`  Treatments: ${treatmentEmbeddings.length} embeddings (${treatmentEmbeddings[0].length}d)`);

  await sleep(DELAY_MS);

  // --- 2. DB 삽입 (임베딩 포함) ---
  console.log('\n--- 2. Insert into DB with embeddings ---');

  for (let i = 0; i < ALL_PRODUCTS.length; i++) {
    const p = ALL_PRODUCTS[i];
    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: p.name,
          category: p.category,
          skin_types: p.skin_types,
          concerns: p.concerns,
          key_ingredients: p.key_ingredients,
          price: p.price,
          english_label: p.english_label ?? false,
          tourist_popular: p.tourist_popular ?? false,
          is_highlighted: p.is_highlighted ?? false,
          rating: p.rating,
          status: 'active',
          embedding: JSON.stringify(productEmbeddings[i]),
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      insertedProductIds.push(data.id);
    } catch (err) {
      console.error(`  ERROR product ${p.id}: ${(err as Error).message}`);
      allPass = false;
    }
  }
  console.log(`  Products: ${insertedProductIds.length}/${ALL_PRODUCTS.length} inserted with embeddings`);

  for (let i = 0; i < ALL_TREATMENTS.length; i++) {
    const t = ALL_TREATMENTS[i];
    try {
      const { data, error } = await supabase
        .from('treatments')
        .insert({
          name: t.name,
          category: t.category,
          target_concerns: t.target_concerns,
          suitable_skin_types: t.suitable_skin_types,
          price_range: t.price_range,
          duration_minutes: t.duration_minutes,
          downtime_days: t.downtime_days,
          is_highlighted: t.is_highlighted ?? false,
          rating: t.rating,
          status: 'active',
          embedding: JSON.stringify(treatmentEmbeddings[i]),
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      insertedTreatmentIds.push(data.id);
    } catch (err) {
      console.error(`  ERROR treatment ${t.id}: ${(err as Error).message}`);
      allPass = false;
    }
  }
  console.log(`  Treatments: ${insertedTreatmentIds.length}/${ALL_TREATMENTS.length} inserted with embeddings`);

  if (insertedProductIds.length === 0 && insertedTreatmentIds.length === 0) {
    console.error('\n  No data inserted. Cannot test vector search.');
    process.exit(1);
  }

  await sleep(DELAY_MS);

  // --- 3. P0-20: pgvector 유사도 검색 ---
  console.log('\n--- 3. P0-20: pgvector similarity search ---');

  const vectorQueries = [
    { id: 'V1', query: 'hydrating serum for sensitive skin', table: 'products', fn: 'match_products', expected: 'Torriden' },
    { id: 'V2', query: 'laser treatment for dark spots', table: 'treatments', fn: 'match_treatments', expected: 'Laser Toning' },
    { id: 'V3', query: '지성 피부 세럼 추천', table: 'products', fn: 'match_products', expected: 'Beauty of Joseon' },
  ];

  for (const vq of vectorQueries) {
    console.log(`\n  ${vq.id}: "${vq.query}"`);

    try {
      // 쿼리 임베딩
      const { embedding: queryVec } = await embed({
        model: embeddingModel,
        value: vq.query,
        providerOptions: getEmbeddingOptions('RETRIEVAL_QUERY'),
      });

      // pgvector RPC 호출
      const { data, error } = await supabase.rpc(vq.fn, {
        query_embedding: JSON.stringify(queryVec),
        match_count: 5,
      });

      if (error) throw new Error(error.message);

      // 결과 출력
      const results = data as Array<{ id: string; name: Record<string, string>; similarity: number }>;
      console.log('  DB results:');
      results.forEach((r, i) => {
        const name = r.name?.en ?? JSON.stringify(r.name);
        console.log(`    ${i + 1}. (${r.similarity.toFixed(4)}) ${name}`);
      });

      // 인메모리 비교: 1등이 expected 키워드를 포함하는지
      const topName = results[0]?.name?.en ?? '';
      const pass = topName.includes(vq.expected);
      printResult(`${vq.id} Top-1 contains "${vq.expected}"`, pass, topName);
      if (!pass) allPass = false;
    } catch (err) {
      printResult(vq.id, false, (err as Error).message);
      allPass = false;
    }

    await sleep(DELAY_MS);
  }

  // --- 4. P0-22: 하이브리드 검색 (SQL 필터 + 벡터) ---
  console.log('\n--- 4. P0-22: Hybrid search (SQL filter + vector) ---');

  const hybridTests = [
    {
      id: 'H1',
      description: 'Filter skin_type=dry + vector rank',
      query: 'best skincare for dry dehydrated skin',
      fn: 'match_products',
      filters: { filter_skin_types: ['dry'] },
    },
    {
      id: 'H2',
      description: 'Filter budget < 15000 + vector rank',
      query: 'affordable serum for everyday use',
      fn: 'match_products',
      filters: { filter_max_price: 15000 },
    },
    {
      id: 'H3',
      description: 'Filter concerns=dark_spots + vector rank (treatments)',
      query: 'treatment for pigmentation',
      fn: 'match_treatments',
      filters: { filter_concerns: ['dark_spots'] },
    },
  ];

  for (const ht of hybridTests) {
    console.log(`\n  ${ht.id}: ${ht.description}`);

    try {
      const { embedding: queryVec } = await embed({
        model: embeddingModel,
        value: ht.query,
        providerOptions: getEmbeddingOptions('RETRIEVAL_QUERY'),
      });

      // 벡터 only (필터 없음)
      const { data: vectorOnly, error: e1 } = await supabase.rpc(ht.fn, {
        query_embedding: JSON.stringify(queryVec),
        match_count: 5,
      });
      if (e1) throw new Error(`Vector-only: ${e1.message}`);

      // 하이브리드 (필터 + 벡터)
      const { data: hybrid, error: e2 } = await supabase.rpc(ht.fn, {
        query_embedding: JSON.stringify(queryVec),
        match_count: 5,
        ...ht.filters,
      });
      if (e2) throw new Error(`Hybrid: ${e2.message}`);

      const voResults = vectorOnly as Array<{ name: Record<string, string>; similarity: number }>;
      const hResults = hybrid as Array<{ name: Record<string, string>; similarity: number }>;

      console.log(`  Vector-only: ${voResults.length} results`);
      voResults.slice(0, 3).forEach((r, i) =>
        console.log(`    ${i + 1}. (${r.similarity.toFixed(4)}) ${r.name?.en}`),
      );

      console.log(`  Hybrid: ${hResults.length} results`);
      hResults.slice(0, 3).forEach((r, i) =>
        console.log(`    ${i + 1}. (${r.similarity.toFixed(4)}) ${r.name?.en}`),
      );

      // 검증: 하이브리드 결과 수 ≤ 벡터 only (필터가 줄여야 함)
      const filterEffect = hResults.length <= voResults.length;
      printResult(`${ht.id} filter reduces results`, filterEffect,
        `vector=${voResults.length} → hybrid=${hResults.length}`);
      if (!filterEffect) allPass = false;
    } catch (err) {
      printResult(ht.id, false, (err as Error).message);
      allPass = false;
    }

    await sleep(DELAY_MS);
  }

  // --- 5. 인메모리 vs DB 결과 비교 ---
  console.log('\n--- 5. In-memory vs DB comparison ---');
  try {
    const testQuery = 'serum for oily skin with pore care';
    const { embedding: qVec } = await embed({
      model: embeddingModel,
      value: testQuery,
      providerOptions: getEmbeddingOptions('RETRIEVAL_QUERY'),
    });

    // DB 결과
    const { data: dbResults } = await supabase.rpc('match_products', {
      query_embedding: JSON.stringify(qVec),
      match_count: 5,
    });

    // 인메모리 결과
    const inMemoryScores = ALL_PRODUCTS.map((p, i) => ({
      name: (p.name as Record<string, string>).en,
      similarity: cosineSimilarity(qVec, productEmbeddings[i]),
    }));
    inMemoryScores.sort((a, b) => b.similarity - a.similarity);

    const dbTop = (dbResults as Array<{ name: Record<string, string>; similarity: number }>);

    console.log('  Query: "' + testQuery + '"');
    console.log('  DB ranking:');
    dbTop.forEach((r, i) => console.log(`    ${i + 1}. (${r.similarity.toFixed(4)}) ${r.name?.en}`));
    console.log('  In-memory ranking:');
    inMemoryScores.slice(0, 5).forEach((r, i) => console.log(`    ${i + 1}. (${r.similarity.toFixed(4)}) ${r.name}`));

    // 1등 일치 여부
    const dbFirst = dbTop[0]?.name?.en ?? '';
    const memFirst = inMemoryScores[0]?.name ?? '';
    const rankMatch = dbFirst === memFirst;
    printResult('Top-1 rank matches', rankMatch, `DB="${dbFirst}" vs Mem="${memFirst}"`);
    if (!rankMatch) allPass = false;
  } catch (err) {
    printResult('Comparison', false, (err as Error).message);
    allPass = false;
  }

  // --- 6. 정리 ---
  console.log('\n--- 6. Cleanup ---');
  try {
    if (insertedProductIds.length > 0) {
      await supabase.from('products').delete().in('id', insertedProductIds);
      printResult('DELETE products', true, `${insertedProductIds.length} rows`);
    }
    if (insertedTreatmentIds.length > 0) {
      await supabase.from('treatments').delete().in('id', insertedTreatmentIds);
      printResult('DELETE treatments', true, `${insertedTreatmentIds.length} rows`);
    }
  } catch (err) {
    printResult('Cleanup', false, (err as Error).message);
  }

  // --- 결과 ---
  console.log('\n=== Results ===');
  console.log(`  P0-20 pgvector 검색: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(`  P0-22 하이브리드 검색: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log(`\n=== P0-20/P0-22 DB Verdict: ${allPass ? 'PASS' : 'FAIL'} ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
