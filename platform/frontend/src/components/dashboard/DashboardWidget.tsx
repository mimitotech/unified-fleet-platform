import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { lightenHex } from '@/lib/tenantBranding';

export type WidgetTone = 'primary' | 'accent' | 'secondary' | 'sky' | 'amber' | 'rose' | 'teal';

const TONE_FALLBACK: Record<WidgetTone, string> = {
  primary: '#004225',
  accent: '#7c3aed',
  secondary: '#0f172a',
  sky: '#0284c7',
  amber: '#d97706',
  rose: '#e11d48',
  teal: '#0d9488',
};

type WidgetProps = {
  title: string;
  subtitle?: string;
  /** One-line takeaway under the chart — keeps meaning clear */
  insight?: string;
  href?: string;
  hrefLabel?: string;
  className?: string;
  bodyClassName?: string;
  delayMs?: number;
  brandColor?: string;
  tone?: WidgetTone;
  children: ReactNode;
};

function resolveToneColor(tone: WidgetTone | undefined, brandColor?: string): string {
  if (brandColor) return brandColor;
  if (tone) return TONE_FALLBACK[tone];
  return TONE_FALLBACK.primary;
}

/** Branded dashboard card with hover lift and accent rail. */
export function DashboardWidget({
  title,
  subtitle,
  insight,
  href,
  hrefLabel = 'Open',
  className,
  bodyClassName,
  delayMs = 0,
  brandColor,
  tone = 'primary',
  children,
}: WidgetProps) {
  const accent = resolveToneColor(tone, brandColor);
  const soft = lightenHex(accent, 0.9);
  const mid = lightenHex(accent, 0.78);

  const style: CSSProperties = {
    animationDelay: `${delayMs}ms`,
    borderColor: `${accent}28`,
    background: `linear-gradient(165deg, ${soft} 0%, #ffffff 52%, ${mid}40 100%)`,
    ['--widget-accent' as string]: accent,
  };

  return (
    <section
      className={cn(
        'group/widget relative flex flex-col min-h-[280px] overflow-visible rounded-xl border p-3.5',
        'animate-slide-in transition-all duration-300 ease-out',
        'hover:-translate-y-1 hover:shadow-lg hover:border-opacity-60',
        className,
      )}
      style={style}
      data-dashboard-widget
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 12px 28px -14px ${accent}55, 0 2px 6px ${accent}18`;
        e.currentTarget.style.borderColor = `${accent}55`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 1px 2px ${accent}10, 0 6px 16px -12px ${accent}22`;
        e.currentTarget.style.borderColor = `${accent}28`;
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 rounded-t-xl transition-all duration-300 group-hover/widget:h-1.5"
        style={{ background: `linear-gradient(90deg, ${accent}, ${lightenHex(accent, 0.4)})` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover/widget:opacity-35"
        style={{ background: accent }}
      />

      <header className="relative flex items-start justify-between gap-2 mb-2.5 shrink-0 pt-0.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold text-foreground leading-snug break-words" title={title}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug break-words">{subtitle}</p>
          )}
        </div>
        {href && (
          <Link
            to={href}
            data-no-print
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold shrink-0 rounded-md px-1.5 py-0.5 transition-all duration-200 hover:scale-105"
            style={{ color: accent, background: `${accent}12` }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${accent}22`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `${accent}12`;
            }}
          >
            {hrefLabel}
            <ArrowUpRight className="h-3 w-3 transition-transform group-hover/widget:translate-x-0.5 group-hover/widget:-translate-y-0.5" />
          </Link>
        )}
      </header>
      <div className={cn('relative flex-1 min-h-0 flex flex-col', bodyClassName)}>{children}</div>
      {insight && (
        <p
          className="relative mt-2 pt-2 border-t text-[10px] leading-snug text-muted-foreground"
          style={{ borderColor: `${accent}22` }}
        >
          <span className="font-semibold" style={{ color: accent }}>
            Insight ·{' '}
          </span>
          {insight}
        </p>
      )}
    </section>
  );
}

export function DashboardSectionLabel({
  children,
  color,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-2 mb-0.5"
      style={{ color: color || 'hsl(var(--muted-foreground))' }}
    >
      <span
        className="inline-block h-1 w-5 rounded-full"
        style={{ background: color || 'hsl(var(--primary))' }}
      />
      {children}
    </p>
  );
}

export function DashboardEmpty({ message }: { message: string }) {
  return (
    <div className="flex-1 min-h-[140px] flex items-center justify-center text-xs text-muted-foreground px-3 text-center">
      {message}
    </div>
  );
}
