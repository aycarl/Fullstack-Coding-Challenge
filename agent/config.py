import os

# Model used by every node in the pipeline. Override with ANTHROPIC_MODEL to run
# against a different or cheaper model without touching node code.
MODEL_ID = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")
