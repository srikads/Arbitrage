#!/usr/bin/env bash
# Run the watcher on a laptop against a local clone, with a bigger local model.
# Usage: ARB_PASSPHRASE=... scripts/laptop-watch.sh [--mode auto|light|deep|digest] [--dry-run]
# Env: ARB_MODEL (default qwen2.5:7b), OLLAMA_URL (default http://127.0.0.1:11434)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL="${ARB_MODEL:-qwen2.5:7b}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
PYTHON="${PYTHON:-python3}"

if [ -z "${ARB_PASSPHRASE:-}" ]; then
  read -r -s -p "Passphrase: " ARB_PASSPHRASE; echo
  export ARB_PASSPHRASE
fi

cd "$REPO_DIR"
git pull --rebase --quiet

if ! "$PYTHON" -c "import arbitrage_watcher" 2>/dev/null; then
  "$PYTHON" -m pip install --quiet -e ./watcher
fi

if command -v ollama >/dev/null 2>&1; then
  curl -sf "$OLLAMA_URL/api/tags" >/dev/null || { (ollama serve >/dev/null 2>&1 &) ; sleep 3; }
  ollama list | awk '{print $1}' | grep -qx "$MODEL" || ollama pull "$MODEL"
else
  echo "ollama not found: running with the lexicon fallback" >&2
fi

DRY=0
for arg in "$@"; do [ "$arg" = "--dry-run" ] && DRY=1; done
"$PYTHON" -m arbitrage_watcher run --repo-dir "$REPO_DIR" --ollama-url "$OLLAMA_URL" --model "$MODEL" \
  --llm-budget "${ARB_LLM_BUDGET_SEC:-1200}" "$@"

if [ "$DRY" = 0 ]; then
  git add data/*.enc
  if ! git diff --cached --quiet; then
    git -c user.name="arbitrage-watcher" -c user.email="watcher@users.noreply.github.com" \
      commit --quiet -m "chore: update feed"
    for i in 1 2 3; do
      git pull --rebase --quiet && git push --quiet && exit 0
      sleep $((i * 5))
    done
    echo "push failed" >&2; exit 1
  fi
fi
