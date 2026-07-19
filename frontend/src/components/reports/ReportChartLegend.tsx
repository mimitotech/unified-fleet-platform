import type { ChartConfig } from '@/components/ui/chart';

type Props = {
  config: ChartConfig;
  className?: string;
};

/**
 * Legend rendered under the plot (not inside Recharts' fixed-height stage),
 * so keys never get clipped or pushed out of the chart card.
 */
export function ReportChartLegend({ config, className }: Props) {
  const items = Object.entries(config).filter(([, item]) => item?.label || item?.color);
  if (!items.length) return null;

  return (
    <div
      data-report-chart-legend
      className={className}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '6px 12px',
        paddingTop: '8px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {items.map(([key, item]) => (
        <div
          key={key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '10px',
            lineHeight: '1.2',
            color: '#334155',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            aria-hidden
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '2px',
              background: item.color || '#94a3b8',
              flexShrink: 0,
            }}
          />
          <span>{item.label ?? key}</span>
        </div>
      ))}
    </div>
  );
}
