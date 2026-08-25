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
  onValueChange: (unitId: string, unit: FleetUnit | null) => void;
  placeholder?: string;
  filter?: (unit: FleetUnit) => boolean;
  className?: string;
  allowClear?: boolean;
};

function unitOptionLabel(u: FleetUnit): string {
  const bits = [u.name];
  if (u.plate) bits.push(u.plate);
  const cat = u.assetCategory;
  if (cat === 'generator') bits.push('Generator');
  else if (cat === 'machinery') bits.push('Machinery');
  return bits.join(' · ');
}

export function FleetUnitSelect({
  value,
  onValueChange,
  placeholder = 'Select asset',
  filter,
  className,
  allowClear = true,
}: Props) {
  const { units } = useFleetUnits();
  const options = useMemo(
    () => (filter ? units.filter(filter) : units),
    [units, filter]
  );

  return (
    <Select
      value={value || undefined}
      onValueChange={(id) => {
        if (id === '__none__') {
          onValueChange('', null);
          return;
        }
        const unit = options.find((u) => u.id === id) || null;
        onValueChange(id, unit);
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowClear ? (
          <SelectItem value="__none__">No vehicle</SelectItem>
        ) : null}
        {options.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {unitOptionLabel(u)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
