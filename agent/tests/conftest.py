"""Shared fixtures.

`nodes.py` constructs the client at import time, so a key must exist before any
test module is imported. Nothing here reaches the network — every test targets a
pure function.
"""

import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-not-used")

import httpx
import pytest
from anthropic import APIConnectionError, APIStatusError, APITimeoutError

from state import FileTask


@pytest.fixture
def task():
    """Build a FileTask with only the fields a test cares about."""
    def _make(filepath="src/x.ts", phase="implementation", feature="Listing", action="create"):
        return FileTask(
            filepath=filepath, action=action, phase=phase,
            feature=feature, description="d",
        )
    return _make


def _request():
    return httpx.Request("POST", "https://api.anthropic.com/v1/messages")


@pytest.fixture
def api_error():
    """Construct the anthropic error types the retry predicate discriminates on."""
    def _make(kind, status=500):
        if kind == "status":
            return APIStatusError("boom", response=httpx.Response(status, request=_request()), body=None)
        if kind == "connection":
            return APIConnectionError(request=_request())
        if kind == "timeout":
            return APITimeoutError(request=_request())
        raise ValueError(kind)
    return _make
