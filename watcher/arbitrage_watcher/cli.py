"""Command line: `python -m arbitrage_watcher run|plan [options]`."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from arbitrage_watcher import log
from arbitrage_watcher.llm import DEFAULT_MODEL, DEFAULT_URL
from arbitrage_watcher.runner import Options, plan, run


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="arbitrage_watcher", description="Privacy-first portfolio watcher.")
    sub = p.add_subparsers(dest="command", required=True)
    for name, help_text in (("run", "run the watcher once"), ("plan", "decide whether the next run needs the LLM")):
        sp = sub.add_parser(name, help=help_text)
        sp.add_argument("--repo-dir", type=Path, default=Path(os.environ.get("ARB_REPO_DIR", ".")))
        sp.add_argument("--verbose", action="store_true")
        if name == "run":
            sp.add_argument("--mode", choices=("auto", "light", "deep", "digest"), default="auto")
            sp.add_argument("--ollama-url", default=os.environ.get("OLLAMA_URL", DEFAULT_URL))
            sp.add_argument("--model", default=os.environ.get("ARB_MODEL") or DEFAULT_MODEL)
            sp.add_argument("--llm-budget", type=float, default=float(os.environ.get("ARB_LLM_BUDGET_SEC", "480")),
                            help="max seconds spent on LLM calls per run")
            sp.add_argument("--dry-run", action="store_true",
                            help="print a decrypted summary instead of writing files or pushing (local use only)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    log.setup(args.verbose)
    repo = args.repo_dir.resolve()
    if args.command == "plan":
        return plan(Options(repo_dir=repo))
    return run(Options(mode=args.mode, repo_dir=repo, ollama_url=args.ollama_url, model=args.model,
                       dry_run=args.dry_run, llm_budget=args.llm_budget))
