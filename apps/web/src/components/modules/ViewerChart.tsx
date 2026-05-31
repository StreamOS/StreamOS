"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { day: "Mon", twitch: 4200, youtube: 2600 },
  { day: "Tue", twitch: 5100, youtube: 3100 },
  { day: "Wed", twitch: 4800, youtube: 3900 },
  { day: "Thu", twitch: 6200, youtube: 4400 },
  { day: "Fri", twitch: 7300, youtube: 5600 },
  { day: "Sat", twitch: 9100, youtube: 6900 },
  { day: "Sun", twitch: 8400, youtube: 7200 }
];

export function ViewerChart() {
  return (
    <section className="card">
      <h2 className="text-base font-semibold text-slate-950">Live viewer trend</h2>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="day" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Line type="monotone" dataKey="twitch" stroke="#2563eb" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="youtube" stroke="#059669" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
