# Unified Fleet Platform / MAMS

PHP + HTML + CSS + JavaScript on Apache (StackCP). Same MySQL database and domain.

## Layout (document root = clone root)

```
repos/mams/                 ← Git clone AND domain document root
  index.php                 ← pages + /health
  .htaccess
  .env                      ← create on server (not in git)
  bootstrap.php
  api/                      ← JSON API (/api/*)
  assets/                   ← css, js, images
  lib/                      ← PHP core
  views/                    ← HTML templates
  uploads/
  database/                 ← SQL schema reference
  deploy/                   ← deploy docs
  legacy/                   ← old Node app (reference only, not served)
```

## Production

| Setting | Value |
|---------|--------|
| Domain | https://mams.mimitotracking.co.ug |
| GitHub | https://github.com/mimitotech/unified-fleet-platform.git |
| Document root | `repos/mams` |
| PHP | 8.1+ |
| Database | `mamsdb-35303030746b` / user `nsamba` |
| Branch | `master` |

Guide: [`deploy/PHP_SITE_DEPLOY.md`](deploy/PHP_SITE_DEPLOY.md)

## Local

```bash
cp .env.example .env   # set DB_* 
# Point a local PHP 8.1+ vhost at this folder, or:
php -S 127.0.0.1:8080
```
