// ============================================================
// API Request/Response Types — TDD §3.2, §3.5
// ============================================================

import type { ExternalLink } from "./domain";

/** Tool: search_beauty_data (F1) */
export interface SearchBeautyDataParams {
  domain: "shopping" | "clinic";
  query: string;
  filters?: {
    skin_types?: string[];
    hair_types?: string[];
    concerns?: string[];
    district?: string;
    budget_max_krw?: number;
    english_support?: boolean;
    travel_style?: string[];
  };
  limit?: number;
}

/** Tool: get_external_links (F2) */
export interface GetExternalLinksParams {
  entity_id: string;
  entity_type: "product" | "store" | "clinic" | "treatment";
  link_types?: string[];
}

export interface GetExternalLinksResult {
  entity_id: string;
  links: ExternalLink[];
}

/** Profile API */
export interface OnboardingResponse {
  profile_id: string;
  journey_id: string;
  derived_variables: {
    preferred_ingredients: string[];
    avoided_ingredients: string[];
    user_segment: string | null;
    ai_beauty_profile: string | null;
  };
}

/** Journey API */
export interface CreateJourneyRequest {
  skin_concerns: string[];
  interest_activities: string[];
  stay_days: number;
  start_date?: string;
  end_date?: string;
  budget_level: string;
  travel_style: string[];
}

/** Kit CTA */
export interface KitClaimRequest {
  email: string;
}

/** API Error */
export interface ApiError {
  error: string;
  code: string;
  details?: string;
}
