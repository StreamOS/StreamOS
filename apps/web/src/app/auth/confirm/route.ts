import { type NextRequest } from "next/server";
import { handleEmailConfirmation } from "@/lib/auth/callback";

export async function GET(request: NextRequest) {
  return handleEmailConfirmation(request);
}
