// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPipelineEnv } = vi.hoisted(() => ({
  mockPipelineEnv: { MFDS_SERVICE_KEY: "test-service-key" } as Record<string, unknown>,
}));

vi.mock("../../config", () => ({
  pipelineEnv: mockPipelineEnv,
}));

vi.mock("../retry", () => ({
  fetchWithRetry: vi.fn(),
}));

import { mapItemToRawRecord, fetchAllMfdsRestricted } from "./mfds-restricted";
import { fetchWithRetry } from "../retry";

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

// ── Fixture: P2-V2 검증 기반 S4 응답 구조 ────────────────

const FULL_ITEM: Record<string, unknown> = {
  REGULATE_TYPE: "제한",
  INGR_STD_NAME: "나이아신아마이드",
  INGR_ENG_NAME: "Niacinamide",
  CAS_NO: "98-92-0",
  COUNTRY_NAME: "대한민국",
  NOTICE_INGR_NAME: "니코틴산아미드",
  PROVIS_ATRCL: "",
  LIMIT_COND: "사용 후 씻어내는 제품에 배합 한도 20%",
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
  it("정상 S4 응답을 RawRecord로 변환", () => {
    const result = mapItemToRawRecord(FULL_ITEM);

    expect(result.source).toBe("mfds-restricted");
    expect(result.sourceId).toBe("Niacinamide:대한민국");
    expect(result.entityType).toBe("ingredient");
    expect(result.fetchedAt).toMatch(ISO_8601_REGEX);
  });

  it("sourceId 복합키 — INGR_ENG_NAME:COUNTRY_NAME", () => {
    const euItem = { ...FULL_ITEM, COUNTRY_NAME: "EU" };
    const result = mapItemToRawRecord(euItem);

    expect(result.sourceId).toBe("Niacinamide:EU");
  });

  it("INGR_ENG_NAME 없으면 빈 문자열", () => {
    const item = { ...FULL_ITEM, INGR_ENG_NAME: undefined, COUNTRY_NAME: undefined };
    const result = mapItemToRawRecord(item);

    expect(result.sourceId).toBe("");
  });

  it("COUNTRY_NAME 없으면 INGR_ENG_NAME만", () => {
    const item = { ...FULL_ITEM, COUNTRY_NAME: undefined };
    const result = mapItemToRawRecord(item);

    expect(result.sourceId).toBe("Niacinamide");
  });

  it("data에 원본 전체 보존 (LIMIT_COND, REGULATE_TYPE — Stage 2 의존)", () => {
    const result = mapItemToRawRecord(FULL_ITEM);

    expect(result.data).toBe(FULL_ITEM);
    expect(result.data.LIMIT_COND).toBe("사용 후 씻어내는 제품에 배합 한도 20%");
    expect(result.data.REGULATE_TYPE).toBe("제한");
    expect(result.data.COUNTRY_NAME).toBe("대한민국");
    expect(result.data.CAS_NO).toBe("98-92-0");
  });
});

// ── fetchAllMfdsRestricted 테스트 ────────────────────────

describe("fetchAllMfdsRestricted", () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
    mockPipelineEnv.MFDS_SERVICE_KEY = "test-service-key";
  });

  it("MFDS_SERVICE_KEY 없으면 에러", async () => {
    mockPipelineEnv.MFDS_SERVICE_KEY = undefined;

    await expect(fetchAllMfdsRestricted()).rejects.toThrow(
      "MFDS_SERVICE_KEY is not configured",
    );
  });

  it("단일 페이지 정상 수집", async () => {
    const items = [
      FULL_ITEM,
      { ...FULL_ITEM, INGR_ENG_NAME: "Retinol", COUNTRY_NAME: "EU", LIMIT_COND: "Max 0.3%" },
    ];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 2));

    const result = await fetchAllMfdsRestricted();

    expect(result).toHaveLength(2);
    expect(result[0].sourceId).toBe("Niacinamide:대한민국");
    expect(result[1].sourceId).toBe("Retinol:EU");
  });

  it("다중 페이지 — totalCount 도달 종료", async () => {
    const page1 = [FULL_ITEM];
    const page2 = [{ ...FULL_ITEM, INGR_ENG_NAME: "Retinol", COUNTRY_NAME: "EU" }];

    mockFetchWithRetry
      .mockResolvedValueOnce(createMockResponse(page1, 2))
      .mockResolvedValueOnce(createMockResponse(page2, 2));

    const result = await fetchAllMfdsRestricted();

    expect(result).toHaveLength(2);
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it("sourceId dedup — 동일 복합키 중복 제거", async () => {
    const items = [FULL_ITEM, FULL_ITEM];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 2));

    const result = await fetchAllMfdsRestricted();

    expect(result).toHaveLength(1);
  });

  it("동일 성분 다른 국가 — 모두 보존", async () => {
    const items = [
      FULL_ITEM,
      { ...FULL_ITEM, COUNTRY_NAME: "EU", LIMIT_COND: "Max 10%" },
      { ...FULL_ITEM, COUNTRY_NAME: "미국", LIMIT_COND: "Max 25%" },
    ];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 3));

    const result = await fetchAllMfdsRestricted();

    expect(result).toHaveLength(3);
    expect(result[0].sourceId).toBe("Niacinamide:대한민국");
    expect(result[1].sourceId).toBe("Niacinamide:EU");
    expect(result[2].sourceId).toBe("Niacinamide:미국");
  });

  it("빈 sourceId skip", async () => {
    const items = [
      { REGULATE_TYPE: "제한", LIMIT_COND: "조건" },
      FULL_ITEM,
    ];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 2));

    const result = await fetchAllMfdsRestricted();

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe("Niacinamide:대한민국");
  });

  it("API 에러 시 throw", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      createErrorResponse(500, "Internal Server Error"),
    );

    await expect(fetchAllMfdsRestricted()).rejects.toThrow(
      "MFDS S4 API error 500",
    );
  });

  it("serviceKey URL 파라미터 전달", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse([], 0));

    await fetchAllMfdsRestricted();

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(calledUrl).toContain("serviceKey=test-service-key");
    expect(calledUrl).toContain("type=json");
    expect(calledUrl).toContain("CsmtcsUseRstrcInfoService");
  });

  it("빈 응답 → 빈 배열", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse([], 0));

    const result = await fetchAllMfdsRestricted();

    expect(result).toEqual([]);
  });

  it("items 직접 배열 형태 응답 처리", async () => {
    const directArrayResponse = {
      ok: true,
      json: async () => ({
        header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
        body: { numOfRows: 100, pageNo: 1, totalCount: 1, items: [FULL_ITEM] },
      }),
    } as unknown as Response;
    mockFetchWithRetry.mockResolvedValueOnce(directArrayResponse);

    const result = await fetchAllMfdsRestricted();

    expect(result).toHaveLength(1);
  });
});
