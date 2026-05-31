import { Button } from "@/components/ui/Button";
import type { PlatformConnection } from "@/types/streamos";

type PlatformsViewProps = {
  platforms: PlatformConnection[];
  onToggle: (index: number) => void;
};

export function PlatformsView({ platforms, onToggle }: PlatformsViewProps) {
  return (
    <section className="view active">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Multi-Plattform Management</p>
            <h2>Verbinde Twitch, YouTube, TikTok und Kick.</h2>
          </div>
        </div>
        <div className="platform-grid">
          {platforms.map((platform, index) => (
            <article className={`platform-card ${platform.connected ? "connected" : ""}`} key={platform.name}>
              <div>
                <strong>{platform.name}</strong>
                <p>{platform.followers.toLocaleString("de-DE")} Follower / {platform.status}</p>
              </div>
              <Button variant={platform.connected ? "ghost" : "primary"} compact onClick={() => onToggle(index)}>
                {platform.connected ? "Trennen" : "Verbinden"}
              </Button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
