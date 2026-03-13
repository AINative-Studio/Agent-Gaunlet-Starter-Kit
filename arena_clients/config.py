"""Shared environment resolution helpers for starter-kit clients."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

_DEFAULT_SCHEME = "http"
_DEFAULT_API_BASE = "http://localhost:8000"
_DEFAULT_MCP_URL = "http://localhost:5001"
_DEFAULT_PROXY_HOST = "http://localhost:4001"


def _read_env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def _normalize_server(server: str) -> tuple[str, str]:
    raw = server.strip()
    if not raw:
        return _DEFAULT_SCHEME, ""

    if "://" in raw:
        parsed = urlparse(raw)
        scheme = parsed.scheme or _DEFAULT_SCHEME
        host = parsed.hostname or parsed.netloc or parsed.path
    else:
        parsed = urlparse(f"{_DEFAULT_SCHEME}://{raw}")
        scheme = parsed.scheme or _DEFAULT_SCHEME
        host = parsed.hostname or raw

    return scheme, str(host or "").strip().strip("/")


def _resolve_service_url(
    explicit: str | None,
    *,
    env_name: str,
    port: int,
    fallback: str,
) -> str:
    resolved = (explicit or "").strip()
    if resolved:
        return resolved.rstrip("/")

    resolved = _read_env(env_name)
    if resolved:
        return resolved.rstrip("/")

    server = _read_env("ARENA_SERVER")
    if server:
        scheme, host = _normalize_server(server)
        if host:
            return f"{scheme}://{host}:{port}"

    return fallback


def get_api_base(explicit: str | None = None) -> str:
    """Resolve the Arena REST API base URL."""
    return _resolve_service_url(
        explicit,
        env_name="ARENA_API_BASE",
        port=8000,
        fallback=_DEFAULT_API_BASE,
    )


def get_mcp_url(explicit: str | None = None) -> str:
    """Resolve the Arena MCP URL."""
    return _resolve_service_url(
        explicit,
        env_name="ARENA_MCP_URL",
        port=5001,
        fallback=_DEFAULT_MCP_URL,
    )


def get_proxy_host(explicit: str | None = None) -> str:
    """Resolve the Arena LLM proxy base URL."""
    return _resolve_service_url(
        explicit,
        env_name="LLM_PROXY_HOST",
        port=4001,
        fallback=_DEFAULT_PROXY_HOST,
    )


def get_arena_api_key(explicit: str | None = None) -> str:
    """Resolve the competitor Arena API key."""
    resolved = (explicit or "").strip()
    if resolved:
        return resolved
    return _read_env("ARENA_API_KEY")


def get_llm_api_key(explicit: str | None = None) -> str:
    """Resolve the API key for LLM proxy calls.

    Prefers LLM_PROXY_API_KEY over ARENA_API_KEY when provided.
    """
    resolved = (explicit or "").strip()
    if resolved:
        return resolved
    proxy_key = _read_env("LLM_PROXY_API_KEY")
    if proxy_key:
        return proxy_key
    return get_arena_api_key()


@lru_cache(maxsize=1)
def ensure_connected(timeout_s: float = 3.0) -> None:
    """Fail fast when the starter kit is missing Arena connectivity config."""
    if not (_read_env("ARENA_SERVER") or _read_env("ARENA_API_BASE")):
        raise SystemExit(
            "Arena server is not configured. Set ARENA_SERVER to the arena IP "
            "address in your .env file."
        )

    api_key = get_arena_api_key()
    if not api_key:
        raise SystemExit(
            "ARENA_API_KEY is missing. Set it in your .env file before running "
            "the agent."
        )

    api_base = get_api_base()
    encoded_key = quote(api_key, safe="")
    request = Request(
        f"{api_base.rstrip('/')}/api/keys/validate?key={encoded_key}",
        headers={"Accept": "application/json"},
        method="GET",
    )

    try:
        with urlopen(request, timeout=timeout_s) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise SystemExit(
            f"Could not verify ARENA_API_KEY with the Arena API at {api_base} "
            f"(HTTP {exc.code}). Check ARENA_SERVER and try again."
        ) from exc
    except (URLError, TimeoutError) as exc:
        raise SystemExit(
            f"Could not reach the Arena API at {api_base}. Check ARENA_SERVER "
            "and your network connection."
        ) from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(
            f"The Arena API at {api_base} returned an invalid validation "
            "response. Check that the server is running the expected build."
        ) from exc

    if not isinstance(payload, dict) or not bool(payload.get("valid")):
        raise SystemExit(
            "ARENA_API_KEY is missing or invalid. Set it in your .env file "
            "before running the agent."
        )
