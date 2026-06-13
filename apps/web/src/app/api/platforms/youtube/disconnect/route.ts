import { NextResponse } from "next/server";

import {
  ApiGatewayConfigurationError,
  callApiGatewayJson,
} from "@/lib/api-gateway";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Authentication is required to disconnect YouTube.",
      },
      { status: 401 },
    );
  }

  try {
    const result = await callApiGatewayJson({
      body: {
        user_id: data.user.id,
      },
      path: "/api/platforms/youtube/disconnect",
    });

    return NextResponse.json(result.data, { status: result.status });
  } catch (gatewayError) {
    if (gatewayError instanceof ApiGatewayConfigurationError) {
      return NextResponse.json(
        {
          error: "gateway_not_configured",
          message: gatewayError.message,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "youtube_disconnect_failed",
        message: "YouTube disconnect could not be sent to the API gateway.",
      },
      { status: 502 },
    );
  }
}
