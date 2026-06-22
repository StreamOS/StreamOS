"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

function subscribeToMountedState() {
  return () => {};
}

function getMountedSnapshot() {
  return true;
}

function getServerMountedSnapshot() {
  return false;
}

export function DarkModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToMountedState,
    getMountedSnapshot,
    getServerMountedSnapshot,
  );
  const isDark = resolvedTheme !== "light";

  return (
    <button
      type="button"
      className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
      disabled={!mounted}
    >
      {isDark ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
