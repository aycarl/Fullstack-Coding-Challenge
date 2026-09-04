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

        Cheap insurance: a ValidationError here loses the whole run.
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
    # Captured before the phase sort scatters each feature across the phases.
    feature_order: List[str]
    current_task_index: int
    validation_output: Optional[str]
    is_passing: bool
    retries: int
    max_retries: int
    input_tokens: int
    output_tokens: int
    # Cached prefix reuse, tracked separately because it is priced differently.
    cache_write_tokens: int
    cache_read_tokens: int
    # npm install succeeded once; the retry loop must not repeat it every cycle.
    installed: bool
    last_patched_file: Optional[str]
    # Fingerprint of the last failing validation, so the next one can tell
    # whether the fix in between changed anything at all.
    last_failure_signature: Optional[str]
    # Files the fixer rewrote without moving the failure; not worth a second go.
    unhelpful_fixes: List[str]
    # Result of running the suite after the tests exist but before any code does.
    red_checked: bool
    red_is_failing: bool
    red_output: Optional[str]
    # filepath -> content, so each coder call sees the real exports it imports from.
    generated_files: Dict[str, str]
