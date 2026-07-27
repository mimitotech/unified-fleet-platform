import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Download, Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import type { PrintReportMode } from '@/lib/printReport';
import { importPrintPageSection } from '@/lib/importPrintReport';

type Props = {
  /** Element that holds the KPIs + charts to capture. */
  contentRef: RefObject<HTMLElement | null>;
  title: string;
  filename?: string;
  primaryColor?: string;
  className?: string;
  size?: 'sm' | 'xs';
  /** Optional custom trigger layout. */
  children?: ReactNode;
};

/**
 * Compact Print + Download controls for Dashboard / Fuel overview exports.
 */
export function SectionPrintButtons({
  contentRef,
  title,
  filename,
  primaryColor,
  className,
  size = 'sm',
}: Props) {
  const [busy, setBusy] = useState<PrintReportMode | null>(null);

  const run = async (mode: 'download' | 'print') => {
    const root = contentRef.current;
    if (!root) {
      notify.error(mode === 'download' ? 'Download failed' : 'Print failed', 'Nothing to export yet.');
      return;
    }
    setBusy(mode);
    try {
      const { printPageSection } = await importPrintPageSection();
      await printPageSection({
        root,
        title,
        filename,
        primaryColor,
        mode,
      });
    } catch (e) {
      notify.error(
        mode === 'download' ? 'Download failed' : 'Print failed',
        e instanceof Error ? e.message : 'Could not prepare the export',
      );
    } finally {
      setBusy(null);
    }
  };

  const btn =
    size === 'xs'
      ? 'h-7 gap-1 px-2 text-[11px]'
      : 'h-8 gap-1.5 text-xs';

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} data-no-print>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(btn, 'border-primary/40 text-primary')}
        disabled={!!busy}
        onClick={() => void run('download')}
      >
        {busy === 'download' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        PDF
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={btn}
        disabled={!!busy}
        onClick={() => void run('print')}
      >
        {busy === 'print' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Printer className="h-3.5 w-3.5" />
        )}
        Print
      </Button>
    </div>
  );
}

/** Convenience hook: printable root ref + buttons props. */
export function useSectionPrint() {
  const contentRef = useRef<HTMLDivElement>(null);
  return { contentRef };
}
