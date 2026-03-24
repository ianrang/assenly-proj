import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// auth mock
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
}));

// db mock
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: () => ({ _mock: true }),
}));

// rate-limit mock
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// service mocks
const mockUpsertProfile = vi.fn();
vi.mock('@/server/features/profile/service', () => ({
  upsertProfile: (...args: unknown[]) => mockUpsertProfile(...args),
}));

const mockCreateOrUpdateJourney = vi.fn();
vi.mock('@/server/features/journey/service', () => ({
  createOrUpdateJourney: (...args: unknown[]) =>
    mockCreateOrUpdateJourney(...args),
}));

const validBody = {
  skin_type: 'oily',
  hair_type: 'straight',
  hair_concerns: ['damage'],
  country: 'US',
  language: 'en',
  age_range: '25-29',
  skin_concerns: ['acne', 'pores', 'dullness'],
  interest_activities: ['shopping', 'clinic'],
  stay_days: 5,
  start_date: '2026-04-01',
  budget_level: 'moderate',
  travel_style: ['efficient', 'instagram'],
};

function createRequest(body: unknown) {
  return new Request('http://localhost/api/profile/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/profile/onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateUser.mockResolvedValue({
      id: 'user-123',
      token: 'valid-token',
    });
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60000,
    });
  });

  it('정상: 201 + data(profile_id, journey_id) + meta.timestamp + X-RateLimit-*', async () => {
    mockUpsertProfile.mockResolvedValue(undefined);
    mockCreateOrUpdateJourney.mockResolvedValue({
      journeyId: 'journey-uuid-456',
    });

    const { POST } = await import(
      '@/app/api/profile/onboarding/route'
    );
    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.profile_id).toBe('user-123');
    expect(json.data.journey_id).toBe('journey-uuid-456');
    expect(json.meta.timestamp).toBeDefined();
    expect(res.headers.get('X-RateLimit-Limit')).toBe('60');
    expect(res.headers.get('X-RateLimit-Remaining')).toBeDefined();
  });

  it('인증 없음 -> 401', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const { POST } = await import(
      '@/app/api/profile/onboarding/route'
    );
    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('검증 실패: skin_type 누락 -> 400', async () => {
    const { POST } = await import(
      '@/app/api/profile/onboarding/route'
    );
    const { skin_type: _, ...noSkinType } = validBody;
    const res = await POST(createRequest(noSkinType));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('검증 실패: skin_concerns 6개 -> 400 (max 5)', async () => {
    const { POST } = await import(
      '@/app/api/profile/onboarding/route'
    );
    const res = await POST(
      createRequest({
        ...validBody,
        skin_concerns: [
          'acne',
          'wrinkles',
          'dark_spots',
          'redness',
          'dryness',
          'pores',
        ],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('검증 실패: interest_activities 빈 배열 -> 400 (min 1)', async () => {
    const { POST } = await import(
      '@/app/api/profile/onboarding/route'
    );
    const res = await POST(
      createRequest({ ...validBody, interest_activities: [] }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('서비스 에러 -> 500 + 내부 메시지 미노출', async () => {
    mockUpsertProfile.mockRejectedValue(
      new Error('Profile creation failed'),
    );

    const { POST } = await import(
      '@/app/api/profile/onboarding/route'
    );
    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('PROFILE_CREATION_FAILED');
    expect(json.error.message).toBe('Failed to save onboarding data');
  });

  it('Rate limit 초과 -> 429 + Retry-After', async () => {
    const resetAt = Date.now() + 30000;
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt,
    });

    const { POST } = await import(
      '@/app/api/profile/onboarding/route'
    );
    const res = await POST(createRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.headers.get('Retry-After')).toBeDefined();
  });
});
