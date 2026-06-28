import React from "react";
import { ContentPerformanceAnalyticsConsole } from "@/components/modules/ContentPerformanceAnalyticsConsole";
import {
  getContentPerformanceAnalyticsDashboardData,
  parseContentPerformanceAnalyticsDetailId,
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
  const selectedDetailId = parseContentPerformanceAnalyticsDetailId(
    typeof params?.detail === "string" ? params.detail : undefined,
  );
  const model = await getContentPerformanceAnalyticsDashboardData(
    selectedPeriod,
    selectedDetailId,
  );

  return <ContentPerformanceAnalyticsConsole model={model} />;
}
