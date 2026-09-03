# Agent

The deliverable: a CLI agent that reads a natural-language spec and generates a React +
TypeScript frontend into a copy of the boilerplate at the repo root, validating and
repairing its own output.

Six LangGraph nodes — `inspector → planner → coder ⇄ red_check → validator ⇄ fixer`.

```bash
uv sync
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
uv run run.py --spec spec.txt --output ./generated-app
```

Paths default relative to this directory: `--spec spec.txt`, `--boilerplate ..`,
`--output ./generated-app`. `ANTHROPIC_MODEL` overrides the model.

Tests for the agent itself: `uv run pytest`.

From the repo root, `make setup` then `make generate` does the same thing.

Architecture and decisions: [`../docs/PROJECT.md`](../docs/PROJECT.md) ·
write-up: [`../docs/WRITEUP.md`](../docs/WRITEUP.md)
