import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { format } from 'date-fns';
import { BRAND } from '@/lib/branding';
import type { ResolvedTenantBranding } from '@/lib/tenantBranding';
import { cn } from '@/lib/utils';

export function makeReportRef(d: Date = new Date()): string {
  return `RPT-${format(d, 'yyyyMMdd-HHmmss')}`;
}

type DocumentProps = {
  branding: ResolvedTenantBranding;
  children: ReactNode;
  className?: string;
};

/** Report shell with client-logo watermark (print / PDF security). */
export function BrandedReportDocument({ branding, children, className }: DocumentProps) {
  const logoSrc = branding.logoUrl || BRAND.logo;

  return (
    <div data-report-document className={cn('relative bg-white', className)}>
      <div
        data-report-watermark
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden z-0"
      >
        <img
          src={logoSrc}
          alt=""
          data-report-watermark-img
          className="select-none opacity-[0.06] w-[min(420px,68%)] max-w-none rotate-[-24deg]"
        />
      </div>
      <div data-report-content className="relative z-[1]">
        {children}
      </div>
    </div>
  );
}

type HeaderProps = {
  branding: ResolvedTenantBranding;
  reportTitle: string;
  moduleLabel?: string;
  periodLabel?: string;
  objectLabel?: string;
  generatedAt?: Date | string;
  className?: string;
};

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap" data-report-meta-item>
      <span className="text-slate-400 font-medium">{label}</span>
      <span className="text-slate-700">{value}</span>
    </span>
  );
}

/** Client-branded report masthead — logo + name on one line, spaced meta row. */
export function BrandedReportHeader({
  branding,
  reportTitle,
  moduleLabel,
  periodLabel,
  objectLabel,
  generatedAt = new Date(),
  className,
}: HeaderProps) {
  const generatedDate =
    typeof generatedAt === 'string' ? new Date(generatedAt) : generatedAt;
  const generated = Number.isNaN(generatedDate.getTime())
    ? String(generatedAt)
    : generatedDate.toLocaleString();
  const reportRef = useMemo(
    () => makeReportRef(Number.isNaN(generatedDate.getTime()) ? new Date() : generatedDate),
    [generatedDate],
  );
  const logoSrc = branding.logoUrl || BRAND.logo;

  return (
    <header
      data-report-header
      className={cn('border border-slate-200 bg-white/95 overflow-hidden', className)}
    >
      <div
        data-report-header-bar
        className="h-1.5 w-full"
        style={{ background: branding.primaryColor }}
      />
      <div
        data-report-header-body
        className="flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-4"
      >
        <div data-report-brand className="flex items-center gap-4 shrink-0">
          <div
            data-report-logo
            className="shrink-0 h-16 w-16 rounded-lg border border-slate-200 bg-white flex items-center justify-center p-2 shadow-sm"
          >
            <img
              src={logoSrc}
              alt={branding.name || 'Client'}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <p
            data-report-client-name
            className="text-lg font-semibold leading-tight whitespace-nowrap"
            style={{ color: branding.primaryColor }}
          >
            {branding.name || 'Client'}
          </p>
        </div>

        <div
          data-report-divider
          className="hidden sm:block w-px h-12 bg-slate-200 shrink-0"
          aria-hidden
        />

        <div
          data-report-title-block
          className="flex flex-col gap-1 min-w-0 flex-1 basis-[160px]"
        >
          <p className="text-base font-semibold text-slate-800">{reportTitle}</p>
          {moduleLabel ? (
            <p className="text-xs text-slate-500">{moduleLabel}</p>
          ) : null}
        </div>

        <div
          data-report-meta
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] shrink-0 sm:ml-auto"
        >
          {periodLabel ? <MetaItem label="Period" value={periodLabel} /> : null}
          {objectLabel ? <MetaItem label="Object" value={objectLabel} /> : null}
          <MetaItem label="Generated" value={generated} />
          <MetaItem label="Ref" value={reportRef} />
        </div>
      </div>
    </header>
  );
}

type FooterProps = {
  branding: ResolvedTenantBranding;
  note?: string;
  generatedAt?: Date | string;
  className?: string;
};

export function BrandedReportFooter({
  branding,
  note,
  generatedAt = new Date(),
  className,
}: FooterProps) {
  const generatedDate =
    typeof generatedAt === 'string' ? new Date(generatedAt) : generatedAt;
  const reportRef = useMemo(
    () => makeReportRef(Number.isNaN(generatedDate.getTime()) ? new Date() : generatedDate),
    [generatedDate],
  );
  const issued = format(
    Number.isNaN(generatedDate.getTime()) ? new Date() : generatedDate,
    'dd MMM yyyy · HH:mm',
  );

  return (
    <footer
      data-report-footer
      className={cn(
        'border border-slate-200 border-t-0 bg-white/95 px-6 py-3',
        className,
      )}
    >
      <div
        data-report-footer-top
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <p data-report-footer-note className="text-[10px] text-slate-600 leading-relaxed">
          {note ||
            `Official report for ${branding.name || 'this client'}. Figures reflect the selected period and filters.`}
        </p>
        <p data-report-footer-ref className="text-[10px] text-slate-400 tabular-nums shrink-0">
          {reportRef} · {issued}
        </p>
      </div>
    </footer>
  );
}

/** Branded table header cell — use on export/print tables for consistency. */
export function brandedTableHeadStyle(primaryColor: string): CSSProperties {
  return {
    background: primaryColor,
    color: '#fff',
    borderColor: primaryColor,
  };
}
