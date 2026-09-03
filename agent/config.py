import os

MODEL_ID = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")

# USD per million tokens; input and output are priced asymmetrically.
INPUT_COST_PER_MTOK = float(os.getenv("ANTHROPIC_INPUT_COST_PER_MTOK", "5.00"))
OUTPUT_COST_PER_MTOK = float(os.getenv("ANTHROPIC_OUTPUT_COST_PER_MTOK", "25.00"))


def estimate_cost(input_tokens: int, output_tokens: int) -> float:
    """USD for a run at the configured rates."""
    return (
        input_tokens / 1_000_000 * INPUT_COST_PER_MTOK
        + output_tokens / 1_000_000 * OUTPUT_COST_PER_MTOK
    )
