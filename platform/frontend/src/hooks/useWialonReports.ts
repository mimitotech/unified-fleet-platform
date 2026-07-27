import { useQuery } from '@tanstack/react-query';
import { clientApi } from '@/lib/api';
import { pollWhenVisible } from '@/lib/liveRefresh';
import type { ReportRunParams, WialonReportResult } from '@/lib/reportUtils';
import type { WialonCatalogTemplate } from '@/lib/reportCatalog';

const REPORT_LIVE_MS = 60_000;
const REPORT_CATALOG_REFRESH_MS = 5 * 60_000;

export function useWialonReportCatalog(enabled = true) {
  return useQuery({
    queryKey: ['wialon-report-catalog'],
    queryFn: () => clientApi.getWialonReportCatalog(),
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: enabled ? pollWhenVisible(REPORT_CATALOG_REFRESH_MS) : false,
    refetchOnWindowFocus: false,
    select: (d) => ({
      templates: (d.templates ?? []).map(
        (t): WialonCatalogTemplate => ({
          resourceId: t.resourceId,
          resourceName: t.resourceName,
          templateId: t.templateId,
          templateName: t.templateName,
          module: t.module as WialonCatalogTemplate['module'],
          isGroupReport: t.isGroupReport,
          objectKind: (t as { objectKind?: WialonCatalogTemplate['objectKind'] }).objectKind
            ?? (t.isGroupReport ? 'group' : 'unit'),
          fallback: t.fallback,
        })
      ),
      groups: d.groups ?? [],
      users: (d as { users?: Array<{ id: number; nm: string }> }).users ?? [],
      fetchedAt: d.fetchedAt,
      count: d.count,
    }),
  });
}

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

/** Execute a Wialon report via resolver-assisted /reports/run or legacy /reports/exec. */
export function useWialonReportRun(
  params: (
    ReportRunParams & {
      useRunEndpoint?: boolean;
      module?: string;
      objectKind?: 'unit' | 'group' | 'user' | 'resource';
      maxRowsPerTable?: number;
    }
  ) | null,
  live = false
) {
  return useQuery({
    queryKey: [...wialonReportRunKey(params), params?.useRunEndpoint, params?.module, params?.objectKind],
    queryFn: async () => {
      if (params?.useRunEndpoint) {
        return clientApi.runWialonReport({
          module: params.module,
          resourceId: params.reportResourceId,
          templateId: params.reportTemplateId,
          objectId: params.reportObjectId,
          objectKind: params.objectKind ?? 'unit',
          from: params.from,
          to: params.to,
          maxRowsPerTable: params.maxRowsPerTable,
        }) as Promise<WialonReportResult>;
      }
      return clientApi.execWialonReport(params!) as Promise<WialonReportResult>;
    },
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
