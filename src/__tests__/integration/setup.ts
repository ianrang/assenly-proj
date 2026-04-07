// server/ 모듈의 첫 줄 `import 'server-only'`를 noop 처리.
// vitest setupFiles는 테스트 파일 로드 전에 실행 — mock이 먼저 등록됨.
vi.mock('server-only', () => ({}));
