from typer.testing import CliRunner

from mojimori_content.cli import app

runner = CliRunner()


def test_build_accepts_known_blocks() -> None:
    result = runner.invoke(app, ["build", "--blocks", "N5", "--blocks", "n4"])
    assert result.exit_code == 0
    assert "N5, N4" in result.output


def test_build_rejects_unknown_block() -> None:
    result = runner.invoke(app, ["build", "--blocks", "N9"])
    assert result.exit_code != 0
