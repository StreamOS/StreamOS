import {
  BarChart3,
  Clapperboard,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  Palette,
  RadioTower,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Clips", href: "/dashboard/clips", icon: Clapperboard },
  { label: "Jobs", href: "/dashboard/jobs", icon: ListChecks },
  { label: "Monetization", href: "/dashboard/monetization", icon: CreditCard },
  { label: "Branding", href: "/dashboard/branding", icon: Palette },
];

type SidebarProps = {
  creatorName?: string;
  creatorNiche?: string;
  signOutAction?: () => Promise<void>;
};

export function Sidebar({
  creatorName = "Demo Workspace",
  creatorNiche = "NovaPlays / Tactical FPS & Community Challenges",
  signOutAction,
}: SidebarProps) {
  return (
    <aside className="border-r border-white/10 bg-surface-950/90 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:w-72">
      <div className="flex h-full flex-col gap-6 px-5 py-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-signal-green font-black text-white">
              S
            </div>
            <div>
              <div className="text-xl font-semibold text-white">StreamOS</div>
              <div className="text-xs text-slate-400">Creator OS</div>
            </div>
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-signal-green/20 bg-signal-green/10 px-3 py-1 text-xs font-medium text-signal-green">
            <RadioTower className="h-3.5 w-3.5" />
            Live ops ready
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-white">{creatorName}</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {creatorNiche}
          </p>
          {signOutAction && (
            <form action={signOutAction} className="mt-4">
              <button className="btn-ghost w-full" type="submit">
                Logout
              </button>
            </form>
          )}
        </div>
      </div>
    </aside>
  );
}
