# Import live Hostinger DB into StackCP MAMS

Your dump `u454222977_mams` (35 MB, 43 tables) matches the PHP app schema exactly (tenants, users, assets, fuel, workshop, Wialon `data_sources`, etc.).

**Target database (StackCP):** `mamsdb-35303030746b`  
**User:** `nsamba`  
**Host:** `127.0.0.1` (only reachable from the StackCP server / phpMyAdmin)

## Prepared files (this folder)

| File | Purpose |
|------|---------|
| `00_drop_all_mams_tables.sql` | Drops all 43 MAMS tables (safe to commit) |
| `u454222977_mams_for_stackcp.sql` | Full dump retargeted to `mamsdb-35303030746b` with drops + FK off (**gitignored**, ~35 MB) |

## Import via phpMyAdmin (recommended)

1. StackCP → **phpMyAdmin** → select database **`mamsdb-35303030746b`**
2. Optional backup: Export current DB first (in case you need to roll back)
3. **SQL** tab → Import / run `00_drop_all_mams_tables.sql`
4. **Import** tab → choose `u454222977_mams_for_stackcp.sql`  
   - Format: SQL  
   - Partial import / large file: raise upload limit if needed (35 MB)  
   - Or use **Upload Directory** if StackCP supports uploading the file via File Manager into a phpMyAdmin upload path
5. Wait until it finishes without errors
6. Confirm tables exist: `tenants`, `users`, `assets`, `alerts`, `fuel_transactions`, …
7. Ensure site `.env` has:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=nsamba
DB_PASSWORD=Mimito@@2026
DB_NAME=mamsdb-35303030746b
```

8. Test: https://mams.mimitotracking.co.ug/health  
9. Login with an existing account from this dump (passwords are the same bcrypt hashes as on Hostinger), e.g. admin emails under `@mimitotracking.co.ug`

## What this gives you

- **3 tenants:** Mimito, SSEVUME, URSB  
- **~28 users** (super_admin, tenant_admin, operators)  
- Live fleet data already synced into MySQL (alerts, assets, fuel, etc.)  
- Wialon credentials stay in `data_sources.credentials_encrypted` (same `ENCRYPTION_KEY` as before must be in `.env` or they won’t decrypt for live sync)

## Important

- This **replaces** whatever is currently in `mamsdb-35303030746b`.
- Do **not** import into a different database name without editing the `USE \`...\`` line at the top of the prepared dump.
- Keep `ENCRYPTION_KEY` / `JWT_SECRET` consistent with the environment that encrypted Wialon creds originally.
- After import, PHP modules read this MySQL data immediately; live Wialon refresh still needs the HTTP sync port (legacy) if positions go stale.
