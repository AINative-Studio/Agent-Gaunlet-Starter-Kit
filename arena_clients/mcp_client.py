"""MCP client for Arena challenge tools.

This client connects to the Arena MCP server (HTTP/SSE) to access
challenge tools like `arena.get_challenge`, `arena.clues.list`, and
`arena.time_remaining`, plus image challenge tools.

Example:
    async with McpArenaClient("http://server:5001") as client:
        challenge = await client.get_challenge("my-agent")
        clues = await client.list_clues("my-agent")
        clue = await client.get_clue("clue_0", "my-agent")
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from mcp import ClientSession
from mcp.client.sse import sse_client

from .config import get_api_base, get_arena_api_key, get_mcp_url


@dataclass
class ChallengeInfo:
    """Challenge information from get_challenge."""

    challenge_type: str
    challenge_id: str
    puzzle_id: str
    description: str
    rules: str
    max_time_s: int
    clues: list[str]
    time_remaining_s: float


@dataclass
class ClueInfo:
    """Information about a specific clue."""

    clue_id: str
    text: str
    time_remaining_s: float


@dataclass
class ImageChallengeInfo:
    """Image challenge information from arena.image.get_challenge."""

    challenge_type: str
    challenge_id: str
    puzzle_id: str
    difficulty: str
    description: str
    prompt: str
    reference_notes: str
    max_time_s: int
    input_image_uri: str
    time_remaining_s: float


class McpArenaClient:
    """MCP client for Arena challenge tools.

    This client connects to the Arena MCP server via SSE transport
    and provides methods to access challenge tools.

    Usage:
        async with McpArenaClient("http://server:5001") as client:
            challenge = await client.get_challenge("my-agent")
    """

    def __init__(
        self,
        mcp_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        """Initialize the client.

        Args:
            mcp_url: URL for the Arena MCP server (default: ARENA_MCP_URL or
                derived from ARENA_SERVER)
            api_key: API key for MCP auth (default: ARENA_API_KEY env var)
            timeout: Connection timeout in seconds
        """
        base_url = get_mcp_url(mcp_url)
        # SSE endpoint is at /sse
        self.sse_url = f"{base_url.rstrip('/')}/sse"
        resolved_api_key = get_arena_api_key(api_key)
        if resolved_api_key:
            separator = "&" if "?" in self.sse_url else "?"
            encoded_key = quote(resolved_api_key, safe="")
            self.sse_url = f"{self.sse_url}{separator}api_key={encoded_key}"
        self.timeout = timeout
        self._session: ClientSession | None = None
        self._context = None

    async def __aenter__(self) -> "McpArenaClient":
        """Enter async context and establish connection."""
        self._context = sse_client(self.sse_url)
        read, write = await self._context.__aenter__()
        self._session = ClientSession(read, write)
        await self._session.__aenter__()
        await self._session.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Exit async context and close connection."""
        if self._session:
            await self._session.__aexit__(exc_type, exc_val, exc_tb)
        if self._context:
            await self._context.__aexit__(exc_type, exc_val, exc_tb)

    def _parse_result(self, result) -> dict[str, Any]:
        """Parse a tool result to a dictionary."""
        if isinstance(getattr(result, "structuredContent", None), dict):
            return dict(result.structuredContent)
        if getattr(result, "structuredContent", None) is not None:
            return {"structured": result.structuredContent}
        if not result.content:
            return {}
        text = result.content[0].text
        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"raw": text}

    async def list_tools(self) -> list[str]:
        """List available tools.

        Returns:
            List of tool names
        """
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        result = await self._session.list_tools()
        return [tool.name for tool in result.tools]

    async def list_tool_defs(self) -> list[Any]:
        """List full available tool definitions (with schemas)."""
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        result = await self._session.list_tools()
        return list(result.tools)

    async def call_tool(
        self,
        name: str,
        arguments: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Call any MCP tool by name and return parsed JSON."""
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        payload = arguments or {}
        result = await self._session.call_tool(name, payload)
        return self._parse_result(result)

    @staticmethod
    def detect_modality(tools: list[str]) -> str:
        """Detect active challenge modality.

        Detection order:
        1) Competition API challenge_type (if reachable)
        2) Tool-set fallback heuristics
        """
        api_base = get_api_base()
        if api_base:
            request = Request(
                f"{api_base.rstrip('/')}/api/competition",
                headers={"Accept": "application/json"},
                method="GET",
            )
            try:
                with urlopen(request, timeout=1.5) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                challenge_type = str(payload.get("challenge_type") or "").lower()
                if "image" in challenge_type:
                    return "image"
                if challenge_type:
                    return "text"
            except (json.JSONDecodeError, URLError, TimeoutError):
                pass

        tool_set = set(tools)
        has_text = "arena.get_challenge" in tool_set
        has_image = "arena.image.get_challenge" in tool_set
        if has_image and not has_text:
            return "image"
        if has_text:
            return "text"
        return "text"

    async def get_challenge(self, agent_id: str = "default") -> ChallengeInfo:
        """Get the current challenge and start the timer.

        Args:
            agent_id: Unique identifier for the agent

        Returns:
            ChallengeInfo with puzzle details
        """
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        result = await self._session.call_tool(
            "arena.get_challenge",
            {"agent_id": agent_id},
        )
        data = self._parse_result(result)

        if "error" in data:
            raise McpArenaError(data["error"])

        return ChallengeInfo(
            challenge_type=data.get("challenge_type", ""),
            challenge_id=data.get("challenge_id", ""),
            puzzle_id=data.get("puzzle_id", ""),
            description=data.get("description", ""),
            rules=data.get("rules", ""),
            max_time_s=data.get("max_time_s", 0),
            clues=data.get("clues", []),
            time_remaining_s=data.get("time_remaining_s", 0),
        )

    async def get_image_challenge(self, agent_id: str = "default") -> ImageChallengeInfo:
        """Get the current image challenge and start its timer."""
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        result = await self._session.call_tool(
            "arena.image.get_challenge",
            {"agent_id": agent_id},
        )
        data = self._parse_result(result)
        if "error" in data:
            raise McpArenaError(data["error"])

        prompt = data.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            prompt = data.get("edit_prompt", "")
        if not isinstance(prompt, str):
            prompt = ""

        return ImageChallengeInfo(
            challenge_type=data.get("challenge_type", ""),
            challenge_id=data.get("challenge_id", ""),
            puzzle_id=data.get("puzzle_id", ""),
            difficulty=data.get("difficulty", ""),
            description=data.get("description", ""),
            prompt=prompt,
            reference_notes=data.get("reference_notes", ""),
            max_time_s=data.get("max_time_s", 0),
            input_image_uri=data.get("input_image_uri", ""),
            time_remaining_s=data.get("time_remaining_s", 0),
        )

    async def list_clues(self, agent_id: str = "default") -> list[str]:
        """List available clue IDs.

        Args:
            agent_id: Unique identifier for the agent

        Returns:
            List of clue IDs
        """
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        result = await self._session.call_tool(
            "arena.clues.list",
            {"agent_id": agent_id},
        )
        data = self._parse_result(result)

        if "error" in data:
            raise McpArenaError(data["error"])

        return data.get("clue_ids", [])

    async def get_clue(self, clue_id: str, agent_id: str = "default") -> ClueInfo:
        """Get a specific clue by ID.

        Args:
            clue_id: The clue ID (e.g., "clue_0")
            agent_id: Unique identifier for the agent

        Returns:
            ClueInfo with clue text
        """
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        result = await self._session.call_tool(
            "arena.clues.get",
            {"clue_id": clue_id, "agent_id": agent_id},
        )
        data = self._parse_result(result)

        if "error" in data:
            raise McpArenaError(data["error"])

        return ClueInfo(
            clue_id=data.get("clue_id", clue_id),
            text=data.get("text", ""),
            time_remaining_s=data.get("time_remaining_s", 0),
        )

    async def time_remaining(self, agent_id: str = "default") -> dict[str, Any]:
        """Get remaining time for the current match.

        Args:
            agent_id: Unique identifier for the agent

        Returns:
            Dictionary with time_remaining_s, elapsed_s, max_time_s, expired
        """
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        result = await self._session.call_tool(
            "arena.time_remaining",
            {"agent_id": agent_id},
        )
        data = self._parse_result(result)

        if "error" in data:
            raise McpArenaError(data["error"])

        return data

    async def broadcast_image_thought(
        self,
        thought: str,
        agent_id: str = "default",
    ) -> dict[str, Any]:
        """Broadcast thought text through the image challenge channel."""
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        result = await self._session.call_tool(
            "arena.image.broadcast_thought",
            {"thought": thought, "agent_id": agent_id},
        )
        data = self._parse_result(result)
        raw_message = data.get("raw")
        if isinstance(raw_message, str):
            lowered = raw_message.strip().lower()
            if lowered.startswith("error executing tool"):
                raise McpArenaError(raw_message)
        if "error" in data:
            raise McpArenaError(data["error"])
        return data

    async def submit_image(
        self,
        agent_id: str,
        image_uri: str,
        client_metrics: dict[str, Any] | None = None,
        rationale: str = "",
    ) -> dict[str, Any]:
        """Submit an image output via arena.image.submit_edit."""
        if not self._session:
            raise RuntimeError("Client not connected. Use 'async with' context.")

        result = await self._session.call_tool(
            "arena.image.submit_edit",
            {
                "edited_image": image_uri,
                "client_metrics": client_metrics or {},
                "rationale": rationale,
                "agent_id": agent_id,
            },
        )
        data = self._parse_result(result)
        if "error" in data:
            raise McpArenaError(data["error"])
        return data


class McpArenaError(Exception):
    """Error from the Arena MCP server."""

    pass


@asynccontextmanager
async def connect_arena_mcp(
    mcp_url: str | None = None,
) -> AsyncIterator[McpArenaClient]:
    """Convenience context manager for connecting to Arena MCP.

    Example:
        async with connect_arena_mcp("http://server:5001") as client:
            challenge = await client.get_challenge("my-agent")
    """
    client = McpArenaClient(mcp_url)
    async with client:
        yield client
