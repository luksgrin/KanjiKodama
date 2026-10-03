"""Command-line entry point."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer

from .model import BLOCKS

app = typer.Typer(no_args_is_help=True, help="Build MojiMori content databases.")


@app.callback()
def main() -> None:
    """MojiMori content pipeline."""


def _blocks(blocks: list[str] | None) -> list[str]:
    selected = [b.upper() for b in (blocks or ["N5"])]
    unknown = [b for b in selected if b not in BLOCKS]
    if unknown:
        raise typer.BadParameter(f"unknown block(s): {', '.join(unknown)}")
    return selected


@app.command()
def fetch(refresh: Annotated[bool, typer.Option(help="Re-download and re-pin checksums.")] = False) -> None:
    """Download all sources into .cache and pin checksums."""
    from .fetch import fetch_all

    fetch_all(refresh=refresh)


@app.command()
def classify() -> None:
    """Print block sizes for the whole KANJIDIC2 set."""
    from . import classify as classify_mod
    from .config import cache_path
    from .fetch import fetch_all
    from .sources import jlpt, kanjidic2

    fetch_all(["kanjidic2", "jlpt_kanji"])
    kd = kanjidic2.parse(cache_path("kanjidic2"))
    c = classify_mod.classify_all(kd, jlpt.parse_kanji_levels(cache_path("jlpt_kanji")))
    for k, v in sorted(classify_mod.counts(c).items()):
        typer.echo(f"{k:10} {v}")


@app.command()
def build(
    blocks: Annotated[list[str] | None, typer.Option("--blocks", "-b", help="Blocks to build (default: N5).")] = None,
    out: Annotated[Path | None, typer.Option(help="Output directory (default: tools/content/out).")] = None,
    refresh: Annotated[bool, typer.Option(help="Re-download sources.")] = False,
) -> None:
    """Run the full pipeline for the given blocks."""
    from .build import run
    from .config import OUT_DIR

    run(_blocks(blocks), out_dir=out or OUT_DIR, refresh=refresh)


if __name__ == "__main__":
    app()
