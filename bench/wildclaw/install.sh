#!/usr/bin/env bash
# Install GRD as a fifth harness in a WildClawBench checkout.
#
#   bash bench/wildclaw/install.sh /path/to/WildClawBench
#   cd /path/to/WildClawBench && bash script/run.sh grd --category all --model <model>
#
# Idempotent: re-running is a no-op once the four registration points are patched.
# Nothing is vendored — the adapter is copied in and the upstream files are edited in
# place, so `git diff` in the WildClawBench checkout shows exactly what GRD added.
set -euo pipefail

BENCH="${1:-}"
if [[ -z "$BENCH" || ! -d "$BENCH" ]]; then
  echo "usage: $0 /path/to/WildClawBench" >&2
  exit 1
fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for f in src/agents/base.py src/utils/cli_args.py eval/run_batch.py script/run.sh; do
  [[ -f "$BENCH/$f" ]] || { echo "not a WildClawBench checkout: missing $f" >&2; exit 1; }
done

# 1. the adapter package
mkdir -p "$BENCH/src/agents/grd"
cp "$HERE/grd_agent.py" "$BENCH/src/agents/grd/runner.py"
cat > "$BENCH/src/agents/grd/__init__.py" <<'EOF'
from .runner import GRDAgent

__all__ = ["GRDAgent"]
EOF

python3 - "$BENCH" <<'PY'
import pathlib, sys, re

bench = pathlib.Path(sys.argv[1])
changed = []

# 2. --agent-backend choices
p = bench / "src/utils/cli_args.py"
s = p.read_text()
old = 'choices=["openclaw", "claudecode", "codex", "hermesagent"]'
new = 'choices=["openclaw", "claudecode", "codex", "hermesagent", "grd"]'
if old in s:
    p.write_text(s.replace(old, new, 1)); changed.append(p.name)
elif '"grd"' not in s:
    sys.exit(f"cli_args.py: choices list not found and grd absent — patch by hand")

# 3. run_batch: import + dispatch branch. GRD subclasses ClaudeCodeAgent, so it must be
#    added to the two isinstance() checks too or it loses error-grading and workspace
#    diffing — but isinstance already covers it via inheritance, so only dispatch is new.
p = bench / "eval/run_batch.py"
s = p.read_text()
if "GRDAgent" not in s:
    s = s.replace(
        "from src.agents.codex import CodexAgent",
        "from src.agents.codex import CodexAgent\nfrom src.agents.grd import GRDAgent",
        1,
    )
    anchor = '    if args.agent_backend == "claudecode":'
    branch = (
        '    if args.agent_backend == "grd":\n'
        '        backend: BaseAgent = GRDAgent(\n'
        '            anthropic_api_key=OPENROUTER_API_KEY,\n'
        '            openrouter_base_url=OPENROUTER_BASE_URL_CLAUDECODE,\n'
        '        )\n'
        '    elif args.agent_backend == "claudecode":\n'
        '        backend = ClaudeCodeAgent(\n'
    )
    # the original line declares the annotation; GRD's branch takes it over
    s = s.replace(anchor + '\n        backend: BaseAgent = ClaudeCodeAgent(\n', branch, 1)
    p.write_text(s); changed.append(p.name)

# 4. run.sh dispatch
p = bench / "script/run.sh"
s = p.read_text()
if '  grd)' not in s:
    s = s.replace(
        "  codex)",
        '  grd)\n    exec python3 eval/run_batch.py --agent-backend grd "$@"\n    ;;\n  codex)',
        1,
    )
    s = s.replace(
        "  bash script/run.sh codex       [run_batch args...]",
        "  bash script/run.sh codex       [run_batch args...]\n  bash script/run.sh grd         [run_batch args...]",
        1,
    )
    p.write_text(s); changed.append(p.name)

print("patched:", ", ".join(changed) if changed else "nothing (already installed)")
PY

# Prove the wiring rather than assuming it: import the adapter and confirm it registers.
( cd "$BENCH" && python3 -c "
from src.agents.grd import GRDAgent
from src.agents.claudecode.runner import ClaudeCodeAgent
from src.agents.base import BaseAgent
assert issubclass(GRDAgent, ClaudeCodeAgent) and issubclass(GRDAgent, BaseAgent)
for m in ('run_task', 'collect_usage', 'transcript_container_path', 'expects_gateway'):
    assert hasattr(GRDAgent, m), m
print('adapter imports and satisfies BaseAgent')
" )
( cd "$BENCH" && python3 -c "
import sys; sys.argv = ['x', '--agent-backend', 'grd']
from src.utils.cli_args import parse_run_batch_args
print('backend accepted:', parse_run_batch_args(default_model='m', default_parallel=1).agent_backend)
" 2>/dev/null || echo "note: could not smoke-test arg parsing (signature differs); check manually" )

echo
echo "Installed. Run:  cd $BENCH && bash script/run.sh grd --category all --model <model>"
echo "Compare against: bash script/run.sh claudecode --category all --model <same model>"
echo "The delta between those two columns is GRD's discipline, priced."
