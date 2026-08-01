-- =============================================================================
-- MAMS Hostinger MySQL — Login page slideshow media
-- Date: 2026-07-22 (login slides)
-- Database: u454222977_mams (phpMyAdmin)
-- Safe to re-run: CREATE TABLE IF NOT EXISTS
-- The Node app also auto-creates this table on startup.
-- =============================================================================

CREATE TABLE IF NOT EXISTS login_slides (
  id CHAR(36) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  details TEXT NULL,
  eyebrow VARCHAR(128) NULL,
  image_url VARCHAR(512) NULL,
  image_content LONGBLOB NULL,
  mime_type VARCHAR(128) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_login_slides_enabled_sort (is_enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- After running:
-- 1) Redeploy / restart the app
-- 2) Admin → System → Login media → Add slide (title, details, image)
-- 3) Toggle Enabled to show/hide on /login
-- Images are stored on disk under /uploads/login-slides/ and as LONGBLOB
-- so they survive Hostinger redeploys that wipe the uploads folder.
