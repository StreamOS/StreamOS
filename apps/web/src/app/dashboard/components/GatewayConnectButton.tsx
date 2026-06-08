"use client";

import { useState } from "react";
import type { GatewayConnectResponse, OAuthProvider } from "@streamos/types";

type GatewayConnectError = {
  code?: string;
  error?: string;
};

type GatewayConnectButtonProps = {
  className?: string;
  label?: string;
  pendingLabel?: string;
  provider?: OAuthProvider;
};

export function GatewayConnectButton({
  className = "btn-primary disabled:cursor-not-allowed disabled:opacity-60",
  label = "Gateway verbinden",
  pendingLabel = "Verbinde...",
  provider = "youtube",
}: GatewayConnectButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleConnect() {
    setError(null);
    setIsLoading(true);

    try {
      const handoffUrl = new URL("/api/gateway-connect", window.location.href);
      handoffUrl.searchParams.set("provider", provider);

      const response = await fetch(handoffUrl, {
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
      window.location.href = payload.connect_url;
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
        className={className}
        disabled={isLoading}
        onClick={handleConnect}
        type="button"
      >
        {isLoading ? pendingLabel : label}
      </button>
      {error && (
        <p className="max-w-sm text-sm text-signal-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
