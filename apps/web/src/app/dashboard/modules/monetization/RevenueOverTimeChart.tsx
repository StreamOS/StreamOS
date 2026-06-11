"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactMoney, formatMoney } from "./formatters";
import type { MonetizationTrendPoint } from "./types";

type RevenueOverTimeChartProps = {
  currency: string;
  data: MonetizationTrendPoint[];
};

export function RevenueOverTimeChart({
  currency,
  data,
}: RevenueOverTimeChartProps) {
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Umsatzverlauf
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Bestaetigter Umsatz pro Tag
          </h2>
        </div>
      </div>
      <div className="mt-5 h-72">
        {data.length === 0 ? (
          <div className="grid h-full place-items-center rounded-lg border border-white/10 bg-white/5 text-sm text-slate-400">
            Noch keine bestaetigten Umsatzereignisse im Zeitraum.
          </div>
        ) : (
          <ResponsiveContainer height="100%" width="100%">
            <AreaChart data={data}>
              <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} />
              <YAxis
                stroke="#94a3b8"
                tickFormatter={(value) =>
                  formatCompactMoney(Number(value), currency)
                }
                tickLine={false}
                width={72}
              />
              <Tooltip
                contentStyle={{
                  background: "#11131a",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: "8px",
                  color: "#fff",
                }}
                formatter={(value) => [
                  formatMoney(Number(value), currency),
                  "Umsatz",
                ]}
                labelStyle={{ color: "#cbd5e1" }}
              />
              <Area
                dataKey="amountCents"
                fill="rgba(0,212,170,.16)"
                stroke="#00d4aa"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
