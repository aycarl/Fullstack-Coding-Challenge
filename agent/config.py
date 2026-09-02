import os

# Model used by every node in the pipeline. Override with ANTHROPIC_MODEL to run
# against a different or cheaper model without touching node code.
MODEL_ID = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")

# Published rates for the default model, in USD per million tokens. Input and
# output are priced asymmetrically, so they must be counted separately — a single
# combined token total cannot produce a cost.
INPUT_COST_PER_MTOK = float(os.getenv("ANTHROPIC_INPUT_COST_PER_MTOK", "5.00"))
OUTPUT_COST_PER_MTOK = float(os.getenv("ANTHROPIC_OUTPUT_COST_PER_MTOK", "25.00"))


def estimate_cost(input_tokens: int, output_tokens: int) -> float:
    """USD for a run at the configured rates."""
    return (
        input_tokens / 1_000_000 * INPUT_COST_PER_MTOK
        + output_tokens / 1_000_000 * OUTPUT_COST_PER_MTOK
    )
