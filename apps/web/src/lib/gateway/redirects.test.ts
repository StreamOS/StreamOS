import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveGatewayReturnTo } from "./redirects";

describe("gateway return_to redirects", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
    };
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefers the configured app origin over the incoming request host", () => {
    process.env.APP_URL = "https://app.streamos.test";

    const target = resolveGatewayReturnTo({
      request: new NextRequest(
        "https://streamos-web-production.up.railway.app/api/gateway-connect",
      ),
      value: "/dashboard/platforms",
    });

    expect(target).toBe("https://app.streamos.test/dashboard/platforms");
  });

  it("falls back to the incoming request origin outside production", () => {
    const target = resolveGatewayReturnTo({
      request: new NextRequest("http://localhost/api/gateway-connect"),
      value: "/dashboard/platforms",
    });

    expect(target).toBe("http://localhost/dashboard/platforms");
  });

  it("fails closed in production when no canonical app origin is configured", () => {
    process.env = {
      ...process.env,
      NODE_ENV: "production",
    };

    expect(() =>
      resolveGatewayReturnTo({
        request: new NextRequest(
          "https://streamos-web.up.railway.app/api/gateway-connect",
        ),
        value: "/dashboard/platforms",
      }),
    ).toThrow(
      "APP_URL or NEXT_PUBLIC_APP_URL must be configured as an absolute URL in production.",
    );
  });
});
