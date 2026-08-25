import { spawnSync } from 'node:child_process';

let cached: boolean | null = null;

/** Hostinger Node apps usually have no PHP CLI — PHPMailer relay needs this. */
export function isPhpCliAvailable(): boolean {
  if (cached !== null) return cached;
  const phpBin = String(process.env.PHP_BIN || 'php').trim() || 'php';
  try {
    const result = spawnSync(phpBin, ['-v'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    cached = result.status === 0 && /php/i.test(String(result.stdout || result.stderr || ''));
  } catch {
    cached = false;
  }
  return cached;
}

export function resetPhpCliCache(): void {
  cached = null;
}
