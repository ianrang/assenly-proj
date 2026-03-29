// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config", () => ({
  pipelineEnv: { MFDS_SERVICE_KEY: "test-service-key" },
}));

vi.mock("../retry", () => ({
  fetchWithRetry: vi.fn(),
}));

import { mapItemToRawRecord, fetchAllMfdsIngredients } from "./mfds-ingredient";
import { fetchWithRetry } from "../retry";

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

// ── Fixture: P2-V2 검증 기반 실제 응답 구조 ──────────────

const FULL_ITEM: Record<string, unknown> = {
  INGR_KOR_NAME: "나이아신아마이드",
  INGR_ENG_NAME: "Niacinamide",
  CAS_NO: null,
  ORIGIN_MAJOR_KOR_NAME: "비타민 B3의 아마이드 형태",
  INGR_SYNONYM: "니코틴아미드",
};

/** ISO 8601 형식 정규식 */
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ── helper: 공공데이터포털 표준 응답 mock ─────────────────

function createMockResponse(
  items: Record<string, unknown>[],
  totalCount: number,
): Response {
  return {
    ok: true,
    json: async () => ({
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
      body: {
        numOfRows: 100,
        pageNo: 1,
        totalCount,
        items: { item: items },
      },
    }),
  } as unknown as Response;
}

function createErrorResponse(status: number, text: string): Response {
  return {
    ok: false,
    status,
    text: async () => text,
  } as unknown as Response;
}

// ── mapItemToRawRecord 테스트 ─────────────────────────────

describe("mapItemToRawRecord", () => {
  it("정상 API 응답을 RawRecord로 변환", () => {
    const result = mapItemToRawRecord(FULL_ITEM);

    expect(result.source).toBe("mfds-ingredient");
    expect(result.sourceId).toBe("나이아신아마이드");
    expect(result.entityType).toBe("ingredient");
    expect(result.fetchedAt).toMatch(ISO_8601_REGEX);
  });

  it("sourceId — INGR_KOR_NAME 매핑", () => {
    const result = mapItemToRawRecord(FULL_ITEM);

    expect(result.sourceId).toBe("나이아신아마이드");
  });

  it("INGR_KOR_NAME 없으면 빈 문자열", () => {
    const item = { ...FULL_ITEM, INGR_KOR_NAME: undefined };
    const result = mapItemToRawRecord(item);

    expect(result.sourceId).toBe("");
  });

  it("data에 원본 전체 보존 (P2-56g 체인 의존)", () => {
    const result = mapItemToRawRecord(FULL_ITEM);

    expect(result.data).toBe(FULL_ITEM);
    expect(result.data.INGR_ENG_NAME).toBe("Niacinamide");
    expect(result.data.CAS_NO).toBeNull();
  });
});

// ── fetchAllMfdsIngredients 테스트 ────────────────────────

describe("fetchAllMfdsIngredients", () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
  });

  it("단일 페이지 — 전체 수집 후 RawRecord[] 반환", async () => {
    const items = [
      FULL_ITEM,
      { ...FULL_ITEM, INGR_KOR_NAME: "레티놀", INGR_ENG_NAME: "Retinol" },
    ];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 2));

    const result = await fetchAllMfdsIngredients();

    expect(result).toHaveLength(2);
    expect(result[0].sourceId).toBe("나이아신아마이드");
    expect(result[1].sourceId).toBe("레티놀");
  });

  it("다중 페이지 — totalCount 도달 시 종료", async () => {
    const page1 = [FULL_ITEM];
    const page2 = [
      { ...FULL_ITEM, INGR_KOR_NAME: "레티놀", INGR_ENG_NAME: "Retinol" },
    ];

    mockFetchWithRetry
      .mockResolvedValueOnce(createMockResponse(page1, 2))
      .mockResolvedValueOnce(createMockResponse(page2, 2));

    const result = await fetchAllMfdsIngredients();

    expect(result).toHaveLength(2);
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it("sourceId dedup — 동일 INGR_KOR_NAME 중복 제거", async () => {
    const items = [FULL_ITEM, FULL_ITEM];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 2));

    const result = await fetchAllMfdsIngredients();

    expect(result).toHaveLength(1);
  });

  it("빈 응답 — 빈 배열 반환", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse([], 0));

    const result = await fetchAllMfdsIngredients();

    expect(result).toEqual([]);
  });

  it("API 에러 시 throw", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      createErrorResponse(500, "Internal Server Error"),
    );

    await expect(fetchAllMfdsIngredients()).rejects.toThrow(
      "MFDS S3 API error 500",
    );
  });

  it("serviceKey가 URL 파라미터로 전달됨", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse([], 0));

    await fetchAllMfdsIngredients();

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(calledUrl).toContain("serviceKey=test-service-key");
    expect(calledUrl).toContain("type=json");
    expect(calledUrl).toContain("numOfRows=100");
    expect(calledUrl).toContain("pageNo=1");
  });

  it("items 직접 배열 형태 응답 처리", async () => {
    const items = [FULL_ITEM];
    const directArrayResponse = {
      ok: true,
      json: async () => ({
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
        body: { numOfRows: 100, pageNo: 1, totalCount: 1, items },
      }),
    } as unknown as Response;
    mockFetchWithRetry.mockResolvedValueOnce(directArrayResponse);

    const result = await fetchAllMfdsIngredients();

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe("나이아신아마이드");
  });

  it("INGR_KOR_NAME 없는 레코드 — sourceId 빈 문자열은 skip", async () => {
    const items = [
      { INGR_ENG_NAME: "Unknown", CAS_NO: null },
      FULL_ITEM,
    ];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 2));

    const result = await fetchAllMfdsIngredients();

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe("나이아신아마이드");
  });
});
