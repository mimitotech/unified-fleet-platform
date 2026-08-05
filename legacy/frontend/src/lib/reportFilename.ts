/** Build sanitized download filenames for branded reports. */

export type ReportFilenameParts = {
  clientName?: string | null;
  reportName: string;
  /** ISO date YYYY-MM-DD; defaults to today. */
  date?: string | null;
  unitName?: string | null;
};

/** Strip unsafe path/filename characters; keep readable separators. */
export function sanitizeReportFilenamePart(value: string, maxLen = 48): string {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (cleaned.slice(0, maxLen) || 'report').replace(/_+$/g, '') || 'report';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * `{ClientName}_{ReportName}_{YYYY-MM-DD}_{UnitName?}` — sanitized for downloads.
 */
export function buildReportFilename(parts: ReportFilenameParts): string {
  const client = sanitizeReportFilenamePart(parts.clientName || 'Client', 40);
  const report = sanitizeReportFilenamePart(parts.reportName, 48);
  const dateRaw = (parts.date || todayIso()).trim();
  const date = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : todayIso();
  const unit = parts.unitName?.trim()
    ? sanitizeReportFilenamePart(parts.unitName, 40)
    : '';
  const base = unit ? `${client}_${report}_${date}_${unit}` : `${client}_${report}_${date}`;
  return base.slice(0, 120) || 'report';
}
