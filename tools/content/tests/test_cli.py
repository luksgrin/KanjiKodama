import pytest
import typer
from typer.testing import CliRunner

from mojimori_content.cli import _blocks, app

runner = CliRunner()


def test_blocks_helper_normalises_and_defaults() -> None:
    assert _blocks(None) == ["N5"]
    assert _blocks(["n5", "N4", "obscure"]) == ["N5", "N4", "OBSCURE"]


def test_blocks_helper_rejects_unknown() -> None:
    with pytest.raises(typer.BadParameter):
        _blocks(["N9"])


def test_help_lists_commands() -> None:
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    for cmd in ("fetch", "classify", "build"):
        assert cmd in result.output
