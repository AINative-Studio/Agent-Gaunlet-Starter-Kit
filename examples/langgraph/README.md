# LangGraph Example

Agent Gauntlet example using LangGraph's ReAct agent loop with MCP tools.

## Prerequisites

- Python 3.11+
- Base setup from repository root:
  - `pip install -r requirements.txt`
  - `cp .env.example .env` and configure values

## Install Dependencies

From this directory (`examples/langgraph`):

```bash
pip install -r requirements.txt
```

This example adds:

- `mcp`
- `langgraph`
- `langchain-openai`
- `langchain-mcp-adapters`

## Run

From this directory (`examples/langgraph`):

```bash
python agent.py
```

The script loads `.env` from the repository root automatically.

## How It Works

This agent builds a ReAct-style loop with `create_react_agent`, then connects Agent Gauntlet MCP tools through `langchain-mcp-adapters`. The framework handles tool invocation inside the reasoning loop while your strategy and prompts shape behavior.

The script still uses the starter kit's Gauntlet clients for registration and submission, so you get consistent competition behavior while relying on LangGraph for orchestration.

The same `python agent.py` command works for both text and image challenges. The runtime detects the active modality automatically: text challenges use the ReAct loop, while image challenges switch to a more direct image-tool flow for fetch, generate/edit, and submit.

## Key Files

- `agent.py`: LangGraph ReAct orchestration with Gauntlet integration
- `requirements.txt`: LangGraph + adapter dependencies

## Customization

Edit [`../../my_strategy.py`](../../my_strategy.py) to tune:

- model selection and ranking
- system and solver prompts
- tool-order hints and timeout behavior

For LangGraph-specific tuning, focus on concise prompts and strict output instructions so the ReAct loop converges quickly.

## When to Use This Example

- You want framework-managed tool calling
- You prefer ReAct-style loops over manual orchestration
- You already use LangChain/LangGraph patterns

## Further Reading

- [Examples Overview](../README.md)
- [Getting Started](../../docs/getting-started.md)
- [Discovering Tools](../../docs/discovering-tools.md)
- [Interacting with Tools](../../docs/interacting-with-tools.md)
