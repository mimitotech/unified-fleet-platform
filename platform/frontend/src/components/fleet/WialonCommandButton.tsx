import { LoadingButton } from '@/components/shared/LoadingButton';
import { useSendWialonCommand } from '@/hooks/useWialonLive';
import { notify } from '@/lib/notify';
import type { ButtonProps } from '@/components/ui/button';

type Props = Omit<ButtonProps, 'onClick'> & {
  unitId: number;
  commandName: string;
  label?: string;
  param?: Record<string, unknown>;
  onSuccess?: () => void;
};

export function WialonCommandButton({
  unitId,
  commandName,
  label,
  param,
  onSuccess,
  children,
  ...btn
}: Props) {
  const send = useSendWialonCommand();

  return (
    <LoadingButton
      {...btn}
      loading={send.isPending}
      onClick={() =>
        send.mutate(
          { unitId, commandName, param },
          {
            onSuccess: () => {
              notify.success(label ? `${label} sent` : 'Command sent');
              onSuccess?.();
            },
            onError: (e) => notify.error('Command failed', e.message),
          }
        )
      }
    >
      {children || label || commandName}
    </LoadingButton>
  );
}
