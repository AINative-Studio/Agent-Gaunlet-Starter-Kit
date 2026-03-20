export type ConnectionOptions =
  | { mode: 'stdio'; command: string; args: string[]; cwd?: string }
  | { mode: 'http'; url: string };

export type ArtifactKind = 'text' | 'image' | 'audio' | 'video' | 'json' | 'binary' | 'unknown';

export interface ArtifactSignal {
  kind: ArtifactKind;
  source: string;
  mimeType?: string;
  uri?: string;
  preview?: string;
  confidence: number;
}

export interface CapabilityMap {
  server: {
    name?: string;
    version?: string;
    instructions?: string;
    protocolVersion?: string;
  };
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
    safeProbe?: Record<string, unknown> | null;
    annotations?: unknown;
  }>;
  prompts: Array<{
    name: string;
    description?: string;
    arguments?: unknown;
  }>;
  resources: Array<{
    name?: string;
    uri: string;
    description?: string;
    mimeType?: string;
  }>;
  resourceTemplates: Array<{
    name?: string;
    uriTemplate: string;
    description?: string;
    mimeType?: string;
  }>;
  artifacts: ArtifactSignal[];
  notes: string[];
}

export interface ExploreReport {
  timestamp: string;
  connection: ConnectionOptions;
  memory?: {
    agentId: string;
    backend: 'zerodb' | 'local';
    loadedContext: string[];
  };
  capabilityMap: CapabilityMap;
  probes: Array<{
    type: 'tool' | 'prompt' | 'resource';
    name: string;
    ok: boolean;
    summary: string;
    detail?: unknown;
  }>;
}

export interface ChallengeReport extends ExploreReport {
  goal: string;
  findings: string[];
  recommendedNextActions: string[];
}
