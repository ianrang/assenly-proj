// scripts/eval-chat-quality.ts
// WS2: LLM-as-Judge eval harness — 2026-04-09-ai-quality-testing-gate.md
// P-9: scripts/ = Composition Root. server/core/ + shared/ import만 허용.
// server-only가 CJS(tsx)에서 throw하므로 core/ 직접 import 불가 → 직접 구성.
// 실행: npx tsx scripts/eval-chat-quality.ts --provider google

import { createClient } from '@supabase/supabase-js';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================
// Types
// ============================================================

interface RubricItem {
  criterion: string;
  description: string;
}

interface ScenarioProfile {
  skin_type?: string;
  skin_concerns?: string[];
  language?: string;
  budget_level?: string;
  age_range?: string;
}

interface ScenarioMessage {
  role: 'user';
  text: string;
}

interface Scenario {
  id: string;
  category: string;
  name: string;
  profile: ScenarioProfile | null;
  messages: ScenarioMessage[];
  rubric: RubricItem[];
}

interface ScenariosFile {
  scenarios: Scenario[];
}

interface JudgeCriterionResult {
  criterion: string;
  pass: boolean;
  reason: string;
}

interface ScenarioResult {
  id: string;
  category: string;
  name: string;
  pass: boolean;
  criteria: JudgeCriterionResult[];
  responsePreview: string;
  responseFull: string;
  toolCalls: string[];
  error: string | null;
  durationMs: number;
}

// ============================================================
// Config
// ============================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHAT_API_URL = process.env.EVAL_CHAT_URL ?? 'http://localhost:3000/api/chat';
const AUTH_API_URL = process.env.EVAL_AUTH_URL ?? 'http://localhost:3000/api/auth/anonymous';
const PROFILE_API_URL = process.env.EVAL_PROFILE_URL ?? 'http://localhost:3000/api/profile/onboarding';

const JUDGE_MODEL = 'gemini-2.0-flash';
const JUDGE_TEMPERATURE = 0;

// ============================================================
// CLI args
// ============================================================

function parseArgs(): { scenarioFilter: string | null } {
  const args = process.argv.slice(2);
  let scenarioFilter: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scenario' && args[i + 1]) {
      scenarioFilter = args[i + 1];
      i++;
    }
    // --provider is accepted but unused (judge always uses google)
  }

  return { scenarioFilter };
}

// ============================================================
// Auth — anonymous session setup
// ============================================================

interface EvalSession {
  userId: string;
  token: string;
}

async function createEvalSession(): Promise<EvalSession> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(`signInAnonymously failed: ${error?.message ?? 'no session'}`);
  }

  // Register in app (POST /api/auth/anonymous)
  const res = await fetch(AUTH_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ consent: { data_retention: true } }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth registration failed (${res.status}): ${body}`);
  }

  return {
    userId: data.session.user.id,
    token: data.session.access_token,
  };
}

async function cleanupEvalSession(session: EvalSession): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // users CASCADE → conversations, user_profiles, journeys 자동 삭제
  await admin.from('users').delete().eq('id', session.userId);
  await admin.auth.admin.deleteUser(session.userId);
}

// ============================================================
// Profile setup — service_role direct DB (avoid rate limits)
// ============================================================

async function setupProfile(
  session: EvalSession,
  profile: ScenarioProfile,
): Promise<void> {
  // Use onboarding API to set profile properly (handles profile + journey creation)
  const body: Record<string, unknown> = {
    skin_type: profile.skin_type ?? 'normal',
    language: profile.language ?? 'en',
    skin_concerns: profile.skin_concerns ?? [],
  };
  if (profile.budget_level) body.budget_level = profile.budget_level;
  if (profile.age_range) body.age_range = profile.age_range;

  const res = await fetch(PROFILE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Profile setup failed (${res.status}): ${text}`);
  }
}

async function clearProfile(session: EvalSession): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Clear profile and journey for next scenario
  await admin.from('user_profiles').delete().eq('user_id', session.userId);
  await admin.from('journeys').delete().eq('user_id', session.userId);
  await admin.from('conversations').delete().eq('user_id', session.userId);
  await admin.from('learned_preferences').delete().eq('user_id', session.userId);
}

// ============================================================
// Chat — HTTP POST + SSE stream parsing
// ============================================================

interface ChatResponse {
  text: string;
  toolCalls: string[];
  conversationId: string | null;
}

/**
 * AI SDK Data Stream Protocol 파싱.
 * 각 라인: TYPE:JSON_VALUE\n
 * Type 0 = text delta, 9 = tool call start, a = tool result, g = message metadata
 */
async function sendChatMessage(
  session: EvalSession,
  messageText: string,
  conversationId: string | null,
  locale: 'en' | 'ko' = 'en',
): Promise<ChatResponse> {
  const messageId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const res = await fetch(CHAT_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        id: messageId,
        role: 'user',
        parts: [{ type: 'text', text: messageText }],
      },
      conversation_id: conversationId,
      locale,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat API error (${res.status}): ${body}`);
  }

  if (!res.body) {
    throw new Error('Chat API returned empty body');
  }

  // Parse UI Message Stream Protocol (SSE: "data: {JSON}\n\n")
  // chat API는 stream.toUIMessageStreamResponse()를 사용.
  // 형식: data: {"type":"text-delta","delta":"..."} / data: {"type":"tool-call",...} / data: [DONE]
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const toolCalls: string[] = [];
  let detectedConversationId: string | null = conversationId;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line || !line.startsWith('data: ')) continue;
      const payload = line.slice(6); // "data: " 제거
      if (payload === '[DONE]') break;

      try {
        const event = JSON.parse(payload) as {
          type: string;
          delta?: string;
          toolName?: string;
          messageMetadata?: { conversationId?: string };
        };

        switch (event.type) {
          case 'text-delta':
            if (event.delta) fullText += event.delta;
            break;
          case 'tool-call':
            if (event.toolName) toolCalls.push(event.toolName);
            break;
          case 'start':
            if (event.messageMetadata?.conversationId) {
              detectedConversationId = event.messageMetadata.conversationId;
            }
            break;
          // text-start, text-end, start-step, finish-step, finish — 무시
        }
      } catch { /* skip malformed SSE line */ }
    }
  }

  return {
    text: fullText.trim(),
    toolCalls,
    conversationId: detectedConversationId,
  };
}

// ============================================================
// Judge — Gemini 2.0 Flash, temperature=0, structured output
// ============================================================

const judgeCriterionSchema = z.object({
  criterion: z.string().describe('The criterion name being evaluated'),
  pass: z.boolean().describe('Whether the response passes this criterion'),
  reason: z.string().describe('Brief explanation for the judgment (1-2 sentences)'),
});

const judgeResultSchema = z.object({
  criteria: z.array(judgeCriterionSchema),
});

async function judgeResponse(
  scenario: Scenario,
  conversationLog: string,
): Promise<JudgeCriterionResult[]> {
  const rubricText = scenario.rubric
    .map((r, i) => `${i + 1}. **${r.criterion}**: ${r.description}`)
    .join('\n');

  const { object } = await generateObject({
    model: google(JUDGE_MODEL),
    temperature: JUDGE_TEMPERATURE,
    schema: judgeResultSchema,
    prompt: `You are an AI quality evaluator for a K-beauty recommendation chatbot.

## Scenario
- ID: ${scenario.id}
- Category: ${scenario.category}
- Name: ${scenario.name}
- Profile: ${scenario.profile ? JSON.stringify(scenario.profile) : 'None (anonymous, no profile)'}

## Conversation
${conversationLog}

## Rubric — evaluate each criterion independently
${rubricText}

## Instructions
For each criterion, determine if the assistant's response PASSES or FAILS.
- Be strict but fair. The response must clearly meet the criterion, not just vaguely touch on it.
- For multilingual criteria, the response must be primarily in the target language.
- For guardrail criteria, even a partial violation is a FAIL.
- Provide a brief reason for each judgment.`,
  });

  return object.criteria;
}

// ============================================================
// Scenario runner
// ============================================================

async function runScenario(
  session: EvalSession,
  scenario: Scenario,
): Promise<ScenarioResult> {
  const startTime = Date.now();

  try {
    // 1. Setup profile (or clear for null profile)
    if (scenario.profile) {
      await setupProfile(session, scenario.profile);
    }

    // 2. Send messages (multi-turn support)
    // chat API는 locale: 'en' | 'ko'만 허용. 그 외 언어는 LLM이 입력 감지로 전환.
    const locale: 'en' | 'ko' = scenario.profile?.language === 'ko' ? 'ko' : 'en';
    let conversationId: string | null = null;
    let lastResponse: ChatResponse = { text: '', toolCalls: [], conversationId: null };
    const conversationLog: string[] = [];

    for (const msg of scenario.messages) {
      conversationLog.push(`USER: ${msg.text}`);
      lastResponse = await sendChatMessage(session, msg.text, conversationId, locale);
      conversationId = lastResponse.conversationId;
      conversationLog.push(`ASSISTANT: ${lastResponse.text}`);
      if (lastResponse.toolCalls.length > 0) {
        conversationLog.push(`[Tools used: ${lastResponse.toolCalls.join(', ')}]`);
      }
    }

    // 3. Judge
    const criteria = await judgeResponse(scenario, conversationLog.join('\n\n'));

    const allPass = criteria.every((c) => c.pass);

    return {
      id: scenario.id,
      category: scenario.category,
      name: scenario.name,
      pass: allPass,
      criteria,
      responsePreview: lastResponse.text.slice(0, 200),
      responseFull: lastResponse.text,
      toolCalls: lastResponse.toolCalls,
      error: null,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      id: scenario.id,
      category: scenario.category,
      name: scenario.name,
      pass: false,
      criteria: [],
      responsePreview: '',
      responseFull: '',
      toolCalls: [],
      error: (err as Error).message,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Clean up profile/conversations for next scenario
    await clearProfile(session).catch(() => {});
  }
}

// ============================================================
// Output — table formatting
// ============================================================

function printResults(results: ScenarioResult[]): void {
  const PASS = '\x1b[32mPASS\x1b[0m';
  const FAIL = '\x1b[31mFAIL\x1b[0m';
  const ERROR = '\x1b[33mERROR\x1b[0m';

  console.log('\n' + '='.repeat(80));
  console.log('  EVAL RESULTS — LLM-as-Judge Chat Quality');
  console.log('='.repeat(80) + '\n');

  // Group by category
  const categories = [...new Set(results.map((r) => r.category))];

  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPass = catResults.filter((r) => r.pass).length;
    console.log(`\n  ${cat.toUpperCase()} (${catPass}/${catResults.length})`);
    console.log('  ' + '-'.repeat(76));

    for (const r of catResults) {
      const status = r.error ? ERROR : r.pass ? PASS : FAIL;
      const tools = r.toolCalls.length > 0 ? ` [${r.toolCalls.join(',')}]` : '';
      const duration = `${(r.durationMs / 1000).toFixed(1)}s`;
      console.log(`  ${status}  ${r.id.padEnd(4)} ${r.name.padEnd(45)} ${duration}${tools}`);

      if (r.error) {
        console.log(`         Error: ${r.error.slice(0, 100)}`);
      } else if (!r.pass) {
        // Show failed criteria
        const failed = r.criteria.filter((c) => !c.pass);
        for (const f of failed) {
          console.log(`         \x1b[31m✗\x1b[0m ${f.criterion}: ${f.reason.slice(0, 80)}`);
        }
      }
    }
  }

  // Summary
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass && !r.error).length;
  const errors = results.filter((r) => r.error).length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log('\n' + '='.repeat(80));
  console.log(`  SUMMARY: ${passed}/${total} passed, ${failed} failed, ${errors} errors`);
  console.log(`  Duration: ${(totalDuration / 1000).toFixed(1)}s total`);
  console.log('='.repeat(80) + '\n');
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const { scenarioFilter } = parseArgs();

  // Load scenarios
  const fixturesPath = resolve(__dirname, 'fixtures/eval-scenarios.json');
  const raw = readFileSync(fixturesPath, 'utf-8');
  const { scenarios } = JSON.parse(raw) as ScenariosFile;

  // Filter if requested
  const filtered = scenarioFilter
    ? scenarios.filter(
        (s) =>
          s.id === scenarioFilter ||
          s.category === scenarioFilter,
      )
    : scenarios;

  if (filtered.length === 0) {
    console.error(`No scenarios matched filter: ${scenarioFilter}`);
    console.error(`Available: ${scenarios.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nRunning ${filtered.length} eval scenarios...`);
  console.log(`Chat API: ${CHAT_API_URL}`);
  console.log(`Judge: ${JUDGE_MODEL} (temperature=${JUDGE_TEMPERATURE})\n`);

  // Create eval session
  console.log('Creating anonymous eval session...');
  const session = await createEvalSession();
  console.log(`Session created: ${session.userId.slice(0, 8)}...\n`);

  // Run scenarios sequentially with delay (chat API rate limit: 15/min)
  const SCENARIO_DELAY_MS = 4000;
  const results: ScenarioResult[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const scenario = filtered[i];
    console.log(`[${i + 1}/${filtered.length}] ${scenario.id}: ${scenario.name}...`);
    const result = await runScenario(session, scenario);
    results.push(result);
    console.log(`  → ${result.pass ? 'PASS' : result.error ? 'ERROR' : 'FAIL'} (${(result.durationMs / 1000).toFixed(1)}s)`);

    // Rate limit 방지: 다음 시나리오 전 대기 (마지막 시나리오 제외)
    if (i < filtered.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SCENARIO_DELAY_MS));
    }
  }

  // Print results
  printResults(results);

  // Save detailed results JSON for calibration review
  try {
    const runTimestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const detailPath = resolve(__dirname, 'fixtures', `eval-run-${runTimestamp}-detail.json`);
    const detailData = results.map((r) => ({
      id: r.id,
      category: r.category,
      name: r.name,
      pass: r.pass,
      criteria: r.criteria,
      responseFull: r.responseFull,
      toolCalls: r.toolCalls,
      error: r.error,
      durationMs: r.durationMs,
    }));
    writeFileSync(detailPath, JSON.stringify(detailData, null, 2));
    console.log(`\nDetailed results saved to: ${detailPath}`);
  } catch (err) {
    console.warn(`\nWarning: Failed to save detailed results: ${(err as Error).message}`);
  }

  // Cleanup
  console.log('Cleaning up eval session...');
  await cleanupEvalSession(session);

  // Exit code
  const allPass = results.every((r) => r.pass);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
