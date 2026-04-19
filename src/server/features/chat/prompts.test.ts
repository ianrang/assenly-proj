import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// 테스트용 컨텍스트 팩토리
function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    profile: null,
    journey: null,
    realtime: {
      location: null,
      timezone: 'Asia/Seoul',
      current_time: '2026-03-24T14:30:00+09:00',
    },
    derived: null,
    learnedPreferences: [],
    isFirstTurn: false,
    locale: 'en',
    ...overrides,
  };
}

const fullProfile = {
  user_id: 'user-1',
  skin_types: ['oily'] as const,
  hair_type: null,
  hair_concerns: [],
  country: 'US',
  language: 'en' as const,
  age_range: '25-29' as const,
  updated_at: '2026-03-24',
};

const fullJourney = {
  id: 'journey-1',
  user_id: 'user-1',
  country: 'KR',
  city: 'Seoul',
  skin_concerns: ['acne', 'pores'] as const,
  interest_activities: ['shopping', 'clinic'] as const,
  stay_days: 5,
  start_date: '2026-04-01',
  end_date: '2026-04-05',
  budget_level: 'moderate' as const,
  travel_style: ['solo'] as const,
  status: 'active' as const,
  created_at: '2026-03-24',
};

const fullDerived = {
  preferred_ingredients: ['Niacinamide', 'Snail Mucin'],
  avoided_ingredients: ['Alcohol', 'Fragrance'],
  user_segment: null,
  ai_beauty_profile: 'You have oily skin with acne concerns — Korea is perfect for finding targeted serums.',
};

describe('buildSystemPrompt', () => {
  it('경로A (완전 프로필): §2~§8+§10 포함, §9 미포함', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({
      profile: fullProfile,
      journey: fullJourney,
      derived: fullDerived,
      learnedPreferences: [{ id: '1', category: 'ingredient', preference: 'snail mucin', direction: 'like', confidence: 0.9, source: 'chat' }],
    });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    // 고정 섹션 포함
    expect(result).toContain('## Role');
    expect(result).toContain('## Domains');
    expect(result).toContain('## Rules');
    expect(result).toContain('## Guardrails');
    expect(result).toContain('## Tools');
    expect(result).toContain('## Card Format');
    // §8 포함
    expect(result).toContain('## User Profile');
    expect(result).toContain('oily');
    expect(result).toContain('acne');
    // §10 포함
    expect(result).toContain('## Beauty Profile');
    expect(result).toContain('Niacinamide');
    // §9 미포함
    expect(result).not.toContain('## No Profile Mode');
  });

  it('경로B (프로필 없음): §2~§7+§9 포함, §8/§10 미포함', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext();

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    // 고정 섹션 포함
    expect(result).toContain('## Role');
    expect(result).toContain('## Domains');
    expect(result).toContain('## Rules');
    expect(result).toContain('## Guardrails');
    expect(result).toContain('## Tools');
    expect(result).toContain('## Card Format');
    // §9 포함
    expect(result).toContain('## No Profile Mode');
    // §8/§10 미포함
    expect(result).not.toContain('## User Profile');
    expect(result).not.toContain('## Beauty Profile');
  });

  it('부분 프로필 (VP-3): null 필드 → "not specified"', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const partialProfile = { ...fullProfile, age_range: null, country: null };
    const partialJourney = { ...fullJourney, budget_level: null, stay_days: null, start_date: null, end_date: null, travel_style: [] };
    const ctx = makeContext({ profile: partialProfile, journey: partialJourney });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).toContain('## User Profile');
    expect(result).toContain('not specified');
    // 존재하는 필드는 정상 포함
    expect(result).toContain('oily');
  });

  it('DV 없음: §8 포함, §10 미포함', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ profile: fullProfile, journey: fullJourney, derived: null });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).toContain('## User Profile');
    expect(result).not.toContain('## Beauty Profile');
  });

  it('§8/§9 상호 배제: 동시에 둘 다 포함되지 않음', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');

    const withProfile = buildSystemPrompt(makeContext({ profile: fullProfile, journey: fullJourney }) as Parameters<typeof buildSystemPrompt>[0]);
    const withoutProfile = buildSystemPrompt(makeContext() as Parameters<typeof buildSystemPrompt>[0]);

    // profile 있으면 §8만
    expect(withProfile).toContain('## User Profile');
    expect(withProfile).not.toContain('## No Profile Mode');
    // profile 없으면 §9만
    expect(withoutProfile).toContain('## No Profile Mode');
    expect(withoutProfile).not.toContain('## User Profile');
  });

  it('순수 함수: 동일 입력 → 동일 출력', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ profile: fullProfile, journey: fullJourney }) as Parameters<typeof buildSystemPrompt>[0];

    const result1 = buildSystemPrompt(ctx);
    const result2 = buildSystemPrompt(ctx);

    expect(result1).toBe(result2);
  });

  it('경로B 첫 턴: "First response" 블록 포함', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ isFirstTurn: true });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).toContain('### First response');
    expect(result).not.toContain('### Continuing conversation');
  });

  it('경로B 후속 턴: "First response" 블록 미포함', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ isFirstTurn: false });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).not.toContain('### First response');
    expect(result).toContain('### Continuing conversation');
  });

  it('경로A 프로필 있음: isFirstTurn 무관하게 First response 미포함', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ profile: fullProfile, journey: fullJourney, isFirstTurn: true });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).not.toContain('### First response');
  });

  // --- v1.1 신규: few-shot + guardrails 유지 + Behavior 블록 (chat-quality-improvements.md §2) ---

  it('§11 Few-shot Examples 섹션 포함 (v1.1)', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ profile: fullProfile, journey: fullJourney });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    // §11 헤딩 + <example> 태그 포함
    expect(result).toContain('## Examples');
    expect(result).toContain('<example>');
    expect(result).toContain('</example>');
    // 최소 4개의 <example> (중복 없는 5개 예시)
    const exampleMatches = result.match(/<example>/g);
    expect(exampleMatches).toBeDefined();
    expect(exampleMatches!.length).toBeGreaterThanOrEqual(4);
  });

  it('§5 Guardrails 축약 후 Hard constraints + Adversarial 규칙 유지 (v1.1)', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext();

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    // Hard constraints 5개 전체 유지
    expect(result).toContain('Hard constraints');
    expect(result).toContain('No medical advice');
    expect(result).toContain('K-beauty domain only');
    expect(result).toContain('No price guarantees');
    expect(result).toContain('No personal data requests');
    expect(result).toContain('Instruction integrity');

    // Detailed Medical/Off-topic/Adversarial 섹션 유지
    expect(result).toContain('Detailed Medical Boundaries');
    expect(result).toContain('Detailed Off-topic Boundaries');
    expect(result).toContain('Detailed Adversarial Patterns');

    // Adversarial 패턴 규칙 유지
    expect(result).toContain('Role override');
    expect(result).toContain('Prompt extraction');
    expect(result).toContain('Role play');
    expect(result).toContain('Compliance test');

    // 축약 대상 템플릿 6개는 제거되어야 함
    expect(result).not.toContain('**Template: General medical redirect**');
    expect(result).not.toContain('**Template: Emergency redirect**');
    expect(result).not.toContain('**Template: Completely unrelated**');
    expect(result).not.toContain('**Template: K-beauty adjacent');
    expect(result).not.toContain('**Template: Injection attempt');
    expect(result).not.toContain('**Template: Role change attempt');
  });

  it('§6 extract_user_profile Behavior 블록 유지 (v1.1 — Outside voice #9)', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext();

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    // Behavior 블록은 defense-in-depth로 유지 (tool() description에 없는 중요 규칙)
    expect(result).toContain('Call silently');
    expect(result).toContain('do NOT tell the user');
    expect(result).toMatch(/[Dd]o not guess/);
  });

  it('locale이 시스템 프롬프트에 주입된다', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ locale: 'ko' });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).toContain('ko');
    expect(result).toContain('respond in ko');
  });

  it('locale=en 시 영어 언어 지시가 프롬프트에 존재', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({ locale: 'en' });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).toContain('respond in en');
    expect(result).toContain('Never mix two languages');
  });

  it('Few-shot에 한국어 예시가 포함된다', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext();

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);

    expect(result).toContain('건성 피부');
    expect(result).toContain('Session language: ko');
  });

  it('복수 skin_types 렌더 — "oily, sensitive" 형식', async () => {
    const { buildSystemPrompt } = await import('@/server/features/chat/prompts');
    const ctx = makeContext({
      profile: { ...fullProfile, skin_types: ['oily', 'sensitive'] },
      journey: fullJourney,
      derived: null,
      learnedPreferences: [],
    });

    const result = buildSystemPrompt(ctx as Parameters<typeof buildSystemPrompt>[0]);
    expect(result).toContain('Skin type: oily, sensitive');
  });
});
