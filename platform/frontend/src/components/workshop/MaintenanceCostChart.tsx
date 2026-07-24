/**
 * Maintenance Cost Chart
 * 
 * Visualizes maintenance costs by vehicle and category.
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { DollarSign } from 'lucide-react';
import type { MaintenanceLog, VehicleMaintenanceSummary } from '@/types/workshop';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MaintenanceCostChartProps {
  logs: MaintenanceLog[];
  vehicleSummaries: VehicleMaintenanceSummary[];
}

// Format currency for Uganda (shortened)
const formatCurrencyShort = (amount: number) => {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`;
  }
  return amount.toString();
};

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--success))',
  'hsl(var(--info))',
  '#8884d8',
  '#82ca9d',
];

export function MaintenanceCostChart({ logs, vehicleSummaries }: MaintenanceCostChartProps) {
  // Data by vehicle
  const vehicleCostData = useMemo(() => {
    return vehicleSummaries
      .map((v) => ({
        name: v.vehicleName.length > 12 ? v.vehicleName.slice(0, 12) + '...' : v.vehicleName,
        fullName: v.vehicleName,
        plate: v.vehiclePlate,
        cost: v.totalMaintenanceCost,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8); // Top 8 vehicles
  }, [vehicleSummaries]);

  // Data by type
  const typeCostData = useMemo(() => {
    const typeMap = new Map<string, number>();
    logs.forEach((log) => {
      const current = typeMap.get(log.maintenanceType) || 0;
      typeMap.set(log.maintenanceType, current + log.totalCost);
    });
    
    const labels: Record<string, string> = {
      'scheduled': 'Scheduled Service',
      'repair': 'Repairs',
      'breakdown': 'Breakdowns',
      'preventive': 'Preventive',
    };
    
    return Array.from(typeMap.entries()).map(([type, cost]) => ({
      name: labels[type] || type,
      value: cost,
    }));
  }, [logs]);

  // Parts vs Labor breakdown
  const costBreakdown = useMemo(() => {
    const parts = logs.reduce((sum, log) => sum + log.partsCost, 0);
    const labor = logs.reduce((sum, log) => sum + log.laborCost, 0);
    return [
      { name: 'Parts', value: parts },
      { name: 'Labor', value: labor },
    ];
  }, [logs]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.fullName || label}</p>
          {data.plate && <p className="text-xs text-muted-foreground">{data.plate}</p>}
          <p className="text-primary font-semibold mt-1">
            UGX {payload[0].value.toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{payload[0].name}</p>
          <p className="text-primary font-semibold">
            UGX {payload[0].value.toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fleet-card">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Cost Analysis</h3>
      </div>
      
      <Tabs defaultValue="vehicle" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="vehicle">By Asset</TabsTrigger>
          <TabsTrigger value="type">By Type</TabsTrigger>
          <TabsTrigger value="breakdown">Parts vs Labor</TabsTrigger>
        </TabsList>
        
        <TabsContent value="vehicle" className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vehicleCostData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis 
                type="number" 
                tickFormatter={formatCurrencyShort}
                className="text-xs fill-muted-foreground"
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={100}
                className="text-xs fill-muted-foreground"
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </TabsContent>
        
        <TabsContent value="type" className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={typeCostData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {typeCostData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </TabsContent>
        
        <TabsContent value="breakdown" className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={costBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                <Cell fill="hsl(var(--primary))" />
                <Cell fill="hsl(var(--warning))" />
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </TabsContent>
      </Tabs>
    </div>
  );
}

