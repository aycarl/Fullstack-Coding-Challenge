"""Schemas and the test-first ordering property."""

import json

import pytest
from pydantic import ValidationError

from nodes import PHASE_ORDER, _coder_content
from state import AgentPlan, FileTask, FixResult


class TestFileTask:
    def test_feature_defaults_rather_than_raising(self):
        """A hard failure here would discard a whole plan over a missing label."""
        assert FileTask(filepath="a.ts", action="create", phase="test", description="d").feature == ""

    def test_phase_is_constrained(self):
        with pytest.raises(ValidationError):
            FileTask(filepath="a.ts", action="create", phase="refactor", description="d")


class TestAgentPlan:
    def test_accepts_a_normal_task_list(self):
        plan = AgentPlan(tasks=[{"filepath": "a.ts", "action": "create", "phase": "test", "description": "d"}])
        assert len(plan.tasks) == 1

    def test_tolerates_a_json_encoded_task_array(self):
        """Observed from the model before structured output was constrained."""
        raw = json.dumps([{"filepath": "a.ts", "action": "create", "phase": "test", "description": "d"}])
        assert len(AgentPlan(tasks=raw).tasks) == 1


class TestPhaseOrdering:
    """Test-first is guaranteed by sorting, not by trusting the planner."""

    def _sorted(self, tasks):
        return sorted(tasks, key=lambda t: PHASE_ORDER.get(t.phase, 2))

    def test_no_test_follows_an_implementation(self, task):
        worst_case = [
            task(filepath="impl.ts", phase="implementation"),
            task(filepath="spec.ts", phase="test"),
            task(filepath="types.ts", phase="scaffold"),
        ]
        phases = [t.phase for t in self._sorted(worst_case)]
        assert phases == ["scaffold", "test", "implementation"]

    def test_order_within_a_phase_is_preserved(self, task):
        """Dependency order inside a phase is real; the sort must be stable."""
        tasks = [task(filepath=f"{n}.ts", phase="implementation") for n in "abc"]
        assert [t.filepath for t in self._sorted(tasks)] == ["a.ts", "b.ts", "c.ts"]

    def test_an_unknown_phase_sorts_last_rather_than_crashing(self, task):
        t = task(phase="test")
        object.__setattr__(t, "phase", "mystery")
        assert PHASE_ORDER.get(t.phase, 2) == 2


class TestFixResult:
    def test_requires_both_a_path_and_full_contents(self):
        with pytest.raises(ValidationError):
            FixResult(filepath="src/a.ts")


class TestCoderContentIsCacheable:
    """Caching is a prefix match, so block order is load-bearing."""

    def _content(self, generated, task):
        return _coder_content("CONTRACTS", generated, task, "guidance", "existing")

    def test_stable_first_volatile_last(self, task):
        blocks = self._content({}, task(filepath="src/a.ts"))
        assert "CONTRACTS" in blocks[0]["text"]
        assert "Files already generated" in blocks[1]["text"]
        assert "src/a.ts" in blocks[-1]["text"]

    def test_only_the_reusable_blocks_are_marked(self, task):
        blocks = self._content({}, task())
        assert "cache_control" in blocks[0]
        assert "cache_control" not in blocks[-1], "the task block differs every call"

    def test_the_task_never_leaks_into_the_cached_prefix(self, task):
        """A filepath in block 0 or 1 would break the prefix on every call."""
        blocks = self._content({}, task(filepath="src/unique-name.ts"))
        for block in blocks[:-1]:
            assert "unique-name" not in block["text"]

    def test_the_stable_block_is_identical_across_tasks(self, task):
        a = self._content({}, task(filepath="src/a.ts"))[0]["text"]
        b = self._content({"src/a.ts": "x"}, task(filepath="src/b.ts"))[0]["text"]
        assert a == b

    def test_the_newest_file_is_split_into_its_own_block(self, task):
        blocks = self._content({"src/a.ts": "aaa", "src/b.ts": "bbb"}, task())
        assert "aaa" in blocks[1]["text"] and "bbb" not in blocks[1]["text"]
        assert "bbb" in blocks[2]["text"]

    def test_this_calls_settled_block_matches_the_last_calls_whole_manifest(self, task):
        """The property the whole split exists for.

        A cache entry is reused only when its boundary lands on a breakpoint in
        the next request. Call N's settled block must therefore be byte-identical
        to call N-1's two manifest blocks joined — separator included.
        """
        prev = self._content({"a.ts": "1", "b.ts": "2"}, task())
        curr = self._content({"a.ts": "1", "b.ts": "2", "c.ts": "3"}, task())
        prev_manifest = prev[1]["text"] + prev[2]["text"]
        assert curr[1]["text"] == prev_manifest

    def test_the_split_holds_from_the_second_file_onward(self, task):
        """The one-file case has no settled portion to carry forward."""
        prev = self._content({"a.ts": "1"}, task())
        curr = self._content({"a.ts": "1", "b.ts": "2"}, task())
        assert curr[1]["text"] == prev[1]["text"]

    def test_every_manifest_block_is_marked_reusable(self, task):
        blocks = self._content({"a.ts": "1", "b.ts": "2"}, task())
        assert all("cache_control" in b for b in blocks[1:-1])

    def test_at_most_four_breakpoints(self, task):
        """The API rejects a fifth."""
        many = {f"f{i}.ts": str(i) for i in range(12)}
        blocks = self._content(many, task())
        assert sum("cache_control" in b for b in blocks) <= 4
