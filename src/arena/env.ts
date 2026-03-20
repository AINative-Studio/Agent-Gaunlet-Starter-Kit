/**
 * Shared env file loader — single source for .env.local parsing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadLocalEnv(dir: string) {
  for (const name of ['.env.local', 'local.env', '.env']) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
      const eq = normalized.indexOf('=');
      if (eq <= 0) continue;
      const key = normalized.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = normalized.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    break;
  }
}
