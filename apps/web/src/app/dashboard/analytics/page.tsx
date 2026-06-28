import React from "react";
import { ContentPerformanceAnalyticsConsole } from "@/components/modules/ContentPerformanceAnalyticsConsole";
import {
  getContentPerformanceAnalyticsDashboardData,
  parseContentPerformanceAnalyticsPeriod,
} from "./data";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps = {}) {
  const params = await searchParams;
  const selectedPeriod = parseContentPerformanceAnalyticsPeriod(
    typeof params?.period === "string" ? params.period : undefined,
  );
  const model =
    await getContentPerformanceAnalyticsDashboardData(selectedPeriod);

  return <ContentPerformanceAnalyticsConsole model={model} />;
}
