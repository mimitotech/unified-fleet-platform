export type FuelTabDateRangeProps = {
  fromDate: string;
  toDate: string;
  todayStr: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
};
