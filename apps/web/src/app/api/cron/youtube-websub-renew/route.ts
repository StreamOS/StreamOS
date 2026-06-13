import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "gone",
      message:
        "YouTube WebSub renewal is owned by the Railway API Gateway runtime.",
    },
    { status: 410 },
  );
}
