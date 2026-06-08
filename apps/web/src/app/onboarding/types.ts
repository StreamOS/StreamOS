import type { CreatorPrimaryLanguage } from "@streamos/types";

export const onboardingSteps = [
  { href: "/onboarding/profile", id: 1, label: "Profil" },
  { href: "/onboarding/platforms", id: 2, label: "Plattformen" },
  { href: "/onboarding/complete", id: 3, label: "Los geht's" },
] as const;

export const primaryLanguageOptions: Array<{
  label: string;
  value: CreatorPrimaryLanguage;
}> = [
  { label: "Deutsch", value: "DE" },
  { label: "Englisch", value: "EN" },
  { label: "Andere", value: "Other" },
];

export type OnboardingActionState = {
  fieldErrors?: Partial<
    Record<"avatarUrl" | "bio" | "displayName" | "primaryLanguage", string>
  >;
  formError?: string;
};
