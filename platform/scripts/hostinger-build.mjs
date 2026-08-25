#!/usr/bin/env node
/**
 * Hostinger shared hosting often strips +x from node_modules/.bin and esbuild.
 * Run after: npm install --legacy-peer-deps --ignore-scripts
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

function log(msg) {
  console.log(`[hostinger-build] ${msg}`);
}

function chmodFile(file) {
  try {
    if (fs.existsSync(file)) fs.chmodSync(file, 0o755);
  } catch {
    /* ignore */
  }
}

function chmodTree(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) chmodFile(full);
      else if (stat.isDirectory()) chmodTree(full);
    } catch {
      /* ignore */
    }
  }
}

function fixPermissions() {
  log('Fixing binary permissions…');
  chmodTree(path.join(root, 'node_modules', '.bin'));
  chmodTree(path.join(root, 'node_modules', 'esbuild', 'bin'));

  const esbuildScope = path.join(root, 'node_modules', '@esbuild');
  if (fs.existsSync(esbuildScope)) {
    for (const pkg of fs.readdirSync(esbuildScope)) {
      chmodFile(path.join(esbuildScope, pkg, 'bin', 'esbuild'));
    }
  }

  const esbuildInstall = path.join(root, 'node_modules', 'esbuild', 'install.js');
  if (fs.existsSync(esbuildInstall)) {
    try {
      execSync(`node "${esbuildInstall}"`, { stdio: 'inherit', cwd: root });
    } catch (err) {
      log(`esbuild install.js warning: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function requireFile(rel, label) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`${label} not found at ${rel}. Run npm install first.`);
  }
  return full;
}

function runNode(scriptPath, args, cwd = root) {
  const cmd = `node "${scriptPath}" ${args}`;
  log(cmd);
  execSync(cmd, { stdio: 'inherit', cwd, env: { ...process.env, FORCE_COLOR: '0' } });
}

fixPermissions();

const tsc = requireFile('node_modules/typescript/bin/tsc', 'TypeScript');
const vite = requireFile('node_modules/vite/bin/vite.js', 'Vite');

log('Building @ufp/shared…');
runNode(tsc, '-p packages/shared/tsconfig.json');

log('Building frontend…');
runNode(vite, 'build', path.join(root, 'frontend'));

log('Building backend…');
runNode(tsc, '-p backend/tsconfig.json');

const mailRelay = path.join(root, 'mail-relay');
const composerJson = path.join(mailRelay, 'composer.json');
if (fs.existsSync(composerJson)) {
  log('Installing PHPMailer relay (mail-relay)…');
  try {
    execSync('composer install --no-dev --optimize-autoloader', {
      stdio: 'inherit',
      cwd: mailRelay,
      env: process.env,
    });
  } catch (err) {
    log(`composer install warning: ${err instanceof Error ? err.message : String(err)}`);
    log('If outbound mail fails on Hostinger, run: cd mail-relay && composer install --no-dev');
  }
}

log('Build complete.');
