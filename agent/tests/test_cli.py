"""Cost arithmetic, progress labels, and error localisation."""

import pytest

import config
from config import estimate_cost
from nodes import MAX_IMPLICATED_FILES, _failure_signature, _implicated_files, _usage
from run import _next_label
from tools import write_project_file


class TestEstimateCost:
    def test_prices_input_and_output_at_different_rates(self):
        """A single combined token total cannot produce a correct cost."""
        assert estimate_cost(1_000_000, 0) == pytest.approx(config.INPUT_COST_PER_MTOK)
        assert estimate_cost(0, 1_000_000) == pytest.approx(config.OUTPUT_COST_PER_MTOK)
        assert estimate_cost(1_000_000, 0) != estimate_cost(0, 1_000_000)

    def test_matches_a_real_measured_run(self):
        assert estimate_cost(315_167, 46_753) == pytest.approx(2.744, abs=0.01)

    def test_a_run_that_made_no_calls_costs_nothing(self):
        assert estimate_cost(0, 0) == 0

    def test_a_cache_read_costs_a_tenth_of_fresh_input(self):
        """Billing reads at the input rate would overstate a cached run's cost
        by most of its input."""
        assert estimate_cost(0, 0, cache_read_tokens=1_000_000) == pytest.approx(
            config.INPUT_COST_PER_MTOK * config.CACHE_READ_MULTIPLIER
        )

    def test_a_cache_write_costs_more_than_fresh_input(self):
        assert estimate_cost(0, 0, cache_write_tokens=1_000_000) == pytest.approx(
            config.INPUT_COST_PER_MTOK * config.CACHE_WRITE_MULTIPLIER
        )

    def test_reusing_a_prefix_is_cheaper_than_resending_it(self):
        """The whole point of the reorder."""
        uncached = estimate_cost(100_000, 5_000)
        cached = estimate_cost(10_000, 5_000, cache_write_tokens=0, cache_read_tokens=90_000)
        assert cached < uncached


def _msg(raw=None, rollup=None):
    return type("M", (), {
        "response_metadata": {"usage": raw} if raw is not None else {},
        "usage_metadata": rollup,
    })()


class TestUsage:
    def test_reads_the_raw_four_way_split(self):
        raw = {"input_tokens": 8, "cache_creation_input_tokens": 2008,
               "cache_read_input_tokens": 0, "output_tokens": 5}
        assert _usage(_msg(raw)) == (8, 2008, 0, 5)

    def test_prefers_raw_usage_over_langchain_rollup(self):
        """The rollup folds cached tokens into input_tokens and reports
        cache_creation as 0 — billing off it would charge reads at full rate."""
        raw = {"input_tokens": 7, "cache_creation_input_tokens": 0,
               "cache_read_input_tokens": 2008, "output_tokens": 4}
        rollup = {"input_tokens": 2015, "output_tokens": 4,
                  "input_token_details": {"cache_read": 2008, "cache_creation": 0}}
        assert _usage(_msg(raw, rollup)) == (7, 0, 2008, 4)

    def test_falls_back_to_the_rollup_when_raw_is_absent(self):
        assert _usage(_msg(rollup={"input_tokens": 10, "output_tokens": 3})) == (10, 0, 0, 3)

    def test_missing_metadata_does_not_break_the_run(self):
        """Losing a token count must never abort generation."""
        assert _usage(object()) == (0, 0, 0, 0)
        assert _usage(_msg(rollup=None)) == (0, 0, 0, 0)


class TestImplicatedFiles:
    def test_extracts_paths_the_validator_named(self, tmp_path):
        write_project_file(str(tmp_path), "src/a.ts", "const a = 1;")
        found = _implicated_files("src/a.ts(9,57): error TS2339", str(tmp_path))
        assert found == {"src/a.ts": "const a = 1;"}

    def test_ignores_paths_that_do_not_exist(self, tmp_path):
        assert _implicated_files("src/ghost.ts(1,1): error", str(tmp_path)) == {}

    def test_deduplicates_repeated_mentions(self, tmp_path):
        write_project_file(str(tmp_path), "src/a.ts", "x")
        out = "src/a.ts(1,1): error\nsrc/a.ts(2,2): error"
        assert list(_implicated_files(out, str(tmp_path))) == ["src/a.ts"]

    def test_caps_the_number_of_files_opened(self, tmp_path):
        """A cascade of errors must not blow up the prompt."""
        names = [f"src/f{i}.ts" for i in range(MAX_IMPLICATED_FILES + 4)]
        for n in names:
            write_project_file(str(tmp_path), n, "x")
        found = _implicated_files("\n".join(f"{n}(1,1): error" for n in names), str(tmp_path))
        assert len(found) == MAX_IMPLICATED_FILES


class TestNextLabel:
    def test_names_the_next_file_not_the_last(self, task):
        """app.stream yields after a node finishes, so the label looks forward."""
        plan = [task(filepath="a.ts", phase="test"), task(filepath="b.ts", phase="test")]
        assert "b.ts (2/2)" in _next_label("coder", plan, 1, False)

    def test_announces_the_red_phase_before_the_first_implementation(self, task):
        plan = [task(phase="test"), task(phase="implementation")]
        assert "Red phase" in _next_label("coder", plan, 1, False)

    def test_announces_the_install_once_the_plan_is_done(self, task):
        """Otherwise this is a multi-minute silence with no explanation."""
        plan = [task(phase="test")]
        assert "Installing dependencies" in _next_label("coder", plan, 1, False)

    def test_validator_and_fixer_describe_the_step_ahead(self, task):
        plan = [task()]
        assert "Diagnosing" in _next_label("validator", plan, 0, True)
        assert "Re-running" in _next_label("fixer", plan, 0, True)

    def test_never_indexes_past_the_plan(self, task):
        """A crash in the progress line would take down a paid run."""
        assert _next_label("coder", [task()], 99, True)
        assert _next_label("coder", [], 0, False)


class TestFailureSignature:
    """Whether a repair helped, judged without run-to-run noise."""

    def test_identical_failures_share_a_signature(self):
        a = "src/a.ts(9,5): error TS2339: x\n Duration 3.26s"
        b = "src/a.ts(9,5): error TS2339: x\n Duration 4.91s"
        assert _failure_signature(a) == _failure_signature(b)

    def test_a_different_file_changes_the_signature(self):
        assert _failure_signature("src/a.ts(1,1): error TS2339") != \
               _failure_signature("src/b.ts(1,1): error TS2339")

    def test_a_different_error_code_changes_the_signature(self):
        """Same file, new code means the last fix did move something."""
        assert _failure_signature("src/a.ts(1,1): error TS2339") != \
               _failure_signature("src/a.ts(1,1): error TS2739")

    def test_fewer_failing_files_changes_the_signature(self):
        two = "src/a.ts(1,1): error TS1234\nsrc/b.ts(1,1): error TS1234"
        assert _failure_signature(two) != _failure_signature("src/a.ts(1,1): error TS1234")
