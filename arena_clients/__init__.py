"""Self-contained Arena clients for starter kit agents."""

from .config import (
    ensure_connected,
    get_api_base,
    get_arena_api_key,
    get_llm_api_key,
    get_mcp_url,
    get_proxy_host,
)
from .http_client import (
    ArenaAPIError,
    ArenaConnectionError,
    HttpArenaClient,
    SessionInfo,
    SubmitResult,
)
from .mcp_client import (
    ChallengeInfo,
    ClueInfo,
    ImageChallengeInfo,
    McpArenaClient,
    McpArenaError,
    connect_arena_mcp,
)

__all__ = [
    "ArenaAPIError",
    "ArenaConnectionError",
    "ChallengeInfo",
    "ClueInfo",
    "ensure_connected",
    "get_api_base",
    "get_arena_api_key",
    "get_llm_api_key",
    "get_mcp_url",
    "get_proxy_host",
    "ImageChallengeInfo",
    "HttpArenaClient",
    "McpArenaClient",
    "McpArenaError",
    "SessionInfo",
    "SubmitResult",
    "connect_arena_mcp",
]
