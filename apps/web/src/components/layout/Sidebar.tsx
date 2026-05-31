import { BarChart3, Clapperboard, CreditCard, LayoutDashboard, Palette, RadioTower } from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Clips", href: "/dashboard/clips", icon: Clapperboard },
  { label: "Monetization", href: "/dashboard/monetization", icon: CreditCard },
  { label: "Branding", href: "/dashboard/branding", icon: Palette }
];

export function Sidebar() {
  return (
    <aside className="border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-72">
      <div className="flex h-full flex-col gap-6 px-5 py-6">
        <div>
          <div className="text-xl font-semibold text-slate-950">StreamOS</div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <RadioTower className="h-3.5 w-3.5" />
            Live ops ready
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
