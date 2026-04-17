"use client";

import "client-only";

import type { ReactNode } from "react";
import LanguageSelector from "@/client/features/layout/LanguageSelector";
import ThemeToggle from "@/client/features/layout/ThemeToggle";
import BrandLogo from "@/client/features/layout/BrandLogo";

type HeaderProps = {
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  showLanguageSelector?: boolean;
};

export default function Header({
  leftContent,
  rightContent,
  showLanguageSelector = false,
}: HeaderProps) {
  return (
    <header className="relative z-20 border-b border-border">
      <div className="mx-auto flex h-13 max-w-[640px] items-center justify-between px-5">
        <div className="flex min-w-[60px] items-center">
          {leftContent}
        </div>
        <BrandLogo />
        <div className="flex min-w-[60px] items-center justify-end gap-2">
          {rightContent}
          {showLanguageSelector && <LanguageSelector />}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
