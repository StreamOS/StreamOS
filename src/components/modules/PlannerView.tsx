import { Button } from "@/components/ui/Button";
import type { PlannerDay } from "@/types/streamos";

type PlannerViewProps = {
  plan: PlannerDay[];
  onGenerate: () => void;
};

export function PlannerView({ plan, onGenerate }: PlannerViewProps) {
  return (
    <section className="view active">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Stream Planner & Burnout-Schutz</p>
            <h2>Wochenplan aus Ziel, Zeit und Content-Druck.</h2>
          </div>
          <Button compact onClick={onGenerate}>Plan optimieren</Button>
        </div>
        <div className="calendar-board">
          {plan.map((day) => (
            <div className={`day ${day.tone}`} key={day.day}>
              <b>{day.day}</b>
              <span>{day.type}</span>
              <small>{day.detail}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
