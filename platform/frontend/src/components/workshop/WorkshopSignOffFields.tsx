import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type WorkshopSignOffValue = {
  name: string;
  date: string;
  signature: string;
};

type Props = {
  /** e.g. Inspected by / Maintained by / Reported by */
  label: string;
  value: WorkshopSignOffValue;
  onChange: (next: WorkshopSignOffValue) => void;
  required?: boolean;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function emptySignOff(partial?: Partial<WorkshopSignOffValue>): WorkshopSignOffValue {
  return {
    name: partial?.name || '',
    date: partial?.date || todayIso(),
    signature: partial?.signature || '',
  };
}

/** Name + date + signature (autofills lowercase name). */
export function WorkshopSignOffFields({ label, value, onChange, required }: Props) {
  const lastAutofill = useRef(value.signature || '');

  const setName = (name: string) => {
    const autofill = name.trim().toLowerCase();
    const signatureWasAutofill =
      !value.signature || value.signature === lastAutofill.current || value.signature === value.name.trim().toLowerCase();
    const signature = signatureWasAutofill ? autofill : value.signature;
    lastAutofill.current = autofill;
    onChange({
      ...value,
      name,
      signature,
      date: value.date || todayIso(),
    });
  };

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
          <Label htmlFor={`signoff-name-${label}`}>
            Full name{required ? ' *' : ''}
          </Label>
          <Input
            id={`signoff-name-${label}`}
            value={value.name}
            placeholder="Type full name"
            onChange={(e) => setName(e.target.value)}
            required={required}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`signoff-date-${label}`}>Date</Label>
          <Input
            id={`signoff-date-${label}`}
            type="date"
            value={value.date || todayIso()}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`signoff-sig-${label}`}>Signature</Label>
          <Input
            id={`signoff-sig-${label}`}
            value={value.signature}
            onChange={(e) => onChange({ ...value, signature: e.target.value })}
            placeholder="auto from name"
            className="italic tracking-wide"
            style={{ fontFamily: '"Segoe Script","Brush Script MT",cursive,serif', fontSize: '0.95rem' }}
          />
          <p className="text-[10px] text-muted-foreground">Autofills in small letters from the name.</p>
        </div>
      </div>
    </div>
  );
}
