// ============================================================
// Profile & Personalization Types — PRD §4 개인화 변수
// ============================================================

import type {
  SkinType,
  HairType,
  HairConcern,
  SkinConcern,
  BudgetLevel,
  TravelStyle,
  InterestActivity,
  AgeRange,
  SupportedLanguage,
} from "./domain";

/** UP: User Profile — 반영구적 (4개) */
export interface UserProfileVars {
  skin_type: SkinType | null;           // UP-1
  hair_type: HairType | null;           // UP-2
  hair_concerns: HairConcern[];         // UP-2
  country: string | null;               // UP-3
  language: SupportedLanguage;          // UP-3
  age_range: AgeRange | null;           // UP-4
}

/** JC: Journey Context — 방문마다 변경 (5개) */
export interface JourneyContextVars {
  skin_concerns: SkinConcern[];         // JC-1 (UI 최대 3, DB 최대 5)
  interest_activities: InterestActivity[]; // JC-2
  stay_days: number | null;             // JC-3
  start_date: string | null;            // JC-3 (ISO date)
  end_date: string | null;              // JC-3 (ISO date)
  budget_level: BudgetLevel | null;     // JC-4
  travel_style: TravelStyle[];          // JC-5
}

/** BH: Beauty History — 시간 누적 (4개) */
export interface BeautyHistoryEntry {
  id: string;
  type: "treatment" | "purchase" | "visit"; // BH-1, BH-2, BH-3
  entity_id: string | null;
  entity_type: string | null;
  date: string | null;
  satisfaction: number | null; // 1-5
  notes: string | null;
}

/** BH-4: Learned Preferences */
export interface LearnedPreference {
  id: string;
  category: string;
  preference: string;
  direction: "like" | "dislike";
  confidence: number;
  source: string | null;
}

/** RT: Real-time Context — 자동 수집 (2개) */
export interface RealtimeContext {
  location: { lat: number; lng: number } | null; // RT-1
  timezone: string;                               // RT-2
  current_time: string;                           // RT-2
}

/** DV: Derived Variables — AI 런타임 계산 (4개) */
export interface DerivedVariables {
  preferred_ingredients: string[];  // DV-1
  avoided_ingredients: string[];    // DV-2
  user_segment: string | null;      // DV-3
  ai_beauty_profile: string | null; // DV-4
}

/** Full user profile (DB row) */
export interface UserProfile extends UserProfileVars {
  user_id: string;
  /** NEW-9b: 온보딩 게이트 완료 시점. NULL=미완료, NOT NULL=Start 또는 Skip 수행. 원샷(I4). */
  onboarding_completed_at: string | null;
  updated_at: string;
}

/** Full journey (DB row) */
export interface Journey extends JourneyContextVars {
  id: string;
  user_id: string;
  country: string;
  city: string;
  status: "active" | "completed" | "archived";
  created_at: string;
}

/** Consent record */
export interface ConsentRecord {
  user_id: string;
  location_tracking: boolean;
  behavior_logging: boolean;
  data_retention: boolean;
  marketing: boolean;
  consented_at: string;
  updated_at: string;
}

/** Onboarding form data (4 steps combined) */
export interface OnboardingFormData {
  // Step 1: Skin & Hair
  skin_type: SkinType;
  hair_type: HairType | null;
  hair_concerns: HairConcern[];
  // Step 2: Concerns
  skin_concerns: SkinConcern[]; // max 3 in UI
  // Step 3: Travel
  country: string;
  age_range?: AgeRange;
  stay_days: number;
  start_date?: string;
  end_date?: string;
  budget_level: BudgetLevel;
  travel_style: TravelStyle[];
  // Step 4: Interests
  interest_activities: InterestActivity[];
}
