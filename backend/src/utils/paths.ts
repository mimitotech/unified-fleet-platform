import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve uploads directory consistently for write + static serve. */
export function resolveUploadRoot(): string {
  const fromEnv = process.env.UPLOAD_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }
  const candidates = [
    path.resolve(process.cwd(), 'uploads'),
    path.resolve(__dirname, '../uploads'),
    path.resolve(__dirname, '../../uploads'),
  ];
  return candidates.find((p) => existsSync(p)) || candidates[0];
}
