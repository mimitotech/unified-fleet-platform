-- Optional: bootstrap Mimito platform admin after schema import.
-- 1) Generate hash: node -e "import('bcryptjs').then(b=>b.hash('YourStrongPassword',10).then(console.log))"
-- 2) Replace PASSWORD_HASH below, then run in phpMyAdmin.

INSERT INTO tenants (id, name, slug, primary_color, status, is_active)
SELECT UUID(), 'Mimito', 'mimito', '#004225', 'active', 1
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'mimito');

INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, is_active)
SELECT UUID(), t.id, 'admin@mimito.ug', 'PASSWORD_HASH', 'Platform Admin', 'super_admin', 1
FROM tenants t
WHERE t.slug = 'mimito'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@mimito.ug')
LIMIT 1;

INSERT INTO tenant_modules (id, tenant_id, module_key, is_enabled, is_visible)
SELECT UUID(), t.id, m.`key`, m.default_enabled, 1
FROM tenants t
CROSS JOIN module_definitions m
WHERE t.slug = 'mimito'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_modules tm
    WHERE tm.tenant_id = t.id AND tm.module_key = m.`key`
  );
