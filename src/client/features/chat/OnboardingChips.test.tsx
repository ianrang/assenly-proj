import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("client-only", () => ({}));

// next-intl mock: en.json의 chat 키를 직접 로드
import enMessages from "../../../../messages/en.json";
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const messages = (enMessages as Record<string, Record<string, string>>)[namespace] ?? {};
    return (key: string) => messages[key] ?? key;
  },
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OnboardingChips from "./OnboardingChips";

// auth-fetch mock
vi.mock("@/client/core/auth-fetch", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-token"),
}));

// fetch mock
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("OnboardingChips", () => {
  it("skin type 5개 칩 렌더링", () => {
    render(<OnboardingChips onComplete={vi.fn()} onSkip={vi.fn()} />);

    expect(screen.getByText("Dry")).toBeInTheDocument();
    expect(screen.getByText("Oily")).toBeInTheDocument();
    expect(screen.getByText("Combination")).toBeInTheDocument();
    expect(screen.getByText("Sensitive")).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
  });

  it("concerns 5개 칩 렌더링", () => {
    render(<OnboardingChips onComplete={vi.fn()} onSkip={vi.fn()} />);

    expect(screen.getByText("Dryness")).toBeInTheDocument();
    expect(screen.getByText("Acne")).toBeInTheDocument();
    expect(screen.getByText("Wrinkles")).toBeInTheDocument();
    expect(screen.getByText("Redness")).toBeInTheDocument();
    expect(screen.getByText("Dark spots")).toBeInTheDocument();
  });

  it("skin type 미선택 시 Start chatting 비활성", () => {
    render(<OnboardingChips onComplete={vi.fn()} onSkip={vi.fn()} />);

    const startButton = screen.getByRole("button", { name: /Start chatting/i });
    expect(startButton).toBeDisabled();
  });

  it("skin type 선택 시 Start chatting 활성", () => {
    render(<OnboardingChips onComplete={vi.fn()} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByText("Dry"));
    const startButton = screen.getByRole("button", { name: /Start chatting/i });
    expect(startButton).not.toBeDisabled();
  });

  it("concerns 2개까지만 선택 가능 (3번째 시도 무시)", () => {
    render(<OnboardingChips onComplete={vi.fn()} onSkip={vi.fn()} />);

    const dryness = screen.getByText("Dryness");
    const acne = screen.getByText("Acne");
    const wrinkles = screen.getByText("Wrinkles");

    fireEvent.click(dryness);
    fireEvent.click(acne);
    fireEvent.click(wrinkles);

    // wrinkles 버튼은 disabled 상태여야 함
    expect(wrinkles.closest("button")).toBeDisabled();
  });

  it("Start chatting 클릭 → POST /api/profile/onboarding 호출 + onComplete", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const onComplete = vi.fn();

    render(<OnboardingChips onComplete={onComplete} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByText("Oily"));
    fireEvent.click(screen.getByText("Acne"));
    fireEvent.click(screen.getByRole("button", { name: /Start chatting/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/profile/onboarding",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            skin_type: "oily",
            skin_concerns: ["acne"],
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it("API 실패해도 onComplete 호출 (Q-15 격리)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const onComplete = vi.fn();

    render(<OnboardingChips onComplete={onComplete} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByText("Sensitive"));
    fireEvent.click(screen.getByRole("button", { name: /Start chatting/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it("Skip 클릭 → onSkip 호출 (API 호출 없음)", () => {
    const onSkip = vi.fn();

    render(<OnboardingChips onComplete={vi.fn()} onSkip={onSkip} />);

    // "Skip — I'll just chat" 버튼 (type="button"으로 찾기)
    const skipButton = screen.getByRole("button", { name: /Skip.*just chat/i });
    fireEvent.click(skipButton);

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
