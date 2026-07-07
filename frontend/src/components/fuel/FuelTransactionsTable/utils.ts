import type { FuelTransaction } from '@/types/entities';
import type { TransactionDisplayValues } from './types';

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

export const getTransactionDisplayValues = (t: FuelTransaction): TransactionDisplayValues => {
  const isMainTank = t.tank === 'main';
  const isReserveTank = t.tank === 'reserve';

  const filledMain = isMainTank && t.filled > 0 ? t.filled : 0;
  const filledReserve = isReserveTank && t.filled > 0 ? t.filled : 0;
  const usedMain = isMainTank && t.fuelUsed > 0 ? t.fuelUsed : 0;
  const usedReserve = isReserveTank && t.fuelUsed > 0 ? t.fuelUsed : 0;

  const levelMain = t.mainTankLevel ?? (isMainTank && t.finalLevel > 0 ? t.finalLevel : 0);
  const levelReserve = t.reserveTankLevel ?? (isReserveTank && t.finalLevel > 0 ? t.finalLevel : 0);

  const dropMain = isMainTank && t.suddenFuelDrop > 0 ? t.suddenFuelDrop : 0;
  const dropReserve = isReserveTank && t.suddenFuelDrop > 0 ? t.suddenFuelDrop : 0;

  const totalFilledFls = t.filled > 0 ? t.filled : 0;
  const filledStation = t.filledStation ?? 0;
  const variance =
    totalFilledFls > 0 || filledStation > 0 ? totalFilledFls - filledStation : 0;
  const totalLevel = levelMain + levelReserve;
  const totalDrop = dropMain + dropReserve;
  const totalUsed = usedMain + usedReserve;
  const fuelType = t.fuelType || '';
  const totalCost = t.totalCost ?? 0;
  const cardNumber = t.cardNumber?.trim() ?? '';

  return {
    filledMain,
    filledReserve,
    filledStation,
    variance,
    usedMain,
    usedReserve,
    levelMain,
    levelReserve,
    dropMain,
    dropReserve,
    totalLevel,
    totalDrop,
    totalUsed,
    totalFilledFls,
    fuelType,
    totalCost,
    cardNumber,
  };
};

export const getDefaultDateRange = () => {
  const today = new Date();
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  return {
    fromDate: twoWeeksAgo.toISOString().split('T')[0],
    toDate: today.toISOString().split('T')[0],
    todayStr: today.toISOString().split('T')[0],
  };
};
