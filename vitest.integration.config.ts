import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // mode='test' (vitest 기본값) → .env + .env.local + .env.test 순서 로드
  // .env.test 값이 .env.local 값을 오버라이드
  // prefix='' → VITE_ 접두사 없이 모든 변수 로드
  const env = loadEnv(mode, process.cwd(), '');

  return {
    test: {
      env,
      environment: 'node',
      globals: true,
      setupFiles: ['./src/__tests__/integration/setup.ts'],
      include: ['src/__tests__/integration/**/*.integration.test.ts'],
      testTimeout: 30_000,
      hookTimeout: 30_000,
      pool: 'forks',
      forks: { singleFork: true },
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
  };
});
