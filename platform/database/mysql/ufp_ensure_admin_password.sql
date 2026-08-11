-- Ensure platform admin exists with a strong password — does NOT delete other users.
-- Run in phpMyAdmin → SQL on your production database (e.g. u632889724_mams).
--
-- Admin login after running:
--   Email:    admin@mimitotracking.co.ug
--   Password: MimitoAdmin@@2100#
--
-- bcrypt hash (cost 10) for MimitoAdmin@@2100#:
--   $2b$10$pmsUm9HotpmKMbqCsJAYM.5PH71qnG5Abw.g54smE5usnFYjwBWdy

-- 1) Ensure Mimito tenant exists (safe if already present)
INSERT INTO tenants (id, name, slug, primary_color, status, is_active)
SELECT UUID(), 'Mimito', 'mimito', '#004225', 'active', 1
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'mimito');

-- 2) Create admin if missing (does not overwrite password if email already exists)
INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, is_active, force_password_change)
SELECT UUID(), t.id, 'admin@mimitotracking.co.ug',
  '$2b$10$pmsUm9HotpmKMbqCsJAYM.5PH71qnG5Abw.g54smE5usnFYjwBWdy',
  'Platform Admin', 'super_admin', 1, 0
FROM tenants t
WHERE t.slug = 'mimito'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@mimitotracking.co.ug')
LIMIT 1;

-- 3) OPTIONAL: Reset admin password only (uncomment if you need to recover access)
--    Other users are untouched.
-- UPDATE users
-- SET password_hash = '$2b$10$pmsUm9HotpmKMbqCsJAYM.5PH71qnG5Abw.g54smE5usnFYjwBWdy',
--     full_name = 'Platform Admin',
--     role = 'super_admin',
--     is_active = 1,
--     force_password_change = 0,
--     tenant_id = (SELECT id FROM tenants WHERE slug = 'mimito' LIMIT 1),
--     updated_at = CURRENT_TIMESTAMP(3)
-- WHERE email = 'admin@mimitotracking.co.ug';
