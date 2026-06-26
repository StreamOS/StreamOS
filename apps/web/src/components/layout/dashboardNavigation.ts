import {
  BarChart2,
  Clapperboard,
  DollarSign,
  Globe,
  Palette,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type DashboardNavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  showInMobileBottomNav: boolean;
  showInMobileHeaderMenu: boolean;
};

export const dashboardNavItems: DashboardNavItem[] = [
  {
    href: "/dashboard/analytics",
    icon: BarChart2,
    label: "Analytics",
    showInMobileBottomNav: true,
    showInMobileHeaderMenu: true,
  },
  {
    href: "/dashboard/content",
    icon: Clapperboard,
    label: "Content",
    showInMobileBottomNav: true,
    showInMobileHeaderMenu: true,
  },
  {
    href: "/dashboard/monetization",
    icon: DollarSign,
    label: "Monetization",
    showInMobileBottomNav: true,
    showInMobileHeaderMenu: true,
  },
  {
    href: "/dashboard/growth",
    icon: TrendingUp,
    label: "Growth",
    showInMobileBottomNav: true,
    showInMobileHeaderMenu: true,
  },
  {
    href: "/dashboard/branding",
    icon: Palette,
    label: "Branding",
    showInMobileBottomNav: true,
    showInMobileHeaderMenu: true,
  },
  {
    href: "/dashboard/platforms",
    icon: Globe,
    label: "Platforms",
    showInMobileBottomNav: false,
    showInMobileHeaderMenu: true,
  },
];

export const mobileBottomNavItems = dashboardNavItems.filter(
  (item) => item.showInMobileBottomNav,
);

export const mobileHeaderNavItems = dashboardNavItems.filter(
  (item) => item.showInMobileHeaderMenu,
);

export function getDashboardPageLabel(pathname: string): string {
  if (pathname === "/dashboard") {
    return "Command Center";
  }

  return (
    dashboardNavItems.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? "Dashboard"
  );
}
