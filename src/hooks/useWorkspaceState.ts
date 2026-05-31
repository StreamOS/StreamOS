import { useEffect, useMemo, useState } from "react";
import { defaultWorkspace } from "@/data/defaultWorkspace";
import { nowTime } from "@/lib/format";
import { getScores } from "@/lib/scoring";
import {
  loadWorkspaceState,
  resetWorkspaceState,
  saveWorkspaceState,
  seedWorkspaceState
} from "@/lib/storage";
import type { CreatorProfile, PlannerDay, RouteId, WorkspaceState } from "@/types/streamos";

export type WorkspaceActions = {
  exportData: () => void;
  runAudit: () => void;
  saveProfile: (profile: CreatorProfile) => void;
  togglePlatform: (index: number) => void;
  generateClips: (input: ClipFormInput) => void;
  clearClips: () => void;
  addMoneyEntry: (input: MoneyFormInput) => void;
  updateBrand: (input: BrandFormInput) => void;
  setRange: (range: WorkspaceState["range"]) => void;
  generatePlan: () => void;
  simulateEvent: () => void;
  seedDemo: () => void;
  resetData: () => void;
  setToast: (message: string) => void;
};

export type ClipFormInput = {
  vodUrl: string;
  streamTitle: string;
  category: string;
  duration: number;
  chatEnergy: "hoch" | "mittel" | "niedrig";
};

export type MoneyFormInput = {
  source: string;
  amount: number;
  note: string;
};

export type BrandFormInput = {
  style: string;
  color: string;
  vibe: string;
};

export function useWorkspaceState() {
  const [state, setState] = useState<WorkspaceState>(() => loadWorkspaceState());
  const [route, setRoute] = useState<RouteId>(() => getInitialRoute());
  const [toast, setToast] = useState("");

  useEffect(() => {
    saveWorkspaceState(state);
  }, [state]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const scores = useMemo(() => getScores(state), [state]);

  const actions: WorkspaceActions = {
    exportData() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "streamos-workspace.json";
      link.click();
      URL.revokeObjectURL(url);
    },
    runAudit() {
      setToast("AI Audit abgeschlossen: Clips, Umsatz, Branding und Planner aktualisiert.");
    },
    saveProfile(profile) {
      setState((current) => ({ ...current, profile }));
      setToast("Profil gespeichert. StreamOS Empfehlungen wurden aktualisiert.");
    },
    togglePlatform(index) {
      setState((current) => {
        const platforms = current.platforms.map((platform, platformIndex) => {
          if (platformIndex !== index) {
            return platform;
          }

          const connected = !platform.connected;
          return {
            ...platform,
            connected,
            status: connected ? "Demo OAuth verbunden" : "OAuth offen"
          };
        });

        const platform = platforms[index];
        return {
          ...current,
          platforms,
          events: [
            {
              id: Date.now(),
              type: "platform.update",
              text: `${platform.name} ${platform.connected ? "verbunden" : "getrennt"}`,
              time: nowTime()
            },
            ...current.events
          ]
        };
      });
    },
    generateClips(input) {
      const baseScore = input.chatEnergy === "hoch" ? 88 : input.chatEnergy === "mittel" ? 78 : 68;
      const titles = ["Opening Hook", "Chat Peak", "Comeback Moment", "Reaction Clip", "Final Push"];
      const generated = titles.map((title, index) => ({
        id: Date.now() + index,
        title: `${title}: ${input.streamTitle}`,
        platform: index % 2 === 0 ? "TikTok + Shorts" : "Reels + Twitch",
        score: Math.min(98, baseScore + Math.round(Math.random() * 9) - index),
        status: index < 2 ? "bereit" : "geplant",
        hook: `${input.category || "Stream"} Moment bei Minute ${Math.round(
          (Number(input.duration) / 6) * (index + 1)
        )}`
      }));

      setState((current) => ({
        ...current,
        clips: [...generated, ...current.clips].slice(0, 12),
        events: [
          {
            id: Date.now(),
            type: "clip.created",
            text: `${generated.length} neue Clip-Kandidaten erkannt`,
            time: nowTime()
          },
          ...current.events
        ]
      }));
      setToast("VOD analysiert. Clip-Kandidaten wurden erzeugt.");
    },
    clearClips() {
      setState((current) => ({ ...current, clips: [] }));
    },
    addMoneyEntry(input) {
      setState((current) => ({
        ...current,
        money: [
          {
            id: Date.now(),
            source: input.source,
            amount: Number(input.amount),
            note: input.note || "Manueller Eintrag"
          },
          ...current.money
        ]
      }));
      setToast("Monetarisierungs-Eintrag gespeichert.");
    },
    updateBrand(input) {
      setState((current) => ({
        ...current,
        brand: {
          title: `${current.profile.creatorName} Live`,
          subtitle: `${input.style} / ${input.vibe || "creator-first"} / export ready`,
          colors: [input.color, "#00d4aa", "#ff4e6a", "#f5c842"]
        }
      }));
      setToast("Brand Kit generiert.");
    },
    setRange(range) {
      setState((current) => ({ ...current, range }));
    },
    generatePlan() {
      setState((current) => {
        const highLoad = Number(current.profile.weeklyHours) > 25 || current.clips.length > 8;
        const plan: PlannerDay[] = [
          { day: "Mo", type: "Stream", detail: current.profile.niche.split("&")[0].trim(), tone: "active" },
          { day: "Di", type: "Clips", detail: "Batch Export", tone: "" },
          { day: "Mi", type: highLoad ? "Rest" : "Edit", detail: highLoad ? "Recovery" : "Shorts", tone: highLoad ? "rest" : "" },
          { day: "Do", type: "Stream", detail: "Community", tone: "active" },
          { day: "Fr", type: "Money", detail: "Sponsor Pitch", tone: "" },
          { day: "Sa", type: "Rest", detail: "Offline", tone: "rest" },
          { day: "So", type: "Review", detail: "StreamIQ", tone: "" }
        ];

        return { ...current, plan };
      });
      setToast("Wochenplan optimiert.");
    },
    simulateEvent() {
      const events = [
        ["channel.follow", "Neue Follower-Welle nach Shorts Upload"],
        ["channel.subscribe", "3 neue Subs im Live-Block"],
        ["channel.raid", "Raid erkannt: Community Peak moeglich"],
        ["channel.update", "Titel-Update mit besserem Keyword gespeichert"]
      ] as const;
      const event = events[Math.floor(Math.random() * events.length)];

      setState((current) => ({
        ...current,
        events: [{ id: Date.now(), type: event[0], text: event[1], time: nowTime() }, ...current.events]
      }));
    },
    seedDemo() {
      setState(seedWorkspaceState());
      setToast("Demo-Daten neu geladen.");
    },
    resetData() {
      if (!window.confirm("Lokale StreamOS Demo-Daten wirklich loeschen?")) {
        return;
      }

      setState(resetWorkspaceState());
      setToast("Lokale Daten geloescht. Demo-Zustand wiederhergestellt.");
    },
    setToast
  };

  return {
    state,
    scores,
    route,
    toast,
    setRoute,
    actions
  };
}

export function toRouteId(value: string): RouteId {
  const candidate = value as RouteId;
  const routes: RouteId[] = [
    "dashboard",
    "onboarding",
    "platforms",
    "clips",
    "analytics",
    "money",
    "branding",
    "planner",
    "settings"
  ];

  return routes.includes(candidate) ? candidate : "dashboard";
}

function getInitialRoute(): RouteId {
  return toRouteId(window.location.hash.replace("#", ""));
}

export { defaultWorkspace };
