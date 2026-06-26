import React from "react";
import { BrandingDashboardConsole } from "@/components/modules/BrandingDashboardConsole";
import { getBrandingDashboardData } from "./data";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const model = await getBrandingDashboardData();

  return <BrandingDashboardConsole model={model} />;
}
