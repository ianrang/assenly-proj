import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("client-only", () => ({}));

// next-intl mock: en.json의 chat + onboarding 네임스페이스를 플랫 접근 제공.
// - `chat.onboarding.*` 는 nested JSON이므로 점 표기법으로 접근하는 useTranslations("chat") 사용을 흉내.
import enMessages from "../../../../messages/en.json";
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const ns = (enMessages as Record<string, unknown>)[namespace] as
      | Record<string, unknown>
      | undefined;
    return (key: string) => {
      if (!ns) return key;
      // Support dotted keys like "onboarding.start"
      const parts = key.split(".");
      let cur: unknown = ns;
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          return key;
        }
      }
      // Support ICU count placeholder for skinConcernsCount — not used here
      return typeof cur === "string" ? cur : key;
    };
  },
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OnboardingChips from "./OnboardingChips";

vi.mock("@/client/core/auth-fetch", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-token"),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("OnboardingChips (NEW-9b)", () => {
  it("PRD §578: skin type 5종 칩 렌더링", () => {
    render(<OnboardingChips onComplete={vi.fn()} />);

    expect(screen.getByText("Dry")).toBeInTheDocument();
    expect(screen.getByText("Oily")).toBeInTheDocument();
    expect(screen.getByText("Combo")).toBeInTheDocument();
    expect(screen.getByText("Sensitive")).toBeInTheDocument();
    expect(screen.getByText("Normal / Not sure")).toBeInTheDocument();
  });

  it("PRD §595: concerns 7종 칩 렌더링 (정본 정정)", () => {
    render(<OnboardingChips onComplete={vi.fn()} />);

    expect(screen.getByText("Acne")).toBeInTheDocument();
    expect(screen.getByText("Wrinkles")).toBeInTheDocument();
    expect(screen.getByText("Dark spots")).toBeInTheDocument();
    expect(screen.getByText("Redness")).toBeInTheDocument();
    expect(screen.getByText("Dryness")).toBeInTheDocument();
    expect(screen.getByText("Pores")).toBeInTheDocument();
    expect(screen.getByText("Dullness")).toBeInTheDocument();
  });

  it("skin type 미선택 시 Start chatting 비활성", () => {
    render(<OnboardingChips onComplete={vi.fn()} />);

    const startButton = screen.getByRole("button", { name: /Start chatting/i });
    expect(startButton).toBeDisabled();
  });

  it("skin type 선택 시 Start chatting 활성", () => {
    render(<OnboardingChips onComplete={vi.fn()} />);

    fireEvent.click(screen.getByText("Dry"));
    const startButton = screen.getByRole("button", { name: /Start chatting/i });
    expect(startButton).not.toBeDisabled();
  });

  it("PRD §595: concerns 최대 3개 (4번째 disabled)", () => {
    render(<OnboardingChips onComplete={vi.fn()} />);

    fireEvent.click(screen.getByText("Acne"));
    fireEvent.click(screen.getByText("Wrinkles"));
    fireEvent.click(screen.getByText("Dryness"));

    // 4번째 선택 시도 → 해당 버튼은 disabled 상태여야 함
    const pores = screen.getByText("Pores").closest("button");
    expect(pores).toBeDisabled();
  });

  it("Start chatting → POST /api/profile/onboarding (skipped 미포함) + onComplete", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const onComplete = vi.fn();

    render(<OnboardingChips onComplete={onComplete} />);

    fireEvent.click(screen.getByText("Oily"));
    fireEvent.click(screen.getByText("Acne"));
    fireEvent.click(screen.getByRole("button", { name: /Start chatting/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/profile/onboarding",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            skin_types: ["oily"],
            skin_concerns: ["acne"],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it("Skip → POST /api/profile/onboarding { skipped: true } + onComplete (NEW-9b)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const onComplete = vi.fn();

    render(<OnboardingChips onComplete={onComplete} />);

    const skipButton = screen.getByRole("button", { name: /Skip.*just chat/i });
    fireEvent.click(skipButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/profile/onboarding",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ skipped: true }),
        }),
      );
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it("Start 실패 시 에러 표시 + onComplete 호출 안 함 (재시도 유도)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const onComplete = vi.fn();

    render(<OnboardingChips onComplete={onComplete} />);

    fireEvent.click(screen.getByText("Sensitive"));
    fireEvent.click(screen.getByRole("button", { name: /Start chatting/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it("Skip 실패 시 에러 표시 + onComplete 호출 안 함", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const onComplete = vi.fn();

    render(<OnboardingChips onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /Skip.*just chat/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it("skin_types 다중 선택 후 Start — payload에 2개 전달", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<OnboardingChips onComplete={vi.fn()} />);

    fireEvent.click(screen.getByText("Dry"));
    fireEvent.click(screen.getByText("Sensitive"));
    fireEvent.click(screen.getByRole("button", { name: /start chatting/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/profile/onboarding",
        expect.objectContaining({
          body: expect.stringContaining('"skin_types":["dry","sensitive"]'),
        }),
      );
    });
  });

  it("제출 중 이중 클릭 방어 (isSubmitting)", async () => {
    let resolveFetch: (value: { ok: boolean }) => void = () => {};
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const onComplete = vi.fn();

    render(<OnboardingChips onComplete={onComplete} />);

    fireEvent.click(screen.getByText("Dry"));
    const startButton = screen.getByRole("button", { name: /Start chatting|Saving/i });
    fireEvent.click(startButton);
    fireEvent.click(startButton); // 이중 클릭

    resolveFetch({ ok: true });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
