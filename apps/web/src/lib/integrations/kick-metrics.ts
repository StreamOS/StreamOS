export type KickMetricsRaw = {
  _stub: true;
  channelSlug: string;
  followers?: number | null;
  livestream?: {
    viewer_count?: number | null;
  } | null;
};

export async function getKickChannelMetrics(
  _accessToken: string,
  channelSlug: string,
): Promise<KickMetricsRaw> {
  // TODO: Replace this stub with Kick Public API reads once the app's Kick OAuth flow is wired.
  return {
    _stub: true,
    channelSlug,
    followers: null,
    livestream: null,
  };
}
