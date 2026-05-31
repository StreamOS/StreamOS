import type { CSSProperties, FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { BrandFormInput } from "@/hooks/useWorkspaceState";
import type { BrandKit } from "@/types/streamos";

type BrandingViewProps = {
  brand: BrandKit;
  onUpdate: (input: BrandFormInput) => void;
};

export function BrandingView({ brand, onUpdate }: BrandingViewProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    onUpdate({
      style: String(data.style),
      color: String(data.color),
      vibe: String(data.vibe)
    });
  }

  return (
    <section className="view active">
      <div className="two-column">
        <article className="panel">
          <p className="eyebrow">AI Branding Studio</p>
          <h2>Overlay, Farben und Tagline generieren.</h2>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Stil
              <select name="style">
                <option>Neon Tactical</option>
                <option>Cozy Creator</option>
                <option>Esports Premium</option>
                <option>Retro Arcade</option>
              </select>
            </label>
            <label>Hauptfarbe<input name="color" type="color" defaultValue={brand.colors[0]} /></label>
            <label className="full">Kanal-Vibe<input name="vibe" placeholder="schnell, direkt, kompetitiv, aber freundlich" /></label>
            <Button type="submit">Brand Kit generieren</Button>
          </form>
        </article>

        <article className="brand-lab panel">
          <div className="palette">
            {brand.colors.map((color) => (
              <span key={color} style={{ "--swatch": color } as CSSProperties} />
            ))}
          </div>
          <div className="overlay-preview" style={{ "--brand-main": brand.colors[0] } as CSSProperties}>
            <strong>{brand.title}</strong>
            <p>{brand.subtitle}</p>
          </div>
        </article>
      </div>
    </section>
  );
}
