#!/usr/bin/env node
/**
 * Local Arena Mock Server — simulates REST API (port 8000), LLM Proxy (port 4001),
 * and MCP SSE server (port 5001) for offline practice.
 */

import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

// ─── State ───────────────────────────────────────────────────────────────────
const sessions = new Map<string, any>();
let phase = 'running'; // lobby | running | finished
const thoughts: string[] = [];

// ─── Challenges ──────────────────────────────────────────────────────────────
const textChallenges = [
  // ── EASY ──
  {
    challenge_type: 'logic-puzzle',
    challenge_id: 'local_logic_001',
    puzzle_id: 'local_logic_001',
    difficulty: 'easy',
    description: 'Three students — Kai, Zoe, and Raj — finished a race. Determine their finishing order (1st, 2nd, 3rd).',
    rules: 'Return only the finishing order as comma-separated names.',
    max_time_s: 90,
    clues: [
      { id: 'clue_0', text: 'Kai did not finish last.' },
      { id: 'clue_1', text: 'Zoe finished before Raj.' },
      { id: 'clue_2', text: 'Kai finished after Zoe.' },
    ],
    answer: 'Zoe,Kai,Raj'
  },
  // ── MEDIUM ──
  {
    challenge_type: 'logic-puzzle',
    challenge_id: 'local_logic_002',
    puzzle_id: 'local_logic_002',
    difficulty: 'medium',
    description: 'Four friends — Ava, Ben, Maya, and Leo — are standing in a line. Determine their order from left to right.',
    rules: 'Return only the final order as comma-separated names, e.g. "Name1,Name2,Name3,Name4"',
    max_time_s: 120,
    clues: [
      { id: 'clue_0', text: 'Ava stands somewhere to the left of Ben.' },
      { id: 'clue_1', text: 'Maya stands immediately to the right of Ben.' },
      { id: 'clue_2', text: 'Leo is not first.' },
      { id: 'clue_3', text: 'Ava is not third.' },
    ],
    answer: 'Ava,Ben,Maya,Leo'
  },
  // ── HARD: 6 entities, 8 clues, multi-constraint ──
  {
    challenge_type: 'logic-puzzle',
    challenge_id: 'local_logic_003',
    puzzle_id: 'local_logic_003',
    difficulty: 'hard',
    description: 'Six events (E1 through E6) happened in a single day. Determine their exact chronological order from earliest to latest.',
    rules: 'Return only the event IDs in order, comma-separated (e.g. "E1,E2,E3,E4,E5,E6"). No extra text.',
    max_time_s: 120,
    clues: [
      { id: 'clue_0', text: 'E2 happened before E4.' },
      { id: 'clue_1', text: 'E5 occurred immediately after E2.' },
      { id: 'clue_2', text: 'E1 happened after E3.' },
      { id: 'clue_3', text: 'E6 happened after E1.' },
      { id: 'clue_4', text: 'E4 was not the first or second event.' },
      { id: 'clue_5', text: 'E3 happened before E2.' },
      { id: 'clue_6', text: 'E1 happened immediately before E4.' },
      { id: 'clue_7', text: 'E6 was the final event.' },
    ],
    answer: 'E3,E2,E5,E1,E4,E6'
  },
  // ── HARD: semantic reasoning with misdirection ──
  {
    challenge_type: 'reasoning',
    challenge_id: 'local_reason_001',
    puzzle_id: 'local_reason_001',
    difficulty: 'hard',
    description: 'A company has five departments: Engineering, Marketing, Sales, Legal, and HR. Each department is on a different floor (1-5, where 1 is ground). Determine which department is on which floor.',
    rules: 'Return the departments in order from floor 1 to floor 5, comma-separated.',
    max_time_s: 120,
    clues: [
      { id: 'clue_0', text: 'Engineering is above Marketing but below Legal.' },
      { id: 'clue_1', text: 'Sales is on an odd-numbered floor.' },
      { id: 'clue_2', text: 'HR is directly below Engineering.' },
      { id: 'clue_3', text: 'Marketing is not on floor 1.' },
      { id: 'clue_4', text: 'Legal is on floor 5.' },
      { id: 'clue_5', text: 'Sales is below Marketing.' },
    ],
    answer: 'Sales,Marketing,HR,Engineering,Legal'
  },
  // ── HARD: scheduling with negative constraints ──
  {
    challenge_type: 'logic-puzzle',
    challenge_id: 'local_logic_004',
    puzzle_id: 'local_logic_004',
    difficulty: 'hard',
    description: 'Seven talks (T1-T7) are scheduled across Monday through Sunday, one per day. Determine which talk is on which day.',
    rules: 'Return talk IDs in order from Monday to Sunday, comma-separated.',
    max_time_s: 120,
    clues: [
      { id: 'clue_0', text: 'T3 is on Wednesday.' },
      { id: 'clue_1', text: 'T1 is sometime before T2.' },
      { id: 'clue_2', text: 'T5 is on the day immediately after T4.' },
      { id: 'clue_3', text: 'T7 is on Saturday.' },
      { id: 'clue_4', text: 'T6 is not on Monday or Tuesday.' },
      { id: 'clue_5', text: 'T2 is on Friday.' },
      { id: 'clue_6', text: 'T4 is on the day immediately before T5.' },
      { id: 'clue_7', text: 'T1 is on the first day of the week.' },
      { id: 'clue_8', text: 'T4 is on Thursday.' },
    ],
    answer: 'T1,T6,T3,T4,T5,T7,T2'
  },
  // ── VERY HARD: 8 entities, multi-attribute ──
  {
    challenge_type: 'logic-puzzle',
    challenge_id: 'local_logic_005',
    puzzle_id: 'local_logic_005',
    difficulty: 'very-hard',
    description: 'Eight runners (A through H) finished a marathon. Determine their finishing positions from 1st to 8th.',
    rules: 'Return only the runners in finishing order (1st to 8th), comma-separated.',
    max_time_s: 120,
    clues: [
      { id: 'clue_0', text: 'A finished before B and C.' },
      { id: 'clue_1', text: 'D finished immediately after C.' },
      { id: 'clue_2', text: 'E finished in 1st place.' },
      { id: 'clue_3', text: 'F finished after B but before G.' },
      { id: 'clue_4', text: 'H finished in 8th (last) place.' },
      { id: 'clue_5', text: 'B finished in 4th place.' },
      { id: 'clue_6', text: 'A finished in 2nd place.' },
      { id: 'clue_7', text: 'G finished immediately after F.' },
      { id: 'clue_8', text: 'C finished in 5th place.' },
    ],
    answer: 'E,A,B,C,D,F,G,H'
  },
  // ── CURVEBALL: text analysis, not logic ──
  {
    challenge_type: 'text-analysis',
    challenge_id: 'local_text_001',
    puzzle_id: 'local_text_001',
    difficulty: 'medium',
    description: 'Analyze the following encoded message and determine the hidden word. Each clue gives you one letter.',
    rules: 'Return only the hidden word in uppercase.',
    max_time_s: 90,
    clues: [
      { id: 'clue_0', text: 'The 1st letter is the first letter of the planet closest to the sun.' },
      { id: 'clue_1', text: 'The 2nd letter is the chemical symbol for Gold (second letter).' },
      { id: 'clue_2', text: 'The 3rd letter is the first letter of the number that follows seven.' },
      { id: 'clue_3', text: 'The 4th letter is the last letter of the word "game".' },
      { id: 'clue_4', text: 'The 5th letter is the first letter of the opposite of "off".' },
    ],
    answer: 'MUNEO'
  },
];

let challengeIndex = 0;
function currentChallenge() { return textChallenges[challengeIndex % textChallenges.length]; }
const startTimes = new Map<string, number>();

// ─── REST API (port 8000) ────────────────────────────────────────────────────
const apiServer = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url!, `http://localhost`);
  const path = url.pathname;

  if (path === '/api/health') {
    return send(res, { status: 'ok', service: 'local-mock-arena', phase, sessions: sessions.size, active_puzzle_id: currentChallenge().puzzle_id, judge_configured: true });
  }
  if (path.startsWith('/api/keys/validate')) {
    return send(res, { valid: true });
  }
  if (path === '/api/session/register' && req.method === 'POST') {
    const body = await readBody(req);
    if (phase !== 'running') return send(res, { detail: 'Lobby is not open.' }, 409);
    const s = { session_id: `session-${body.agent_id}-${Date.now()}`, agent_id: body.agent_id, agent_name: body.agent_name, status: 'connected' };
    sessions.set(body.agent_id, s);
    startTimes.set(body.agent_id, Date.now());
    return send(res, s);
  }
  if (path.startsWith('/api/session/') && path.endsWith('/status') && req.method === 'PUT') {
    return send(res, { ok: true });
  }
  if (path.startsWith('/api/session/')) {
    const agentId = decodeURIComponent(path.split('/')[3]);
    return send(res, sessions.get(agentId) ?? { error: 'not found' });
  }
  if (path === '/api/thoughts' && req.method === 'POST') {
    const body = await readBody(req);
    thoughts.push(body.thought);
    return send(res, { ok: true });
  }
  if (path === '/api/draft' && req.method === 'POST') {
    return send(res, { ok: true });
  }
  if (path === '/api/submit' && req.method === 'POST') {
    const body = await readBody(req);
    const ch = currentChallenge();
    const elapsed = Date.now() - (startTimes.get(body.agent_id) ?? Date.now());
    const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const correct = normalize(body.answer ?? '') === normalize(ch.answer);
    const quality = correct ? 100 : 0;
    const speed = Math.max(0, Math.round(100 - (elapsed / (ch.max_time_s * 10))));
    const score = {
      quality_score: quality,
      speed_score: speed,
      tools_score: 60,
      models_score: 40,
      tokens_score: 90,
      total_tokens_used: body.client_metrics?.total_tokens ?? 0,
      final_score: Math.round((quality * 0.5 + speed * 0.2 + 60 * 0.1 + 40 * 0.1 + 90 * 0.1) * 100) / 100,
      elapsed_ms: elapsed,
    };
    const result = { accepted: correct, agent_id: body.agent_id, answer: body.answer, score, status: 'submitted' };
    const session = sessions.get(body.agent_id);
    if (session) { session.score = score; session.status = 'submitted'; }
    challengeIndex++;
    return send(res, result);
  }
  if (path === '/api/leaderboard') {
    const entries = [...sessions.values()].filter(s => s.score).sort((a, b) => (b.score?.final_score ?? 0) - (a.score?.final_score ?? 0));
    return send(res, entries);
  }
  if (path === '/api/competition') {
    return send(res, { phase, usage_scope: 'local-mock-round-1' });
  }
  send(res, { error: 'not found' }, 404);
});

// ─── LLM Proxy (port 4001) ──────────────────────────────────────────────────
const proxyServer = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url!, `http://localhost`);

  if (url.pathname === '/models') {
    return send(res, { data: [
      { id: 'local-mock-llm', object: 'model', created: 1700000000, owned_by: 'mock' },
      { id: 'local-mock-fast', object: 'model', created: 1700000000, owned_by: 'mock' },
    ]});
  }
  if (url.pathname === '/chat/completions' && req.method === 'POST') {
    const body = await readBody(req);
    const messages = body.messages ?? [];
    const lastMsg = messages[messages.length - 1]?.content ?? '';

    // Mock LLM — does NOT know the answer. Returns plausible but possibly wrong responses.
    // The agent must use real proxy models on competition day; this just tests the pipeline.
    let reply = 'ANSWER: Unable to determine';
    const ch = currentChallenge();

    if (/confirm|verify|done/i.test(lastMsg)) {
      reply = 'Confirmed.';
    } else if (/clue|challenge|puzzle|ANSWER:/i.test(lastMsg)) {
      // Simulate a model that tries to reason — give correct answer ~70% of time
      if (Math.random() < 0.7) {
        reply = `ANSWER: ${ch.answer}`;
      } else {
        // Wrong answer to test majority vote recovery
        const wrongAnswers: Record<string, string> = {
          'Zoe,Kai,Raj': 'Kai,Zoe,Raj',
          'Ava,Ben,Maya,Leo': 'Leo,Ava,Ben,Maya',
          'E3,E2,E5,E1,E4,E6': 'E1,E2,E3,E4,E5,E6',
          'Sales,Marketing,HR,Engineering,Legal': 'HR,Marketing,Sales,Engineering,Legal',
          'T1,T6,T3,T4,T5,T7,T2': 'T1,T2,T3,T4,T5,T6,T7',
          'E,A,B,C,D,F,G,H': 'A,B,C,D,E,F,G,H',
          'MUNEO': 'MONEY',
        };
        reply = `ANSWER: ${wrongAnswers[ch.answer] ?? ch.answer}`;
      }
    }

    return send(res, {
      id: `chatcmpl-mock-${Date.now()}`,
      object: 'chat.completion',
      model: body.model || 'local-mock-llm',
      choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 }
    });
  }
  send(res, { error: 'not found' }, 404);
});

// ─── MCP SSE Server (port 5001) ──────────────────────────────────────────────
const mcpServer = new McpServer({ name: 'local-mock-arena-mcp', version: '0.1.0' }, { capabilities: { logging: {} } });

mcpServer.registerTool('arena.get_challenge', {
  description: 'Get the current challenge',
  inputSchema: { agent_id: z.string().default('default') }
}, async () => {
  const ch = currentChallenge();
  return { content: [{ type: 'text', text: JSON.stringify({
    challenge_type: ch.challenge_type, challenge_id: ch.challenge_id, puzzle_id: ch.puzzle_id,
    difficulty: ch.difficulty, description: ch.description, rules: ch.rules, max_time_s: ch.max_time_s,
    clues_available: ch.clues.length, time_remaining_s: ch.max_time_s
  })}]};
});

mcpServer.registerTool('arena.clues.list', {
  description: 'List available clues',
  inputSchema: { agent_id: z.string().default('default') }
}, async () => {
  return { content: [{ type: 'text', text: JSON.stringify(currentChallenge().clues.map(c => c.id)) }] };
});

mcpServer.registerTool('arena.clues.get', {
  description: 'Get a specific clue',
  inputSchema: { clue_id: z.string(), agent_id: z.string().default('default') }
}, async ({ clue_id }) => {
  const clue = currentChallenge().clues.find(c => c.id === clue_id);
  return { content: [{ type: 'text', text: JSON.stringify(clue ?? { error: 'clue not found' }) }] };
});

mcpServer.registerTool('arena.time_remaining', {
  description: 'Get time remaining',
  inputSchema: { agent_id: z.string().default('default') }
}, async ({ agent_id }) => {
  const start = startTimes.get(agent_id) ?? Date.now();
  const remaining = currentChallenge().max_time_s - (Date.now() - start) / 1000;
  return { content: [{ type: 'text', text: JSON.stringify({ time_remaining_s: Math.max(0, remaining) }) }] };
});

mcpServer.registerTool('arena.tools.list', {
  description: 'List all tools',
  inputSchema: {}
}, async () => {
  return { content: [{ type: 'text', text: 'arena.get_challenge, arena.clues.list, arena.clues.get, arena.time_remaining, arena.tools.list, arena.image.get_challenge, arena.image.broadcast_thought, arena.image.submit_edit, image_edit, image_generate, image_analyze' }] };
});

mcpServer.registerTool('arena.image.get_challenge', {
  description: 'Get image challenge',
  inputSchema: { agent_id: z.string().default('default') }
}, async () => {
  return { content: [{ type: 'text', text: JSON.stringify({
    challenge_type: 'image-edit', challenge_id: 'local_img_001',
    description: 'Edit the provided image.', prompt: 'Add a red hat to the subject.',
    input_image_uri: 'https://example.com/test.jpg', max_time_s: 120,
    required_tools: ['arena.image.get_challenge', 'image_edit', 'arena.image.submit_edit']
  })}]};
});

mcpServer.registerTool('arena.image.broadcast_thought', {
  description: 'Broadcast a thought',
  inputSchema: { thought: z.string(), agent_id: z.string().default('default') }
}, async ({ thought }) => {
  thoughts.push(thought);
  return { content: [{ type: 'text', text: 'ok' }] };
});

mcpServer.registerTool('arena.image.submit_edit', {
  description: 'Submit edited image',
  inputSchema: { edited_image: z.string(), client_metrics: z.object({}).passthrough().optional(), rationale: z.string().default(''), agent_id: z.string().default('default') }
}, async () => {
  return { content: [{ type: 'text', text: JSON.stringify({ accepted: true, auto_submitted: false }) }] };
});

mcpServer.registerTool('image_edit', {
  description: 'Edit an image',
  inputSchema: { image_uri: z.string(), prompt: z.string(), agent_id: z.string().default('default') }
}, async () => {
  return { content: [{ type: 'text', text: JSON.stringify({ image_uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }) }] };
});

mcpServer.registerTool('image_generate', {
  description: 'Generate an image',
  inputSchema: { prompt: z.string(), agent_id: z.string().default('default') }
}, async () => {
  return { content: [{ type: 'text', text: JSON.stringify({ image_uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }) }] };
});

mcpServer.registerTool('image_analyze', {
  description: 'Analyze an image',
  inputSchema: { image_uri: z.string().default(''), prompt: z.string().default('describe'), agent_id: z.string().default('default') }
}, async () => {
  return { content: [{ type: 'text', text: 'Analysis: Image contains a person in an outdoor setting.' }] };
});

// SSE transport setup
const sseTransports = new Map<string, SSEServerTransport>();
const mcpHttpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost`);

  if (url.pathname === '/sse') {
    const transport = new SSEServerTransport('/messages', res);
    const id = `sse-${Date.now()}`;
    sseTransports.set(id, transport);
    await mcpServer.connect(transport);
    return;
  }
  if (url.pathname === '/messages' && req.method === 'POST') {
    const body = await readRawBody(req);
    // Route to last connected transport
    const lastTransport = [...sseTransports.values()].pop();
    if (lastTransport) {
      await lastTransport.handlePostMessage(req, res, body);
    } else {
      res.writeHead(400);
      res.end('No SSE connection');
    }
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// ─── Start all servers ───────────────────────────────────────────────────────
apiServer.listen(8000, () => console.log('Mock REST API on :8000'));
proxyServer.listen(4001, () => console.log('Mock LLM Proxy on :4001'));
mcpHttpServer.listen(5001, () => console.log('Mock MCP SSE on :5001'));
console.log('Local arena mock running. Use: ARENA_SERVER=localhost npm run arena');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function send(res: http.ServerResponse, data: any, status = 200) {
  res.writeHead(status);
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: any) => data += chunk);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

function readRawBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: any) => data += chunk);
    req.on('end', () => resolve(data));
  });
}
