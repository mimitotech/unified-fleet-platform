# MySQL schema (Hostinger / phpMyAdmin)

1. Open phpMyAdmin for database `u632889724_mams` (must be empty or drop old tables first).
2. Import **`ufp_complete_schema.sql`**.
3. On an existing live DB, also run **`ufp_production_hardening_2026-08-11.sql`** (indexes + alert uniqueness). New deploys also apply these on boot.
4. Do not change the SQL to PostgreSQL — this file is MySQL 8 / MariaDB only.
5. Then set Hostinger Node env vars from `deploy/hostinger.env.example`
   (domain `https://mams.mimitotracking.com`).
