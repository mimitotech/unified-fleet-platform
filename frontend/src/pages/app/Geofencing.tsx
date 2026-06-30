import { AppLayout } from '@/components/app/AppLayout';
import { useGeofences } from '@/hooks/useDomain';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';

export default function Geofencing() {
  const { data: geofences, isLoading } = useGeofences();

  return (
    <AppLayout title="Geofencing" subtitle="Geographic zones and alerts">
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {geofences?.map((g) => (
            <div key={g.id} className="fleet-card flex items-start gap-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${g.color}22` }}
              >
                <MapPin className="w-5 h-5" style={{ color: g.color }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{g.name}</h3>
                  <Badge variant={g.isActive ? 'default' : 'secondary'}>
                    {g.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground capitalize">{g.type} zone</p>
                {g.radius && (
                  <p className="text-xs text-muted-foreground mt-1">Radius: {g.radius}m</p>
                )}
                {g.center && (
                  <p className="text-xs text-muted-foreground">
                    {g.center.lat.toFixed(4)}, {g.center.lng.toFixed(4)}
                  </p>
                )}
              </div>
            </div>
          ))}
          {!geofences?.length && (
            <p className="text-muted-foreground col-span-full text-center py-12">
              No geofences configured
            </p>
          )}
        </div>
      )}
    </AppLayout>
  );
}
