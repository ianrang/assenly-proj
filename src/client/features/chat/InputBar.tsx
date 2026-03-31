"use client";

import "client-only";

import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/client/ui/primitives/button";

type InputBarProps = {
  onSend: (text: string) => void;
  disabled: boolean;
};

export default function InputBar({ onSend, disabled }: InputBarProps) {
  const t = useTranslations("chat");
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // visualViewport 키보드 감지: 키보드 열림 시 InputBar를 뷰포트에 고정
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function handleResize() {
      const vv = window.visualViewport;
      if (!vv) return;
      // 키보드 높이만큼 하단 오프셋 적용
      const offset = window.innerHeight - vv.height;
      document.documentElement.style.setProperty("--keyboard-offset", `${offset}px`);
    }

    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    textareaRef.current?.focus();
  }

  return (
    <div
      className="border-t border-border bg-card px-4 py-3"
      style={{ paddingBottom: "max(12px, var(--keyboard-offset, 0px))" }}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
          style={{ maxHeight: "120px", fieldSizing: "content" } as React.CSSProperties}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          {t("send")}
        </Button>
      </div>
    </div>
  );
}
