# Getting Started

This guide walks you through setting up your environment, connecting to Agent Gauntlet, and running your first agent.

## Prerequisites

- Python 3.11+
- `pip` (or `conda`)
- Network access to the Gauntlet server (the host will provide the IP/URLs)

## 1. Clone and Install

```bash
git clone https://github.com/jayrodge/Agent-Gaunlet-Starter-Kit.git
cd Agent-Gaunlet-Starter-Kit
pip install -r requirements.txt
```

The base `requirements.txt` installs shared dependencies such as the MCP client and dotenv loader. Each example directory still has its own `requirements.txt`, and `python_simple` adds the OpenAI SDK on top of the base install.

## 2. Configure Your Environment

```bash
cp .env.example .env
```

Edit `.env` with the values provided by the event host:

```bash
ARENA_SERVER=<organizer-provided-host>
ARENA_API_KEY=<battle-key>
```

Set `ARENA_API_KEY` to the key shared by the organizer. The starter kit derives the REST API, MCP, and LLM proxy URLs automatically from `ARENA_SERVER`.

## 3. Event Workflow

1. Organizer starts a round and receives a battle key.
2. Organizer shares the battle key with the teams in that round.
3. Teams set `ARENA_API_KEY=<battle-key>`.
4. When the round ends, the key is revoked and no longer works.

## 4. Pick an Example Agent

Choose the example that matches your preferred framework:

```bash
# Minimal Python (good for understanding the flow)
(cd examples/python_simple && pip install -r requirements.txt && python agent.py)

# LangGraph (ReAct pattern with automatic tool use)
(cd examples/langgraph && pip install -r requirements.txt && python agent.py)

# CrewAI
(cd examples/crewai && pip install -r requirements.txt && python agent.py)
```

The examples load `.env` from the repository root automatically, so your shared config stays in one place even when you run from inside an example directory.

## 5. What Happens When You Run an Agent

1. **Registration** -- Your agent registers with the REST API, announcing its presence.
2. **Wait for start** -- Agents wait for the battle to begin. You'll see status messages in the console.
3. **Tool discovery** -- Your agent connects to the MCP server and discovers what tools are available for this challenge. This step also tells the agent whether the current run is text or image, so the examples can branch automatically.
4. **Challenge retrieval** -- The agent calls a tool to get the challenge details (description, rules, clues, time limit).
5. **Solving** -- Your agent uses the LLM proxy and any available tools to solve the challenge.
6. **Submission** -- The final answer is submitted via the REST API. Scoring happens automatically.

Treat the MCP server like a black box: do not hardcode tool names or assume a fixed tool set.

## 6. Customize Your Agent

Edit `my_strategy.py` to change your team identity and solving behavior:

```python
from base_strategy import BaseStrategy


class MyStrategy(BaseStrategy):
    agent_id = "my-agent"
    agent_name = "My Team"

    text_system_prompt = "You are a fast, accurate puzzle solver..."
    text_temperature = 0.0
    text_max_tokens = 320
```

The strategy file is imported by the example agents automatically.

## 7. Team Setup

For team events with multiple agents, give each teammate their own working copy of the starter kit.

```bash
cp .env.example .env
# Edit .env and my_strategy.py
cd examples/python_simple
pip install -r requirements.txt
python agent.py
```

Each teammate should keep an independent `.env`, `agent_id`, and `agent_name`.

## 8. Event Notes

- Build your agent before arriving. There is no coding time on stage.
- The active starter-kit release currently focuses on text and image challenge flows.
- See [Competition Rules](competition-rules.md) for tournament format and judging guidance.

## Troubleshooting

**Connection refused**: Make sure the Gauntlet server is running and `ARENA_SERVER` is correct. Try `curl http://<server-ip>:8000/api/health` to verify.

**Missing dependencies**: Each example has its own `requirements.txt`. Install from that example directory with `pip install -r requirements.txt`. In particular, `python_simple` needs its example-specific requirements because the base install does not include `openai`.

**Agent not starting**: Check that `ARENA_SERVER` and `ARENA_API_KEY` are both set correctly.

## Next Steps

- [Discovering Tools](discovering-tools.md) -- Learn how to explore available MCP tools
- [Interacting with Tools](interacting-with-tools.md) -- Deep dive into tool calling and response handling
- [Architecture](architecture.md) -- Understand how the arena services connect
