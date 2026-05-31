import type { CSSProperties } from "react";
import type { BarDatum, WorkspaceState } from "@/types/streamos";

type BarChartProps = {
  data: BarDatum[];
  maxValue?: number;
  compact?: boolean;
};

export function BarChart({ data, maxValue = Math.max(...data.map((item) => item.value)), compact = false }: BarChartProps) {
  return (
    <div className={`bar-chart ${compact ? "compact-chart" : ""}`.trim()}>
      {data.map((item) => (
        <div className="bar-row" key={item.label}>
          <strong>{item.label}</strong>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                "--value": `${(item.value / maxValue) * 100}%`,
                "--color": item.color
              } as CSSProperties}
            />
          </div>
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

type LineChartProps = {
  range: WorkspaceState["range"];
  moneyCount: number;
};

export function LineChart({ range, moneyCount }: LineChartProps) {
  const labelCount = range === 7 ? 7 : range === 30 ? 10 : 12;
  const viewers = Array.from({ length: labelCount }, (_, index) => 400 + index * (range * 9) + Math.round(Math.sin(index) * 120));
  const revenue = Array.from({ length: labelCount }, (_, index) => 500 + index * (range * 17) + moneyCount * 90);

  return (
    <div className="line-chart" aria-label="Nutzer und Umsatz Prognose">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Viewer und Umsatz Entwicklung">
        <polyline points={points(viewers)} fill="none" stroke="#9b5cff" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        <polyline points={points(revenue, -4)} fill="none" stroke="#00d4aa" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function points(items: number[], offset = 2): string {
  const max = Math.max(...items);

  return items
    .map((value, index) => {
      const x = items.length === 1 ? 0 : (index / (items.length - 1)) * 100;
      const y = 92 - (value / max) * 74 + offset;
      return `${x},${Math.max(8, Math.min(92, y))}`;
    })
    .join(" ");
}
