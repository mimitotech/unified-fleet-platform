#!/usr/bin/env php
<?php
/**
 * Hostinger / crontab entry for MAMS background jobs.
 *
 * Spec intervals:
 *   alerts  — every 1 min
 *   assets  — every 5 min (fleet snapshot warm)
 *   fuel    — every 15 min
 *
 * Crontab examples:
 *   * * * * *     php /path/to/MAMS/cli/cron.php alerts
 *   */5 * * * *   php /path/to/MAMS/cli/cron.php assets
 *   */15 * * * *  php /path/to/MAMS/cli/cron.php fuel
 *   * * * * *     php /path/to/MAMS/cli/cron.php tick   # runs due jobs by minute
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/lib/Env.php';
Env::load($root . '/.env');
require_once $root . '/lib/Database.php';

$job = $argv[1] ?? 'tick';
$minute = (int) date('i');

function log_line(string $msg): void
{
    $line = '[' . date('c') . '] ' . $msg . PHP_EOL;
    echo $line;
    @file_put_contents(dirname(__DIR__) . '/storage/cron.log', $line, FILE_APPEND);
}

try {
    if ($job === 'tick') {
        // Always alerts
        require_once $root . '/lib/AlertHarvest.php';
        $a = AlertHarvest::harvestAllConnected();
        log_line('alerts tenants=' . $a['tenants'] . ' inserted=' . $a['inserted'] . ' errors=' . $a['errors']);

        if ($minute % 5 === 0) {
            require_once $root . '/lib/WialonFleet.php';
            $rows = Database::query(
                "SELECT tenant_id FROM data_sources WHERE source_type='wialon' AND is_active=1
                 AND connection_verified_at IS NOT NULL AND wialon_resource_id > 0"
            );
            $n = 0;
            foreach ($rows as $r) {
                $tid = (string) ($r['tenant_id'] ?? '');
                if ($tid === '') {
                    continue;
                }
                try {
                    WialonFleet::getCachedLiveFleet($tid);
                    $n++;
                } catch (Throwable $e) {
                    log_line('assets warm fail ' . $tid . ': ' . $e->getMessage());
                }
            }
            log_line('assets warmed=' . $n);
        }

        if ($minute % 15 === 0) {
            require_once $root . '/lib/FuelHarvest.php';
            $f = FuelHarvest::harvestAllConnected(15);
            log_line('fuel tenants=' . $f['tenants'] . ' inserted=' . $f['inserted'] . ' errors=' . $f['errors']);
        }

        if ($minute % 30 === 0) {
            require_once $root . '/lib/DomainSync.php';
            $d = DomainSync::syncAllConnected();
            log_line('domain tenants=' . $d['tenants'] . ' trips=' . $d['trips'] . ' eco=' . $d['eco'] . ' errors=' . $d['errors']);
        }
        exit(0);
    }

    if ($job === 'alerts') {
        require_once $root . '/lib/AlertHarvest.php';
        $a = AlertHarvest::harvestAllConnected();
        log_line('alerts tenants=' . $a['tenants'] . ' inserted=' . $a['inserted'] . ' errors=' . $a['errors']);
        exit(0);
    }

    if ($job === 'fuel') {
        require_once $root . '/lib/FuelHarvest.php';
        $f = FuelHarvest::harvestAllConnected(20);
        log_line('fuel tenants=' . $f['tenants'] . ' inserted=' . $f['inserted'] . ' errors=' . $f['errors']);
        exit(0);
    }

    if ($job === 'assets') {
        require_once $root . '/lib/WialonFleet.php';
        $rows = Database::query(
            "SELECT tenant_id FROM data_sources WHERE source_type='wialon' AND is_active=1
             AND connection_verified_at IS NOT NULL AND wialon_resource_id > 0"
        );
        $n = 0;
        foreach ($rows as $r) {
            $tid = (string) ($r['tenant_id'] ?? '');
            if ($tid === '') {
                continue;
            }
            try {
                WialonFleet::getCachedLiveFleet($tid);
                $n++;
            } catch (Throwable $e) {
                log_line('assets fail ' . $tid . ': ' . $e->getMessage());
            }
        }
        log_line('assets warmed=' . $n);
        exit(0);
    }

    if ($job === 'domain') {
        require_once $root . '/lib/DomainSync.php';
        $d = DomainSync::syncAllConnected();
        log_line('domain tenants=' . $d['tenants'] . ' trips=' . $d['trips'] . ' eco=' . $d['eco'] . ' errors=' . $d['errors']);
        exit(0);
    }

    log_line('Unknown job: ' . $job);
    exit(1);
} catch (Throwable $e) {
    log_line('FATAL: ' . $e->getMessage());
    exit(1);
}
