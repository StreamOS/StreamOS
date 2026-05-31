import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import type { RouteId, ScoreSummary, WorkspaceState } from "@/types/streamos";

const navItems: { route: RouteId; label: string }[] = [
  { route: "dashboard", label: "Dashboard" },
  { route: "onboarding", label: "Onboarding" },
  { route: "platforms", label: "Plattformen" },
  { route: "clips", label: "Clip Engine" },
  { route: "analytics", label: "StreamIQ" },
  { route: "money", label: "Monetarisierung" },
  { route: "branding", label: "Branding" },
  { route: "planner", label: "Planner" },
  { route: "settings", label: "Settings" }
];

const titles: Record<RouteId, string> = {
  dashboard: "StreamOS Command Center",
  onboarding: "Creator Onboarding",
  platforms: "Multi-Plattform Management",
  clips: "AI Clip Engine",
  analytics: "StreamIQ Analytics",
  money: "Monetarisierungs-Dashboard",
  branding: "AI Branding Studio",
  planner: "Planner & Burnout-Schutz",
  settings: "Settings"
};

type AppShellProps = {
  state: WorkspaceState;
  scores: ScoreSummary;
  route: RouteId;
  toast: string;
  onRouteChange: (route: RouteId) => void;
  onExport: () => void;
  onAudit: () => void;
  children: ReactNode;
};

export function AppShell({ state, route, toast, onRouteChange, onExport, onAudit, children }: AppShellProps) {
  function handleRouteChange(nextRoute: RouteId) {
    window.location.hash = nextRoute;
    onRouteChange(nextRoute);
  }

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar" aria-label="StreamOS Navigation">
          <a className="brand" href="#dashboard" aria-label="StreamOS Dashboard" onClick={() => handleRouteChange("dashboard")}>
            <span className="brand-mark">S</span>
            <span>
              <strong>StreamOS</strong>
              <small>Creator OS</small>
            </span>
          </a>

          <nav className="nav-list">
            {navItems.map((item, index) => (
              <a
                className={`nav-item ${route === item.route ? "active" : ""}`}
                href={`#${item.route}`}
                key={item.route}
                onClick={() => handleRouteChange(item.route)}
              >
                <span className="nav-icon">{String(index + 1).padStart(2, "0")}</span>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="sync-panel">
            <div className="sync-row">
              <span className="live-dot" />
              <strong>Demo Workspace</strong>
            </div>
            <p>{state.profile.creatorName} / {state.profile.niche}</p>
          </div>
        </aside>

        <main className="workspace">
          <header className="topbar">
            <div>
              <p className="eyebrow">Streamer Operating System</p>
              <h1>{titles[route]}</h1>
            </div>
            <div className="topbar-actions">
              <Button variant="ghost" onClick={onExport}>Daten exportieren</Button>
              <Button onClick={onAudit}>AI Audit starten</Button>
            </div>
          </header>
          {children}
        </main>
      </div>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  );
}
