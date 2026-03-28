import 'server-only';
import { embed } from 'ai';
import { getEmbeddingModel } from './config';

// ============================================================
// Knowledge 모듈 — search-engine.md §4.2
// 텍스트 → 벡터 변환. 비즈니스 무관 (L-5).
// G-9: export 2개만 (embedQuery, embedDocument).
// ⚠️ L-4: core/ 파일 수정. 비즈니스 용어 없음.
// ============================================================

/**
 * 검색 쿼리 텍스트를 벡터로 변환.
 * search-handler에서 벡터 검색 시 사용.
 * taskType: RETRIEVAL_QUERY (검색 쿼리 최적화)
 */
export async function embedQuery(text: string): Promise<number[]> {
  if (!text) {
    throw new Error('Embedding text must not be empty');
  }
  const model = await getEmbeddingModel();
  const { embedding } = await embed({
    model,
    value: text,
    providerOptions: {
      google: { taskType: 'RETRIEVAL_QUERY' },
    },
  });
  return embedding;
}

/**
 * 문서 텍스트를 벡터로 변환.
 * 임베딩 생성 파이프라인에서 사용 (admin CRUD 후 비동기).
 * taskType: RETRIEVAL_DOCUMENT (저장 문서 최적화)
 */
export async function embedDocument(text: string): Promise<number[]> {
  if (!text) {
    throw new Error('Embedding text must not be empty');
  }
  const model = await getEmbeddingModel();
  const { embedding } = await embed({
    model,
    value: text,
    providerOptions: {
      google: { taskType: 'RETRIEVAL_DOCUMENT' },
    },
  });
  return embedding;
}
