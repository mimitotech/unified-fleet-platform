-- Ensure Wialon Center tenants inherit platform token and stay active when linked.
UPDATE data_sources ds
SET inherits_platform_credentials = true,
    is_active = true,
    updated_at = NOW()
WHERE ds.source_type = 'wialon'
  AND ds.wialon_resource_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM platform_integrations pi
    WHERE pi.source_type = 'wialon' AND pi.is_active = true
  );
