"""Schemas and the test-first ordering property."""

import json

import pytest
from pydantic import ValidationError

from nodes import PHASE_ORDER
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
