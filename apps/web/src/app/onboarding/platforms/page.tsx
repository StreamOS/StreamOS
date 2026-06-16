import type { OAuthProvider, StreamPlatform } from "@streamos/types";
import type { Tables } from "@streamos/database";
import {
  CheckCircle2,
  Clapperboard,
  PlaySquare,
  Radio,
  Video,
} from "lucide-react";
import { continueFromPlatformsAction, skipPlatformsAction } from "../actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseSetupNotice } from "@/lib/supabase/messages";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";
import { GatewayConnectButton } from "@/app/dashboard/components/GatewayConnectButton";

type OnboardingPlatformsPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

type PlatformCard = {
  accentClassName: string;
  description: string;
  gatewayProvider: OAuthProvider;
  icon: typeof Radio;
  id: StreamPlatform;
  label: string;
};

type ConnectionSummary = Pick<
  Tables<"platform_connections">,
  "expires_at" | "platform" | "status"
>;

const platformCards: PlatformCard[] = [
  {
    accentClassName: "border-brand-500/40 bg-brand-500/10 text-brand-200",
    description: "Verbinde Twitch OAuth ueber den API Gateway.",
    gatewayProvider: "twitch",
    icon: Radio,
    id: "twitch",
    label: "Twitch",
  },
  {
    accentClassName: "border-signal-red/40 bg-signal-red/10 text-rose-200",
    description: "Verbinde YouTube OAuth ueber den API Gateway.",
    gatewayProvider: "youtube",
    icon: PlaySquare,
    id: "youtube",
    label: "YouTube",
  },
  {
    accentClassName: "border-slate-400/30 bg-slate-950/80 text-slate-200",
    description: "Verbinde TikTok OAuth ueber den API Gateway.",
    gatewayProvider: "tiktok",
    icon: Clapperboard,
    id: "tiktok",
    label: "TikTok",
  },
  {
    accentClassName:
      "border-signal-green/40 bg-signal-green/10 text-emerald-200",
    description: "Verbinde Kick OAuth ueber den API Gateway.",
    gatewayProvider: "kick",
    icon: Video,
    id: "kick",
    label: "Kick",
  },
];

const errorMessages: Record<string, string> = {
  platform_step_update_failed:
    "Plattform-Step konnte nicht gespeichert werden. Bitte versuche es erneut.",
  supabase_not_configured: getSupabaseSetupNotice(
    "du im Onboarding fortfahren kannst",
  ),
};

export default async function OnboardingPlatformsPage({
  searchParams,
}: OnboardingPlatformsPageProps) {
  const params = await searchParams;
  const connectedPlatforms = await getConnectedPlatforms();
  const hasConnectedPlatform = connectedPlatforms.size > 0;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal-green">
          Step 2
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Plattform verbinden
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Waehle mindestens eine Streaming-Plattform aus, damit StreamOS
          Analytics, Discovery-Signale und Automationen deinem Creator-Profil
          zuordnen kann.
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-3 text-sm text-signal-red">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {platformCards.map((platform) => {
          const isConnected = connectedPlatforms.has(platform.id);

          return (
            <PlatformConnectorCard
              isConnected={isConnected}
              key={platform.id}
              platform={platform}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">
            {hasConnectedPlatform
              ? "Mindestens eine Plattform ist verbunden."
              : "Noch keine Plattform verbunden."}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Du kannst fortfahren, sobald eine Verbindung aktiv ist, oder das
            Setup spaeter im Dashboard abschliessen.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <form action={skipPlatformsAction}>
            <button className="btn-ghost w-full sm:w-auto" type="submit">
              Spaeter verbinden - Dashboard
            </button>
          </form>
          <form action={continueFromPlatformsAction}>
            <button
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              disabled={!hasConnectedPlatform}
              type="submit"
            >
              Weiter
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function PlatformConnectorCard({
  isConnected,
  platform,
}: {
  isConnected: boolean;
  platform: PlatformCard;
}) {
  const Icon = platform.icon;

  return (
    <article className="rounded-lg border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg border ${platform.accentClassName}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        {isConnected ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-signal-green/30 bg-signal-green/10 px-2.5 py-1 text-xs font-semibold text-signal-green">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Verbunden
          </span>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300">
            OAuth bereit
          </span>
        )}
      </div>

      <h2 className="mt-4 text-lg font-semibold text-white">
        {platform.label}
      </h2>
      <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">
        {platform.description}
      </p>

      <GatewayConnectButton
        className="btn-primary mt-4 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
        label={isConnected ? "Neu verbinden" : "Verbinden"}
        pendingLabel="Verbinde..."
        provider={platform.gatewayProvider}
      />
    </article>
  );
}

async function getConnectedPlatforms(): Promise<Set<StreamPlatform>> {
  if (!isSupabaseConfigured()) {
    return new Set();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return new Set();
  }

  const creator = await ensureCreatorForUser(supabase, data.user);
  const { data: connections, error: connectionsError } = await supabase
    .from("platform_connections")
    .select("expires_at, platform, status")
    .eq("user_id", data.user.id)
    .eq("creator_id", creator.id);

  if (connectionsError) {
    return new Set();
  }

  const summaries = (connections ?? []) as ConnectionSummary[];

  return new Set(
    summaries
      .filter((connection) => {
        if (connection.status !== "connected") {
          return false;
        }

        if (!connection.expires_at) {
          return true;
        }

        return new Date(connection.expires_at).getTime() > Date.now();
      })
      .map((connection) => connection.platform),
  );
}
