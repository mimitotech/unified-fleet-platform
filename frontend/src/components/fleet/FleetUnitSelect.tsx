import { useMemo } from 'react';
import { useFleetUnits } from '@/hooks/useFleetUnits';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FleetUnit } from '@/lib/fleetUnits';

type Props = {
  value?: string;
  onValueChange: (unitId: string, unit: FleetUnit) => void;
  placeholder?: string;
  filter?: (unit: FleetUnit) => boolean;
  className?: string;
};

export function FleetUnitSelect({
  value,
  onValueChange,
  placeholder = 'Select vehicle',
  filter,
  className,
}: Props) {
  const { units } = useFleetUnits();
  const options = useMemo(
    () => (filter ? units.filter(filter) : units),
    [units, filter]
  );

  return (
    <Select
      value={value || ''}
      onValueChange={(id) => {
        const unit = options.find((u) => u.id === id);
        if (unit) onValueChange(id, unit);
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}
            {u.plate ? ` · ${u.plate}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
