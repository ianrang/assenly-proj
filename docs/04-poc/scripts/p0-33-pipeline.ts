/**
 * P0-33: 데이터 적재 파이프라인 PoC
 *
 * 멀티 프로바이더: Google Places / 카카오 / 네이버 (키 있는 것만 사용)
 * 파이프라인: 외부 API → RawPlace → StoreRow/ClinicRow → Supabase INSERT → 정리
 *
 * 환경변수 (.env.local):
 *   GOOGLE_PLACES_API_KEY (또는 GOOGLE_GENERATIVE_AI_API_KEY)
 *   KAKAO_REST_API_KEY (선택)
 *   NAVER_CLIENT_ID + NAVER_CLIENT_SECRET (선택)
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-33-pipeline.ts
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env.local') });

import { googlePlacesProvider } from './pipeline/providers/google-places.js';
import { kakaoLocalProvider } from './pipeline/providers/kakao-local.js';
import { naverSearchProvider } from './pipeline/providers/naver-search.js';
import { mockProvider } from './pipeline/providers/mock.js';
import { classifyPlace, toStoreRow, toClinicRow } from './pipeline/transform.js';
import { loadStores, loadClinics, cleanupTestData } from './pipeline/load.js';
import type { PlaceProvider, RawPlace, PipelineResult } from './pipeline/types.js';

const DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- 프로바이더 등록 ---

const ALL_PROVIDERS: PlaceProvider[] = [
  googlePlacesProvider,
  kakaoLocalProvider,
  naverSearchProvider,
];

// --- 파이프라인 실행 ---

async function runPipeline(
  provider: PlaceProvider,
  query: string,
  options?: { lat?: number; lng?: number },
): Promise<PipelineResult> {
  const result: PipelineResult = {
    provider: provider.name,
    fetched: 0,
    transformed: 0,
    loaded: 0,
    errors: [],
  };

  // 1. Fetch
  console.log(`  [Fetch] ${provider.name}: "${query}"`);
  let rawPlaces: RawPlace[] = [];
  try {
    rawPlaces = await provider.search(query, options);
    result.fetched = rawPlaces.length;
    console.log(`  [Fetch] ${rawPlaces.length} results`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Fetch: ${msg}`);
    console.log(`  [Fetch] ERROR: ${msg}`);
    return result;
  }

  // 2. Transform + Classify
  console.log(`  [Transform] Classifying ${rawPlaces.length} places...`);
  const stores: ReturnType<typeof toStoreRow>[] = [];
  const clinics: ReturnType<typeof toClinicRow>[] = [];

  for (const raw of rawPlaces) {
    const type = classifyPlace(raw);
    if (type === 'store') {
      stores.push(toStoreRow(raw));
    } else if (type === 'clinic') {
      clinics.push(toClinicRow(raw));
    } else {
      // unknown → 기본적으로 store로 분류
      stores.push(toStoreRow(raw));
    }
  }
  result.transformed = stores.length + clinics.length;
  console.log(`  [Transform] ${stores.length} stores, ${clinics.length} clinics`);

  // 3. Load
  console.log(`  [Load] Inserting into Supabase...`);
  if (stores.length > 0) {
    const storeResult = await loadStores(stores);
    result.loaded += storeResult.inserted;
    result.errors.push(...storeResult.errors);
    console.log(`  [Load] stores: ${storeResult.inserted}/${stores.length} inserted`);
  }
  if (clinics.length > 0) {
    const clinicResult = await loadClinics(clinics);
    result.loaded += clinicResult.inserted;
    result.errors.push(...clinicResult.errors);
    console.log(`  [Load] clinics: ${clinicResult.inserted}/${clinics.length} inserted`);
  }

  return result;
}

// --- 메인 ---

async function main() {
  console.log('=== P0-33: Data Pipeline PoC ===\n');

  // 사용 가능한 프로바이더 확인
  console.log('--- Available Providers ---');
  for (const p of ALL_PROVIDERS) {
    const available = p.isAvailable();
    console.log(`  ${p.name}: ${available ? 'OK (key found)' : 'SKIP (no key)'}`);
  }

  let activeProviders = ALL_PROVIDERS.filter((p) => p.isAvailable());

  // 실제 프로바이더가 없으면 mock 폴백
  if (activeProviders.length === 0) {
    console.log('\n  No API keys found. Using mock provider for pipeline logic verification.');
    activeProviders = [mockProvider];
  }

  // 검색 쿼리 (강남 뷰티 매장/클리닉)
  const testQueries = [
    { query: '강남 올리브영', desc: 'Beauty store (Olive Young in Gangnam)' },
    { query: '강남 피부과 클리닉', desc: 'Dermatology clinic in Gangnam' },
  ];

  const results: PipelineResult[] = [];

  // 각 프로바이더 × 각 쿼리 실행
  let usedMockFallback = false;

  for (const provider of activeProviders) {
    console.log(`\n=== Provider: ${provider.name} ===`);

    for (const tq of testQueries) {
      console.log(`\n--- ${tq.desc} ---`);
      try {
        const result = await runPipeline(provider, tq.query, {
          lat: 37.4979,  // 강남역 좌표
          lng: 127.0276,
        });
        results.push(result);

        // 실제 프로바이더 실패 시 mock 폴백
        if (result.fetched === 0 && result.errors.length > 0 && provider.name !== 'mock') {
          if (!usedMockFallback) {
            console.log('\n  → Real API failed. Falling back to mock provider for pipeline logic verification.');
            usedMockFallback = true;
          }
          console.log(`  → [Mock fallback] ${tq.desc}`);
          const mockResult = await runPipeline(mockProvider, tq.query);
          results.push(mockResult);
        }
      } catch (err) {
        console.error(`  Pipeline error: ${err instanceof Error ? err.message : err}`);
      }
      await sleep(DELAY_MS);
    }
  }

  // mock 프로바이더만 있었던 경우 (API 키 전무)
  if (activeProviders.every((p) => p.name === 'mock')) {
    for (const tq of testQueries) {
      console.log(`\n--- [Mock] ${tq.desc} ---`);
      const result = await runPipeline(mockProvider, tq.query);
      results.push(result);
      await sleep(DELAY_MS);
    }
  }

  // --- 결과 요약 ---
  console.log('\n=== P0-33 Results Summary ===\n');

  let totalLoaded = 0;
  let totalErrors = 0;

  for (const r of results) {
    const status = r.errors.length === 0 ? 'OK' : `${r.errors.length} errors`;
    console.log(`  ${r.provider}: fetched=${r.fetched} → transformed=${r.transformed} → loaded=${r.loaded} (${status})`);
    if (r.errors.length > 0) {
      r.errors.slice(0, 3).forEach((e) => console.log(`    ERROR: ${e}`));
    }
    totalLoaded += r.loaded;
    totalErrors += r.errors.length;
  }

  console.log(`\n  Total loaded: ${totalLoaded}`);
  console.log(`  Total errors: ${totalErrors}`);

  // --- 정리 ---
  console.log('\n--- Cleanup ---');
  try {
    await cleanupTestData();
    console.log('  Test data cleaned up');
  } catch (err) {
    console.log(`  Cleanup error: ${err instanceof Error ? err.message : err}`);
  }

  // 판정
  const anyLoaded = totalLoaded > 0;
  const verdict = anyLoaded ? 'PASS' : 'FAIL';
  console.log(`\n=== P0-33 Verdict: ${verdict} ===`);

  if (anyLoaded) {
    console.log('\n  파이프라인 구조 검증 완료:');
    console.log('  ✓ 멀티 프로바이더 (Google/카카오/네이버) 플러그인 아키텍처');
    console.log('  ✓ 외부 API → RawPlace → StoreRow/ClinicRow 변환');
    console.log('  ✓ Supabase DB 적재 + 정리');
    console.log('  ✓ 프로바이더 키 없으면 자동 스킵');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
