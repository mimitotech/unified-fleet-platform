#!/usr/bin/env node
/**
 * Ensure platform/mail-relay/vendor exists (PHPMailer) for Hostinger outbound mail.
 * Tries composer first; falls back to downloading PHPMailer from GitHub.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mailRelay = path.join(root, 'mail-relay');
const vendorAutoload = path.join(mailRelay, 'vendor', 'autoload.php');
const phpmailerRoot = path.join(mailRelay, 'vendor', 'phpmailer', 'phpmailer');

function log(msg) {
  console.log(`[mail-relay] ${msg}`);
}

function hasRelay() {
  return fs.existsSync(vendorAutoload) && fs.existsSync(path.join(phpmailerRoot, 'src', 'PHPMailer.php'));
}

function tryComposer() {
  try {
    execSync('composer install --no-dev --optimize-autoloader', {
      stdio: 'inherit',
      cwd: mailRelay,
      env: process.env,
    });
    return hasRelay();
  } catch (err) {
    log(`composer install failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function writeFallbackAutoload() {
  const autoloadPhp = `<?php
// Minimal autoload for PHPMailer (fallback when composer is unavailable)
spl_autoload_register(static function (string $class): void {
  $prefix = 'PHPMailer\\\\PHPMailer\\\\';
  if (strncmp($prefix, $class, strlen($prefix)) !== 0) {
    return;
  }
  $relative = substr($class, strlen($prefix));
  $file = __DIR__ . '/phpmailer/phpmailer/src/' . str_replace('\\\\', '/', $relative) . '.php';
  if (is_file($file)) {
    require $file;
  }
});
`;
  fs.mkdirSync(path.dirname(vendorAutoload), { recursive: true });
  fs.writeFileSync(vendorAutoload, autoloadPhp, 'utf8');
}

function downloadPhpmailer() {
  log('Downloading PHPMailer v6.9.3…');
  fs.mkdirSync(phpmailerRoot, { recursive: true });
  const archive = path.join(mailRelay, '.phpmailer.tgz');
  try {
    execSync(
      `curl -fsSL "https://github.com/PHPMailer/PHPMailer/archive/refs/tags/v6.9.3.tar.gz" -o "${archive}"`,
      { stdio: 'inherit', cwd: mailRelay },
    );
    execSync(`tar xzf "${archive}" -C "${phpmailerRoot}" --strip-components=1`, {
      stdio: 'inherit',
      cwd: mailRelay,
    });
  } finally {
    try {
      fs.unlinkSync(archive);
    } catch {
      /* ignore */
    }
  }
  if (!fs.existsSync(path.join(phpmailerRoot, 'src', 'PHPMailer.php'))) {
    throw new Error('PHPMailer download incomplete — src/PHPMailer.php missing');
  }
  writeFallbackAutoload();
}

if (hasRelay()) {
  log('already installed');
  process.exit(0);
}

if (tryComposer() || hasRelay()) {
  log('installed via composer');
  process.exit(0);
}

try {
  downloadPhpmailer();
} catch (err) {
  console.error('[mail-relay] FATAL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}

if (!hasRelay()) {
  console.error('[mail-relay] FATAL: vendor/autoload.php still missing after install');
  process.exit(1);
}

log('installed via GitHub fallback');
