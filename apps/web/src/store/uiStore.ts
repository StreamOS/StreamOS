"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  incrementNotificationCount: () => void;
  notificationCount: number;
  sidebarCollapsed: boolean;
  setNotificationCount: (count: number) => void;
  toggleSidebar: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      incrementNotificationCount: () =>
        set((state) => ({ notificationCount: state.notificationCount + 1 })),
      notificationCount: 0,
      sidebarCollapsed: false,
      setNotificationCount: (count) =>
        set({ notificationCount: Math.max(0, count) }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    {
      name: "streamos-ui",
      partialize: (state) => ({
        notificationCount: state.notificationCount,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
