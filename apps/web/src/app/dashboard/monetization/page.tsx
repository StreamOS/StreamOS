import React from "react";
import { MonetizationDashboardConsole } from "@/components/modules/MonetizationDashboardConsole";
import {
  getMonetizationDashboardData,
  parseMonetizationDashboardPeriod,
} from "./data";

export const dynamic = "force-dynamic";

type MonetizationPageProps = {
  searchParams?: Promise<{
    period?: string;
  }>;
};

export default async function MonetizationPage({
  searchParams,
}: MonetizationPageProps = {}) {
  const params = await searchParams;
  const selectedPeriod = parseMonetizationDashboardPeriod(params?.period);
  const model = await getMonetizationDashboardData(selectedPeriod);

  return <MonetizationDashboardConsole model={model} />;
}
