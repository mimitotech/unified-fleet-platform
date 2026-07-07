import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FuelCostAnalysis } from '@/services/fleet/googleSheets';
import { SheetFuelTransaction } from '@/services/googleSheetsService';

interface CostAnalysisChartProps {
  costAnalysis?: FuelCostAnalysis;
  sheetTransactions: SheetFuelTransaction[];
  wialonPlates: string[];
  isLoading: boolean;
  /** Shared date filter from Fuel.tsx — same range used by the table and trend charts */
  fromDate?: string;
  /** Shared date filter from Fuel.tsx — same range used by the table and trend charts */
  toDate?: string;
}

// Format currency for Uganda (compact)
const formatCurrencyCompact = (amount: number) => {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`;
  }
  return amount.toFixed(0);
};

export function CostAnalysisChart({ costAnalysis, sheetTransactions, wialonPlates, isLoading, fromDate, toDate }: CostAnalysisChartProps) {

  // Group transactions by week and calculate on-system vs off-system costs.
  // Respects the shared fromDate/toDate filter passed down from Fuel.tsx.
  const chartData = useMemo(() => {
    if (!sheetTransactions.length) return [];

    // Pre-filter by shared date range before grouping
    const dateFiltered = sheetTransactions.filter(tx => {
      let txDate: Date;
      if (tx.date instanceof Date) {
        txDate = tx.date;
      } else {
        txDate = new Date(tx.date);
      }
      if (isNaN(txDate.getTime())) return false;
      const year = txDate.getFullYear();
      const month = String(txDate.getMonth() + 1).padStart(2, '0');
      const day = String(txDate.getDate()).padStart(2, '0');
      const txDateStr = `${year}-${month}-${day}`;
      if (fromDate && txDateStr < fromDate) return false;
      if (toDate && txDateStr > toDate) return false;
      return true;
    });

    if (!dateFiltered.length) return [];

    // Helper function to get the Monday of the week for a given date
    // Uses local timezone to avoid UTC conversion issues
    const getWeekStart = (date: Date): string => {
      const d = new Date(date);
      const day = d.getDay();
      // Adjust to Monday (day 1). Sunday (0) should go back 6 days
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      // Return YYYY-MM-DD format using local date (not UTC)
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const dayOfMonth = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${dayOfMonth}`;
    };

    // Normalize wialon plates for matching
    const normalizedWialonPlates = new Set(
      wialonPlates.map(p => p.toUpperCase().replace(/\s+/g, ''))
    );

    // Group by week
    const weeklyData: Record<string, { onSystem: number; offSystem: number }> = {};
    let validCount = 0;
    let invalidCount = 0;

    // Group the already date-filtered transactions by week
    dateFiltered.forEach(tx => {
      let txDate: Date;
      if (tx.date instanceof Date) {
        txDate = tx.date;
      } else {
        txDate = new Date(tx.date);
      }

      if (isNaN(txDate.getTime())) {
        invalidCount++;
        return;
      }
      validCount++;

      const weekKey = getWeekStart(txDate);

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { onSystem: 0, offSystem: 0 };
      }

      const normalizedPlate = tx.registrationNumber.toUpperCase().replace(/\s+/g, '');
      const isOnSystem = normalizedWialonPlates.has(normalizedPlate);

      if (isOnSystem) {
        weeklyData[weekKey].onSystem += tx.amount;
      } else {
        weeklyData[weekKey].offSystem += tx.amount;
      }
    });

    // Convert to array and sort by date
    const sortedData = Object.entries(weeklyData)
      .sort(([a], [b]) => a.localeCompare(b));

    // Format dates for display - parse as local time to avoid timezone shift
    return sortedData.map(([week, data]) => {
      const [year, month, day] = week.split('-').map(Number);
      const weekDate = new Date(year, month - 1, day);
      return {
        week: weekDate.toLocaleDateString('en-UG', {
          month: 'short',
          day: 'numeric'
        }),
        onSystem: Math.round(data.onSystem),
        offSystem: Math.round(data.offSystem),
      };
    });
  }, [sheetTransactions, wialonPlates, fromDate, toDate]);

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
          {/* Chart skeleton */}
          <div className="flex items-end justify-between h-full gap-2 px-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end gap-1">
                <Skeleton
                  className="w-full rounded-t"
                  style={{ height: `${Math.random() * 60 + 40}%` }}
                />
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

  if (!costAnalysis || chartData.length === 0) {
    return (
      <div className="fleet-card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Cost Trend Analysis</h3>
        </div>
        <div className="h-[320px] min-h-[300px] flex items-center justify-center text-muted-foreground">
          <p>No cost data available for trend analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fleet-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Cost Trend Analysis</h3>
        </div>
        {(fromDate || toDate) && (
          <span className="text-xs text-muted-foreground">
            {fromDate} – {toDate}
          </span>
        )}
      </div>

      <div className="h-[320px] min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="onSystemGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="offSystemGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="week"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCurrencyCompact(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}
              formatter={(value: number, name: string) => [
                `UGX ${value.toLocaleString()}`,
                name === 'onSystem' ? 'On System' : 'Off System'
              ]}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend
              formatter={(value) => (
                <span className="text-xs">
                  {value === 'onSystem' ? 'On System' : 'Off System'}
                </span>
              )}
              iconType="circle"
              iconSize={8}
            />
            <Area
              type="monotone"
              dataKey="onSystem"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2}
              fill="url(#onSystemGradient)"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="offSystem"
              stroke="hsl(38, 92%, 50%)"
              strokeWidth={2}
              fill="url(#offSystemGradient)"
              stackId="1"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

