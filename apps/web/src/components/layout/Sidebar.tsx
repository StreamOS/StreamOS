"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  DollarSign,
  Globe,
  Palette,
  RadioTower,
  TrendingUp,
} from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils/cn";
import { useUiStore } from "@/store/uiStore";

const navItems = [
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  { label: "Content", href: "/dashboard/content", icon: Clapperboard },
  { label: "Monetization", href: "/dashboard/monetization", icon: DollarSign },
  { label: "Growth", href: "/dashboard/growth", icon: TrendingUp },
  { label: "Branding", href: "/dashboard/branding", icon: Palette },
  { label: "Platforms", href: "/dashboard/platforms", icon: Globe },
] as const;

type SidebarProps = {
  creatorName?: string;
  creatorNiche?: string;
  signOutAction?: () => Promise<void>;
};

export function Sidebar({
  creatorName = "Demo Workspace",
  creatorNiche = "NovaPlays / Tactical FPS & Community Challenges",
  signOutAction,
}: SidebarProps) {
  const pathname = usePathname();
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--dashboard-sidebar-width",
      sidebarCollapsed ? "4rem" : "15rem",
    );
  }, [sidebarCollapsed]);

  return (
    <aside
      className={cn(
        "hidden border-r border-white/10 bg-surface-950/95 backdrop-blur transition-all duration-300 md:flex lg:fixed lg:inset-y-0 lg:left-0",
        sidebarCollapsed ? "lg:w-16" : "lg:w-60",
      )}
    >
      <div
        className={cn(
          "flex h-full w-full flex-col gap-6 py-6",
          sidebarCollapsed ? "px-3" : "px-5",
        )}
      >
        <div>
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center rounded-lg text-white transition hover:bg-white/5",
              sidebarCollapsed ? "justify-center p-1" : "gap-3 p-1",
            )}
            aria-label="StreamOS Dashboard"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-signal-green font-black text-white">
              S
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="text-xl font-semibold text-white">StreamOS</div>
                <div className="text-xs text-slate-400">Creator OS</div>
              </div>
            )}
          </Link>
          {!sidebarCollapsed && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-signal-green/20 bg-signal-green/10 px-3 py-1 text-xs font-medium text-signal-green">
              <RadioTower className="h-3.5 w-3.5" />
              Live ops ready
            </div>
          )}
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                title={sidebarCollapsed ? item.label : undefined}
                className={cn(
                  "flex min-h-10 items-center rounded-lg text-sm font-medium transition-colors",
                  sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3",
                  isActive
                    ? "bg-purple-50 text-purple-600 ring-1 ring-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:ring-purple-900"
                    : "text-slate-300 hover:bg-white/10 hover:text-white",
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive
                      ? "text-purple-600 dark:text-purple-300"
                      : "text-slate-400",
                  )}
                  aria-hidden="true"
                />
                {!sidebarCollapsed && (
                  <span className="truncate">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div
          className={cn(
            "mt-auto rounded-lg border border-white/10 bg-white/5",
            sidebarCollapsed ? "p-2" : "p-4",
          )}
        >
          {sidebarCollapsed ? (
            <div
              className="grid h-9 w-full place-items-center rounded-lg bg-white/10 text-sm font-semibold text-white"
              title={creatorName}
              aria-label={creatorName}
            >
              {creatorName.slice(0, 1).toUpperCase()}
            </div>
          ) : (
            <>
              <div className="truncate text-sm font-semibold text-white">
                {creatorName}
              </div>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-400">
                {creatorNiche}
              </p>
              {signOutAction && (
                <form action={signOutAction} className="mt-4">
                  <button className="btn-ghost w-full" type="submit">
                    Logout
                  </button>
                </form>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          className="grid min-h-10 w-full place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-label={
            sidebarCollapsed
              ? "Sidebar-Navigation erweitern"
              : "Sidebar-Navigation einklappen"
          }
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </aside>
  );
}
