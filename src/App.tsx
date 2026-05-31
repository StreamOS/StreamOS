import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AnalyticsView } from "@/components/modules/AnalyticsView";
import { BrandingView } from "@/components/modules/BrandingView";
import { ClipsView } from "@/components/modules/ClipsView";
import { DashboardView } from "@/components/modules/DashboardView";
import { MoneyView } from "@/components/modules/MoneyView";
import { OnboardingView } from "@/components/modules/OnboardingView";
import { PlannerView } from "@/components/modules/PlannerView";
import { PlatformsView } from "@/components/modules/PlatformsView";
import { SettingsView } from "@/components/modules/SettingsView";
import { toRouteId, useWorkspaceState } from "@/hooks/useWorkspaceState";

export function App() {
  const { state, scores, route, toast, setRoute, actions } = useWorkspaceState();

  useEffect(() => {
    function handleHashChange() {
      setRoute(toRouteId(window.location.hash.replace("#", "")));
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [setRoute]);

  return (
    <AppShell
      state={state}
      scores={scores}
      route={route}
      toast={toast}
      onRouteChange={setRoute}
      onExport={actions.exportData}
      onAudit={actions.runAudit}
    >
      {route === "dashboard" && (
        <DashboardView state={state} scores={scores} onJump={setRoute} onSimulateEvent={actions.simulateEvent} />
      )}
      {route === "onboarding" && <OnboardingView profile={state.profile} onSave={actions.saveProfile} />}
      {route === "platforms" && <PlatformsView platforms={state.platforms} onToggle={actions.togglePlatform} />}
      {route === "clips" && <ClipsView clips={state.clips} onGenerate={actions.generateClips} onClear={actions.clearClips} />}
      {route === "analytics" && <AnalyticsView state={state} scores={scores} onRangeChange={actions.setRange} />}
      {route === "money" && <MoneyView entries={state.money} onAdd={actions.addMoneyEntry} />}
      {route === "branding" && <BrandingView brand={state.brand} onUpdate={actions.updateBrand} />}
      {route === "planner" && <PlannerView plan={state.plan} onGenerate={actions.generatePlan} />}
      {route === "settings" && <SettingsView onSeed={actions.seedDemo} onReset={actions.resetData} />}
    </AppShell>
  );
}
