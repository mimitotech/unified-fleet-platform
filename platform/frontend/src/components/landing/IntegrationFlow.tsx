import { useState } from 'react';
import { cn } from '@/lib/utils';
import { MamsLogoMark } from '@/components/shared/MamsLogo';
import { BRAND } from '@/lib/branding';
import { ArrowRight, Radio, Truck, Video, Fuel, Bell, Users } from 'lucide-react';

/** Public marketing labels — never name third-party telematics vendors. */
const SOURCES = [
  {
    id: 'gps',
    name: 'Fleet GPS',
    color: '#2563eb',
    capabilities: ['GPS & trips', 'Fuel & sensors', 'Drivers', 'Geofences', 'Commands'],
    icon: Truck,
  },
  {
    id: 'video',
    name: 'Video telematics',
    color: '#7c3aed',
    capabilities: ['Live GPS', 'Video alerts', 'Vehicle list', 'Event webhooks'],
    icon: Video,
  },
  {
    id: 'devices',
    name: 'Device platform',
    color: '#059669',
    capabilities: ['GPS & video', 'Fuel & OBD', 'Geofences', 'Alerts', 'Commands'],
    icon: Radio,
  },
] as const;

export function IntegrationFlow() {
  const [active, setActive] = useState<string>('gps');
  const selected = SOURCES.find((s) => s.id === active) ?? SOURCES[0];

  return (
    <div className="rounded-2xl border border-primary/15 bg-white/80 backdrop-blur-sm p-6 lg:p-8 shadow-xl shadow-primary/5">
      <div className="grid lg:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 lg:gap-6 items-center">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Connected data sources
          </p>
          {SOURCES.map((source) => {
            const Icon = source.icon;
            const isActive = active === source.id;
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => setActive(source.id)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-300',
                  isActive
                    ? 'border-primary/40 bg-primary/10 shadow-md scale-[1.02]'
                    : 'border-border/80 bg-white hover:border-primary/25 hover:bg-primary/[0.03]'
                )}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: source.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{source.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isActive ? 'Selected — click others to compare' : 'Click to explore'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="hidden lg:flex flex-col items-center gap-1 text-primary/40">
          <ArrowRight className="w-6 h-6 animate-pulse" />
          <ArrowRight className="w-6 h-6 animate-pulse delay-150" />
        </div>

        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl animate-pulse" />
          <div
            className="relative rounded-2xl p-6 text-center text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.accent})` }}
          >
            <MamsLogoMark size="md" className="mx-auto mb-3 brightness-0 invert" />
            <p className="font-bold text-lg">MAMS</p>
            <p className="text-xs text-white/80 mt-1">Unify · Normalize · Deliver</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {[Fuel, Bell, Users, Truck].map((Icon, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center animate-float"
                  style={{ animationDelay: `${i * 200}ms` }}
                >
                  <Icon className="w-4 h-4" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hidden lg:flex flex-col items-center gap-1 text-primary/40">
          <ArrowRight className="w-6 h-6" />
        </div>

        <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            What {selected.name} brings in
          </p>
          <ul className="space-y-2 mb-4">
            {selected.capabilities.map((cap, i) => (
              <li
                key={cap}
                className="flex items-center gap-2 text-sm animate-slide-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: selected.color }}
                />
                {cap}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground border-t border-primary/10 pt-3">
            Aggregated with other sources — one map, one login, tenant-branded dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
