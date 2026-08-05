import { isAllowedWialonSvc } from '../adapters/wialonProxyAllowlist.js';
import { WIALON_UNIT_FLAG, WIALON_RESOURCE_ACCOUNT_FLAGS, WIALON_RESOURCE_GEOFENCES_FLAGS, WIALON_UNIT_FLAGS, WIALON_UNIT_DETAIL_FLAGS, } from '../adapters/wialonUtils.js';
import { withWialonClient } from './WialonSessionService.js';
import { parseWialonAvailableCommands, parseWialonCommandDefinitionData, parseWialonCommandList, } from './wialonCommandParse.js';
import { accountIdFrom, activeUnitNameSet, filterActiveWialonUnits, resourceSearchSpec, routeSearchSpec, searchAll, searchUnitsForAccount, searchUnitsBasicForAccount, sleep, unitSearchSpec, } from './wialonLiveUtils.js';
import { wialonHostFromBaseUrl, wialonUnitIconUrl } from './wialonIcon.js';
import { parseWialonUnitDetail } from './wialonUnitDetail.js';
import { fuelLiveFromCalcSensors } from './wialonFuel.js';
import { subscribeFleetUnitsEvents, fetchFleetEventsUpdates } from './wialonEventsService.js';
import { mapWialonSearchItem, applyUnitEvents } from './wialonUnitMapper.js';
import { WialonUnitItemsCache } from './wialonUnitItemsCache.js';
import { deriveWialonHostingStatus } from './wialonUnitStatus.js';
import { loadWialonHwTypes, resolveHwName } from './wialonHwTypes.js';
import { wialonReverseGeocodeFull } from './wialonGeocode.js';
import { columnsFromTableMeta, flattenReportRows, filterParsedReportRowsToActiveUnits, filterRawReportRowsToActiveUnits, inferColumnsFromRows, parseWialonReportRow, } from './wialonReportParse.js';
export class WialonLiveService {
    static scopedAccount(credentials) {
        return accountIdFrom(credentials);
    }
    static async getCapabilities(credentials) {
        return withWialonClient(credentials, async (client) => {
            const user = client.getSessionUser();
            const meta = client.getLoginMeta();
            let accountData = null;
            try {
                accountData = await client.request('core/get_account_data', { type: 1 });
            }
            catch {
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
    static async listUnits(credentials, limit = 10_000) {
        return this.listUnitsDetailed(credentials, limit);
    }
    /** Lightweight unit list — no event polling, fuel enrichment, or sleeps (for video module). */
    static async listUnitsBasic(credentials, limit = 10_000) {
        const accountId = this.scopedAccount(credentials);
        const MIN_FLAGS = WIALON_UNIT_FLAG.BASE | WIALON_UNIT_FLAG.CONNECTION;
        return withWialonClient(credentials, async (client) => {
            const hwTypes = await loadWialonHwTypes(client, `hw:${accountId ?? 'all'}`);
            const items = accountId != null && !Number.isNaN(Number(accountId))
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
    static async listUnitsDetailed(credentials, limit = 10_000) {
        const accountId = this.scopedAccount(credentials);
        return withWialonClient(credentials, async (client) => {
            const hwTypes = await loadWialonHwTypes(client, `hw:${accountId ?? 'all'}`);
            const items = accountId != null && !Number.isNaN(Number(accountId))
                ? await searchUnitsForAccount(client, Number(accountId), limit)
                : filterActiveWialonUnits(await searchAll(client, unitSearchSpec(accountId), WIALON_UNIT_FLAGS));
            const sliced = items.slice(0, limit);
            const ids = sliced.map((u) => u.id);
            const accountKey = accountId != null ? String(accountId) : 'all';
            WialonUnitItemsCache.set(accountKey, sliced);
            let eventsMap = new Map();
            try {
                await subscribeFleetUnitsEvents(client, ids);
                await sleep(400);
                eventsMap = await fetchFleetEventsUpdates(client);
                const hasLls = [...eventsMap.values()].some((e) => e.fuelLls?.length);
                if (!hasLls) {
                    await sleep(800);
                    eventsMap = await fetchFleetEventsUpdates(client);
                }
            }
            catch {
                /* events optional — fall back to search_item status */
            }
            let units = sliced.map((u) => {
                const base = mapWialonSearchItem(u, hwTypes);
                return applyUnitEvents(base, u, eventsMap.get(u.id));
            });
            const fuelMissing = units.filter((u) => !u.fuel?.levelLiters &&
                !u.fuel?.levelFormatted &&
                u.sens.some((s) => /fuel|lls|tank/i.test(s.name) || /fuel level|lls/i.test(s.type)));
            if (fuelMissing.length) {
                const enriched = await Promise.all(fuelMissing.map(async (u) => {
                    try {
                        const sens = await client.request('unit/calc_last_message', { unitId: u.id, sensors: [], flags: 1 });
                        const live = fuelLiveFromCalcSensors(sens.sensors || [], u.sens.map((s) => ({ id: s.id, name: s.name })));
                        if (!live)
                            return u;
                        return { ...u, fuel: live, fuelLevel: u.fuelLevel };
                    }
                    catch {
                        return u;
                    }
                }));
                const byId = new Map(enriched.map((u) => [u.id, u]));
                units = units.map((u) => byId.get(u.id) ?? u);
            }
            return units;
        });
    }
    static async listRoutes(credentials, limit = 200) {
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
    static async listRouteRounds(credentials, routeId) {
        return withWialonClient(credentials, async (client) => {
            const result = await client.request('route/get_all_rounds', {
                itemId: routeId,
            });
            return result.rounds || [];
        });
    }
    static async listReportTemplates(credentials, limit = 400) {
        const accountId = this.scopedAccount(credentials);
        return withWialonClient(credentials, async (client) => {
            const resources = await searchAll(client, resourceSearchSpec(accountId), 8193);
            const templates = [];
            for (const res of resources) {
                const rep = res.rep || {};
                for (const t of Object.values(rep)) {
                    const tpl = t;
                    templates.push({
                        resourceId: res.id,
                        resourceName: res.nm,
                        id: tpl.id,
                        name: tpl.n,
                        type: tpl.ct,
                    });
                    if (templates.length >= limit)
                        return templates;
                }
            }
            return templates;
        });
    }
    static async executeReport(credentials, input) {
        const maxRows = Math.min(input.maxRowsPerTable ?? 5000, 10_000);
        const batchSize = 500;
        return withWialonClient(credentials, async (client) => {
            await client.request('report/cleanup_result', {}).catch(() => undefined);
            // Active units for this billing account — used to strip deactivated/removed assets from results.
            let activeNames = new Set();
            const accountId = accountIdFrom(credentials);
            try {
                if (accountId && Number.isFinite(Number(accountId))) {
                    const activeUnits = await searchUnitsForAccount(client, Number(accountId), 10_000);
                    activeNames = activeUnitNameSet(activeUnits);
                }
                else {
                    const all = filterActiveWialonUnits(await searchAll(client, unitSearchSpec(undefined), WIALON_UNIT_FLAGS));
                    activeNames = activeUnitNameSet(all);
                }
            }
            catch {
                activeNames = new Set();
            }
            const execParams = {
                reportResourceId: input.reportResourceId,
                reportTemplateId: input.reportTemplateId,
                reportObjectId: input.reportObjectId,
                reportObjectSecId: input.reportObjectSecId ?? 0,
                interval: { from: input.from, to: input.to, flags: 0 },
            };
            let result = {};
            // Prefer sync exec (remoteExec:0) — often finishes in one round-trip for moderate reports.
            let ready = false;
            try {
                result = await client.request('report/exec_report', {
                    ...execParams,
                    remoteExec: 0,
                });
                const syncTables = result.reportResult?.tables ?? result.tables ?? [];
                if (syncTables.length || result.reportResult)
                    ready = true;
            }
            catch {
                ready = false;
            }
            if (!ready) {
                await client.request('report/cleanup_result', {}).catch(() => undefined);
                await client.request('report/exec_report', { ...execParams, remoteExec: 1 });
                for (let attempt = 0; attempt < 90; attempt++) {
                    const statusRes = await client.request('report/get_report_status', {});
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
                if (!ready)
                    throw new Error('Wialon report timed out before completion');
                result = await client.request('report/apply_report_result', {});
            }
            const tablesOut = [];
            const chartsOut = [];
            const fetchRowBatches = async (tableIndex, fetchTo, svc, level) => {
                const ranges = [];
                for (let indexFrom = 0; indexFrom < fetchTo; indexFrom += batchSize) {
                    ranges.push({
                        from: indexFrom,
                        to: Math.min(indexFrom + batchSize - 1, fetchTo - 1),
                    });
                }
                const out = [];
                const concurrency = 4;
                for (let i = 0; i < ranges.length; i += concurrency) {
                    const chunk = ranges.slice(i, i + concurrency);
                    const batches = await Promise.all(chunk.map(({ from, to }) => client.request(svc, svc === 'report/select_result_rows'
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
                        : { tableIndex, indexFrom: from, indexTo: to })));
                    for (const rowData of batches) {
                        const batch = Array.isArray(rowData)
                            ? rowData
                            : Array.isArray(rowData?.rows)
                                ? rowData.rows
                                : [];
                        if (batch.length)
                            out.push(...batch);
                    }
                }
                return out;
            };
            try {
                let tables = result.reportResult?.tables ?? result.tables ?? [];
                if (!tables.length) {
                    const applied = await client.request('report/apply_report_result', {});
                    tables = applied.reportResult?.tables ?? applied.tables ?? [];
                    if (tables.length)
                        result = applied;
                }
                if (!tables.length) {
                    const tablesRes = await client.request('report/get_report_tables', {});
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
                    let rawRows = [];
                    if (fetchTo > 0) {
                        // Multilevel reports only expose nested events via select_result_rows (flat).
                        if (level > 1) {
                            try {
                                rawRows = await fetchRowBatches(tableIndex, fetchTo, 'report/select_result_rows', level);
                            }
                            catch {
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
                // Wialon report charts — PNG via get_result_chart (binary) + optional render_json.
                // Attachments on reportResult are chart/image slots (not tables).
                let attachments = (result.reportResult?.attachments ??
                    result.attachments ??
                    []);
                if (!attachments.length) {
                    try {
                        const applied = await client.request('report/apply_report_result', {});
                        attachments = (applied.reportResult?.attachments ?? applied.attachments ?? []);
                        if (attachments.length)
                            result = applied;
                    }
                    catch {
                        /* keep empty */
                    }
                }
                const chartCandidates = [];
                // reportResult.attachments are chart/image slots — try each index.
                for (let i = 0; i < attachments.length; i++) {
                    const a = attachments[i] || {};
                    const name = String(a.name ?? a.nm ?? a.label ?? a.n ?? `Chart ${i + 1}`);
                    chartCandidates.push({ index: i, name: name || `Chart ${i + 1}` });
                }
                const seen = new Set();
                const indexesToTry = chartCandidates.filter((c) => {
                    if (seen.has(c.index))
                        return false;
                    seen.add(c.index);
                    return true;
                });
                for (const att of indexesToTry) {
                    try {
                        let jsonData = null;
                        try {
                            const rendered = await client.request('report/render_json', {
                                attachmentIndex: att.index,
                                width: 1100,
                                useCrop: 0,
                            });
                            if (rendered &&
                                typeof rendered === 'object' &&
                                (rendered.datasets != null || rendered.markers != null)) {
                                jsonData = rendered;
                            }
                        }
                        catch {
                            /* fall through to PNG */
                        }
                        let imageData = null;
                        try {
                            // Official sample: action 0 + flags 513 (header above + legend below).
                            const png = await client.requestBinary('report/get_result_chart', {
                                attachmentIndex: att.index,
                                action: 0,
                                width: 1100,
                                height: 420,
                                autoScaleY: 1,
                                pixelFrom: 0,
                                pixelTo: 1100,
                                flags: 0x01 | 0x200, // 513
                            });
                            if (png && png.length > 64) {
                                const isPng = png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
                                if (isPng || png.length > 200) {
                                    imageData = { image: `data:image/png;base64,${png.toString('base64')}` };
                                }
                            }
                        }
                        catch (e) {
                            console.warn(`[WialonLiveService] get_result_chart[${att.index}] failed:`, e.message);
                        }
                        if (!jsonData && !imageData)
                            continue;
                        const data = {
                            ...(imageData || {}),
                            ...(jsonData || {}),
                            name: att.name,
                        };
                        if (jsonData?.datasets)
                            data.datasets = jsonData.datasets;
                        if (jsonData?.markers)
                            data.markers = jsonData.markers;
                        if (jsonData?.mmi)
                            data.mmi = jsonData.mmi;
                        if (jsonData?.interruptions)
                            data.interruptions = jsonData.interruptions;
                        chartsOut.push({
                            index: att.index,
                            name: String(data.name || att.name),
                            data,
                        });
                    }
                    catch {
                        // Skip missing attachment indices; keep probing remaining charts.
                    }
                }
            }
            catch (e) {
                console.warn('[WialonLiveService] report tables parse warning:', e.message);
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
    static async listNotifications(credentials, limit = 100) {
        const accountId = this.scopedAccount(credentials);
        return withWialonClient(credentials, async (client) => {
            const resources = await searchAll(client, resourceSearchSpec(accountId), 1025);
            const out = [];
            for (const res of resources) {
                const unf = res.unf || {};
                for (const n of Object.values(unf)) {
                    const nf = n;
                    out.push({
                        resourceId: res.id,
                        resourceName: res.nm,
                        id: nf.id,
                        name: nf.n,
                        triggers: nf.ac,
                        active: !nf.td || nf.td > Math.floor(Date.now() / 1000),
                    });
                    if (out.length >= limit)
                        return out;
                }
            }
            return out;
        });
    }
    static async listGeofences(credentials, limit = 200) {
        const accountId = this.scopedAccount(credentials);
        return withWialonClient(credentials, async (client) => {
            const resources = await searchAll(client, resourceSearchSpec(accountId), WIALON_RESOURCE_GEOFENCES_FLAGS);
            const zones = [];
            for (const resource of resources) {
                const detail = await client.request('core/search_item', { id: resource.id, flags: WIALON_RESOURCE_GEOFENCES_FLAGS });
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
                    if (zones.length >= limit)
                        return zones;
                }
            }
            return zones;
        });
    }
    static async listChildAccounts(credentials) {
        return withWialonClient(credentials, async (client) => {
            const accounts = await searchAll(client, {
                itemsType: 'avl_resource',
                propName: 'rel_is_account',
                propValueMask: '1',
                sortType: 'sys_name',
                propType: 'property',
            }, WIALON_RESOURCE_ACCOUNT_FLAGS);
            return accounts.map((a) => ({
                id: a.id,
                name: a.nm,
                parentAccountId: a.bpact,
            }));
        });
    }
    static async getVideoUnits(credentials) {
        return withWialonClient(credentials, async (client) => {
            return client.request('user/get_video_units', {});
        });
    }
    static async getUnitSensors(credentials, unitId) {
        return withWialonClient(credentials, async (client) => {
            const result = await client.request('unit/calc_last_message', { unitId, sensors: [], flags: 1 });
            return (result.sensors || []).map((s) => ({ name: s.n, value: s.v, unit: s.u }));
        });
    }
    static async getUnitDetail(credentials, unitId) {
        return withWialonClient(credentials, async (client) => {
            const accountId = this.scopedAccount(credentials);
            // Kick off HW types in parallel with the unit lookup (cached after first hit).
            const hwPromise = loadWialonHwTypes(client, `hw:${accountId ?? 'all'}`);
            const result = await client.request('core/search_item', {
                id: unitId,
                flags: WIALON_UNIT_DETAIL_FLAGS,
            });
            const item = result.item;
            if (!item)
                throw new Error('Unit not found');
            const sensorIds = item.sens
                ? Object.keys(item.sens)
                    .map((id) => Number(id))
                    .filter((id) => Number.isFinite(id) && id > 0)
                : [];
            // Sensors + optional video/fuel in parallel. Skip events/check_updates —
            // that round-trip was the main delay; calibrated sensors already carry fuel.
            const [hwTypes, calcSensors, video, fuelSettings] = await Promise.all([
                hwPromise,
                (async () => {
                    try {
                        const sens = await client.request('unit/calc_last_message', { unitId, sensors: [], flags: 1 });
                        if (sens.sensors?.length)
                            return sens.sensors;
                    }
                    catch {
                        /* retry below */
                    }
                    if (!sensorIds.length)
                        return [];
                    try {
                        const sens = await client.request('unit/calc_last_message', { unitId, sensors: sensorIds, flags: 1 });
                        return sens.sensors || [];
                    }
                    catch {
                        return [];
                    }
                })(),
                client
                    .request('unit/get_video_settings', { itemId: unitId })
                    .catch(() => undefined),
                client
                    .request('unit/get_fuel_settings', { itemId: unitId })
                    .catch(() => undefined),
            ]);
            return parseWialonUnitDetail(item, hwTypes, calcSensors, video, fuelSettings);
        });
    }
    static async reverseGeocode(credentials, lat, lng) {
        return wialonReverseGeocodeFull(credentials, lat, lng);
    }
    static async getUnitDetailWithAddress(credentials, unitId) {
        const detail = await this.getUnitDetail(credentials, unitId);
        if (detail.position?.lat != null && detail.position?.lng != null) {
            const geo = await this.reverseGeocode(credentials, detail.position.lat, detail.position.lng).catch(() => undefined);
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
    static async getUnitTrips(credentials, unitId, from, to) {
        return withWialonClient(credentials, async (client) => {
            const timeFrom = Math.floor(from.getTime() / 1000);
            const timeTo = Math.floor(to.getTime() / 1000);
            // unit/get_trips with msgsSource:1 requires messages/load_interval on the same session.
            let loadCount = 0;
            try {
                const load = await client.request('messages/load_interval', {
                    itemId: unitId,
                    timeFrom,
                    timeTo,
                    flags: 1,
                    flagsMask: 65281,
                    loadCount: 1,
                });
                loadCount = load.count ?? 0;
            }
            catch (e) {
                const msg = e.message || '';
                // 1001 = no messages for interval
                if (/1001|No messages/i.test(msg))
                    return [];
                throw e;
            }
            if (!loadCount) {
                await client.request('messages/unload', {}).catch(() => undefined);
                return [];
            }
            try {
                const result = await client.request('unit/get_trips', {
                    itemId: unitId,
                    timeFrom,
                    timeTo,
                    msgsSource: 1,
                });
                const raw = Array.isArray(result) ? result : result.trips ?? [];
                return raw.map((trip) => {
                    const fromBlock = trip.from;
                    const toBlock = trip.to;
                    const t1 = Number(fromBlock?.t ?? trip.t1 ?? trip.tm ?? trip.begin ?? 0);
                    const t2 = Number(toBlock?.t ?? trip.t2 ?? trip.end ?? 0);
                    const meters = Number(trip.m ?? trip.distance ?? trip.mileage ?? 0);
                    const mileageKm = Number.isFinite(meters) && meters > 0
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
            }
            catch (e) {
                const msg = e.message || '';
                if (/1001|No messages/i.test(msg))
                    return [];
                throw e;
            }
            finally {
                await client.request('messages/unload', {}).catch(() => undefined);
            }
        });
    }
    static async getUnitTrack(credentials, unitId, from, to, batchSize = 1000, maxPoints = 50_000) {
        return withWialonClient(credentials, async (client) => {
            const timeFrom = Math.floor(from.getTime() / 1000);
            const timeTo = Math.floor(to.getTime() / 1000);
            const loadMessages = async (flags, flagsMask) => {
                try {
                    return await client.request('messages/load_interval', {
                        itemId: unitId,
                        timeFrom,
                        timeTo,
                        flags,
                        flagsMask,
                        loadCount: batchSize,
                    });
                }
                catch (e) {
                    const msg = e.message || '';
                    if (/1001|No messages/i.test(msg))
                        return { count: 0 };
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
            const asMessages = (raw) => {
                if (Array.isArray(raw))
                    return raw;
                if (raw && typeof raw === 'object' && Array.isArray(raw.messages)) {
                    return raw.messages;
                }
                return [];
            };
            const fetchRange = async (indexFrom, indexTo) => {
                const batch = await client.request('messages/get_messages', {
                    indexFrom,
                    indexTo,
                });
                return asMessages(batch);
            };
            const allMessages = [];
            if (count <= maxPoints) {
                let indexFrom = 0;
                while (indexFrom < count) {
                    const indexTo = Math.min(indexFrom + batchSize - 1, count - 1);
                    const batch = await fetchRange(indexFrom, indexTo);
                    if (batch.length)
                        allMessages.push(...batch);
                    indexFrom = indexTo + 1;
                }
            }
            else {
                // Evenly downsample indices across the interval, then fetch contiguous ranges.
                const picked = new Set();
                for (let i = 0; i < maxPoints; i++) {
                    picked.add(Math.min(count - 1, Math.round((i * (count - 1)) / (maxPoints - 1))));
                }
                picked.add(0);
                picked.add(count - 1);
                const indices = [...picked].sort((a, b) => a - b);
                const ranges = [];
                for (const idx of indices) {
                    const last = ranges[ranges.length - 1];
                    if (last && idx <= last.to + 1) {
                        last.to = idx;
                    }
                    else {
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
                                if (picked.has(absIdx))
                                    allMessages.push(batch[i]);
                            }
                        }
                        indexFrom = indexTo + 1;
                    }
                }
            }
            await client.request('messages/unload', {}).catch(() => undefined);
            const mapped = allMessages
                .filter((m) => m.pos && m.pos.y != null && m.pos.x != null)
                .map((m) => {
                const params = {};
                if (m.p && typeof m.p === 'object') {
                    for (const [k, v] of Object.entries(m.p)) {
                        if (v == null || v === '')
                            continue;
                        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
                            params[k] = typeof v === 'boolean' ? Number(v) : v;
                        }
                    }
                }
                return {
                    lat: m.pos.y,
                    lng: m.pos.x,
                    speed: m.pos.s ?? 0,
                    course: m.pos.c,
                    time: m.t,
                    params: Object.keys(params).length ? params : undefined,
                };
            })
                .filter((p) => {
                if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng))
                    return false;
                if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)
                    return false;
                if (p.lat === 0 && p.lng === 0)
                    return false;
                return true;
            });
            // Drop contiguous GPS teleports so clients never draw continent-spanning polylines.
            const MAX_JUMP_M = 3_000;
            const toRad = (d) => (d * Math.PI) / 180;
            const distM = (a, b) => {
                const dLat = toRad(b.lat - a.lat);
                const dLng = toRad(b.lng - a.lng);
                const lat1 = toRad(a.lat);
                const lat2 = toRad(b.lat);
                const h = Math.sin(dLat / 2) ** 2 +
                    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
                return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
            };
            const cleaned = [];
            for (const p of mapped) {
                const prev = cleaned[cleaned.length - 1];
                if (prev && distM(prev, p) > MAX_JUMP_M) {
                    // Start a new contiguous segment (prefer recent path).
                    cleaned.length = 0;
                }
                if (prev && distM(prev, p) < 1)
                    continue;
                cleaned.push(p);
            }
            return cleaned;
        });
    }
    static async getUnitCommands(credentials, unitId) {
        return withWialonClient(credentials, async (client) => {
            let commandIds = [];
            try {
                const configured = await client.request('core/search_item', { id: unitId, flags: WIALON_UNIT_FLAG.COMMANDS });
                const fromCml = parseWialonCommandList(configured.item?.cml);
                if (fromCml.length)
                    return fromCml;
                commandIds = Object.values(configured.item?.cml ?? {})
                    .map((c) => Number(c?.id))
                    .filter((id) => Number.isFinite(id) && id > 0);
            }
            catch {
                /* try other sources */
            }
            try {
                const available = await client.request('core/search_item', { id: unitId, flags: WIALON_UNIT_FLAG.COMMANDS_AVAILABLE });
                const fromAvailable = parseWialonAvailableCommands(available.item?.cmds);
                if (fromAvailable.length)
                    return fromAvailable;
            }
            catch {
                /* try definition API */
            }
            try {
                if (commandIds.length) {
                    const result = await client.request('unit/get_command_definition_data', {
                        itemId: unitId,
                        col: commandIds,
                    });
                    const parsed = parseWialonCommandDefinitionData(result);
                    if (parsed.length)
                        return parsed;
                }
                const result = await client.request('unit/get_command_definition_data', { itemId: unitId });
                return parseWialonCommandDefinitionData(result);
            }
            catch {
                return [];
            }
        });
    }
    static async sendUnitCommand(credentials, unitId, commandName, param = {}) {
        let linkType = '';
        let paramStr = typeof param === 'string' ? param : '';
        if (typeof param !== 'string' && param && Object.keys(param).length) {
            paramStr = JSON.stringify(param);
        }
        try {
            const defs = await this.getUnitCommands(credentials, unitId);
            const def = defs.find((c) => c.name === commandName);
            if (def?.linkType != null)
                linkType = def.linkType;
            if (!paramStr && def?.params != null && def.params !== '') {
                paramStr = String(def.params);
            }
        }
        catch {
            /* use auto link type */
        }
        return withWialonClient(credentials, async (client) => client.request('unit/exec_cmd', {
            itemId: unitId,
            commandName,
            linkType,
            param: paramStr,
            timeout: 60,
            flags: 0,
        }));
    }
    /** Fetch unit icon PNG bytes from Wialon hosting (uses active session). */
    static async fetchUnitIcon(credentials, unitId, size = 32, ugi = 1) {
        return withWialonClient(credentials, async (client) => {
            const sid = client.getSessionId();
            if (!sid)
                throw new Error('No Wialon session');
            const host = wialonHostFromBaseUrl(credentials.baseUrl);
            const download = async (ugiVal) => {
                const url = `${wialonUnitIconUrl(host, unitId, size, ugiVal)}?sid=${encodeURIComponent(sid)}`;
                const res = await fetch(url);
                if (!res.ok)
                    throw new Error(`Wialon icon HTTP ${res.status}`);
                const buf = await res.arrayBuffer();
                if (!buf.byteLength)
                    throw new Error('Empty Wialon icon');
                return buf;
            };
            try {
                return await download(ugi);
            }
            catch {
                if (ugi === 1)
                    throw new Error('Wialon icon unavailable');
                return download(1);
            }
        });
    }
    static async createGeofenceZone(credentials, payload) {
        return withWialonClient(credentials, async (client) => {
            let resourceId = payload.resourceId;
            if (!resourceId) {
                const accountId = this.scopedAccount(credentials);
                const resources = await searchAll(client, resourceSearchSpec(accountId), WIALON_RESOURCE_GEOFENCES_FLAGS);
                if (!resources.length)
                    throw new Error('No Wialon resource found for geofences');
                resourceId = resources[0].id;
            }
            const isCircle = payload.type === 'circle';
            const lat = payload.center?.lat ?? 0;
            const lng = payload.center?.lng ?? 0;
            const zone = {
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
            }
            else if (payload.points?.length) {
                zone.p = payload.points.map((p) => ({ x: p.lng, y: p.lat, r: 0 }));
            }
            return client.request('resource/update_zone', zone);
        });
    }
    static async proxy(credentials, svc, params) {
        if (!isAllowedWialonSvc(svc)) {
            throw new Error(`Wialon API method not allowed: ${svc}`);
        }
        return withWialonClient(credentials, (client) => client.request(svc, params));
    }
}
