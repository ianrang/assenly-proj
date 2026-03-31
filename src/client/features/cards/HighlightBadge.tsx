"use client";

import "client-only";

import type { LocalizedText } from "@/shared/types/domain";
import { localized } from "@/shared/utils/localized";

type HighlightBadgeProps = {
  isHighlighted: boolean;
  badge: LocalizedText | null;
  locale: string;
};

/**
 * VP-1 비개입적 판단: 시각적 배지 표시만. 검색/정렬/필터에 절대 영향 없음 (Q-2, V-11).
 * is_highlighted === true && badge !== null 일 때만 렌더링.
 */
export default function HighlightBadge({ isHighlighted, badge, locale }: HighlightBadgeProps) {
  if (!isHighlighted || !badge) return null;

  const text = localized(badge, locale);
  if (!text) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-teal bg-teal/20 px-2 py-0.5 text-[11px] font-semibold text-teal">
      <span aria-hidden="true">★</span>
      {text}
    </span>
  );
}
