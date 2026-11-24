from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]


@pytest.fixture
def demo() -> Path:
    """The Pfam and Rfam snapshots of the JavaScript demo."""
    return REPO / "demo" / "public"


@pytest.fixture
def repo() -> Path:
    return REPO
