import { describe, expect, it } from "vitest";

describe("GET /api/platforms/twitch/callback", () => {
  it("returns 410 Gone after the gateway migration", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toEqual({
      error: "twitch_callback_moved",
      message: "Twitch OAuth callbacks are now handled by the API gateway.",
    });
  });
});
