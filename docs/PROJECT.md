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
- No general-purpose agent framework. The graph is five nodes and stays five nodes —
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
inspector → planner → coder ──┐
                       ↑      │ (loops until plan exhausted)
                       └──────┘
                              ↓
                          validator ⇄ fixer
                              ↓
                             END        (pass, or retries exhausted)
```

| Node | File | Responsibility |
|---|---|---|
| `inspector` | `nodes.py` | Reads boilerplate contracts into context: `package.json`, `src/types.ts`, `src/mocks/handlers.ts`, `src/App.tsx` |
| `planner` | `nodes.py` | Spec → ordered `FileTask` list via Pydantic structured output |
| `coder` | `nodes.py` | Writes one file per loop iteration, advancing `current_task_index` |
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
- **Model choice rationale:** `TBD` (Stage 5).

---

## Known Limitations

Current, as of Stage 0. Each is scheduled against a stage in `TICKETS.md`.

- **The coder is blind to its own prior output.** Each file is generated in isolation, so
  a component cannot know what the hook it imports actually exports. → Stage 2
- **The validator never runs `npm install`.** A freshly copied output directory has no
  `node_modules`, so the first validation fails for the wrong reason. → Stage 3
- **The fixer hand-parses `FILE:` / `<code>` markers** from free text — fragile, and
  inconsistent with the planner, which already uses structured output. → Stage 3
- **The fixer has no error localization.** It infers the broken file from raw error text
  instead of reading the paths out of the validator output and loading those files. → Stage 3
- **Cost is not measurable.** `run.py` accumulates a single `total_tokens` figure and
  never prints it. At $5 in / $25 out per 1M, a combined total cannot produce a cost
  estimate; input and output must be tracked separately. → Stage 4
- **No end-to-end run has been performed yet.** No sample generated output is committed,
  and no real token or cost figures exist. → Stage 4
- **No cross-file consistency pass after generation.** Files are written one at a time and
  never reconciled as a set. This holds for this app because dependencies flow one
  direction (schema → hook → component), but a spec requiring two files to co-mutate
  shared state would need a dedicated integration step. Accepted, not scheduled.

---

## Measured Runs

Token counts and costs from real runs, recorded as they happen.

| Date | Spec | Input tokens | Output tokens | Est. cost | Result |
|---|---|---|---|---|---|
| — | — | — | — | — | `TBD` (Stage 4) |
