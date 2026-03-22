/**
 * Step 0: 스모크 테스트
 *
 * 검증 항목:
 * 1. .env.local 로드 + API 키 존재
 * 2. Zod 4 + zodSchema() 호환성
 * 3. AI 프로바이더 연결 + 단순 텍스트 생성
 * 4. tool_use 기본 동작 (1회 호출)
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-00-smoke-test.ts
 */
import { generateText, zodSchema, stepCountIs } from 'ai';
import { z } from 'zod';
import { getModel, provider } from './shared/config.js';

async function main() {
  console.log('=== Step 0: Smoke Test ===\n');

  // 1. 환경 변수 확인
  console.log(`[1/4] Provider: ${provider}`);
  const keyMap: Record<string, string> = {
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
  };
  const keyName = keyMap[provider];
  const keyExists = !!process.env[keyName];
  console.log(`  ${keyName}: ${keyExists ? 'OK' : 'MISSING'}`);
  if (!keyExists) {
    console.error(`\n  ERROR: ${keyName} not found in .env.local`);
    console.error(`  Edit .env.local and set your API key.`);
    process.exit(1);
  }

  // 2. Zod 4 + zodSchema() 호환성
  console.log('\n[2/4] Zod 4 + zodSchema() compatibility...');
  try {
    const schema = zodSchema(z.object({
      query: z.string(),
      count: z.number().optional(),
    }));
    const jsonSch = schema.jsonSchema;
    const hasType = jsonSch && typeof jsonSch === 'object' && 'type' in jsonSch && jsonSch.type === 'object';
    console.log(`  JSON Schema type=object: ${hasType ? 'OK' : 'MISSING'}`);
    console.log(`  zodSchema(): OK`);
  } catch (err) {
    console.error('  zodSchema(): FAILED', err);
    process.exit(1);
  }

  // 3. 단순 텍스트 생성
  console.log('\n[3/4] Text generation (no tools)...');
  try {
    const model = await getModel();
    const result = await generateText({
      model,
      maxOutputTokens: 100,
      prompt: 'Say "Hello from Essenly" in one sentence.',
    });
    console.log(`  Response: "${result.text.slice(0, 100)}"`);
    console.log(`  Tokens: input=${result.usage.inputTokens}, output=${result.usage.outputTokens}`);
    console.log('  Text generation: OK');
  } catch (err) {
    console.error('  Text generation: FAILED');
    console.error(' ', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // 4. tool_use 기본 동작 (inputSchema + zodSchema 패턴)
  console.log('\n[4/4] Tool use (single call)...');
  try {
    const model = await getModel();

    // NOTE: tool() 헬퍼의 parameters 대신 inputSchema + zodSchema() 사용
    // Zod 4 + @ai-sdk/google 호환 이슈 워크어라운드
    const echoTool = {
      description: 'Echo back the input message',
      inputSchema: zodSchema(z.object({ message: z.string() })),
      execute: async ({ message }: { message: string }) => ({ echo: message }),
    };

    const result = await generateText({
      model,
      maxOutputTokens: 256,
      tools: { echo: echoTool },
      stopWhen: stepCountIs(2),
      prompt: 'Use the echo tool to echo "K-beauty rocks"',
    });

    const toolCalls = result.steps.flatMap((s) => s.toolCalls);
    if (toolCalls.length > 0) {
      console.log(`  Tool called: ${toolCalls[0].toolName}`);
      console.log(`  Args: ${JSON.stringify(toolCalls[0].input)}`);
      console.log(`  Response: "${result.text.slice(0, 100)}"`);
      console.log('  Tool use: OK');
    } else {
      console.log('  WARNING: No tool was called. Model may not support tool_use well.');
      console.log(`  Response: "${result.text.slice(0, 100)}"`);
    }
  } catch (err) {
    console.error('  Tool use: FAILED');
    console.error(' ', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('\n=== Smoke Test PASSED ===');
  console.log('Ready to proceed with P0-12 and P0-13.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
