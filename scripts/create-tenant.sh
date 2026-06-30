#!/usr/bin/env bash
set -euo pipefail
NAME="${1:?Tenant name}"
SLUG="${2:?Slug}"
EMAIL="${3:?Email}"
PASSWORD="${4:-changeme123}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgresql://ufp:ufp_dev@localhost:5432/unified_fleet}" \
  node --import tsx -e "
import pg from 'pg';
import bcrypt from 'bcryptjs';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const hash = await bcrypt.hash('$PASSWORD', 10);
await pool.query(\"INSERT INTO tenants (name, slug) VALUES ('$NAME', '$SLUG') ON CONFLICT (slug) DO NOTHING\");
await pool.query(\`INSERT INTO tenant_modules (tenant_id, module_key, is_enabled)
  SELECT t.id, md.key, md.default_enabled FROM tenants t CROSS JOIN module_definitions md WHERE t.slug = '$SLUG' ON CONFLICT DO NOTHING\`);
await pool.query(\`INSERT INTO users (tenant_id, email, password_hash, full_name, role)
  SELECT t.id, '$EMAIL', '\${hash}', '$NAME Admin', 'tenant_admin' FROM tenants t WHERE t.slug = '$SLUG'
  ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash\`);
await pool.end();
console.log('Tenant $SLUG ready — login:', '$EMAIL');
"
