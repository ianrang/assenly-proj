"use client";

import "client-only";

import type { ReactNode } from "react";
import LanguageSelector from "@/client/features/layout/LanguageSelector";
import ThemeToggle from "@/client/features/layout/ThemeToggle";

type HeaderProps = {
  leftContent?: ReactNode;
  showLanguageSelector?: boolean;
};

export default function Header({
  leftContent,
  showLanguageSelector = false,
}: HeaderProps) {
  return (
    <header className="relative z-20 border-b border-border">
      <div className="mx-auto flex h-13 max-w-[640px] items-center justify-between px-5">
        <div className="flex min-w-[60px] items-center">
          {leftContent}
        </div>
        <span className="text-xl font-bold tracking-tight text-primary">
          Essenly
        </span>
        <div className="flex min-w-[60px] items-center justify-end gap-2">
          {showLanguageSelector && <LanguageSelector />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
