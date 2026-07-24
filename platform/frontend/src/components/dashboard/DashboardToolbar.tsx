import { LayoutGrid, Loader2, MoreVertical, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PeriodAssetControls,
  type PeriodPreset,
  shiftDays,
} from "@/components/shared/PeriodAssetControls";
import {
  DASHBOARD_WIDGET_DEFS,
  type DashboardWidgetId,
  type DashboardWidgetVisibility,
} from "@/lib/dashboardWidgetPrefs";
import { cn } from "@/lib/utils";

export function DashboardToolbar({
  todayStr,
  draftFrom,
  draftTo,
  draftPreset,
  onDraftFrom,
  onDraftTo,
  onDraftPreset,
  onExecute,
  executing = false,
  visibility,
  onToggleWidget,
  enabledModules,
  isAdmin,
  arrangeMode = false,
  onArrangeMode,
  onResetLayout,
}: {
  todayStr: string;
  draftFrom: string;
  draftTo: string;
  draftPreset: PeriodPreset | "custom";
  onDraftFrom: (v: string) => void;
  onDraftTo: (v: string) => void;
  onDraftPreset: (p: PeriodPreset | "custom") => void;
  onExecute: () => void;
  executing?: boolean;
  visibility: DashboardWidgetVisibility;
  onToggleWidget: (id: DashboardWidgetId, next: boolean) => void;
  enabledModules: Set<string>;
  isAdmin: boolean;
  arrangeMode?: boolean;
  onArrangeMode?: (next: boolean) => void;
  onResetLayout?: () => void;
}) {
  const menuItems = DASHBOARD_WIDGET_DEFS.filter((def) => {
    if (def.id === "users_by_role") return isAdmin;
    if (!def.module) return true;
    return enabledModules.has(def.module);
  });

  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 sm:px-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
        <div>
          <p className="text-xs font-semibold text-foreground">
            Dashboard period
          </p>
          <p className="text-[11px] text-muted-foreground">
            Choose a range, then Execute — charts and KPIs update together
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          {onArrangeMode && (
            <Button
              type="button"
              size="sm"
              variant={arrangeMode ? "default" : "outline"}
              className="h-8 gap-1.5"
              aria-pressed={arrangeMode}
              aria-label="Arrange charts"
              onClick={() => onArrangeMode(!arrangeMode)}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              {arrangeMode ? "Done" : "Arrange"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                aria-label="Customize charts"
              >
                <MoreVertical className="h-4 w-4" />
                Charts
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64 max-h-[min(70vh,420px)] overflow-y-auto"
            >
              <DropdownMenuLabel className="text-xs">
                Chart widgets
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {menuItems.map((def) => (
                <DropdownMenuCheckboxItem
                  key={def.id}
                  checked={visibility[def.id] !== false}
                  onCheckedChange={(checked) =>
                    onToggleWidget(def.id, Boolean(checked))
                  }
                  onSelect={(e) => e.preventDefault()}
                  className={cn("text-xs")}
                >
                  {def.label}
                </DropdownMenuCheckboxItem>
              ))}
              {onResetLayout && (
                <>
                  <DropdownMenuSeparator />
                  <button
                    type="button"
                    className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent"
                    onClick={() => onResetLayout()}
                  >
                    Reset chart layout
                  </button>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <PeriodAssetControls
        fromDate={draftFrom}
        toDate={draftTo}
        todayStr={todayStr}
        hideAsset
        activePreset={draftPreset}
        onFromChange={(v) => {
          onDraftPreset("custom");
          onDraftFrom(v);
        }}
        onToChange={(v) => {
          onDraftPreset("custom");
          onDraftTo(v);
        }}
        onPreset={(p) => {
          onDraftPreset(p);
          if (p === "today") {
            onDraftFrom(todayStr);
            onDraftTo(todayStr);
            return;
          }
          const days = p === "7d" ? 6 : p === "14d" ? 13 : 29;
          onDraftFrom(shiftDays(todayStr, -days));
          onDraftTo(todayStr);
        }}
        trailing={
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 text-xs min-w-[96px]"
            onClick={onExecute}
            disabled={executing}
          >
            {executing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Updating
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Execute
              </>
            )}
          </Button>
        }
        className="w-full"
      />
    </div>
  );
}
