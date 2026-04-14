import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { scoreStores } from './store';
import type { Store } from '@/shared/types/domain';

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 'store-1',
    name: { en: 'Test Store', ko: '테스트 매장' },
    description: null,
    country: 'KR', city: 'Seoul', district: 'Gangnam',
    location: null, address: null, operating_hours: null,
    english_support: 'none',
    store_type: null,
    tourist_services: [],
    payment_methods: [],
    nearby_landmarks: [],
    external_links: [],
    is_highlighted: false, highlight_badge: null,
    rating: null, review_count: 0,
    images: [], tags: [],
    status: 'active', created_at: '', updated_at: '',
    ...overrides,
  } as Store;
}

describe('scoreStores', () => {
  it('gives higher score for fluent english support', () => {
    const stores = [
      makeStore({ id: 's1', english_support: 'none' }),
      makeStore({ id: 's2', english_support: 'fluent' }),
    ];
    const scored = scoreStores(stores);
    expect(scored.find(s => s.id === 's2')!.score)
      .toBeGreaterThan(scored.find(s => s.id === 's1')!.score);
    expect(scored.find(s => s.id === 's2')!.reasons).toContain('Fluent English support');
  });

  it('adds reason for tourist services', () => {
    const scored = scoreStores([
      makeStore({ tourist_services: ['tax_refund', 'beauty_consultation'] }),
    ]);
    expect(scored[0].reasons.length).toBeGreaterThanOrEqual(1);
  });

  it('adds reason for high rating', () => {
    const scored = scoreStores([makeStore({ rating: 4.5 })]);
    expect(scored[0].reasons).toContain('Highly rated (4.5)');
  });

  it('adds bonus for matching user language', () => {
    const scored = scoreStores(
      [makeStore({ english_support: 'fluent' })],
      'en',
    );
    expect(scored[0].reasons.some(r => r.includes('your language'))).toBe(true);
  });

  it('no language bonus when userLanguage is null', () => {
    const scored = scoreStores([makeStore({ english_support: 'fluent' })]);
    expect(scored[0].reasons.some(r => r.includes('your language'))).toBe(false);
  });

  it('returns all stores (no exclusion)', () => {
    const scored = scoreStores([makeStore({ id: 's1' }), makeStore({ id: 's2' })]);
    expect(scored).toHaveLength(2);
  });

  it('preserves is_highlighted', () => {
    const scored = scoreStores([makeStore({ is_highlighted: true })]);
    expect(scored[0].is_highlighted).toBe(true);
  });
});
