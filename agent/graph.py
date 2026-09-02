from langgraph.graph import StateGraph, END
from state import AgentState
from nodes import inspector_node, planner_node, coder_node, validator_node, fixer_node

def route_coding(state: AgentState) -> str:
    if state["current_task_index"] < len(state["plan"]):
        return "coder"
    return "validator"

def route_validation(state: AgentState) -> str:
    if state["is_passing"]:
        return END
    if state["retries"] >= state["max_retries"]:
        return END
    return "fixer"

def build_graph():
    workflow = StateGraph(AgentState)
    
    workflow.add_node("inspector", inspector_node)
    workflow.add_node("planner", planner_node)
    workflow.add_node("coder", coder_node)
    workflow.add_node("validator", validator_node)
    workflow.add_node("fixer", fixer_node)
    
    workflow.set_entry_point("inspector")
    workflow.add_edge("inspector", "planner")
    workflow.add_edge("planner", "coder")
    
    workflow.add_conditional_edges("coder", route_coding, {"coder": "coder", "validator": "validator"})
    workflow.add_conditional_edges("validator", route_validation, {END: END, "fixer": "fixer"})
    workflow.add_edge("fixer", "validator")
    
    return workflow.compile()
