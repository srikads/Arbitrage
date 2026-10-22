"""Load everything a run needs: passphrase, config, state, previous feed, universe."""

from __future__ import annotations

import os
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from arbitrage_watcher import log
from arbitrage_watcher.crypto import EnvelopeError, read_encrypted
from arbitrage_watcher.models import Tracked, settings_from_config, tracked_from_config
from arbitrage_watcher.resolve import apply_resolved, needs_resolution
from arbitrage_watcher.state import load_state
from arbitrage_watcher.universe import decoy_instruments, ensure_decoys, load_universe


class ConfigMissing(Exception):
    """data/config.enc does not exist yet (the app has not been set up)."""


@dataclass
class Context:
    repo: Path
    passphrase: str
    config: dict[str, Any]
    settings: dict[str, Any]
    tracked: list[Tracked]
    state: dict[str, Any]
    prev_feed: dict[str, Any]
    universe: list[dict[str, Any]]
    decoys: list[dict[str, Any]] = field(default_factory=list)
    resolved: dict[str, dict[str, str]] = field(default_factory=dict)
    rng: random.Random = field(default_factory=random.SystemRandom)

    @property
    def data_dir(self) -> Path:
        return self.repo / "data"

    @property
    def by_id(self) -> dict[str, Tracked]:
        return {t.id: t for t in self.tracked}


def _read_optional(path: Path, passphrase: str, what: str) -> Any:
    try:
        return read_encrypted(path, passphrase)
    except (EnvelopeError, ValueError, OSError) as exc:
        log.error(f"reading {what} (starting fresh)", exc)
        return None


def load(repo: Path) -> Context:
    """Raises ConfigMissing if there is no config, RuntimeError if the passphrase is missing/wrong."""
    config_path = repo / "data" / "config.enc"
    if not config_path.exists():
        raise ConfigMissing()
    passphrase = os.environ.get("ARB_PASSPHRASE", "")
    if not passphrase:
        raise RuntimeError("ARB_PASSPHRASE is not set")
    try:
        config = read_encrypted(config_path, passphrase) or {}
    except EnvelopeError as exc:
        raise RuntimeError("cannot decrypt data/config.enc (wrong passphrase?)") from exc
    state = load_state(_read_optional(repo / "data" / "state.enc", passphrase, "state"))
    prev_feed = _read_optional(repo / "data" / "feed.enc", passphrase, "feed") or {}
    ctx = Context(
        repo=repo, passphrase=passphrase, config=config, settings=settings_from_config(config),
        tracked=tracked_from_config(config), state=state, prev_feed=prev_feed, universe=load_universe(repo),
    )
    log.info("loaded config: %d instruments, universe %d", len(ctx.tracked), len(ctx.universe))
    return ctx


def prepare_instruments(ctx: Context, resolve: bool = True) -> None:
    """Resolve unknown ISINs (network) and pick stable decoys."""
    if resolve:
        from arbitrage_watcher.resolve import resolve_isins

        universe_ids = {u["id"] for u in ctx.universe}
        if any(needs_resolution(t, universe_ids) for t in ctx.tracked):
            ctx.resolved = resolve_isins(ctx.tracked, ctx.universe, ctx.state, ctx.rng)
        else:
            ctx.resolved = {}
        apply_resolved(ctx.tracked, ctx.resolved)
    ctx.state["decoys"] = ensure_decoys(ctx.state["decoys"], ctx.tracked, ctx.universe, ctx.rng)
    ctx.decoys = decoy_instruments(ctx.state["decoys"], ctx.universe)
    if len(ctx.decoys) < 3 * len(ctx.tracked):
        log.warn("decoy pool too small: %d decoys for %d instruments", len(ctx.decoys), len(ctx.tracked))


def padding_ok(ctx: Context) -> bool:
    """Contract §6.2: per-ticker requests only with >= 3x decoys available."""
    return len(ctx.decoys) >= 3 * len(ctx.tracked)
