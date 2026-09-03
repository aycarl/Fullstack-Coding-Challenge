# PROJECT.md — Agentic Code Generation Workflow

Working source of truth for the agent. Updated as work lands; unknowns are written `TBD`
rather than guessed at.

---

## What This Is

A Python CLI agent that reads a natural-language product specification and autonomously
generates a React + TypeScript frontend into the provided boilerplate. It plans the work
as an ordered file-level task list, writes each file, runs the project's own validation
commands against its output, and feeds failures back into a repair loop.

The deliverable is **the agent**. The generated app is evidence that the agent works.

Entry point: `agent/run.py` — `uv run run.py --spec spec.txt --output ./generated-app`

---

## Why It Exists / Non-Goals

Most "AI writes your app" tooling is one large prompt with a retry button. The
interesting problem is the loop around the model: decomposing a spec into ordered work,
handing each step only the context it needs, and holding the result to the same
verification bar a human contributor would face. This is an attempt at that loop, kept
small enough to read in a single sitting.

**Non-goals, explicitly:**

- No backend, database, container, auth, or CI/CD. MSW mocks the GraphQL API; nothing
  real sits behind it, and nothing needs to.
- No general-purpose agent framework. The graph is six nodes and stays six nodes —
  abstraction at this size would cost more than it returns.
- UI polish is not the target. Functional correctness against the spec is.
- No spec-specific knowledge baked into the prompts. An agent that only works on the spec
  it was tuned against is a template with extra steps; it has to produce sensible output
  for a spec it has never seen.

---

## How It's Built

**Agent stack:** Python 3.14 · uv · LangGraph · langchain-anthropic · Pydantic v2 · Rich

**Generated target stack:** React 19 + TypeScript · Vite · Apollo Client · MUI · MSW ·
Vitest + Testing Library

**Model:** `claude-opus-5` at $5.00 / 1M input tokens, $25.00 / 1M output tokens.

### Node topology

```
inspector → planner → coder ──┐                 coder ──┐
                       ↑      │ scaffold+tests    ↑      │ implementations
                       └──────┘                   └──────┘
                              ↓                          ↓
                          red_check ───────────────→ validator ⇄ fixer
                       (tests must fail here)             ↓
                                                         END   (pass, or retries exhausted)
```

| Node | File | Responsibility |
|---|---|---|
| `inspector` | `nodes.py` | Reads boilerplate contracts into context: `package.json`, `src/types.ts`, `src/mocks/handlers.ts`, `src/App.tsx` |
| `planner` | `nodes.py` | Spec → ordered `FileTask` list via Pydantic structured output |
| `coder` | `nodes.py` | Writes one file per loop iteration, advancing `current_task_index`. Prompted differently per task phase |
| `red_check` | `nodes.py` | Runs the suite once tests exist and no implementation does; reports if they wrongly pass |
| `validator` | `nodes.py` / `tools.py` | Runs `npm run typecheck`, then `npm run test` |
| `fixer` | `nodes.py` | Reads validator output, rewrites the broken file, cycles back to validator |

Routing lives in `graph.py`: `route_coding` loops the coder while tasks remain;
`route_validation` ends on pass or on exhausted retries, otherwise routes to the fixer.

### Source layout

| File | Contents |
|---|---|
| `agent/run.py` | CLI, boilerplate clone into the output dir, initial state, stream loop |
| `agent/graph.py` | `StateGraph` wiring and the two routing functions |
| `agent/nodes.py` | The five node implementations and their prompts |
| `agent/state.py` | `AgentState` TypedDict, `FileTask` / `AgentPlan` Pydantic models |
| `agent/tools.py` | File read/write and the shell-out validation suite |
| `agent/spec.txt` | Sample natural-language spec (the CLI's default input) |

---

## Key Decisions

- **LangGraph over a hand-rolled loop** — the coder→validator→fixer cycle is a state
  machine with conditional edges, which is exactly what LangGraph's routing expresses;
  writing it by hand would reimplement the same thing with less legible control flow.
- **Python + uv** — `uv` gives a locked, reproducible env in one command, and
  `langchain-anthropic` is the best-supported binding for structured output.
- **Pydantic structured output for the plan** — `AgentPlan` constrains the planner to
  emit an ordered list of `{filepath, action, description}`, so the coder loop consumes a
  typed list rather than parsing prose.
- **Boilerplate is copied into a separate output directory, not generated in place** —
  every run starts from a known-clean tree, and the source repo can't be corrupted by a
  bad run. `run.py` refuses to delete the CWD or the boilerplate source as a guard.
- **Validation shells out to the project's own scripts** (`npm run typecheck`,
  `npm run test`) rather than reimplementing checks — the agent is held to the same bar a
  human contributor would be.
- **Retry limit of 3** — bounded so a pathological failure can't burn tokens indefinitely.
- **CLI paths default relative to `agent/`** — that is the documented working directory
  (`cd agent && uv run run.py`), so `--boilerplate` defaults to `..` rather than `.`. A
  literal `.` would only be correct when running from the repo root, which would in turn
  break the `--spec spec.txt` default.
- **The fixer uses structured output, like the planner** — it previously hand-parsed
  `FILE:` / `<code>` markers out of free text, which was not merely fragile but inert:
  under adaptive thinking `response.content` is a list of blocks, so the `"FILE:" in text`
  guard was always false and the fixer silently wrote nothing on every retry of every run.
- **The fixer is given the files the validator named**, found by regexing `src/...` paths
  out of the raw output and reading them, capped at six. It diagnoses from real source
  rather than inferring a filename from an error string.
- **The fixer's chosen path is treated as untrusted** — it is the one place the model
  picks a write target, so `resolve_project_path` rejects anything resolving outside the
  output directory.
- **Work is planned test-first, and the ordering is sorted rather than trusted** — the
  planner tags each task `scaffold`, `test` or `implementation`, and `planner_node`
  stable-sorts by phase. A test emitted after its implementation is not a
  failing-test-first workflow whatever the plan claims; sorting makes the property hold
  by construction, and the stable sort preserves dependency order within each phase.
- **The red phase verifies that the tests actually fail** — without it, "test-first" is
  only a claim about ordering. A suite that passes before any implementation exists
  asserts nothing, and `red_check` says so rather than letting it go green later for the
  wrong reason.
- **The fixer is told to prefer correcting the implementation over changing a test** —
  given a failing test and a free hand, the cheapest repair is to weaken the assertion,
  which would quietly undo the point of writing it first.
- **The coder sees every file it has already written** — carried in state as
  `generated_files` and injected into each prompt, so a file's imports are checked against
  the real exports of its dependencies rather than guessed. Tests are planned last, which
  means they see every component they exercise.
- **One few-shot example, in an unused domain** — the coder prompt carries a single worked
  hook to fix the expected shape (typed result object, explicit exports). Written against
  a domain no spec will use, so it teaches structure without seeding vocabulary.
- **The inspector passes a full path manifest, not just a few files** — the planner
  cannot reuse what it cannot see. Contents are sent for the contract files (data shape,
  API surface, build/test config, entry points); everything else is listed by path. About
  2.6K tokens, repeated into every coder call, and worth it: it cut a 22-task plan that
  rebuilt the Apollo client, MSW mocks and Vite config down to 13 tasks that touch no
  boilerplate at all.
- **The planner may not emit no-op tasks** — the coder rewrites in full whatever file a
  task names, so a task concluding "leave this as-is" destroys working wiring. Files that
  already satisfy the spec are left out of the plan entirely.
- **One model constant, env-overridable** — `config.MODEL_ID` reads `ANTHROPIC_MODEL`
  and defaults to `claude-opus-5`, so the whole pipeline can be pointed at a cheaper
  model for a smoke run without editing node code.
- **Tasks carry a feature label; they are not feature-sized** — `README.md` asks for
  ordered tasks phrased as capabilities, while its next requirement mandates generating
  file by file. `FileTask.feature` satisfies both: the plan reads as an ordered feature
  sequence, each task still builds exactly one file. Rejected true feature-major slices
  (each feature run test→impl→red/green as its own unit) because that needs per-feature
  red checks and a `graph.py` rework, to restate work the phase sort already guarantees.
- **The feature order is read before the phase sort, not after** — sorting scatters each
  feature across the phases, so the order a reader should meet the features in only
  exists in the planner's original output. Captured there, used for rendering only.
- **The run log is written as it happens, not assembled at the end** — the run that most
  needs a log is the one that dies at task 9, and an end-of-run writer produces nothing
  for exactly that case. Every event is flushed to
  `agent/logs/<timestamp>_generated_logs.txt` as it is printed.
- **The console copy and the file copy differ deliberately** — full task descriptions go
  to the file, which is the artifact a reviewer reads, and are omitted from the console,
  which needs to stay scannable during a run.
- **One run log is committed, the rest are ignored** — `agent/logs/*` with a negation for
  `sample-run.txt`, so the repo carries evidence of the task decomposition without
  accumulating a near-duplicate file per run. The pattern cannot use a trailing slash:
  git will not re-include a file inside an excluded directory.
- **The status line names the next step, not the last** — `app.stream()` only yields once
  a node has finished, so reporting the completed node would leave the spinner describing
  finished work through the 30-60s call actually in flight.
- **`claude-opus-5` for every node** — the costly decisions here are planning and repair,
  not code-writing: a plan that orders a component before the hook it imports fails in a
  way no retry recovers, so paying for the call that decides beats paying for the retries
  after a bad one. Not benchmarked against a cheaper model; `ANTHROPIC_MODEL` makes that
  comparison a one-line change, and it is an admitted gap rather than a measured claim.

---

## Known Limitations

Current, as of Stage 4.5. Each is scheduled against a stage in `TICKETS.md`.

- **Every prior file is injected into every coder call.** A deliberate simplification,
  affordable because these apps are a dozen small files, and it grows quadratically. A
  larger spec would need the coder to select the files a task actually depends on rather
  than reading the whole manifest each time. Not scheduled — the limit is documented
  rather than engineered around.
- **The fixer can patch the same file twice without noticing it did not help.** Observed
  in the test-first run: it spent all three retries rewriting `useCarInventory.test.tsx`
  and never reached the eleven failing App integration tests. `last_patched_file` is in
  state but unused for this. Not yet scheduled.
- **Test-first costs roughly twice as much per run.** 449K input / 78K output against
  174K / 42K, partly real coverage (59 tests against 33) and partly the manifest
  quadratic worsening: tests are written early and then re-injected into every
  implementation call.
- **The coder ignores the `lib` target it is shown.** `tsconfig.json` is in context and
  declares `"lib": ["ES2020"]`, yet three consecutive runs reached for `Array.prototype.at`
  (ES2022). The type error names the fix in its own text, so it is a good test of whether
  the fixer works at all. → Stage 3
- **No cross-file consistency pass after generation.** Files are written one at a time and
  never reconciled as a set. This holds for this app because dependencies flow one
  direction (schema → hook → component), but a spec requiring two files to co-mutate
  shared state would need a dedicated integration step. Accepted, not scheduled.

---

## Measured Runs

Token counts and costs from real runs, recorded as they happen.

Token counts are `TBD` until `run.py` reports them (Stage 4); outcomes are recorded now.

| Date | Spec | Tasks | Input | Output | Cost | Result |
|---|---|---|---|---|---|---|
| 2026-09-02 | `spec.txt` | 11 | `TBD` | `TBD` | `TBD` | Run 5, pre-manifest. 10 files created, no boilerplate touched. App source clean, dev server 200. Tests fail on guessed imports. |
| 2026-09-02 | `spec.txt` | 11 | `TBD` | `TBD` | `TBD` | Run 6, with manifest. 18/21 tests pass. Cross-file import errors gone; 4 single-file type errors remain. |
| 2026-09-03 | `spec.txt` | 14 | 449,265 | 77,710 | $4.19 | Test-first. Red phase correct. Typecheck clean, 48/59 tests pass; fixer looped on one file. Scaffold phase edited `queries.ts` — since tightened. |
| 2026-09-02 | `spec.txt` | 11 | 174,473 | 41,710 | $1.92 | First run with cost reporting. Fixer patched two files; still failing at retry limit. |
| 2026-09-02 | `spec.txt` | 13 | `TBD` | `TBD` | `TBD` | Run 7, reference files added. **36/38 tests pass, 1 type error.** Fixer still made no edits. |
| 2026-09-03 | `spec-alt.md` | 14 | 285,395 | 57,222 | $2.86 | **Generalization run — first fully green.** Typecheck clean, 68/68 tests, dev server 200. Red phase correct. One fix cycle. Filter is by colour with a match count; the suite asserts the *absence* of model search, which only the alt spec calls for. |
| 2026-09-03 | `spec.txt` | 12 | 374,085 | 62,782 | $3.44 | Typecheck clean, 37/38 tests, dev server 200. Red phase correct. Retry limit reached: the one failure is `App.test.tsx` picking `Tesla Model 3` as its new-car fixture, which collides with the seeded mock the same file imports — `findByText(/Model 3/i)` then matches two cards. The app is correct; the assertion is ambiguous. |
| 2026-09-03 | `spec.txt` | 15 | 315,167 | 46,753 | $2.74 | **Stage 4.5 — first fully green `spec.txt` run.** Typecheck clean, 68/68 tests, dev server 200. Red phase correct, one fix cycle. Feature labels: Car listing / Search and sort / Add car form. The fixture-collision fix held — the coder chose `DeLorean DMC-12` against seeded Camry/Civic/Mustang/Model 3/X5. |
