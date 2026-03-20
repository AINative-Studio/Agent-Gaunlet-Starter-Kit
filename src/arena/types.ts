/**
 * Shared types for the Arena agent framework.
 */

export interface ArenaConfig {
  agentId: string;
  agentName: string;
  arenaServer?: string;
  apiBase?: string;
  mcpUrl?: string;
  proxyHost?: string;
  apiKey?: string;
  silent?: boolean;
  preferredModel?: string;
}

export interface ToolDef {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface TextChallenge {
  challenge_type: string;
  challenge_id?: string;
  puzzle_id?: string;
  description: string;
  rules?: string;
  difficulty?: string;
  max_time_s?: number;
  clues_available?: number;
  time_remaining_s?: number;
  [key: string]: unknown;
}

export interface ImageChallenge {
  challenge_type: string;
  challenge_id?: string;
  description: string;
  prompt?: string;
  edit_prompt?: string;
  input_image_uri?: string;
  image_url?: string;
  reference_image?: string;
  max_time_s?: number;
  required_tools?: string[];
  [key: string]: unknown;
}

export interface ClueInfo {
  clue_id: string;
  text: string;
}

export interface SolveResult {
  answer: string;
  totalTokens: number;
  modelsUsed: string[];
  elapsed_ms: number;
  challengeType?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentLifecycleHooks {
  onOnline?: () => void;
  onRegistered?: (agentId: string) => void;
  onToolsDiscovered?: (tools: ToolDef[]) => void;
  onChallengeReceived?: (modality: string, description: string) => void;
  onSolving?: (modality: string) => void;
  onSubmitting?: (answer: string) => void;
  onScore?: (score: Record<string, number>) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}
