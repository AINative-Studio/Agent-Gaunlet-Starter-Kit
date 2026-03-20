import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const repoRoot = process.cwd();
const { initMemoryLayer, remember } = await import(new URL('./dist/core/memory.js', `file://${repoRoot}/`));

function tempWorkspace() {
  return mkdtempSync(join(tmpdir(), 'gtc-gauntlet-'));
}

test('reuses stable local agent_id and rotates on demand', async () => {
  const workspace = tempWorkspace();
  const first = await initMemoryLayer({ workspaceDir: workspace, query: 'nothing' });
  const second = await initMemoryLayer({ workspaceDir: workspace, query: 'nothing' });
  const rotated = await initMemoryLayer({ workspaceDir: workspace, rotateAgentId: true, query: 'nothing' });

  assert.equal(first.backend, 'local');
  assert.equal(second.agentId, first.agentId);
  assert.notEqual(rotated.agentId, first.agentId);
  assert.ok(existsSync(join(workspace, '.gauntlet', 'agent-id.json')));
});

test('persists local memory and recalls same-agent context', async () => {
  const workspace = tempWorkspace();
  const memory = await initMemoryLayer({ workspaceDir: workspace, agentId: 'team-alpha', query: 'nebula' });
  await remember(memory, [
    { category: 'artifact', text: 'NEBULA-SPARK clue recovered from poster' },
    { category: 'attempt', text: 'Operator tried list modes first' }
  ]);

  const recalled = await initMemoryLayer({ workspaceDir: workspace, agentId: 'team-alpha', query: 'nebula' });
  assert.equal(recalled.backend, 'local');
  assert.ok(recalled.loadedContext.some((line) => line.includes('NEBULA-SPARK')));
  assert.ok(readFileSync(join(workspace, '.gauntlet', 'memory-log.jsonl'), 'utf8').includes('team-alpha'));
});

test('ignores malformed local memory lines instead of crashing recall', async () => {
  const workspace = tempWorkspace();
  const stateDir = join(workspace, '.gauntlet');
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, 'agent-id.json'), JSON.stringify({ agentId: 'team-alpha' }));
  writeFileSync(join(stateDir, 'memory-log.jsonl'), '{bad json}\n' + JSON.stringify({ agentId: 'team-alpha', category: 'artifact', text: 'clean clue' }) + '\n');

  const recalled = await initMemoryLayer({ workspaceDir: workspace, agentId: 'team-alpha', query: 'clue' });
  assert.equal(recalled.backend, 'local');
  assert.deepEqual(recalled.loadedContext, ['clean clue']);
});

test('uses ZeroDB when configured and falls back to local if search fails', async () => {
  const workspace = tempWorkspace();
  const stateDir = join(workspace, '.gauntlet');
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, 'memory-log.jsonl'), JSON.stringify({ agentId: 'team-z', category: 'artifact', text: 'local fallback clue' }) + '\n');

  const server = createServer((req, res) => {
    if (req.url?.includes('/embeddings/search')) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  process.env.ZERODB_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.ZERODB_PROJECT_ID = 'proj';
  process.env.ZERODB_API_KEY = 'key';
  delete process.env.ZERODB_MODEL;
  delete process.env.ZERODB_TABLE;

  try {
    const recalled = await initMemoryLayer({ workspaceDir: workspace, agentId: 'team-z', query: 'fallback' });
    assert.equal(recalled.backend, 'local');
    assert.ok(recalled.loadedContext.some((line) => line.includes('local fallback clue')));
  } finally {
    server.close();
    delete process.env.ZERODB_BASE_URL;
    delete process.env.ZERODB_PROJECT_ID;
    delete process.env.ZERODB_API_KEY;
  }
});

test('stores and recalls through mocked ZeroDB endpoints', async () => {
  const workspace = tempWorkspace();
  const storedBodies = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = body ? JSON.parse(body) : {};

    if (req.url?.includes('/embeddings/embed-and-store')) {
      storedBodies.push(parsed);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url?.includes('/embeddings/search')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        results: [
          { text: '[agent:team-zero] [category:artifact] [ts:2026-01-01T00:00:00.000Z] recalled from zerodb' }
        ]
      }));
      return;
    }

    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  process.env.ZERODB_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.ZERODB_PROJECT_ID = 'proj';
  process.env.ZERODB_API_KEY = 'key';
  process.env.ZERODB_MODEL = 'demo-model';
  process.env.ZERODB_TABLE = 'demo_table';

  try {
    const memory = await initMemoryLayer({ workspaceDir: workspace, agentId: 'team-zero', query: 'recalled' });
    assert.equal(memory.backend, 'zerodb');
    assert.deepEqual(memory.loadedContext, ['recalled from zerodb']);

    await remember(memory, [{ category: 'artifact', text: 'stored in zerodb too' }]);
    assert.equal(storedBodies.length, 1);
    assert.equal(storedBodies[0].model, 'demo-model');
    assert.equal(storedBodies[0].table_name, 'demo_table');
    assert.match(storedBodies[0].texts[0], /^\[agent:team-zero\] \[category:artifact\]/);
  } finally {
    server.close();
    delete process.env.ZERODB_BASE_URL;
    delete process.env.ZERODB_PROJECT_ID;
    delete process.env.ZERODB_API_KEY;
    delete process.env.ZERODB_MODEL;
    delete process.env.ZERODB_TABLE;
  }
});
