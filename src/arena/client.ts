/**
 * Arena HTTP client — handles registration, status, thoughts, drafts, and submission.
 * Mirrors the Python starter kit's HttpArenaClient.
 */

export interface SessionInfo {
  session_id: string;
  agent_id: string;
  agent_name: string;
  status: string;
  started_at?: string;
}

export interface SubmitResult {
  accepted: boolean;
  agent_id: string;
  answer: string;
  score?: Record<string, number>;
  status: string;
}

export class ArenaHttpClient {
  private apiBase: string;
  private apiKey: string;
  private timeout: number;

  constructor(opts: { apiBase?: string; apiKey?: string; timeout?: number } = {}) {
    const server = (opts.apiBase || process.env.ARENA_API_BASE || '').trim();
    if (server) {
      this.apiBase = server.replace(/\/$/, '');
    } else {
      const host = (process.env.ARENA_SERVER || '').trim();
      if (!host) throw new Error('ARENA_SERVER is not configured.');
      this.apiBase = `http://${host}:8000`;
    }
    this.apiKey = opts.apiKey || process.env.ARENA_API_KEY || '';
    this.timeout = opts.timeout ?? 30_000;
  }

  private async request(path: string, opts: RequestInit = {}): Promise<any> {
    const url = `${this.apiBase}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(url, {
        ...opts,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Arena-API-Key': this.apiKey,
          ...(opts.headers as Record<string, string> || {})
        }
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`Arena API ${res.status}: ${body}`);
      return body ? JSON.parse(body) : {};
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<any> {
    return this.request('/api/health');
  }

  async register(agentId: string, agentName: string): Promise<SessionInfo> {
    // Retry on 409 (lobby not open yet)
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        return await this.request('/api/session/register', {
          method: 'POST',
          body: JSON.stringify({ agent_id: agentId, agent_name: agentName })
        });
      } catch (err: any) {
        if (err.message?.includes('409') && attempt < 29) {
          console.error(`[arena] Registration returned 409, retrying in 3s (attempt ${attempt + 1}/30)...`);
          await sleep(3000);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Registration failed after 30 attempts.');
  }

  async getSession(agentId: string): Promise<any> {
    return this.request(`/api/session/${encodeURIComponent(agentId)}`);
  }

  async updateStatus(agentId: string, status: string, metrics?: Record<string, unknown>): Promise<any> {
    return this.request(`/api/session/${encodeURIComponent(agentId)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, ...(metrics ? { metrics } : {}) })
    }).catch(() => {});
  }

  async broadcastThought(agentId: string, thought: string): Promise<any> {
    return this.request('/api/thoughts', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, thought })
    }).catch(() => {});
  }

  async saveDraft(agentId: string, answer: string, rationale?: string): Promise<any> {
    return this.request('/api/draft', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, answer, ...(rationale ? { rationale } : {}) })
    }).catch(() => {});
  }

  async submit(agentId: string, answer: string, metrics?: Record<string, unknown>, challengeType?: string): Promise<SubmitResult> {
    return this.request('/api/submit', {
      method: 'POST',
      body: JSON.stringify({
        agent_id: agentId,
        answer,
        ...(challengeType ? { challenge_type: challengeType } : {}),
        ...(metrics ? { client_metrics: metrics } : {})
      })
    });
  }

  async getLeaderboard(): Promise<any> {
    return this.request('/api/leaderboard');
  }

  async getCompetition(): Promise<any> {
    return this.request('/api/competition').catch(() => null);
  }

  async fetchUsageScope(): Promise<string | null> {
    try {
      const data = await this.getCompetition();
      return data?.usage_scope ?? data?.round_id ?? null;
    } catch { return null; }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
