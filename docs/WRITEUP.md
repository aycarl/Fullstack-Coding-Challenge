# Write-up

Model choice, cost, and tradeoffs. Setup and the full architecture are in the
[root README](../README.md); decisions and limitations in [`PROJECT.md`](PROJECT.md).

---

## Which model, and why

**`claude-opus-5`** — $5.00 / 1M in, $25.00 / 1M out.

The expensive parts of this agent aren't the code-writing calls. They're **planning** and
**repair** — single reasoning-heavy decisions where being wrong costs the whole run. A plan
that orders a component before the hook it imports produces a cascade no retry recovers,
and a fixer that misdiagnoses burns one of only two repair attempts. Paying for the call
that decides beats paying for the retries after a bad one.

Two specific reasons:

- **Structured output.** Both decisions are schema-constrained (`AgentPlan`, `FixResult`)
  rather than parsed from prose. An earlier fixer hand-split on `FILE:` markers; under
  adaptive thinking `response.content` is a list of blocks, so the guard was always false
  and the fixer silently wrote nothing on every retry of every run. Schema enforcement made
  that class of bug impossible.
- **Context headroom.** The coder sees every file it has already written, so input grows
  through a run — 5,127 tokens on the first coder call, 30,347 on the last.

**Caveat:** I did not benchmark a cheaper model. `ANTHROPIC_MODEL` makes that a one-line
change — I just haven't run it, and I'd rather say so than imply a measurement I didn't take.

---

## Architecture

Six nodes on a LangGraph state machine. LangGraph earns its place because
coder → validator → fixer genuinely is a state machine with conditional edges.

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

Per-node responsibilities are tabulated in [`PROJECT.md`](PROJECT.md#nodes).

---

## Cost per run

| Spec | Tasks | Input | Output | Cost | Result |
|---|---|---|---|---|---|
| `spec.txt` | 15 | 315,167 | 46,753 | **$2.74** | 68/68, typecheck clean, dev 200 |
| `spec-alt.md` | 14 | 285,395 | 57,222 | **$2.86** | 68/68, typecheck clean, dev 200 |

**~$2.75–$3.00 for a clean run**; $1.92–$4.19 across every measured run including failures.
Failed runs cost *more*, not less — each retry is another planner-grade call.

Input dominates output ~6:1. That's the manifest: every file written is re-injected into
the next call.

---

## What worked

- **Showing the coder its own output.** Before this, files were generated blind and
  components imported names their hooks didn't export. Eliminated that class of failure.
- **Showing the planner the whole boilerplate.** Cut a 22-task plan that rebuilt the Apollo
  client, MSW mocks and Vite config down to 13 touching none of it. The final run modifies
  exactly one provided file, `App.tsx`.
- **Test-first, verified.** Sorting by phase makes ordering true by construction;
  `red_check` then proves the tests actually fail, so "test-first" isn't just a claim.
- **Retrying only what's worth retrying.** A single 529 had previously aborted a 12-task
  run at task 9 and discarded everything before it.
- **Prompting against observed failures.** Every negative constraint exists because a run
  failed that way — no no-op tasks, no domain nouns, no fixture colliding with seeded mocks.

## What I'd improve

1. **Stop the fixer re-patching a file that didn't help.** It can spend its whole budget
   rewriting one file without noticing the failure is unchanged. `last_patched_file` is
   already in state. Highest-value fix.
2. **Select context instead of injecting all of it.** The manifest is quadratic.
3. **Test the agent itself.** It holds generated code to a bar it doesn't meet — the
   weakest part of this submission.
4. **Lock the output directory.** Two concurrent runs silently corrupt each other; this
   cost a real run mid-validation during development.
5. **Per-feature red/green slices.** Tasks carry a feature label but execute phase-major.

---

## Known limitations

- **No cross-file consistency pass.** Files are written one at a time and never reconciled
  as a set. This holds here because dependencies flow one direction — schema → hook →
  component — so each file only needs to be correct against files already written. A spec
  requiring two files to co-mutate shared state would need a dedicated integration step,
  and this agent doesn't have one.
- **Feature labels are the planner's judgement, not derived fact.** One run filed
  `CarGallery` under *Search* and `App.tsx` under *Add car form*. Defensible, not exact.
  The phase ordering is the part that's guaranteed.
- **Output quality is bounded by the spec.** No domain knowledge in the prompts, so
  anything the spec doesn't ask for doesn't get built. Verified against
  [`spec-alt.md`](../agent/spec-alt.md): the output filters by colour, shows a match count,
  and its tests assert the *absence* of model search — a negative requirement read out of
  prose. Neither run's output mentions the other's domain.
