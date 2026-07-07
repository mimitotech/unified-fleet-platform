import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { pollWhenVisible } from '@/lib/liveRefresh';
import type { ReportRunParams, WialonReportResult } from '@/lib/reportUtils';

const REPORT_LIVE_MS = 60_000;

export function wialonReportRunKey(params: ReportRunParams | null) {
  if (!params) return ['wialon-report-run', 'idle'] as const;
  return [
    'wialon-report-run',
    params.reportResourceId,
    params.reportTemplateId,
    params.reportObjectId,
    params.from,
    params.to,
  ] as const;
}

/** Execute a Wialon report and optionally auto-refresh for live date ranges. */
export function useWialonReportRun(params: ReportRunParams | null, live = false) {
  return useQuery({
    queryKey: wialonReportRunKey(params),
    queryFn: () => clientApi.execWialonReport(params!) as Promise<WialonReportResult>,
    enabled: !!params,
    staleTime: 20_000,
    gcTime: 10 * 60_000,
    refetchInterval: live && params ? pollWhenVisible(REPORT_LIVE_MS) : false,
    retry: 0,
  });
}

export function isLiveReportRange(toUnix: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return toUnix >= now - 3600;
}
