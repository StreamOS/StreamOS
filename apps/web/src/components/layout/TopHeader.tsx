"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  LogOut,
  Menu,
  Settings,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDashboardPageLabel,
  mobileHeaderNavItems,
} from "@/components/layout/dashboardNavigation";
import { DarkModeToggle } from "@/components/layout/DarkModeToggle";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { useUiStore } from "@/store/uiStore";

type PlanName = "Free" | "Pro" | "Business";

type NotificationType =
  | "clip_ready"
  | "monetization_event"
  | "platform_error"
  | "stream_live";

type DashboardNotification = {
  createdAt: string;
  id: string;
  message: string;
  read: boolean;
  title: string;
  type: NotificationType;
};

type NotificationPayload = {
  created_at?: string;
  id?: string;
  message?: string;
  read?: boolean;
  title?: string;
  type?: NotificationType;
};

type TopHeaderProps = {
  avatarUrl?: string | null;
  displayName: string;
  plan?: PlanName;
  signOutAction?: () => Promise<void>;
  userEmail: string | null;
  userId: string;
};

const notificationLabels: Record<NotificationType, string> = {
  clip_ready: "Clip",
  monetization_event: "Revenue",
  platform_error: "Platform",
  stream_live: "Live",
};

export function TopHeader({
  avatarUrl = null,
  displayName,
  plan = "Free",
  signOutAction,
  userEmail,
  userId,
}: TopHeaderProps) {
  const pathname = usePathname();
  const notificationCount = useUiStore((state) => state.notificationCount);
  const incrementNotificationCount = useUiStore(
    (state) => state.incrementNotificationCount,
  );
  const setNotificationCount = useUiStore(
    (state) => state.setNotificationCount,
  );
  const [notifications, setNotifications] = useState<DashboardNotification[]>(
    [],
  );
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const currentPage = useMemo(
    () => getDashboardPageLabel(pathname),
    [pathname],
  );
  const initials = useMemo(
    () => getInitials(displayName, userEmail),
    [displayName, userEmail],
  );

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (!notificationsRef.current?.contains(target)) {
        setNotificationsOpen(false);
      }

      if (!userMenuRef.current?.contains(target)) {
        setUserMenuOpen(false);
      }

      if (!mobileMenuRef.current?.contains(target)) {
        setMobileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentClick);

    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  useEffect(() => {
    try {
      const supabase = createClient();
      const channel = supabase
        .channel(`notifications:${userId}`)
        .on("broadcast", { event: "notification" }, (payload) => {
          const notification = normalizeNotification(payload.payload);

          setNotifications((current) => [notification, ...current].slice(0, 5));
          incrementNotificationCount();
        })
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      return () => {};
    }
  }, [incrementNotificationCount, userId]);

  function markAllRead() {
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, read: true })),
    );
    setNotificationCount(0);
  }

  const badgeLabel = notificationCount > 9 ? "9+" : String(notificationCount);

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-white/10 bg-surface-950/90 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative md:hidden" ref={mobileMenuRef}>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-expanded={mobileMenuOpen}
              aria-label="Dashboard-Navigation oeffnen"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            {mobileMenuOpen && (
              <div className="absolute left-0 top-12 w-64 rounded-lg border border-white/10 bg-surface-900 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
                <MobileHeaderMenuLinks
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Dashboard
            </p>
            <h1 className="truncate text-lg font-semibold text-white">
              {currentPage}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DarkModeToggle />

          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              className="relative grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              onClick={() => setNotificationsOpen((open) => !open)}
              aria-expanded={notificationsOpen}
              aria-label="Notifications anzeigen"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              {notificationCount > 0 && (
                <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-signal-red px-1 text-[10px] font-bold text-white">
                  {badgeLabel}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <NotificationsDropdown
                notifications={notifications}
                onMarkAllRead={markAllRead}
              />
            )}
          </div>

          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 pl-1 pr-2 text-left transition hover:bg-white/10"
              onClick={() => setUserMenuOpen((open) => !open)}
              aria-expanded={userMenuOpen}
              aria-label="User-Menue oeffnen"
            >
              <Avatar
                avatarUrl={avatarUrl}
                displayName={displayName}
                initials={initials}
              />
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {userMenuOpen && (
              <UserDropdown
                displayName={displayName}
                plan={plan}
                signOutAction={signOutAction}
                userEmail={userEmail}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export function MobileHeaderMenuLinks({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return mobileHeaderNavItems.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
      onClick={onNavigate}
    >
      <item.icon className="h-4 w-4" aria-hidden="true" />
      {item.label}
    </Link>
  ));
}

function NotificationsDropdown({
  notifications,
  onMarkAllRead,
}: {
  notifications: DashboardNotification[];
  onMarkAllRead: () => void;
}) {
  return (
    <div className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-white/10 bg-surface-900 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3">
        <div>
          <p className="text-sm font-semibold text-white">Notifications</p>
          <p className="text-xs text-slate-400">Letzte StreamOS Events</p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
          onClick={onMarkAllRead}
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Alle gelesen
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {notifications.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
            Keine neuen Notifications.
          </div>
        ) : (
          notifications.slice(0, 5).map((notification) => (
            <article
              className={cn(
                "rounded-lg border p-3",
                notification.read
                  ? "border-white/10 bg-white/5"
                  : "border-purple-500/30 bg-purple-500/10",
              )}
              key={notification.id}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                  {notificationLabels[notification.type]}
                </span>
                <time className="text-[11px] text-slate-500">
                  {formatRelativeTime(notification.createdAt)}
                </time>
              </div>
              <h2 className="mt-2 text-sm font-semibold text-white">
                {notification.title}
              </h2>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                {notification.message}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function UserDropdown({
  displayName,
  plan,
  signOutAction,
  userEmail,
}: {
  displayName: string;
  plan: PlanName;
  signOutAction?: () => Promise<void>;
  userEmail: string | null;
}) {
  return (
    <div className="absolute right-0 top-12 w-72 rounded-lg border border-white/10 bg-surface-900 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
      <div className="border-b border-white/10 pb-3">
        <p className="truncate text-sm font-semibold text-white">
          {displayName}
        </p>
        <p className="mt-1 truncate text-xs text-slate-400">
          {userEmail ?? "Keine Email hinterlegt"}
        </p>
        <span className="mt-2 inline-flex rounded-full border border-signal-green/20 bg-signal-green/10 px-2 py-0.5 text-xs font-semibold text-signal-green">
          {plan}
        </span>
      </div>
      <div className="mt-3 space-y-1">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          Einstellungen
        </Link>
        {signOutAction && (
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Logout
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Avatar({
  avatarUrl,
  displayName,
  initials,
}: {
  avatarUrl: string | null;
  displayName: string;
  initials: string;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={displayName}
        width={32}
        height={32}
        sizes="32px"
        unoptimized
        className="h-8 w-8 rounded-lg object-cover"
      />
    );
  }

  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-signal-green text-xs font-black text-white">
      {initials}
    </span>
  );
}

function getInitials(displayName: string, email: string | null): string {
  const source = displayName.trim() || email?.split("@")[0] || "StreamOS";
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "SO";
  }

  return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? "O"}`.toUpperCase();
}

function normalizeNotification(payload: unknown): DashboardNotification {
  const data = isNotificationPayload(payload) ? payload : {};
  const createdAt = data.created_at ?? new Date().toISOString();
  const type = isNotificationType(data.type) ? data.type : "stream_live";

  return {
    createdAt,
    id: data.id ?? `${type}-${createdAt}`,
    message: data.message ?? "StreamOS hat ein neues Dashboard-Event erkannt.",
    read: data.read ?? false,
    title: data.title ?? "Neues Event",
    type,
  };
}

function isNotificationPayload(
  payload: unknown,
): payload is NotificationPayload {
  return typeof payload === "object" && payload !== null;
}

function isNotificationType(value: unknown): value is NotificationType {
  return (
    value === "clip_ready" ||
    value === "monetization_event" ||
    value === "platform_error" ||
    value === "stream_live"
  );
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime();
  const diffMs = Date.now() - timestamp;

  if (!Number.isFinite(timestamp) || diffMs < 0) {
    return "gerade";
  }

  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return "gerade";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
}
