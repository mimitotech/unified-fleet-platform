import { useCountUp, useInView } from '@/hooks/useInView';
import { cn } from '@/lib/utils';
import { Truck, MapPin, Radio, Users, LucideIcon } from 'lucide-react';

interface StatItemProps {
  label: string;
  value: number;
  suffix: string;
  icon: LucideIcon;
  display?: string;
  active: boolean;
  delay: number;
}

function StatItem({ label, value, suffix, icon: Icon, display, active, delay }: StatItemProps) {
  const count = useCountUp(value, active, 1200 + delay);

  return (
    <div
      className={cn(
        'relative rounded-xl border border-primary/15 bg-white/90 backdrop-blur p-5 text-center transition-all duration-700',
        active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <Icon className="w-5 h-5 text-primary mx-auto mb-2 opacity-70" />
      <p className="text-3xl font-bold text-primary tabular-nums">
        {display ?? `${count}${suffix}`}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

const STATS = [
  { label: 'Telematics sources', value: 3, suffix: '', icon: Radio },
  { label: 'Asset types unified', value: 12, suffix: '+', icon: Truck },
  { label: 'Live map refresh', value: 15, suffix: 's', icon: MapPin },
  { label: 'Tenant dashboards', value: 1, suffix: '', icon: Users, display: '∞' },
] as const;

export function LiveStatsBar() {
  const { ref, inView } = useInView(0.2);

  return (
    <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
      {STATS.map((stat, i) => (
        <StatItem
          key={stat.label}
          label={stat.label}
          value={stat.value}
          suffix={stat.suffix}
          icon={stat.icon}
          display={'display' in stat ? stat.display : undefined}
          active={inView}
          delay={i * 100}
        />
      ))}
    </div>
  );
}
