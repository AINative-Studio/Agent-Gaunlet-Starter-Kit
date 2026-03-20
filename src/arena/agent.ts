#!/usr/bin/env node
/**
 * ArenaAgent — pluggable competition agent for MCP-based arena challenges.
 *
 * Usage:
 *   npx tsx src/arena/agent.ts          # with voice
 *   npm run arena                       # same
 *   npm run arena:silent                # no voice
 *   npm run arena:local                 # against local mock
 *
 * Custom usage:
 *   import { ArenaAgent } from './arena/agent.js';
 *   const agent = new ArenaAgent({ config, textStrategy, imageStrategy, hooks });
 *   const result = await agent.run();
 */

import { ArenaHttpClient } from './client.js';
import { ArenaMcpClient } from './mcp.js';
import { ArenaProxy } from './proxy.js';
import { loadLocalEnv } from './env.js';
import { pollUntil, sleep } from './retry.js';
import { MajorityVoteStrategy } from './strategies/majority-vote.js';
import { ImageEditStrategy } from './strategies/image-edit.js';
import { playIntro, narrate, disableVoice } from './voice.js';
import type { ArenaConfig, AgentLifecycleHooks, ToolDef, SolveResult } from './types.js';
import type { TextStrategy, ImageStrategy, StrategyContext } from './strategy.js';

// ─── ArenaAgent Class ────────────────────────────────────────────────────────

export class ArenaAgent {
  private config: ArenaConfig;
  private hooks: AgentLifecycleHooks;
  private textStrategy: TextStrategy;
  private imageStrategy: ImageStrategy;
  private http: ArenaHttpClient;
  private mcp: ArenaMcpClient;
  private proxy: ArenaProxy;

  constructor(opts: {
    config: ArenaConfig;
    hooks?: AgentLifecycleHooks;
    textStrategy?: TextStrategy;
    imageStrategy?: ImageStrategy;
  }) {
    this.config = opts.config;
    this.hooks = opts.hooks ?? {};
    this.textStrategy = opts.textStrategy ?? new MajorityVoteStrategy();
    this.imageStrategy = opts.imageStrategy ?? new ImageEditStrategy();
    this.http = new ArenaHttpClient({
      apiBase: opts.config.apiBase,
      apiKey: opts.config.apiKey
    });
    this.mcp = new ArenaMcpClient({
      mcpUrl: opts.config.mcpUrl,
      apiKey: opts.config.apiKey
    });
    this.proxy = new ArenaProxy({
      proxyHost: opts.config.proxyHost,
      apiKey: opts.config.apiKey,
      agentId: opts.config.agentId
    });
  }

  async run(): Promise<SolveResult> {
    const startTime = Date.now();
    this.hooks.onOnline?.();

    try {
      // ── Health check ─────────────────────────────────────────────────────
      try {
        const health = await this.http.health();
        console.error(`[agent] API health: ${JSON.stringify(health)}`);
      } catch (err) {
        console.error(`[agent] Health check failed: ${err}`);
      }

      // ── Register ─────────────────────────────────────────────────────────
      console.error(`[agent] Registering as ${this.config.agentId} / ${this.config.agentName}...`);
      const session = await this.http.register(this.config.agentId, this.config.agentName);
      console.error(`[agent] Registered. Session: ${session.session_id}`);
      this.hooks.onRegistered?.(this.config.agentId);

      // ── Wait for battle ──────────────────────────────────────────────────
      await this.waitForBattle();

      // ── Usage scope ──────────────────────────────────────────────────────
      const usageScope = await this.http.fetchUsageScope();
      if (usageScope) {
        this.proxy.setRoundId(usageScope);
        console.error(`[agent] Usage scope: ${usageScope}`);
      }

      // ── Connect MCP + discover tools ─────────────────────────────────────
      console.error('[agent] Connecting to MCP...');
      await this.mcp.connect();
      const tools = await this.mcp.listTools();
      console.error(`[agent] Discovered ${tools.length} tool(s): ${tools.map(t => t.name).join(', ')}`);
      this.hooks.onToolsDiscovered?.(tools);
      await this.http.broadcastThought(this.config.agentId, `Discovered ${tools.length} tools`);

      // ── Fetch available models ───────────────────────────────────────────
      let availableModels: string[] = [];
      try {
        availableModels = await this.proxy.listModels();
        console.error(`[agent] Models: ${availableModels.join(', ')}`);
      } catch (err) {
        console.error(`[agent] Could not list models: ${err}`);
      }

      // ── Detect modality ──────────────────────────────────────────────────
      const modality = await this.detectModality(tools);
      console.error(`[agent] Modality: ${modality}`);
      this.hooks.onSolving?.(modality);

      // ── Build strategy context ───────────────────────────────────────────
      const ctx: StrategyContext = {
        agentId: this.config.agentId,
        http: this.http,
        mcp: this.mcp,
        proxy: this.proxy,
        tools,
        availableModels,
        startTime
      };

      // ── Solve ────────────────────────────────────────────────────────────
      let result: SolveResult;
      if (modality === 'text') {
        const { challenge, clues } = await this.fetchTextChallenge();
        this.hooks.onChallengeReceived?.(modality, challenge.description ?? '');
        result = await this.textStrategy.solve(ctx, challenge, clues);
        await this.submitTextAnswer(result, challenge.challenge_type);
      } else {
        const challenge = await this.fetchImageChallenge();
        this.hooks.onChallengeReceived?.(modality, challenge.description ?? challenge.prompt ?? '');
        result = await this.imageStrategy.solve(ctx, challenge);
        await this.checkSession();
      }

      this.hooks.onDone?.();
      return result;

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[agent] Fatal error: ${error.message}`);
      this.hooks.onError?.(error);
      try {
        await this.http.submit(this.config.agentId, 'Unable to determine answer due to error.', {
          error: error.message, elapsed_ms: Date.now() - startTime
        });
      } catch {}
      return { answer: '', totalTokens: 0, modelsUsed: [], elapsed_ms: Date.now() - startTime };
    } finally {
      await this.mcp.close();
      console.error(`[agent] Finished. Elapsed: ${Date.now() - startTime}ms`);
    }
  }

  // ── Private Methods ────────────────────────────────────────────────────────

  private async waitForBattle(): Promise<void> {
    console.error('[agent] Waiting for battle...');
    for (let wait = 0; wait < 300; wait++) {
      try {
        const health = await this.http.health();
        const phase = health?.phase ?? health?.status ?? '';
        if (/running|battle|active|started/i.test(phase)) {
          console.error(`[agent] Battle is LIVE! Phase: ${phase}`);
          return;
        }
        if (wait % 5 === 0) console.error(`[agent] Phase: ${phase} — waiting... (${wait}s)`);
      } catch {}
      await sleep(1000);
    }
    console.error('[agent] Proceeding anyway after wait timeout');
  }

  private async detectModality(tools: ToolDef[]): Promise<'text' | 'image'> {
    // Check health endpoint for hint
    try {
      const health = await this.http.health();
      const puzzleId = health?.active_puzzle_id ?? '';
      if (/image/i.test(puzzleId)) return 'image';
    } catch {}

    // Default to text, probe to verify
    try {
      const probe: any = await this.mcp.getChallenge(this.config.agentId);
      if (probe?.error || probe?.challenge_type?.includes('image')) return 'image';
      return 'text';
    } catch {
      return 'image';
    }
  }

  private async fetchTextChallenge(): Promise<{ challenge: any; clues: string[] }> {
    console.error('[agent] Fetching text challenge...');
    let challenge: any;
    for (let retry = 0; retry < 60; retry++) {
      const raw: any = await this.mcp.getChallenge(this.config.agentId);
      if (raw && !raw.error && raw.description) { challenge = raw; break; }
      if (retry === 0) console.error(`[agent] Challenge not ready: ${JSON.stringify(raw).slice(0, 150)}`);
      if (retry % 5 === 0 && retry > 0) console.error(`[agent] Waiting... (${retry}s)`);
      await sleep(1000);
      if (retry === 59) challenge = raw;
    }
    challenge = challenge!;
    console.error(`[agent] Challenge: ${challenge.challenge_type}, difficulty=${challenge.difficulty ?? '?'}`);
    console.error(`[agent] ${(challenge.description || '').slice(0, 300)}`);
    await this.http.broadcastThought(this.config.agentId, `Challenge: ${challenge.challenge_type}`);

    // Gather clues
    const clueIds = await this.mcp.listClues(this.config.agentId);
    const clues: string[] = [];
    for (const clueId of clueIds) {
      try {
        const clue = await this.mcp.getClue(clueId, this.config.agentId);
        const text = typeof clue === 'string' ? clue : (clue.text ?? JSON.stringify(clue));
        clues.push(`[${clueId}]: ${text}`);
        console.error(`[agent] Clue ${clueId}: ${text.slice(0, 150)}`);
      } catch {}
    }

    return { challenge, clues };
  }

  private async fetchImageChallenge(): Promise<any> {
    console.error('[agent] Fetching image challenge...');
    let challenge: any;
    for (let retry = 0; retry < 60; retry++) {
      const raw = await this.mcp.getImageChallenge(this.config.agentId);
      if (raw && !raw.error && (raw.description || raw.prompt)) { challenge = raw; break; }
      if (retry === 0) console.error(`[agent] Image challenge not ready: ${JSON.stringify(raw).slice(0, 150)}`);
      if (retry % 5 === 0 && retry > 0) console.error(`[agent] Waiting... (${retry}s)`);
      await sleep(1000);
      if (retry === 59) challenge = raw;
    }
    challenge = challenge!;
    console.error(`[agent] Image: ${challenge.challenge_type}, keys: ${Object.keys(challenge).join(', ')}`);
    return challenge;
  }

  private async submitTextAnswer(result: SolveResult, challengeType: string): Promise<void> {
    this.hooks.onSubmitting?.(result.answer);
    await this.http.saveDraft(this.config.agentId, result.answer);
    console.error(`[agent] Submitting: ${result.answer.slice(0, 200)}`);
    const submitResult = await this.http.submit(this.config.agentId, result.answer, {
      model_name: result.modelsUsed[0],
      models_used: result.modelsUsed,
      total_tokens: result.totalTokens,
      elapsed_ms: result.elapsed_ms,
      ...result.metadata
    }, challengeType);
    console.error(`[agent] Result: accepted=${submitResult.accepted}`);
    if (submitResult.score) {
      console.error(`[agent] Score: ${JSON.stringify(submitResult.score)}`);
      this.hooks.onScore?.(submitResult.score);
    }
    console.log(JSON.stringify(submitResult, null, 2));
  }

  private async checkSession(): Promise<void> {
    try {
      const session = await this.http.getSession(this.config.agentId);
      console.error(`[agent] Session: ${JSON.stringify(session).slice(0, 400)}`);
      if (session.score) this.hooks.onScore?.(session.score);
    } catch {}
  }
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

loadLocalEnv(process.cwd());

const config: ArenaConfig = {
  agentId: process.env.AGENT_ID || process.env.GTC_AGENT_ID || 'gtc-stage-team',
  agentName: process.env.AGENT_NAME || 'Cody',
  apiKey: process.env.ARENA_API_KEY,
  silent: !!process.env.CODY_SILENT || process.argv.includes('--silent'),
};

if (config.silent) disableVoice();

console.error('════════════════════════════════════════════════════════════');
console.error('Cody // Matrix Mode // ARENA AGENT ONLINE');
console.error(`agent_id=${config.agentId} // connecting to arena...`);
console.error('════════════════════════════════════════════════════════════');

// Voice hooks that map lifecycle events to narration
const voiceHooks: AgentLifecycleHooks = {
  onOnline: () => { playIntro(); narrate.online(); },
  onRegistered: () => narrate.registered(),
  onToolsDiscovered: (tools) => narrate.toolsFound(tools.length),
  onSolving: (m) => m === 'text' ? narrate.solvingText() : narrate.solvingImage(m),
  onSubmitting: () => narrate.submitting(),
  onScore: (s) => narrate.score(s.final_score ?? 0),
  onDone: () => narrate.done(),
};

const agent = new ArenaAgent({
  config,
  hooks: voiceHooks,
});

agent.run().catch((err) => {
  console.error(`[agent] Fatal: ${err}`);
  process.exit(1);
});
