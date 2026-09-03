from anthropic import APIConnectionError, APIStatusError, APITimeoutError
from langgraph.graph import StateGraph, END
from langgraph.types import RetryPolicy
from state import AgentState
from nodes import (
    inspector_node,
    planner_node,
    coder_node,
    red_check_node,
    validator_node,
    fixer_node,
)



def _is_transient(exc: BaseException) -> bool:
    """Retry overload, rate limiting and network faults; fail fast on real bugs.

    Narrower than LangGraph's default, which retries anything it does not
    recognise and so turns one genuine bug into five slow identical failures.
    """
    if isinstance(exc, (APIConnectionError, APITimeoutError)):
        return True
    if isinstance(exc, APIStatusError):
        return exc.status_code == 429 or exc.status_code >= 500
    return False


# One sequential LLM call per planned file, over many minutes: a single 529 once
# aborted a 12-task run at task 9 and discarded every file it had generated.
LLM_RETRY = RetryPolicy(
    max_attempts=5,
    initial_interval=2.0,
    backoff_factor=2.0,
    max_interval=60.0,
    jitter=True,
    retry_on=_is_transient,
)

def route_coding(state: AgentState) -> str:
    idx = state["current_task_index"]
    plan = state["plan"]
    if idx >= len(plan):
        return "validator"
    if not state["red_checked"] and plan[idx].phase == "implementation":
        return "red_check"
    return "coder"

def route_validation(state: AgentState) -> str:
    if state["is_passing"]:
        return END
    if state["retries"] >= state["max_retries"]:
        return END
    return "fixer"

def build_graph():
    workflow = StateGraph(AgentState)
    
    workflow.add_node("inspector", inspector_node)
    workflow.add_node("planner", planner_node, retry_policy=LLM_RETRY)
    workflow.add_node("coder", coder_node, retry_policy=LLM_RETRY)
    workflow.add_node("red_check", red_check_node)
    workflow.add_node("validator", validator_node)
    workflow.add_node("fixer", fixer_node, retry_policy=LLM_RETRY)
    
    workflow.set_entry_point("inspector")
    workflow.add_edge("inspector", "planner")
    workflow.add_edge("planner", "coder")
    
    workflow.add_conditional_edges(
        "coder",
        route_coding,
        {"coder": "coder", "red_check": "red_check", "validator": "validator"},
    )
    workflow.add_edge("red_check", "coder")
    workflow.add_conditional_edges("validator", route_validation, {END: END, "fixer": "fixer"})
    workflow.add_edge("fixer", "validator")
    
    return workflow.compile()
