import type { FuelTransaction } from '@/types/entities';
import type { TransactionDisplayValues } from './FuelTransactionsTable/types';
export { getTransactionColumnValues as getTransactionDisplayValues } from '../fuelColumnMetrics';

/** Format currency for Uganda */
export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(amount);
};

const TX_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Kampala',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export const formatTransactionTime = (t: { timestamp?: number; time?: string }): string => {
  if (typeof t.timestamp === 'number' && t.timestamp > 0) {
    const hhmmss = TX_TIME_FORMATTER.format(new Date(t.timestamp * 1000));
    return hhmmss === '24:00:00' ? '00:00:00' : hhmmss;
  }
  return t.time ?? '';
};

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Default Fuel window: last 7 days — matches typical Wialon report availability. */
export const getDefaultDateRange = () => {
  const today = new Date();
  const todayStr = formatLocalDate(today);
  const from = new Date(today.getTime() - 6 * 86400000);
  return {
    fromDate: formatLocalDate(from),
    toDate: todayStr,
    todayStr,
  };
};

export type FuelQuickRange = 'today' | '7' | '14' | '30';

export function getFuelRangeForPreset(preset: FuelQuickRange): { fromDate: string; toDate: string; todayStr: string } {
  const today = new Date();
  const todayStr = formatLocalDate(today);
  if (preset === 'today') {
    return { fromDate: todayStr, toDate: todayStr, todayStr };
  }
  const from = new Date(today);
  from.setDate(from.getDate() - (Number(preset) - 1));
  return { fromDate: formatLocalDate(from), toDate: todayStr, todayStr };
}
