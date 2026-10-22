"""Minimal Ollama client with strict-JSON chat calls and a time budget."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx

from arbitrage_watcher import log

DEFAULT_URL = "http://127.0.0.1:11434"
DEFAULT_MODEL = "qwen2.5:3b"


class Ollama:
    """Talks to a local Ollama server. All methods fail soft (return None)."""

    def __init__(self, url: str = DEFAULT_URL, model: str = DEFAULT_MODEL,
                 budget_sec: float = 480.0, timeout: float = 180.0) -> None:
        self.url = url.rstrip("/")
        self.model = model
        self.deadline = time.monotonic() + budget_sec
        self.timeout = timeout
        self.calls = 0
        self.failures = 0
        self._available: bool | None = None

    @property
    def time_left(self) -> float:
        return self.deadline - time.monotonic()

    def available(self) -> bool:
        """True if the server answers and the model is pulled."""
        if self._available is None:
            self._available = self._check()
        return self._available

    def _check(self) -> bool:
        try:
            resp = httpx.get(f"{self.url}/api/tags", timeout=3.0)
            names = {m.get("name", "") for m in resp.json().get("models", [])}
        except (httpx.HTTPError, ValueError):
            return False
        wanted = self.model if ":" in self.model else f"{self.model}:latest"
        return wanted in names or self.model in names

    def chat_json(self, system: str, user: str, max_tokens: int = 600) -> dict[str, Any] | None:
        """One chat turn with `format: json`; None on any failure or when out of budget."""
        if not self.available() or self.time_left < 20:
            return None
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": max_tokens, "num_ctx": 4096},
            "keep_alive": "10m",
        }
        self.calls += 1
        try:
            resp = httpx.post(f"{self.url}/api/chat", json=body, timeout=min(self.timeout, self.time_left))
            resp.raise_for_status()
            content = resp.json()["message"]["content"]
            data = json.loads(content)
            return data if isinstance(data, dict) else None
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            self.failures += 1
            log.error("llm call", exc)
            return None
