/**
 * PoC 공유 설정 — AI 프로바이더 및 모델 설정
 *
 * 프로바이더 전환: .env.local의 AI_PROVIDER 값 변경
 *   - google: Gemini (기본, PoC용)
 *   - anthropic: Claude (추후 전환)
 *   - openai: GPT (추후 전환)
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// .env.local 로드 (프로젝트 루트 기준)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../../.env.local') });

type Provider = 'google' | 'anthropic' | 'openai';

const provider = (process.env.AI_PROVIDER ?? 'google') as Provider;

export async function getModel() {
  switch (provider) {
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      // gemini-2.0-flash: 최저가, TTFT 최소. P0-12 100%, P0-13 스트리밍 안정.
      // gemini-2.5-flash: thinking 기능으로 TTFT 2~7초 (더 느림). 비추.
      // gemini-2.5-pro: 최고 품질, 12배 비쌈.
      return google('gemini-2.0-flash');
    }
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic('claude-sonnet-4-5-20250929');
    }
    case 'openai': {
      // npm install @ai-sdk/openai 필요
      const { openai } = await import('@ai-sdk/openai');
      return openai('gpt-4o');
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}

// --- 임베딩 모델 ---
// DB 스키마: vector(1024). 모든 임베딩 모델은 이 차원으로 맞춤.
export const EMBEDDING_DIMENSION = 1024;

export async function getEmbeddingModel() {
  switch (provider) {
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      // gemini-embedding-001: 기본 3072d, outputDimensionality로 조정 가능
      return google.embedding('gemini-embedding-001');
    }
    case 'anthropic': {
      // Voyage 임베딩 — @voyageai/sdk 설치 + VOYAGE_API_KEY 필요
      throw new Error('Voyage embedding not configured. Install @voyageai/sdk and set VOYAGE_API_KEY.');
    }
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      // text-embedding-3-small: 1536d 기본, dimensions 옵션으로 조정
      return openai.embedding('text-embedding-3-small');
    }
    default:
      throw new Error(`Unknown AI_PROVIDER for embedding: ${provider}`);
  }
}

// Google 임베딩 providerOptions
export function getEmbeddingOptions(taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY') {
  if (provider === 'google') {
    return {
      google: {
        outputDimensionality: EMBEDDING_DIMENSION,
        taskType,
      },
    };
  }
  return {};
}

export { provider };
