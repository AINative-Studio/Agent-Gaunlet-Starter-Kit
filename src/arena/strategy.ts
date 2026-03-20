/**
 * Strategy interfaces — plug different solving approaches into the ArenaAgent.
 */

import type { ArenaHttpClient } from './client.js';
import type { ArenaMcpClient } from './mcp.js';
import type { ArenaProxy } from './proxy.js';
import type { ToolDef, TextChallenge, ImageChallenge, SolveResult } from './types.js';

export interface StrategyContext {
  agentId: string;
  http: ArenaHttpClient;
  mcp: ArenaMcpClient;
  proxy: ArenaProxy;
  tools: ToolDef[];
  availableModels: string[];
  startTime: number;
}

export interface TextStrategy {
  readonly name: string;
  solve(ctx: StrategyContext, challenge: TextChallenge, clues: string[]): Promise<SolveResult>;
}

export interface ImageStrategy {
  readonly name: string;
  solve(ctx: StrategyContext, challenge: ImageChallenge): Promise<SolveResult>;
}
