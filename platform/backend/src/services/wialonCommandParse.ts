/** Wialon unit/get_command_definition_data returns [id, cmd, id, cmd, ...] */
export type WialonCommandDef = {
  name: string;
  label: string;
  type?: string;
  linkType: string;
  params?: string;
};

export function parseWialonCommandDefinitionData(raw: unknown): WialonCommandDef[] {
  if (raw == null) return [];

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.commands)) {
      return obj.commands
        .map((c) => mapCmd(c as Record<string, unknown>))
        .filter((c) => c.name);
    }
    if (obj.cml && typeof obj.cml === 'object') {
      return parseWialonCommandList(obj.cml as Record<string, Record<string, unknown>>);
    }
  }

  if (!Array.isArray(raw)) return [];

  const out: WialonCommandDef[] = [];
  for (const item of raw) {
    if (typeof item === 'number' || item == null) continue;
    if (typeof item === 'object') {
      const cmd = mapCmd(item as Record<string, unknown>);
      if (cmd.name) out.push(cmd);
    }
  }

  if (!out.length && raw.length >= 2) {
    for (let i = 0; i < raw.length - 1; i += 2) {
      const cmd = raw[i + 1];
      if (cmd && typeof cmd === 'object') {
        const mapped = mapCmd(cmd as Record<string, unknown>);
        if (mapped.name) out.push(mapped);
      }
    }
  }

  return out;
}

/** search_item flag 0x00080000 — cml map keyed by sequence number. */
export function parseWialonCommandList(
  cml: Record<string, Record<string, unknown>> | undefined
): WialonCommandDef[] {
  if (!cml || typeof cml !== 'object') return [];
  return Object.values(cml)
    .filter((c) => c && typeof c === 'object')
    .map((c) => mapCmd(c))
    .filter((c) => c.name);
}

/** search_item flag 0x00000200 — cmds array (available now). */
export function parseWialonAvailableCommands(
  cmds: Array<Record<string, unknown>> | undefined
): WialonCommandDef[] {
  if (!Array.isArray(cmds)) return [];
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

function mapCmd(c: Record<string, unknown>): WialonCommandDef {
  const name = String(c.n ?? c.name ?? '');
  return {
    name,
    label: name,
    type: c.c != null ? String(c.c) : c.type != null ? String(c.type) : undefined,
    linkType: String(c.l ?? c.t ?? c.linkType ?? ''),
    params: c.p != null ? String(c.p) : c.params != null ? String(c.params) : undefined,
  };
}
