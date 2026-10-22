"""Logging that never leaks portfolio data.

Only counts, stage names and timings are logged. Exceptions are reduced to
their type name because messages from third-party libraries often contain
tickers or URLs with instrument names.
"""

from __future__ import annotations

import logging
import sys
import time
from contextlib import contextmanager
from typing import Iterator

_LOG = logging.getLogger("arbitrage_watcher")

# Third-party loggers that may print URLs (with query strings) or symbols.
_NOISY = ("httpx", "httpcore", "yfinance", "peewee", "urllib3", "pywebpush", "asyncio", "playwright")


def setup(verbose: bool = False) -> None:
    """Configure the package logger and silence chatty dependencies."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%H:%M:%S"))
    _LOG.handlers[:] = [handler]
    _LOG.setLevel(logging.DEBUG if verbose else logging.INFO)
    _LOG.propagate = False
    for name in _NOISY:
        logging.getLogger(name).setLevel(logging.CRITICAL)
        logging.getLogger(name).propagate = False


def info(msg: str, *args: object) -> None:
    _LOG.info(msg, *args)


def warn(msg: str, *args: object) -> None:
    _LOG.warning(msg, *args)


def debug(msg: str, *args: object) -> None:
    _LOG.debug(msg, *args)


def error(stage: str, exc: BaseException) -> None:
    """Log a failure by stage and exception type only (never the message)."""
    _LOG.warning("%s failed: %s", stage, type(exc).__name__)


@contextmanager
def timed(stage: str) -> Iterator[None]:
    """Log how long a stage took."""
    t0 = time.monotonic()
    try:
        yield
    finally:
        _LOG.info("%s done in %.1fs", stage, time.monotonic() - t0)
