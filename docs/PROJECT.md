# PROJECT.md — architecture and decisions

Working source of truth. Process history is in [`TICKETS.md`](TICKETS.md); the short
version for reviewers is [`WRITEUP.md`](WRITEUP.md).

---

## What it is

A Python CLI agent that reads a natural-language spec and generates a React + TypeScript
frontend into a copy of the provided boilerplate — planning ordered file-level tasks,
writing each file, validating with the project's own `typecheck` and `test`, and looping
failures through a repair node.

**The deliverable is the agent.** The generated app is evidence it works.

## Non-goals

- No backend, database, container, auth or CI/CD. MSW mocks the API.
- No general-purpose framework. Six nodes, and it stays six.
- UI polish is not the target; functional correctness is.
- No spec knowledge in the prompts — it must handle a spec it has never seen.

## Stack

**Agent:** Python 3.14 · uv · LangGraph · langchain-anthropic · Pydantic v2 · Rich
**Generated:** React 19 + TypeScript · Vite · Apollo · MUI · MSW · Vitest
**Model:** `claude-opus-5` — $5.00 / 1M in, $25.00 / 1M out

## Nodes

Diagram in the [root README](../README.md#how-it-works). Routing lives in `graph.py`.

| Node | Responsibility |
|---|---|
| `inspector` | Reads contract files in full, lists every other path |
| `planner` | Spec → ordered `FileTask` list, tagged by phase and feature |
| `coder` | Writes one file per iteration, shown all prior output |
| `red_check` | Proves the tests fail before any implementation exists |
| `validator` | `npm install` → `typecheck` → `test` |
| `fixer` | Localises the error, rewrites exactly one file |

| File | Contents |
|---|---|
| `run.py` | CLI, boilerplate copy, stream loop |
| `graph.py` | Graph wiring and the two routing functions |
| `nodes.py` | The six nodes and their prompts |
| `state.py` | `AgentState`, `FileTask`, `AgentPlan`, `FixResult` |
| `tools.py` | File I/O and the shell-out validators |
| `reporting.py` | Run logging to stdout and `agent/logs/` |
| `config.py` | Model id and cost rates, env-overridable |

---

## Key Decisions

- **LangGraph over a hand-rolled loop** — coder→validator→fixer genuinely is a state
  machine with conditional edges.
- **`claude-opus-5` everywhere** — the costly decisions are planning and repair, not
  code-writing; a bad plan fails in a way no retry recovers. Not benchmarked against a
  cheaper model, which `ANTHROPIC_MODEL` would make a one-line change.
- **Structured output for both decisions** — `AgentPlan` and `FixResult` via
  `json_schema`, so neither is parsed out of prose.
- **Test-first by sorting, not by instruction** — the planner tags a phase and the code
  stable-sorts by it. A test emitted after its implementation isn't test-first whatever
  the plan claims.
- **The red phase proves the tests fail** — otherwise test-first is only a claim about
  ordering, and a suite that passes before any code exists asserts nothing.
- **Validation shells out to the project's own scripts** — the same bar a human
  contributor faces, not a bespoke check that could be laxer.
- **Retry only transient faults** — 429s, 5xxs, timeouts, connection errors. LangGraph's
  default retries anything, turning a real bug into five slow identical failures.
- **The coder sees every file it has written** — imports are checked against real exports.
- **One few-shot example, in an unused domain** — teaches shape without seeding vocabulary.
- **The inspector sends a full path manifest** — the planner can't reuse what it can't see;
  ~2.6K tokens that cut a 22-task plan down to 13.
- **The planner may not emit no-op tasks** — the coder rewrites in full, so a task saying
  "leave this as-is" destroys working wiring.
- **The fixer gets the files the validator named** (capped at six) and its chosen path is
  treated as untrusted — it is the one place the model picks a write target.
- **The fixer prefers fixing implementation over test** — given a failing test and a free
  hand, the cheapest repair is to weaken the assertion.
- **Feature labels, not feature-sized tasks** — the plan reads as an ordered feature
  sequence while each task still builds one file; execution stays phase-major.
- **The run log is flushed per event** — the run worth logging is the one that dies at
  task 9, which an end-of-run writer would miss entirely.
- **The agent's own tests cover its pure core** — routing, the path guard, cost
  arithmetic, ordering and logging. Nothing mocks an LLM call: the parts worth testing are
  the ones that decide, and those are all pure.
- **Boilerplate is copied to a separate output directory** — every run starts clean, and
  `run.py` refuses to delete the CWD or the source.

## Known Limitations

- **No cross-file consistency pass.** Files are never reconciled as a set. Fine while
  dependencies flow one direction; a spec needing two files to co-mutate would need a step
  this does not have.
- **Context grows quadratically.** Every prior file is re-injected into each coder call —
  input climbs 5,127 → 30,347 tokens across a run.
- **The fixer can re-patch a file that did not help.** Two repair attempts, no memory of
  whether the last one worked. `last_patched_file` is in state and unused for this.
- **Concurrent runs corrupt each other.** Generation begins by deleting the output
  directory, and there is no lock.

## Measured Runs

| Date | Spec | Tasks | Input | Output | Cost | Result |
|---|---|---|---|---|---|---|
| 09-02 | `spec.txt` | 11 | 174,473 | 41,710 | $1.92 | Failed at retry limit |
| 09-03 | `spec.txt` | 14 | 449,265 | 77,710 | $4.19 | 48/59 — fixer looped on one file |
| 09-03 | `spec.txt` | 12 | 374,085 | 62,782 | $3.44 | 37/38 — fixture collided with a seeded mock |
| 09-03 | `spec-alt.md` | 14 | 285,395 | 57,222 | $2.86 | **68/68, typecheck clean, dev 200** |
| 09-03 | `spec.txt` | 15 | 315,167 | 46,753 | $2.74 | **68/68, typecheck clean, dev 200** |

Earlier runs predate cost instrumentation. Failed runs cost more, not less — each retry is
another planner-grade call.
