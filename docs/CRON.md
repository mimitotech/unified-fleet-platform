# Cron setup (Hostinger)

Parity with Node SyncScheduler:

| Interval | Job | Command |
|----------|-----|---------|
| 1 min | Alert harvest → MySQL Inbox | `php cli/cron.php alerts` |
| 5 min | Fleet snapshot warm | `php cli/cron.php assets` |
| 15 min | Fuel reports → DB | `php cli/cron.php fuel` |
| 30 min | Trips + eco violations → DB | `php cli/cron.php domain` |

Or a single every-minute tick that runs due jobs:

```cron
* * * * * cd /home/USER/domains/YOURDOMAIN/public_html && /usr/bin/php cli/cron.php tick >> storage/cron.log 2>&1
```

Ensure `storage/` is writable. Logs append to `storage/cron.log`.

Guides: `docs/SYSTEM-COMPLETE-GUIDE.md`, `docs/SYSTEM-REPRODUCTION-SPEC.md`.
