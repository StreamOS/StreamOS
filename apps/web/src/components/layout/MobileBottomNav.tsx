"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Clapperboard,
  DollarSign,
  Palette,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const mobileNavItems = [
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/content", label: "Content", icon: Clapperboard },
  { href: "/dashboard/monetization", label: "Monetization", icon: DollarSign },
  {
    href: "/dashboard/discoverability",
    label: "Discoverability",
    icon: Search,
  },
  { href: "/dashboard/branding", label: "Branding", icon: Palette },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-surface-950/95 px-2 pt-2 shadow-[0_-18px_60px_rgba(0,0,0,0.35)] backdrop-blur md:hidden pb-safe"
      aria-label="Mobile Dashboard Navigation"
    >
      <div className="grid grid-cols-5 gap-1">
        {mobileNavItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[9px] font-semibold transition-colors",
                isActive
                  ? "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-300"
                  : "text-slate-400 hover:bg-white/10 hover:text-white",
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  isActive
                    ? "text-purple-600 dark:text-purple-300"
                    : "text-slate-400",
                )}
                aria-hidden="true"
              />
              <span className="max-w-full truncate leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
