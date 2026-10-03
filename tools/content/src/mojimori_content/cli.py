"""Command-line entry point. Steps are added phase by phase (docs/plan.md, phase 1)."""

from __future__ import annotations

from typing import Annotated

import typer

app = typer.Typer(no_args_is_help=True, help="Build MojiMori content databases.")

BLOCKS = ("N5", "N4", "N3", "N2", "N1", "OBSCURE")


@app.callback()
def main() -> None:
    """MojiMori content pipeline."""


@app.command()
def build(
    blocks: Annotated[
        list[str] | None,
        typer.Option("--blocks", "-b", help="Blocks to build (default: N5)."),
    ] = None,
) -> None:
    """Run the full pipeline for the given blocks."""
    selected = [b.upper() for b in (blocks or ["N5"])]
    unknown = [b for b in selected if b not in BLOCKS]
    if unknown:
        raise typer.BadParameter(f"unknown block(s): {', '.join(unknown)}")
    typer.echo(f"Pipeline not implemented yet; would build: {', '.join(selected)}")


if __name__ == "__main__":
    app()
