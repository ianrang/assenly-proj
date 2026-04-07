"use client";

import "client-only";

import Link from "next/link";
import { cn } from "@/shared/utils/cn";

export default function BrandLogo({ className, ...props }: Omit<React.ComponentProps<typeof Link>, "href">) {
  return (
    <Link
      href="/"
      className={cn("text-xl font-bold tracking-tight text-primary", className)}
      {...props}
    >
      Essenly
    </Link>
  );
}
