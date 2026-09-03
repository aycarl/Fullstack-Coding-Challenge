# Agentic Code Generation Workflow

A CLI agent that reads a natural-language product spec and generates a working React +
TypeScript frontend into the provided boilerplate — planning the work as ordered tasks,
writing each file, then validating its own output with the project's real `typecheck` and
`test` scripts and repairing what fails.

**The deliverable is the agent.** `generated-app/` is committed as evidence that it works,
so you can inspect the output without spending an API call.

The original challenge brief is preserved at [`CHALLENGE.md`](CHALLENGE.md).

---

## Quick start

```bash
make setup                                        # installs uv if missing, syncs the agent env
echo "ANTHROPIC_API_KEY=sk-ant-..." > agent/.env  # your key; nothing else is needed

make generate                                     # ~15 min, ~$4.60 — writes generated-app/
make test                                         # typecheck + tests on what it built
make test-agent                                   # the agent's own test suite
make dev                                          # http://localhost:5173
```

`make` on its own lists every target. To run a different spec:

```bash
make generate SPEC=spec-alt.md
```

Requires **Node 20+** and an Anthropic API key. `make setup` handles
[uv](https://docs.astral.sh/uv/).

> Each run replaces `generated-app/` entirely. A lock file prevents two runs at once, since
> generation starts by deleting the target directory.

---

## What a run looks like

Every run streams progress to your terminal and writes the same log to
`agent/logs/<timestamp>_generated_logs.txt`. One is committed at
[`agent/logs/sample-run.txt`](agent/logs/sample-run.txt) — read that if you want to see
the full decomposition without running anything.

```
Plan created 15 tasks (6,327 in / 3,291 out)

Plan: 15 tasks across 3 features (numbered in execution order)

  Car listing
     1. src/hooks/useCars.ts                (scaffold)
     2. src/__tests__/useCars.test.tsx      (test)
    10. src/hooks/useCars.ts                (implementation)

  Search and sort
     5. src/__tests__/CarFilters.test.tsx   (test)
    13. src/components/CarFilters.tsx       (implementation)
  ...

Red phase   Tests fail before implementation, as expected.
Validation  Typecheck & tests: FAILED
Fixer       Self-healing: patched src/__tests__/filterAndSortCars.test.ts
Validation  Typecheck & tests: PASSED

Tokens (claude-opus-5): 315,167 in, 46,753 out
Estimated cost: $2.74
```

Tasks are grouped by the capability they serve but numbered in execution order, because
work is planned **test-first** — every test is written before any code that satisfies it.

---

## How it works

Six nodes on a LangGraph state machine.

```mermaid
flowchart TD
    inspector["<b>inspector</b><br/>reads boilerplate contracts"]
    planner["<b>planner</b><br/>spec → ordered task list"]
    coder["<b>coder</b><br/>writes one file per iteration"]
    red["<b>red_check</b><br/>tests must fail first"]
    validator["<b>validator</b><br/>install → typecheck → test"]
    fixer["<b>fixer</b><br/>localise error, rewrite one file"]
    done(["END"])

    inspector --> planner --> coder
    coder -->|tasks remain| coder
    coder -->|first implementation task| red
    red --> coder
    coder -->|plan exhausted| validator
    validator -->|fails, retries left| fixer
    fixer --> validator
    validator -->|passes, or retries exhausted| done
```

| Node | Responsibility |
|---|---|
| `inspector` | Reads the boilerplate's contract files in full, lists every other path, so the planner reuses what exists instead of rebuilding it |
| `planner` | Spec → ordered task list, each tagged `scaffold` / `test` / `implementation` |
| `coder` | Writes one file per iteration, shown every file written so far this run |
| `red_check` | Runs the suite once tests exist and no implementation does, proving they fail |
| `validator` | Installs dependencies once, then runs the project's own typecheck and tests |
| `fixer` | Reads the failure, opens the files it names, rewrites exactly one |

---

## Design decisions

The five that matter most. Full list in [`docs/PROJECT.md`](docs/PROJECT.md#key-decisions).

- **Test-first by construction, not by instruction.** The planner tags each task with a
  phase and the code stable-sorts by it. A test emitted after its implementation isn't a
  test-first workflow whatever the plan claims — sorting makes the property hold.
- **The red phase proves the tests fail.** Otherwise "test-first" is only a claim about
  ordering; a suite that passes before any code exists asserts nothing.
- **Validation shells out to the project's own scripts.** The agent is held to exactly the
  bar a human contributor faces, not a bespoke check that could be laxer.
- **Structured output wherever a decision is made.** The plan and each fix are constrained
  by Pydantic schemas rather than parsed out of prose.
- **No spec knowledge in the prompts.** An agent that only works on the spec it was tuned
  against is a template with extra steps.

---

## Generalization

The agent has no domain knowledge baked in. [`agent/spec-alt.md`](agent/spec-alt.md) is an
unrelated spec — a fleet board filtered by **colour**, with no model search — and produced
a correspondingly different app: a colour picker, a match count, and tests asserting the
*absence* of a search box, which is a negative requirement read out of prose.

Both runs finish 68/68 green. Neither output mentions the other's domain.

---

## Known limitations

- **No cross-file consistency pass.** Files are written one at a time and never reconciled
  as a set. Fine here because dependencies flow one direction (schema → hook → component);
  a spec needing two files to co-mutate shared state would need a step this doesn't have.
- **Context grows quadratically.** Every file written is re-injected into the next coder
  call — input climbs 5,127 → 30,347 tokens across a run. Affordable at a dozen files.
- **The fixer can re-patch a file that didn't improve.** It gets two repair attempts
  before the retry budget runs out, and no memory of whether the last one helped.

---

## Repository

```
agent/                  the deliverable
  run.py                CLI, boilerplate copy, run loop
  graph.py              node wiring and routing
  nodes.py              the six nodes and their prompts
  state.py              typed state and Pydantic schemas
  tools.py              file I/O and the shell-out validators
  config.py             model id and cost rates, env-overridable
  reporting.py          run logging
  tests/                the agent's own test suite
  spec.txt              sample spec (default input)
  spec-alt.md           unrelated spec, for generalization
  logs/sample-run.txt   committed sample run log

generated-app/          committed sample output — the agent's, not hand-written

docs/
  WRITEUP.md            model choice, architecture, cost, tradeoffs
  PROJECT.md            architecture, key decisions, measured runs
  TICKETS.md            stage board with acceptance criteria

src/                    the provided boilerplate (React 19 + Apollo + MUI + MSW)
```

**Start with [`docs/WRITEUP.md`](docs/WRITEUP.md)** — which model and why, the measured
cost per run, what worked, and what I'd improve with more time.
