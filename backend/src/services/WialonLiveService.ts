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
          : await searchAll(client, unitSearchSpec(accountId), MIN_FLAGS);
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
          : await searchAll(client, unitSearchSpec(accountId), WIALON_UNIT_FLAGS);
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
      await client.request('report/exec_report', {
        reportResourceId: input.reportResourceId,
        reportTemplateId: input.reportTemplateId,
        reportObjectId: input.reportObjectId,
        reportObjectSecId: input.reportObjectSecId ?? 0,
        interval: { from: input.from, to: input.to, flags: 0 },
        remoteExec: 1,
      });

      for (let attempt = 0; attempt < 120; attempt++) {
        const statusRes = await client.request<{ status: number; error?: string }>('report/get_report_status', {});
        const code = statusRes.status;
        if (code === 4) break;
        if (code === 8 || code === 16) {
          throw new Error(statusRes.error || `Wialon report failed (status ${code})`);
        }
        await sleep(1000);
      }

      const result = await client.request<{
        reportResult?: { tables?: Array<Record<string, unknown>> };
        tables?: Array<Record<string, unknown>>;
      }>('report/apply_report_result', {});

      const tablesOut: WialonReportTableResult[] = [];
      const chartsOut: WialonReportChartResult[] = [];

      try {
        const embedded = result.reportResult?.tables ?? result.tables ?? [];
        let tables: Array<Record<string, unknown>> = embedded;
        if (!tables.length) {
          const tablesRes = await client.request<{
            tables?: Array<Record<string, unknown>>;
          }>('report/get_report_tables', {});
          tables = tablesRes.tables ?? [];
        }
        for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
          const meta = tables[tableIndex];
          const totalRows = Number(meta.rows ?? 0);
          const tableName = String(meta.name ?? `table_${tableIndex}`);
          const tableLabel = String(meta.label ?? meta.name ?? `Table ${tableIndex + 1}`);
          let columns = columnsFromTableMeta(meta, tableLabel);

          const fetchTo = Math.min(totalRows, maxRows);
          const rawRows: unknown[] = [];
          for (let indexFrom = 0; indexFrom < fetchTo; indexFrom += batchSize) {
            const indexTo = Math.min(indexFrom + batchSize - 1, fetchTo - 1);
            const rowData = await client.request<{ rows?: unknown[] }>('report/get_result_rows', {
              tableIndex,
              indexFrom,
              indexTo,
            });
            if (rowData.rows?.length) rawRows.push(...rowData.rows);
          }

          let parsed = rawRows.map((r) => parseWialonReportRow(r, columns));
          if (!columns.length && parsed.length) {
            columns = inferColumnsFromRows(parsed, columns);
            parsed = rawRows.map((r) => parseWialonReportRow(r, columns));
          }

          tablesOut.push({
            index: tableIndex,
            name: tableName,
            label: tableLabel,
            columns,
            rows: parsed,
            totalRows,
          });
        }

        for (let chartIndex = 0; chartIndex < 8; chartIndex++) {
          try {
            const chart = await client.request<unknown>('report/get_result_chart', { chartIndex });
            if (chart == null || (typeof chart === 'object' && !Object.keys(chart as object).length)) break;
            chartsOut.push({
              index: chartIndex,
              name: `Chart ${chartIndex + 1}`,
              data: chart,
            });
          } catch {
            break;
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
      const result = await client.request<{ trips?: Array<Record<string, unknown>> }>('unit/get_trips', {
        itemId: unitId,
        timeFrom: Math.floor(from.getTime() / 1000),
        timeTo: Math.floor(to.getTime() / 1000),
        msgsSource: 0,
      });
      return result.trips || [];
    });
  }

  static async getUnitTrack(
    credentials: WialonCredentialsInput,
    unitId: number,
    from: Date,
    to: Date,
    batchSize = 1000,
    maxPoints = 12_000
  ) {
    return withWialonClient(credentials, async (client) => {
      const timeFrom = Math.floor(from.getTime() / 1000);
      const timeTo = Math.floor(to.getTime() / 1000);

      const load = await client.request<{ count?: number }>('messages/load_interval', {
        itemId: unitId,
        timeFrom,
        timeTo,
        flags: 1,
        flagsMask: 65281,
        loadCount: batchSize,
      });

      const total = Math.min(load.count ?? 0, maxPoints);
      if (!total) return [];

      const allMessages: Array<{ pos?: { x: number; y: number; s: number; c?: number }; t: number }> = [];
      let indexFrom = 0;
      while (indexFrom < total) {
        const indexTo = Math.min(indexFrom + batchSize - 1, total - 1);
        const batch = await client.request<{
          messages?: Array<{ pos?: { x: number; y: number; s: number; c?: number }; t: number }>;
        }>('messages/load_first', { indexFrom, indexTo });
        if (batch.messages?.length) allMessages.push(...batch.messages);
        indexFrom = indexTo + 1;
      }

      await client.request('messages/unload', {}).catch(() => undefined);

      return allMessages
        .filter((m) => m.pos && m.pos.y != null && m.pos.x != null)
        .map((m) => ({
          lat: m.pos!.y,
          lng: m.pos!.x,
          speed: m.pos!.s ?? 0,
          course: m.pos!.c,
          time: m.t,
        }));
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
