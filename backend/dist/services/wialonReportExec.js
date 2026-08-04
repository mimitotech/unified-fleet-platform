function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
export function normalizeWialonReportTables(raw) {
    return raw.map((meta) => {
        const header = [];
        const headerTypes = [];
        const h = meta.header;
        const ht = meta.header_type;
        if (Array.isArray(h) && h.length) {
            for (let i = 0; i < h.length; i++) {
                header.push(String(h[i] ?? `Column ${i + 1}`));
                if (ht?.[i] != null)
                    headerTypes.push(ht[i]);
            }
        }
        else {
            const cols = Number(meta.columns ?? meta.cols ?? 0);
            for (let i = 0; i < cols; i++)
                header.push(`Column ${i + 1}`);
        }
        return {
            name: String(meta.name ?? ''),
            label: String(meta.label ?? meta.name ?? ''),
            rows: Number(meta.rows ?? 0),
            header,
            headerTypes: headerTypes.length ? headerTypes : undefined,
        };
    });
}
/** Read tables from apply_report_result (primary) or get_report_tables (fallback). */
export async function readWialonReportTables(client) {
    const applied = await client.request('report/apply_report_result', {});
    const embedded = applied.reportResult?.tables ?? applied.tables ?? [];
    if (embedded.length)
        return normalizeWialonReportTables(embedded);
    const tablesRes = await client.request('report/get_report_tables', {});
    return normalizeWialonReportTables(tablesRes.tables ?? []);
}
/** Run exec_report and return normalized table metadata (all Wialon tenants). */
export async function execWialonReportTables(client, input) {
    await client.request('report/cleanup_result', {}).catch(() => undefined);
    const execParams = {
        reportResourceId: input.reportResourceId,
        reportTemplateId: input.reportTemplateId,
        reportObjectId: input.reportObjectId,
        reportObjectSecId: input.reportObjectSecId ?? 0,
        interval: { from: input.fromTs, to: input.toTs, flags: 0 },
        // Force English headers so column detection stays on Wialon system types /
        // English substrings regardless of the account UI language. UI column
        // labels in our app never feed into this path.
        lang: 'en',
    };
    // Prefer sync when possible (same path as live report preview).
    try {
        const sync = await client.request('report/exec_report', { ...execParams, remoteExec: 0 });
        const embedded = sync.reportResult?.tables ?? sync.tables ?? [];
        if (embedded.length || sync.reportResult) {
            return normalizeWialonReportTables(embedded);
        }
    }
    catch {
        /* fall through to remote */
    }
    await client.request('report/cleanup_result', {}).catch(() => undefined);
    await client.request('report/exec_report', { ...execParams, remoteExec: 1 });
    const maxAttempts = input.pollAttempts ?? 90;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const statusRes = await client.request('report/get_report_status', {});
        const code = statusRes.status;
        if (code === 4)
            break;
        if (code === 8 || code === 16) {
            throw new Error(statusRes.error || `Wialon report failed (status ${code})`);
        }
        await sleep(attempt < 20 ? 200 : attempt < 40 ? 400 : 800);
    }
    return readWialonReportTables(client);
}
