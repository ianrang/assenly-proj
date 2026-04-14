import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { Clinic } from '@/shared/types/domain';

function makeClinic(overrides: Partial<Clinic> = {}): Clinic {
  return {
    id: 'clinic-1',
    name: { en: 'Test Clinic', ko: '테스트 클리닉' },
    description: null,
    country: 'KR',
    city: 'Seoul',
    district: 'Gangnam',
    location: null,
    address: null,
    operating_hours: null,
    english_support: 'none',
    clinic_type: null,
    license_verified: false,
    consultation_type: [],
    foreigner_friendly: null,
    booking_url: null,
    external_links: [],
    is_highlighted: false,
    highlight_badge: null,
    rating: null,
    review_count: 0,
    images: [],
    tags: [],
    status: 'active',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('scoreClinics', () => {
  it('gives higher score for fluent english support', async () => {
    const { scoreClinics } = await import('./clinic');
    const clinics = [
      makeClinic({ id: 'c1', english_support: 'none' }),
      makeClinic({ id: 'c2', english_support: 'fluent' }),
    ];
    const scored = scoreClinics(clinics);
    expect(scored.find((c) => c.id === 'c2')!.score).toBeGreaterThan(
      scored.find((c) => c.id === 'c1')!.score,
    );
  });

  it('adds reason for license verified', async () => {
    const { scoreClinics } = await import('./clinic');
    const scored = scoreClinics([makeClinic({ license_verified: true })]);
    expect(scored[0].reasons).toContain('Licensed and verified clinic');
  });

  it('adds reason for foreigner friendly with interpreter', async () => {
    const { scoreClinics } = await import('./clinic');
    const scored = scoreClinics([
      makeClinic({
        foreigner_friendly: {
          consultation_languages: ['en', 'ja'],
          interpreter_available: true,
          english_consent_form: true,
          international_cards: true,
          pickup_service: false,
        },
      }),
    ]);
    expect(scored[0].reasons.some((r) => r.includes('Interpreter'))).toBe(true);
  });

  it('adds reason for online booking', async () => {
    const { scoreClinics } = await import('./clinic');
    const scored = scoreClinics([
      makeClinic({ booking_url: 'https://example.com/book' }),
    ]);
    expect(scored[0].reasons).toContain('Online booking available');
  });

  it('adds bonus for matching user language', async () => {
    const { scoreClinics } = await import('./clinic');
    const scored = scoreClinics(
      [makeClinic({ english_support: 'fluent' })],
      'en',
    );
    expect(scored[0].reasons.some((r) => r.includes('your language'))).toBe(
      true,
    );
  });

  it('no language bonus when userLanguage is null', async () => {
    const { scoreClinics } = await import('./clinic');
    const scored = scoreClinics([makeClinic({ english_support: 'fluent' })]);
    expect(scored[0].reasons.some((r) => r.includes('your language'))).toBe(
      false,
    );
  });

  it('preserves is_highlighted', async () => {
    const { scoreClinics } = await import('./clinic');
    const scored = scoreClinics([makeClinic({ is_highlighted: true })]);
    expect(scored[0].is_highlighted).toBe(true);
  });
});
