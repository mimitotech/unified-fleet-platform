import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WialonFuelTrendPoint } from '@/lib/fuelTypes';

type Props = {
  trend: WialonFuelTrendPoint[];
  className?: string;
};

export function FuelReportTrendChart({ trend, className }: Props) {
  if (!trend.length) {
    return (
      <div className={`flex items-center justify-center h-48 text-sm text-muted-foreground ${className ?? ''}`}>
        Load a Wialon fuel report to see monthly filled vs consumed.
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={trend} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} width={52} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(value: number, name: string) => [`${value} L`, name === 'filled' ? 'Filled' : 'Consumed']}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="filled" name="Filled" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Line type="monotone" dataKey="consumed" name="Consumed" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
