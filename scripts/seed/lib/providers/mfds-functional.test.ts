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

import { mapItemToRawRecord, searchMfdsFunctional } from "./mfds-functional";
import { fetchWithRetry } from "../retry";

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

// ── Fixture: P2-V2 검증 기반 S5 응답 구조 ────────────────

const FULL_ITEM: Record<string, unknown> = {
  ITEM_NAME: "이니스프리 그린티 씨드 세럼",
  ENTP_NAME: "(주)아모레퍼시픽",
  MANUF_NAME: "아모레퍼시픽",
  REPORT_DATE: "20230101",
  COSMETIC_REPORT_SEQ: "2023-0001234",
  EFFECT_YN1: "Y",
  EFFECT_YN2: "N",
  EFFECT_YN3: "N",
  SPF: null,
  PA: null,
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
  it("정상 S5 응답을 RawRecord로 변환", () => {
    const result = mapItemToRawRecord(FULL_ITEM);

    expect(result.source).toBe("mfds-functional");
    expect(result.sourceId).toBe("2023-0001234");
    expect(result.entityType).toBe("product");
    expect(result.fetchedAt).toMatch(ISO_8601_REGEX);
  });

  it("sourceId = COSMETIC_REPORT_SEQ", () => {
    const result = mapItemToRawRecord(FULL_ITEM);

    expect(result.sourceId).toBe("2023-0001234");
  });

  it("COSMETIC_REPORT_SEQ 없으면 빈 문자열", () => {
    const item = { ...FULL_ITEM, COSMETIC_REPORT_SEQ: undefined };
    const result = mapItemToRawRecord(item);

    expect(result.sourceId).toBe("");
  });

  it("data에 원본 전체 보존 (EFFECT_YN1~3, SPF, PA — Phase E 의존)", () => {
    const result = mapItemToRawRecord(FULL_ITEM);

    expect(result.data).toBe(FULL_ITEM);
    expect(result.data.ITEM_NAME).toBe("이니스프리 그린티 씨드 세럼");
    expect(result.data.EFFECT_YN1).toBe("Y");
    expect(result.data.EFFECT_YN2).toBe("N");
    expect(result.data.SPF).toBeNull();
  });
});

// ── searchMfdsFunctional 테스트 ──────────────────────────

describe("searchMfdsFunctional", () => {
  beforeEach(() => {
    mockFetchWithRetry.mockReset();
    mockPipelineEnv.MFDS_SERVICE_KEY = "test-service-key";
  });

  it("MFDS_SERVICE_KEY 없으면 에러", async () => {
    mockPipelineEnv.MFDS_SERVICE_KEY = undefined;

    await expect(searchMfdsFunctional("그린티")).rejects.toThrow(
      "MFDS_SERVICE_KEY is not configured",
    );
  });

  it("검색 결과 정상 반환", async () => {
    const items = [
      FULL_ITEM,
      { ...FULL_ITEM, COSMETIC_REPORT_SEQ: "2023-0005678", ITEM_NAME: "설화수 자음생크림" },
    ];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 2));

    const result = await searchMfdsFunctional("그린티");

    expect(result).toHaveLength(2);
    expect(result[0].sourceId).toBe("2023-0001234");
    expect(result[1].sourceId).toBe("2023-0005678");
  });

  it("item_name URL 파라미터 전달", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse([], 0));

    await searchMfdsFunctional("그린티 세럼");

    const calledUrl = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(calledUrl).toContain("serviceKey=test-service-key");
    expect(calledUrl).toContain("type=json");
    expect(calledUrl).toContain("item_name=");
    expect(calledUrl).toContain("FtnltCosmRptPrdlstInfoService");
  });

  it("sourceId dedup — 동일 COSMETIC_REPORT_SEQ", async () => {
    const items = [FULL_ITEM, FULL_ITEM];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 2));

    const result = await searchMfdsFunctional("그린티");

    expect(result).toHaveLength(1);
  });

  it("빈 sourceId skip", async () => {
    const items = [
      { ITEM_NAME: "테스트", EFFECT_YN1: "Y" },
      FULL_ITEM,
    ];
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse(items, 2));

    const result = await searchMfdsFunctional("테스트");

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe("2023-0001234");
  });

  it("API 에러 시 throw", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(
      createErrorResponse(500, "Internal Server Error"),
    );

    await expect(searchMfdsFunctional("그린티")).rejects.toThrow(
      "MFDS S5 API error 500",
    );
  });

  it("빈 응답 → 빈 배열", async () => {
    mockFetchWithRetry.mockResolvedValueOnce(createMockResponse([], 0));

    const result = await searchMfdsFunctional("존재하지않는제품");

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

    const result = await searchMfdsFunctional("그린티");

    expect(result).toHaveLength(1);
  });

  it("다중 페이지 — totalCount 도달 종료", async () => {
    const page1 = [FULL_ITEM];
    const page2 = [{ ...FULL_ITEM, COSMETIC_REPORT_SEQ: "2023-9999" }];

    mockFetchWithRetry
      .mockResolvedValueOnce(createMockResponse(page1, 2))
      .mockResolvedValueOnce(createMockResponse(page2, 2));

    const result = await searchMfdsFunctional("그린티");

    expect(result).toHaveLength(2);
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
  });
});
