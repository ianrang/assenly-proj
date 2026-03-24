import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockEmbed = vi.fn();
vi.mock('ai', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
}));

const mockGetEmbeddingModel = vi.fn();
vi.mock('@/server/core/config', () => ({
  getEmbeddingModel: (...args: unknown[]) => mockGetEmbeddingModel(...args),
}));

describe('embedQuery', () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbed.mockReset();
    mockGetEmbeddingModel.mockReset();
  });

  it('텍스트를 벡터로 변환한다', async () => {
    const fakeModel = { modelId: 'gemini-embedding-001' };
    const fakeEmbedding = [0.1, 0.2, 0.3];
    mockGetEmbeddingModel.mockResolvedValue(fakeModel);
    mockEmbed.mockResolvedValue({ embedding: fakeEmbedding });

    const { embedQuery } = await import('@/server/core/knowledge');
    const result = await embedQuery('test query');

    expect(result).toEqual(fakeEmbedding);
    expect(mockGetEmbeddingModel).toHaveBeenCalledOnce();
    expect(mockEmbed).toHaveBeenCalledWith({
      model: fakeModel,
      value: 'test query',
      experimental_providerMetadata: {
        google: { taskType: 'RETRIEVAL_QUERY' },
      },
    });
  });

  it('빈 문자열이면 에러', async () => {
    const { embedQuery } = await import('@/server/core/knowledge');
    await expect(embedQuery('')).rejects.toThrow('Embedding text must not be empty');
  });
});

describe('embedDocument', () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbed.mockReset();
    mockGetEmbeddingModel.mockReset();
  });

  it('텍스트를 벡터로 변환한다 (RETRIEVAL_DOCUMENT)', async () => {
    const fakeModel = { modelId: 'gemini-embedding-001' };
    const fakeEmbedding = [0.4, 0.5, 0.6];
    mockGetEmbeddingModel.mockResolvedValue(fakeModel);
    mockEmbed.mockResolvedValue({ embedding: fakeEmbedding });

    const { embedDocument } = await import('@/server/core/knowledge');
    const result = await embedDocument('test document');

    expect(result).toEqual(fakeEmbedding);
    expect(mockEmbed).toHaveBeenCalledWith({
      model: fakeModel,
      value: 'test document',
      experimental_providerMetadata: {
        google: { taskType: 'RETRIEVAL_DOCUMENT' },
      },
    });
  });

  it('빈 문자열이면 에러', async () => {
    const { embedDocument } = await import('@/server/core/knowledge');
    await expect(embedDocument('')).rejects.toThrow('Embedding text must not be empty');
  });
});
