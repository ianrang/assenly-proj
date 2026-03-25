import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { ScoredItem } from '@/server/features/beauty/judgment';

function createItem(
  overrides: Partial<ScoredItem> & { id: string },
): ScoredItem {
  return {
    score: 0.5,
    reasons: [],
    warnings: [],
    is_highlighted: false,
    ...overrides,
  };
}

describe('judgment/rank', () => {
  it('점수 기반 내림차순 정렬', async () => {
    const { rank } = await import('@/server/features/beauty/judgment');

    const items = [
      createItem({ id: 'low', score: 0.2 }),
      createItem({ id: 'high', score: 0.9 }),
      createItem({ id: 'mid', score: 0.5 }),
    ];

    const result = rank(items);

    expect(result[0].item.id).toBe('high');
    expect(result[1].item.id).toBe('mid');
    expect(result[2].item.id).toBe('low');
  });

  it('동점 시 입력 순서 유지 (stable sort)', async () => {
    const { rank } = await import('@/server/features/beauty/judgment');

    const items = [
      createItem({ id: 'first', score: 0.7 }),
      createItem({ id: 'second', score: 0.7 }),
      createItem({ id: 'third', score: 0.7 }),
    ];

    const result = rank(items);

    expect(result[0].item.id).toBe('first');
    expect(result[1].item.id).toBe('second');
    expect(result[2].item.id).toBe('third');
  });

  it('VP-1: is_highlighted가 정렬에 영향 없음', async () => {
    const { rank } = await import('@/server/features/beauty/judgment');

    const items = [
      createItem({ id: 'not-hl', score: 0.8, is_highlighted: false }),
      createItem({ id: 'hl', score: 0.3, is_highlighted: true }),
    ];

    const result = rank(items);

    // 점수 높은 항목이 상위 — is_highlighted 무관
    expect(result[0].item.id).toBe('not-hl');
    expect(result[1].item.id).toBe('hl');
  });

  it('is_highlighted 값이 결과에 그대로 복사', async () => {
    const { rank } = await import('@/server/features/beauty/judgment');

    const items = [
      createItem({ id: 'a', is_highlighted: true }),
      createItem({ id: 'b', is_highlighted: false }),
    ];

    const result = rank(items);

    const aResult = result.find((r) => r.item.id === 'a');
    const bResult = result.find((r) => r.item.id === 'b');

    expect(aResult?.is_highlighted).toBe(true);
    expect(bResult?.is_highlighted).toBe(false);
  });

  it('빈 배열 입력 시 빈 배열 반환', async () => {
    const { rank } = await import('@/server/features/beauty/judgment');

    const result = rank([]);

    expect(result).toEqual([]);
  });

  it('순위 번호 1-based', async () => {
    const { rank } = await import('@/server/features/beauty/judgment');

    const items = [
      createItem({ id: 'a', score: 0.9 }),
      createItem({ id: 'b', score: 0.5 }),
      createItem({ id: 'c', score: 0.1 }),
    ];

    const result = rank(items);

    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
    expect(result[2].rank).toBe(3);
  });
});
