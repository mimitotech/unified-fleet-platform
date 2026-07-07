import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Video, VideoOff } from 'lucide-react';
import { clientApi, type WialonVideoCamera, type WialonVideoUnit } from '@/lib/api';
import { notify } from '@/lib/notify';

type Props = {
  unit: WialonVideoUnit;
  allCameras?: WialonVideoCamera[];
};

function flagsFromCamera(cam: WialonVideoCamera, live: boolean, autoSave: boolean): number {
  let flags = 0;
  if (live) flags |= 1;
  if (autoSave) flags |= 2;
  return flags;
}

export function CameraManagementPanel({ unit, allCameras }: Props) {
  const qc = useQueryClient();
  const cameras = allCameras?.length ? allCameras : unit.cameras;

  const save = useMutation({
    mutationFn: (next: WialonVideoCamera[]) =>
      clientApi.updateSurveillanceCameras(
        unit.id,
        next.map((c) => ({
          channel: c.channel ?? c.index + 1,
          name: c.name,
          flags: c.flags,
        }))
      ),
    onSuccess: (detail) => {
      qc.setQueryData(['surveillance-unit', unit.id], detail);
      void qc.invalidateQueries({ queryKey: ['surveillance-units'] });
      notify.success('Camera settings saved', 'Wialon video settings updated.');
    },
    onError: (e: Error) => notify.error('Could not save cameras', e.message),
  });

  const updateCamera = (channel: number, patch: Partial<Pick<WialonVideoCamera, 'name' | 'active' | 'autoSave'>>) => {
    const next = cameras.map((c) => {
      const ch = c.channel ?? c.index + 1;
      if (ch !== channel) return c;
      const live = patch.active ?? c.active;
      const autoSave = patch.autoSave ?? c.autoSave;
      const flags = flagsFromCamera(c, live, autoSave);
      return {
        ...c,
        ...patch,
        flags,
        active: live,
        autoSave,
        name: patch.name ?? c.name,
      };
    });
    save.mutate(next);
  };

  if (!cameras.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No cameras configured in Wialon for this unit. Enable Video monitoring in Wialon unit settings first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Camera profiles from Wialon <code className="text-[10px]">unit/get_video_settings</code>. Flag 1 = live stream, flag 2 = auto-save on events.
      </p>
      {cameras.map((cam) => {
        const ch = cam.channel ?? cam.index + 1;
        return (
          <div key={ch} className="fleet-card p-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 min-w-[140px]">
              {cam.active ? (
                <Video className="h-4 w-4 text-status-moving" />
              ) : (
                <VideoOff className="h-4 w-4 text-muted-foreground" />
              )}
              <Input
                className="h-8 text-sm max-w-[160px]"
                defaultValue={cam.name}
                onBlur={(e) => {
                  if (e.target.value !== cam.name) updateCamera(ch, { name: e.target.value });
                }}
              />
            </div>
            <Badge variant="outline" className="text-[10px]">Ch {ch}</Badge>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={cam.active}
                disabled={save.isPending}
                onCheckedChange={(v) => updateCamera(ch, { active: v })}
              />
              Live stream
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch
                checked={cam.autoSave}
                disabled={save.isPending || !cam.active}
                onCheckedChange={(v) => updateCamera(ch, { autoSave: v })}
              />
              Auto-save
            </label>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {unit.connected ? 'Unit online' : 'Unit offline'}
            </span>
          </div>
        );
      })}
      {save.isPending && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving to Wialon…
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={save.isPending}
        onClick={() => save.mutate(cameras)}
      >
        Re-sync settings
      </Button>
    </div>
  );
}
