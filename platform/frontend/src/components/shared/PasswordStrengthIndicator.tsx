import { getPasswordPolicyChecks } from '@/lib/passwordPolicy';
import { cn } from '@/lib/utils';

type Props = {
  password: string;
  className?: string;
  label?: string;
  // When true, shows a neutral note for empty passwords.
  optional?: boolean;
};

function CheckRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded border', ok ? 'border-emerald-500/70 text-emerald-600' : 'border-muted-foreground/40 text-muted-foreground')}>
        {ok ? '✓' : '•'}
      </span>
      <span className={cn(ok ? 'text-emerald-700' : 'text-muted-foreground')}>{text}</span>
    </div>
  );
}

export function PasswordStrengthIndicator({ password, className, label, optional }: Props) {
  const pw = String(password ?? '');
  const checks = getPasswordPolicyChecks(pw);
  const isEmpty = pw.trim().length === 0;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="text-xs font-medium text-muted-foreground">
        {label ?? 'Password strength'}
      </div>

      {optional && isEmpty ? (
        <div className="text-xs text-muted-foreground">Will be auto-generated (strong).</div>
      ) : (
        <>
          <CheckRow ok={checks.minLength} text="At least 8 characters" />
          <CheckRow ok={checks.hasLower} text="Lowercase (a-z)" />
          <CheckRow ok={checks.hasUpper} text="Uppercase (A-Z)" />
          <CheckRow ok={checks.hasNumber} text="Number (0-9)" />
          <CheckRow ok={checks.hasSymbol} text="Symbol (e.g. !@#$...)" />
        </>
      )}
    </div>
  );
}

