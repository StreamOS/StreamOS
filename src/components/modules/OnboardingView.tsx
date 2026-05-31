import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { CreatorProfile } from "@/types/streamos";

type OnboardingViewProps = {
  profile: CreatorProfile;
  onSave: (profile: CreatorProfile) => void;
};

export function OnboardingView({ profile, onSave }: OnboardingViewProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    onSave({
      creatorName: String(data.creatorName),
      niche: String(data.niche),
      goal: String(data.goal),
      weeklyHours: Number(data.weeklyHours),
      positioning: String(data.positioning)
    });
  }

  return (
    <section className="view active">
      <div className="two-column">
        <article className="panel">
          <p className="eyebrow">Onboarding Flow</p>
          <h2>Profil, Ziele und Positionierung erfassen.</h2>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>Creator Name<input name="creatorName" required defaultValue={profile.creatorName} placeholder="z.B. NovaPlays" /></label>
            <label>Hauptnische<input name="niche" required defaultValue={profile.niche} placeholder="z.B. Tactical FPS, Cozy Gaming" /></label>
            <label>
              Wachstumsziel
              <select name="goal" defaultValue={profile.goal}>
                <option>Mehr Zuschauer</option>
                <option>Mehr Umsatz</option>
                <option>Mehr Clips</option>
                <option>Bessere Marke</option>
              </select>
            </label>
            <label>Wochenstunden<input name="weeklyHours" type="number" min="1" max="80" defaultValue={profile.weeklyHours} /></label>
            <label className="full">
              Kanalpositionierung
              <textarea name="positioning" rows={4} defaultValue={profile.positioning} placeholder="Wofuer soll dein Kanal bekannt sein?" />
            </label>
            <Button type="submit">Profil speichern</Button>
          </form>
        </article>

        <article className="panel">
          <p className="eyebrow">Phase 1 / Phase 2 Referenz</p>
          <h3>Architektur-Zielbild</h3>
          <ul className="check-list">
            <li>Phase 1: Auth, Supabase, Dashboard, Store und Grundlayout.</li>
            <li>Phase 2: Settings, OAuth, Onboarding und Error Boundary.</li>
            <li>Dieses MVP simuliert diese Flows lokal, bis echte Keys und Backend stehen.</li>
            <li>Naechster Produktionsschritt: Next.js + Supabase Migrationen.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
