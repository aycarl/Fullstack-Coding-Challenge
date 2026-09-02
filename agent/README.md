# Agent — Autonomous Frontend Code Generator

A CLI agent that reads a natural-language product specification and generates a working
React + TypeScript frontend into a copy of the boilerplate at the repo root. It runs as a
five-node LangGraph state machine — `inspector → planner → coder → validator → fixer` —
decomposing the spec into ordered file-level tasks, writing each file, then validating its
own output with the project's real `npm run typecheck` and `npm run test` and looping
failures back through a repair node until the suite passes or the retry budget runs out.

Architecture, key decisions, and known limitations live in
[`../docs/PROJECT.md`](../docs/PROJECT.md); the stage board is in
[`../docs/TICKETS.md`](../docs/TICKETS.md).

## Running it

Requires [uv](https://docs.astral.sh/uv/) and an `ANTHROPIC_API_KEY` in `agent/.env`
(see [`../.env.example`](../.env.example)).

```bash
cd agent
uv sync
uv run run.py --spec spec.txt --output ./generated-app
```

Then run what it built:

```bash
cd generated-app && npm install && npm run dev
```

All CLI paths default relative to this `agent/` directory: `--spec spec.txt`,
`--boilerplate ..` (the repo root), `--output ./generated-app`.
