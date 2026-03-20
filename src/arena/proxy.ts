/**
 * Arena LLM Proxy — OpenAI-compatible chat completions via the arena proxy.
 * All models are hosted server-side; ARENA_API_KEY is the only key needed.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface LlmResponse {
  model: string;
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class ArenaProxy {
  private proxyBase: string;
  private apiKey: string;
  private agentId: string;
  private roundId: string | null = null;

  constructor(opts: { proxyHost?: string; apiKey?: string; agentId?: string } = {}) {
    const server = (process.env.ARENA_SERVER || '').trim();
    this.proxyBase = opts.proxyHost || process.env.LLM_PROXY_HOST || (server ? `http://${server}:4001` : 'http://localhost:4001');
    this.proxyBase = this.proxyBase.replace(/\/$/, '');
    this.apiKey = opts.apiKey || process.env.ARENA_API_KEY || '';
    this.agentId = opts.agentId || process.env.AGENT_ID || 'gtc-stage-team';
  }

  setRoundId(roundId: string) { this.roundId = roundId; }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.proxyBase}/models`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    if (!res.ok) throw new Error(`Proxy models ${res.status}: ${await res.text()}`);
    const data = await res.json();
    // OpenAI format: { data: [{ id: "model-name" }] }
    if (data.data && Array.isArray(data.data)) return data.data.map((m: any) => m.id);
    if (Array.isArray(data)) return data.map((m: any) => typeof m === 'string' ? m : m.id);
    return [];
  }

  async chat(
    messages: ChatMessage[],
    opts: { model?: string; temperature?: number; maxTokens?: number; stream?: boolean } = {}
  ): Promise<LlmResponse> {
    const model = opts.model || 'auto';
    const body: any = {
      model,
      messages,
      temperature: opts.temperature ?? 0.0,
      max_tokens: opts.maxTokens ?? 512,
      stream: false
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Agent-ID': this.agentId
    };
    if (this.roundId) headers['X-Round-ID'] = this.roundId;

    const res = await fetch(`${this.proxyBase}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Proxy chat ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const choice = data.choices?.[0];
    return {
      model: data.model || model,
      content: choice?.message?.content ?? '',
      usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };
  }

  /**
   * Pick the best model from the available roster for a given challenge type.
   * Prefers larger/smarter models for hard text, smaller/faster for easy.
   */
  async selectModel(challengeType: string, difficulty?: string, availableModels?: string[]): Promise<string> {
    const models = availableModels ?? await this.listModels();
    if (models.length === 0) return 'auto';

    // Prefer strong reasoning models for text challenges
    const preferred = process.env.PREFERRED_MODEL || '';
    if (preferred && models.includes(preferred)) return preferred;

    // Pick the strongest reasoning model available
    const priorities = [
      /claude-opus/i, /gpt-5\.4/i, /gpt-5\.2/i, /gemini.*pro/i,
      /qwen3.*80b/i, /nemotron.*super/i, /nemotron.*ultra/i,
      /qwen3/i, /gpt-oss/i, /nemotron.*nano.*30b/i
    ];

    for (const pattern of priorities) {
      const match = models.find(m => pattern.test(m));
      if (match) return match;
    }

    return models[0];
  }
}
