"use client";

import "client-only";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/client/ui/primitives/tooltip";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-9 w-9" />;

  function cycleTheme() {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }

  const icon = theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "💻";
  const label =
    theme === "dark" ? "Dark mode" : theme === "light" ? "Light mode" : "System";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          onClick={cycleTheme}
          aria-label={`Theme: ${label}`}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm transition-colors hover:bg-muted"
        >
          {icon}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
