#!/usr/bin/env node
/**
 * Arena connectivity preflight check.
 * Verifies API health, API key, MCP server, and LLM proxy before competition.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load env
for (const name of ['.env.local', 'local.env', '.env']) {
  const path = join(process.cwd(), name);
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
  break;
}

const server = (process.env.ARENA_SERVER || '').trim();
const apiKey = (process.env.ARENA_API_KEY || '').trim();

if (!server) { console.error('FAIL: ARENA_SERVER not set'); process.exit(1); }
if (!apiKey) { console.error('FAIL: ARENA_API_KEY not set'); process.exit(1); }

const apiBase = `http://${server}:8000`;
const mcpUrl = `http://${server}:5001`;
const proxyUrl = `http://${server}:4001`;

async function check(label: string, url: string, headers?: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    const body = await res.text();
    if (res.ok) {
      console.log(`  ✓ ${label}: ${res.status} — ${body.slice(0, 100)}`);
      return true;
    } else {
      console.error(`  ✗ ${label}: ${res.status} — ${body.slice(0, 100)}`);
      return false;
    }
  } catch (err) {
    console.error(`  ✗ ${label}: ${err}`);
    return false;
  }
}

async function main() {
  console.log(`Arena Preflight Check`);
  console.log(`  ARENA_SERVER = ${server}`);
  console.log(`  ARENA_API_KEY = ${apiKey.slice(0, 4)}...`);
  console.log('');

  let ok = true;

  console.log('1. API Health');
  ok = await check('REST API', `${apiBase}/api/health`) && ok;

  console.log('2. API Key Validation');
  ok = await check('Key validation', `${apiBase}/api/keys/validate?key=${encodeURIComponent(apiKey)}`) && ok;

  console.log('3. LLM Proxy Models');
  ok = await check('Proxy models', `${proxyUrl}/models`, { 'Authorization': `Bearer ${apiKey}` }) && ok;

  console.log('4. MCP Server');
  // SSE endpoint holds the connection open (event stream), so a timeout means it connected.
  // A 401/403 or connection refused would be a real failure.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${mcpUrl}/sse`, {
      headers: { 'X-Arena-API-Key': apiKey, 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok || res.status === 200) {
      console.log(`  ✓ MCP SSE: connected (status ${res.status})`);
    } else {
      console.error(`  ✗ MCP SSE: ${res.status} — ${(await res.text()).slice(0, 100)}`);
      ok = false;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('abort')) {
      console.log(`  ✓ MCP SSE: connected (SSE stream held open, which is expected)`);
    } else {
      console.error(`  ✗ MCP SSE: ${err}`);
      ok = false;
    }
  }

  console.log('');
  if (ok) {
    console.log('All checks passed. Ready for arena.');
  } else {
    console.error('Some checks failed. Review above and fix before competing.');
    process.exit(1);
  }
}

main();
