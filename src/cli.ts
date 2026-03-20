#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectToServer } from './core/connect.js';
import { initMemoryLayer } from './core/memory.js';
import { stageBanner, buildOperatorSummary, MATRIX_PERSONA } from './core/persona.js';
import { exploreServer } from './core/explorer.js';
import { runChallenge } from './core/runner.js';
import type { ConnectionOptions } from './core/types.js';
import { parseArgs, saveJson, shellSplit } from './core/utils.js';

type RunMode = 'explore' | 'challenge';

loadLocalEnv(process.cwd());

function help() {
  console.log(`GTC Live Agent Gauntlet // Cody Matrix Mode

Usage:
  npm run explore -- --stdio --command "npm run mock" [--save reports/out.json]
  npm run challenge -- --stdio --command "npm run mock" --goal "Find the passphrase"
  npm run activate -- --run challenge --goal "Find the passphrase"
  npm run activate:mock
  npm run explore -- --url http://localhost:3000/mcp

Modes:
  explore                Recon the target MCP server
  challenge              Recon + low-risk challenge pass
  activate               Turn on runtime persona wiring and run immediately

Options:
  --run <mode>           For activate mode: explore or challenge
  --stdio                Connect over stdio by spawning a command
  --command <cmd>        Command to spawn for stdio mode
  --cwd <dir>            Working directory for the spawned server
  --url <url>            Streamable HTTP MCP endpoint
  --goal <text>          Challenge goal for runner mode
  --save <path>          Save JSON report
  --agent-id <id>        Reuse a stable team agent_id across rounds
  --rotate-agent-id      Force a fresh agent_id and persist it
  --memory-query <text>  Override recall query for prior runs
  --persona <name>       Runtime persona to activate (default: matrix)
  --json-only            Suppress live persona banner/summary

Environment:
  GTC_RUNTIME_PERSONA    Runtime persona name (default: matrix)
  GTC_RUNTIME_RUN        activate-mode run target: explore or challenge
  GTC_AGENT_ID           Default persistent team agent_id
  GTC_SERVER_COMMAND     Default stdio command for activate mode
  GTC_SERVER_CWD         Default cwd for activate mode
  GTC_SERVER_URL         Default HTTP endpoint for activate mode
  GTC_GOAL               Default challenge goal
  ZERODB_BASE_URL        ZeroDB base URL
  ZERODB_PROJECT_ID      ZeroDB project ID
  ZERODB_API_KEY         ZeroDB API key
  ZERODB_MODEL           Embedding model override
  ZERODB_TABLE           Table name override

Fastest path:
  cp team.env.example .env.local
  # edit .env.local once, then source it
  source .env.local
  npm run activate

Default persona prompt:
  ${MATRIX_PERSONA.systemPrompt}
`);
}

async function main() {
  const [rawMode, ...rest] = process.argv.slice(2);
  if (!rawMode || rawMode === '--help' || rawMode === 'help') {
    help();
    process.exit(0);
  }

  const { flags } = parseArgs(rest);
  const mode = resolveMode(rawMode, flags);
  const persona = resolvePersona(flags);
  const connection = getConnection(flags, rawMode === 'activate');
  const goal = typeof flags.goal === 'string' ? String(flags.goal) : process.env.GTC_GOAL ?? 'Solve the black-box challenge safely.';
  const memory = await initMemoryLayer({
    agentId: typeof flags['agent-id'] === 'string' ? String(flags['agent-id']) : undefined,
    rotateAgentId: Boolean(flags['rotate-agent-id']),
    workspaceDir: process.cwd(),
    query: typeof flags['memory-query'] === 'string'
      ? String(flags['memory-query'])
      : mode === 'challenge'
        ? `Goal ${goal} plus prior clues, artifacts, tool maps, and solved state`
        : 'Prior discoveries, clues, tool maps, artifacts, and solved state'
  });

  if (!flags['json-only']) {
    console.error(stageBanner(mode, memory.agentId, memory.backend));
    console.error(`persona=${persona} // runtime=${rawMode === 'activate' ? 'activated' : 'direct'}`);
  }

  const { client, transport } = await connectToServer(connection);

  try {
    const report = mode === 'challenge'
      ? await runChallenge(client, connection, goal, memory)
      : await exploreServer(client, connection, memory);

    if (!flags['json-only']) {
      console.error(buildOperatorSummary({
        mode,
        agentId: report.memory?.agentId,
        backend: report.memory?.backend,
        loadedContext: report.memory?.loadedContext,
        tools: report.capabilityMap.tools.length,
        prompts: report.capabilityMap.prompts.length,
        resources: report.capabilityMap.resources.length,
        artifacts: report.capabilityMap.artifacts.length,
        findings: Array.isArray((report as { findings?: string[] }).findings) ? (report as { findings?: string[] }).findings : undefined
      }));
    }

    console.log(JSON.stringify(report, null, 2));
    if (typeof flags.save === 'string') saveJson(String(flags.save), report);
  } finally {
    await client.close();
    await transport.close();
  }
}

function resolveMode(rawMode: string, flags: Record<string, string | boolean>): RunMode {
  if (rawMode === 'explore' || rawMode === 'challenge') return rawMode;
  if (rawMode === 'activate') {
    const requested = typeof flags.run === 'string' ? String(flags.run) : process.env.GTC_RUNTIME_RUN ?? 'challenge';
    if (requested === 'explore' || requested === 'challenge') return requested;
    throw new Error(`Invalid --run mode for activate: ${requested}`);
  }
  throw new Error(`Unknown mode: ${rawMode}`);
}

function resolvePersona(flags: Record<string, string | boolean>) {
  const persona = typeof flags.persona === 'string' ? String(flags.persona) : process.env.GTC_RUNTIME_PERSONA ?? 'matrix';
  if (persona !== 'matrix') {
    throw new Error(`Unsupported persona: ${persona}. Right now only 'matrix' is wired.`);
  }
  return persona;
}

function getConnection(flags: Record<string, string | boolean>, allowEnvDefaults = false): ConnectionOptions {
  if (typeof flags.url === 'string') return { mode: 'http', url: flags.url };
  if (flags.stdio && typeof flags.command === 'string') {
    const [command, ...args] = shellSplit(String(flags.command));
    if (!command) throw new Error('Empty --command value.');
    return { mode: 'stdio', command, args, cwd: typeof flags.cwd === 'string' ? flags.cwd : process.cwd() };
  }

  if (allowEnvDefaults) {
    if (process.env.GTC_SERVER_URL) {
      return { mode: 'http', url: process.env.GTC_SERVER_URL };
    }
    if (process.env.GTC_SERVER_COMMAND) {
      const [command, ...args] = shellSplit(process.env.GTC_SERVER_COMMAND);
      if (!command) throw new Error('GTC_SERVER_COMMAND is set but empty.');
      return {
        mode: 'stdio',
        command,
        args,
        cwd: process.env.GTC_SERVER_CWD ?? process.cwd()
      };
    }
  }

  throw new Error('Provide either --url <endpoint> or --stdio --command "...". In activate mode you can also set GTC_SERVER_URL or GTC_SERVER_COMMAND.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

function loadLocalEnv(workspaceDir: string) {
  for (const name of ['.env.local', 'local.env', '.env']) {
    const path = join(workspaceDir, name);
    if (!existsSync(path)) continue;
    applyEnvFile(path);
    break;
  }
}

function applyEnvFile(path: string) {
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
}
