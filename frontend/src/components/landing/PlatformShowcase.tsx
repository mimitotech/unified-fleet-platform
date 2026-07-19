import { useState, useEffect } from 'react';
import { BRAND } from '@/lib/branding';
import { MamsLogoMark } from '@/components/shared/MamsLogo';
import { cn } from '@/lib/utils';
import { MapPin, Video, Bell, Settings, Activity, Pause, Power } from 'lucide-react';

const TABS = [
  { id: 'map', label: 'Live map', icon: MapPin },
  { id: 'video', label: 'Surveillance', icon: Video },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'admin', label: 'Admin control', icon: Settings },
] as const;

type TabId = (typeof TABS)[number]['id'];

const MAP_MARKERS = [
  { top: '28%', left: '35%', status: 'moving', label: 'UG 1234A' },
  { top: '52%', left: '58%', status: 'idle', label: 'Gen-07' },
  { top: '38%', left: '72%', status: 'stopped', label: 'Dashcam-02' },
  { top: '65%', left: '42%', status: 'moving', label: 'UG 8890B' },
];

const STATUS_COLOR: Record<string, string> = {
  moving: 'bg-status-moving',
  idle: 'bg-status-idle',
  stopped: 'bg-status-stopped',
};

export function PlatformShowcase() {
  const [tab, setTab] = useState<TabId>('map');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-2xl border border-primary/15 shadow-2xl shadow-primary/10 overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary/[0.04]">
        <MamsLogoMark size="sm" className="!h-6" />
        <span className="text-xs font-medium text-primary">MAMS platform preview</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-primary font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          Live demo
        </span>
      </div>

      <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/30">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              tab === id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-white hover:text-primary'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="relative min-h-[320px] bg-muted/20">
        {tab === 'map' && (
          <div className="relative">
            <img
              src={BRAND.landingMap}
              alt="Live fleet map"
              className="w-full h-[320px] object-cover"
            />
            {MAP_MARKERS.map((m, i) => (
              <div
                key={m.label}
                className="absolute z-10 group cursor-default"
                style={{ top: m.top, left: m.left }}
              >
                <span className="relative flex h-4 w-4">
                  <span
                    className={cn(
                      'animate-ping absolute inline-flex h-full w-full rounded-full opacity-60',
                      STATUS_COLOR[m.status]
                    )}
                  />
                  <span
                    className={cn(
                      'relative inline-flex rounded-full h-4 w-4 border-2 border-white shadow-md',
                      STATUS_COLOR[m.status]
                    )}
                  />
                </span>
                <span
                  className="absolute left-5 top-0 whitespace-nowrap rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-medium shadow border opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {m.label}
                </span>
              </div>
            ))}
            <div className="absolute bottom-3 left-3 right-3 flex gap-2">
              {[
                { icon: Activity, label: 'Moving', val: 12 + (tick % 3), color: 'text-status-moving' },
                { icon: Pause, label: 'Idle', val: 4, color: 'text-amber-600' },
                { icon: Power, label: 'Stopped', val: 2, color: 'text-red-600' },
              ].map(({ icon: Icon, label, val, color }) => (
                <div key={label} className="flex-1 rounded-lg bg-white/95 backdrop-blur px-2 py-1.5 text-center shadow border text-xs">
                  <Icon className={cn('w-3 h-3 mx-auto mb-0.5', color)} />
                  <span className="font-bold block">{val}</span>
                  <span className="text-muted-foreground text-[10px]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'video' && (
          <div className="grid grid-cols-2 gap-2 p-3 h-[320px]">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="relative rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center group"
              >
                <Video className="w-8 h-8 text-white/30" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <span className="text-[10px] text-white font-medium">Channel {n} · LocoNav / TrackSolid</span>
                </div>
                <span className="absolute top-2 right-2 flex items-center gap-1 text-[9px] text-red-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  REC
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'alerts' && (
          <div className="p-4 space-y-2 h-[320px] overflow-hidden">
            {[
              { title: 'Speed violation — UG 1234A', sev: 'critical', src: 'Wialon', time: '2m ago' },
              { title: 'Geofence exit — Warehouse A', sev: 'warning', src: 'TrackSolid', time: '8m ago' },
              { title: 'Idling detected — Gen-07', sev: 'warning', src: 'LocoNav', time: '15m ago' },
              { title: 'Fuel drop anomaly', sev: 'info', src: 'Wialon', time: '1h ago' },
            ].map((alert, i) => (
              <div
                key={alert.title}
                className="rounded-lg border bg-white p-3 flex items-start justify-between gap-2 animate-slide-in shadow-sm"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div>
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.src} · {alert.time}</p>
                </div>
                <span
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0',
                    alert.sev === 'critical' && 'bg-red-100 text-red-700',
                    alert.sev === 'warning' && 'bg-amber-100 text-amber-800',
                    alert.sev === 'info' && 'bg-blue-100 text-blue-700'
                  )}
                >
                  {alert.sev}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'admin' && (
          <div className="p-5 h-[320px] flex flex-col justify-center">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {['Wialon', 'LocoNav', 'TrackSolid'].map((name, i) => (
                <div
                  key={name}
                  className="rounded-xl border border-primary/15 p-3 text-center bg-white shadow-sm"
                >
                  <p className="text-xs font-semibold text-primary">{name}</p>
                  <p className="text-[10px] text-primary mt-1 font-medium">✓ Verified</p>
                  <p className="text-lg font-bold mt-1">{[24, 18, 31][i]}</p>
                  <p className="text-[10px] text-muted-foreground">assets synced</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-center text-muted-foreground">
              Configure credentials once — clients never see telematics logins.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
