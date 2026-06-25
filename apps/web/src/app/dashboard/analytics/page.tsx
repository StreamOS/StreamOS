import React from "react";
import { ContentPerformanceAnalyticsConsole } from "@/components/modules/ContentPerformanceAnalyticsConsole";
import { getContentPerformanceAnalyticsDashboardData } from "./data";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const model = await getContentPerformanceAnalyticsDashboardData();

  return <ContentPerformanceAnalyticsConsole model={model} />;
}
