/**
 * P0-15: 대화 비용 및 컨텍스트 성장 측정
 *
 * Gemini가 토큰 사용량을 반환하지 않으므로 문자 수 기반 추정 사용.
 * 20턴 대화를 시뮬레이션하여 컨텍스트 성장 패턴 + 비용 곡선 측정.
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-15-token-usage.ts
 */
import { generateText, stepCountIs, type CoreMessage } from 'ai';
import { getModel, provider } from './shared/config.js';
import { SYSTEM_PROMPT } from './shared/system-prompt.js';
import { pocTools } from './shared/tools.js';
import { estimateTokens, estimateCost, costComparisonTable } from './shared/token-estimator.js';

// --- 대화 시나리오 ---

const CONVERSATION_TURNS: string[] = [
  "Hi! I'm visiting Seoul next week for 5 days. I love skincare!",
  'I have dry sensitive skin. What products would you recommend?',
  'Tell me more about that first product. What makes it good for dry skin?',
  'Where can I buy it? Is it available in Myeongdong?',
  "What about a hydrating serum? I've heard Korean serums are amazing.",
  'How much would that cost? Is it within a budget of 20,000 won?',
  "I'm also interested in facial treatments. Something hydrating?",
  'How long does the treatment take? And is there any downtime?',
  'Can you compare the two treatments you mentioned?',
  'Which clinic has English-speaking staff?',
  'Going back to products — what about sunscreen for sensitive skin?',
  'Do Korean sunscreens work well for pale skin?',
  'What ingredients should I avoid with sensitive skin?',
  "I've heard niacinamide is good. Is that true?",
  'Can you recommend a complete basic routine? Cleanser, toner, serum, moisturizer, sunscreen?',
  'That sounds great! How much would the whole routine cost?',
  "I'm going to Gangnam area. Any good beauty stores there?",
  'What about Olive Young? Is it worth visiting?',
  'Last question — any tips for buying K-beauty products as a tourist?',
  'Thanks so much! Can you summarize the products you recommended?',
];

const RUNS = 3;
const DELAY_MS = 800;

interface TurnMetric {
  turn: number;
  userChars: number;
  assistantChars: number;
  cumulativeInputChars: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostGemini: number;
  estimatedCostClaude: number;
  toolCalled: boolean;
  responseTime: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runConversation(runIndex: number): Promise<TurnMetric[]> {
  const model = await getModel();
  const messages: CoreMessage[] = [];
  const metrics: TurnMetric[] = [];

  let cumulativeInputChars = SYSTEM_PROMPT.length; // 시스템 프롬프트

  for (let turn = 0; turn < CONVERSATION_TURNS.length; turn++) {
    const userMessage = CONVERSATION_TURNS[turn];
    messages.push({ role: 'user', content: userMessage });

    cumulativeInputChars += userMessage.length;

    const start = performance.now();

    try {
      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages,
        tools: pocTools,
        stopWhen: stepCountIs(2),
        maxTokens: 1024,
      });

      const elapsed = performance.now() - start;
      const assistantText = result.text;
      const toolCalled = result.steps.some((s) => s.toolCalls.length > 0);

      // 어시스턴트 응답 추가
      messages.push({ role: 'assistant', content: assistantText });
      cumulativeInputChars += assistantText.length;

      // 토큰 추정
      const inputTokens = estimateTokens(
        SYSTEM_PROMPT + messages.map((m) => String(m.content)).join(''),
        'en',
      );
      const outputTokens = estimateTokens(assistantText, 'en');

      metrics.push({
        turn: turn + 1,
        userChars: userMessage.length,
        assistantChars: assistantText.length,
        cumulativeInputChars,
        estimatedInputTokens: inputTokens,
        estimatedOutputTokens: outputTokens,
        estimatedCostGemini: estimateCost(inputTokens, outputTokens, 'gemini-2.0-flash'),
        estimatedCostClaude: estimateCost(inputTokens, outputTokens, 'claude-sonnet-4'),
        toolCalled,
        responseTime: elapsed,
      });

      // 진행 표시 (5턴마다)
      if ((turn + 1) % 5 === 0 || turn === 0) {
        console.log(
          `  Turn ${turn + 1}/20: ${elapsed.toFixed(0)}ms` +
            ` | in≈${inputTokens} out≈${outputTokens}` +
            ` | tool=${toolCalled ? 'Y' : 'N'}` +
            ` | cumChars=${cumulativeInputChars}`,
        );
      }

      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`  Turn ${turn + 1}: ERROR — ${err instanceof Error ? err.message : err}`);
      // 에러 시에도 더미 응답으로 대화 계속
      messages.push({ role: 'assistant', content: 'I apologize, I encountered an error. Could you repeat that?' });
      cumulativeInputChars += 60;
      metrics.push({
        turn: turn + 1,
        userChars: userMessage.length,
        assistantChars: 0,
        cumulativeInputChars,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedCostGemini: 0,
        estimatedCostClaude: 0,
        toolCalled: false,
        responseTime: 0,
      });
      await sleep(DELAY_MS);
    }
  }

  return metrics;
}

async function main() {
  console.log('=== P0-15: Conversation Cost & Context Growth ===');
  console.log(`Provider: ${provider}`);
  console.log(`20 turns × ${RUNS} runs = ${20 * RUNS} API calls\n`);

  const allRuns: TurnMetric[][] = [];

  for (let r = 0; r < RUNS; r++) {
    console.log(`\n--- Run ${r + 1}/${RUNS} ---`);
    const metrics = await runConversation(r);
    allRuns.push(metrics);
  }

  // --- 결과 요약 ---
  console.log('\n=== P0-15 Results Summary ===\n');

  // 턴별 평균
  console.log('Turn | Input Tokens (avg) | Output Tokens (avg) | Cum Input Chars | Cost/turn (Claude) | Response Time');
  console.log('-----|-------------------|--------------------|-----------------|--------------------|-------------');

  for (let t = 0; t < 20; t++) {
    const turnData = allRuns.map((run) => run[t]).filter(Boolean);
    if (turnData.length === 0) continue;

    const avgInput = turnData.reduce((s, d) => s + d.estimatedInputTokens, 0) / turnData.length;
    const avgOutput = turnData.reduce((s, d) => s + d.estimatedOutputTokens, 0) / turnData.length;
    const avgCumChars = turnData.reduce((s, d) => s + d.cumulativeInputChars, 0) / turnData.length;
    const avgCostClaude = turnData.reduce((s, d) => s + d.estimatedCostClaude, 0) / turnData.length;
    const avgTime = turnData.reduce((s, d) => s + d.responseTime, 0) / turnData.length;

    console.log(
      `  ${String(t + 1).padStart(2)} | ${avgInput.toFixed(0).padStart(17)} | ${avgOutput.toFixed(0).padStart(18)} | ${avgCumChars.toFixed(0).padStart(15)} | $${avgCostClaude.toFixed(5).padStart(17)} | ${avgTime.toFixed(0)}ms`,
    );
  }

  // 전체 세션 비용
  console.log('\n--- Session Cost Summary ---');

  const sessionCosts = allRuns.map((run) => {
    const totalGemini = run.reduce((s, m) => s + m.estimatedCostGemini, 0);
    const totalClaude = run.reduce((s, m) => s + m.estimatedCostClaude, 0);
    return { gemini: totalGemini, claude: totalClaude };
  });

  const avgGemini = sessionCosts.reduce((s, c) => s + c.gemini, 0) / sessionCosts.length;
  const avgClaude = sessionCosts.reduce((s, c) => s + c.claude, 0) / sessionCosts.length;

  console.log(`  Gemini 2.0 Flash (20-turn session): $${avgGemini.toFixed(4)}`);
  console.log(`  Claude Sonnet 4 (estimated):        $${avgClaude.toFixed(4)}`);
  console.log(`  Target: < $0.10/session for Claude`);

  // 컨텍스트 성장
  const lastTurnData = allRuns.map((run) => run[19]).filter(Boolean);
  const avgFinalChars = lastTurnData.reduce((s, d) => s + d.cumulativeInputChars, 0) / lastTurnData.length;
  const avgFinalTokens = lastTurnData.reduce((s, d) => s + d.estimatedInputTokens, 0) / lastTurnData.length;

  console.log(`\n--- Context Growth ---`);
  console.log(`  Final cumulative chars (turn 20): ${avgFinalChars.toFixed(0)}`);
  console.log(`  Estimated tokens at turn 20: ${avgFinalTokens.toFixed(0)}`);
  console.log(`  Claude Sonnet context limit: 200K tokens`);
  console.log(`  Usage: ${((avgFinalTokens / 200000) * 100).toFixed(1)}% of context window`);

  // 20턴 완료율
  const completedRuns = allRuns.filter((run) => run.length === 20 && run.every((m) => m.responseTime > 0)).length;
  console.log(`\n  Conversation completion: ${completedRuns}/${RUNS} runs completed all 20 turns`);

  // 판정
  const costPass = avgClaude < 0.10;
  const contextPass = avgFinalTokens < 50000;
  const completionPass = completedRuns === RUNS;

  const verdict = costPass && contextPass && completionPass ? 'PASS' : 'CONDITIONAL';
  console.log(`\n=== P0-15 Verdict: ${verdict} ===`);
  if (!costPass) console.log(`  WARNING: Estimated Claude cost $${avgClaude.toFixed(4)} exceeds $0.10 target`);
  if (!contextPass) console.log(`  WARNING: Context at turn 20 (${avgFinalTokens.toFixed(0)} tokens) exceeds 50K target`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
