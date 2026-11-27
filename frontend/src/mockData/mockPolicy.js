// Shape of GET /admin/policy/versions (items). Values mirror backend/app/seeds/policy_v1.json style.

const baseLimits = {
  meals_daily_paise: 150000,
  hotel_tier1_night_paise: 600000,
  hotel_other_night_paise: 400000,
  cab_trip_paise: 200000,
  receipt_required_above_paise: 50000,
  stale_after_days: 90,
};

const levels = {
  auto_approve_up_to_paise: 500000,
  auditor_above_paise: 2500000,
  finance_head_above_paise: 10000000,
};

const settings = {
  sample_audit_rate: 0.1,
  delegation_limit_days: 30,
  timezone: "Asia/Kolkata",
};

const rules = (hotelTier1Paise, changed) => [
  { code: "MEALS_DAILY_CAP", type: "Daily cap", applies_to: "Meals", limit_text: "₹1,500 per employee per day", outcome: "REJECT_LINE", forces_level: null, active: true },
  {
    code: "HOTEL_NIGHT_CAP",
    type: "Cap by city tier",
    applies_to: "Hotel",
    limit_text: changed
      ? `Tier 1 ₹${(hotelTier1Paise / 100).toLocaleString("en-IN")} (was ₹6,000), others ₹4,000 a night`
      : "Tier 1 ₹6,000, others ₹4,000 a night",
    outcome: "REJECT_LINE",
    forces_level: null,
    active: true,
    changed,
  },
  { code: "CAB_TRIP_CAP", type: "Per-line cap", applies_to: "Local cab", limit_text: "₹2,000 per trip", outcome: "REJECT_LINE", forces_level: null, active: true },
  { code: "RECEIPT_REQUIRED", type: "Receipt threshold", applies_to: "All categories", limit_text: "Receipt needed above ₹500", outcome: "REJECT_LINE", forces_level: null, active: true },
  { code: "DUPLICATE_LINE", type: "Duplicate match", applies_to: "All categories", limit_text: "Same vendor, amount, date, or same receipt file", outcome: "ROUTE_HIGH", forces_level: "AUDITOR", active: true },
  { code: "WEEKEND_SPEND", type: "Weekend flag", applies_to: "All categories", limit_text: "Saturday or Sunday", outcome: "FLAG", forces_level: null, active: true },
  { code: "SPLIT_SUSPECT", type: "Split window", applies_to: "Same vendor or category", limit_text: "Within 3 days, combined above a threshold", outcome: "ROUTE", forces_level: "AUDITOR", active: true },
  { code: "CLAIM_AGE_LIMIT", type: "Max age", applies_to: "All categories", limit_text: "60 days", outcome: "FLAG", forces_level: null, active: false },
];

export const POLICY_VERSIONS = [
  {
    id: "pv-12",
    version: 12,
    status: "ACTIVE",
    published_by: "Meera Iyer",
    published_at: "2026-11-20T09:00:00Z",
    limits: baseLimits,
    levels,
    settings,
    rules: rules(600000, false),
    changes: [],
  },
  {
    id: "pv-13",
    version: 13,
    status: "DRAFT",
    published_by: null,
    published_at: null,
    limits: { ...baseLimits, hotel_tier1_night_paise: 650000 },
    levels,
    settings,
    rules: rules(650000, true),
    changes: [{ rule: "HOTEL_NIGHT_CAP", field: "Tier-1 night cap", before_paise: 600000, after_paise: 650000 }],
  },
  {
    id: "pv-11",
    version: 11,
    status: "RETIRED",
    published_by: "Meera Iyer",
    published_at: "2026-09-02T09:00:00Z",
    limits: baseLimits,
    levels,
    settings,
    rules: rules(600000, false),
    changes: [],
  },
];
