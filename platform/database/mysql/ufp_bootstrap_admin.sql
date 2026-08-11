-- Bootstrap Mimito platform admin (run ONCE in phpMyAdmin → SQL on u632889724_mams).
-- Login: admin@mimitotracking.co.ug / MamsAdmin@@123
-- WARNING: The UPDATE below resets that password every time this script is run.
-- Do not re-run on production after the admin has changed their password.

INSERT INTO tenants (id, name, slug, primary_color, status, is_active)
SELECT UUID(), 'Mimito', 'mimito', '#004225', 'active', 1
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'mimito');

-- Create admin if missing
INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, is_active)
SELECT UUID(), t.id, 'admin@mimitotracking.co.ug',
  '$2b$10$zI3rDQYQNN8DdTZS1c90Ceut7.wgj.B38coWlgg/nqoM0daFWsQKG',
  'Platform Admin', 'super_admin', 1
FROM tenants t
WHERE t.slug = 'mimito'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@mimitotracking.co.ug')
LIMIT 1;

-- Optional: reset password / role only when intentionally recovering access
UPDATE users
SET password_hash = '$2b$10$zI3rDQYQNN8DdTZS1c90Ceut7.wgj.B38coWlgg/nqoM0daFWsQKG',
    full_name = 'Platform Admin',
    role = 'super_admin',
    is_active = 1,
    force_password_change = 0,
    tenant_id = (SELECT id FROM tenants WHERE slug = 'mimito' LIMIT 1),
    updated_at = CURRENT_TIMESTAMP(3)
WHERE email = 'admin@mimitotracking.co.ug';

INSERT INTO tenant_modules (id, tenant_id, module_key, is_enabled, is_visible)
SELECT UUID(), t.id, m.`key`, m.default_enabled, 1
FROM tenants t
CROSS JOIN module_definitions m
WHERE t.slug = 'mimito'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_modules tm
    WHERE tm.tenant_id = t.id AND tm.module_key = m.`key`
  );
