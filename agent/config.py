import os

MODEL_ID = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")

# USD per million tokens; input and output are priced asymmetrically.
INPUT_COST_PER_MTOK = float(os.getenv("ANTHROPIC_INPUT_COST_PER_MTOK", "5.00"))
OUTPUT_COST_PER_MTOK = float(os.getenv("ANTHROPIC_OUTPUT_COST_PER_MTOK", "25.00"))


# Cached input is not billed at the input rate: writing an entry costs more than
# a plain token, reading one costs far less.
CACHE_WRITE_MULTIPLIER = 1.25
CACHE_READ_MULTIPLIER = 0.10


def estimate_cost(
    input_tokens: int,
    output_tokens: int,
    cache_write_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> float:
    """USD for a run at the configured rates.

    `input_tokens` is uncached input only. Pricing a cache read at the full input
    rate would overstate a run's cost by most of its input.
    """
    billable_input = (
        input_tokens
        + cache_write_tokens * CACHE_WRITE_MULTIPLIER
        + cache_read_tokens * CACHE_READ_MULTIPLIER
    )
    return (
        billable_input / 1_000_000 * INPUT_COST_PER_MTOK
        + output_tokens / 1_000_000 * OUTPUT_COST_PER_MTOK
    )
