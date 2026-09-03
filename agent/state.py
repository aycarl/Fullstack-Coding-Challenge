import json
from typing import Any, Dict, List, Literal, Optional, TypedDict
from pydantic import BaseModel, Field, field_validator

class FileTask(BaseModel):
    filepath: str = Field(description="Relative path to file")
    action: str = Field(description="'create' or 'modify'")
    feature: str = Field(
        default="",
        description=(
            "Short user-facing capability this file serves, drawn from the "
            "specification, e.g. 'Car listing', 'Search', 'Add car form'. Every "
            "task serving one capability carries the same label."
        ),
    )
    phase: Literal["scaffold", "test", "implementation"] = Field(
        description=(
            "'scaffold' for shared contracts the tests import, 'test' for a test "
            "written before the code it exercises, 'implementation' for code "
            "written to satisfy an existing test"
        )
    )
    description: str = Field(description="Purpose of this task and requirements")

class AgentPlan(BaseModel):
    tasks: List[FileTask] = Field(description="Ordered list of implementation tasks")

    @field_validator("tasks", mode="before")
    @classmethod
    def _accept_json_string(cls, value: Any) -> Any:
        """Tolerate the model serializing the task array as a JSON string.

        Observed once in three planner calls before the planner moved to
        json_schema structured output. Cheap insurance: a hard ValidationError
        here loses the whole run.
        """
        if isinstance(value, str):
            return json.loads(value)
        return value

class FixResult(BaseModel):
    filepath: str = Field(
        description="Relative path of the single file to rewrite, e.g. src/components/Foo.tsx"
    )
    corrected_content: str = Field(
        description="Complete corrected contents of that file, with no markdown fences"
    )


class AgentState(TypedDict):
    spec: str
    target_dir: str
    boilerplate_context: str
    plan: List[FileTask]
    # Feature labels in the order the planner introduced them, captured before
    # the phase sort scatters them. Execution is phase-major; only the rendered
    # plan is grouped by feature.
    feature_order: List[str]
    current_task_index: int
    validation_output: Optional[str]
    is_passing: bool
    retries: int
    max_retries: int
    input_tokens: int
    output_tokens: int
    # npm install succeeded once; the retry loop must not repeat it every cycle.
    installed: bool
    # Path the fixer rewrote on the last cycle, or None if it could not act.
    last_patched_file: Optional[str]
    # Result of running the suite after the tests exist but before any code does.
    red_checked: bool
    red_is_failing: bool
    red_output: Optional[str]
    # filepath -> content for every file written so far this run, so each coder
    # call can see the real exports of the files it is about to import from.
    generated_files: Dict[str, str]
