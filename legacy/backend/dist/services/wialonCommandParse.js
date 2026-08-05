export function parseWialonCommandDefinitionData(raw) {
    if (raw == null)
        return [];
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        const obj = raw;
        if (Array.isArray(obj.commands)) {
            return obj.commands
                .map((c) => mapCmd(c))
                .filter((c) => c.name);
        }
        if (obj.cml && typeof obj.cml === 'object') {
            return parseWialonCommandList(obj.cml);
        }
    }
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        if (typeof item === 'number' || item == null)
            continue;
        if (typeof item === 'object') {
            const cmd = mapCmd(item);
            if (cmd.name)
                out.push(cmd);
        }
    }
    if (!out.length && raw.length >= 2) {
        for (let i = 0; i < raw.length - 1; i += 2) {
            const cmd = raw[i + 1];
            if (cmd && typeof cmd === 'object') {
                const mapped = mapCmd(cmd);
                if (mapped.name)
                    out.push(mapped);
            }
        }
    }
    return out;
}
/** search_item flag 0x00080000 — cml map keyed by sequence number. */
export function parseWialonCommandList(cml) {
    if (!cml || typeof cml !== 'object')
        return [];
    return Object.values(cml)
        .filter((c) => c && typeof c === 'object')
        .map((c) => mapCmd(c))
        .filter((c) => c.name);
}
/** search_item flag 0x00000200 — cmds array (available now). */
export function parseWialonAvailableCommands(cmds) {
    if (!Array.isArray(cmds))
        return [];
    return cmds
        .map((c) => ({
        name: String(c.n ?? c.name ?? ''),
        label: String(c.n ?? c.name ?? ''),
        type: c.c != null ? String(c.c) : c.type != null ? String(c.type) : undefined,
        linkType: String(c.t ?? c.l ?? c.linkType ?? ''),
        params: c.p != null ? String(c.p) : c.params != null ? String(c.params) : undefined,
    }))
        .filter((c) => c.name);
}
function mapCmd(c) {
    const name = String(c.n ?? c.name ?? '');
    return {
        name,
        label: name,
        type: c.c != null ? String(c.c) : c.type != null ? String(c.type) : undefined,
        linkType: String(c.l ?? c.t ?? c.linkType ?? ''),
        params: c.p != null ? String(c.p) : c.params != null ? String(c.params) : undefined,
    };
}
