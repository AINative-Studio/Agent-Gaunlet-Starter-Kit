"""Autonomous model selection for starter-kit agents.

The selection flow is intentionally lightweight:
1) Fetch available models from the LLM proxy.
2) Pick the smallest likely-fast model as a triage model.
3) Ask that triage model to recommend the best model for the challenge.
4) Fall back safely when selection fails.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from arena_clients.config import get_llm_api_key, get_proxy_host


DEFAULT_FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "default")

_ASSESS_SYSTEM = (
    "You are an impartial model-selection advisor for a timed AI competition. "
    "Given challenge details and available models, pick the single best model based strictly on its capabilities. "
    "Do NOT favor models that share your own name or manufacturer. "
    "Respond with ONLY the exact model name from the provided list."
)

_SIZE_INDICATORS = [
    ("nano", 0),
    ("mini", 1),
    ("small", 2),
    ("medium", 3),
    ("base", 4),
    ("super", 5),
    ("large", 6),
    ("ultra", 7),
]


def resolve_proxy_api_key(api_key: str = "") -> str:
    """Resolve proxy auth key for competitor access."""
    explicit = (api_key or "").strip()
    if explicit:
        return explicit
    return get_llm_api_key()


def _build_proxy_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    agent_id = str(os.getenv("AGENT_ID") or "").strip()
    usage_scope = str(os.getenv("ARENA_USAGE_SCOPE") or "").strip()
    if agent_id:
        headers["X-Agent-ID"] = agent_id
    if usage_scope:
        headers["X-Round-ID"] = usage_scope
    return headers


def _parse_proxy_model_ids(payload: Any) -> list[str]:
    model_ids: list[str] = []
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            for item in data:
                if not isinstance(item, dict):
                    continue
                model_id = item.get("id")
                if isinstance(model_id, str) and model_id.strip():
                    model_ids.append(model_id.strip())
        elif isinstance(payload.get("models"), list):
            for item in payload.get("models", []):
                if isinstance(item, str) and item.strip():
                    model_ids.append(item.strip())
    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, str) and item.strip():
                model_ids.append(item.strip())

    seen: set[str] = set()
    ordered: list[str] = []
    for model_id in model_ids:
        if model_id in seen:
            continue
        seen.add(model_id)
        ordered.append(model_id)
    return ordered


def fetch_available_models(proxy_host: str | None = None, api_key: str = "") -> list[str]:
    """Fetch available model IDs from the proxy /models endpoint."""
    resolved_proxy_host = get_proxy_host(proxy_host)
    url = f"{resolved_proxy_host.rstrip('/')}/models"
    headers = {"Accept": "application/json"}
    resolved_key = resolve_proxy_api_key(api_key)
    if resolved_key:
        headers["Authorization"] = f"Bearer {resolved_key}"
    request = Request(url, headers=headers, method="GET")

    try:
        with urlopen(request, timeout=3.0) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, json.JSONDecodeError, HTTPError):
        return []

    return _parse_proxy_model_ids(payload)


def _is_text_model(model_name: str) -> bool:
    lowered = model_name.lower()
    return "image" not in lowered and "vision" not in lowered


def _size_rank(model_name: str) -> tuple[int, float]:
    lowered = model_name.lower()
    keyword_rank = 999
    for keyword, rank in _SIZE_INDICATORS:
        if keyword in lowered:
            keyword_rank = min(keyword_rank, rank)

    param_rank = 9999.0
    match = re.search(r"(\d+(?:\.\d+)?)\s*b\b", lowered)
    if match:
        try:
            param_rank = float(match.group(1))
        except ValueError:
            param_rank = 9999.0

    return keyword_rank, param_rank


def _is_logic_challenge(
    challenge_type: str,
    challenge_description: str,
    challenge_rules: str,
) -> bool:
    text = " ".join(
        [
            challenge_type or "",
            challenge_description or "",
            challenge_rules or "",
        ]
    ).lower()
    return any(
        token in text
        for token in (
            "logic",
            "puzzle",
            "deduction",
            "ordering",
            "constraint",
            "riddle",
        )
    )


def _is_web_challenge(challenge_type: str, challenge_description: str, challenge_rules: str) -> bool:
    text = " ".join(
        [
            challenge_type or "",
            challenge_description or "",
            challenge_rules or "",
        ]
    ).lower()
    return any(
        token in text
        for token in (
            "web-search",
            "search",
            "fact-check",
            "market-research",
            "research",
            "pricing",
            "compare",
        )
    )


def _is_image_challenge(challenge_type: str, challenge_description: str, challenge_rules: str) -> bool:
    text = " ".join(
        [
            challenge_type or "",
            challenge_description or "",
            challenge_rules or "",
        ]
    ).lower()
    return any(
        token in text
        for token in (
            "image",
            "vision",
            "photo",
            "picture",
            "visual",
            "screenshot",
            "diagram",
        )
    )


def _is_high_complexity_challenge(
    challenge_type: str,
    challenge_description: str,
    challenge_rules: str,
    max_time_s: int,
) -> bool:
    text = " ".join(
        [
            challenge_type or "",
            challenge_description or "",
            challenge_rules or "",
        ]
    ).lower()
    complexity_hits = sum(
        1
        for token in (
            "market-research",
            "synthesis",
            "vulnerability",
            "dependency",
            "drift",
            "scan",
            "audit",
            "fact-check",
            "cross-source",
            "validate",
            "verify",
            "ranking",
            "comparison",
        )
        if token in text
    )
    if max_time_s >= 120:
        return True
    return complexity_hits >= 2


def _is_tiny_model(model_name: str) -> bool:
    lowered = model_name.lower()
    return any(token in lowered for token in ("nano", "mini", "small"))


def _reasoning_strength_score(model_name: str) -> float:
    keyword_rank, param_rank = _size_rank(model_name)
    size_component = 0.0 if param_rank == 9999.0 else param_rank
    score = keyword_rank * 100.0 + size_component
    lowered = model_name.lower()
    if any(token in lowered for token in ("gpt", "reason", "thinking", "qwen3-next")):
        score += 40.0
    if _is_tiny_model(model_name):
        score -= 120.0
    return score


def _pick_strong_logic_model(model_ids: list[str]) -> str | None:
    text_models = [model for model in model_ids if _is_text_model(model)]
    if not text_models:
        return None
    return max(text_models, key=_reasoning_strength_score)


def _apply_challenge_bias(
    selected_model: str,
    *,
    challenge_type: str,
    challenge_description: str,
    challenge_rules: str,
    max_time_s: int,
    available_models: list[str],
) -> str:
    """Apply deterministic safeguards after LLM recommendation."""
    if not available_models:
        return selected_model

    logic = _is_logic_challenge(challenge_type, challenge_description, challenge_rules)
    web = _is_web_challenge(challenge_type, challenge_description, challenge_rules)
    complex_task = _is_high_complexity_challenge(
        challenge_type,
        challenge_description,
        challenge_rules,
        max_time_s,
    )

    # For logic and other high-complexity tasks, avoid tiny models when time allows.
    if max_time_s >= 35 and (logic or complex_task):
        strong_model = _pick_strong_logic_model(available_models)
        if strong_model and _is_tiny_model(selected_model):
            return strong_model

    # For quick/simple web extraction, tiny models are acceptable.
    if web and max_time_s <= 45 and _is_tiny_model(selected_model):
        return selected_model

    # Unknown medium/long tasks should avoid tiny picks by default.
    if max_time_s >= 90 and _is_tiny_model(selected_model):
        strong_model = _pick_strong_logic_model(available_models)
        if strong_model:
            return strong_model
    return selected_model


def _pick_triage_model(model_ids: list[str]) -> str:
    """Pick the smallest/fastest likely model for the assessment call."""
    if not model_ids:
        return DEFAULT_FALLBACK_MODEL

    text_models = [model for model in model_ids if _is_text_model(model)]
    candidates = text_models or model_ids
    return min(candidates, key=lambda model: (_size_rank(model), len(model)))


def _build_assessment_prompt(
    challenge_type: str,
    challenge_description: str,
    challenge_rules: str,
    max_time_s: int,
    available_models: list[str],
) -> str:
    challenge_type = challenge_type or "unknown"
    challenge_description = (challenge_description or "").strip()
    challenge_rules = (challenge_rules or "").strip()
    description = challenge_description[:400]
    rules = challenge_rules[:400]
    models_list = ", ".join(available_models)

    return (
        f"Challenge type: {challenge_type}\n"
        f"Time limit: {max_time_s} seconds\n"
        f"Description: {description}\n"
        f"Rules: {rules}\n\n"
        f"Available models: {models_list}\n\n"
        "Pick the single best model for this task. "
        "Prefer stronger reasoning for complex logic, speed for tight time limits, "
        "and strong planning/reasoning models for image-tool orchestration tasks. "
        "For logic puzzles with >=35 seconds, avoid tiny models if stronger models exist. "
        "Reply with ONLY one model name from the list."
    )


def _extract_model_from_text(text: str, available_models: list[str]) -> str | None:
    cleaned = text.strip()
    if not cleaned:
        return None

    by_casefold = {model.casefold(): model for model in available_models}
    if cleaned.casefold() in by_casefold:
        return by_casefold[cleaned.casefold()]

    for line in cleaned.splitlines():
        candidate = line.strip().strip("`'\"")
        if candidate.casefold() in by_casefold:
            return by_casefold[candidate.casefold()]
        if candidate.lower().startswith("answer:"):
            remainder = candidate.split(":", 1)[1].strip()
            if remainder.casefold() in by_casefold:
                return by_casefold[remainder.casefold()]

    lowered = cleaned.casefold()
    for model in available_models:
        if model.casefold() in lowered:
            return model
    return None


def _call_triage(proxy_host: str, api_key: str, model: str, prompt: str) -> str | None:
    url = f"{proxy_host.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _ASSESS_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.0,
        "max_tokens": 50,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    headers.update(_build_proxy_headers())
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=20.0) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, HTTPError, json.JSONDecodeError):
        return None

    message = body.get("choices", [{}])[0].get("message", {})
    content = (message.get("content") or "").strip()
    if content:
        return content
    reasoning = (message.get("reasoning_content") or message.get("reasoning") or "").strip()
    return reasoning or None


def select_model(
    challenge_type: str,
    challenge_description: str,
    challenge_rules: str,
    max_time_s: int,
    available_models: list[str],
    proxy_host: str | None = None,
    api_key: str = "",
) -> str:
    """Autonomously pick the best model for this challenge.

    Fallback chain:
      1. Only one model available -> use it.
      2. LLM assessment via triage model -> recommended model.
      3. Triage model itself -> if assessment fails or response is invalid.
      4. First available model -> absolute last resort.
      5. DEFAULT_FALLBACK_MODEL -> if no models can be fetched at all.
    """
    api_key = resolve_proxy_api_key(api_key)
    proxy_host = get_proxy_host(proxy_host)

    if len(available_models) == 1:
        return available_models[0]
    if not available_models:
        return DEFAULT_FALLBACK_MODEL

    if _is_image_challenge(challenge_type, challenge_description, challenge_rules):
        text_models = [model for model in available_models if _is_text_model(model)]
        if len(text_models) == 1:
            return text_models[0]
        if text_models:
            if max_time_s >= 35:
                strong_model = _pick_strong_logic_model(text_models)
                if strong_model:
                    return strong_model
            return _pick_triage_model(text_models)

    triage_model = _pick_triage_model(available_models)
    prompt = _build_assessment_prompt(
        challenge_type=challenge_type,
        challenge_description=challenge_description,
        challenge_rules=challenge_rules,
        max_time_s=max_time_s,
        available_models=available_models,
    )
    selected_model = triage_model
    raw_recommendation = _call_triage(proxy_host, api_key, triage_model, prompt)
    if raw_recommendation:
        recommended = _extract_model_from_text(raw_recommendation, available_models)
        if recommended:
            selected_model = recommended

    selected_model = _apply_challenge_bias(
        selected_model,
        challenge_type=challenge_type,
        challenge_description=challenge_description,
        challenge_rules=challenge_rules,
        max_time_s=max_time_s,
        available_models=available_models,
    )

    if selected_model in available_models:
        return selected_model
    if triage_model in available_models:
        return triage_model
    return available_models[0]
