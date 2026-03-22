/**
 * P0-13: Vercel AI SDK 스트리밍 검증
 *
 * 검증 항목:
 * - 텍스트가 증분(incremental)으로 스트리밍되는가?
 * - tool 호출 결과가 스트림에 올바르게 인터리빙되는가?
 * - TTFT (Time to First Token)이 허용 범위 내인가?
 * - 스트림이 중단 없이 완료되는가?
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-13-streaming.ts
 */
import { streamText, stepCountIs } from 'ai';
import { getModel, provider } from './shared/config.js';
import { SYSTEM_PROMPT } from './shared/system-prompt.js';
import { pocTools } from './shared/tools.js';

// --- 테스트 시나리오 ---

interface StreamScenario {
  id: string;
  description: string;
  prompt: string;
  expectTool: boolean;
}

const SCENARIOS: StreamScenario[] = [
  {
    id: 'S1',
    description: 'Pure text (no tool call)',
    prompt: 'Tell me briefly about K-beauty trends in 2026.',
    expectTool: false,
  },
  {
    id: 'S2',
    description: 'Text + single tool call + text',
    prompt: 'Recommend a serum for oily skin.',
    expectTool: true,
  },
  {
    id: 'S3',
    description: 'Text + multiple tool calls',
    prompt: 'I have dry sensitive skin. Find me a good moisturizer and also a hydrating facial treatment.',
    expectTool: true,
  },
];

const RUNS_PER_SCENARIO = 3;
const DELAY_MS = 1000;

// --- 타이밍 측정 ---

interface StreamChunkEvent {
  type: string;
  timestamp: number; // ms from start
  detail?: string;
}

interface StreamResult {
  scenarioId: string;
  run: number;
  ttft: number | null;           // Time to First Token (ms)
  totalTime: number;             // Total stream time (ms)
  toolCallTime: number | null;   // Time when tool-call chunk arrived (ms)
  toolResultTime: number | null; // Time when tool-result chunk arrived (ms)
  resumeAfterTool: number | null; // Time from tool-result to next text (ms)
  textChunkCount: number;
  toolCallCount: number;
  events: StreamChunkEvent[];
  interrupted: boolean;
  usage: { inputTokens: number; outputTokens: number } | null;
  pass: boolean;
  reason: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runStreamScenario(
  scenario: StreamScenario,
  runIndex: number,
): Promise<StreamResult> {
  const model = await getModel();

  const start = performance.now();
  let ttft: number | null = null;
  let toolCallTime: number | null = null;
  let toolResultTime: number | null = null;
  let lastToolResultTime: number | null = null;
  let firstTextAfterToolTime: number | null = null;
  let textChunkCount = 0;
  let toolCallCount = 0;
  let interrupted = false;
  const events: StreamChunkEvent[] = [];

  let usageData: { inputTokens: number; outputTokens: number } | null = null;

  try {
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      tools: pocTools,
      stopWhen: stepCountIs(2),
      maxOutputTokens: 1024,
      prompt: scenario.prompt,
      onStepFinish({ usage }) {
        if (usage) {
          if (!usageData) {
            usageData = { inputTokens: 0, outputTokens: 0 };
          }
          usageData.inputTokens += usage.inputTokens;
          usageData.outputTokens += usage.outputTokens;
        }
      },
    });

    for await (const chunk of result.fullStream) {
      const elapsed = performance.now() - start;

      switch (chunk.type) {
        case 'text-delta':
          if (ttft === null) ttft = elapsed;
          if (lastToolResultTime !== null && firstTextAfterToolTime === null) {
            firstTextAfterToolTime = elapsed;
          }
          textChunkCount++;
          // 첫 5개만 기록 (로그 절약)
          if (textChunkCount <= 5) {
            const deltaText = (chunk as any).textDelta ?? (chunk as any).text ?? '';
            events.push({ type: 'text-delta', timestamp: elapsed, detail: String(deltaText).slice(0, 30) });
          }
          break;

        case 'tool-call':
          if (toolCallTime === null) toolCallTime = elapsed;
          toolCallCount++;
          {
            const toolArgs = (chunk as any).args ?? (chunk as any).input ?? {};
            events.push({
              type: 'tool-call',
              timestamp: elapsed,
              detail: `${chunk.toolName}(${JSON.stringify(toolArgs).slice(0, 80)})`,
            });
          }
          break;

        case 'tool-result':
          toolResultTime = elapsed;
          lastToolResultTime = elapsed;
          events.push({
            type: 'tool-result',
            timestamp: elapsed,
            detail: `toolCallId=${chunk.toolCallId}`,
          });
          break;

        case 'step-finish':
          events.push({ type: 'step-finish', timestamp: elapsed });
          break;

        case 'finish':
          events.push({ type: 'finish', timestamp: elapsed });
          break;

        case 'error':
          events.push({ type: 'error', timestamp: elapsed, detail: String(chunk.error) });
          interrupted = true;
          break;
      }
    }
  } catch (err) {
    interrupted = true;
    events.push({
      type: 'exception',
      timestamp: performance.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const totalTime = performance.now() - start;
  const resumeAfterTool =
    lastToolResultTime !== null && firstTextAfterToolTime !== null
      ? firstTextAfterToolTime - lastToolResultTime
      : null;

  // 검증
  let pass = true;
  const reasons: string[] = [];

  // TTFT 체크
  if (ttft === null) {
    pass = false;
    reasons.push('No text received');
  } else if (ttft > 2000) {
    pass = false;
    reasons.push(`TTFT too slow: ${ttft.toFixed(0)}ms (>2000ms)`);
  }

  // 스트림 중단
  if (interrupted) {
    pass = false;
    reasons.push('Stream interrupted');
  }

  // tool 기대치
  if (scenario.expectTool && toolCallCount === 0) {
    pass = false;
    reasons.push('Expected tool call but none occurred');
  }
  if (!scenario.expectTool && toolCallCount > 0) {
    // 경고만 (pass는 유지)
    reasons.push(`Unexpected tool call (warning, not failure)`);
  }

  const reason = pass ? 'OK' : reasons.join('; ');

  return {
    scenarioId: scenario.id,
    run: runIndex + 1,
    ttft,
    totalTime,
    toolCallTime,
    toolResultTime,
    resumeAfterTool,
    textChunkCount,
    toolCallCount,
    events,
    interrupted,
    usage: usageData,
    pass,
    reason,
  };
}

// --- 통계 유틸 ---

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// --- 메인 ---

async function main() {
  console.log('=== P0-13: Streaming Verification ===');
  console.log(`Provider: ${provider}`);
  console.log(`Scenarios: ${SCENARIOS.length} × ${RUNS_PER_SCENARIO} runs = ${SCENARIOS.length * RUNS_PER_SCENARIO} calls\n`);

  const results: StreamResult[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`--- ${scenario.id}: ${scenario.description} ---`);

    for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
      try {
        const result = await runStreamScenario(scenario, i);
        results.push(result);

        const icon = result.pass ? '  PASS' : '  FAIL';
        console.log(
          `  Run ${i + 1}: ${icon}` +
            ` | TTFT: ${result.ttft?.toFixed(0) ?? '-'}ms` +
            ` | Total: ${result.totalTime.toFixed(0)}ms` +
            ` | Chunks: ${result.textChunkCount}` +
            ` | Tools: ${result.toolCallCount}` +
            (result.resumeAfterTool !== null ? ` | ResumeAfterTool: ${result.resumeAfterTool.toFixed(0)}ms` : ''),
        );
        if (!result.pass) console.log(`         Reason: ${result.reason}`);

        if (i < RUNS_PER_SCENARIO - 1) await sleep(DELAY_MS);
      } catch (err) {
        console.error(`  Run ${i + 1}: ERROR — ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log('');
    await sleep(DELAY_MS);
  }

  // --- 결과 요약 ---
  console.log('=== P0-13 Results Summary ===\n');

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`Total: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)\n`);

  // TTFT 통계
  const ttftValues = results.filter((r) => r.ttft !== null).map((r) => r.ttft!);
  if (ttftValues.length > 0) {
    console.log('TTFT (Time to First Token):');
    console.log(`  p50: ${percentile(ttftValues, 50).toFixed(0)}ms`);
    console.log(`  p95: ${percentile(ttftValues, 95).toFixed(0)}ms`);
    console.log(`  Target: <1000ms (acceptable <2000ms)`);
  }

  // ResumeAfterTool 통계
  const resumeValues = results.filter((r) => r.resumeAfterTool !== null).map((r) => r.resumeAfterTool!);
  if (resumeValues.length > 0) {
    console.log('\nResume After Tool:');
    console.log(`  p50: ${percentile(resumeValues, 50).toFixed(0)}ms`);
    console.log(`  p95: ${percentile(resumeValues, 95).toFixed(0)}ms`);
    console.log(`  Target: <2000ms (acceptable <3000ms)`);
  }

  // 중단
  const interruptions = results.filter((r) => r.interrupted).length;
  console.log(`\nStream interruptions: ${interruptions}`);

  // 토큰 합계
  const totalInput = results.reduce((sum, r) => sum + (r.usage?.inputTokens ?? 0), 0);
  const totalOutput = results.reduce((sum, r) => sum + (r.usage?.outputTokens ?? 0), 0);
  console.log(`Total tokens: input=${totalInput}, output=${totalOutput}`);

  // 판정
  const verdict = passed === total && interruptions === 0 ? 'PASS' : 'FAIL';
  console.log(`\n=== P0-13 Verdict: ${verdict} ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
