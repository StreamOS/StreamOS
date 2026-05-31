import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { MoneyFormInput } from "@/hooks/useWorkspaceState";
import { euro } from "@/lib/format";
import type { MoneyEntry } from "@/types/streamos";

type MoneyViewProps = {
  entries: MoneyEntry[];
  onAdd: (input: MoneyFormInput) => void;
};

export function MoneyView({ entries, onAdd }: MoneyViewProps) {
  const total = entries.reduce((sum, item) => sum + Number(item.amount), 0);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    onAdd({
      source: String(data.source),
      amount: Number(data.amount),
      note: String(data.note)
    });
    event.currentTarget.reset();
  }

  return (
    <section className="view active">
      <div className="two-column">
        <article className="panel">
          <p className="eyebrow">Monetarisierungs-Dashboard</p>
          <h2>Einnahmen erfassen und MRR planen.</h2>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Quelle
              <select name="source">
                <option>Subs</option>
                <option>Bits</option>
                <option>Merch</option>
                <option>Sponsoring</option>
                <option>Memberships</option>
              </select>
            </label>
            <label>Betrag in Euro<input name="amount" type="number" min="1" step="1" defaultValue="29" /></label>
            <label className="full">Notiz<input name="note" placeholder="z.B. 5 neue Subs nach Collab Stream" /></label>
            <Button type="submit">Eintrag speichern</Button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h3>Revenue Mix</h3>
            <span className="tag">{euro(total)}</span>
          </div>
          <div className="money-list">
            {entries.map((item) => (
              <div className="money-row" key={item.id}>
                <div><strong>{item.source}</strong><small>{item.note}</small></div>
                <span>{euro(item.amount)}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
      <div className="pricing-grid">
        <article className="panel price-card"><span>Starter</span><strong>{euro(0)}</strong><p>3 Clips/Monat, Basic Analytics, 1 Branding Template.</p></article>
        <article className="panel price-card highlighted"><span>Creator Pro</span><strong>{euro(29)}</strong><p>Unbegrenzte Clips, StreamIQ, Branding Studio, Planner.</p></article>
        <article className="panel price-card"><span>Team / Agency</span><strong>{euro(99)}</strong><p>10 Creator, API-Zugang, Freigaben und Sponsoring CRM.</p></article>
      </div>
    </section>
  );
}
