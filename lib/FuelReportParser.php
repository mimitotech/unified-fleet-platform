<?php
/**
 * Minimal Wialon fuel report table parser (unit fillings / trips / thefts).
 */
final class FuelReportParser
{
    private const TABLE_SECTION = [
        'unit_fillings' => 'filling',
        'unit_fuel_fillings' => 'filling',
        'unit_trips' => 'consumption',
        'unit_fuel' => 'consumption',
        'unit_thefts' => 'theft',
        'unit_fuel_thefts' => 'theft',
        'unit_stats' => 'consumption',
    ];

    /**
     * @param array<int, array<string, mixed>> $tables from WialonLive::execReport
     * @return array<int, array<string, mixed>>
     */
    public static function tablesToTransactions(array $tables, int $unitId, string $unitName): array
    {
        $out = [];
        foreach ($tables as $table) {
            if (!is_array($table)) {
                continue;
            }
            $section = self::detectSection((string) ($table['name'] ?? ''));
            if ($section === null) {
                continue;
            }
            $header = $table['header'] ?? null;
            $columnMap = self::buildColumnMap($header);
            $sample = is_array($table['sample'] ?? null) ? $table['sample'] : [];
            foreach ($sample as $row) {
                $cells = self::normalizeCells($row);
                if (!$cells) {
                    continue;
                }
                $tx = self::processRow($cells, $columnMap, $section, $unitId, $unitName);
                if ($tx !== null) {
                    $out[] = $tx;
                }
            }
        }
        return $out;
    }

    public static function detectSection(string $name): ?string
    {
        $sys = strtolower(trim($name));
        $sys = preg_replace('/\s+/', '_', $sys) ?? $sys;
        if (isset(self::TABLE_SECTION[$sys])) {
            return self::TABLE_SECTION[$sys];
        }
        if (str_contains($sys, 'fill')) {
            return 'filling';
        }
        if (str_contains($sys, 'theft') || str_contains($sys, 'drain') || str_contains($sys, 'sudden')) {
            return 'theft';
        }
        if (str_contains($sys, 'trip') || str_contains($sys, 'fuel') || str_contains($sys, 'consum')) {
            return 'consumption';
        }
        return null;
    }

    /**
     * @param mixed $header
     * @return array<string, int>
     */
    private static function buildColumnMap(mixed $header): array
    {
        $map = [
            'time' => -1,
            'fuelUsed' => -1,
            'filled' => -1,
            'suddenFuelDrop' => -1,
            'initialLevel' => -1,
            'finalLevel' => -1,
            'mileage' => -1,
            'location' => -1,
        ];
        if (!is_array($header)) {
            return $map;
        }
        foreach (array_values($header) as $i => $h) {
            $label = strtolower(is_array($h) ? (string) ($h['n'] ?? $h['name'] ?? $h['t'] ?? '') : (string) $h);
            if ($label === '') {
                continue;
            }
            if ($map['time'] < 0 && preg_match('/time|date|begin/', $label)) {
                $map['time'] = $i;
            } elseif ($map['fuelUsed'] < 0 && preg_match('/consumed|fuel\s*used|consumption/', $label)) {
                $map['fuelUsed'] = $i;
            } elseif ($map['filled'] < 0 && preg_match('/filled|fill(ing)?\s*(volume|amount)?/', $label)) {
                $map['filled'] = $i;
            } elseif ($map['suddenFuelDrop'] < 0 && preg_match('/sudden|theft|drain|drop/', $label)) {
                $map['suddenFuelDrop'] = $i;
            } elseif ($map['initialLevel'] < 0 && preg_match('/initial|start.*level|begin.*level/', $label)) {
                $map['initialLevel'] = $i;
            } elseif ($map['finalLevel'] < 0 && preg_match('/final|end.*level|finish.*level/', $label)) {
                $map['finalLevel'] = $i;
            } elseif ($map['mileage'] < 0 && preg_match('/mileage|distance|odometer/', $label)) {
                $map['mileage'] = $i;
            } elseif ($map['location'] < 0 && preg_match('/location|address|place/', $label)) {
                $map['location'] = $i;
            }
        }
        return $map;
    }

    /**
     * @param mixed $row
     * @return array<int, mixed>
     */
    private static function normalizeCells(mixed $row): array
    {
        if (!is_array($row)) {
            return [];
        }
        if (isset($row['c']) && is_array($row['c'])) {
            return array_values($row['c']);
        }
        if (array_is_list($row)) {
            return $row;
        }
        return array_values($row);
    }

    /**
     * @param array<int, mixed> $cells
     * @param array<string, int> $columnMap
     * @return array<string, mixed>|null
     */
    private static function processRow(array $cells, array $columnMap, string $section, int $unitId, string $unitName): ?array
    {
        $initial = self::cellNumber($cells, $columnMap['initialLevel']);
        $final = self::cellNumber($cells, $columnMap['finalLevel']);
        $fuelUsed = self::cellNumber($cells, $columnMap['fuelUsed']);
        $filled = self::cellNumber($cells, $columnMap['filled']);
        $sudden = self::cellNumber($cells, $columnMap['suddenFuelDrop']);
        $mileage = self::cellNumber($cells, $columnMap['mileage']);
        $timeStr = self::cellTimeString($cells, $columnMap['time']);
        $location = self::cellValue($cells, $columnMap['location']);

        if ($section === 'consumption') {
            if ($fuelUsed <= 0 && $initial > 0 && $final >= 0 && $initial > $final) {
                $fuelUsed = $initial - $final;
            }
            $filled = 0;
            $sudden = 0;
        } elseif ($section === 'filling') {
            if ($filled <= 0 && $initial > 0 && $final > $initial) {
                $filled = $final - $initial;
            }
            $fuelUsed = 0;
            $sudden = 0;
        } elseif ($section === 'theft') {
            if ($sudden <= 0 && $initial > 0 && $final >= 0 && $initial > $final) {
                $sudden = $initial - $final;
            }
            $fuelUsed = 0;
            $filled = 0;
        }

        if ($filled <= 0 && $fuelUsed <= 0 && $sudden <= 0) {
            return null;
        }

        $ts = self::parseTime($timeStr);
        return [
            'unitId' => $unitId,
            'unitName' => $unitName,
            'section' => $section,
            'timestamp' => $ts,
            'timeStr' => $timeStr !== '' ? $timeStr : gmdate('Y-m-d H:i:s', $ts),
            'location' => $location !== '' ? $location : null,
            'initialLevel' => round($initial, 2),
            'finalLevel' => round($final, 2),
            'filled' => round($filled, 2),
            'fuelUsed' => round($fuelUsed, 2),
            'suddenFuelDrop' => round($sudden, 2),
            'mileage' => round($mileage, 2),
        ];
    }

    /** @param array<int, mixed> $cells */
    private static function cellValue(array $cells, int $idx): string
    {
        if ($idx < 0 || $idx >= count($cells)) {
            return '';
        }
        $cell = $cells[$idx];
        if (is_string($cell) || is_numeric($cell)) {
            return (string) $cell;
        }
        if (is_array($cell)) {
            if (isset($cell['t'])) {
                return (string) $cell['t'];
            }
            if (isset($cell['v'])) {
                return (string) $cell['v'];
            }
        }
        return '';
    }

    /** @param array<int, mixed> $cells */
    private static function cellNumber(array $cells, int $idx): float
    {
        if ($idx < 0 || $idx >= count($cells)) {
            return 0.0;
        }
        $cell = $cells[$idx];
        if (is_array($cell) && isset($cell['v']) && is_numeric($cell['v'])) {
            return (float) $cell['v'];
        }
        $value = self::cellValue($cells, $idx);
        if ($value === '') {
            return 0.0;
        }
        $n = (float) preg_replace('/[^\d.-]/', '', $value);
        return is_finite($n) ? $n : 0.0;
    }

    /** @param array<int, mixed> $cells */
    private static function cellTimeString(array $cells, int $idx): string
    {
        $text = trim(self::cellValue($cells, $idx));
        if ($text !== '') {
            return $text;
        }
        if ($idx >= 0 && $idx < count($cells) && is_array($cells[$idx]) && isset($cells[$idx]['v']) && is_numeric($cells[$idx]['v'])) {
            $ts = (int) $cells[$idx]['v'];
            if ($ts > 0) {
                return gmdate('Y-m-d H:i:s', $ts);
            }
        }
        return '';
    }

    private static function parseTime(string $timeStr): int
    {
        if ($timeStr === '') {
            return time();
        }
        if (ctype_digit($timeStr)) {
            $n = (int) $timeStr;
            return $n > 1e12 ? (int) floor($n / 1000) : $n;
        }
        $ts = strtotime($timeStr);
        return $ts !== false ? $ts : time();
    }
}
