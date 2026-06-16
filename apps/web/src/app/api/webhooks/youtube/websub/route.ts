import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "gone",
      message:
        "YouTube WebSub callbacks are owned by the Railway API Gateway runtime.",
    },
    { status: 410 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: "gone",
      message:
        "YouTube WebSub callbacks are owned by the Railway API Gateway runtime.",
    },
    { status: 410 },
  );
}
