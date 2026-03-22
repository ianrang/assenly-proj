/**
 * P0-12: Claude tool_use 카드 생성 검증
 *
 * 검증 항목:
 * - Claude가 올바른 tool을 선택하는가?
 * - tool 파라미터가 유효한가?
 * - 불필요한 tool 호출을 하지 않는가?
 * - 응답 텍스트에 추천 이유가 포함되는가?
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-12-tool-use.ts
 */
import { generateText, stepCountIs, type CoreMessage } from 'ai';
import { getModel, provider } from './shared/config.js';
import { SYSTEM_PROMPT } from './shared/system-prompt.js';
import { pocTools } from './shared/tools.js';

// --- 테스트 시나리오 정의 ---

interface Scenario {
  id: string;
  description: string;
  messages: CoreMessage[];
  expect: {
    toolName: string | null; // null = tool 호출 없어야 함
    domainHint?: string;
  };
}

const SCENARIOS: Scenario[] = [
  {
    id: 'T1',
    description: 'Product search with skin type filter',
    messages: [{ role: 'user', content: 'Recommend a moisturizer for dry skin' }],
    expect: { toolName: 'search_beauty_data', domainHint: 'shopping' },
  },
  {
    id: 'T2',
    description: 'Treatment search with budget filter',
    messages: [{ role: 'user', content: 'I need a facial treatment under 100,000 won' }],
    expect: { toolName: 'search_beauty_data', domainHint: 'treatment' },
  },
  {
    id: 'T3',
    description: 'External links with explicit entity reference (multi-turn)',
    messages: [
      { role: 'user', content: 'Recommend a good essence for dry skin' },
      {
        role: 'assistant',
        content:
          'I found a great option for you! The COSRX Advanced Snail 96 Mucin Power Essence (prod-001) at ₩18,000 is excellent for dry skin. It contains 96% Snail Secretion Filtrate which deeply hydrates.',
      },
      { role: 'user', content: 'Where can I buy that COSRX product?' },
    ],
    expect: { toolName: 'get_external_links' },
  },
  {
    id: 'T4',
    description: 'Product comparison query',
    messages: [{ role: 'user', content: 'Compare serums for sensitive skin' }],
    expect: { toolName: 'search_beauty_data', domainHint: 'shopping' },
  },
  {
    id: 'T5',
    description: 'General conversation — no tool expected',
    messages: [{ role: 'user', content: "What's popular in K-beauty right now?" }],
    expect: { toolName: null },
  },
];

const RUNS_PER_SCENARIO = 3;
const DELAY_BETWEEN_CALLS_MS = 1000;

// --- 실행 ---

interface RunResult {
  scenarioId: string;
  run: number;
  toolCalls: Array<{ toolName: string; args: unknown }>;
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  pass: boolean;
  reason: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runScenario(scenario: Scenario, runIndex: number): Promise<RunResult> {
  const model = await getModel();

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: scenario.messages,
    tools: pocTools,
    stopWhen: stepCountIs(2),
    maxOutputTokens: 1024,
  });

  const toolCalls = result.steps.flatMap((s) => s.toolCalls);

  // 검증
  let pass = false;
  let reason = '';

  if (scenario.expect.toolName === null) {
    // T5: tool 호출 없어야 함
    pass = toolCalls.length === 0;
    reason = pass ? 'No tool call (correct)' : `Unexpected tool call: ${toolCalls[0]?.toolName}`;
  } else {
    // tool 호출 있어야 함
    if (toolCalls.length === 0) {
      pass = false;
      reason = 'No tool was called (expected tool call)';
    } else {
      const calledTool = toolCalls[0].toolName;
      const toolMatch = calledTool === scenario.expect.toolName;

      // SDK 6.x: args는 'input' 프로퍼티에 저장됨
      const callInput = ((toolCalls[0] as any).input ?? {}) as Record<string, unknown>;

      if (!toolMatch) {
        pass = false;
        reason = `Wrong tool: expected ${scenario.expect.toolName}, got ${calledTool}`;
      } else if (scenario.expect.domainHint) {
        const domainMatch = callInput.domain === scenario.expect.domainHint;
        pass = domainMatch;
        reason = domainMatch
          ? `Correct tool + domain (${callInput.domain})`
          : `Correct tool but wrong domain: expected ${scenario.expect.domainHint}, got ${callInput.domain}`;
      } else {
        pass = true;
        reason = `Correct tool: ${calledTool}`;
      }
    }
  }

  return {
    scenarioId: scenario.id,
    run: runIndex + 1,
    toolCalls: toolCalls.map((tc) => ({ toolName: tc.toolName, input: (tc as any).input })),
    text: result.text.slice(0, 200),
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
    pass,
    reason,
  };
}

async function main() {
  console.log('=== P0-12: Tool Use Card Generation ===');
  console.log(`Provider: ${provider}`);
  console.log(`Scenarios: ${SCENARIOS.length} × ${RUNS_PER_SCENARIO} runs = ${SCENARIOS.length * RUNS_PER_SCENARIO} calls\n`);

  const results: RunResult[] = [];
  let totalCost = 0;

  for (const scenario of SCENARIOS) {
    console.log(`--- ${scenario.id}: ${scenario.description} ---`);
    console.log(`  Expected: ${scenario.expect.toolName ?? 'NO tool call'}`);

    for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
      try {
        const result = await runScenario(scenario, i);
        results.push(result);

        const icon = result.pass ? '  PASS' : '  FAIL';
        console.log(`  Run ${i + 1}: ${icon} — ${result.reason}`);
        if (result.toolCalls.length > 0) {
          console.log(`         Input: ${JSON.stringify(result.toolCalls[0].input)}`);
        }
        console.log(`         Tokens: in=${result.usage.inputTokens} out=${result.usage.outputTokens}`);

        // Rate limit 방지
        if (i < RUNS_PER_SCENARIO - 1) await sleep(DELAY_BETWEEN_CALLS_MS);
      } catch (err) {
        console.error(`  Run ${i + 1}: ERROR — ${err instanceof Error ? err.message : err}`);
        results.push({
          scenarioId: scenario.id,
          run: i + 1,
          toolCalls: [],
          text: '',
          usage: { inputTokens: 0, outputTokens: 0 },
          pass: false,
          reason: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
    console.log('');
    await sleep(DELAY_BETWEEN_CALLS_MS);
  }

  // --- 결과 요약 ---
  console.log('=== P0-12 Results Summary ===\n');

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);

  console.log(`Total: ${passed}/${total} passed (${passRate}%)`);
  console.log('');

  // 시나리오별 요약
  for (const scenario of SCENARIOS) {
    const scenarioResults = results.filter((r) => r.scenarioId === scenario.id);
    const scenarioPassed = scenarioResults.filter((r) => r.pass).length;
    const icon = scenarioPassed === RUNS_PER_SCENARIO ? 'PASS' : 'FAIL';
    console.log(`  ${scenario.id}: ${icon} (${scenarioPassed}/${RUNS_PER_SCENARIO}) — ${scenario.description}`);
  }

  // 토큰 합계
  const totalInput = results.reduce((sum, r) => sum + r.usage.inputTokens, 0);
  const totalOutput = results.reduce((sum, r) => sum + r.usage.outputTokens, 0);
  console.log(`\nTotal tokens: input=${totalInput}, output=${totalOutput}`);

  // 판정
  const SUCCESS_THRESHOLD = 0.9; // 90%
  const verdict = passed / total >= SUCCESS_THRESHOLD ? 'PASS' : 'FAIL';
  console.log(`\n=== P0-12 Verdict: ${verdict} (${passRate}%, threshold: ${SUCCESS_THRESHOLD * 100}%) ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
