# GTC Live Agent Gauntlet

Fast, reliable black-box MCP explorer for live competition runs.

This build is hardened for stage use with four upgrades:

- **Persistent memory** with **ZeroDB first** and **local-file fallback**
- **Stable team `agent_id`** reuse across rounds by default
- **Cody // Matrix Mode** persona for operator-facing output and summaries
- **Runtime activation flow** so the team can light it up and run immediately

## Fastest start

If you want the shortest path from zero to test run:

```bash
cd /Users/tobymorning/Desktop/gtc-live-agent-gauntlet
npm install
npm run activate
```

The CLI now auto-loads the first local env file it finds in the project root:
- `.env.local`
- `local.env`
- `.env`

So local-machine runs no longer require a manual `source .env.local` step.

For an instant local rehearsal without editing anything:

```bash
npm run activate:mock
```

That activates the runtime persona, reuses a stable team identity, loads memory, and runs a challenge pass immediately.

## What it does

- Connects to an unknown MCP server over stdio or Streamable HTTP
- Enumerates tools, prompts, resources, and resource templates
- Builds a capability map with safe probe arguments where possible
- Reads low-risk resources and prompts automatically
- Detects likely text / image / audio / video / JSON artifacts
- Runs a lightweight challenge pass that looks for flags, passphrases, hints, and multimodal clues
- Persists discoveries, clues, tool maps, artifact metadata, attempts, and solved-state across runs
- Includes a local mock MCP server for rehearsal

## Demo-first operating model

This is tuned for **demo reliability over polish**:

- Prefer read/list/search/get-style calls first
- Infer minimal safe arguments from JSON schema
- Skip tools that appear to require secrets or dangerous identifiers
- Save every run as JSON so you can narrate from evidence instead of memory
- Write everything important to memory so the next round starts hotter than the last one

## Setup

```bash
cd /Users/tobymorning/Desktop/gtc-live-agent-gauntlet
npm install
```

## Runtime activation

There is now an explicit operator entrypoint for stage use:

```bash
npm run activate
```

`activate` does three things:

1. turns on the runtime persona wiring
2. pulls connection/runtime defaults from team env config
3. runs `explore` or `challenge` immediately

### Activate mode defaults

`activate` reads these environment variables:

- `GTC_RUNTIME_PERSONA` — currently `matrix`
- `GTC_RUNTIME_RUN` — `explore` or `challenge`
- `GTC_AGENT_ID` — shared team identity
- `GTC_SERVER_COMMAND` — stdio launch command
- `GTC_SERVER_CWD` — stdio working directory
- `GTC_SERVER_URL` — HTTP MCP endpoint
- `GTC_GOAL` — default challenge goal

### Activate mode examples

Run challenge mode from env config:

```bash
npm run activate
```

Force explore mode just for this run:

```bash
npm run activate -- --run explore
```

Override the goal live:

```bash
npm run activate -- --goal "Find the hidden answer safely"
```

Bypass env connection settings and pass them directly:

```bash
npm run activate -- --run challenge --stdio --command "python3 server.py"
```

## Team config file

A sample team config is included at:

- `team.env.example`

Recommended workflow:

```bash
cp team.env.example .env.local
# edit values for your team/server if needed
npm run activate
```

For this local-machine build, `.env.local` is already supported automatically at runtime.

Example `.env.local` shape:

```bash
export GTC_RUNTIME_PERSONA="matrix"
export GTC_RUNTIME_RUN="challenge"
export GTC_AGENT_ID="gtc-stage-team"
export GTC_SERVER_COMMAND="python3 server.py"
export GTC_SERVER_CWD="/absolute/path/to/server"
export GTC_GOAL="Find the hidden answer safely and call out multimodal artifacts"
```

## Memory setup

### ZeroDB-backed memory

If ZeroDB is configured, the agent will recall and store semantic memory there.

Required env vars:

```bash
export ZERODB_BASE_URL="https://YOUR-ZERODB-HOST"
export ZERODB_PROJECT_ID="your-project-id"
export ZERODB_API_KEY="your-api-key"
```

Optional env vars:

```bash
export ZERODB_MODEL="BAAI/bge-small-en-v1.5"
export ZERODB_TABLE="agent_memories"
```

Exact live command shape:

```bash
ZERODB_BASE_URL="https://YOUR-ZERODB-HOST" \
ZERODB_PROJECT_ID="your-project-id" \
ZERODB_API_KEY="your-api-key" \
ZERODB_MODEL="BAAI/bge-small-en-v1.5" \
ZERODB_TABLE="agent_memories" \
GTC_AGENT_ID="gtc-stage-team" \
GTC_SERVER_COMMAND="python3 server.py" \
GTC_RUNTIME_RUN="challenge" \
npm run activate
```

### Local fallback memory

If ZeroDB is missing or unavailable, the agent automatically falls back to local files:

- `.gauntlet/agent-id.json` — stable persisted team `agent_id`
- `.gauntlet/memory-log.jsonl` — local event log for discoveries, clues, artifacts, attempts, and solved-state

No extra setup required.

## Stable team agent_id

By default, the first run creates a stable `agent_id` and reuses it on future runs.

### Default behavior

```bash
npm run explore -- --stdio --command "npm run mock"
```

That creates `.gauntlet/agent-id.json` once and keeps using it.

### Force a specific team identity

```bash
npm run explore -- --stdio --command "npm run mock" --agent-id gtc-team-alpha
```

You can also set it through the environment:

```bash
export GTC_AGENT_ID="gtc-team-alpha"
```

### Rotate to a fresh identity

```bash
npm run explore -- --stdio --command "npm run mock" --rotate-agent-id
```

Use rotation only when you intentionally want a clean slate.

## Tests

Run the hardening suite:

```bash
npm test
```

What it covers right now:

- TypeScript build
- CLI help and failure paths
- mock-server explore, challenge, and activate flows
- stable `agent_id` reuse and rotation
- local memory persistence and malformed-log tolerance
- ZeroDB success path with mocked endpoints
- ZeroDB search failure fallback to local memory

## Rehearsal with the mock server

Explore the mock black box:

```bash
npm run demo:explore
```

Run a challenge attempt:

```bash
npm run demo:challenge
```

Run the new one-command activated rehearsal:

```bash
npm run activate:mock
```

## ZeroDB proof test

To prove write + recall end-to-end against ZeroDB, run the same agent twice with the same `GTC_AGENT_ID`:

```bash
ZERODB_BASE_URL="https://YOUR-ZERODB-HOST" \
ZERODB_PROJECT_ID="your-project-id" \
ZERODB_API_KEY="your-api-key" \
ZERODB_MODEL="BAAI/bge-small-en-v1.5" \
ZERODB_TABLE="agent_memories" \
GTC_RUNTIME_PERSONA="matrix" \
GTC_RUNTIME_RUN="challenge" \
GTC_SERVER_COMMAND="npm run mock" \
GTC_AGENT_ID="gtc-zerodb-proof-001" \
npm run activate -- --save reports/zerodb-proof-1.json

ZERODB_BASE_URL="https://YOUR-ZERODB-HOST" \
ZERODB_PROJECT_ID="your-project-id" \
ZERODB_API_KEY="your-api-key" \
ZERODB_MODEL="BAAI/bge-small-en-v1.5" \
ZERODB_TABLE="agent_memories" \
GTC_RUNTIME_PERSONA="matrix" \
GTC_RUNTIME_RUN="challenge" \
GTC_SERVER_COMMAND="npm run mock" \
GTC_AGENT_ID="gtc-zerodb-proof-001" \
npm run activate -- --save reports/zerodb-proof-2.json
```

Expected proof signal on the second run:

- report shows `memory.backend = "zerodb"`
- `memory.loadedContext` is non-empty
- operator summary mentions recovered prior context

If ZeroDB creds are unavailable, run the local fallback proof instead:

```bash
GTC_AGENT_ID="gtc-local-proof-001" npm run activate:mock
GTC_AGENT_ID="gtc-local-proof-001" npm run activate:mock
```

Expected fallback proof signal on the second run:

- report shows `memory.backend = "local"`
- `memory.loadedContext` is non-empty
- `.gauntlet/memory-log.jsonl` contains persisted events for that agent

## Real event usage

### 1) Activated runtime flow for team use

```bash
source .env.local
npm run activate
```

### 2) Unknown stdio MCP server

```bash
npm run explore -- \
  --stdio \
  --command "python3 server.py" \
  --agent-id gtc-stage-team \
  --save reports/live-explore.json

npm run challenge -- \
  --stdio \
  --command "python3 server.py" \
  --agent-id gtc-stage-team \
  --goal "Find the hidden answer safely" \
  --save reports/live-challenge.json
```

### 3) HTTP MCP server

```bash
npm run explore -- \
  --url http://host:port/mcp \
  --agent-id gtc-stage-team \
  --save reports/live-explore.json

npm run challenge -- \
  --url http://host:port/mcp \
  --agent-id gtc-stage-team \
  --goal "Solve the gauntlet" \
  --save reports/live-challenge.json
```

## Operator flow for live competition

Short version:

1. **Copy team env config once**
   - `cp team.env.example .env.local`
2. **Lock the runtime and team identity**
   - set `GTC_RUNTIME_RUN` and `GTC_AGENT_ID`
3. **Activate and run**
   - `npm run activate`
   - local env is auto-loaded; no manual `source .env.local` needed
4. **Watch the matrix-mode summary**
   - it shows agent_id, memory backend, counts, recalled context, and runtime state
6. **Call out multimodal clues immediately**
   - if image/audio/video appears, that is signal, not garnish
7. **Save every report**
   - JSON reports are your receipts if the room gets loud
8. **Only rotate agent_id on purpose**
9. **If the process dies, rerun from the same folder**
   - that preserves local reports, local memory, and the stable team identity
   - fresh identity means fresh memory lane

## Console persona

The CLI now speaks in a sharper stage voice inspired by Cody in matrix mode:

- calm
- technical
- confident
- concise
- never theatrical for its own sake

Default persona prompt:

> You are Cody in matrix mode: sharp, calm, technical, and stage-ready. Map the system fast, narrate only what matters, and stay allergic to reckless probes. Treat clues like signal, not decoration. Preserve tool maps, artifacts, hypotheses, and solved state. Sound confident and precise. Never ham it up. No cringe. No cosplay. Just clean operator energy.

If you want machine-readable output only, use:

```bash
npm run activate -- --json-only
```

## Example activated stage output

```text
════════════════════════════════════════════════════════════
Cody // Matrix Mode // CHALLENGE ONLINE
agent_id=gtc-stage-team // memory=zerodb
Surface first. Risk low. Signal high.
════════════════════════════════════════════════════════════
persona=matrix // runtime=activated
Challenge pass complete.
Mapped 3 tool(s), 1 prompt(s), 3 resource(s), 4 artifact signal(s).
Memory lane is hot: zerodb backend on agent_id gtc-stage-team.
Recovered prior context: Solved state likely reached for goal Find the hidden answer safely | Artifact image from resource:memory://poster at memory://poster
```

## Project layout

- `src/cli.ts` — entrypoint + activate/runtime operator UX
- `src/core/connect.ts` — MCP client connection layer
- `src/core/explorer.ts` — safe enumeration + probing + discovery memory
- `src/core/runner.ts` — challenge pass + attempt/solved-state memory
- `src/core/memory.ts` — ZeroDB + local fallback memory layer
- `src/core/persona.ts` — matrix-mode persona and operator summaries
- `src/core/artifacts.ts` — multimodal artifact detection
- `src/mock/server.ts` — rehearsal black-box MCP server
- `team.env.example` — team runtime/env template

## Current limitations

- Safe probe inference is still heuristic, not semantic
- Task-based / interactive tools are not handled specially yet
- Resource template expansion is reported but not auto-expanded
- Binary artifacts are classified from MIME/data hints rather than fully decoded
- ZeroDB integration assumes compatible embed/store and search endpoints already exist
- Runtime persona selection is currently single-mode: `matrix`

## Best next upgrades

- Add per-tool risk scoring and explicit allow/skip labels
- Support MCP task streaming and elicitation flows
- Add export helpers to save detected images/audio/video to files
- Add a tiny TUI for on-stage operator use
- Add more mock challenge scenarios
- Add additional personas if you want alternate stage styles
udio/video to files
- Add a tiny TUI for on-stage operator use
- Add more mock challenge scenarios
- Add additional personas if you want alternate stage styles
e persona and operator summaries
- `src/core/artifacts.ts` — multimodal artifact detection
- `src/mock/server.ts` — rehearsal black-box MCP server
- `team.env.example` — team runtime/env template

## Current limitations

- Safe probe inference is still heuristic, not semantic
- Task-based / interactive tools are not handled specially yet
- Resource template expansion is reported but not auto-expanded
- Binary artifacts are classified from MIME/data hints rather than fully decoded
- ZeroDB integration assumes compatible embed/store and search endpoints already exist
- Runtime persona selection is currently single-mode: `matrix`

## Best next upgrades

- Add per-tool risk scoring and explicit allow/skip labels
- Support MCP task streaming and elicitation flows
- Add export helpers to save detected images/audio/video to files
- Add a tiny TUI for on-stage operator use
- Add more mock challenge scenarios
- Add additional personas if you want alternate stage styles
