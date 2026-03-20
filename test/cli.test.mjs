import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const cli = join(repoRoot, 'dist', 'cli.js');

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env }
  });
}

test('help exits cleanly', () => {
  const result = runCli(['help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GTC Live Agent Gauntlet/);
});

test('activate mode rejects invalid run flag', () => {
  const result = runCli(['activate', '--run', 'boom'], { env: { GTC_SERVER_COMMAND: 'npm run mock' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid --run mode/);
});

test('unsupported persona fails fast', () => {
  const result = runCli(['explore', '--stdio', '--command', 'npm run mock', '--persona', 'neo']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported persona/);
});

test('missing connection flags fail with actionable error', () => {
  const result = runCli(['explore']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Provide either --url <endpoint> or --stdio --command/);
});

test('demo explore runs end-to-end and saves report', () => {
  const output = mkdtempSync(join(tmpdir(), 'gtc-cli-'));
  const savePath = join(output, 'explore.json');
  const result = runCli(['explore', '--stdio', '--command', 'npm run mock', '--agent-id', 'team-cli', '--save', savePath, '--json-only']);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(savePath));
  const report = JSON.parse(readFileSync(savePath, 'utf8'));
  assert.equal(report.memory.agentId, 'team-cli');
  assert.equal(report.capabilityMap.tools.length, 4);
  assert.ok(report.capabilityMap.artifacts.some((artifact) => artifact.kind === 'image'));
});

test('challenge mode only marks answer-like payloads as solved leads', () => {
  const output = mkdtempSync(join(tmpdir(), 'gtc-challenge-'));
  const savePath = join(output, 'challenge.json');
  const result = runCli(['challenge', '--stdio', '--command', 'npm run mock', '--agent-id', 'team-challenge', '--save', savePath, '--json-only']);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readFileSync(savePath, 'utf8'));
  const payloadFinds = report.findings.filter((line) => line.includes('Potential challenge payload found'));
  assert.deepEqual(payloadFinds, ['Potential challenge payload found in tool get_passphrase.']);
});

test('local operator cwd keeps reports and resumable state on the laptop workspace', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gtc-local-workspace-'));
  const result = spawnSync(process.execPath, [cli, 'explore', '--stdio', '--command', 'npm run mock', '--cwd', repoRoot, '--agent-id', 'team-local', '--save', 'reports/local-explore.json', '--json-only'], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(workspace, 'reports', 'local-explore.json')));
  assert.ok(existsSync(join(workspace, '.gauntlet', 'agent-id.json')));
  assert.ok(existsSync(join(workspace, '.gauntlet', 'memory-log.jsonl')));
  assert.equal(JSON.parse(readFileSync(join(workspace, '.gauntlet', 'agent-id.json'), 'utf8')).agentId, 'team-local');
});

test('activate mode uses env defaults and stable agent_id', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gtc-activate-'));
  const savePath = join(workspace, 'challenge.json');
  const env = {
    GTC_RUNTIME_RUN: 'challenge',
    GTC_RUNTIME_PERSONA: 'matrix',
    GTC_SERVER_COMMAND: 'npm run mock',
    GTC_SERVER_CWD: repoRoot,
    GTC_AGENT_ID: 'team-env',
    GTC_GOAL: 'Find the hidden passphrase',
  };
  const result = spawnSync(process.execPath, [cli, 'activate', '--save', savePath, '--json-only'], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(readFileSync(savePath, 'utf8'));
  assert.equal(report.memory.agentId, 'team-env');
  assert.ok(report.findings.some((line) => line.includes('NEBULA-SPARK')));
  assert.equal(JSON.parse(readFileSync(join(workspace, '.gauntlet', 'agent-id.json'), 'utf8')).agentId, 'team-env');
});

test('local resume works across repeated activate runs in the same workspace', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'gtc-resume-'));
  const env = {
    GTC_RUNTIME_RUN: 'challenge',
    GTC_RUNTIME_PERSONA: 'matrix',
    GTC_SERVER_COMMAND: 'npm run mock',
    GTC_SERVER_CWD: repoRoot,
    GTC_AGENT_ID: 'team-resume',
  };

  const first = spawnSync(process.execPath, [cli, 'activate', '--save', 'reports/first.json', '--json-only'], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
  const second = spawnSync(process.execPath, [cli, 'activate', '--save', 'reports/second.json', '--json-only'], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const report = JSON.parse(readFileSync(join(workspace, 'reports', 'second.json'), 'utf8'));
  assert.equal(report.memory.agentId, 'team-resume');
  assert.equal(report.memory.backend, 'local');
  assert.ok(report.memory.loadedContext.length > 0);
});
