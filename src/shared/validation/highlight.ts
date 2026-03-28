import { z } from "zod";

import { localizedTextOptional } from "./common";

// ============================================================
// Highlight update schema (DV-C7: badge.en required when highlighted)
// ============================================================

export const highlightUpdateSchema = z
  .object({
    is_highlighted: z.boolean(),
    highlight_badge: localizedTextOptional,
  })
  .refine(
    (data) => {
      if (!data.is_highlighted) return true;
      return (
        data.highlight_badge != null &&
        typeof data.highlight_badge.en === "string" &&
        data.highlight_badge.en.length > 0
      );
    },
    {
      message: "highlight_badge.en is required when is_highlighted is true",
      path: ["highlight_badge"],
    },
  );
