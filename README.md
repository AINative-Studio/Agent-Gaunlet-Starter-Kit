# AINative Arena Agent

A pluggable, competition-ready autonomous agent framework for MCP-based arena challenges. Built by [AINative Studio](https://github.com/AINative-Studio).

Originally developed for and battle-tested at the GTC 2026 Live Agent Gauntlet (forked from [jayrodge/Agent-Gaunlet-Starter-Kit](https://github.com/jayrodge/Agent-Gaunlet-Starter-Kit)). Now being expanded into a reusable platform for internal agent battles, hack events, and the AINative AgentSwarm product.

## What it does

- **Arena Agent** — registers with an arena server, discovers MCP tools at runtime, solves text and image challenges autonomously, submits answers, and tracks scores on a live leaderboard
- **MCP Explorer** — connects to any unknown MCP server, enumerates tools/prompts/resources, builds a capability map, and detects multimodal artifacts
- **Pluggable Strategies** — swap solving approaches without touching the agent core (majority vote, image edit, or write your own)
- **Voice Persona** — Cody narrates key events via TTS with a custom voice sample
- **Local Mock Arena** — full arena server simulation with 7 challenge types for offline development

## Quick start

```bash
git clone https://github.com/AINative-Studio/Agent-Gaunlet-Starter-Kit.git
cd Agent-Gaunlet-Starter-Kit
git checkout cody-arena-agent
npm install
```

### Run against the local mock arena

```bash
# Terminal 1: start the mock server
npm run arena:mock

# Terminal 2: run the agent
npm run arena:local
```

### Run against a live arena server

```bash
cp team.env.example .env.local
# Edit .env.local with your ARENA_SERVER, ARENA_API_KEY, and AGENT_ID
npm run arena
```

### Run the MCP explorer against any server

```bash
npm run explore -- --stdio --command "python3 your-server.py"
npm run explore -- --url http://localhost:3000/mcp
```

## Arena agent architecture

The `ArenaAgent` class manages the full competition lifecycle:

```
Register → Wait for battle → Connect MCP → Discover tools → Detect modality
  → Fetch challenge → Solve (via pluggable strategy) → Submit answer
```

### Pluggable strategies

```typescript
import { ArenaAgent } from './arena/agent.js';
import { MajorityVoteStrategy } from './arena/strategies/majority-vote.js';
import { ImageEditStrategy } from './arena/strategies/image-edit.js';

const agent = new ArenaAgent({
  config: { agentId: 'my-team', agentName: 'My Agent' },
  textStrategy: new MajorityVoteStrategy({ maxVerifyModels: 8 }),
  imageStrategy: new ImageEditStrategy({ maxModels: 12 }),
  hooks: {
    onScore: (s) => console.log(`Score: ${s.final_score}`),
    onError: (e) => console.error(`Error: ${e.message}`),
  }
});

await agent.run();
```

### Built-in strategies

| Strategy | Type | What it does |
|----------|------|-------------|
| `MajorityVoteStrategy` | Text | Solves with a primary model, verifies with N models in parallel, uses majority vote to pick the best answer |
| `ImageEditStrategy` | Image | Calls `image_edit` or `image_generate` tool, submits via MCP, runs model + tool calls in parallel for speed |

### Lifecycle hooks

```typescript
interface AgentLifecycleHooks {
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
```

## Arena protocol

The agent communicates with three server components:

| Component | Port | Protocol | Purpose |
|-----------|------|----------|---------|
| REST API | 8000 | HTTP | Registration, status, thoughts, submission, leaderboard |
| MCP Server | 5001 | SSE | Tool discovery, challenge retrieval, clue gathering |
| LLM Proxy | 4001 | HTTP (OpenAI-compatible) | Model inference via `/chat/completions` |

### How a round works

1. Agent registers with the arena API
2. Agent waits for the organizer to start the battle
3. Agent discovers tools from the MCP server
4. Agent retrieves the challenge and gathers clues
5. Agent calls the LLM proxy to reason and solve
6. Agent submits a final answer
7. Server returns a score breakdown

### Scoring dimensions

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Quality | ~50% | Answer correctness (LLM-judged or exact match) |
| Speed | ~20% | Time from registration to submission |
| Tools | ~10% | How many available tools were used effectively |
| Models | ~10% | How many available models were leveraged |
| Tokens | ~10% | Token efficiency (lower usage scores higher) |

## NPM scripts

| Command | Description |
|---------|-------------|
| `npm run arena` | Run agent against configured arena server (with voice) |
| `npm run arena:silent` | Run agent without voice narration |
| `npm run arena:local` | Run agent against local mock server |
| `npm run arena:mock` | Start the local mock arena server |
| `npm run arena:preflight` | Verify arena server connectivity |
| `npm run explore` | MCP explorer mode (recon a server) |
| `npm run challenge` | MCP challenge mode (recon + solve) |
| `npm run activate` | Operator activation mode (env-driven) |
| `npm run activate:mock` | Quick rehearsal against mock MCP server |
| `npm test` | Run the full test suite (14 tests) |

## Project layout

```
src/arena/                      Arena agent framework
  agent.ts                      ArenaAgent class + CLI entrypoint
  strategy.ts                   TextStrategy / ImageStrategy interfaces
  strategies/
    majority-vote.ts            Default text solver (model fallback + majority vote)
    image-edit.ts               Default image solver (parallel tools + models)
  client.ts                     REST API client
  mcp.ts                        MCP SSE client
  proxy.ts                      LLM proxy client (OpenAI-compatible)
  types.ts                      Shared interfaces (ArenaConfig, SolveResult, hooks)
  retry.ts                      withRetry, pollUntil, sleep utilities
  env.ts                        Environment file loader
  voice.ts                      Cody voice narration (macOS TTS + intro clip)
  preflight.ts                  Arena connectivity checker
  mock-server.ts                Local mock arena (REST + MCP + proxy, 7 challenges)

src/core/                       MCP explorer framework
  connect.ts                    MCP client connection layer (stdio + HTTP)
  explorer.ts                   Safe tool/prompt/resource enumeration
  runner.ts                     Challenge pass with attempt tracking
  memory.ts                     ZeroDB + local fallback memory
  persona.ts                    Cody // Matrix Mode persona
  artifacts.ts                  Multimodal artifact detection
  types.ts                      Explorer type definitions
  utils.ts                      Shared utilities

src/cli.ts                      Explorer CLI entrypoint
src/mock/server.ts              Rehearsal MCP server (stdio)
test/                           Test suite (14 tests)
```

## Configuration

### Environment variables

```bash
# Arena connection (required for competition)
ARENA_SERVER="your-arena-host"
ARENA_API_KEY="your-battle-key"
AGENT_ID="your-unique-agent-id"
AGENT_NAME="Your Agent Name"

# Optional: preferred primary model
PREFERRED_MODEL="claude-opus"

# Optional: voice control
CODY_SILENT=1                    # disable voice
CODY_VOICE="Samantha"            # macOS TTS voice
CODY_RATE=185                    # words per minute

# Optional: ZeroDB memory backend
ZERODB_BASE_URL="https://your-zerodb-host"
ZERODB_PROJECT_ID="your-project-id"
ZERODB_API_KEY="your-api-key"

# Explorer mode
GTC_RUNTIME_PERSONA="matrix"
GTC_RUNTIME_RUN="challenge"
GTC_AGENT_ID="your-team-id"
GTC_SERVER_COMMAND="python3 server.py"
GTC_GOAL="Find the hidden answer safely"
```

## Local mock arena

The mock server simulates the full arena protocol locally with 7 challenge types:

| # | Type | Difficulty | Description |
|---|------|-----------|-------------|
| 1 | logic-puzzle | easy | 3-entity ordering |
| 2 | logic-puzzle | medium | 4-entity ordering with constraints |
| 3 | logic-puzzle | hard | 6-entity chronological ordering |
| 4 | reasoning | hard | 5-entity multi-attribute assignment |
| 5 | logic-puzzle | hard | 7-entity scheduling |
| 6 | logic-puzzle | very-hard | 8-entity marathon finishing order |
| 7 | text-analysis | medium | Letter-by-letter word decoding |

The mock LLM returns wrong answers 30% of the time to test the majority vote recovery system.

## Tests

```bash
npm test
```

14 tests covering:
- TypeScript build
- CLI help and failure paths
- Mock server explore, challenge, and activate flows
- Stable `agent_id` reuse and rotation
- Local memory persistence and malformed-log tolerance
- ZeroDB success path with mocked endpoints
- ZeroDB search failure fallback to local memory

## Cody // Matrix Mode

The agent persona is Cody — a calm, technical, stage-ready operator voice.

> Sharp, calm, technical, and stage-ready. Map the system fast, narrate only what matters, and stay allergic to reckless probes. Treat clues like signal, not decoration. Sound confident and precise. Never ham it up. No cringe. No cosplay. Just clean operator energy.

Voice narration plays at key lifecycle events: online, registered, tools discovered, solving, submitting, score, done. Disable with `CODY_SILENT=1` or `--silent`.

## Best competition scores (practice arena)

| Challenge Type | Quality | Speed | Final Score |
|---------------|---------|-------|-------------|
| Text logic | 100 | 58 | **91.15** |
| Image edit | 100 | 85 | **87.75** |
| Image generate | 100 | 75 | **86.25** |

## Roadmap

See [GitHub Issues](https://github.com/AINative-Studio/Agent-Gaunlet-Starter-Kit/issues) for the full roadmap. Key next steps:

- **Production Arena Server** — self-hosted event server with configurable challenges ([#1](https://github.com/AINative-Studio/Agent-Gaunlet-Starter-Kit/issues/1))
- **Challenge Authoring** — JSON schema + CLI for creating puzzles ([#2](https://github.com/AINative-Studio/Agent-Gaunlet-Starter-Kit/issues/2))
- **Operator Dashboard** — real-time web UI for running events ([#3](https://github.com/AINative-Studio/Agent-Gaunlet-Starter-Kit/issues/3))
- **Audio & Video Challenges** — expand modalities ([#4](https://github.com/AINative-Studio/Agent-Gaunlet-Starter-Kit/issues/4))
- **Tournament Brackets** — head-to-head elimination ([#5](https://github.com/AINative-Studio/Agent-Gaunlet-Starter-Kit/issues/5))
- **Multi-agent Swarm** — cooperative specialist agents ([#6](https://github.com/AINative-Studio/Agent-Gaunlet-Starter-Kit/issues/6))
- **npm Package** — `@ainative/arena-agent` ([#8](https://github.com/AINative-Studio/Agent-Gaunlet-Starter-Kit/issues/8))

## License

MIT
