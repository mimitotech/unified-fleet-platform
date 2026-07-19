/**
 * Google Sheets Fuel Transaction Service
 *
 * Service to fetch fuel transaction data from the Fuel Station Google Sheet.
 * Uses the Google Visualization API (gviz) for public sheet access.
 *
 * Sheet Columns:
 * A: Customer num, B: Customer, C: Date, D: Hour, E: Driver code,
 * F: Registration num (plate), G: Card type, H: Card num, I: Card name,
 * J: Receipt num, K: Past mileage, L: Current mileage, M: Operation type,
 * N: Product code, O: Product (PETROL/DIESEL), P: Unit price, Q: Quantity,
 * R: Amount (total cost), S: Currency num, T: Currency, U: Balance,
 * V: Station num, W: Place (station location), X: Invoice date, Y: Invoice num
 */

/** Raw fuel transaction from Google Sheet */
export interface SheetFuelTransaction {
  date: Date;
  hour: string;
  registrationNumber: string;  // Vehicle plate number
  cardNumber: string;          // Card num (Column H)
  cardName: string;            // Card name (Column I)
  receiptNumber: number;
  pastMileage: number;
  currentMileage: number;
  operationType: string;
  product: 'PETROL' | 'DIESEL' | string;  // Product (Column O)
  unitPrice: number;           // UGX per liter
  quantity: number;            // Liters
  amount: number;              // Total cost in UGX (Column R)
  currency: string;
  stationNumber: number;
  place: string;               // Station location
  invoiceDate: Date;
  invoiceNumber: string;
}

/** Aggregated fuel data per vehicle */
export interface VehicleFuelSummary {
  registrationNumber: string;
  totalLiters: number;
  totalCost: number;
  transactionCount: number;
  avgCostPerLiter: number;
  fuelType: 'PETROL' | 'DIESEL' | 'MIXED';
  lastTransaction: Date;
  stations: string[];
}

/** Wialon vs Non-Wialon cost analysis */
export interface FuelCostAnalysis {
  wialonVehicles: {
    count: number;
    totalCost: number;
    totalLiters: number;
    avgCostPerVehicle: number;
    avgCostPerLiter: number;
    vehicles: VehicleFuelSummary[];
  };
  nonWialonVehicles: {
    count: number;
    totalCost: number;
    totalLiters: number;
    avgCostPerVehicle: number;
    avgCostPerLiter: number;
    vehicles: VehicleFuelSummary[];
  };
  totals: {
    totalVehicles: number;
    totalCost: number;
    totalLiters: number;
    avgCostPerLiter: number;
  };
  potentialSavings: {
    description: string;
    estimatedSavingsPercent: number;
    estimatedSavingsAmount: number;
  };
}

// Get spreadsheet ID from environment
// Supports either just the ID or a full Google Sheets URL
function extractSpreadsheetId(input: string): string {
  if (!input) return '';

  // If it's a full URL, extract the ID
  // Format: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/...
  const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Otherwise, assume it's just the ID
  return input.trim();
}

const SPREADSHEET_ID = extractSpreadsheetId(import.meta.env.VITE_GOOGLE_SHEETS_SPREADSHEET_ID || '');

/**
 * Parse Google Date format: "Date(year,month,day)" -> Date object
 */
function parseGoogleDate(dateStr: string | null): Date {
  if (!dateStr) return new Date();
  // Format: "Date(2025,11,31)" - month is 0-indexed
  const match = dateStr.match(/Date\((\d+),(\d+),(\d+)\)/);
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
  }
  return new Date();
}

/**
 * Parse Google DateTime format for time
 * Handles multiple formats:
 * - "Date(1899,11,30,19,11,12)" - Google's internal date/time format
 * - "HH:MM:SS" - Plain time string
 * - "HH:MM" - Time without seconds
 */
function parseGoogleTime(timeStr: string | null): string {
  if (!timeStr) return '';

  // Convert to string in case it's passed as something else
  const str = String(timeStr);

  // Format 1: "Date(1899,11,30,19,11,12)" - we only care about H:M:S
  const dateMatch = str.match(/Date\(\d+,\d+,\d+,(\d+),(\d+),(\d+)\)/);
  if (dateMatch) {
    return `${dateMatch[1].padStart(2, '0')}:${dateMatch[2].padStart(2, '0')}:${dateMatch[3].padStart(2, '0')}`;
  }

  // Format 2: Already in "HH:MM:SS" format
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const hours = timeMatch[1].padStart(2, '0');
    const minutes = timeMatch[2].padStart(2, '0');
    const seconds = (timeMatch[3] || '00').padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  // Format 3: Numeric value (fraction of day, e.g., 0.5 = 12:00:00)
  const numValue = parseFloat(str);
  if (!isNaN(numValue) && numValue >= 0 && numValue < 1) {
    const totalSeconds = Math.round(numValue * 24 * 60 * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  console.warn('[parseGoogleTime] Unrecognized time format:', str);
  return '';
}

/**
 * Fetch fuel transactions from Google Sheet using gviz API
 * @param startDate Optional start date filter
 * @param endDate Optional end date filter
 */
export async function fetchFuelTransactions(
  startDate?: Date,
  endDate?: Date
): Promise<SheetFuelTransaction[]> {
  if (!SPREADSHEET_ID) {
    console.warn('Google Sheets spreadsheet ID not configured');
    return [];
  }

  // Build the gviz query URL
  // Select relevant columns: C(Date), D(Hour), F(Plate), H(CardNum), I(CardName), J(Receipt),
  // K(PastMileage), L(CurrentMileage), M(OpType), O(Product), P(UnitPrice),
  // Q(Quantity), R(Amount), T(Currency), V(StationNum), W(Place), X(InvoiceDate), Y(InvoiceNum)
  const query = encodeURIComponent('SELECT C,D,F,H,I,J,K,L,M,O,P,Q,R,T,V,W,X,Y');
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&tq=${query}`;

  try {
    const response = await fetch(gvizUrl);
    const text = await response.text();

    // Remove the google.visualization.Query.setResponse() wrapper
    // The response format can vary: with or without trailing semicolon
    const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);?\s*$/);
    if (!jsonMatch) {
      // Log the first 500 chars to help debug
      console.error('Failed to parse gviz response. Response starts with:', text.substring(0, 500));
      // Check if the sheet is public and accessible
      if (text.includes('Sign in')) {
        console.error('Google Sheet may not be publicly accessible. Make sure the sheet is shared with "Anyone with the link".');
      }
      return [];
    }

    const data = JSON.parse(jsonMatch[1]);

    if (data.status !== 'ok' || !data.table?.rows) {
      console.error('gviz query failed:', data.status, data.errors);
      return [];
    }

    const transactions: SheetFuelTransaction[] = [];

    for (const row of data.table.rows) {
      const cells = row.c;
      if (!cells || cells.length < 18) continue;

      const date = parseGoogleDate(cells[0]?.v);

      // Apply date filters if provided
      if (startDate && date < startDate) continue;
      if (endDate && date > endDate) continue;

      // Column indices after SELECT C,D,F,H,I,J,K,L,M,O,P,Q,R,T,V,W,X,Y:
      // 0=Date, 1=Hour, 2=Plate, 3=CardNum, 4=CardName, 5=Receipt, 6=PastMileage,
      // 7=CurrentMileage, 8=OpType, 9=Product, 10=UnitPrice, 11=Quantity, 12=Amount,
      // 13=Currency, 14=StationNum, 15=Place, 16=InvoiceDate, 17=InvoiceNum
      const transaction: SheetFuelTransaction = {
        date,
        hour: parseGoogleTime(cells[1]?.v),
        registrationNumber: cells[2]?.v || '',
        cardNumber: cells[3]?.v?.toString() || '',
        cardName: cells[4]?.v || '',
        receiptNumber: cells[5]?.v || 0,
        pastMileage: cells[6]?.v || 0,
        currentMileage: cells[7]?.v || 0,
        operationType: cells[8]?.v || '',
        product: cells[9]?.v || '',
        unitPrice: cells[10]?.v || 0,
        quantity: cells[11]?.v || 0,
        amount: cells[12]?.v || 0,
        currency: cells[13]?.v || 'UGX',
        stationNumber: cells[14]?.v || 0,
        place: cells[15]?.v || '',
        invoiceDate: parseGoogleDate(cells[16]?.v),
        invoiceNumber: cells[17]?.v || '',
      };

      // Only include valid transactions with positive quantity
      // Negative amounts (cancellations) are handled separately in cost analysis
      if (transaction.quantity > 0 && transaction.registrationNumber) {
        transactions.push(transaction);
      }
    }

    return transactions;
  } catch (error) {
    console.error('Error fetching fuel transactions:', error);
    return [];
  }
}

/**
 * Aggregate transactions by vehicle
 */
export function aggregateByVehicle(transactions: SheetFuelTransaction[]): VehicleFuelSummary[] {
  const vehicleMap = new Map<string, {
    totalLiters: number;
    totalCost: number;
    transactionCount: number;
    fuelTypes: Set<string>;
    lastTransaction: Date;
    stations: Set<string>;
  }>();

  for (const tx of transactions) {
    const existing = vehicleMap.get(tx.registrationNumber);

    if (existing) {
      existing.totalLiters += tx.quantity;
      existing.totalCost += tx.amount;
      existing.transactionCount++;
      existing.fuelTypes.add(tx.product);
      if (tx.date > existing.lastTransaction) {
        existing.lastTransaction = tx.date;
      }
      existing.stations.add(tx.place);
    } else {
      vehicleMap.set(tx.registrationNumber, {
        totalLiters: tx.quantity,
        totalCost: tx.amount,
        transactionCount: 1,
        fuelTypes: new Set([tx.product]),
        lastTransaction: tx.date,
        stations: new Set([tx.place]),
      });
    }
  }

  const summaries: VehicleFuelSummary[] = [];

  for (const [regNum, data] of vehicleMap) {
    const fuelTypes = Array.from(data.fuelTypes);
    let fuelType: 'PETROL' | 'DIESEL' | 'MIXED' = 'MIXED';
    if (fuelTypes.length === 1) {
      fuelType = fuelTypes[0] === 'PETROL' ? 'PETROL' : 'DIESEL';
    }

    summaries.push({
      registrationNumber: regNum,
      totalLiters: Math.round(data.totalLiters * 100) / 100,
      totalCost: Math.round(data.totalCost),
      transactionCount: data.transactionCount,
      avgCostPerLiter: data.totalLiters > 0
        ? Math.round((data.totalCost / data.totalLiters) * 100) / 100
        : 0,
      fuelType,
      lastTransaction: data.lastTransaction,
      stations: Array.from(data.stations),
    });
  }

  return summaries.sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Analyze fuel costs: Wialon-tracked vs Non-Wialon vehicles
 * @param transactions All fuel transactions from the sheet
 * @param wialonPlates Array of vehicle plate numbers that are tracked in Wialon
 */
export function analyzeFuelCosts(
  transactions: SheetFuelTransaction[],
  wialonPlates: string[]
): FuelCostAnalysis {
  // Normalize plate numbers for comparison (uppercase, no spaces)
  const normalizedWialonPlates = new Set(
    wialonPlates.map(p => p.toUpperCase().replace(/\s+/g, ''))
  );

  const wialonTransactions: SheetFuelTransaction[] = [];
  const nonWialonTransactions: SheetFuelTransaction[] = [];

  // Calculate raw total directly from transactions for verification
  let rawTotalCost = 0;
  let rawTotalLiters = 0;
  let cancellationCount = 0;
  let cancellationAmount = 0;

  for (const tx of transactions) {
    rawTotalCost += tx.amount;
    rawTotalLiters += tx.quantity;

    // Track cancellations (negative amounts)
    if (tx.amount < 0) {
      cancellationCount++;
      cancellationAmount += tx.amount;
    }

    const normalizedPlate = tx.registrationNumber.toUpperCase().replace(/\s+/g, '');
    if (normalizedWialonPlates.has(normalizedPlate)) {
      wialonTransactions.push(tx);
    } else {
      nonWialonTransactions.push(tx);
    }
  }

  console.log('[analyzeFuelCosts] Raw totals from transactions:', {
    totalTransactions: transactions.length,
    rawTotalCost: Math.round(rawTotalCost),
    rawTotalLiters: Math.round(rawTotalLiters * 100) / 100,
    cancellations: cancellationCount,
    cancellationAmount: Math.round(cancellationAmount),
    wialonTransactionCount: wialonTransactions.length,
    nonWialonTransactionCount: nonWialonTransactions.length,
    wialonPlatesCount: wialonPlates.length,
  });

  const wialonSummaries = aggregateByVehicle(wialonTransactions);
  const nonWialonSummaries = aggregateByVehicle(nonWialonTransactions);

  const wialonTotalCost = wialonSummaries.reduce((sum, v) => sum + v.totalCost, 0);
  const wialonTotalLiters = wialonSummaries.reduce((sum, v) => sum + v.totalLiters, 0);
  const nonWialonTotalCost = nonWialonSummaries.reduce((sum, v) => sum + v.totalCost, 0);
  const nonWialonTotalLiters = nonWialonSummaries.reduce((sum, v) => sum + v.totalLiters, 0);

  const totalCost = wialonTotalCost + nonWialonTotalCost;
  const totalLiters = wialonTotalLiters + nonWialonTotalLiters;

  console.log('[analyzeFuelCosts] Aggregated totals:', {
    wialonVehicles: wialonSummaries.length,
    wialonTotalCost: Math.round(wialonTotalCost),
    nonWialonVehicles: nonWialonSummaries.length,
    nonWialonTotalCost: Math.round(nonWialonTotalCost),
    combinedTotalCost: Math.round(totalCost),
    combinedTotalLiters: Math.round(totalLiters * 100) / 100,
  });

  // Calculate potential savings (estimate 15-20% savings from Wialon monitoring)
  const estimatedSavingsPercent = 15;
  const estimatedSavingsAmount = Math.round(nonWialonTotalCost * (estimatedSavingsPercent / 100));

  return {
    wialonVehicles: {
      count: wialonSummaries.length,
      totalCost: Math.round(wialonTotalCost),
      totalLiters: Math.round(wialonTotalLiters * 100) / 100,
      avgCostPerVehicle: wialonSummaries.length > 0
        ? Math.round(wialonTotalCost / wialonSummaries.length)
        : 0,
      avgCostPerLiter: wialonTotalLiters > 0
        ? Math.round((wialonTotalCost / wialonTotalLiters) * 100) / 100
        : 0,
      vehicles: wialonSummaries,
    },
    nonWialonVehicles: {
      count: nonWialonSummaries.length,
      totalCost: Math.round(nonWialonTotalCost),
      totalLiters: Math.round(nonWialonTotalLiters * 100) / 100,
      avgCostPerVehicle: nonWialonSummaries.length > 0
        ? Math.round(nonWialonTotalCost / nonWialonSummaries.length)
        : 0,
      avgCostPerLiter: nonWialonTotalLiters > 0
        ? Math.round((nonWialonTotalCost / nonWialonTotalLiters) * 100) / 100
        : 0,
      vehicles: nonWialonSummaries,
    },
    totals: {
      totalVehicles: wialonSummaries.length + nonWialonSummaries.length,
      totalCost: Math.round(totalCost),
      totalLiters: Math.round(totalLiters * 100) / 100,
      avgCostPerLiter: totalLiters > 0
        ? Math.round((totalCost / totalLiters) * 100) / 100
        : 0,
    },
    potentialSavings: {
      description: `Estimated ${estimatedSavingsPercent}% savings if all vehicles were monitored`,
      estimatedSavingsPercent,
      estimatedSavingsAmount,
    },
  };
}

/**
 * Fetch ALL fuel transactions including cancellations (for cost analysis)
 * Cancellations have negative amounts and should reduce totals
 * @param startDate Optional start date filter
 * @param endDate Optional end date filter
 */
async function fetchAllTransactionsForCostAnalysis(
  startDate?: Date,
  endDate?: Date
): Promise<SheetFuelTransaction[]> {
  if (!SPREADSHEET_ID) {
    console.warn('Google Sheets spreadsheet ID not configured');
    return [];
  }

  const query = encodeURIComponent('SELECT C,D,F,H,I,J,K,L,M,O,P,Q,R,T,V,W,X,Y');
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&tq=${query}`;

  try {
    const response = await fetch(gvizUrl);
    const text = await response.text();

    const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);?\s*$/);
    if (!jsonMatch) {
      console.error('Failed to parse gviz response for cost analysis');
      return [];
    }

    const data = JSON.parse(jsonMatch[1]);
    if (data.status !== 'ok' || !data.table?.rows) {
      console.error('gviz query failed:', data.status, data.errors);
      return [];
    }

    const transactions: SheetFuelTransaction[] = [];

    for (const row of data.table.rows) {
      const cells = row.c;
      if (!cells || cells.length < 18) continue;

      const date = parseGoogleDate(cells[0]?.v);
      if (startDate && date < startDate) continue;
      if (endDate && date > endDate) continue;

      // Get raw values - amount can be negative for cancellations
      const rawAmount = cells[12]?.v || 0;
      const rawQuantity = cells[11]?.v || 0;

      const transaction: SheetFuelTransaction = {
        date,
        hour: parseGoogleTime(cells[1]?.v),
        registrationNumber: cells[2]?.v || '',
        cardNumber: cells[3]?.v?.toString() || '',
        cardName: cells[4]?.v || '',
        receiptNumber: cells[5]?.v || 0,
        pastMileage: cells[6]?.v || 0,
        currentMileage: cells[7]?.v || 0,
        operationType: cells[8]?.v || '',
        product: cells[9]?.v || '',
        unitPrice: cells[10]?.v || 0,
        quantity: rawQuantity,
        amount: rawAmount, // Keep original sign for cancellations
        currency: cells[13]?.v || 'UGX',
        stationNumber: cells[14]?.v || 0,
        place: cells[15]?.v || '',
        invoiceDate: parseGoogleDate(cells[16]?.v),
        invoiceNumber: cells[17]?.v || '',
      };

      // Include ALL transactions with non-zero quantity (positive fills AND negative cancellations)
      if (transaction.quantity !== 0 && transaction.registrationNumber) {
        transactions.push(transaction);
      }
    }

    return transactions;
  } catch (error) {
    console.error('Error fetching transactions for cost analysis:', error);
    return [];
  }
}

/**
 * Get fuel cost analysis with data from Google Sheets
 * Uses a separate fetch that includes cancellations for accurate totals
 * @param wialonPlates Array of vehicle plate numbers tracked in Wialon
 * @param startDate Optional start date filter
 * @param endDate Optional end date filter
 */
export async function getFuelCostAnalysis(
  wialonPlates: string[],
  startDate?: Date,
  endDate?: Date
): Promise<FuelCostAnalysis | null> {
  try {
    // Use the special fetch that includes cancellations
    const transactions = await fetchAllTransactionsForCostAnalysis(startDate, endDate);

    if (transactions.length === 0) {
      console.warn('No fuel transactions found');
      return null;
    }

    return analyzeFuelCosts(transactions, wialonPlates);
  } catch (error) {
    console.error('Error getting fuel cost analysis:', error);
    return null;
  }
}
