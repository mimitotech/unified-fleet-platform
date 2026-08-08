-- Per-user allowlist of Wialon notification / alert types (client admin ACL).
-- NULL / [] = none for non-admins. Tenant admins bypass ACL.

ALTER TABLE users
  ADD COLUMN allowed_alert_types JSON NULL;
