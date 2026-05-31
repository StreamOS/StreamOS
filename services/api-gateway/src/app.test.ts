import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("api-gateway", () => {
  it("serves health status", async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ service: "api-gateway", status: "ok" });
    } finally {
      server.close();
    }
  });
});
