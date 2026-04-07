"use client";

import "client-only";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/client/ui/primitives/button";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration mismatch 방지 mount 감지 패턴
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9" />;

  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const nextIcon = next === "dark" ? "🌙" : next === "light" ? "☀️" : "💻";
  const nextLabel = next === "dark" ? "Dark" : next === "light" ? "Light" : "Auto";

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${nextLabel} mode`}
      className="group relative text-sm"
    >
      {nextIcon}
      <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-0.5 text-[10px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100">
        {nextLabel}
      </span>
    </Button>
  );
}
