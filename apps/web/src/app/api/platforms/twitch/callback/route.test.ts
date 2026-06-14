import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("GET /api/platforms/twitch/callback", () => {
  it("returns 410 Gone after the gateway migration", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://localhost/api/platforms/twitch/callback"),
    );
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toBe(
      "http://localhost/dashboard/platforms?platform=twitch&error=gateway-owned-oauth",
    );
  });
});
