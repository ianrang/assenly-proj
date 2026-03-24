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
const mockGetProfile = vi.fn();
const mockUpdateProfile = vi.fn();
vi.mock('@/server/features/profile/service', () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

const mockGetActiveJourney = vi.fn();
vi.mock('@/server/features/journey/service', () => ({
  getActiveJourney: (...args: unknown[]) => mockGetActiveJourney(...args),
}));

function createGetRequest() {
  return new Request('http://localhost/api/profile', {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token' },
  });
}

function createPutRequest(body: unknown) {
  return new Request('http://localhost/api/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-token',
    },
    body: JSON.stringify(body),
  });
}

describe('GET /api/profile', () => {
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

  it('정상: 200 + profile + active_journey + meta.timestamp', async () => {
    const profileData = {
      user_id: 'user-123',
      skin_type: 'oily',
      hair_type: 'straight',
      hair_concerns: ['damage'],
      country: 'US',
      language: 'en',
      age_range: '25-29',
      beauty_summary: null,
      updated_at: '2026-03-25T00:00:00Z',
    };
    const journeyData = {
      id: 'journey-456',
      user_id: 'user-123',
      country: 'KR',
      city: 'seoul',
      status: 'active',
    };
    mockGetProfile.mockResolvedValue(profileData);
    mockGetActiveJourney.mockResolvedValue(journeyData);

    const { GET } = await import('@/app/api/profile/route');
    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.profile).toEqual(profileData);
    expect(json.data.active_journey).toEqual(journeyData);
    expect(json.meta.timestamp).toBeDefined();
    expect(res.headers.get('X-RateLimit-Limit')).toBe('60');
  });

  it('프로필 미존재 -> 404 PROFILE_NOT_FOUND', async () => {
    mockGetProfile.mockResolvedValue(null);

    const { GET } = await import('@/app/api/profile/route');
    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('PROFILE_NOT_FOUND');
  });

  it('인증 없음 -> 401', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const { GET } = await import('@/app/api/profile/route');
    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('서비스 에러 -> 500', async () => {
    mockGetProfile.mockRejectedValue(new Error('DB error'));

    const { GET } = await import('@/app/api/profile/route');
    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('PROFILE_RETRIEVAL_FAILED');
    expect(json.error.message).not.toContain('DB error');
  });
});

describe('PUT /api/profile', () => {
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

  it('정상: 부분 업데이트 -> 200', async () => {
    mockUpdateProfile.mockResolvedValue(undefined);

    const { PUT } = await import('@/app/api/profile/route');
    const res = await PUT(createPutRequest({ skin_type: 'dry' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.updated).toBe(true);
    expect(json.meta.timestamp).toBeDefined();
  });

  it('빈 요청 -> 400 (최소 1필드)', async () => {
    const { PUT } = await import('@/app/api/profile/route');
    const res = await PUT(createPutRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('인증 없음 -> 401', async () => {
    mockAuthenticateUser.mockRejectedValue(new Error('No auth'));

    const { PUT } = await import('@/app/api/profile/route');
    const res = await PUT(createPutRequest({ skin_type: 'dry' }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('AUTH_REQUIRED');
  });

  it('서비스 에러 -> 500', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Update failed'));

    const { PUT } = await import('@/app/api/profile/route');
    const res = await PUT(createPutRequest({ skin_type: 'dry' }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('PROFILE_UPDATE_FAILED');
    expect(json.error.message).not.toContain('Update failed');
  });

  it('잘못된 열거값 -> 400', async () => {
    const { PUT } = await import('@/app/api/profile/route');
    const res = await PUT(createPutRequest({ skin_type: 'invalid_type' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });

  it('비JSON 요청 -> 400', async () => {
    const req = new Request('http://localhost/api/profile', {
      method: 'PUT',
      headers: { Authorization: 'Bearer valid-token' },
      body: 'not json',
    });

    const { PUT } = await import('@/app/api/profile/route');
    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');
  });
});
