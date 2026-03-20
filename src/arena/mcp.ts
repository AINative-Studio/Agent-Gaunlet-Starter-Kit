/**
 * Arena MCP client — connects to the arena's SSE-based MCP server,
 * discovers tools, retrieves challenges and clues, checks time remaining.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface ChallengeInfo {
  challenge_type: string;
  challenge_id?: string;
  description: string;
  rules?: string;
  max_time_s?: number;
  clues_available?: number;
  time_remaining_s?: number;
  difficulty?: string;
  image_url?: string;
}

export interface ClueInfo {
  clue_id: string;
  text: string;
}

export interface ToolDef {
  name: string;
  description?: string;
  inputSchema?: any;
}

export class ArenaMcpClient {
  private client: Client;
  private transport: SSEClientTransport | StreamableHTTPClientTransport | null = null;
  private mcpUrl: string;
  private apiKey: string;

  constructor(opts: { mcpUrl?: string; apiKey?: string } = {}) {
    const server = (process.env.ARENA_SERVER || '').trim();
    this.mcpUrl = opts.mcpUrl || process.env.ARENA_MCP_URL || (server ? `http://${server}:5001` : 'http://localhost:5001');
    this.apiKey = opts.apiKey || process.env.ARENA_API_KEY || '';
    this.client = new Client(
      { name: 'gtc-gauntlet-arena', version: '0.1.0' },
      { capabilities: {} }
    );
  }

  async connect(): Promise<void> {
    // The arena SSE endpoint expects the API key as a query parameter (matching Python starter kit)
    const sseUrl = new URL('/sse', this.mcpUrl);
    if (this.apiKey) {
      sseUrl.searchParams.set('api_key', this.apiKey);
    }
    // Try SSE transport first (what the arena uses), then fall back to streamable HTTP
    try {
      this.transport = new SSEClientTransport(sseUrl, {
        requestInit: {
          headers: {
            'X-Arena-API-Key': this.apiKey
          }
        }
      });
      await this.client.connect(this.transport);
    } catch {
      // Fall back to streamable HTTP
      const httpUrl = new URL(this.mcpUrl);
      if (this.apiKey) httpUrl.searchParams.set('api_key', this.apiKey);
      this.transport = new StreamableHTTPClientTransport(httpUrl, {
        requestInit: {
          headers: {
            'X-Arena-API-Key': this.apiKey
          }
        }
      });
      await this.client.connect(this.transport);
    }
  }

  async close(): Promise<void> {
    try { await this.client.close(); } catch {}
    try { await this.transport?.close(); } catch {}
  }

  async listTools(): Promise<ToolDef[]> {
    const result = await this.client.listTools();
    return (result.tools ?? []).map((t: any) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }));
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const result = await this.client.callTool({ name, arguments: args });
    return result;
  }

  async getChallenge(agentId: string): Promise<ChallengeInfo> {
    const result = await this.callTool('arena.get_challenge', { agent_id: agentId });
    return parseToolResult(result);
  }

  async listClues(agentId: string): Promise<string[]> {
    try {
      const result = await this.callTool('arena.clues.list', { agent_id: agentId });
      const parsed = parseToolResult(result);
      return Array.isArray(parsed) ? parsed : (parsed.clues ?? parsed.clue_ids ?? []);
    } catch { return []; }
  }

  async getClue(clueId: string, agentId: string): Promise<ClueInfo> {
    const result = await this.callTool('arena.clues.get', { clue_id: clueId, agent_id: agentId });
    return parseToolResult(result);
  }

  async getTimeRemaining(agentId: string): Promise<number> {
    try {
      const result = await this.callTool('arena.time_remaining', { agent_id: agentId });
      const parsed = parseToolResult(result);
      return typeof parsed === 'number' ? parsed : (parsed.time_remaining_s ?? parsed.remaining ?? 60);
    } catch { return 60; }
  }

  async getImageChallenge(agentId: string): Promise<any> {
    const result = await this.callTool('arena.image.get_challenge', { agent_id: agentId });
    return parseToolResult(result);
  }

  async submitImageEdit(agentId: string, editedImage: string, clientMetrics?: Record<string, unknown>): Promise<any> {
    const result = await this.callTool('arena.image.submit_edit', {
      agent_id: agentId,
      edited_image: editedImage,
      client_metrics: clientMetrics ?? {}
    });
    return parseToolResult(result);
  }

  async broadcastImageThought(agentId: string, thought: string): Promise<void> {
    try {
      await this.callTool('arena.image.broadcast_thought', { thought, agent_id: agentId });
    } catch (err) {
      console.error(`[mcp] broadcast_thought failed: ${err}`);
    }
  }

  detectModality(tools: ToolDef[]): 'text' | 'image' | 'unknown' {
    const names = new Set(tools.map(t => t.name));
    if (names.has('arena.image.get_challenge')) return 'image';
    if (names.has('arena.get_challenge')) return 'text';
    return 'unknown';
  }
}

function parseToolResult(result: any): any {
  if (!result) return {};
  const content = result.content ?? result;
  if (Array.isArray(content)) {
    const textParts = content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
    const joined = textParts.join('\n');
    try { return JSON.parse(joined); } catch { return joined || content; }
  }
  if (typeof content === 'string') {
    try { return JSON.parse(content); } catch { return content; }
  }
  return content;
}
