import json
from typing import Any, Dict, List, Optional, TypedDict
from pydantic import BaseModel, Field, field_validator

class FileTask(BaseModel):
    filepath: str = Field(description="Relative path to file")
    action: str = Field(description="'create' or 'modify'")
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

class AgentState(TypedDict):
    spec: str
    target_dir: str
    boilerplate_context: str
    plan: List[FileTask]
    current_task_index: int
    validation_output: Optional[str]
    is_passing: bool
    retries: int
    max_retries: int
    total_tokens: int
    # filepath -> content for every file written so far this run, so each coder
    # call can see the real exports of the files it is about to import from.
    generated_files: Dict[str, str]
