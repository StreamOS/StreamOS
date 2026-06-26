import type {
  MonetizationRevenueBreakdownDimension,
  MonetizationSourceCategory,
} from "@streamos/types";

const EXACT_SOURCE_CATEGORY_MAP: Record<string, MonetizationSourceCategory> = {
  ad: "ads",
  ad_revenue: "ads",
  affiliate: "affiliate",
  bits: "platform_revenue",
  brand_campaign: "sponsorships",
  brand_deal_bonus: "sponsorships",
  channel_membership: "subscriptions",
  channel_subscription: "subscriptions",
  cheers: "platform_revenue",
  donation: "donations",
  gift_sub: "subscriptions",
  gifted_sub: "subscriptions",
  membership: "subscriptions",
  merch_sale: "merch",
  merch_store: "merch",
  monthly_sub: "subscriptions",
  other: "other",
  platform_revenue: "platform_revenue",
  prime_sub: "subscriptions",
  sponsorship: "sponsorships",
  stars: "platform_revenue",
  sub: "subscriptions",
  subscription: "subscriptions",
  super_chat: "platform_revenue",
  super_thanks: "platform_revenue",
  tier_1_sub: "subscriptions",
  tip: "donations",
};

const SOURCE_CATEGORY_PATTERNS: Array<{
  category: MonetizationSourceCategory;
  pattern: RegExp;
}> = [
  {
    category: "subscriptions",
    pattern: /(^|[_-])(sub|subscription|prime|member|membership)([_-]|$)/,
  },
  {
    category: "donations",
    pattern: /(^|[_-])(tip|tips|donation|donate|dono)([_-]|$)/,
  },
  {
    category: "sponsorships",
    pattern: /(^|[_-])(sponsor|brand|campaign|deal|partnership)([_-]|$)/,
  },
  {
    category: "merch",
    pattern: /(^|[_-])(merch|store|shop|sku|product|sale)([_-]|$)/,
  },
  {
    category: "ads",
    pattern: /(^|[_-])(ad|ads|advert|preroll|midroll)([_-]|$)/,
  },
  {
    category: "affiliate",
    pattern: /(^|[_-])(affiliate|referral|commission)([_-]|$)/,
  },
  {
    category: "platform_revenue",
    pattern: /(^|[_-])(bits|cheer|superchat|superthanks|stars)([_-]|$)/,
  },
];

const SUMMARY_CATEGORY_SOURCE_MAP: Record<string, MonetizationSourceCategory> =
  {
    ad_revenue: "ads",
    donation: "donations",
    merch_sale: "merch",
    sponsorship: "sponsorships",
    subscription: "subscriptions",
    tip: "donations",
  };

export function normalizeMonetizationSourceCategory(
  rawSource: string | null,
): MonetizationSourceCategory {
  const normalizedSource = normalizeSourceToken(rawSource);

  if (!normalizedSource) {
    return "unknown";
  }

  const exactCategory = EXACT_SOURCE_CATEGORY_MAP[normalizedSource];

  if (exactCategory) {
    return exactCategory;
  }

  for (const { category, pattern } of SOURCE_CATEGORY_PATTERNS) {
    if (pattern.test(normalizedSource)) {
      return category;
    }
  }

  if (
    normalizedSource === "other" ||
    normalizedSource.startsWith("other_") ||
    normalizedSource.includes("misc")
  ) {
    return "other";
  }

  return "unknown";
}

export function getMonetizationSourceCategoryLabel(
  category: MonetizationSourceCategory,
): string {
  switch (category) {
    case "ads":
      return "Ads";
    case "affiliate":
      return "Affiliate";
    case "donations":
      return "Donations";
    case "merch":
      return "Merch";
    case "other":
      return "Other";
    case "platform_revenue":
      return "Platform Revenue";
    case "sponsorships":
      return "Sponsorships";
    case "subscriptions":
      return "Subscriptions";
    case "unknown":
      return "Unknown";
  }
}

export function resolveBreakdownCategory({
  dimension,
  key,
  rawSource,
}: {
  dimension: MonetizationRevenueBreakdownDimension;
  key: string;
  rawSource: string | null;
}): MonetizationSourceCategory {
  if (dimension === "summary_category") {
    return SUMMARY_CATEGORY_SOURCE_MAP[key] ?? "unknown";
  }

  return normalizeMonetizationSourceCategory(rawSource);
}

function normalizeSourceToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : null;
}
