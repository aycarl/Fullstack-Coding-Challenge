"""The graph's control flow and retry predicate.

These two functions decide every transition the agent makes, so they are the
highest-value pure code in the project.
"""

import pytest
from langgraph.graph import END

from graph import _is_transient, route_coding, route_validation
import nodes
from nodes import _writable_targets


def _state(plan, idx=0, red_checked=False):
    return {"plan": plan, "current_task_index": idx, "red_checked": red_checked}


class TestRouteCoding:
    def test_keeps_coding_while_tasks_remain(self, task):
        plan = [task(phase="test"), task(phase="test")]
        assert route_coding(_state(plan, idx=0)) == "coder"

    def test_validates_once_the_plan_is_exhausted(self, task):
        plan = [task(phase="test")]
        assert route_coding(_state(plan, idx=1)) == "validator"

    def test_red_checks_before_the_first_implementation(self, task):
        plan = [task(phase="test"), task(phase="implementation")]
        assert route_coding(_state(plan, idx=1)) == "red_check"

    def test_red_check_happens_once_only(self, task):
        """Having run, the graph must not loop back into it on every later task."""
        plan = [task(phase="implementation"), task(phase="implementation")]
        assert route_coding(_state(plan, idx=0, red_checked=True)) == "coder"

    def test_exhausted_plan_wins_over_red_check(self, task):
        """An index past the end must not be used to look up a task."""
        plan = [task(phase="implementation")]
        assert route_coding(_state(plan, idx=1, red_checked=False)) == "validator"

    def test_scaffold_and_test_phases_never_trigger_red_check(self, task):
        for phase in ("scaffold", "test"):
            plan = [task(phase=phase)]
            assert route_coding(_state(plan, idx=0)) == "coder"


class TestRouteValidation:
    def test_passing_ends_the_run(self):
        assert route_validation({"is_passing": True, "retries": 0, "max_retries": 3}) is END

    def test_failure_with_budget_left_goes_to_the_fixer(self):
        assert route_validation({"is_passing": False, "retries": 1, "max_retries": 3}) == "fixer"

    def test_exhausted_retries_end_the_run(self):
        assert route_validation({"is_passing": False, "retries": 3, "max_retries": 3}) is END

    def test_budget_is_not_exceeded(self):
        """Guards against `>` where `>=` was meant, which would allow an extra cycle."""
        assert route_validation({"is_passing": False, "retries": 4, "max_retries": 3}) is END


class TestIsTransient:
    @pytest.mark.parametrize("status", [429, 500, 503, 529])
    def test_retries_overload_and_rate_limits(self, api_error, status):
        assert _is_transient(api_error("status", status)) is True

    @pytest.mark.parametrize("status", [400, 401, 403, 404, 422])
    def test_does_not_retry_client_errors(self, api_error, status):
        """Retrying a bad request just repeats it slowly four more times."""
        assert _is_transient(api_error("status", status)) is False

    @pytest.mark.parametrize("kind", ["connection", "timeout"])
    def test_retries_network_faults(self, api_error, kind):
        assert _is_transient(api_error(kind)) is True

    def test_does_not_retry_ordinary_bugs(self):
        """The reason this predicate exists: LangGraph's default retries these."""
        assert _is_transient(KeyError("plan")) is False
        assert _is_transient(ValueError("bad")) is False


class TestWritableTargets:
    """The fixer gets two attempts; it must not spend both on the same file."""

    def test_all_files_offered_when_nothing_has_failed_yet(self):
        targets, exhausted = _writable_targets({"src/a.ts": "", "src/b.ts": ""}, [])
        assert targets == ["src/a.ts", "src/b.ts"]
        assert exhausted == []

    def test_a_file_that_did_not_help_is_withdrawn(self):
        targets, exhausted = _writable_targets({"src/a.ts": "", "src/b.ts": ""}, ["src/a.ts"])
        assert targets == ["src/b.ts"]
        assert exhausted == ["src/a.ts"]

    def test_everything_exhausted_falls_back_rather_than_offering_nothing(self):
        """A fixer with no legal target writes nothing at all, which is worse."""
        targets, exhausted = _writable_targets({"src/a.ts": ""}, ["src/a.ts"])
        assert targets == ["src/a.ts"]
        assert exhausted == ["src/a.ts"]

    def test_unrelated_history_does_not_withdraw_anything(self):
        targets, _ = _writable_targets({"src/a.ts": ""}, ["src/other.ts"])
        assert targets == ["src/a.ts"]


class TestValidatorDetectsUnhelpfulFixes:
    """The validator is what notices a repair changed nothing."""

    def _state(self, **over):
        base = dict(target_dir="/tmp/x", installed=True, retries=1, max_retries=3,
                    last_patched_file=None, last_failure_signature=None, unhelpful_fixes=[])
        return {**base, **over}

    def _fail_with(self, monkeypatch, output):
        monkeypatch.setattr(nodes, "run_validation_suite", lambda _d: (False, output))

    def test_records_a_file_whose_rewrite_changed_nothing(self, monkeypatch):
        out = "src/a.ts(1,1): error TS2339"
        self._fail_with(monkeypatch, out)
        result = nodes.validator_node(self._state(
            last_patched_file="src/a.ts",
            last_failure_signature=nodes._failure_signature(out),
        ))
        assert result["unhelpful_fixes"] == ["src/a.ts"]

    def test_a_fix_that_moved_the_error_is_not_recorded(self, monkeypatch):
        self._fail_with(monkeypatch, "src/b.ts(1,1): error TS2739")
        result = nodes.validator_node(self._state(
            last_patched_file="src/a.ts",
            last_failure_signature=nodes._failure_signature("src/a.ts(1,1): error TS2339"),
        ))
        assert "unhelpful_fixes" not in result

    def test_the_first_failure_records_nothing(self, monkeypatch):
        """Nothing has been patched yet, so nothing can have failed to help."""
        self._fail_with(monkeypatch, "src/a.ts(1,1): error TS2339")
        result = nodes.validator_node(self._state())
        assert "unhelpful_fixes" not in result
        assert result["last_failure_signature"]

    def test_passing_validation_records_no_signature(self, monkeypatch):
        monkeypatch.setattr(nodes, "run_validation_suite", lambda _d: (True, "ok"))
        result = nodes.validator_node(self._state(last_patched_file="src/a.ts"))
        assert result["is_passing"] is True
        assert "unhelpful_fixes" not in result
