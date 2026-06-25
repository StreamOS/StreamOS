import React from "react";
import { CreatorGrowthIntelligenceConsole } from "@/components/modules/CreatorGrowthIntelligenceConsole";
import { getCreatorGrowthIntelligenceDashboardData } from "./data";

export const dynamic = "force-dynamic";

export default async function GrowthPage() {
  const model = await getCreatorGrowthIntelligenceDashboardData();

  return <CreatorGrowthIntelligenceConsole model={model} />;
}
