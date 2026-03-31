// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry, MAX_RETRIES, RETRY_BASE_MS } from "./retry";

// ── fetch mock ────────────────────────────────────────────

const mockFetch = vi.fn<typeof globalThis.fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  // setTimeout을 즉시 실행하도록 mock (재시도 대기 제거)
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as typeof setTimeout);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 헬퍼 ──────────────────────────────────────────────────

function okResponse(body = "ok"): Response {
  return new Response(body, { status: 200 });
}

function errorResponse(status: number): Response {
  return new Response("error", { status });
}

// ── 테스트 ────────────────────────────────────────────────

describe("fetchWithRetry", () => {
  it("첫 시도 성공 → 즉시 반환", async () => {
    mockFetch.mockResolvedValueOnce(okResponse());

    const res = await fetchWithRetry("https://api.test/data", {});

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("429 → 재시도 → 성공", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(okResponse());

    const res = await fetchWithRetry("https://api.test/data", {});

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("500 → 재시도 → 성공", async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(okResponse());

    const res = await fetchWithRetry("https://api.test/data", {});

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("4xx (403) → 재시도 없이 즉시 반환", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403));

    const res = await fetchWithRetry("https://api.test/data", {});

    expect(res.status).toBe(403);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("4xx (404) → 재시도 없이 즉시 반환", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404));

    const res = await fetchWithRetry("https://api.test/data", {});

    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("네트워크 에러 → 재시도 → 성공", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(okResponse());

    const res = await fetchWithRetry("https://api.test/data", {});

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("모든 재시도 소진 (네트워크 에러) → throw", async () => {
    mockFetch.mockRejectedValue(new Error("DNS_FAIL"));

    await expect(
      fetchWithRetry("https://api.test/data", {}),
    ).rejects.toThrow("DNS_FAIL");

    expect(mockFetch).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it("모든 재시도 소진 (5xx) → 마지막 응답 반환", async () => {
    mockFetch.mockResolvedValue(errorResponse(503));

    const res = await fetchWithRetry("https://api.test/data", {});

    expect(res.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it("상수 값 확인", () => {
    expect(MAX_RETRIES).toBe(3);
    expect(RETRY_BASE_MS).toBe(1000);
  });
});
