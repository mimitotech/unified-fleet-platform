import { getTenantSlug } from "@/lib/api";
import {
  DASHBOARD_WIDGET_DEFS,
  type DashboardWidgetId,
} from "@/lib/dashboardWidgetPrefs";

/** Grid width in columns of 12 (4 = 1/3, 6 = 1/2, 8 = 2/3, 12 = full). */
export type DashboardColSpan = 4 | 6 | 8 | 12;
export type DashboardRowSpan = 1 | 2;

export type DashboardLayoutItem = {
  id: string;
  w: DashboardColSpan;
  h: DashboardRowSpan;
};

export type DashboardLayoutState = {
  order: string[];
  sizes: Record<string, { w: DashboardColSpan; h: DashboardRowSpan }>;
};

/** Default spans for known chart instances (visibility id or instance id). */
const DEFAULT_SIZES: Record<
  string,
  { w: DashboardColSpan; h: DashboardRowSpan }
> = {
  alerts_trend: { w: 8, h: 1 },
  alerts_types: { w: 8, h: 1 },
  fuel_consumed_monetary: { w: 8, h: 1 },
  fuel_trend: { w: 8, h: 1 },
  tank_risk: { w: 8, h: 1 },
  fuel_assets_consume: { w: 6, h: 1 },
  fuel_assets_money: { w: 6, h: 1 },
};

export const DEFAULT_LAYOUT_ORDER: string[] = [
  ...DASHBOARD_WIDGET_DEFS.map((d) => d.id),
  "fuel_assets_consume",
  "fuel_assets_money",
  "top_fuel_leaders",
];

/** Map layout instance → visibility toggle id. */
export function visibilityIdForLayout(
  instanceId: string,
): DashboardWidgetId | null {
  if (
    instanceId === "fuel_assets_consume" ||
    instanceId === "top_fuel_leaders"
  ) {
    return "top_fuel_consumption";
  }
  if (instanceId === "fuel_assets_money") return "fuel_consumed_monetary";
  if (DASHBOARD_WIDGET_DEFS.some((d) => d.id === instanceId)) {
    return instanceId as DashboardWidgetId;
  }
  return null;
}

export function defaultSizeFor(id: string): {
  w: DashboardColSpan;
  h: DashboardRowSpan;
} {
  return DEFAULT_SIZES[id] || { w: 4, h: 1 };
}

export function defaultDashboardLayout(): DashboardLayoutState {
  const sizes: DashboardLayoutState["sizes"] = {};
  for (const id of DEFAULT_LAYOUT_ORDER) {
    sizes[id] = defaultSizeFor(id);
  }
  return { order: [...DEFAULT_LAYOUT_ORDER], sizes };
}

function storageKey(slug?: string | null): string {
  return `mams_dashboard_layout:${slug || getTenantSlug() || "default"}`;
}

export function loadDashboardLayout(
  slug?: string | null,
): DashboardLayoutState {
  const defaults = defaultDashboardLayout();
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<DashboardLayoutState>;
    const order =
      Array.isArray(parsed.order) &&
      parsed.order.every((x) => typeof x === "string")
        ? mergeOrder(parsed.order, defaults.order)
        : defaults.order;
    const sizes = { ...defaults.sizes };
    if (parsed.sizes && typeof parsed.sizes === "object") {
      for (const [id, sz] of Object.entries(parsed.sizes)) {
        if (!sz || typeof sz !== "object") continue;
        const w = normalizeW(sz.w);
        const h = normalizeH(sz.h);
        if (w && h) sizes[id] = { w, h };
      }
    }
    return { order, sizes };
  } catch {
    return defaults;
  }
}

function mergeOrder(saved: string[], defaults: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of saved) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of defaults) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeW(v: unknown): DashboardColSpan | null {
  const n = Number(v);
  if (n === 4 || n === 6 || n === 8 || n === 12) return n;
  // Legacy 1|2|3 → 12-col
  if (n === 1) return 4;
  if (n === 2) return 8;
  if (n === 3) return 12;
  return null;
}

function normalizeH(v: unknown): DashboardRowSpan | null {
  const n = Number(v);
  if (n === 1 || n === 2) return n;
  return null;
}

export function saveDashboardLayout(
  layout: DashboardLayoutState,
  slug?: string | null,
): void {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

export function moveLayoutItem(
  layout: DashboardLayoutState,
  fromId: string,
  toId: string,
): DashboardLayoutState {
  if (fromId === toId) return layout;
  const order = layout.order.filter((id) => id !== fromId);
  const toIdx = order.indexOf(toId);
  if (toIdx < 0) {
    order.push(fromId);
  } else {
    order.splice(toIdx, 0, fromId);
  }
  return { ...layout, order };
}

export function resizeLayoutItem(
  layout: DashboardLayoutState,
  id: string,
  patch: Partial<{ w: DashboardColSpan; h: DashboardRowSpan }>,
): DashboardLayoutState {
  const prev = layout.sizes[id] || defaultSizeFor(id);
  return {
    ...layout,
    sizes: {
      ...layout.sizes,
      [id]: { w: patch.w ?? prev.w, h: patch.h ?? prev.h },
    },
  };
}

const W_STEPS: DashboardColSpan[] = [4, 6, 8, 12];

export function cycleWidth(w: DashboardColSpan, dir: 1 | -1): DashboardColSpan {
  const i = W_STEPS.indexOf(w);
  const next = Math.min(W_STEPS.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir));
  return W_STEPS[next]!;
}
