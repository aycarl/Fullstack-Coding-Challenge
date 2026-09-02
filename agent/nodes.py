from pathlib import Path
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage, HumanMessage
from config import MODEL_ID
from state import AgentState, AgentPlan
from tools import write_project_file, read_project_file, run_validation_suite

llm = ChatAnthropic(model_name=MODEL_ID)


def inspector_node(state: AgentState) -> dict:
    target = Path(state["target_dir"])
    key_files = ["package.json", "src/types.ts", "src/mocks/handlers.ts", "src/App.tsx"]
    context_chunks = []

    for rel_path in key_files:
        f = target / rel_path
        if f.exists():
            context_chunks.append(
                f"--- File: {rel_path} ---\n{f.read_text(encoding='utf-8')}"
            )

    return {"boilerplate_context": "\n\n".join(context_chunks)}


def planner_node(state: AgentState) -> dict:
    structured_llm = llm.with_structured_output(AgentPlan)
    prompt = f"""You are a principal frontend architect planning an implementation.

Boilerplate the generated code must fit into:
{state['boilerplate_context']}

Product specification:
{state['spec']}

Decompose this specification into an ordered list of file-level tasks. Every
requirement stated in the specification must be covered by at least one task,
and no task may introduce a requirement the specification does not state.

Order the tasks so that a file is always written after everything it depends on:

1. Data and schema definitions — types, API queries and mutations
2. Hooks and other logic that consume those definitions
3. Presentational components, leaf components before the components that compose them
4. Integration into the application entry point
5. Tests for the units above

Each task covers exactly one file. Reuse the boilerplate's existing paths, import
aliases and conventions, and prefer extending an existing file over creating a
parallel one beside it. In each task description, state the exported API of that
file — the names and signatures other files will import — so that later tasks can
depend on it correctly.

Output ONLY the structured plan."""

    plan_result = structured_llm.invoke([HumanMessage(content=prompt)])
    return {"plan": plan_result.tasks, "current_task_index": 0}


def coder_node(state: AgentState) -> dict:
    idx = state["current_task_index"]
    task = state["plan"][idx]

    existing_content = read_project_file(state["target_dir"], task.filepath)

    prompt = f"""You are generating application code for: {task.filepath}
        Task Purpose: {task.description}

        Project Context & Types:
        {state['boilerplate_context']}

        Existing file content (if any):
        {existing_content}

        Write the full, complete production code for this file. 
        Return ONLY the raw code for the file without markdown code fences or conversational prose."""

    response = llm.invoke(
        [
            SystemMessage(
                content="You are an expert React 19 + TypeScript + Apollo Client developer."
            ),
            HumanMessage(content=prompt),
        ]
    )

    clean_code = response.text.strip()
    if clean_code.startswith("```"):
        clean_code = "\n".join(clean_code.split("\n")[1:-1])

    write_project_file(state["target_dir"], task.filepath, clean_code)

    tokens = (
        response.usage_metadata.get("total_tokens", 0) if response.usage_metadata else 0
    )
    return {
        "current_task_index": idx + 1,
        "total_tokens": state["total_tokens"] + tokens,
    }


def validator_node(state: AgentState) -> dict:
    passed, output = run_validation_suite(state["target_dir"])
    return {
        "is_passing": passed,
        "validation_output": output,
        "retries": state["retries"] + (0 if passed else 1),
    }


def fixer_node(state: AgentState) -> dict:
    prompt = f"""The application build or tests failed with errors:
        {state['validation_output']}

        Review the error carefully. Identify which file caused this issue, generate the entire corrected file content, 
        and format your response as:
        FILE: <relative_path>
        <code>
        <full file contents>
        </code>
    """

    response = llm.invoke(
        [
            SystemMessage(
                content="You fix TypeScript and Vitest errors with precision."
            ),
            HumanMessage(content=prompt),
        ]
    )

    text = response.content
    if "FILE:" in text and "<code>" in text:
        header, code_block = text.split("<code>", 1)
        filepath = header.split("FILE:")[1].strip()
        code = code_block.split("</code>")[0].strip()
        write_project_file(state["target_dir"], filepath, code)

    tokens = (
        response.usage_metadata.get("total_tokens", 0) if response.usage_metadata else 0
    )
    return {"total_tokens": state["total_tokens"] + tokens}
