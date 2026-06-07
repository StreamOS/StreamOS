"use client";

import { useState } from "react";
import type { GatewayConnectResponse } from "@streamos/types";

type GatewayConnectError = {
  code?: string;
  error?: string;
};

export function GatewayConnectButton() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleConnect() {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/gateway-connect", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => null)) as GatewayConnectError | null;
        throw new Error(
          payload?.error ??
            "Gateway-Verbindung konnte nicht vorbereitet werden.",
        );
      }

      const payload = (await response.json()) as GatewayConnectResponse;
      const handoffUrl = new URL(
        "/api/auth/youtube/connect",
        payload.gateway_url,
      );
      handoffUrl.searchParams.set("handoff", payload.handoff_token);

      window.location.href = handoffUrl.toString();
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Gateway-Verbindung konnte nicht gestartet werden.",
      );
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLoading}
        onClick={handleConnect}
        type="button"
      >
        {isLoading ? "Verbinde..." : "Connect to Gateway"}
      </button>
      {error && (
        <p className="max-w-sm text-sm text-signal-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
