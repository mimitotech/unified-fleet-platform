import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, Droplets } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FuelTransaction } from '@/types/entities';
import { format } from 'date-fns';

interface FuelTrendChartProps {
  transactions: FuelTransaction[];
  isLoading: boolean;
}

// Get week start date (Monday) in YYYY-MM-DD format
const getWeekStart = (date: Date): string => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff));
  return format(monday, 'yyyy-MM-dd');
};

export function FuelTrendChart({ transactions, isLoading }: FuelTrendChartProps) {

  // Group transactions by week and calculate fuel volume and mileage
  const chartData = useMemo(() => {
    if (!transactions.length) return [];

    // Filter for filling and consumption transactions
    const relevantTransactions = transactions.filter(
      t => t.section === 'filling' || t.section === 'consumption'
    );

    if (!relevantTransactions.length) return [];

    // Group by week
    const weeklyData: Record<string, { fuelFilled: number; fuelConsumed: number; mileage: number }> = {};

    relevantTransactions.forEach(tx => {
      const txDate = new Date(tx.timestamp * 1000);
      const weekKey = getWeekStart(txDate);

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { fuelFilled: 0, fuelConsumed: 0, mileage: 0 };
      }

      // Add fuel filled (from filling section)
      if (tx.section === 'filling' && tx.filled > 0) {
        weeklyData[weekKey].fuelFilled += tx.filled;
      }

      // Add fuel consumed and mileage (from consumption section)
      if (tx.section === 'consumption') {
        weeklyData[weekKey].fuelConsumed += tx.fuelUsed || 0;
        weeklyData[weekKey].mileage += tx.mileage || 0;
      }
    });

    // Convert to array and sort by date
    const sortedData = Object.entries(weeklyData)
      .sort(([a], [b]) => a.localeCompare(b));

    // Format dates for display
    return sortedData.map(([week, data]) => {
      const [year, month, day] = week.split('-').map(Number);
      const weekDate = new Date(year, month - 1, day);
      return {
        week: weekDate.toLocaleDateString('en-UG', {
          month: 'short',
          day: 'numeric'
        }),
        fuelFilled: Math.round(data.fuelFilled * 10) / 10,
        fuelConsumed: Math.round(data.fuelConsumed * 10) / 10,
        mileage: Math.round(data.mileage),
      };
    });
  }, [transactions]);

  if (isLoading) {
    return (
      <div className="fleet-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        <div className="h-[320px] min-h-[300px] space-y-4 pt-4">
          {/* Chart skeleton with bars and lines */}
          <div className="flex items-end justify-between h-full gap-2 px-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end items-center gap-1">
                <Skeleton
                  className="w-full rounded-t"
                  style={{ height: `${Math.random() * 60 + 40}%` }}
                />
              </div>
            ))}
          </div>
          {/* X-axis labels skeleton */}
          <div className="flex justify-between px-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-3 w-12" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="fleet-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Fuel & Mileage Trends</h3>
          </div>
        </div>
        <div className="h-[320px] min-h-[300px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Droplets className="w-10 h-10 mx-auto opacity-30 mb-2" />
            <p className="font-medium">No fuel data available</p>
            <p className="text-sm max-w-md mx-auto mt-1">
              Fuel trends will appear once transactions are recorded.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fleet-card">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="fuel-section-title">Fuel & Mileage Trends</h3>
      </div>

      <div className="h-[240px] min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fuelFilledGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="week"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="fuel"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <YAxis
              yAxisId="mileage"
              orientation="right"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'fuelFilled') return [`${value.toFixed(1)} L`, 'Fuel Filled'];
                if (name === 'fuelConsumed') return [`${value.toFixed(1)} L`, 'Fuel Consumed'];
                if (name === 'mileage') return [`${value.toLocaleString()} km`, 'Mileage'];
                return [value, name];
              }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend
              formatter={(value) => {
                if (value === 'fuelFilled') return <span className="text-xs">Fuel Filled</span>;
                if (value === 'fuelConsumed') return <span className="text-xs">Fuel Consumed</span>;
                if (value === 'mileage') return <span className="text-xs">Mileage</span>;
                return <span className="text-xs">{value}</span>;
              }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              yAxisId="fuel"
              dataKey="fuelFilled"
              fill="hsl(var(--primary))"
              opacity={0.85}
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="fuel"
              type="monotone"
              dataKey="fuelConsumed"
              stroke="hsl(var(--warning))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--warning))', r: 3 }}
            />
            <Line
              yAxisId="mileage"
              type="monotone"
              dataKey="mileage"
              stroke="hsl(var(--accent))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--accent))', r: 3 }}
              strokeDasharray="4 4"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

