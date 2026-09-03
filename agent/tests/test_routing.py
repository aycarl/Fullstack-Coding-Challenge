"""The graph's control flow and retry predicate.

These two functions decide every transition the agent makes, so they are the
highest-value pure code in the project.
"""

import pytest
from langgraph.graph import END

from graph import _is_transient, route_coding, route_validation


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
