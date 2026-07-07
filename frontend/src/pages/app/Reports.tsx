import { AppLayout } from '@/components/app/AppLayout';
import { ReportsWorkspace } from '@/components/reports/ReportsWorkspace';

export default function Reports() {
  return (
    <AppLayout title="Reports" subtitle="Live Wialon reports — tables always on, data updates automatically">
      <ReportsWorkspace />
    </AppLayout>
  );
}
