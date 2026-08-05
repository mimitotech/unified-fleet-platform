<?php
/**
 * Minimal XLSX (Office Open XML) reader — first sheet as rows of cells.
 * No Composer dependency; uses ZipArchive + SimpleXML.
 */
final class XlsxReader
{
    /**
     * @return list<list<mixed>> rows (including header)
     */
    public static function sheetRows(string $binary): array
    {
        if (!class_exists('ZipArchive')) {
            throw new RuntimeException('ZipArchive extension required for xlsx import');
        }
        $tmp = tempnam(sys_get_temp_dir(), 'mams_xlsx_');
        if ($tmp === false) {
            throw new RuntimeException('Could not create temp file for xlsx');
        }
        file_put_contents($tmp, $binary);
        $zip = new ZipArchive();
        if ($zip->open($tmp) !== true) {
            @unlink($tmp);
            throw new RuntimeException('Invalid xlsx file');
        }

        try {
            $shared = [];
            $ss = $zip->getFromName('xl/sharedStrings.xml');
            if ($ss !== false) {
                $xml = @simplexml_load_string($ss);
                if ($xml) {
                    foreach ($xml->si as $si) {
                        if (isset($si->t)) {
                            $shared[] = (string) $si->t;
                        } else {
                            $parts = [];
                            foreach ($si->r as $r) {
                                $parts[] = (string) ($r->t ?? '');
                            }
                            $shared[] = implode('', $parts);
                        }
                    }
                }
            }

            // Prefer first worksheet path from workbook
            $sheetPath = 'xl/worksheets/sheet1.xml';
            $wb = $zip->getFromName('xl/workbook.xml');
            if ($wb !== false) {
                $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
                $relMap = [];
                if ($rels !== false) {
                    $rx = @simplexml_load_string($rels);
                    if ($rx) {
                        foreach ($rx->Relationship as $rel) {
                            $id = (string) ($rel['Id'] ?? '');
                            $target = (string) ($rel['Target'] ?? '');
                            if ($id !== '' && $target !== '') {
                                $relMap[$id] = 'xl/' . ltrim($target, '/');
                            }
                        }
                    }
                }
                $wx = @simplexml_load_string($wb);
                if ($wx) {
                    $wx->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
                    $wx->registerXPathNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
                    $sheets = $wx->xpath('//m:sheets/m:sheet') ?: [];
                    if ($sheets) {
                        $rid = (string) ($sheets[0]->attributes('r', true)['id'] ?? '');
                        if ($rid !== '' && isset($relMap[$rid])) {
                            $sheetPath = $relMap[$rid];
                        }
                    }
                }
            }

            $sheetXml = $zip->getFromName($sheetPath);
            if ($sheetXml === false) {
                throw new RuntimeException('xlsx worksheet not found');
            }
            $sheet = @simplexml_load_string($sheetXml);
            if (!$sheet) {
                throw new RuntimeException('Could not parse worksheet XML');
            }

            $rows = [];
            foreach ($sheet->sheetData->row as $row) {
                $cells = [];
                $maxCol = -1;
                foreach ($row->c as $c) {
                    $ref = (string) ($c['r'] ?? '');
                    $col = self::colIndex($ref);
                    if ($col > $maxCol) {
                        $maxCol = $col;
                    }
                    $type = (string) ($c['t'] ?? '');
                    $val = isset($c->v) ? (string) $c->v : '';
                    if ($type === 's') {
                        $idx = (int) $val;
                        $val = $shared[$idx] ?? '';
                    } elseif ($type === 'b') {
                        $val = $val === '1' ? 'TRUE' : 'FALSE';
                    } elseif ($type === 'inlineStr') {
                        $val = (string) ($c->is->t ?? '');
                    } elseif (is_numeric($val) && isset($c['s'])) {
                        // leave numeric (dates may be serials — caller handles)
                        $val = 0 + $val;
                    }
                    $cells[$col] = $val;
                }
                $line = [];
                for ($i = 0; $i <= $maxCol; $i++) {
                    $line[] = $cells[$i] ?? '';
                }
                $rows[] = $line;
            }
            return $rows;
        } finally {
            $zip->close();
            @unlink($tmp);
        }
    }

    private static function colIndex(string $ref): int
    {
        if (!preg_match('/^([A-Z]+)/i', $ref, $m)) {
            return 0;
        }
        $letters = strtoupper($m[1]);
        $n = 0;
        for ($i = 0, $len = strlen($letters); $i < $len; $i++) {
            $n = $n * 26 + (ord($letters[$i]) - 64);
        }
        return max(0, $n - 1);
    }
}
