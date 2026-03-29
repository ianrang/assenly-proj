import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// ── Core auth mock ────────────────────────────────────────────
const mockAuthenticateUser = vi.fn();
vi.mock('@/server/core/auth', () => ({
  authenticateUser: (...args: unknown[]) => mockAuthenticateUser(...args),
  optionalAuthenticateUser: vi.fn().mockResolvedValue(null),
}));

// ── Core db mock ──────────────────────────────────────────────
vi.mock('@/server/core/db', () => ({
  createAuthenticatedClient: vi.fn().mockReturnValue({ _mock: true }),
  createServiceClient: vi.fn().mockReturnValue({ _mock: true }),
}));

// ── Rate limit mock ───────────────────────────────────────────
const mockCheckRateLimit = vi.fn();
vi.mock('@/server/core/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// ── Profile service mock ──────────────────────────────────────
const mockUpsertProfile = vi.fn();
const mockGetProfile = vi.fn();
const mockUpdateProfile = vi.fn();
vi.mock('@/server/features/profile/service', () => ({
  upsertProfile: (...args: unknown[]) => mockUpsertProfile(...args),
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

// ── Journey service mock ──────────────────────────────────────
const mockGetActiveJourney = vi.fn();
const mockCreateOrUpdateJourney = vi.fn();
vi.mock('@/server/features/journey/service', () => ({
  getActiveJourney: (...args: unknown[]) => mockGetActiveJourney(...args),
  createOrUpdateJourney: (...args: unknown[]) => mockCreateOrUpdateJourney(...args),
}));

import { createApp } from '@/server/features/api/app';
import { registerProfileRoutes } from '@/server/features/api/routes/profile';

const VALID_ONBOARDING_BODY = {
  skin_type: 'oily',
  hair_type: 'straight',
  hair_concerns: ['damage'],
  country: 'US',
  language: 'en',
  age_range: '25-29',
  skin_concerns: ['acne', 'pores'],
  interest_activities: ['shopping', 'clinic'],
  stay_days: 5,
  start_date: '2026-04-01',
  budget_level: 'moderate',
  travel_style: ['efficient'],
};

describe('Profile routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    registerProfileRoutes(app);

    // default: auth succeeds
    mockAuthenticateUser.mockResolvedValue({ id: 'user-123', token: 'valid-token' });

    // default: rate limit allowed
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });

    // default: services succeed
    mockUpsertProfile.mockResolvedValue(undefined);
    mockCreateOrUpdateJourney.mockResolvedValue({ journeyId: 'journey-uuid-456' });
    mockGetProfile.mockResolvedValue({ user_id: 'user-123', skin_type: 'oily' });
    mockGetActiveJourney.mockResolvedValue({ id: 'journey-uuid-456' });
    mockUpdateProfile.mockResolvedValue(undefined);
  });

  it('인증 실패 → 401 AUTH_REQUIRED', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const res = await app.request('/api/profile/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_ONBOARDING_BODY),
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('POST /api/profile/onboarding 정상 → 201 + profile_id + journey_id', async () => {
    const res = await app.request('/api/profile/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_ONBOARDING_BODY),
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.profile_id).toBe('user-123');
    expect(json.data.journey_id).toBe('journey-uuid-456');
    expect(json.meta.timestamp).toBeDefined();
  });

  it('GET /api/profile 정상 → 200 + profile + active_journey', async () => {
    const res = await app.request('/api/profile', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.profile).toBeDefined();
    expect(json.data.active_journey).toBeDefined();
  });

  it('PUT /api/profile 정상 → 200 + updated: true', async () => {
    const res = await app.request('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skin_type: 'dry' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.updated).toBe(true);
  });

  it('PUT /api/profile 빈 body → 400 (최소 1개 필드 필요)', async () => {
    const res = await app.request('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
