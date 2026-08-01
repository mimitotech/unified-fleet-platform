-- Durable tenant logos/favicons (Hostinger-safe).
-- Prefer app auto-migrate (UploadService.ensureSchema) — Hostinger MySQL may not
-- support ADD COLUMN IF NOT EXISTS. Run these one at a time and ignore duplicate-column errors.

ALTER TABLE tenant_files ADD COLUMN content LONGBLOB NULL;
ALTER TABLE tenant_files ADD COLUMN public_url VARCHAR(512) NULL;
CREATE INDEX idx_tenant_files_public_url ON tenant_files (public_url);
