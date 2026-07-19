-- 029: Remove standalone Reports module (reports live inside each module tab)
DELETE FROM user_modules WHERE module_key = 'reports';
DELETE FROM tenant_modules WHERE module_key = 'reports';
DELETE FROM module_definitions WHERE key = 'reports';
