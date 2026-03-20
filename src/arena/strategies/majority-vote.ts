/**
 * MajorityVoteStrategy — solves text challenges by:
 * 1. Calling all available tools for context
 * 2. Solving with a primary model
 * 3. Verifying with multiple models in parallel
 * 4. Using majority vote to pick the best answer
 */

import type { TextStrategy, StrategyContext } from '../strategy.js';
import type { TextChallenge, SolveResult } from '../types.js';
import type { ChatMessage } from '../proxy.js';

export class MajorityVoteStrategy implements TextStrategy {
  readonly name = 'majority-vote';

  private maxVerifyModels: number;
  private maxToolProbes: number;
  private systemPrompt: string;

  constructor(opts?: { maxVerifyModels?: number; maxToolProbes?: number; systemPrompt?: string }) {
    this.maxVerifyModels = opts?.maxVerifyModels ?? 6;
    this.maxToolProbes = opts?.maxToolProbes ?? 10;
    this.systemPrompt = opts?.systemPrompt ??
      `You are a competition-winning problem solver. You MUST follow the output format rules exactly.
CRITICAL: Your first line must always be: ANSWER: <your final answer>
Then optionally add 1-2 lines of brief reasoning.
Be precise. Follow ALL challenge rules exactly. Format your answer exactly as required by the rules.`;
  }

  async solve(ctx: StrategyContext, challenge: TextChallenge, clues: string[]): Promise<SolveResult> {
    let totalTokens = 0;
    const modelsUsed: string[] = [];

    // ── Call extra tools for context ──────────────────────────────────────────
    const extraToolResults: string[] = [];
    const probableTools = ctx.tools.filter(t =>
      !t.name.includes('submit') && !t.name.includes('broadcast')
      && t.name !== 'arena.get_challenge' && t.name !== 'arena.clues.list' && t.name !== 'arena.clues.get'
    );
    for (const tool of probableTools.slice(0, this.maxToolProbes)) {
      try {
        const args = buildSafeArgs(tool.inputSchema);
        if (tool.inputSchema?.properties?.agent_id) args.agent_id = ctx.agentId;
        const result = await ctx.mcp.callTool(tool.name, args);
        const text = JSON.stringify(result.content ?? result).slice(0, 400);
        extraToolResults.push(`[${tool.name}]: ${text}`);
      } catch {}
    }

    // ── Solve with primary model (with fallback) ─────────────────────────────
    const primaryModel = await ctx.proxy.selectModel(challenge.challenge_type, challenge.difficulty, ctx.availableModels);
    const userPrompt = buildSolverPrompt(challenge, clues, extraToolResults);
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let llmContent = '';
    const fallbacks = [primaryModel, ...ctx.availableModels.filter(m => m !== primaryModel && !/image|vl$|ultra.*253|qwen3\.5/i.test(m)).slice(0, 5)];
    for (const model of fallbacks) {
      try {
        const result = await ctx.proxy.chat(messages, { model, temperature: 0.0, maxTokens: 400 });
        totalTokens += result.usage.total_tokens;
        modelsUsed.push(model);
        llmContent = result.content;
        console.error(`[strategy] ${model} (${result.usage.total_tokens}t): ${result.content.slice(0, 200)}`);
        break;
      } catch (err) {
        console.error(`[strategy] ${model} FAILED: ${err}`);
      }
    }

    let answer = extractAnswer(llmContent || 'Unable to solve');

    // ── Verify with multiple models in parallel ──────────────────────────────
    const verifyModels = ctx.availableModels
      .filter(m => !modelsUsed.includes(m) && !/image|vl$|ultra.*253|qwen3\.5/i.test(m))
      .slice(0, this.maxVerifyModels);

    const verifyResults = await Promise.all(verifyModels.map(async (vm) => {
      try {
        const verifyMessages: ChatMessage[] = [
          { role: 'system', content: 'Verify this answer. Reply ONLY with: ANSWER: <correct answer>' },
          { role: 'user', content: `Challenge: ${challenge.description}\nRules: ${challenge.rules ?? ''}\nClues:\n${clues.join('\n')}\n\nProposed: ${answer}\n\nReply with ANSWER:` }
        ];
        const vResult = await ctx.proxy.chat(verifyMessages, { model: vm, temperature: 0.0, maxTokens: 150 });
        totalTokens += vResult.usage.total_tokens;
        modelsUsed.push(vm);
        const vAnswer = extractAnswer(vResult.content);
        console.error(`[strategy] Verify ${vm}: ${vAnswer.slice(0, 80)}`);
        return { model: vm, answer: vAnswer };
      } catch {
        console.error(`[strategy] ${vm}: FAIL`);
        return null;
      }
    }));

    // ── Majority vote ────────────────────────────────────────────────────────
    const answerCounts = new Map<string, number>();
    answerCounts.set(answer, 1);
    for (const r of verifyResults) {
      if (r?.answer) answerCounts.set(r.answer, (answerCounts.get(r.answer) ?? 0) + 1);
    }
    let bestAnswer = answer;
    let bestCount = answerCounts.get(answer) ?? 1;
    for (const [a, c] of answerCounts) {
      if (c > bestCount) { bestAnswer = a; bestCount = c; }
    }
    if (bestAnswer !== answer) {
      console.error(`[strategy] Majority vote override: ${bestAnswer.slice(0, 80)} (${bestCount} votes)`);
      answer = bestAnswer;
    }

    return {
      answer,
      totalTokens,
      modelsUsed,
      elapsed_ms: Date.now() - ctx.startTime,
      challengeType: challenge.challenge_type,
      metadata: { toolsUsed: probableTools.length + 3, cluesUsed: clues.length }
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSolverPrompt(challenge: TextChallenge, clues: string[], extraTools: string[]): string {
  let prompt = `CHALLENGE TYPE: ${challenge.challenge_type}\n`;
  if (challenge.difficulty) prompt += `DIFFICULTY: ${challenge.difficulty}\n`;
  prompt += `\nCHALLENGE:\n${challenge.description}\n`;
  if (challenge.rules) prompt += `\nRULES:\n${challenge.rules}\n`;
  if (clues.length > 0) prompt += `\nCLUES:\n${clues.join('\n')}\n`;
  if (extraTools.length > 0) prompt += `\nADDITIONAL TOOL RESULTS:\n${extraTools.join('\n')}\n`;
  prompt += `\nSolve this challenge. Your first line MUST be: ANSWER: <your final answer>`;
  return prompt;
}

export function extractAnswer(text: string): string {
  const patterns = [
    /^ANSWER:\s*(.+)$/mi,
    /^Final answer:\s*(.+)$/mi,
    /ANSWER:\s*(.+?)(?:\n|$)/i,
    /Final answer:\s*(.+?)(?:\n|$)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return text.trim();
}

function buildSafeArgs(schema: any): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {};
  const properties = schema.properties ?? {};
  const required = new Set<string>(schema.required ?? []);
  const args: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries<any>(properties)) {
    if (prop?.default !== undefined) { args[key] = prop.default; continue; }
    if (prop?.enum?.length) { args[key] = prop.enum[0]; continue; }
    const type = Array.isArray(prop?.type) ? prop.type[0] : prop?.type;
    if (/query|prompt|text|search/i.test(key)) args[key] = 'search';
    else if (type === 'string') args[key] = '';
    else if (type === 'number' || type === 'integer') args[key] = 0;
    else if (type === 'boolean') args[key] = false;
    else if (type === 'array') args[key] = [];
    else if (type === 'object') args[key] = {};
    else if (required.has(key)) args[key] = '';
  }
  return args;
}
