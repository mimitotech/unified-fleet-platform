import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { GripVertical, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cycleWidth,
  defaultSizeFor,
  type DashboardColSpan,
  type DashboardLayoutState,
  type DashboardRowSpan,
} from "@/lib/dashboardLayoutPrefs";
import { cn } from "@/lib/utils";

type ArrangeItemProps = {
  id: string;
  children: ReactNode;
  className?: string;
  /** Injected by board */
  editMode?: boolean;
  size?: { w: DashboardColSpan; h: DashboardRowSpan };
  onDragStartItem?: (id: string) => void;
  onDropOnItem?: (id: string, fromId?: string) => void;
  onCycleWidth?: (id: string, dir: 1 | -1) => void;
  onToggleHeight?: (id: string) => void;
};

/** Mark a chart as arrangeable. Must be a direct child of DashboardArrangeBoard. */
export function DashboardArrangeItem({
  id,
  children,
  className,
  editMode = false,
  size,
  onDragStartItem,
  onDropOnItem,
  onCycleWidth,
  onToggleHeight,
}: ArrangeItemProps) {
  const w = size?.w ?? 4;
  const h = size?.h ?? 1;
  const [over, setOver] = useState(false);

  return (
    <div
      className={cn(
        "relative min-w-0 col-span-4",
        w === 4 && "md:col-span-4",
        w === 6 && "md:col-span-6",
        w === 8 && "md:col-span-8",
        w === 12 && "md:col-span-12",
        editMode &&
          "rounded-xl ring-1 ring-dashed ring-primary/35 bg-primary/[0.03]",
        over && editMode && "ring-2 ring-primary bg-primary/10",
        h === 2 && "[&>section]:min-h-[400px]",
        className,
      )}
      style={h === 2 ? { minHeight: 420 } : undefined}
      data-arrange-id={id}
      onDragOver={
        editMode
          ? (e) => {
              e.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragLeave={editMode ? () => setOver(false) : undefined}
      onDrop={
        editMode
          ? (e) => {
              e.preventDefault();
              setOver(false);
              const from = e.dataTransfer.getData("text/plain") || undefined;
              onDropOnItem?.(id, from);
            }
          : undefined
      }
    >
      {editMode && (
        <div
          data-no-print
          className="absolute top-2 right-2 z-20 flex items-center gap-0.5 rounded-md border border-border/80 bg-background/95 p-0.5 shadow-sm"
        >
          <button
            type="button"
            draggable
            title="Drag to move"
            aria-label="Drag to move chart"
            className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground hover:text-foreground"
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", id);
              e.dataTransfer.effectAllowed = "move";
              onDragStartItem?.(id);
            }}
            onClick={(e) => e.preventDefault()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="Narrower"
            aria-label="Make chart narrower"
            onClick={() => onCycleWidth?.(id, -1)}
          >
            <Minimize2 className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="Wider"
            aria-label="Make chart wider"
            onClick={() => onCycleWidth?.(id, 1)}
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px] font-semibold"
            title="Toggle tall / short"
            onClick={() => onToggleHeight?.(id)}
          >
            {h === 2 ? "Short" : "Tall"}
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}

type BoardProps = {
  layout: DashboardLayoutState;
  editMode: boolean;
  onLayoutChange: (next: DashboardLayoutState) => void;
  children: ReactNode;
  className?: string;
};

/**
 * 12-column responsive board. Children must be DashboardArrangeItem elements.
 * Order and size persist via parent layout state.
 */
export function DashboardArrangeBoard({
  layout,
  editMode,
  onLayoutChange,
  children,
  className,
}: BoardProps) {
  const [dragging, setDragging] = useState<string | null>(null);

  const items = Children.toArray(children).filter(
    (c): c is ReactElement<ArrangeItemProps> =>
      isValidElement(c) && typeof (c.props as ArrangeItemProps).id === "string",
  );

  const byId = new Map(items.map((el) => [el.props.id, el]));
  const present = new Set(byId.keys());
  const ordered = [
    ...layout.order.filter((id) => present.has(id)),
    ...[...present].filter((id) => !layout.order.includes(id)),
  ];

  const move = useCallback(
    (fromId: string, toId: string) => {
      if (!fromId || !toId || fromId === toId) return;
      const visible = new Set(
        Children.toArray(children)
          .filter(isValidElement)
          .map((el) => (el.props as ArrangeItemProps).id)
          .filter(Boolean),
      );
      let nextOrder = [...layout.order];
      for (const id of visible) {
        if (!nextOrder.includes(id)) nextOrder.push(id);
      }
      nextOrder = nextOrder.filter((id) => id !== fromId);
      const toIdx = nextOrder.indexOf(toId);
      if (toIdx < 0) nextOrder.push(fromId);
      else nextOrder.splice(toIdx, 0, fromId);
      onLayoutChange({ ...layout, order: nextOrder });
    },
    [layout, onLayoutChange, children],
  );

  const onCycleWidth = useCallback(
    (id: string, dir: 1 | -1) => {
      const prev = layout.sizes[id] || defaultSizeFor(id);
      onLayoutChange({
        ...layout,
        sizes: {
          ...layout.sizes,
          [id]: { ...prev, w: cycleWidth(prev.w, dir) },
        },
      });
    },
    [layout, onLayoutChange],
  );

  const onToggleHeight = useCallback(
    (id: string) => {
      const prev = layout.sizes[id] || defaultSizeFor(id);
      onLayoutChange({
        ...layout,
        sizes: { ...layout.sizes, [id]: { ...prev, h: prev.h === 2 ? 1 : 2 } },
      });
    },
    [layout, onLayoutChange],
  );

  return (
    <div
      className={cn(
        "grid grid-cols-4 md:grid-cols-12 gap-4 auto-rows-fr",
        editMode && "pb-2",
        className,
      )}
    >
      {ordered.map((id) => {
        const el = byId.get(id);
        if (!el) return null;
        const size = layout.sizes[id] || defaultSizeFor(id);
        return cloneElement(el, {
          key: id,
          editMode,
          size,
          onDragStartItem: setDragging,
          onDropOnItem: (toId: string, fromId?: string) => {
            move(fromId || dragging || "", toId);
            setDragging(null);
          },
          onCycleWidth,
          onToggleHeight,
        });
      })}
    </div>
  );
}
