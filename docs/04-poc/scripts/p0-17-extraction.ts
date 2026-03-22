/**
 * P0-17: 점진적 개인화 추출 검증
 *
 * Tool 방식: extract_user_profile tool로 구조화된 추출
 * 6개 변수: UP-1, JC-1, JC-3, JC-4, UP-4, BH-4
 * 8시나리오 × 3회 = ~27회 호출
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-17-extraction.ts
 */
import { generateText, zodSchema, stepCountIs, type CoreMessage } from 'ai';
import { z } from 'zod';
import { getModel, provider } from './shared/config.js';
import { SYSTEM_PROMPT } from './shared/system-prompt.js';
import { pocTools } from './shared/tools.js';

// --- extract_user_profile tool 정의 ---

const extractionSchema = z.object({
  skin_type: z
    .enum(['dry', 'oily', 'combination', 'sensitive', 'normal'])
    .nullable()
    .describe('Skin type if explicitly mentioned. null if not mentioned.'),
  skin_concerns: z
    .array(
      z.enum([
        'acne', 'wrinkles', 'dark_spots', 'redness', 'dryness',
        'pores', 'dullness', 'dark_circles', 'uneven_tone', 'sun_damage', 'eczema',
      ]),
    )
    .nullable()
    .describe('Skin concerns if mentioned. Map synonyms: breakouts→acne, pigmentation→dark_spots, fine lines→wrinkles. null if not mentioned.'),
  stay_days: z.number().nullable().describe('Number of days staying in Korea, if mentioned. null if not.'),
  budget_level: z
    .enum(['budget', 'mid', 'premium', 'luxury'])
    .nullable()
    .describe('Budget level inferred from amounts: <30K KRW=budget, 30-80K=mid, 80-200K=premium, >200K=luxury. null if not mentioned.'),
  age_range: z
    .enum(['18-24', '25-29', '30-34', '35-39', '40-49', '50+'])
    .nullable()
    .describe('Age range if mentioned or clearly inferable (e.g. "in my thirties"→30-34). null if not.'),
  learned_preferences: z
    .array(
      z.object({
        item: z.string().describe('Ingredient or product type'),
        direction: z.enum(['prefer', 'avoid']),
      }),
    )
    .nullable()
    .describe('Explicit ingredient/product preferences. e.g. "I love snail mucin"→{item:"snail_mucin",direction:"prefer"}. null if not mentioned.'),
});

const EXTRACTION_PROMPT_ADDITION = `

## Profile Extraction
When the user mentions personal beauty information (skin type, concerns, age, budget, travel duration, ingredient preferences), call the extract_user_profile tool with the extracted data.
- Only include fields the user EXPLICITLY mentioned or strongly implied in the CURRENT message
- Set fields to null if not mentioned in this message
- Map common synonyms: breakouts→acne, pigmentation→dark_spots, fine lines→wrinkles
- For budget: <30K KRW=budget, 30-80K=mid, 80-200K=premium, >200K=luxury
- Do NOT guess or hallucinate values not supported by the user's message`;

// Tools: extraction + existing search/links
const allTools: Record<string, any> = {
  ...pocTools,
  extract_user_profile: {
    description: 'Extract beauty profile information from the user message. Call when user mentions skin type, concerns, budget, travel plans, age, or ingredient preferences.',
    inputSchema: zodSchema(extractionSchema),
    execute: async (args: any) => {
      return { status: 'profile_updated', extracted: args };
    },
  },
};

// --- 테스트 시나리오 ---

interface ExtractionScenario {
  id: string;
  description: string;
  messages: CoreMessage[];
  expected: {
    shouldExtract: boolean;
    values?: Partial<{
      skin_type: string;
      skin_concerns: string[];
      stay_days: number;
      budget_level: string;
      age_range: string;
      learned_preferences: Array<{ item: string; direction: string }>;
    }>;
  };
}

const SCENARIOS: ExtractionScenario[] = [
  {
    id: 'E1',
    description: 'Direct: oily skin + pores + breakouts (synonym)',
    messages: [{ role: 'user', content: "I have oily skin and I'm worried about my pores and breakouts" }],
    expected: {
      shouldExtract: true,
      values: { skin_type: 'oily', skin_concerns: ['pores', 'acne'] },
    },
  },
  {
    id: 'E2',
    description: 'Implicit: stay duration + budget mapping',
    messages: [{ role: 'user', content: "I'm visiting Seoul for a week, budget around 50,000 won per product" }],
    expected: {
      shouldExtract: true,
      values: { stay_days: 7, budget_level: 'mid' },
    },
  },
  {
    id: 'E3',
    description: 'Hard: age inference + dual preference',
    messages: [{ role: 'user', content: "I'm 32 and really into niacinamide but I can't stand anything with fragrance" }],
    expected: {
      shouldExtract: true,
      values: {
        age_range: '30-34',
        learned_preferences: [
          { item: 'niacinamide', direction: 'prefer' },
          { item: 'fragrance', direction: 'avoid' },
        ],
      },
    },
  },
  {
    id: 'E4',
    description: 'Dual skin mention: sensitive + dry + redness',
    messages: [{ role: 'user', content: 'My skin is super sensitive and dry, I get redness easily' }],
    expected: {
      shouldExtract: true,
      values: { skin_type: 'sensitive', skin_concerns: ['dryness', 'redness'] },
    },
  },
  {
    id: 'E5',
    description: 'Negative: no personal info (should NOT extract)',
    messages: [{ role: 'user', content: 'Can you recommend something nice?' }],
    expected: { shouldExtract: false },
  },
  {
    id: 'E6',
    description: 'Direct: short stay + luxury',
    messages: [{ role: 'user', content: "I'll be here 3 days and I'm looking for luxury treatments" }],
    expected: {
      shouldExtract: true,
      values: { stay_days: 3, budget_level: 'luxury' },
    },
  },
  {
    id: 'E7',
    description: 'Multi-turn: incremental extraction',
    messages: [
      { role: 'user', content: 'Hi, recommend something for dry skin' },
      { role: 'assistant', content: 'I can help with that! Let me find some great products for dry skin.' },
      { role: 'user', content: 'Also I have dark spots and I am here for 5 days' },
    ],
    expected: {
      shouldExtract: true,
      values: { skin_concerns: ['dark_spots'], stay_days: 5 },
    },
  },
  {
    id: 'E8',
    description: 'Medium: late twenties + ingredient preference',
    messages: [{ role: 'user', content: "I'm in my late twenties, love snail mucin products" }],
    expected: {
      shouldExtract: true,
      values: {
        age_range: '25-29',
        learned_preferences: [{ item: 'snail_mucin', direction: 'prefer' }],
      },
    },
  },
];

const RUNS = 3;
const DELAY_MS = 1000;

// --- 검증 로직 ---

interface ExtractionResult {
  id: string;
  run: number;
  extractionCalled: boolean;
  extractedValues: Record<string, unknown> | null;
  scores: Record<string, number>; // per-variable score (0-1)
  overallScore: number;
  pass: boolean;
  details: string;
}

function scoreExtraction(
  expected: ExtractionScenario['expected'],
  called: boolean,
  extracted: Record<string, unknown> | null,
): { scores: Record<string, number>; overall: number; details: string } {
  // Negative case
  if (!expected.shouldExtract) {
    const pass = !called;
    return {
      scores: { no_extraction: pass ? 1 : 0 },
      overall: pass ? 1 : 0,
      details: pass ? 'Correctly did not extract' : 'False positive: extracted when should not',
    };
  }

  // Positive case — extraction should have happened
  if (!called || !extracted) {
    return {
      scores: {},
      overall: 0,
      details: 'Extraction tool was not called (expected extraction)',
    };
  }

  const scores: Record<string, number> = {};
  const details: string[] = [];
  const exp = expected.values ?? {};

  // Enum fields
  for (const field of ['skin_type', 'budget_level', 'age_range'] as const) {
    if (exp[field] !== undefined) {
      const match = extracted[field] === exp[field];
      scores[field] = match ? 1 : 0;
      if (!match) details.push(`${field}: expected=${exp[field]}, got=${extracted[field]}`);
    }
  }

  // Numeric fields
  if (exp.stay_days !== undefined) {
    const match = extracted.stay_days === exp.stay_days;
    scores.stay_days = match ? 1 : 0;
    if (!match) details.push(`stay_days: expected=${exp.stay_days}, got=${extracted.stay_days}`);
  }

  // Array fields (Jaccard similarity)
  if (exp.skin_concerns !== undefined) {
    const expectedSet = new Set(exp.skin_concerns);
    const extractedArr = (extracted.skin_concerns as string[] | null) ?? [];
    const extractedSet = new Set(extractedArr);
    const intersection = [...expectedSet].filter((x) => extractedSet.has(x)).length;
    const union = new Set([...expectedSet, ...extractedSet]).size;
    scores.skin_concerns = union > 0 ? intersection / union : 0;
    if (scores.skin_concerns < 1) {
      details.push(`skin_concerns: expected=${JSON.stringify(exp.skin_concerns)}, got=${JSON.stringify(extractedArr)}`);
    }
  }

  // Preference fields
  if (exp.learned_preferences !== undefined) {
    const expPrefs = exp.learned_preferences;
    const extPrefs = (extracted.learned_preferences as Array<{ item: string; direction: string }> | null) ?? [];

    let matched = 0;
    for (const ep of expPrefs) {
      const found = extPrefs.some(
        (ext) =>
          ext.item.toLowerCase().includes(ep.item.toLowerCase().replace('_', ' ')) ||
          ep.item.toLowerCase().includes(ext.item.toLowerCase().replace('_', ' ')),
      );
      const dirMatch = extPrefs.some(
        (ext) =>
          (ext.item.toLowerCase().includes(ep.item.toLowerCase().replace('_', ' ')) ||
            ep.item.toLowerCase().includes(ext.item.toLowerCase().replace('_', ' '))) &&
          ext.direction === ep.direction,
      );
      if (dirMatch) matched++;
      else if (found) matched += 0.5;
    }
    const total = Math.max(expPrefs.length, extPrefs.length);
    scores.learned_preferences = total > 0 ? matched / total : 0;
    if (scores.learned_preferences < 1) {
      details.push(`preferences: expected=${JSON.stringify(expPrefs)}, got=${JSON.stringify(extPrefs)}`);
    }
  }

  const scoreValues = Object.values(scores);
  const overall = scoreValues.length > 0 ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0;

  return {
    scores,
    overall: Math.round(overall * 100) / 100,
    details: details.length > 0 ? details.join('; ') : 'All correct',
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- 메인 ---

async function main() {
  console.log('=== P0-17: Progressive Personalization Extraction ===');
  console.log(`Provider: ${provider}`);
  console.log(`Scenarios: ${SCENARIOS.length} × ${RUNS} runs = ${SCENARIOS.length * RUNS} calls\n`);

  const results: ExtractionResult[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`--- ${scenario.id}: ${scenario.description} ---`);

    for (let ri = 0; ri < RUNS; ri++) {
      try {
        const model = await getModel();
        const result = await generateText({
          model,
          system: SYSTEM_PROMPT + EXTRACTION_PROMPT_ADDITION,
          messages: scenario.messages,
          tools: allTools,
          stopWhen: stepCountIs(3),
          maxOutputTokens: 1024,
        });

        // extract_user_profile 호출 확인
        const allToolCalls = result.steps.flatMap((s) => s.toolCalls);
        const extractionCall = allToolCalls.find((tc) => tc.toolName === 'extract_user_profile');
        const extractionCalled = !!extractionCall;
        const extractedValues = extractionCalled ? ((extractionCall as any).input ?? null) : null;

        // 점수 계산
        const { scores, overall, details } = scoreExtraction(scenario.expected, extractionCalled, extractedValues);

        const entry: ExtractionResult = {
          id: scenario.id,
          run: ri + 1,
          extractionCalled,
          extractedValues,
          scores,
          overallScore: overall,
          pass: overall >= 0.8,
          details,
        };
        results.push(entry);

        const icon = entry.pass ? 'PASS' : 'FAIL';
        console.log(`  Run ${ri + 1}: ${icon} (${(overall * 100).toFixed(0)}%) — ${details}`);
        if (extractedValues) {
          const compact = Object.entries(extractedValues)
            .filter(([, v]) => v !== null)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(', ');
          if (compact) console.log(`         Extracted: ${compact}`);
        }

        await sleep(DELAY_MS);
      } catch (err) {
        console.error(`  Run ${ri + 1}: ERROR — ${err instanceof Error ? err.message : err}`);
        results.push({
          id: scenario.id, run: ri + 1, extractionCalled: false,
          extractedValues: null, scores: {}, overallScore: 0,
          pass: false, details: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
    console.log('');
    await sleep(DELAY_MS);
  }

  // --- 결과 요약 ---
  console.log('=== P0-17 Results Summary ===\n');

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const avgScore = results.reduce((s, r) => s + r.overallScore, 0) / total;

  for (const scenario of SCENARIOS) {
    const sr = results.filter((r) => r.id === scenario.id);
    const sp = sr.filter((r) => r.pass).length;
    const sa = sr.reduce((s, r) => s + r.overallScore, 0) / sr.length;
    const icon = sp === RUNS ? 'PASS' : 'FAIL';
    console.log(`  ${scenario.id}: ${icon} (${sp}/${RUNS}, avg ${(sa * 100).toFixed(0)}%) — ${scenario.description}`);
  }

  // 변수별 정확도
  console.log('\nPer-variable accuracy:');
  const varScores: Record<string, number[]> = {};
  for (const r of results) {
    for (const [k, v] of Object.entries(r.scores)) {
      if (!varScores[k]) varScores[k] = [];
      varScores[k].push(v);
    }
  }
  for (const [varName, scores] of Object.entries(varScores)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`  ${varName}: ${(avg * 100).toFixed(0)}% (n=${scores.length})`);
  }

  console.log(`\nOverall: ${passed}/${total} passed (${((passed / total) * 100).toFixed(0)}%)`);
  console.log(`Average score: ${(avgScore * 100).toFixed(0)}% (threshold: 80%)`);

  const verdict = avgScore >= 0.8 ? 'PASS' : avgScore >= 0.6 ? 'CONDITIONAL' : 'FAIL';
  console.log(`\n=== P0-17 Verdict: ${verdict} ===`);

  // U-4 결정 참고
  if (verdict === 'PASS') {
    console.log('\nU-4 결정 근거: Tool 방식 개인화 추출이 80%+ 정확도 달성. (a) Tool 방식 채택 권장.');
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
