import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

export interface MemoryContext {
  agentId: string;
  backend: 'zerodb' | 'local';
  storePath: string;
  loadedContext: string[];
}

export interface MemoryEvent {
  category: 'discovery' | 'schema' | 'artifact' | 'hypothesis' | 'challenge-state' | 'attempt' | 'operator-note';
  text: string;
  metadata?: Record<string, unknown>;
}

interface ZeroDbConfig {
  baseUrl: string;
  projectId: string;
  apiKey: string;
  model: string;
  tableName: string;
}

interface StoredMemoryEvent extends MemoryEvent {
  timestamp: string;
  agentId: string;
}

export async function initMemoryLayer(options?: {
  agentId?: string;
  rotateAgentId?: boolean;
  workspaceDir?: string;
  query?: string;
}): Promise<MemoryContext> {
  const workspaceDir = options?.workspaceDir ?? process.cwd();
  const stateDir = join(workspaceDir, '.gauntlet');
  mkdirSync(stateDir, { recursive: true });

  const agentId = resolveAgentId(stateDir, options?.agentId, options?.rotateAgentId ?? false);
  const storePath = join(stateDir, 'memory-log.jsonl');
  const config = getZeroDbConfig();

  let loadedContext: string[] = [];
  let backend: 'zerodb' | 'local' = config ? 'zerodb' : 'local';

  try {
    loadedContext = config
      ? await searchZeroDb(config, options?.query ?? 'Recent GTC gauntlet attempts, clues, artifacts, solved state, and tool maps', agentId)
      : searchLocal(storePath, agentId, options?.query);
  } catch {
    backend = 'local';
    loadedContext = searchLocal(storePath, agentId, options?.query);
  }

  return { agentId, backend, storePath, loadedContext };
}

export async function remember(context: MemoryContext, events: MemoryEvent[]) {
  if (events.length === 0) return;
  const config = getZeroDbConfig();
  const stamped: StoredMemoryEvent[] = events.map((event) => ({
    ...event,
    timestamp: new Date().toISOString(),
    agentId: context.agentId
  }));

  appendLocal(context.storePath, stamped);

  if (!config) return;
  try {
    await storeZeroDb(config, stamped);
  } catch {
    // local log already captured the event; fallback stays reliable on stage
  }
}

function resolveAgentId(stateDir: string, explicitAgentId?: string, rotate = false) {
  const envAgentId = process.env.GTC_AGENT_ID;
  const chosenAgentId = explicitAgentId || envAgentId;
  const stateFile = join(stateDir, 'agent-id.json');

  if (chosenAgentId) {
    writeFileSync(stateFile, JSON.stringify({ agentId: chosenAgentId, updatedAt: new Date().toISOString() }, null, 2));
    return chosenAgentId;
  }

  if (!rotate && existsSync(stateFile)) {
    try {
      const parsed = JSON.parse(readFileSync(stateFile, 'utf8')) as { agentId?: string };
      if (parsed.agentId) return parsed.agentId;
    } catch {
      // fall through to regenerate
    }
  }

  const generated = `team-${randomUUID().slice(0, 8)}`;
  writeFileSync(stateFile, JSON.stringify({ agentId: generated, updatedAt: new Date().toISOString() }, null, 2));
  return generated;
}

function appendLocal(storePath: string, events: Array<StoredMemoryEvent | Record<string, unknown>>) {
  mkdirSync(dirname(storePath), { recursive: true });
  const lines = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
  appendFileSync(storePath, lines);
}

function searchLocal(storePath: string, agentId: string, query?: string) {
  if (!existsSync(storePath)) return [];
  const lines = readFileSync(storePath, 'utf8').split('\n').filter(Boolean);
  const needle = (query ?? '').toLowerCase();
  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => item.agentId === agentId)
    .filter((item) => {
      const blob = JSON.stringify(item).toLowerCase();
      return !needle || blob.includes(needle) || ['challenge-state', 'hypothesis', 'attempt', 'artifact', 'discovery'].includes(String(item.category ?? ''));
    })
    .slice(-12)
    .map((item) => String(item.text ?? ''));
}

function getZeroDbConfig(): ZeroDbConfig | null {
  const baseUrl = process.env.ZERODB_BASE_URL;
  const projectId = process.env.ZERODB_PROJECT_ID;
  const apiKey = process.env.ZERODB_API_KEY;
  const model = process.env.ZERODB_MODEL ?? 'BAAI/bge-small-en-v1.5';
  const tableName = process.env.ZERODB_TABLE ?? 'agent_memories';
  if (!baseUrl || !projectId || !apiKey) return null;
  return { baseUrl, projectId, apiKey, model, tableName };
}

async function storeZeroDb(config: ZeroDbConfig, events: StoredMemoryEvent[]) {
  const response = await fetch(`${config.baseUrl}/projects/${config.projectId}/embeddings/embed-and-store`, {
    method: 'POST',
    headers: {
      'X-API-Key': config.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      texts: events.map(serializeForZeroDb),
      model: config.model,
      table_name: config.tableName,
      metadata: events
    })
  });

  if (!response.ok) throw new Error(`ZeroDB store failed: ${response.status}`);
}

async function searchZeroDb(config: ZeroDbConfig, query: string, agentId: string) {
  const response = await fetch(`${config.baseUrl}/projects/${config.projectId}/embeddings/search`, {
    method: 'POST',
    headers: {
      'X-API-Key': config.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `[agent:${agentId}] ${query}`,
      model: config.model,
      table_name: config.tableName,
      top_k: 12,
      threshold: 0.0
    })
  });

  if (!response.ok) throw new Error(`ZeroDB search failed: ${response.status}`);
  const json = await response.json() as {
    results?: Array<{
      text?: string;
      document?: string;
      vector_metadata?: Record<string, unknown> | null;
    }>;
  };

  return (json.results ?? [])
    .map((item) => item.text ?? item.document ?? '')
    .filter(Boolean)
    .map(extractStoredText)
    .filter((text) => text.includes(`[agent:${agentId}]`))
    .map((text) => stripStoredPrefix(text))
    .slice(0, 8);
}

function serializeForZeroDb(event: StoredMemoryEvent) {
  return `[agent:${event.agentId}] [category:${event.category}] [ts:${event.timestamp}] ${event.text}`;
}

function extractStoredText(value: string) {
  return value.trim();
}

function stripStoredPrefix(value: string) {
  return value
    .replace(/^\[agent:[^\]]+\]\s*/, '')
    .replace(/^\[category:[^\]]+\]\s*/, '')
    .replace(/^\[ts:[^\]]+\]\s*/, '')
    .trim();
}
