from typing import List, Optional, TypedDict
from pydantic import BaseModel, Field

class FileTask(BaseModel):
    filepath: str = Field(description="Relative path to file")
    action: str = Field(description="'create' or 'modify'")
    description: str = Field(description="Purpose of this task and requirements")

class AgentPlan(BaseModel):
    tasks: List[FileTask] = Field(description="Ordered list of implementation tasks")

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
