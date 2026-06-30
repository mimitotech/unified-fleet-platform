import { AppLayout } from '@/components/app/AppLayout';
import { MetricCard } from '@/components/app/MetricCard';
import { useFuelKpis, useFuelTransactions, useFuelTrend } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Fuel as FuelIcon, Droplets, Gauge, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Fuel() {
  const { data: kpis, isLoading: kpisLoading } = useFuelKpis();
  const { data: transactions, isLoading: txLoading } = useFuelTransactions();
  const { data: trend } = useFuelTrend();

  return (
    <AppLayout title="Fuel" subtitle="Fuel management and consumption">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {kpisLoading ? (
            [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)
          ) : (
            <>
              <MetricCard title="Total Filled (L)" value={kpis?.totalFilled ?? 0} icon={Droplets} variant="primary" />
              <MetricCard title="Consumed (L)" value={kpis?.totalConsumed ?? 0} icon={FuelIcon} variant="info" />
              <MetricCard title="Avg L/100km" value={kpis?.avgConsumption ?? 0} icon={Gauge} variant="success" />
              <MetricCard title="Theft Events" value={kpis?.theftEvents ?? 0} icon={AlertTriangle} variant="destructive" />
            </>
          )}
        </div>

        <Tabs defaultValue="transactions">
          <TabsList>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="trend">Monthly Trend</TabsTrigger>
          </TabsList>
          <TabsContent value="transactions" className="fleet-card mt-4">
            {txLoading ? <Skeleton className="h-48" /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Filled (L)</TableHead>
                    <TableHead>Used (L)</TableHead>
                    <TableHead>Mileage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions?.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.unitName}</TableCell>
                      <TableCell><Badge variant="outline">{t.section}</Badge></TableCell>
                      <TableCell>{t.timeStr}</TableCell>
                      <TableCell>{t.filled || '—'}</TableCell>
                      <TableCell>{t.fuelUsed || '—'}</TableCell>
                      <TableCell>{t.mileage ? `${t.mileage} km` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
          <TabsContent value="trend" className="fleet-card mt-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(trend as Array<{ month: string; filled: number; consumed: number }>) || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="filled" fill="hsl(var(--primary))" name="Filled (L)" />
                  <Bar dataKey="consumed" fill="hsl(var(--chart-2))" name="Consumed (L)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
