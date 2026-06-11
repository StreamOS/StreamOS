"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ViewerPoint } from "@/data/dashboard";

type ViewerChartProps = {
  data: ViewerPoint[];
};

export function ViewerChart({ data }: ViewerChartProps) {
  if (data.length === 0) {
    return (
      <section className="card">
        <h2 className="text-base font-semibold text-white">
          Live-Zuschauerverlauf
        </h2>
        <div className="mt-4 grid h-72 place-items-center rounded-lg border border-white/10 bg-white/5 text-sm text-slate-400">
          Noch keine Metrics-Snapshots verfuegbar.
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 className="text-base font-semibold text-white">
        Live-Zuschauerverlauf
      </h2>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="day" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip
              contentStyle={{
                background: "#11131a",
                border: "1px solid rgba(255,255,255,.1)",
                color: "#fff",
              }}
            />
            <Line
              type="monotone"
              dataKey="twitch"
              stroke="#9b5cff"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="youtube"
              stroke="#00d4aa"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="tiktok"
              stroke="#ff4e6a"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="kick"
              stroke="#f5c842"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
