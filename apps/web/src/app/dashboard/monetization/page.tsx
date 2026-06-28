import React from "react";
import { MonetizationDashboardConsole } from "@/components/modules/MonetizationDashboardConsole";
import {
  getMonetizationDashboardData,
  parseMonetizationEventListView,
  parseMonetizationDashboardPeriod,
} from "./data";

export const dynamic = "force-dynamic";

type MonetizationPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MonetizationPage({
  searchParams,
}: MonetizationPageProps = {}) {
  const params = await searchParams;
  const selectedPeriod = parseMonetizationDashboardPeriod(
    typeof params?.period === "string" ? params.period : undefined,
  );
  const eventListView = parseMonetizationEventListView(params);
  const model = await getMonetizationDashboardData(
    selectedPeriod,
    eventListView,
  );

  return (
    <MonetizationDashboardConsole eventListView={eventListView} model={model} />
  );
}
