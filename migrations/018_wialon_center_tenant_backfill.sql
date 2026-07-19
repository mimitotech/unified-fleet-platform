-- Tenants linked to a Wialon Center account should inherit the platform mother token.
UPDATE data_sources ds
SET inherits_platform_credentials = true,
    updated_at = NOW()
WHERE ds.source_type = 'wialon'
  AND ds.wialon_resource_id IS NOT NULL
  AND ds.inherits_platform_credentials = false
  AND EXISTS (
    SELECT 1 FROM platform_integrations pi
    WHERE pi.source_type = 'wialon' AND pi.is_active = true
  );
