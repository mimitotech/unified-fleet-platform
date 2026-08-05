<?php
/**
 * Tenant fuel module config + simple station sheet CSV import.
 */
require_once __DIR__ . '/Database.php';

final class FuelModuleConfig
{
    public const COLUMNS = [
        'filledMain', 'filledReserve', 'filledStation', 'variance',
        'usedMain', 'usedReserve', 'levelMain', 'levelReserve', 'totalLevel',
        'dropMain', 'dropReserve', 'totalDrop', 'totalUsed', 'fuelType', 'cost', 'cardNo',
    ];

    /** @return array<string, mixed> */
    public static function get(string $tenantId): array
    {
        self::ensureTable();
        $rows = Database::query(
            'SELECT * FROM tenant_fuel_module_configs WHERE tenant_id = ? LIMIT 1',
            [$tenantId]
        );
        if (!$rows) {
            return self::defaults($tenantId);
        }
        $row = $rows[0];
        return [
            'tenantId' => $tenantId,
            'selectedReports' => self::jsonArr($row['selected_reports'] ?? null),
            'visibleColumns' => self::jsonArr($row['visible_columns'] ?? null) ?: self::COLUMNS,
            'columnsByCategory' => self::jsonObj($row['columns_by_category'] ?? null),
            'fuelPricePerLiter' => isset($row['fuel_price_per_liter']) ? (float) $row['fuel_price_per_liter'] : null,
            'updatedAt' => $row['updated_at'] ?? null,
        ];
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    public static function save(string $tenantId, array $body): array
    {
        self::ensureTable();
        $selected = $body['selectedReports'] ?? [];
        if (!is_array($selected)) {
            $selected = [];
        }
        $cleanReports = [];
        foreach ($selected as $r) {
            if (!is_array($r)) {
                continue;
            }
            $rid = (int) ($r['resourceId'] ?? 0);
            $tid = (int) ($r['templateId'] ?? 0);
            if ($rid <= 0 || $tid <= 0) {
                continue;
            }
            $cleanReports[] = [
                'resourceId' => $rid,
                'templateId' => $tid,
                'templateName' => (string) ($r['templateName'] ?? $r['name'] ?? ''),
                'module' => $r['module'] ?? 'fuel',
                'isGroupReport' => !empty($r['isGroupReport']),
            ];
        }

        $cols = [];
        foreach ((array) ($body['visibleColumns'] ?? self::COLUMNS) as $c) {
            $c = (string) $c;
            if (in_array($c, self::COLUMNS, true)) {
                $cols[] = $c;
            }
        }
        if (!$cols) {
            $cols = self::COLUMNS;
        }

        $byCat = is_array($body['columnsByCategory'] ?? null) ? $body['columnsByCategory'] : new stdClass();
        $price = isset($body['fuelPricePerLiter']) && is_numeric($body['fuelPricePerLiter'])
            ? (float) $body['fuelPricePerLiter'] : null;

        $exists = Database::query(
            'SELECT tenant_id FROM tenant_fuel_module_configs WHERE tenant_id = ? LIMIT 1',
            [$tenantId]
        );
        if ($exists) {
            Database::execute(
                'UPDATE tenant_fuel_module_configs SET
                   selected_reports = ?, visible_columns = ?, columns_by_category = ?,
                   fuel_price_per_liter = ?, updated_at = NOW(3)
                 WHERE tenant_id = ?',
                [
                    json_encode($cleanReports),
                    json_encode($cols),
                    json_encode($byCat),
                    $price,
                    $tenantId,
                ]
            );
        } else {
            Database::execute(
                'INSERT INTO tenant_fuel_module_configs
                   (tenant_id, selected_reports, visible_columns, columns_by_category, fuel_price_per_liter, updated_at)
                 VALUES (?, ?, ?, ?, ?, NOW(3))',
                [
                    $tenantId,
                    json_encode($cleanReports),
                    json_encode($cols),
                    json_encode($byCat),
                    $price,
                ]
            );
        }
        return self::get($tenantId);
    }

    /** @return list<array<string, mixed>> */
    public static function listStationUploads(string $tenantId): array
    {
        if (!self::tableExists('fuel_station_uploads')) {
            return [];
        }
        $rows = Database::query(
            'SELECT id, file_name, period_from, period_to, row_count, imported_count, skipped_count, notes, created_at
             FROM fuel_station_uploads WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50',
            [$tenantId]
        );
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'id' => $r['id'],
                'fileName' => $r['file_name'],
                'periodFrom' => $r['period_from'],
                'periodTo' => $r['period_to'],
                'rowCount' => (int) ($r['row_count'] ?? 0),
                'importedCount' => (int) ($r['imported_count'] ?? 0),
                'skippedCount' => (int) ($r['skipped_count'] ?? 0),
                'notes' => $r['notes'],
                'createdAt' => $r['created_at'],
            ];
        }
        return $out;
    }

    /**
     * Import station sheet (.csv or .xlsx) — plate + quantity + date required.
     * @return array{uploadId:string,imported:int,skipped:int,rowCount:int,fileName:string}
     */
    public static function importStationSheet(
        string $tenantId,
        string $fileName,
        string $binary,
        ?string $uploadedBy = null,
        ?string $notes = null
    ): array {
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if ($ext === 'xlsx') {
            require_once __DIR__ . '/XlsxReader.php';
            $matrix = XlsxReader::sheetRows($binary);
            return self::importStationMatrix($tenantId, $fileName, $matrix, $uploadedBy, $notes);
        }
        return self::importStationCsv($tenantId, $fileName, $binary, $uploadedBy, $notes);
    }

    /**
     * Import CSV station sheet (registration, quantity, date columns).
     * @return array{uploadId:string,imported:int,skipped:int,rowCount:int,fileName:string}
     */
    public static function importStationCsv(
        string $tenantId,
        string $fileName,
        string $binary,
        ?string $uploadedBy = null,
        ?string $notes = null
    ): array {
        $text = $binary;
        if (str_starts_with($text, "\xEF\xBB\xBF")) {
            $text = substr($text, 3);
        }
        $lines = preg_split('/\r\n|\r|\n/', $text) ?: [];
        $lines = array_values(array_filter($lines, static fn($l) => trim($l) !== ''));
        if (count($lines) < 2) {
            throw new RuntimeException('CSV needs a header row and at least one data row');
        }
        $matrix = [];
        foreach ($lines as $line) {
            $matrix[] = str_getcsv($line);
        }
        return self::importStationMatrix($tenantId, $fileName, $matrix, $uploadedBy, $notes);
    }

    /**
     * @param list<list<mixed>> $matrix
     * @return array{uploadId:string,imported:int,skipped:int,rowCount:int,fileName:string}
     */
    public static function importStationMatrix(
        string $tenantId,
        string $fileName,
        array $matrix,
        ?string $uploadedBy = null,
        ?string $notes = null
    ): array {
        if (!self::tableExists('fuel_station_uploads')) {
            throw new RuntimeException('fuel_station_uploads table missing — run schema import');
        }
        if (count($matrix) < 2) {
            throw new RuntimeException('Sheet needs a header row and at least one data row');
        }

        $headerIdx = 0;
        $map = self::mapSheetHeaders($matrix[0] ?? []);
        if ($map['registration'] === null || $map['quantity'] === null || $map['date'] === null) {
            for ($i = 1; $i < min(count($matrix), 15); $i++) {
                $try = self::mapSheetHeaders($matrix[$i] ?? []);
                if ($try['registration'] !== null && $try['quantity'] !== null && $try['date'] !== null) {
                    $headerIdx = $i;
                    $map = $try;
                    break;
                }
            }
        }
        if ($map['registration'] === null || $map['quantity'] === null) {
            throw new RuntimeException(
                'Could not find required columns. Expected Registration / plate, Quantity / liters, and Date.'
            );
        }

        $uploadId = self::uuid();
        Database::execute(
            'INSERT INTO fuel_station_uploads
               (id, tenant_id, file_name, row_count, imported_count, skipped_count, uploaded_by, notes, created_at)
             VALUES (?, ?, ?, 0, 0, 0, ?, ?, NOW(3))',
            [$uploadId, $tenantId, $fileName, $uploadedBy, $notes]
        );

        $imported = 0;
        $skipped = 0;
        $rowCount = 0;
        $hasFills = self::tableExists('fuel_station_fills');
        $nonFuel = '/lubricant|oil|grease|filter|service|adblue|urea|additive/i';

        for ($r = $headerIdx + 1; $r < count($matrix); $r++) {
            $rowCount++;
            $cols = $matrix[$r] ?? [];
            $reg = trim((string) ($cols[$map['registration']] ?? ''));
            $qty = self::cellNumber($cols[$map['quantity']] ?? null);
            $product = $map['product'] !== null
                ? trim((string) ($cols[$map['product']] ?? 'Diesel'))
                : 'Diesel';
            if ($reg === '' || $qty === null || $qty <= 0) {
                $skipped++;
                continue;
            }
            if ($product !== '' && preg_match($nonFuel, $product)) {
                $skipped++;
                continue;
            }
            $hourCell = $map['hour'] !== null ? ($cols[$map['hour']] ?? null) : null;
            $dateCell = $map['date'] !== null ? ($cols[$map['date']] ?? null) : null;
            $filledAt = self::parseFilledAt($dateCell, $hourCell) ?: gmdate('Y-m-d H:i:s');
            $regKey = strtoupper(preg_replace('/[^A-Z0-9]/i', '', $reg) ?? '');
            if ($regKey === '') {
                $regKey = strtolower(preg_replace('/\s+/', '', $reg) ?? $reg);
            }

            $unitPrice = $map['unitPrice'] !== null ? self::cellNumber($cols[$map['unitPrice']] ?? null) : null;
            $amount = $map['amount'] !== null ? self::cellNumber($cols[$map['amount']] ?? null) : null;
            $cardNumber = $map['cardNumber'] !== null ? trim((string) ($cols[$map['cardNumber']] ?? '')) : '';
            $receiptNumber = $map['receiptNumber'] !== null ? trim((string) ($cols[$map['receiptNumber']] ?? '')) : '';

            if ($hasFills) {
                try {
                    $hasExtra = self::fillsHasExtraColumns();
                    if ($hasExtra) {
                        Database::execute(
                            'INSERT INTO fuel_station_fills
                               (id, tenant_id, upload_id, filled_at, registration, registration_key,
                                quantity, product, unit_price, amount, card_number, receipt_number, raw, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))',
                            [
                                self::uuid(),
                                $tenantId,
                                $uploadId,
                                $filledAt,
                                $reg,
                                $regKey,
                                $qty,
                                $product !== '' ? $product : 'Diesel',
                                $unitPrice,
                                $amount,
                                $cardNumber !== '' ? $cardNumber : null,
                                $receiptNumber !== '' ? $receiptNumber : null,
                                json_encode(['row' => $cols]),
                            ]
                        );
                    } else {
                        Database::execute(
                            'INSERT INTO fuel_station_fills
                               (id, tenant_id, upload_id, filled_at, registration, registration_key,
                                quantity, product, raw, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))',
                            [
                                self::uuid(),
                                $tenantId,
                                $uploadId,
                                $filledAt,
                                $reg,
                                $regKey,
                                $qty,
                                $product !== '' ? $product : 'Diesel',
                                json_encode(['row' => $cols]),
                            ]
                        );
                    }
                    $imported++;
                } catch (Throwable $e) {
                    $skipped++;
                }
            } else {
                $imported++;
            }
        }

        Database::execute(
            'UPDATE fuel_station_uploads SET row_count = ?, imported_count = ?, skipped_count = ? WHERE id = ?',
            [$rowCount, $imported, $skipped, $uploadId]
        );

        return [
            'uploadId' => $uploadId,
            'imported' => $imported,
            'skipped' => $skipped,
            'rowCount' => $rowCount,
            'fileName' => $fileName,
        ];
    }

    public static function deleteStationUpload(string $tenantId, string $uploadId): bool
    {
        if (!self::tableExists('fuel_station_uploads')) {
            return false;
        }
        $n = Database::execute(
            'DELETE FROM fuel_station_uploads WHERE tenant_id = ? AND id = ?',
            [$tenantId, $uploadId]
        );
        return $n > 0;
    }

    /** @return array<string, ?int> */
    private static function mapSheetHeaders(array $header): array
    {
        $aliases = [
            'registration' => ['registration num.', 'registration num', 'registration', 'reg no', 'reg. no', 'plate', 'vehicle', 'number plate', 'reg'],
            'date' => ['date', 'txn date', 'transaction date', 'filled', 'when'],
            'hour' => ['hour', 'time', 'txn time'],
            'quantity' => ['quantity', 'qty', 'litres', 'liters', 'volume', 'qty (l)', 'amount_l'],
            'product' => ['product', 'fuel type', 'fuel', 'product name', 'grade', 'type'],
            'unitPrice' => ['unit price', 'price', 'price/l', 'unitprice'],
            'amount' => ['amount', 'total', 'value', 'cost'],
            'cardNumber' => ['card num.', 'card num', 'card number', 'card no'],
            'receiptNumber' => ['receipt num.', 'receipt num', 'receipt', 'receipt no'],
        ];
        $out = [];
        foreach (array_keys($aliases) as $field) {
            $out[$field] = null;
        }
        foreach ($header as $i => $h) {
            $n = strtolower(trim(preg_replace('/\s+/', ' ', (string) $h) ?? ''));
            if ($n === '') {
                continue;
            }
            foreach ($aliases as $field => $list) {
                if ($out[$field] === null && in_array($n, $list, true)) {
                    $out[$field] = $i;
                }
            }
            // Fuzzy fallbacks
            if ($out['registration'] === null && preg_match('/reg|plate|vehicle|number/', $n)) {
                $out['registration'] = $i;
            }
            if ($out['quantity'] === null && preg_match('/qty|quantity|litre|liter|volume/', $n)) {
                $out['quantity'] = $i;
            }
            if ($out['date'] === null && preg_match('/^date|txn date|transaction date/', $n)) {
                $out['date'] = $i;
            }
            if ($out['product'] === null && preg_match('/product|fuel|grade/', $n)) {
                $out['product'] = $i;
            }
        }
        return $out;
    }

    /** @deprecated use mapSheetHeaders */
    private static function mapCsvHeaders(array $header): array
    {
        $m = self::mapSheetHeaders($header);
        return [
            'registration' => $m['registration'],
            'quantity' => $m['quantity'],
            'date' => $m['date'],
            'product' => $m['product'],
        ];
    }

    private static function cellNumber(mixed $v): ?float
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (is_int($v) || is_float($v)) {
            return (float) $v;
        }
        $n = (float) str_replace([',', ' '], ['', ''], trim((string) $v));
        return is_finite($n) ? $n : null;
    }

    private static function parseFilledAt(mixed $dateCell, mixed $hourCell): ?string
    {
        $hour = self::cellNumber($hourCell);
        $dateNum = self::cellNumber($dateCell);
        if ($dateNum !== null && $dateNum > 20000) {
            // Excel serial (days since 1899-12-30)
            $frac = ($dateNum != floor($dateNum))
                ? ($dateNum - floor($dateNum))
                : (($hour !== null && $hour > 0 && $hour < 1) ? $hour : 0.0);
            $base = gmmktime(0, 0, 0, 12, 30, 1899);
            $ts = (int) ($base + floor($dateNum) * 86400 + (int) round($frac * 86400));
            return gmdate('Y-m-d H:i:s', $ts);
        }
        $s = trim((string) ($dateCell ?? ''));
        if ($s === '') {
            return null;
        }
        $ts = strtotime($s);
        if (!$ts) {
            return null;
        }
        if ($hour !== null && $hour >= 1) {
            // hour as HH or HHMM-ish number
            $h = (int) $hour;
            if ($h < 24) {
                $ts = strtotime(gmdate('Y-m-d', $ts) . ' ' . sprintf('%02d:00:00', $h) . ' UTC') ?: $ts;
            }
        }
        return gmdate('Y-m-d H:i:s', $ts);
    }

    private static function parseDate(string $raw): ?string
    {
        if ($raw === '') {
            return null;
        }
        $ts = strtotime($raw);
        return $ts ? gmdate('Y-m-d H:i:s', $ts) : null;
    }

    private static function fillsHasExtraColumns(): bool
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        try {
            $rows = Database::query(
                "SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'fuel_station_fills' AND column_name = 'unit_price'
                 LIMIT 1"
            );
            $cached = (bool) $rows;
        } catch (Throwable $e) {
            $cached = false;
        }
        return $cached;
    }

    /** @return array<string, mixed> */
    private static function defaults(string $tenantId): array
    {
        return [
            'tenantId' => $tenantId,
            'selectedReports' => [],
            'visibleColumns' => self::COLUMNS,
            'columnsByCategory' => new stdClass(),
            'fuelPricePerLiter' => null,
            'updatedAt' => null,
        ];
    }

    private static function ensureTable(): void
    {
        if (self::tableExists('tenant_fuel_module_configs')) {
            return;
        }
        try {
            Database::execute(
                "CREATE TABLE IF NOT EXISTS tenant_fuel_module_configs (
                   tenant_id CHAR(36) NOT NULL PRIMARY KEY,
                   selected_reports JSON NOT NULL,
                   visible_columns JSON NOT NULL,
                   columns_by_category JSON NOT NULL,
                   fuel_price_per_liter DECIMAL(12,4) NULL,
                   updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
        } catch (Throwable $e) {
            // ignore
        }
    }

    private static function tableExists(string $table): bool
    {
        try {
            $rows = Database::query(
                'SELECT 1 FROM information_schema.tables
                 WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
                [$table]
            );
            return (bool) $rows;
        } catch (Throwable $e) {
            return false;
        }
    }

    /** @return list<mixed> */
    private static function jsonArr(mixed $v): array
    {
        if (is_array($v)) {
            return $v;
        }
        if (is_string($v) && $v !== '') {
            $d = json_decode($v, true);
            return is_array($d) ? $d : [];
        }
        return [];
    }

    /** @return array<string, mixed>|object */
    private static function jsonObj(mixed $v): mixed
    {
        if (is_array($v) || is_object($v)) {
            return $v;
        }
        if (is_string($v) && $v !== '') {
            $d = json_decode($v, true);
            return is_array($d) ? $d : new stdClass();
        }
        return new stdClass();
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
