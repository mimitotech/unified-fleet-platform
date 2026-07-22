import type { WialonClient } from '../adapters/wialonClient.js';
import { isAllowedWialonSvc } from '../adapters/wialonProxyAllowlist.js';
import {
  WIALON_UNIT_FLAG,
  WIALON_RESOURCE_ACCOUNT_FLAGS,
  WIALON_RESOURCE_GEOFENCES_FLAGS,
  WIALON_UNIT_FLAGS,
  WIALON_UNIT_DETAIL_FLAGS,
  type WialonSearchItem,
} from '../adapters/wialonUtils.js';
import type { WialonCredentialsInput } from './WialonHierarchyService.js';
import { withWialonClient } from './WialonSessionService.js';
import {
  parseWialonAvailableCommands,
  parseWialonCommandDefinitionData,
  parseWialonCommandList,
  type WialonCommandDef,
} from './wialonCommandParse.js';
import {
  accountIdFrom,
  activeUnitNameSet,
  filterActiveWialonUnits,
  resourceSearchSpec,
  routeSearchSpec,
  searchAll,
  searchUnitsForAccount,
  searchUnitsBasicForAccount,
  sleep,
  unitSearchSpec,
} from './wialonLiveUtils.js';
import { wialonHostFromBaseUrl, wialonUnitIconUrl, fleetUnitIconProxyPath } from './wialonIcon.js';
import { parseWialonUnitDetail } from './wialonUnitDetail.js';
import { parseWialonLlsBlock, mergeLlsWithSensorNames, fuelLiveFromCalcSensors } from './wialonFuel.js';
import { subscribeFleetUnitsEvents, fetchFleetEventsUpdates } from './wialonEventsService.js';
import { mapWialonSearchItem, applyUnitEvents, type WialonUnitSlice } from './wialonUnitMapper.js';
import { WialonUnitItemsCache } from './wialonUnitItemsCache.js';
import { deriveWialonHostingStatus } from './wialonUnitStatus.js';
import { loadWialonHwTypes, resolveHwName } from './wialonHwTypes.js';
import { wialonReverseGeocodeFull } from './wialonGeocode.js';
import {
  columnsFromTableMeta,
  flattenReportRows,
  filterParsedReportRowsToActiveUnits,
  filterRawReportRowsToActiveUnits,
  inferColumnsFromRows,
  parseWialonReportRow,
  type WialonReportChartResult,
  type WialonReportTableResult,
} from './wialonReportParse.js';

export type WialonLiveUnit = {
  id: number;
  name: string;
  accountId?: number;
  plate?: string;
  iconUri?: string;
  iconUgi?: number;
  position?: {
    lat: number;
    lng: number;
    speed: number;
    time: number;
    course?: number;
  };
  status: 'moving' | 'idle' | 'stopped' | 'offline';
  motionState?: string;
};

export type WialonLiveUnitDetailed = WialonUnitSlice;

export type { WialonCommandDef } from './wialonCommandParse.js';

export class WialonLiveService {
  private static scopedAccount(credentials: WialonCredentialsInput) {
    return accountIdFrom(credentials);
  }

  static async getCapabilities(credentials: WialonCredentialsInput) {
    return withWialonClient(credentials, async (client) => {
      const user = client.getSessionUser();
      const meta = client.getLoginMeta();
      let accountData: Record<string, unknown> | null = null;
      try {
        accountData = await client.request<Record<string, unknown>>('core/get_account_data', { type: 1 });
      } catch {
        /* optional */
      }
      return {
        sessionUser: user,
        features: meta?.features,
        classes: meta?.classes,
        accountData,
        scopedAccountId: this.scopedAccount(credentials),
      };
    });
  }

  static async listUnits(credentials: WialonCredentialsInput, limit = 10_000): Promise<WialonLiveUnit[]> {
    return this.listUnitsDetailed(credentials, limit);
  }

  /** Lightweight unit list — no event polling, fuel enrichment, or sleeps (for video module). */
  static async listUnitsBasic(
    credentials: WialonCredentialsInput,
    limit = 10_000
  ): Promise<
    Array<{
      id: number;
      name: string;
      uid?: string;
      hwName?: string;
      status: string;
      netconn?: boolean;
    }>
  > {
    const accountId = this.scopedAccount(credentials);
    const MIN_FLAGS = WIALON_UNIT_FLAG.BASE | WIALON_UNIT_FLAG.CONNECTION;
    return withWialonClient(credentials, async (client) => {
      const hwTypes = await loadWialonHwTypes(client, `hw:${accountId ?? 'all'}`);
      const items =
        accountId != null && !Number.isNaN(Number(accountId))
          ? await searchUnitsBasicForAccount(client, Number(accountId), limit)
          : filterActiveWialonUnits(await searchAll(client, unitSearchSpec(accountId), MIN_FLAGS));
      return items.slice(0, limit).map((u) => ({
        id: u.id,
        name: u.nm,
        uid: u.uid,
        hwName: resolveHwName(hwTypes, u.hw),
        status: deriveWialonHostingStatus(u).status,
        netconn: u.netconn === true,
      }));
    });
  }

  static async listUnitsDetailed(
    credentials: WialonCredentialsInput,
    limit = 10_000
  ): Promise<WialonLiveUnitDetailed[]> {
    const accountId = this.scopedAccount(credentials);
    return withWialonClient(credentials, async (client) => {
      const hwTypes = await loadWialonHwTypes(client, `hw:${accountId ?? 'all'}`);
      const items =
        accountId != null && !Number.isNaN(Number(accountId))
          ? await searchUnitsForAccount(client, Number(accountId), limit)
          : filterActiveWialonUnits(
              await searchAll(client, unitSearchSpec(accountId), WIALON_UNIT_FLAGS),
            );
      const sliced = items.slice(0, limit);
      const ids = sliced.map((u) => u.id);

      const accountKey = accountId != null ? String(accountId) : 'all';
      WialonUnitItemsCache.set(accountKey, sliced);

      let eventsMap = new Map<number, import('./wialonEventsService.js').WialonUnitEventSlice>();
      try {
        await subscribeFleetUnitsEvents(client, ids);
        await sleep(400);
        eventsMap = await fetchFleetEventsUpdates(client);
        const hasLls = [...eventsMap.values()].some((e) => e.fuelLls?.length);
        if (!hasLls) {
          await sleep(800);
          eventsMap = await fetchFleetEventsUpdates(client);
        }
      } catch {
        /* events optional — fall back to search_item status */
      }

      let units = sliced.map((u) => {
        const base = mapWialonSearchItem(u, hwTypes);
        return applyUnitEvents(base, u, eventsMap.get(u.id));
      });

      const fuelMissing = units.filter(
        (u) =>
          !u.fuel?.levelLiters &&
          !u.fuel?.levelFormatted &&
          u.sens.some((s) => /fuel|lls|tank/i.test(s.name) || /fuel level|lls/i.test(s.type))
      );

      if (fuelMissing.length) {
        const enriched = await Promise.all(
          fuelMissing.map(async (u) => {
            try {
              const sens = await client.request<{ sensors?: Array<{ n: string; v: string; u?: string; t?: number }> }>(
                'unit/calc_last_message',
                { unitId: u.id, sensors: [], flags: 1 }
              );
              const live = fuelLiveFromCalcSensors(
                sens.sensors || [],
                u.sens.map((s) => ({ id: s.id, name: s.name }))
              );
              if (!live) return u;
              return { ...u, fuel: live, fuelLevel: u.fuelLevel };
            } catch {
              return u;
            }
          })
        );
        const byId = new Map(enriched.map((u) => [u.id, u]));
        units = units.map((u) => byId.get(u.id) ?? u);
      }

      return units;
    });
  }

  static async listRoutes(credentials: WialonCredentialsInput, limit = 200) {
    const accountId = this.scopedAccount(credentials);
    return withWialonClient(credentials, async (client) => {
      const routes = await searchAll(client, routeSearchSpec(accountId), 257);
      return routes.slice(0, limit).map((r) => ({
        id: r.id,
        name: r.nm,
        accountId: r.bact,
        config: r.rcfg,
      }));
    });
  }

  static async listRouteRounds(credentials: WialonCredentialsInput, routeId: number) {
    return withWialonClient(credentials, async (client) => {
      const result = await client.request<{ rounds?: Array<Record<string, unknown>> }>('route/get_all_rounds', {
        itemId: routeId,
      });
      return result.rounds || [];
    });
  }

  static async listReportTemplates(credentials: WialonCredentialsInput, limit = 400) {
    const accountId = this.scopedAccount(credentials);
    return withWialonClient(credentials, async (client) => {
      const resources = await searchAll(client, resourceSearchSpec(accountId), 8193);
      const templates: Array<{
        resourceId: number;
        resourceName: string;
        id: number;
        name: string;
        type?: string;
      }> = [];
      for (const res of resources) {
        const rep = res.rep || {};
        for (const t of Object.values(rep)) {
          const tpl = t as { id: number; n: string; ct?: string };
          templates.push({
            resourceId: res.id,
            resourceName: res.nm,
            id: tpl.id,
            name: tpl.n,
            type: tpl.ct,
          });
          if (templates.length >= limit) return templates;
        }
      }
      return templates;
    });
  }

  static async executeReport(
    credentials: WialonCredentialsInput,
    input: {
      reportResourceId: number;
      reportTemplateId: number;
      reportObjectId: number;
      reportObjectSecId?: number;
      from: number;
      to: number;
      maxRowsPerTable?: number;
    }
  ) {
    const maxRows = Math.min(input.maxRowsPerTable ?? 5000, 10_000);
    const batchSize = 500;

    return withWialonClient(credentials, async (client) => {
      await client.request('report/cleanup_result', {}).catch(() => undefined);

      // Active units for this billing account — used to strip deactivated/removed assets from results.
      let activeNames = new Set<string>();
      const accountId = accountIdFrom(credentials);
      try {
        if (accountId && Number.isFinite(Number(accountId))) {
          const activeUnits = await searchUnitsForAccount(client, Number(accountId), 10_000);
          activeNames = activeUnitNameSet(activeUnits);
        } else {
          const all = filterActiveWialonUnits(
            await searchAll(client, unitSearchSpec(undefined), WIALON_UNIT_FLAGS),
          );
          activeNames = activeUnitNameSet(all);
        }
      } catch {
        activeNames = new Set();
      }

      const execParams = {
        reportResourceId: input.reportResourceId,
        reportTemplateId: input.reportTemplateId,
        reportObjectId: input.reportObjectId,
        reportObjectSecId: input.reportObjectSecId ?? 0,
        interval: { from: input.from, to: input.to, flags: 0 },
      };

      let result: {
        reportResult?: {
          tables?: Array<Record<string, unknown>>;
          attachments?: Array<Record<string, unknown>>;
        };
        tables?: Array<Record<string, unknown>>;
        attachments?: Array<Record<string, unknown>>;
      } = {};

      // Prefer sync exec (remoteExec:0) — often finishes in one round-trip for moderate reports.
      let ready = false;
      try {
        result = await client.request<typeof result>('report/exec_report', {
          ...execParams,
          remoteExec: 0,
        });
        const syncTables = result.reportResult?.tables ?? result.tables ?? [];
        if (syncTables.length || result.reportResult) ready = true;
      } catch {
        ready = false;
      }

      if (!ready) {
        await client.request('report/cleanup_result', {}).catch(() => undefined);
        await client.request('report/exec_report', { ...execParams, remoteExec: 1 });
        for (let attempt = 0; attempt < 90; attempt++) {
          const statusRes = await client.request<{ status: number; error?: string }>(
            'report/get_report_status',
            {},
          );
          const code = statusRes.status;
          if (code === 4) {
            ready = true;
            break;
          }
          if (code === 8 || code === 16) {
            throw new Error(statusRes.error || `Wialon report failed (status ${code})`);
          }
          await sleep(attempt < 20 ? 200 : attempt < 40 ? 400 : 800);
        }
        if (!ready) throw new Error('Wialon report timed out before completion');
        result = await client.request<typeof result>('report/apply_report_result', {});
      }

      const tablesOut: WialonReportTableResult[] = [];
      const chartsOut: WialonReportChartResult[] = [];
      const fetchRowBatches = async (
        tableIndex: number,
        fetchTo: number,
        svc: 'report/select_result_rows' | 'report/get_result_rows',
        level?: number,
      ): Promise<unknown[]> => {
        const ranges: Array<{ from: number; to: number }> = [];
        for (let indexFrom = 0; indexFrom < fetchTo; indexFrom += batchSize) {
          ranges.push({
            from: indexFrom,
            to: Math.min(indexFrom + batchSize - 1, fetchTo - 1),
          });
        }

        const out: unknown[] = [];
        const concurrency = 4;
        for (let i = 0; i < ranges.length; i += concurrency) {
          const chunk = ranges.slice(i, i + concurrency);
          const batches = await Promise.all(
            chunk.map(({ from, to }) =>
              client.request<unknown>(
                svc,
                svc === 'report/select_result_rows'
                  ? {
                      tableIndex,
                      config: {
                        type: 'range',
                        data: {
                          from,
                          to,
                          level: Math.max(level ?? 1, 1),
                          flat: 1,
                          rawValues: 1,
                        },
                      },
                    }
                  : { tableIndex, indexFrom: from, indexTo: to },
              ),
            ),
          );
          for (const rowData of batches) {
            const batch = Array.isArray(rowData)
              ? rowData
              : Array.isArray((rowData as { rows?: unknown[] })?.rows)
                ? (rowData as { rows: unknown[] }).rows
                : [];
            if (batch.length) out.push(...batch);
          }
        }
        return out;
      };

      try {
        let tables: Array<Record<string, unknown>> =
          result.reportResult?.tables ?? result.tables ?? [];
        if (!tables.length) {
          const applied = await client.request<typeof result>('report/apply_report_result', {});
          tables = applied.reportResult?.tables ?? applied.tables ?? [];
          if (tables.length) result = applied;
        }
        if (!tables.length) {
          const tablesRes = await client.request<{ tables?: Array<Record<string, unknown>> }>(
            'report/get_report_tables',
            {},
          );
          tables = tablesRes.tables ?? [];
        }

        for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
          const meta = tables[tableIndex];
          const totalRows = Number(meta.rows ?? 0);
          const level = Number(meta.level ?? 1);
          const tableName = String(meta.name ?? `table_${tableIndex}`);
          const tableLabel = String(meta.label ?? meta.name ?? `Table ${tableIndex + 1}`);
          let columns = columnsFromTableMeta(meta, tableLabel);

          const fetchTo = Math.min(totalRows, maxRows);
          let rawRows: unknown[] = [];

          if (fetchTo > 0) {
            // Multilevel reports only expose nested events via select_result_rows (flat).
            if (level > 1) {
              try {
                rawRows = await fetchRowBatches(
                  tableIndex,
                  fetchTo,
                  'report/select_result_rows',
                  level,
                );
              } catch {
                rawRows = [];
              }
            }

            if (!rawRows.length) {
              rawRows = await fetchRowBatches(tableIndex, fetchTo, 'report/get_result_rows');
            }

            rawRows = filterRawReportRowsToActiveUnits(rawRows, activeNames);
            rawRows = flattenReportRows(rawRows);
          }

          let parsed = rawRows.map((r) => parseWialonReportRow(r, columns));
          if (!columns.length && parsed.length) {
            columns = inferColumnsFromRows(parsed, columns);
            parsed = rawRows.map((r) => parseWialonReportRow(r, columns));
          }
          parsed = filterParsedReportRowsToActiveUnits(parsed, columns, activeNames);

          tablesOut.push({
            index: tableIndex,
            name: tableName,
            label: tableLabel,
            columns,
            rows: parsed,
            totalRows: parsed.length,
          });
        }

        // Wialon report charts (fuel volume graphs, etc.) — use official get_result_chart params.
        // Do not stop on the first miss; some templates leave sparse attachment indices.
        const attachments = (result.reportResult?.attachments ??
          result.attachments ??
          []) as Array<Record<string, unknown>>;
        const chartAttachmentIndexes = attachments
          .map((a, i) => {
            const type = String(a.type ?? a.t ?? a.n ?? '').toLowerCase();
            const name = String(a.name ?? a.nm ?? a.label ?? '');
            const looksChart =
              type.includes('chart') ||
              /chart|graph|fuel|volume/i.test(name) ||
              Number(a.type) === 2;
            return looksChart ? { index: i, name: name || `Chart ${i + 1}` } : null;
          })
          .filter(Boolean) as Array<{ index: number; name: string }>;

        const indexesToTry =
          chartAttachmentIndexes.length > 0
            ? chartAttachmentIndexes
            : Array.from({ length: 8 }, (_, i) => ({ index: i, name: `Chart ${i + 1}` }));

        for (const att of indexesToTry) {
          try {
            const chart = await client.request<unknown>('report/get_result_chart', {
              attachmentIndex: att.index,
              action: 1,
              width: 900,
              height: 360,
              autoScaleY: 1,
              pixelFrom: 0,
              pixelTo: 0,
              flags: 0,
            });
            if (chart == null) continue;
            if (typeof chart === 'object' && !Array.isArray(chart) && !Object.keys(chart as object).length) {
              continue;
            }

            let data: unknown = chart;
            if (typeof chart === 'string') {
              const s = chart.trim();
              data = s.startsWith('data:image/')
                ? { image: s }
                : { image: `data:image/png;base64,${s.replace(/\s+/g, '')}` };
            } else if (Buffer.isBuffer(chart)) {
              data = { image: `data:image/png;base64,${chart.toString('base64')}` };
            } else if (typeof chart === 'object') {
              const obj = chart as Record<string, unknown>;
              // Normalize common Wialon PNG / base64 fields for the frontend renderer.
              for (const key of ['image', 'png', 'base64', 'data', 'content'] as const) {
                const v = obj[key];
                if (typeof v === 'string' && v.length > 40 && !v.startsWith('data:image/') && !/^https?:/i.test(v)) {
                  obj[key] = `data:image/png;base64,${v.replace(/\s+/g, '')}`;
                }
              }
              if (!obj.name && att.name) obj.name = att.name;
              data = obj;
            }

            chartsOut.push({
              index: att.index,
              name: String(
                (typeof data === 'object' && data && (data as { name?: string }).name) || att.name,
              ),
              data,
            });
          } catch {
            // Skip missing attachment indices; keep probing remaining charts.
          }
        }
      } catch (e) {
        console.warn('[WialonLiveService] report tables parse warning:', (e as Error).message);
      }

      await client.request('report/cleanup_result', {}).catch(() => undefined);

      const flatRows = tablesOut[0]?.rows ?? [];
      const totalRowCount = tablesOut.reduce((n, t) => n + t.rows.length, 0);

      return {
        result,
        rows: flatRows,
        tables: tablesOut,
        charts: chartsOut,
        summary: {
          tableCount: tablesOut.length,
          rowCount: totalRowCount,
          chartCount: chartsOut.length,
          generatedAt: new Date().toISOString(),
          interval: { from: input.from, to: input.to },
        },
      };
    });
  }

  static async listNotifications(credentials: WialonCredentialsInput, limit = 100) {
    const accountId = this.scopedAccount(credentials);
    return withWialonClient(credentials, async (client) => {
      const resources = await searchAll(client, resourceSearchSpec(accountId), 1025);
      const out: Array<{
        resourceId: number;
        resourceName: string;
        id: number;
        name: string;
        triggers?: number;
        active?: boolean;
      }> = [];
      for (const res of resources) {
        const unf = res.unf || {};
        for (const n of Object.values(unf)) {
          const nf = n as { id: number; n: string; ac?: number; ta?: number; td?: number };
          out.push({
            resourceId: res.id,
            resourceName: res.nm,
            id: nf.id,
            name: nf.n,
            triggers: nf.ac,
            active: !nf.td || nf.td > Math.floor(Date.now() / 1000),
          });
          if (out.length >= limit) return out;
        }
      }
      return out;
    });
  }

  static async listGeofences(credentials: WialonCredentialsInput, limit = 200) {
    const accountId = this.scopedAccount(credentials);
    return withWialonClient(credentials, async (client) => {
      const resources = await searchAll(client, resourceSearchSpec(accountId), WIALON_RESOURCE_GEOFENCES_FLAGS);
      const zones: Array<{
        resourceId: number;
        resourceName: string;
        id: number;
        name: string;
        type: 'circle' | 'polygon' | 'unknown';
        radius?: number;
        center?: { lat: number; lng: number };
      }> = [];
      for (const resource of resources) {
        const detail = await client.request<{
          item?: {
            zl?: Record<string, { id: number; n: string; t: number; w?: number; b?: { cen_x: number; cen_y: number } }>;
          };
        }>('core/search_item', { id: resource.id, flags: WIALON_RESOURCE_GEOFENCES_FLAGS });
        const zl = detail.item?.zl || {};
        for (const z of Object.values(zl)) {
          zones.push({
            resourceId: resource.id,
            resourceName: resource.nm,
            id: z.id,
            name: z.n,
            type: z.t === 3 ? 'circle' : z.t === 2 ? 'polygon' : 'unknown',
            radius: z.w,
            center: z.b ? { lat: z.b.cen_y, lng: z.b.cen_x } : undefined,
          });
          if (zones.length >= limit) return zones;
        }
      }
      return zones;
    });
  }

  static async listChildAccounts(credentials: WialonCredentialsInput) {
    return withWialonClient(credentials, async (client) => {
      const accounts = await searchAll(
        client,
        {
          itemsType: 'avl_resource',
          propName: 'rel_is_account',
          propValueMask: '1',
          sortType: 'sys_name',
          propType: 'property',
        },
        WIALON_RESOURCE_ACCOUNT_FLAGS
      );
      return accounts.map((a) => ({
        id: a.id,
        name: a.nm,
        parentAccountId: a.bpact,
      }));
    });
  }

  static async getVideoUnits(credentials: WialonCredentialsInput) {
    return withWialonClient(credentials, async (client) => {
      return client.request<Record<string, unknown>>('user/get_video_units', {});
    });
  }

  static async getUnitSensors(credentials: WialonCredentialsInput, unitId: number) {
    return withWialonClient(credentials, async (client) => {
      const result = await client.request<{ sensors?: Array<{ n: string; v: string; u?: string }> }>(
        'unit/calc_last_message',
        { unitId, sensors: [], flags: 1 }
      );
      return (result.sensors || []).map((s) => ({ name: s.n, value: s.v, unit: s.u }));
    });
  }

  static async getUnitDetail(credentials: WialonCredentialsInput, unitId: number) {
    return withWialonClient(credentials, async (client) => {
      const accountId = this.scopedAccount(credentials);
      const hwTypes = await loadWialonHwTypes(client, `hw:${accountId ?? 'all'}`);

      const result = await client.request<{ item?: WialonSearchItem }>('core/search_item', {
        id: unitId,
        flags: WIALON_UNIT_DETAIL_FLAGS,
      });
      const item = result.item;
      if (!item) throw new Error('Unit not found');

      let calcSensors: Array<{ n: string; v: string; u?: string; t?: number }> = [];
      try {
        const sens = await client.request<{ sensors?: Array<{ n: string; v: string; u?: string; t?: number }> }>(
          'unit/calc_last_message',
          { unitId, sensors: [], flags: 1 }
        );
        calcSensors = sens.sensors || [];
      } catch {
        /* sensors optional */
      }

      let video: Record<string, unknown> | undefined;
      try {
        video = await client.request<Record<string, unknown>>('unit/get_video_settings', { itemId: unitId });
      } catch {
        /* video optional */
      }

      let fuelSettings: Record<string, unknown> | undefined;
      try {
        fuelSettings = await client.request<Record<string, unknown>>('unit/get_fuel_settings', {
          itemId: unitId,
        });
      } catch {
        /* fuel settings optional */
      }

      let liveLls: import('./wialonFuel.js').WialonLlsReading[] | undefined;
      try {
        await subscribeFleetUnitsEvents(client, [unitId]);
        const ev = await client.request<Record<string, unknown>>('events/check_updates', {
          lang: 'en',
          measure: 0,
          detalization: 0x27,
        });
        const block = ev?.[String(unitId)] as Record<string, unknown> | undefined;
        if (block?.lls) {
          const sensDefs = item.sens
            ? Object.entries(item.sens).map(([id, s]) => ({ id: Number(id), name: s?.n || `Sensor ${id}` }))
            : [];
          liveLls = mergeLlsWithSensorNames(parseWialonLlsBlock(block.lls), sensDefs.filter((s) => s.id > 0));
        }
      } catch {
        /* live fuel optional */
      }

      return parseWialonUnitDetail(item, hwTypes, calcSensors, video, fuelSettings, liveLls);
    });
  }

  static async reverseGeocode(credentials: WialonCredentialsInput, lat: number, lng: number) {
    return wialonReverseGeocodeFull(credentials, lat, lng);
  }

  static async getUnitDetailWithAddress(credentials: WialonCredentialsInput, unitId: number) {
    const detail = await this.getUnitDetail(credentials, unitId);
    if (detail.position?.lat != null && detail.position?.lng != null) {
      const geo = await this.reverseGeocode(
        credentials,
        detail.position.lat,
        detail.position.lng
      ).catch(() => undefined);
      if (geo?.address) {
        return {
          ...detail,
          address: geo.address,
          addressParts: geo.parts,
        };
      }
    }
    return detail;
  }

  static async getUnitTrips(
    credentials: WialonCredentialsInput,
    unitId: number,
    from: Date,
    to: Date
  ) {
    return withWialonClient(credentials, async (client) => {
      const timeFrom = Math.floor(from.getTime() / 1000);
      const timeTo = Math.floor(to.getTime() / 1000);

      // unit/get_trips with msgsSource:1 requires messages/load_interval on the same session.
      let loadCount = 0;
      try {
        const load = await client.request<{ count?: number }>('messages/load_interval', {
          itemId: unitId,
          timeFrom,
          timeTo,
          flags: 1,
          flagsMask: 65281,
          loadCount: 1,
        });
        loadCount = load.count ?? 0;
      } catch (e) {
        const msg = (e as Error).message || '';
        // 1001 = no messages for interval
        if (/1001|No messages/i.test(msg)) return [];
        throw e;
      }

      if (!loadCount) {
        await client.request('messages/unload', {}).catch(() => undefined);
        return [];
      }

      try {
        const result = await client.request<
          Array<Record<string, unknown>> | { trips?: Array<Record<string, unknown>> }
        >('unit/get_trips', {
          itemId: unitId,
          timeFrom,
          timeTo,
          msgsSource: 1,
        });
        const raw = Array.isArray(result) ? result : result.trips ?? [];
        return raw.map((trip) => {
          const fromBlock = trip.from as Record<string, unknown> | undefined;
          const toBlock = trip.to as Record<string, unknown> | undefined;
          const t1 = Number(fromBlock?.t ?? trip.t1 ?? trip.tm ?? trip.begin ?? 0);
          const t2 = Number(toBlock?.t ?? trip.t2 ?? trip.end ?? 0);
          const meters = Number(trip.m ?? trip.distance ?? trip.mileage ?? 0);
          const mileageKm =
            Number.isFinite(meters) && meters > 0
              ? meters > 500
                ? meters / 1000
                : meters
              : 0;
          return {
            ...trip,
            t1: Number.isFinite(t1) ? t1 : 0,
            t2: Number.isFinite(t2) ? t2 : 0,
            mileage: Math.round(mileageKm * 100) / 100,
          };
        });
      } catch (e) {
        const msg = (e as Error).message || '';
        if (/1001|No messages/i.test(msg)) return [];
        throw e;
      } finally {
        await client.request('messages/unload', {}).catch(() => undefined);
      }
    });
  }

  static async getUnitTrack(
    credentials: WialonCredentialsInput,
    unitId: number,
    from: Date,
    to: Date,
    batchSize = 1000,
    maxPoints = 50_000
  ) {
    return withWialonClient(credentials, async (client) => {
      const timeFrom = Math.floor(from.getTime() / 1000);
      const timeTo = Math.floor(to.getTime() / 1000);

      type Msg = {
        pos?: { x: number; y: number; s: number; c?: number };
        t: number;
        p?: Record<string, unknown>;
      };

      const loadMessages = async (flags: number, flagsMask: number) => {
        try {
          return await client.request<{ count?: number }>('messages/load_interval', {
            itemId: unitId,
            timeFrom,
            timeTo,
            flags,
            flagsMask,
            loadCount: batchSize,
          });
        } catch (e) {
          const msg = (e as Error).message || '';
          if (/1001|No messages/i.test(msg)) return { count: 0 };
          throw e;
        }
      };

      // Prefer GPS-position data messages; fall back to unfiltered if Hosting-style layer is empty.
      let load = await loadMessages(1, 65281);
      if (!(load.count ?? 0)) {
        await client.request('messages/unload', {}).catch(() => undefined);
        load = await loadMessages(1, 0);
      }
      if (!(load.count ?? 0)) {
        await client.request('messages/unload', {}).catch(() => undefined);
        load = await loadMessages(0, 0);
      }

      const count = load.count ?? 0;
      if (!count) {
        await client.request('messages/unload', {}).catch(() => undefined);
        return [];
      }

      const asMessages = (raw: unknown): Msg[] => {
        if (Array.isArray(raw)) return raw as Msg[];
        if (raw && typeof raw === 'object' && Array.isArray((raw as { messages?: Msg[] }).messages)) {
          return (raw as { messages: Msg[] }).messages;
        }
        return [];
      };

      const fetchRange = async (indexFrom: number, indexTo: number): Promise<Msg[]> => {
        const batch = await client.request<unknown>('messages/get_messages', {
          indexFrom,
          indexTo,
        });
        return asMessages(batch);
      };

      const allMessages: Msg[] = [];

      if (count <= maxPoints) {
        let indexFrom = 0;
        while (indexFrom < count) {
          const indexTo = Math.min(indexFrom + batchSize - 1, count - 1);
          const batch = await fetchRange(indexFrom, indexTo);
          if (batch.length) allMessages.push(...batch);
          indexFrom = indexTo + 1;
        }
      } else {
        // Evenly downsample indices across the interval, then fetch contiguous ranges.
        const picked = new Set<number>();
        for (let i = 0; i < maxPoints; i++) {
          picked.add(Math.min(count - 1, Math.round((i * (count - 1)) / (maxPoints - 1))));
        }
        picked.add(0);
        picked.add(count - 1);
        const indices = [...picked].sort((a, b) => a - b);

        const ranges: Array<{ from: number; to: number }> = [];
        for (const idx of indices) {
          const last = ranges[ranges.length - 1];
          if (last && idx <= last.to + 1) {
            last.to = idx;
          } else {
            ranges.push({ from: idx, to: idx });
          }
        }

        for (const range of ranges) {
          let indexFrom = range.from;
          while (indexFrom <= range.to) {
            const indexTo = Math.min(indexFrom + batchSize - 1, range.to);
            const batch = await fetchRange(indexFrom, indexTo);
            if (batch.length) {
              for (let i = 0; i < batch.length; i++) {
                const absIdx = indexFrom + i;
                if (picked.has(absIdx)) allMessages.push(batch[i]);
              }
            }
            indexFrom = indexTo + 1;
          }
        }
      }

      await client.request('messages/unload', {}).catch(() => undefined);

      return allMessages
        .filter((m) => m.pos && m.pos.y != null && m.pos.x != null)
        .map((m) => {
          const params: Record<string, string | number> = {};
          if (m.p && typeof m.p === 'object') {
            for (const [k, v] of Object.entries(m.p)) {
              if (v == null || v === '') continue;
              if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
                params[k] = typeof v === 'boolean' ? Number(v) : v;
              }
            }
          }
          return {
            lat: m.pos!.y,
            lng: m.pos!.x,
            speed: m.pos!.s ?? 0,
            course: m.pos!.c,
            time: m.t,
            params: Object.keys(params).length ? params : undefined,
          };
        });
    });
  }

  static async getUnitCommands(credentials: WialonCredentialsInput, unitId: number): Promise<WialonCommandDef[]> {
    return withWialonClient(credentials, async (client) => {
      let commandIds: number[] = [];

      try {
        const configured = await client.request<{ item?: { cml?: Record<string, Record<string, unknown>> } }>(
          'core/search_item',
          { id: unitId, flags: WIALON_UNIT_FLAG.COMMANDS }
        );
        const fromCml = parseWialonCommandList(configured.item?.cml);
        if (fromCml.length) return fromCml;
        commandIds = Object.values(configured.item?.cml ?? {})
          .map((c) => Number(c?.id))
          .filter((id) => Number.isFinite(id) && id > 0);
      } catch {
        /* try other sources */
      }

      try {
        const available = await client.request<{ item?: { cmds?: Array<Record<string, unknown>> } }>(
          'core/search_item',
          { id: unitId, flags: WIALON_UNIT_FLAG.COMMANDS_AVAILABLE }
        );
        const fromAvailable = parseWialonAvailableCommands(available.item?.cmds);
        if (fromAvailable.length) return fromAvailable;
      } catch {
        /* try definition API */
      }

      try {
        if (commandIds.length) {
          const result = await client.request<unknown>('unit/get_command_definition_data', {
            itemId: unitId,
            col: commandIds,
          });
          const parsed = parseWialonCommandDefinitionData(result);
          if (parsed.length) return parsed;
        }
        const result = await client.request<unknown>('unit/get_command_definition_data', { itemId: unitId });
        return parseWialonCommandDefinitionData(result);
      } catch {
        return [];
      }
    });
  }

  static async sendUnitCommand(
    credentials: WialonCredentialsInput,
    unitId: number,
    commandName: string,
    param: Record<string, unknown> | string = {}
  ) {
    let linkType = '';
    let paramStr = typeof param === 'string' ? param : '';
    if (typeof param !== 'string' && param && Object.keys(param).length) {
      paramStr = JSON.stringify(param);
    }

    try {
      const defs = await this.getUnitCommands(credentials, unitId);
      const def = defs.find((c) => c.name === commandName);
      if (def?.linkType != null) linkType = def.linkType;
      if (!paramStr && def?.params != null && def.params !== '') {
        paramStr = String(def.params);
      }
    } catch {
      /* use auto link type */
    }

    return withWialonClient(credentials, async (client) =>
      client.request('unit/exec_cmd', {
        itemId: unitId,
        commandName,
        linkType,
        param: paramStr,
        timeout: 60,
        flags: 0,
      })
    );
  }

  /** Fetch unit icon PNG bytes from Wialon hosting (uses active session). */
  static async fetchUnitIcon(
    credentials: WialonCredentialsInput,
    unitId: number,
    size = 32,
    ugi = 1
  ): Promise<ArrayBuffer> {
    return withWialonClient(credentials, async (client) => {
      const sid = client.getSessionId();
      if (!sid) throw new Error('No Wialon session');
      const host = wialonHostFromBaseUrl(credentials.baseUrl);

      const download = async (ugiVal: number) => {
        const url = `${wialonUnitIconUrl(host, unitId, size, ugiVal)}?sid=${encodeURIComponent(sid)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Wialon icon HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (!buf.byteLength) throw new Error('Empty Wialon icon');
        return buf;
      };

      try {
        return await download(ugi);
      } catch {
        if (ugi === 1) throw new Error('Wialon icon unavailable');
        return download(1);
      }
    });
  }

  static async createGeofenceZone(
    credentials: WialonCredentialsInput,
    payload: {
      resourceId?: number;
      name: string;
      type: 'circle' | 'polygon';
      center?: { lat: number; lng: number };
      radius?: number;
      points?: Array<{ lat: number; lng: number }>;
      color?: number;
    }
  ) {
    return withWialonClient(credentials, async (client) => {
      let resourceId = payload.resourceId;
      if (!resourceId) {
        const accountId = this.scopedAccount(credentials);
        const resources = await searchAll(client, resourceSearchSpec(accountId), WIALON_RESOURCE_GEOFENCES_FLAGS);
        if (!resources.length) throw new Error('No Wialon resource found for geofences');
        resourceId = resources[0].id;
      }
      const isCircle = payload.type === 'circle';
      const lat = payload.center?.lat ?? 0;
      const lng = payload.center?.lng ?? 0;
      const zone: Record<string, unknown> = {
        itemId: resourceId,
        id: 0,
        callMode: 'create',
        n: payload.name,
        t: isCircle ? 3 : 2,
        w: payload.radius ?? 100,
        c: payload.color ?? 256,
      };
      if (isCircle) {
        zone.b = {
          cen_x: lng,
          cen_y: lat,
          min_x: lng - 0.001,
          min_y: lat - 0.001,
          max_x: lng + 0.001,
          max_y: lat + 0.001,
        };
      } else if (payload.points?.length) {
        zone.p = payload.points.map((p) => ({ x: p.lng, y: p.lat, r: 0 }));
      }
      return client.request('resource/update_zone', zone);
    });
  }

  static async proxy(
    credentials: WialonCredentialsInput,
    svc: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!isAllowedWialonSvc(svc)) {
      throw new Error(`Wialon API method not allowed: ${svc}`);
    }
    return withWialonClient(credentials, (client) => client.request(svc, params));
  }
}
